import * as Font from 'expo-font';
import { useEffect, useState } from 'react';
import { FONT_SOURCES } from '../theme/fontSources';
import type { FontName } from '../theme/fonts';
import { BRAND_FONTS_BASE64 } from './brandFontsData';
import { IONICONS_TTF_BASE64 } from './ioniconsFont';

let pending: Promise<void> | null = null;

/**
 * Registers the icon and brand fonts. The hosted preview inlines them as data URIs, so hosts that
 * only allow data: fonts (or serve the page from an unpredictable path) cannot break them;
 * otherwise the brand fonts load from their asset URLs and the icon font loads as usual.
 */
function load(): Promise<void> {
  const fonts: Record<string, Font.FontSource> = {};
  if (IONICONS_TTF_BASE64) fonts.ionicons = { uri: `data:font/ttf;base64,${IONICONS_TTF_BASE64}` };
  for (const [name, source] of Object.entries(FONT_SOURCES) as [FontName, number][]) {
    const inline = BRAND_FONTS_BASE64[name];
    fonts[name] = inline ? { uri: `data:font/ttf;base64,${inline}` } : source;
  }
  pending ??= Font.loadAsync(fonts).catch(() => {
    // Text falls back to the system font and icons to blank glyphs; the app stays usable.
  });
  return pending;
}

export function useEmbeddedFonts(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void load().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}
