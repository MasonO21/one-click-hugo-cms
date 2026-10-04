import { darkPalette, lightPalette, type Palette } from '../src/theme';

/** WCAG 2.x relative luminance and contrast ratio. */
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
/** Blend `fg` at `alpha` over `bg` (for the translucent white text used on the hero card). */
function blend(fg: string, bg: string, alpha: number): [number, number, number] {
  const f = rgb(fg);
  const b = rgb(bg);
  return [0, 1, 2].map((i) => Math.round(f[i]! * alpha + b[i]! * (1 - alpha))) as [number, number, number];
}
function ratio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const cr = (fg: string, bg: string) => ratio(rgb(fg), rgb(bg));

/** Small text needs 4.5:1 (WCAG AA). Every pair here is used for small text somewhere in the app. */
function pairs(p: Palette): [string, number][] {
  const out: [string, number][] = [
    ['ink on bg', cr(p.ink, p.bg)],
    ['ink on surface', cr(p.ink, p.surface)],
    ['ink on surfaceAlt', cr(p.ink, p.surfaceAlt)],
    ['muted on bg', cr(p.inkMuted, p.bg)],
    ['muted on surface', cr(p.inkMuted, p.surface)],
    ['muted on primaryTint', cr(p.inkMuted, p.primaryTint)],
    ['faint on bg', cr(p.inkFaint, p.bg)],
    ['faint on surface', cr(p.inkFaint, p.surface)],
    ['onPrimary on primaryFill (buttons, chips, badges)', cr(p.onPrimary, p.primaryFill)],
    ['onPrimary on primaryPressed', cr(p.onPrimary, p.primaryPressed)],
    ['primary on bg', cr(p.primary, p.bg)],
    ['primary on surface', cr(p.primary, p.surface)],
    ['primary on surfaceAlt', cr(p.primary, p.surfaceAlt)],
    ['primary on primaryTint', cr(p.primary, p.primaryTint)],
    ['blue on bg', cr(p.blue, p.bg)],
    ['blue on surface', cr(p.blue, p.surface)],
    ['ink on primaryTint', cr(p.ink, p.primaryTint)],
    ['onSuccess on success (swipe: used)', cr(p.onSuccess, p.success)],
    ['danger on bg', cr(p.danger, p.bg)],
    ['danger on surface', cr(p.danger, p.surface)],
    ['onHero on hero', cr(p.onHero, p.hero)],
    ['hero subtitle (75%) on hero', ratio(blend(p.onHero, p.hero, 0.75), rgb(p.hero))],
    ['hero legend (90%) on hero', ratio(blend(p.onHero, p.hero, 0.9), rgb(p.hero))],
    ['onDanger on danger', cr(p.onDanger, p.danger)],
    ['snack text on snack bar', cr(p.snackText, p.snackBg)],
    ['snack action on snack bar', cr(p.snackAction, p.snackBg)],
  ];
  for (const [name, u] of Object.entries(p.urgency)) out.push([`urgency ${name}: fg on tint`, cr(u.fg, u.tint)]);
  return out;
}

describe.each([
  ['light', lightPalette],
  ['dark', darkPalette],
])('%s palette contrast (WCAG AA, small text)', (_name, palette) => {
  it.each(pairs(palette))('%s', (_label, ratioValue) => {
    expect(ratioValue).toBeGreaterThanOrEqual(4.5);
  });
});

/** Controls and their states need 3:1 against what they sit on (WCAG 1.4.11). */
describe.each([
  ['light', lightPalette],
  ['dark', darkPalette],
])('%s palette contrast (non-text controls)', (_name, p) => {
  it.each([
    ['switch off-track on surface', cr(p.switchOff, p.surface)],
    ['switch off-track on bg', cr(p.switchOff, p.bg)],
    ['switch on-track on surface', cr(p.primaryFill, p.surface)],
    ['freshness bar segments on the hero card', Math.min(...Object.values(p.urgency).map((u) => cr(u.solid, p.hero)))],
    ['selected chip on bg', cr(p.primaryFill, p.bg)],
  ])('%s', (_label, ratioValue) => {
    expect(ratioValue).toBeGreaterThanOrEqual(3);
  });
});

/**
 * The orange scan button keeps the brand's white-on-orange look, which only reaches the
 * large-text level (3:1); its label is 19pt bold, which counts as large text under WCAG.
 */
describe.each([
  ['light', lightPalette],
  ['dark', darkPalette],
])('%s palette contrast (large text)', (_name, p) => {
  it.each([
    ['CTA label on the light end of the gradient', cr(p.onCta, p.cta[0])],
    ['CTA label on the dark end of the gradient', cr(p.onCta, p.cta[1])],
    ['wordmark "Fridge" on bg', cr(p.wordFridge, p.bg)],
    ['wordmark "Pulse" on bg', cr(p.wordPulse, p.bg)],
  ])('%s', (_label, ratioValue) => {
    expect(ratioValue).toBeGreaterThanOrEqual(3);
  });
});
