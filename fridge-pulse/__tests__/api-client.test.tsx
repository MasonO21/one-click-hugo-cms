/**
 * The API client against a configured server (not demo mode): cancelling, timeouts that cover the
 * whole answer, what an empty scan says, and requests the server would reject. Then the scan screen:
 * Cancel while photos are still being prepared sends nothing.
 */
import '../test-utils/configuredApi';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from 'react-test-renderer';
import Scan from '../src/app/scan';
import * as api from '../src/lib/api';
import type { PantryItem } from '../src/lib/types';
import { useSettings } from '../src/store/settings';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}), useSegments: () => ['scan'] }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), ImpactFeedbackStyle: {} }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));
let mockFinishEncoding: (data: string) => void = () => {};
jest.mock('../src/lib/photos', () => ({
  MAX_PHOTOS: 4,
  takePhoto: jest.fn(async () => ({ photos: [{ uri: 'file:///shelf.jpg', width: 4000, height: 3000 }] })),
  pickPhotos: jest.fn(async () => ({ photos: [{ uri: 'file:///shelf.jpg', width: 4000, height: 3000 }] })),
  encodePhoto: jest.fn(
    () =>
      new Promise<string>((resolve) => {
        mockFinishEncoding = resolve;
      }),
  ),
}));
jest.mock('../src/store/billing', () => ({
  getProvider: () => ({ getUserId: async () => '$RCAnonymousID:abc12345' }),
  useBilling: { getState: () => ({ refresh: jest.fn() }) },
}));

interface Sent {
  url: string;
  body: Record<string, unknown> | null;
}
let sent: Sent[] = [];

/** Stands in for the network: records each request and answers with `answer`. */
function serve(answer: (init: RequestInit) => Promise<unknown>) {
  sent = [];
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
    return (await answer(init)) as Response;
  }) as unknown as typeof fetch;
}
const ok = (json: unknown) => async () => ({ ok: true, status: 200, json: async () => json });
/** Never answers on its own; rejects like a real fetch when the request is aborted. */
const hang = (init: RequestInit) =>
  new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))));

const eggs = { id: 'a', name: 'Eggs', category: 'dairy', quantity: '6', location: 'fridge', addedOn: '2026-10-06', expiresOn: '2026-10-09', expirySource: 'estimate', status: 'active' } as PantryItem;
const settle = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: api.ApiError) => `${e.code}: ${e.message}`,
  );

describe('cancelling', () => {
  afterEach(() => jest.useRealTimers());

  it('never sends a request the caller already gave up on', async () => {
    expect(api.isDemoMode).toBe(false);
    serve(ok({ items: [], notes: null }));
    const c = new AbortController();
    c.abort();
    await expect(api.scanPhotos({ userId: 'u1', location: 'fridge', images: ['AAAA'], signal: c.signal })).rejects.toBeInstanceOf(api.ApiError);
    expect(sent).toHaveLength(0);
  });

  it('stops waiting as soon as the caller cancels', async () => {
    serve(async (init) => hang(init));
    const c = new AbortController();
    const p = settle(api.identifyFood({ userId: 'u1', name: 'Gochujang', category: 'condiments', location: 'fridge', signal: c.signal }));
    await act(async () => {
      await Promise.resolve();
    });
    c.abort();
    expect(await p).toMatch(/^network:/);
    expect(sent).toHaveLength(1);
  });
});

describe('timeouts', () => {
  afterEach(() => jest.useRealTimers());

  it('says the server took too long, not that it could not be reached', async () => {
    jest.useFakeTimers();
    serve(async (init) => hang(init));
    const p = settle(api.fetchMeals({ userId: 'u1', items: [eggs], prefs: { diet: 'none', servings: 2 } }));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(await p).toBe('network: That took too long. Check your connection and try again.');
  });

  it('covers the body too: headers that arrive with a stalled body still time out', async () => {
    jest.useFakeTimers();
    serve(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }));
    let state = 'pending';
    void settle(api.fetchMeals({ userId: 'u1', items: [eggs], prefs: { diet: 'none', servings: 2 } })).then((s) => (state = s));
    await jest.advanceTimersByTimeAsync(59_000);
    expect(state).toBe('pending');
    await jest.advanceTimersByTimeAsync(1_000);
    expect(state).toBe('network: That took too long. Check your connection and try again.');
  });

  it('a slow answer that does arrive in time is read as normal', async () => {
    jest.useFakeTimers();
    serve(
      (init) =>
        new Promise((resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({ items: [], notes: 'Too dark to see.' }) }), 80_000);
        }),
    );
    const p = api.scanPhotos({ userId: 'u1', location: 'fridge', images: ['AAAA'] });
    await jest.advanceTimersByTimeAsync(80_000);
    await expect(p).resolves.toMatchObject({ items: [], notes: 'Too dark to see.' });
  });
});

describe('what the client sends and keeps', () => {
  it('an empty scan note counts as no note', async () => {
    for (const notes of ['', '   ', null, undefined]) {
      serve(ok({ items: [], notes }));
      expect((await api.scanPhotos({ userId: 'u1', location: 'fridge', images: ['AAAA'] })).notes).toBeNull();
    }
  });

  it('"More ideas" trims titles to what the server accepts (at most 20, each at most 120 characters)', async () => {
    serve(ok({ meals: [] }));
    const long = 'A'.repeat(123);
    await api.fetchMeals({ userId: 'u1', items: [eggs], prefs: { diet: 'none', servings: 2 }, exclude: [long, '  ', ...Array.from({ length: 25 }, (_, i) => `Meal ${i}`)] });
    const exclude = sent[0]!.body!.exclude as string[];
    expect(exclude).toHaveLength(20);
    expect(exclude[0]).toHaveLength(120);
    expect(exclude).not.toContain('');
  });

  it('maps a refusal from the server to its own code with the server’s words', async () => {
    serve(async () => ({ ok: false, status: 429, json: async () => ({ error: { code: 'rate_limited', message: 'You have reached today’s limit.' } }) }));
    await expect(settle(api.scanPhotos({ userId: 'u1', location: 'fridge', images: ['AAAA'] }))).resolves.toBe('rate_limited: You have reached today’s limit.');
  });
});

/** All visible text, joined up. */
function textOf(node: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string {
  if (!node) return '';
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node.children ?? []).map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}

describe('the scan screen', () => {
  async function open() {
    act(() => {
      useSettings.setState({ aiConsent: true });
    });
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <Scan />
        </SafeAreaProvider>,
      );
    });
    const press = async (id: string) => {
      await act(async () => {
        tree.root.findByProps({ testID: id }).props.onPress();
      });
    };
    await press('choose-photos');
    return { tree, press };
  }

  it('Cancel while the photos are still being prepared sends nothing', async () => {
    serve(ok({ items: [], notes: null }));
    const { press } = await open();
    await press('analyze');
    await press('cancel-scan');
    await act(async () => {
      mockFinishEncoding('/9j/' + 'A'.repeat(2000));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(sent).toHaveLength(0);
  });

  it('a scan that finds nothing says so, even when the server sends an empty note', async () => {
    serve(ok({ items: [], purchaseDate: null, currency: null, notes: '' }));
    const { tree, press } = await open();
    await press('analyze');
    await act(async () => {
      mockFinishEncoding('/9j/' + 'A'.repeat(2000));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(sent).toHaveLength(1);
    expect(textOf(tree.root.findByProps({ testID: 'scan-error' }).children as unknown as ReactTestRendererJSON[])).toContain('No food found');
  });
});
