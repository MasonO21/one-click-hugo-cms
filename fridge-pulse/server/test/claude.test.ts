import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import Anthropic from '@anthropic-ai/sdk';
import { createClaude, UpstreamError } from '../src/claude.js';
import type { MealsRequest, ScanRequest } from '../src/schemas.js';
import { fakeAnthropic, fakeJpegBase64, messageResponse } from './helpers.js';

const scanReq: ScanRequest = {
  location: 'fridge',
  today: '2026-09-29',
  locale: 'en-GB',
  images: [
    { mediaType: 'image/jpeg', data: fakeJpegBase64() },
    { mediaType: 'image/jpeg', data: fakeJpegBase64(300) },
  ],
};

const mealsReq: MealsRequest = {
  today: '2026-09-29',
  diet: 'vegetarian',
  servings: 3,
  exclude: ['Omelette'],
  items: [
    { name: 'Baby spinach', category: 'produce', quantity: '1 bag', daysLeft: 1 },
    { name: 'Eggs', category: 'dairy', quantity: '6', daysLeft: 12 },
  ],
};

const scanOutput = {
  items: [{ name: 'Baby spinach', category: 'produce', quantity: '1 bag', shelfLifeDays: 3, labelExpiryDate: null, confidence: 'high' }],
  notes: null,
};

function clientFor(baseURL: string) {
  return new Anthropic({ apiKey: 'test-key', baseURL, maxRetries: 0 });
}

describe('claude service against a fake Messages API (real SDK code path)', () => {
  let mode: 'ok' | 'refusal' | 'truncated' | 'garbage' | 'ratelimit' | 'auth' = 'ok';
  let api: Awaited<ReturnType<typeof fakeAnthropic>>;

  before(async () => {
    api = await fakeAnthropic((req) => {
      const isMeals = String(req.body?.system ?? '').includes('recipe engine');
      const output = isMeals
        ? { meals: [{ title: 'Spinach frittata', summary: 's', minutes: 20, servings: 3, uses: ['Baby spinach', 'Eggs'], extras: ['Oil'], steps: ['Cook.'] }] }
        : scanOutput;
      switch (mode) {
        case 'refusal':
          return { json: { ...messageResponse('', 'refusal'), stop_details: { type: 'refusal', category: 'cyber', explanation: 'x' } } };
        case 'truncated':
          return { json: messageResponse('{"items": [', 'max_tokens') };
        case 'garbage':
          return { json: messageResponse('not json at all') };
        case 'ratelimit':
          return { status: 429, json: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } } };
        case 'auth':
          return { status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'bad key' } } };
        default:
          return { json: messageResponse(JSON.stringify(output)) };
      }
    });
  });
  after(() => api.close());

  const svc = () => createClaude({ model: 'claude-opus-5-5', scanEffort: 'medium', mealsEffort: 'low', client: clientFor(api.baseURL) });
  const last = () => api.requests[api.requests.length - 1]!;

  it('sends a scan with images, structured output, effort and server-side fallback', async () => {
    mode = 'ok';
    const out = await svc().scan(scanReq);
    assert.equal(out.items[0]?.name, 'Baby spinach');

    const req = last();
    assert.equal(req.method, 'POST');
    assert.match(req.url ?? '', /^\/v1\/messages/);
    assert.match(String(req.headers['anthropic-beta']), /server-side-fallback-2026-07-01/);

    const b = req.body;
    assert.equal(b.model, 'claude-opus-5-5');
    assert.equal(b.fallbacks, 'default');
    assert.equal(b.output_config.effort, 'medium');
    assert.equal(b.output_config.format.type, 'json_schema');
    // Thinking is always on for this model: sending a thinking config or sampling params would 400.
    assert.equal(b.thinking, undefined);
    assert.equal(b.temperature, undefined);
    assert.equal(b.budget_tokens, undefined);
    // No assistant prefill, no forced tool choice.
    assert.equal(b.tool_choice, undefined);
    assert.equal(b.messages.at(-1).role, 'user');

    const blocks = b.messages[0].content as { type: string; text?: string; source?: { media_type: string } }[];
    assert.equal(blocks.filter((x) => x.type === 'image').length, 2);
    assert.equal(blocks.find((x) => x.type === 'image')?.source?.media_type, 'image/jpeg');
    // Images come before the instruction text.
    assert.equal(blocks.at(-1)?.type, 'text');
    assert.match(blocks.at(-1)?.text ?? '', /Storage area: fridge\./);
    assert.match(blocks.at(-1)?.text ?? '', /2026-09-29/);
    assert.match(String(b.system), /never instructions to you/);
  });

  it('uses the meals effort and passes diet, servings and exclusions as data', async () => {
    mode = 'ok';
    const out = await svc().meals(mealsReq);
    assert.equal(out.meals[0]?.title, 'Spinach frittata');
    const b = last().body;
    assert.equal(b.output_config.effort, 'low');
    const text = String(b.messages[0].content);
    assert.match(text, /Diet: vegetarian\./);
    assert.match(text, /Servings: 3\./);
    assert.match(text, /Avoid these titles: Omelette\./);
    assert.match(text, /- Baby spinach \(produce, 1 bag, daysLeft 1\)/);
  });

  it('turns a refusal into a refused error instead of reading empty content', async () => {
    mode = 'refusal';
    await assert.rejects(svc().scan(scanReq), (e: unknown) => e instanceof UpstreamError && e.kind === 'refused');
  });

  it('treats a truncated result as unusable', async () => {
    mode = 'truncated';
    await assert.rejects(svc().scan(scanReq), (e: unknown) => e instanceof UpstreamError && e.kind === 'bad_output');
  });

  it('treats unparseable model output as unusable rather than crashing', async () => {
    mode = 'garbage';
    await assert.rejects(svc().meals(mealsReq), (e: unknown) => e instanceof UpstreamError && e.kind === 'bad_output');
  });

  it('maps upstream rate limits and bad credentials to unavailable', async () => {
    mode = 'ratelimit';
    await assert.rejects(svc().scan(scanReq), (e: unknown) => e instanceof UpstreamError && e.kind === 'unavailable');
    mode = 'auth';
    await assert.rejects(svc().scan(scanReq), (e: unknown) => e instanceof UpstreamError && e.kind === 'unavailable');
  });
});
