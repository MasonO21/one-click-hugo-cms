import { useRef } from 'react';

// A second tap this soon after the first is a double tap, not a new request. Without
// this, a quick double tap saves a note twice or opens the same screen twice.
export const REPEAT_TAP_MS = 600;

// Wraps a tap handler so a quick second tap is ignored.
export function useTapGuard() {
  const lastTap = useRef(0);
  return function guard<A extends unknown[], R>(handler: (...args: A) => R) {
    return (...args: A): R | undefined => {
      const now = Date.now();
      if (now - lastTap.current < REPEAT_TAP_MS) return undefined;
      lastTap.current = now;
      return handler(...args);
    };
  };
}
