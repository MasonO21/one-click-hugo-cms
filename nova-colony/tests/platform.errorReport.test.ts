/** Field error reports: consent-gated analytics events, deduplicated, capped, never throwing. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorReporter, MAX_REPORTS, errorSignature, installErrorReporting } from '../src/platform/errorReport';
import { reportLoopError, resetLoopFailures } from '../src/core/guard';
import { safe } from '../src/ui/dom';
import { EventBus } from '../src/core/events';
import { AnalyticsClient } from '../src/platform/analytics';

afterEach(() => {
  resetLoopFailures();
  vi.restoreAllMocks();
});

describe('error signature', () => {
  it('keeps the first message line and the top bundle frame, no paths', () => {
    const e = new Error('Cannot read properties of undefined (reading \'x\')\nmore');
    e.stack = 'TypeError: Cannot read...\n    at WorldSystem.nearestNode (https://localhost/assets/index-azn2_a7K.js:1:23456)\n    at x (y.js:2:3)';
    expect(errorSignature('sim player', e)).toEqual({ where: 'sim player', msg: "Cannot read properties of undefined (reading 'x')", at: 'index-azn2_a7K.js:1:23456' });
    expect(errorSignature('uncaught', 'plain string').msg).toBe('plain string');
    expect(errorSignature('uncaught', undefined).msg).toBe('undefined');
  });
});

describe('ErrorReporter', () => {
  it('sends each distinct failure once and stops at the session cap', () => {
    const sent: any[] = [];
    const r = new ErrorReporter((ev, p) => sent.push([ev, p]));
    expect(r.report('sim a', new Error('boom'))).toBe(true);
    expect(r.report('sim a', new Error('boom'))).toBe(false);
    expect(r.report('sim b', new Error('boom'))).toBe(true);
    for (let i = 0; i < 100; i++) r.report(`ui ${String.fromCharCode(97 + (i % 26))}${Math.floor(i / 26)}`, new Error('e'));
    expect(sent.length).toBe(MAX_REPORTS);
    expect(sent[0]).toEqual(['error', { where: 'sim a', msg: 'boom', at: expect.any(String), n: 1 }]);
  });

  it('messages that differ only by numbers share one slot (a noisy error cannot use up the budget)', () => {
    const sent: any[] = [];
    const r = new ErrorReporter((ev, p) => sent.push([ev, p]));
    for (let i = 0; i < 30; i++) r.report('uncaught', new Error(`boom ${i} at 1.${i}`));
    r.report('sim crafting', new Error('recipe missing'));
    expect(sent.map((s) => s[1].msg)).toEqual(['boom 0 at 1.0', 'recipe missing']);
  });

  it('a throwing tracker never escapes', () => {
    const r = new ErrorReporter(() => {
      throw new Error('analytics down');
    });
    expect(() => r.report('x', new Error('y'))).not.toThrow();
  });
});

describe('installErrorReporting', () => {
  it('loop, UI and bus failures reach analytics only with consent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const batches: any[] = [];
    const client = new AnalyticsClient({ sink: async (b) => (batches.push(b), true), flushIntervalMs: 1e9 });
    const off = installErrorReporting((ev, p) => client.track(ev, p));
    // no consent yet: nothing is queued
    reportLoopError('sim crafting', new Error('no consent'));
    expect(client.queued()).toBe(0);
    client.setConsent(true);
    reportLoopError('sim economy', new Error('loop broke'));
    safe('panel shop render', () => {
      throw new Error('ui broke');
    });
    const bus = new EventBus();
    bus.on('fx:shake', () => {
      throw new Error('handler broke');
    });
    bus.emit('fx:shake', { strength: 1 });
    expect(client.queued()).toBe(3);
    await client.flush();
    const names = batches.flatMap((b) => b.events.map((e: any) => `${e.name}:${e.props.where}`));
    expect(names).toEqual(['error:sim economy', 'error:panel shop render', 'error:bus fx:shake']);
    off();
    client.setConsent(false);
  });
});
