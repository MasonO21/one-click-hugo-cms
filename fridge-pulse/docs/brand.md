# Fridge Pulse brand

**Fridge Pulse: your kitchen's vital sign.** A dark, neon look: glowing outlines, a heartbeat running through everything, and bright colours that each mean something.

## Colours

| Name | Hex | Used for |
| --- | --- | --- |
| Pulse Magenta | `#FF007F` | The main accent: primary buttons, selected chips, links, the heartbeat |
| Electric Blue | `#007FFF` | Cool elements: glowing card outlines, the "this week" colour, "Fridge" in the wordmark |
| Zesty Orange | `#FF5F00` | The scan call to action and "due today" alerts |
| Lime Spark | `#A7F432` | Fresh food and good news: the freshness meter, "used it", rescues |
| Charcoal Slate | `#222222` | Body text on light backgrounds |
| Navy (interface) | `#0B1530` | The dashboard card and the fridge in the logo |

The raw colours live in `BRAND` in `src/theme/index.ts`. Screens use the palette tokens next to them (`primary`, `primaryFill`, `blue`, `cta`, `success`, ...), which are lighter or deeper versions tuned so text passes WCAG AA on its background. `__tests__/contrast.test.ts` checks every pair in both looks. Two rules come out of that:

- Magenta text on dark backgrounds is `primary` (`#FF4DA6`); magenta buttons are `primaryFill` (`#E0007A`) so white labels stay readable.
- White on the orange gradient only reaches the large-text level (3:1), so the orange button always uses its large 19pt bold uppercase label (`Button variant="cta"`). Never put small white text on orange.

Freshness uses a fixed status scale, always shown with words (badges and the legend): expired magenta, due today orange, 1-3 days amber, this week blue, fresh lime.

## Looks

Dark is the default (the brand look). Settings > Appearance offers Light (the same colours on white, Charcoal Slate text) and Match phone. The dashboard card stays navy in both.

## Type

- **Montserrat** (Bold 700, ExtraBold 800): titles, headings, labels, buttons, the wordmark.
- **Open Sans** (Regular, SemiBold, Bold): everything people read.

Each weight is its own font family in React Native. `Text` picks the family from its variant and weight (`brandFont` in `src/theme/fonts.ts`), so set `fontWeight` and let it choose; do not set `fontFamily` by hand unless you mean a specific face. The fonts ship with the app (`src/theme/fontSources.ts`) and the web preview inlines them.

## Logo and wordmark

- The mark (`FridgeMark` in `src/components/Logo.tsx`, `assets/source/logo.svg`): a fridge with a magenta-to-orange neon frame, an electric-blue door and a magenta heartbeat across it, on a navy body so it works on any background. `Logo` adds the beat.
- The wordmark (`src/components/Wordmark.tsx`): "Fridge" in blue, "Pulse" in magenta, Montserrat ExtraBold, glowing in the dark look. Use it at 24pt or larger.
- The app icon: the mark on a blue-to-orange tile. `node scripts/brand-assets.mjs` writes the SVG sources and `CHROMIUM_PATH=<chromium> node scripts/brand-assets.mjs --png` renders every icon, splash and favicon PNG.

## Motion

The heartbeat is the brand's motion: the logo beats (faster when food needs using), the dashboard has a scrolling heart-monitor trace, the freshness meter fills up. All of it stops when the phone asks for reduced motion.

## Voice

Energetic and proactive, smart and intuitive, fresh and sustainable. Short, warm sentences; never alarmist about food safety.
