import {
  DEFAULT_CONTROLLER_CONFIG,
  describeSpeechError,
  SpeechController,
  type ControllerConfig,
  type SessionResult,
  type SpeechEngine,
  type SpeechEvents,
  type SpeechStartOptions,
} from '@/speech/controller';

class FakeEngine implements SpeechEngine {
  starts: SpeechStartOptions[] = [];
  stops = 0;
  aborts = 0;
  releases = 0;
  private handlers: { [K in keyof SpeechEvents]?: ((payload: SpeechEvents[K]) => void)[] } = {};

  start(options: SpeechStartOptions) {
    this.starts.push(options);
  }
  stop() {
    this.stops += 1;
  }
  abort() {
    this.aborts += 1;
  }
  release() {
    this.releases += 1;
  }
  on<K extends keyof SpeechEvents>(event: K, handler: (payload: SpeechEvents[K]) => void) {
    const list = (this.handlers[event] ??= []) as ((payload: SpeechEvents[K]) => void)[];
    list.push(handler);
    return () => {
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    };
  }
  get listenerCount() {
    return Object.values(this.handlers).reduce((n, list) => n + (list?.length ?? 0), 0);
  }
  emit<K extends keyof SpeechEvents>(event: K, payload: SpeechEvents[K]) {
    [...((this.handlers[event] ?? []) as ((p: SpeechEvents[K]) => void)[])].forEach((h) => h(payload));
  }
  result(transcript: string, isFinal: boolean) {
    this.emit('result', { results: [{ transcript }], isFinal });
  }
}

const config: ControllerConfig = { ...DEFAULT_CONTROLLER_CONFIG, lang: 'en-US', onDevice: true, continuous: true };

function setup(overrides: Partial<ControllerConfig> = {}) {
  const engine = new FakeEngine();
  const done: SessionResult[] = [];
  const texts: string[] = [];
  const states: string[] = [];
  const controller = new SpeechController(engine, { ...config, ...overrides }, {
    onText: (t) => texts.push(t),
    onState: (s) => states.push(s),
    onDone: (r) => done.push(r),
  });
  return { engine, controller, done, texts, states };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('SpeechController', () => {
  it('listens, shows live text, and finishes when stopped', () => {
    const { engine, controller, done, texts, states } = setup();
    controller.begin();
    expect(engine.starts).toEqual([
      {
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: true,
        addsPunctuation: true,
        iosTaskHint: 'dictation',
      },
    ]);
    engine.emit('start', null);
    engine.result('the fog', false);
    engine.result('the fog is lifting', true);
    expect(texts.at(-1)).toBe('The fog is lifting');

    controller.stop();
    expect(engine.stops).toBe(1);
    expect(controller.currentState).toBe('stopping');
    engine.result('and the view is great', true);
    engine.emit('end', null);

    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ text: 'The fog is lifting. And the view is great', reason: 'stopped', failure: null });
    expect(states).toEqual(['listening', 'stopping', 'idle']);
    expect(engine.listenerCount).toBe(0);
  });

  it('restarts when the recognizer ends on its own', () => {
    const { engine, controller, done } = setup();
    controller.begin();
    engine.result('first thought', true);
    engine.emit('end', null);
    expect(done).toHaveLength(0);
    jest.advanceTimersByTime(DEFAULT_CONTROLLER_CONFIG.restartDelayMs);
    expect(engine.starts).toHaveLength(2);
    engine.result('second thought', true);
    controller.stop();
    engine.emit('end', null);
    expect(done[0].text).toBe('First thought. Second thought');
  });

  it('keeps unfinished text when a session ends without a final result', () => {
    const { engine, controller, done } = setup();
    controller.begin();
    engine.result('half a sentence', false);
    engine.emit('end', null);
    jest.advanceTimersByTime(1000);
    controller.stop();
    engine.emit('end', null);
    expect(done[0].text).toBe('Half a sentence');
  });

  it('carries on after a quiet spell but stops after the silence limit', () => {
    const { engine, controller, done } = setup({ silenceTimeoutMs: 10000 });
    controller.begin();
    engine.emit('error', { error: 'no-speech' });
    engine.emit('end', null);
    jest.advanceTimersByTime(config.restartDelayMs);
    expect(engine.starts).toHaveLength(2);
    expect(done).toHaveLength(0);

    jest.advanceTimersByTime(10000);
    expect(engine.stops).toBe(1);
    engine.emit('end', null);
    expect(done[0]).toMatchObject({ text: '', reason: 'silence' });
  });

  it('resets the silence timer whenever speech arrives', () => {
    const { engine, controller, done } = setup({ silenceTimeoutMs: 10000 });
    controller.begin();
    jest.advanceTimersByTime(9000);
    engine.result('still talking', false);
    jest.advanceTimersByTime(9000);
    expect(engine.stops).toBe(0);
    jest.advanceTimersByTime(1500);
    expect(engine.stops).toBe(1);
    engine.emit('end', null);
    expect(done[0].reason).toBe('silence');
    expect(done[0].text).toBe('Still talking');
  });

  it('stops at the maximum length', () => {
    const { engine, controller, done } = setup({ maxDurationMs: 60000, silenceTimeoutMs: 999999 });
    controller.begin();
    jest.advanceTimersByTime(60000);
    engine.emit('end', null);
    expect(done[0].reason).toBe('max-duration');
  });

  it('finishes even if the recognizer never reports the end', () => {
    const { engine, controller, done } = setup();
    controller.begin();
    engine.result('something', true);
    controller.stop();
    jest.advanceTimersByTime(DEFAULT_CONTROLLER_CONFIG.stopGraceMs);
    expect(done).toHaveLength(1);
    expect(done[0].text).toBe('Something');
  });

  it('reports a failure but keeps what was heard', () => {
    const { engine, controller, done } = setup();
    controller.begin();
    engine.result('good part', true);
    engine.emit('error', { error: 'network' });
    engine.emit('end', null);
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ text: 'Good part', reason: 'error' });
    expect(done[0].failure?.code).toBe('network');
    expect(done[0].failure?.message).toContain('on-device');
  });

  it('reports permission problems', () => {
    const { engine, controller, done } = setup();
    controller.begin();
    engine.emit('error', { error: 'not-allowed' });
    expect(done[0].failure?.message).toContain('microphone');
  });

  it('ends on an interruption such as a phone call', () => {
    const { engine, controller, done } = setup();
    controller.begin();
    engine.result('before the call', true);
    engine.emit('error', { error: 'interrupted' });
    engine.emit('end', null);
    expect(done[0]).toMatchObject({ text: 'Before the call', reason: 'interrupted', failure: null });
    expect(engine.starts).toHaveLength(1);
  });

  it('gives up restarting after too many restarts', () => {
    const { engine, controller, done } = setup({ maxRestarts: 2, silenceTimeoutMs: 999999 });
    controller.begin();
    for (let i = 0; i < 2; i += 1) {
      engine.emit('end', null);
      jest.advanceTimersByTime(config.restartDelayMs);
    }
    expect(engine.starts).toHaveLength(3);
    engine.emit('end', null);
    expect(done).toHaveLength(1);
  });

  it('cancels without keeping text', () => {
    const { engine, controller, done } = setup();
    controller.begin();
    engine.result('discard this', true);
    controller.cancel();
    expect(engine.aborts).toBe(1);
    expect(done[0]).toMatchObject({ text: '', reason: 'cancelled' });
    expect(engine.listenerCount).toBe(0);
    controller.cancel();
    expect(done).toHaveLength(1);
  });

  it('asks for single-phrase sessions where continuous listening is not supported', () => {
    const { engine, controller, done } = setup({ continuous: false });
    controller.begin();
    expect(engine.starts[0].continuous).toBe(false);
    engine.result('first phrase', true);
    engine.emit('end', null);
    jest.advanceTimersByTime(config.restartDelayMs);
    expect(engine.starts).toHaveLength(2);
    expect(engine.starts[1].continuous).toBe(false);
    engine.result('second phrase', true);
    controller.stop();
    engine.emit('end', null);
    expect(done[0].text).toBe('First phrase. Second phrase');
  });

  it('hands the audio back once, when the session is over', () => {
    const { engine, controller } = setup();
    controller.begin();
    engine.result('a thought', true);
    engine.emit('end', null);
    jest.advanceTimersByTime(config.restartDelayMs);
    expect(engine.releases).toBe(0);
    controller.stop();
    engine.emit('end', null);
    expect(engine.releases).toBe(1);

    controller.begin();
    controller.cancel();
    expect(engine.releases).toBe(2);
  });

  it('ignores a second begin and a stop when idle', () => {
    const { engine, controller, done } = setup();
    controller.stop();
    controller.begin();
    controller.begin();
    expect(engine.starts).toHaveLength(1);
    expect(done).toHaveLength(0);
  });

  it('fails cleanly when the recognizer cannot start', () => {
    const { engine, controller, done } = setup();
    engine.start = () => {
      throw new Error('unavailable');
    };
    controller.begin();
    expect(done[0]).toMatchObject({ reason: 'error' });
    expect(done[0].failure?.code).toBe('client');
  });

  it('can run again after finishing', () => {
    const { engine, controller, done } = setup();
    controller.begin();
    controller.stop();
    engine.emit('end', null);
    controller.begin();
    engine.result('round two', true);
    controller.stop();
    engine.emit('end', null);
    expect(done.map((d) => d.text)).toEqual(['', 'Round two']);
  });
});

describe('describeSpeechError', () => {
  it('explains the common failures in plain words', () => {
    for (const code of ['not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture', 'network', 'busy', 'anything-else']) {
      expect(describeSpeechError(code, true).length).toBeGreaterThan(20);
      expect(describeSpeechError(code, false).length).toBeGreaterThan(20);
    }
    expect(describeSpeechError('language-not-supported', true)).toContain('online recognition');
  });
});
