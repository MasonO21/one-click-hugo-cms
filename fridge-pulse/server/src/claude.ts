import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Effort } from './config.js';
import { MEALS_SYSTEM, mealsUserText, SCAN_SYSTEM, scanUserText } from './prompts.js';
import {
  MealsOutputSchema,
  ScanOutputSchema,
  type MealsOutput,
  type MealsRequest,
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
}

interface Options {
  model: string;
  scanEffort: Effort;
  mealsEffort: Effort;
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

export function createClaude({ model, scanEffort, mealsEffort, client }: Options): ClaudeService {
  const anthropic = client ?? new Anthropic({ timeout: 90_000 });

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
        const content: Anthropic.Beta.BetaContentBlockParam[] = [];
        req.images.forEach((img, i) => {
          content.push({ type: 'text', text: `Photo ${i + 1} of ${req.images.length}:` });
          content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } });
        });
        content.push({ type: 'text', text: scanUserText(req) });

        const res = await anthropic.beta.messages.parse({
          ...base,
          output_config: { effort, format: zodOutputFormat(ScanOutputSchema) },
          system: SCAN_SYSTEM,
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
