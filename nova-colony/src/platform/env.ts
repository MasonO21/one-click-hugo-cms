/**
 * Runtime environment helpers: native-vs-web detection and build-time env vars.
 * Everything here is safe in a plain browser, in Node (unit tests) and inside Capacitor.
 * OWNER: meta agent.
 */
import { Capacitor } from '@capacitor/core';

export type PlatformName = 'web' | 'ios' | 'android';

/** 'ios' / 'android' inside the Capacitor shell, otherwise 'web'. */
export function platformName(): PlatformName {
  try {
    if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  } catch {
    /* not running under Capacitor */
  }
  return 'web';
}

export function isNative(): boolean {
  return platformName() !== 'web';
}

/** A `VITE_*` build-time variable ('' when unset). */
export function env(key: string): string {
  try {
    const v = (import.meta.env as Record<string, unknown> | undefined)?.[key];
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

/** True for `vite dev` / vitest builds (test ads, console analytics, verbose logs). */
export function isDevBuild(): boolean {
  try {
    return !!import.meta.env?.DEV;
  } catch {
    return false;
  }
}

/** Resolve after `ms`, or earlier with the value of `p`. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
