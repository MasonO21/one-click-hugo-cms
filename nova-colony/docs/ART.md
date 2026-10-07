# Nova Colony — Illustrated art

In-game 3D is procedural three.js geometry (see `src/render`). The **2D illustrated art** — key art,
tier illustrations, biome postcards, alien portraits, resource icons, colonist profession portraits and
store marketing art — was generated with **Higgsfield** (`gpt_image_2_5`), using screenshots of the actual
game as style references so the art matches the in-game look.

| Set | Files | Size | Used for |
|---|---|---|---|
| Key art | `public/art/key/loading.webp`, `loading-portrait.webp` | 1920×1086 / 864×1536 | Loading screen |
| Tiers | `public/art/tiers/tier-<n>-<id>.webp` (7) | 800×600 | Colony tier ladder, tier-up celebration |
| Biomes | `public/art/biomes/<biome id>.webp` (8) | 960×540 | Region discovery, map |
| Aliens | `public/art/aliens/<AlienDef.model>.webp` (7) | 384² RGBA | Invasion warning / victory / bestiary |
| Resources | `public/art/resources/<resource id>.webp` (16 + `nova`) | 128² RGBA | HUD, costs, rewards |
| Professions | `public/art/professions/<profession id>.webp` (13) | 256² RGBA | Colonist list & details |
| World events | `public/art/events/<WorldEventDef.kind>.webp` (8) | 960×540 | Event popups & map markers |
| Shop | `public/art/shop/<ProductDef.id>.webp` (12) | 512×384 RGBA | Shop product cards |
| Rewards | `public/art/rewards/{victory_chest,supply_crate,daily_gift}.webp` | 256² RGBA | Victory chest, free crate, daily reward |
| Store | `art/store/feature-graphic-1024x500.jpg`, `key-art-*.jpg` | — | Google Play feature graphic, store/press (not shipped in the app) |

Lookups with emoji fallbacks live in `src/ui/art.ts`. Total in-app weight ≈ 3.8 MB (WebP).

## Style guide (for new art)
Stylized low-poly 3D, flat-shaded chunky shapes, soft warm lighting, bright saturated but cozy palette,
chibi characters with big friendly eyes; aliens are cute-creepy, never gory. Icons/portraits: three-quarter
view, centered, isolated on a transparent background, no text. Keep prompts short and concrete; pass the
key art (`art/store/key-art-camp.jpg`) as an image reference for scenes.

## Process
1. Generate with Higgsfield (`gpt_image_2_5`, quality medium/high, 1k; `background: transparent` for icons).
2. Optimize: icons trimmed to their alpha bounds, padded square, resized, saved as WebP (q≈85); scenes resized
   to their display size (q≈78–80).

**Before release — VERIFY:** confirm the Higgsfield plan/terms used cover commercial use of generated images
in a paid app and store listings.
