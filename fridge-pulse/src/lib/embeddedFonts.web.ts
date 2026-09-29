import * as Font from 'expo-font';
import { useEffect, useState } from 'react';
import { IONICONS_TTF_BASE64 } from './ioniconsFont';

let pending: Promise<void> | null = null;

/**
 * Registers the icon font from an inlined data URI. Hosts that only allow data: fonts (or that
 * serve the page from an unpredictable path) then cannot break the icons. Without an embedded
 * font (the default) this does nothing and the icon library loads its font from a URL.
 */
function load(): Promise<void> {
  if (!IONICONS_TTF_BASE64) return Promise.resolve();
  pending ??= Font.loadAsync({ ionicons: { uri: `data:font/ttf;base64,${IONICONS_TTF_BASE64}` } }).catch(() => {
    // Icons fall back to blank glyphs; the app stays usable.
  });
  return pending;
}

export function useEmbeddedFonts(): boolean {
  const [ready, setReady] = useState(!IONICONS_TTF_BASE64);
  useEffect(() => {
    let live = true;
    void load().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}
