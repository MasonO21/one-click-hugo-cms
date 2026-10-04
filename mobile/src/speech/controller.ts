import { TranscriptAccumulator } from '@/domain/transcript';

export interface SpeechStartOptions {
  lang: string;
  interimResults: true;
  continuous: boolean;
  requiresOnDeviceRecognition: boolean;
  addsPunctuation: boolean;
  // Tells iOS this is free-form dictation rather than a short command.
  iosTaskHint: 'dictation';
}

export interface SpeechEvents {
  result: { results: { transcript: string }[]; isFinal: boolean };
  error: { error: string; message?: string };
  start: null;
  end: null;
}

// What the controller needs from a speech recognizer. expoEngine.ts implements it on
// top of expo-speech-recognition; tests use a fake.
export interface SpeechEngine {
  start(options: SpeechStartOptions): void;
  stop(): void;
  abort(): void;
  on<K extends keyof SpeechEvents>(event: K, handler: (payload: SpeechEvents[K]) => void): () => void;
  // Called once a session is over, so other audio (music, podcasts) can resume.
  release?(): void;
}

export type SessionState = 'idle' | 'listening' | 'stopping';
export type DoneReason = 'stopped' | 'silence' | 'max-duration' | 'interrupted' | 'error' | 'cancelled';

export interface SpeechFailure {
  code: string;
  message: string;
}

export interface SessionResult {
  text: string;
  durationMs: number;
  reason: DoneReason;
  failure: SpeechFailure | null;
}

export interface ControllerConfig {
  lang: string;
  onDevice: boolean;
  // Android 12 and older cannot listen continuously. The controller restarts the
  // recognizer between phrases either way.
  continuous: boolean;
  maxDurationMs: number;
  silenceTimeoutMs: number;
  maxRestarts: number;
  restartDelayMs: number;
  stopGraceMs: number;
}

export const DEFAULT_CONTROLLER_CONFIG: Omit<ControllerConfig, 'lang' | 'onDevice' | 'continuous'> = {
  maxDurationMs: 5 * 60 * 1000,
  silenceTimeoutMs: 20 * 1000,
  maxRestarts: 30,
  restartDelayMs: 300,
  stopGraceMs: 3000,
};

export interface ControllerHandlers {
  onText?: (text: string) => void;
  onState?: (state: SessionState) => void;
  onDone: (result: SessionResult) => void;
}

// Codes that only mean "nothing was heard this time". The session may restart.
const QUIET_ERRORS = new Set(['no-speech', 'speech-timeout', 'nomatch']);

export function describeSpeechError(code: string, onDevice: boolean): string {
  switch (code) {
    case 'not-allowed':
      return 'Trail Notes needs microphone access to hear you. You can turn it on in Settings.';
    case 'service-not-allowed':
      return 'Speech recognition is turned off on this phone. Turn it on in Settings, then try again.';
    case 'language-not-supported':
      return onDevice
        ? 'This language is not available for on-device speech recognition. You can allow online recognition in Settings.'
        : 'Speech recognition is not available for your language on this phone.';
    case 'audio-capture':
      return 'The microphone could not be used. Close other apps that record audio and try again.';
    case 'network':
      return onDevice
        ? 'Speech recognition could not start. Check that on-device speech is installed, or allow online recognition in Settings.'
        : 'Speech recognition needs a connection right now. Try again when you have signal.';
    case 'busy':
      return 'Speech recognition is busy. Wait a moment and try again.';
    default:
      return 'Speech recognition stopped unexpectedly. Try again.';
  }
}

// Runs one entry's worth of listening. Recognizers stop on their own after a pause or a
// time limit, so this restarts them until the person taps stop, and stitches the pieces
// together.
export class SpeechController {
  private readonly accumulator = new TranscriptAccumulator();
  private state: SessionState = 'idle';
  private startedAt = 0;
  private restarts = 0;
  private failure: SpeechFailure | null = null;
  private reason: DoneReason = 'stopped';
  private unsubscribe: (() => void)[] = [];
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly engine: SpeechEngine,
    private readonly config: ControllerConfig,
    private readonly handlers: ControllerHandlers,
    private readonly now: () => number = Date.now,
  ) {}

  get currentState(): SessionState {
    return this.state;
  }

  begin(): void {
    if (this.state !== 'idle') return;
    this.accumulator.reset();
    this.startedAt = this.now();
    this.restarts = 0;
    this.failure = null;
    this.reason = 'stopped';
    this.setState('listening');

    this.unsubscribe = [
      this.engine.on('result', (event) => this.handleResult(event)),
      this.engine.on('error', (event) => this.handleError(event)),
      this.engine.on('end', () => this.handleEnd()),
    ];

    this.maxTimer = setTimeout(() => this.requestStop('max-duration'), this.config.maxDurationMs);
    this.armSilenceTimer();
    this.startEngine();
  }

  stop(): void {
    this.requestStop('stopped');
  }

  // Throws away what was heard.
  cancel(): void {
    if (this.state === 'idle') return;
    try {
      this.engine.abort();
    } catch {
      // The recognizer may already be gone.
    }
    this.accumulator.reset();
    this.finish('cancelled');
  }

  private startEngine(): void {
    try {
      this.engine.start({
        lang: this.config.lang,
        interimResults: true,
        continuous: this.config.continuous,
        requiresOnDeviceRecognition: this.config.onDevice,
        addsPunctuation: true,
        iosTaskHint: 'dictation',
      });
    } catch {
      this.failure = { code: 'client', message: describeSpeechError('client', this.config.onDevice) };
      this.finish('error');
    }
  }

  private requestStop(reason: DoneReason): void {
    if (this.state !== 'listening') return;
    this.reason = reason;
    this.setState('stopping');
    this.clearTimer('restartTimer');
    this.clearTimer('silenceTimer');
    try {
      this.engine.stop();
    } catch {
      this.finish(reason);
      return;
    }
    // Some recognizers never report the end of a session that had no speech.
    this.graceTimer = setTimeout(() => this.finish(reason), this.config.stopGraceMs);
  }

  private handleResult(event: SpeechEvents['result']): void {
    if (this.state === 'idle') return;
    this.accumulator.add({ transcript: event.results[0]?.transcript ?? '', isFinal: event.isFinal });
    this.handlers.onText?.(this.accumulator.liveText);
    if (this.state === 'listening') this.armSilenceTimer();
  }

  private handleError(event: SpeechEvents['error']): void {
    if (this.state === 'idle') return;
    if (event.error === 'aborted' || QUIET_ERRORS.has(event.error)) return;
    if (event.error === 'interrupted') {
      this.reason = 'interrupted';
      return;
    }
    this.failure = { code: event.error, message: describeSpeechError(event.error, this.config.onDevice) };
    this.finish('error');
  }

  private handleEnd(): void {
    if (this.state === 'idle') return;
    this.accumulator.commitInterim();

    if (this.state === 'stopping' || this.reason === 'interrupted') {
      this.finish(this.reason);
      return;
    }
    if (this.restarts >= this.config.maxRestarts) {
      this.finish('stopped');
      return;
    }

    this.restarts += 1;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.state === 'listening') this.startEngine();
    }, this.config.restartDelayMs);
  }

  private armSilenceTimer(): void {
    this.clearTimer('silenceTimer');
    this.silenceTimer = setTimeout(() => this.requestStop('silence'), this.config.silenceTimeoutMs);
  }

  private clearTimer(name: 'maxTimer' | 'silenceTimer' | 'restartTimer' | 'graceTimer'): void {
    const timer = this[name];
    if (timer !== null) clearTimeout(timer);
    this[name] = null;
  }

  private setState(state: SessionState): void {
    this.state = state;
    this.handlers.onState?.(state);
  }

  private finish(reason: DoneReason): void {
    if (this.state === 'idle') return;
    this.clearTimer('maxTimer');
    this.clearTimer('silenceTimer');
    this.clearTimer('restartTimer');
    this.clearTimer('graceTimer');
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
    this.accumulator.commitInterim();
    try {
      this.engine.release?.();
    } catch {
      // Releasing audio is best effort.
    }

    const result: SessionResult = {
      text: this.accumulator.liveText,
      durationMs: this.now() - this.startedAt,
      reason,
      failure: this.failure,
    };
    this.setState('idle');
    this.handlers.onDone(result);
  }
}
