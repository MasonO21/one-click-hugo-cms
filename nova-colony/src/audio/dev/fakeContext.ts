/**
 * A tiny fake AudioContext for node tests: it records the node graph and enforces the WebAudio
 * rules that most often throw in browsers (non-finite values, negative times, exponential ramps to
 * <= 0, stop before start) so every SFX recipe and the music scheduler can be exercised headlessly.
 */

export class FakeParam {
  value: number;
  constructor(readonly owner: FakeContext, value = 0, readonly name = 'param') {
    this.value = value;
  }
  private check(v: number, t?: number): void {
    if (!Number.isFinite(v)) throw new TypeError(`${this.name}: non-finite value ${v}`);
    if (t !== undefined) {
      if (!Number.isFinite(t)) throw new TypeError(`${this.name}: non-finite time ${t}`);
      if (t < 0) throw new RangeError(`${this.name}: negative time ${t}`);
    }
    this.owner.paramCalls++;
  }
  setValueAtTime(v: number, t: number): this {
    this.check(v, t);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.check(v, t);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.check(v, t);
    if (v <= 0) throw new RangeError(`${this.name}: exponential ramp to ${v}`);
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number): this {
    this.check(v, t);
    this.check(tc);
    return this;
  }
  cancelScheduledValues(t: number): this {
    this.check(0, t);
    return this;
  }
}

export class FakeNode {
  readonly outputs: FakeNode[] = [];
  started: number | null = null;
  stopped: number | null = null;
  constructor(readonly ctx: FakeContext, readonly kind: string) {
    ctx.nodes.push(this);
  }
  connect(dest: unknown): unknown {
    if (!(dest instanceof FakeNode) && !(dest instanceof FakeParam)) throw new TypeError(`${this.kind}: bad connect target`);
    if (dest instanceof FakeNode) this.outputs.push(dest);
    return dest;
  }
  disconnect(): void {
    this.outputs.length = 0;
  }
  start(t = 0): void {
    if (!Number.isFinite(t) || t < 0) throw new RangeError(`${this.kind}.start(${t})`);
    this.started = t;
  }
  stop(t = 0): void {
    if (this.started === null) throw new Error(`${this.kind}.stop before start`);
    if (!Number.isFinite(t) || t < 0) throw new RangeError(`${this.kind}.stop(${t})`);
    this.stopped = t;
  }
  setPeriodicWave(): void {}
}

/** Generic node exposing the params the engine / synth touch. */
export class FakeAudioNode extends FakeNode {
  gain: FakeParam;
  frequency: FakeParam;
  detune: FakeParam;
  Q: FakeParam;
  pan: FakeParam;
  delayTime: FakeParam;
  playbackRate: FakeParam;
  threshold: FakeParam;
  knee: FakeParam;
  ratio: FakeParam;
  attack: FakeParam;
  release: FakeParam;
  type = 'sine';
  private held: FakeBuffer | null = null;
  loop = false;
  normalize = true;
  get buffer(): FakeBuffer | null {
    return this.held;
  }
  set buffer(b: FakeBuffer | null) {
    // real ConvolverNodes reject an impulse response recorded at another sample rate
    if (this.kind === 'convolver' && b && b.sampleRate !== this.ctx.sampleRate) {
      throw new Error('NotSupportedError: convolver buffer sample rate does not match the context');
    }
    this.held = b;
  }
  constructor(ctx: FakeContext, kind: string) {
    super(ctx, kind);
    this.gain = new FakeParam(ctx, 1, `${kind}.gain`);
    this.frequency = new FakeParam(ctx, 440, `${kind}.frequency`);
    this.detune = new FakeParam(ctx, 0, `${kind}.detune`);
    this.Q = new FakeParam(ctx, 1, `${kind}.Q`);
    this.pan = new FakeParam(ctx, 0, `${kind}.pan`);
    this.delayTime = new FakeParam(ctx, 0, `${kind}.delayTime`);
    this.playbackRate = new FakeParam(ctx, 1, `${kind}.playbackRate`);
    this.threshold = new FakeParam(ctx, 0);
    this.knee = new FakeParam(ctx, 0);
    this.ratio = new FakeParam(ctx, 1);
    this.attack = new FakeParam(ctx, 0);
    this.release = new FakeParam(ctx, 0);
  }
}

export class FakeBuffer {
  private readonly data: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(ch: number): Float32Array {
    return this.data[ch];
  }
}

export class FakeContext {
  readonly nodes: FakeNode[] = [];
  paramCalls = 0;
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  readonly destination = new FakeNode(this, 'destination');
  private mk(kind: string): FakeAudioNode {
    return new FakeAudioNode(this, kind);
  }
  createGain = (): FakeAudioNode => this.mk('gain');
  createOscillator = (): FakeAudioNode => this.mk('osc');
  createBiquadFilter = (): FakeAudioNode => this.mk('biquad');
  createBufferSource = (): FakeAudioNode => this.mk('bufsrc');
  createStereoPanner = (): FakeAudioNode => this.mk('panner');
  createDelay = (): FakeAudioNode => this.mk('delay');
  createConvolver = (): FakeAudioNode => this.mk('convolver');
  createDynamicsCompressor = (): FakeAudioNode => this.mk('compressor');
  createPeriodicWave = (real: Float32Array, imag: Float32Array): object => {
    if (real.length !== imag.length) throw new Error('periodic wave length mismatch');
    return {};
  };
  createBuffer = (ch: number, len: number, rate: number): FakeBuffer => new FakeBuffer(ch, len, rate);
  addEventListener(): void {}
  resume(): Promise<void> {
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    return Promise.resolve();
  }

  /** Number of nodes created so far (excluding the destination). */
  get nodeCount(): number {
    return this.nodes.length - 1;
  }

  /**
   * Oscillators / buffer sources that were started but never given a stop time. Oscillators must
   * always be stopped (they run forever otherwise); a non-looping buffer source ends by itself.
   */
  leakedSources(): FakeNode[] {
    return this.nodes.filter((n) => (n.kind === 'osc' || n.kind === 'bufsrc') && n.started !== null && n.stopped === null);
  }

  asReal(): BaseAudioContext {
    return this as unknown as BaseAudioContext;
  }
}

/**
 * Fake OfflineAudioContext: `startRendering` resolves with a short decaying burst (so baked samples
 * have an audible length to trim) unless `silent` is set.
 */
export class FakeOffline extends FakeContext {
  oncomplete: ((e: { renderedBuffer: FakeBuffer }) => void) | null = null;
  static failNext = 0;
  constructor(readonly channels: number, readonly length: number, sampleRate: number, readonly silent = false) {
    super();
    this.sampleRate = sampleRate;
    this.state = 'suspended';
  }
  startRendering(): Promise<FakeBuffer> {
    if (FakeOffline.failNext > 0) {
      FakeOffline.failNext--;
      return Promise.reject(new Error('render failed'));
    }
    const buf = new FakeBuffer(this.channels, this.length, this.sampleRate);
    if (!this.silent) {
      const burst = Math.min(this.length, Math.floor(this.sampleRate * 0.25));
      for (let c = 0; c < this.channels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < burst; i++) d[i] = 0.5 * (1 - i / burst) * (c === 0 ? 1 : 0.7);
      }
    }
    return Promise.resolve(buf);
  }
  asOffline(): OfflineAudioContext {
    return this as unknown as OfflineAudioContext;
  }
}
