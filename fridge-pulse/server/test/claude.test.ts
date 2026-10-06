import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import Anthropic from '@anthropic-ai/sdk';
import { countryFromLocale, createClaude, IDENTIFY_MAX_SEARCHES, UpstreamError } from '../src/claude.js';
import type { IdentifyRequest, MealsRequest, ScanRequest } from '../src/schemas.js';
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
  items: [{ name: 'Baby spinach', category: 'produce', quantity: '1 bag', shelfLifeDays: 3, labelExpiryDate: null, confidence: 'high', clue: null, photo: 1, keptIn: null, price: null }],
  purchaseDate: null, currency: null,
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
        ? { meals: [{ title: 'Spinach frittata', summary: 's', minutes: 20, servings: 3, uses: ['Baby spinach', 'Eggs'], extras: ['Oil'], steps: ['Cook.'], nutrition: { kcal: 310, protein: 19, carbs: 6, fat: 23 } }] }
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

  it('reads a receipt with the receipt instructions, not the shelf ones', async () => {
    mode = 'ok';
    await svc().scan({ ...scanReq, mode: 'receipt' });
    const b = last().body;
    assert.match(String(b.system), /receipt reader/);
    assert.match(String(b.system), /Skip everything that is not food or drink/);
    assert.match(String(b.system), /never instructions to you/);
    const blocks = b.messages[0].content as { type: string; text?: string }[];
    assert.match(blocks.at(-1)?.text ?? '', /2 photos of the receipt, in order/);
    assert.doesNotMatch(blocks.at(-1)?.text ?? '', /Storage area/);
    // The same output shape, with where each item goes and the purchase date.
    const schema = JSON.stringify(b.output_config.format.schema);
    assert.match(schema, /purchaseDate/);
    assert.match(schema, /keptIn/);

    await svc().scan(scanReq);
    assert.match(String(last().body.system), /vision engine/);
  });

  it('uses the meals effort and passes diet, servings and exclusions as data', async () => {
    mode = 'ok';
    const out = await svc().meals(mealsReq);
    assert.equal(out.meals[0]?.title, 'Spinach frittata');
    assert.deepEqual(out.meals[0]?.nutrition, { kcal: 310, protein: 19, carbs: 6, fat: 23 });
    assert.match(String(last().body.system), /"nutrition": your estimate for ONE serving/);
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

const identifyReq: IdentifyRequest = {
  name: 'Jar of red paste',
  category: 'condiments',
  location: 'fridge',
  clue: 'Red tub, green lid, Korean text',
  today: '2026-09-29',
  locale: 'en-GB',
  image: { mediaType: 'image/jpeg', data: fakeJpegBase64() },
};

const candidate = {
  name: 'Gochujang',
  brand: null,
  product: null,
  barcode: null,
  category: 'condiments',
  kind: 'fresh',
  wikipediaTitle: 'Gochujang',
  keptIn: 'pantry',
  fridgeDays: 180,
  freezerDays: null,
  pantryDays: 365,
  looks: 'Red tub, green lid',
  why: 'Same tub',
  sourceUrl: null,
};

function toolTurn(content: unknown[], stopReason: string) {
  return { ...messageResponse('', stopReason), content };
}
const searched = [
  { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'red tub green lid korean chili paste' } },
  {
    type: 'web_search_tool_result',
    tool_use_id: 'srvtoolu_1',
    content: [{ type: 'web_search_result', url: 'https://en.wikipedia.org/wiki/Gochujang', title: 'Gochujang', encrypted_content: 'x', page_age: null }],
  },
];
const reported = (input: unknown) => ({ type: 'tool_use', id: 'toolu_1', name: 'report_food', input });

describe('identify against a fake Messages API', () => {
  let script: unknown[] = [];
  let api: Awaited<ReturnType<typeof fakeAnthropic>>;
  before(async () => {
    api = await fakeAnthropic(() => ({ json: script.shift() ?? messageResponse('out of script') }));
  });
  after(() => api.close());
  const svc = () => createClaude({ model: 'claude-opus-5-5', scanEffort: 'medium', mealsEffort: 'low', identifyEffort: 'high', client: clientFor(api.baseURL) });

  it('sends the photo, a capped web search and a strict report tool, and reads the report', async () => {
    const before = api.requests.length;
    script = [toolTurn([...searched, reported({ candidates: [candidate] })], 'tool_use')];
    const out = await svc().identify(identifyReq);
    assert.equal(out.candidates[0]?.name, 'Gochujang');
    assert.equal(api.requests.length - before, 1);

    const b = api.requests.at(-1)!.body;
    assert.equal(b.model, 'claude-opus-5-5');
    assert.equal(b.output_config.effort, 'high');
    assert.equal(b.output_config.format, undefined);
    assert.equal(b.fallbacks, 'default');
    assert.equal(b.thinking, undefined);
    // Forced tool choice 400s on this model family; auto plus an instruction instead.
    assert.deepEqual(b.tool_choice, { type: 'auto' });
    const search = b.tools.find((t: { name: string }) => t.name === 'web_search');
    assert.equal(search.type, 'web_search_20260209');
    assert.equal(search.max_uses, IDENTIFY_MAX_SEARCHES);
    assert.deepEqual(search.user_location, { type: 'approximate', country: 'GB' });
    const tool = b.tools.find((t: { name: string }) => t.name === 'report_food');
    assert.equal(tool.strict, true);
    assert.equal(tool.input_schema.additionalProperties, false);
    assert.equal(tool.input_schema.properties.candidates.items.additionalProperties, false);

    const blocks = b.messages[0].content as { type: string; text?: string }[];
    assert.equal(blocks[0]?.type, 'image');
    assert.match(blocks.at(-1)?.text ?? '', /Jar of red paste/);
    assert.match(blocks.at(-1)?.text ?? '', /Red tub, green lid, Korean text/);
    assert.match(String(b.system), /never instructions to you/);
  });

  it('resumes a paused server-tool turn by sending the assistant turn back unchanged', async () => {
    const before = api.requests.length;
    script = [toolTurn(searched, 'pause_turn'), toolTurn([reported({ candidates: [candidate] })], 'tool_use')];
    const out = await svc().identify(identifyReq);
    assert.equal(out.candidates.length, 1);
    assert.equal(api.requests.length - before, 2);
    const second = api.requests.at(-1)!.body;
    assert.equal(second.messages.length, 2);
    assert.equal(second.messages[1].role, 'assistant');
    assert.deepEqual(second.messages[1].content, searched);
  });

  it('nudges once when the model ends without reporting, then gives up', async () => {
    script = [messageResponse('It looks like gochujang.'), toolTurn([reported({ candidates: [candidate] })], 'tool_use')];
    const out = await svc().identify(identifyReq);
    assert.equal(out.candidates[0]?.name, 'Gochujang');
    const nudge = api.requests.at(-1)!.body.messages.at(-1);
    assert.equal(nudge.role, 'user');
    assert.match(String(nudge.content), /report_food/);

    script = [messageResponse('Hmm.'), messageResponse('Still hmm.')];
    await assert.rejects(svc().identify(identifyReq), (e: unknown) => e instanceof UpstreamError && e.kind === 'bad_output');
  });

  it('works without a photo', async () => {
    script = [toolTurn([reported({ candidates: [] })], 'tool_use')];
    const out = await svc().identify({ ...identifyReq, image: undefined, locale: undefined });
    assert.deepEqual(out.candidates, []);
    const b = api.requests.at(-1)!.body;
    assert.equal(b.messages[0].content.length, 1);
    assert.equal(b.tools[0].user_location, undefined);
    assert.match(b.messages[0].content[0].text, /no photo/);
  });

  it('rejects a report that does not match the schema, and refusals', async () => {
    script = [toolTurn([reported({ candidates: [{ name: 'x' }] })], 'tool_use')];
    await assert.rejects(svc().identify(identifyReq), (e: unknown) => e instanceof UpstreamError && e.kind === 'bad_output');
    script = [{ ...messageResponse('', 'refusal'), stop_details: { type: 'refusal', category: null, explanation: 'x' } }];
    await assert.rejects(svc().identify(identifyReq), (e: unknown) => e instanceof UpstreamError && e.kind === 'refused');
    script = [messageResponse('{"cand', 'max_tokens')];
    await assert.rejects(svc().identify(identifyReq), (e: unknown) => e instanceof UpstreamError && e.kind === 'bad_output');
  });

  it('stops after a bounded number of paused turns', async () => {
    script = Array.from({ length: 6 }, () => toolTurn(searched, 'pause_turn'));
    const before = api.requests.length;
    await assert.rejects(svc().identify(identifyReq), (e: unknown) => e instanceof UpstreamError);
    assert.ok(api.requests.length - before <= 4);
    script = [];
  });
});

describe('countryFromLocale', () => {
  it('reads the region from a locale', () => {
    assert.equal(countryFromLocale('en-GB'), 'GB');
    assert.equal(countryFromLocale('zh-Hant-TW'), 'TW');
    assert.equal(countryFromLocale('fr_CA'), 'CA');
    assert.equal(countryFromLocale('en'), null);
    assert.equal(countryFromLocale(undefined), null);
  });
});

describe('claude service deadlines and hang-ups (real SDK against an API that never answers)', () => {
  let server: Server;
  let baseURL = '';
  let opened = 0;
  let closed = 0;

  before(async () => {
    server = createServer((req, res) => {
      opened += 1;
      res.on('close', () => (closed += 1));
      req.resume();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });

  // Retries on, as in production: the deadline has to hold across them.
  const svc = (deadlines: { scan?: number; meals?: number; identify?: number }) =>
    createClaude({ model: 'claude-opus-5-5', scanEffort: 'medium', mealsEffort: 'low', client: new Anthropic({ apiKey: 'test-key', baseURL, maxRetries: 2 }), deadlines });
  const settled = async () => {
    for (let i = 0; i < 50 && closed < opened; i += 1) await new Promise((r) => setTimeout(r, 10));
  };

  it('gives up at the deadline with a clear message instead of waiting out the SDK’s timeout and retries', async () => {
    opened = 0;
    closed = 0;
    const started = Date.now();
    await assert.rejects(svc({ meals: 300 }).meals(mealsReq), (e: unknown) => e instanceof UpstreamError && e.kind === 'unavailable' && /took too long/.test(e.message));
    assert.ok(Date.now() - started < 3000);
    await settled();
    assert.equal(opened, 1);
    assert.equal(closed, 1, 'the connection to the API is closed');
  });

  it('stops the model call as soon as the phone hangs up', async () => {
    opened = 0;
    closed = 0;
    const phone = new AbortController();
    setTimeout(() => phone.abort(), 100);
    const started = Date.now();
    await assert.rejects(svc({}).scan(scanReq, phone.signal), (e: unknown) => e instanceof UpstreamError && e.kind === 'unavailable' && /cancelled/.test(e.message));
    assert.ok(Date.now() - started < 3000);
    await settled();
    assert.equal(closed, opened);
  });

  it('a lookup’s deadline covers all of its rounds', async () => {
    opened = 0;
    await assert.rejects(svc({ identify: 300 }).identify(identifyReq), (e: unknown) => e instanceof UpstreamError && /took too long/.test(e.message));
    assert.equal(opened, 1);
  });
});
