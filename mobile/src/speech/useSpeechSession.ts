import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  DEFAULT_CONTROLLER_CONFIG,
  SpeechController,
  type ControllerConfig,
  type SessionResult,
  type SessionState,
  type SpeechEngine,
} from './controller';

export interface UseSpeechSessionOptions {
  lang: string;
  onDevice: boolean;
  continuous: boolean;
  onDone: (result: SessionResult) => void;
  engine: SpeechEngine;
  config?: Partial<ControllerConfig>;
}

export function useSpeechSession(options: UseSpeechSessionOptions) {
  const [state, setState] = useState<SessionState>('idle');
  const [text, setText] = useState('');
  const controller = useRef<SpeechController | null>(null);

  // begin() always uses the newest options, even when it is called from a callback that
  // was created before a setting changed.
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const begin = useCallback(() => {
    controller.current?.cancel();
    setText('');
    const { engine, config, lang, onDevice, continuous } = latest.current;
    controller.current = new SpeechController(
      engine,
      { ...DEFAULT_CONTROLLER_CONFIG, ...config, lang, onDevice, continuous },
      {
        onText: setText,
        onState: setState,
        onDone: (result) => latest.current.onDone(result),
      },
    );
    controller.current.begin();
  }, []);

  const stop = useCallback(() => controller.current?.stop(), []);
  const cancel = useCallback(() => controller.current?.cancel(), []);

  // Stop listening if the screen goes away mid-recording.
  useEffect(() => () => controller.current?.cancel(), []);

  return { state, text, begin, stop, cancel };
}
