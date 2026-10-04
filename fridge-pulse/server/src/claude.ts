import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Effort } from './config.js';
import { IDENTIFY_SYSTEM, identifyUserText, MEALS_SYSTEM, mealsUserText, RECEIPT_SYSTEM, receiptUserText, SCAN_SYSTEM, scanUserText } from './prompts.js';
import {
  CATEGORIES,
  LOCATIONS,
  MealsOutputSchema,
  ReportFoodSchema,
  ScanOutputSchema,
  type IdentifyRequest,
  type MealsOutput,
  type MealsRequest,
  type ReportFood,
  type ScanOutput,
  type ScanRequest,
} from './schemas.js';

export type UpstreamKind =
  /** The model declined (safety classifier). Not retryable with the same input. */
  | 'refused'
  /** The upstream API is busy, down or misconfigured. */
  | 'unavailable'
  /** The model returned something we could not use. */
  | 'bad_output';

export class UpstreamError extends Error {
  constructor(
    public kind: UpstreamKind,
    message: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface ClaudeService {
  scan(req: ScanRequest): Promise<ScanOutput>;
  meals(req: MealsRequest): Promise<MealsOutput>;
  /** Looks one unrecognised item up on the web. An empty list means no confident match. */
  identify(req: IdentifyRequest): Promise<ReportFood>;
}

/** Web searches allowed per lookup. Each costs money (see README), and a few focused ones suffice. */
export const IDENTIFY_MAX_SEARCHES = 4;
/** Resumes after a paused server-tool turn, plus one nudge if the model forgets to report. */
const IDENTIFY_MAX_ROUNDS = 4;

const nullable = (type: string) => ({ type: [type, 'null'] });

/** The answer channel for identify. Strict, so the input always matches this schema. */
export const REPORT_FOOD_TOOL: Anthropic.Beta.BetaTool = {
  name: 'report_food',
  description:
    'Report what the item is. Call exactly once when you are done searching. Use an empty candidates list if you could not identify it with reasonable confidence.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['candidates'],
    properties: {
      candidates: {
        type: 'array',
        description: 'Up to 3 possible matches, most likely first.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'brand', 'product', 'barcode', 'category', 'kind', 'wikipediaTitle', 'keptIn', 'fridgeDays', 'freezerDays', 'pantryDays', 'looks', 'why', 'sourceUrl'],
          properties: {
            name: { type: 'string' },
            brand: nullable('string'),
            product: nullable('string'),
            barcode: nullable('string'),
            category: { type: 'string', enum: [...CATEGORIES] },
            kind: { type: 'string', enum: ['packaged', 'fresh'] },
            wikipediaTitle: nullable('string'),
            keptIn: { type: 'string', enum: [...LOCATIONS] },
            fridgeDays: nullable('integer'),
            freezerDays: nullable('integer'),
            pantryDays: nullable('integer'),
            looks: { type: 'string' },
            why: { type: 'string' },
            sourceUrl: nullable('string'),
          },
        },
      },
    },
  },
};

/** "en-GB" -> "GB", so searches favour products sold where the person lives. */
export function countryFromLocale(locale: string | undefined): string | null {
  const m = /^[a-z]{2,3}[-_](?:[A-Za-z]{4}[-_])?([A-Z]{2})\b/.exec(locale ?? '');
  return m ? m[1]! : null;
}

interface Options {
  model: string;
  scanEffort: Effort;
  mealsEffort: Effort;
  identifyEffort?: Effort;
  /** Injected in tests. Defaults to a client that reads ANTHROPIC_API_KEY (or an `ant auth` profile). */
  client?: Anthropic;
}

/** Shared request settings. Thinking is always on for these models, so effort is the depth control. */
function common(model: string, effort: Effort) {
  return {
    model,
    // Structured output is small, but adaptive thinking tokens count toward this cap.
    max_tokens: 16_000,
    // If a safety classifier declines, re-run on Anthropic's recommended fallback model server-side.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default' as const,
    effort,
  };
}

export function createClaude({ model, scanEffort, mealsEffort, identifyEffort = 'medium', client }: Options): ClaudeService {
  // Web searches make identify slower than a scan.
  const anthropic = client ?? new Anthropic({ timeout: 120_000 });

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError) {
        throw new UpstreamError('unavailable', 'The analysis service is busy. Please try again shortly.');
      }
      if (e instanceof Anthropic.APIConnectionError) {
        throw new UpstreamError('unavailable', 'The analysis service could not be reached.');
      }
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        // Our credentials are wrong: an operator problem, not the user's.
        console.error('Anthropic credentials rejected:', e.message);
        throw new UpstreamError('unavailable', 'The analysis service is unavailable.');
      }
      if (e instanceof Anthropic.BadRequestError) {
        console.error('Anthropic rejected the request:', e.message);
        throw new UpstreamError('bad_output', 'That request could not be processed.');
      }
      // Anything else (malformed JSON from the model, a schema mismatch) is an unusable result.
      console.error('Unusable model result:', e instanceof Error ? e.message : e);
      throw new UpstreamError('bad_output', 'Something went wrong analysing that. Please try again.');
    }
  }

  return {
    scan: (req) =>
      run(async () => {
        const { effort, ...base } = common(model, scanEffort);
        const receipt = req.mode === 'receipt';
        const content: Anthropic.Beta.BetaContentBlockParam[] = [];
        req.images.forEach((img, i) => {
          content.push({ type: 'text', text: `Photo ${i + 1} of ${req.images.length}:` });
          content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
        });
        content.push({ type: 'text', text: receipt ? receiptUserText(req) : scanUserText(req) });

        const res = await anthropic.beta.messages.parse({
          ...base,
          output_config: { effort, format: zodOutputFormat(ScanOutputSchema) },
          system: receipt ? RECEIPT_SYSTEM : SCAN_SYSTEM,
          messages: [{ role: 'user', content }],
        });
        return usable(res, 'scan');
      }),

    meals: (req) =>
      run(async () => {
        const { effort, ...base } = common(model, mealsEffort);
        const res = await anthropic.beta.messages.parse({
          ...base,
          output_config: { effort, format: zodOutputFormat(MealsOutputSchema) },
          system: MEALS_SYSTEM,
          messages: [{ role: 'user', content: mealsUserText(req) }],
        });
        return usable(res, 'meals');
      }),

    identify: (req) =>
      run(async () => {
        const { effort, ...base } = common(model, identifyEffort);
        const content: Anthropic.Beta.BetaContentBlockParam[] = [];
        if (req.image) {
          content.push({ type: 'image', source: { type: 'base64', media_type: req.image.mediaType, data: req.image.data } });
        }
        content.push({ type: 'text', text: identifyUserText(req) });

        const country = countryFromLocale(req.locale);
        const tools: Anthropic.Beta.BetaToolUnion[] = [
          {
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: IDENTIFY_MAX_SEARCHES,
            ...(country ? { user_location: { type: 'approximate' as const, country } } : {}),
          },
          REPORT_FOOD_TOOL,
        ];
        const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content }];
        let nudged = false;

        for (let round = 0; round < IDENTIFY_MAX_ROUNDS; round += 1) {
          const res = await anthropic.beta.messages.create({
            ...base,
            output_config: { effort },
            system: IDENTIFY_SYSTEM,
            tools,
            // Forced tool choice is not available on this model family: ask in the prompt, check below.
            tool_choice: { type: 'auto' },
            messages,
          });
          if (res.stop_reason === 'refusal') {
            throw new UpstreamError('refused', 'This item could not be looked up. Try editing its name.');
          }
          const report = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === 'report_food');
          if (report) {
            const parsed = ReportFoodSchema.safeParse(report.input);
            if (!parsed.success) throw new UpstreamError('bad_output', 'The lookup result could not be read. Please try again.');
            return parsed.data;
          }
          if (res.stop_reason === 'max_tokens') {
            throw new UpstreamError('bad_output', 'The lookup was cut short. Please try again.');
          }
          // The server-side search loop paused: send the turn back unchanged and it resumes.
          if (res.stop_reason === 'pause_turn') {
            messages.push({ role: 'assistant', content: res.content });
            continue;
          }
          // Finished without reporting: ask once, then give up.
          if (nudged) break;
          nudged = true;
          messages.push({ role: 'assistant', content: res.content });
          messages.push({ role: 'user', content: 'Report your answer now with the report_food tool.' });
        }
        throw new UpstreamError('bad_output', 'The lookup did not finish. Please try again.');
      }),
  };
}

function usable<T>(res: { stop_reason: string | null; parsed_output: T | null }, what: string): T {
  // Always check stop_reason before reading content: a refusal is a normal 200 response.
  if (res.stop_reason === 'refusal') {
    throw new UpstreamError('refused', 'This request could not be analysed. Try different photos.');
  }
  if (res.stop_reason === 'max_tokens') {
    throw new UpstreamError('bad_output', `The ${what} result was cut short. Please try again.`);
  }
  if (res.parsed_output == null) {
    throw new UpstreamError('bad_output', `The ${what} result could not be read. Please try again.`);
  }
  return res.parsed_output;
}
