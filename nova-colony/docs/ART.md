# Nova Colony — Illustrated art

In-game 3D is procedural three.js geometry (see `src/render`). The **2D illustrated art** — key art,
tier illustrations, biome postcards, alien portraits, resource icons, colonist profession portraits and
store marketing art — was generated with **Higgsfield** (`gpt_image_2_5`), using screenshots of the actual
game as style references so the art matches the in-game look. The one exception is the **building and vehicle
thumbnails**: those are rendered straight from the in-game procedural 3D models (`npm run bake:thumbs`), so a new
building only needs a rebake, not a prompt.

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
| Items | `public/art/items/<ItemDef.id>.webp` (65: tools, weapons, armor, backpacks, gear, consumables, components, crates) | 192² RGBA | Inventory + equipment slots, crafting, factory recipes, reward chips / cards, item toasts |
| Buildings | `public/art/buildings/<BuildingDef.id>.webp` (150: every building, structure pieces included — one picture per piece, shared by its material tiers) — rendered from the in-game procedural models via `npm run bake:thumbs` | 192² RGBA | Build menu cards, placement bar, inspector, station tabs, unlock lists |
| Vehicles | `public/art/vehicles/<VehicleDef.id>.webp` (6) — rendered from the in-game procedural models via `npm run bake:thumbs` | 192² RGBA | Vehicle cards, craft rows, vehicle rewards / toasts |
| Store | `art/store/feature-graphic-1024x500.jpg`, `key-art-*.jpg` | — | Google Play feature graphic, store/press (not shipped in the app) |
| Promo video | `art/store/promo-flyover-10s.mp4` | 1920×1080, 10 s, silent | Store preview / social clip (Higgsfield `kling3_0` image-to-video from the key art); add game music when cutting a trailer |

Lookups with emoji fallbacks live in `src/ui/art.ts`. Total in-app weight ≈ 5.8 MB (WebP; the building + vehicle thumbnails are ≈ 1.3 MB of it).

## Where the art appears in the UI
Every lookup returns a relative URL or `null`; a missing/failed image falls back to the emoji from the data, so the UI
never has a hole. Styles are in `src/ui/styles/art.css`. `tests/ui.art.test.ts` guards that every resource, profession,
alien model, biome, tier, world-event kind, shop product, item, building and vehicle has a file (and that no file is orphaned).

| Art | Shown in | Shared helper |
|---|---|---|
| Resource / Nova icons | HUD chips + Nova chip (preloaded in `Hud`), resource popover, cost chips (build cards, upgrades, recipes, recruit, tier-up), reward chips (missions, daily, season, spin, merchant, shop), reward/victory cards, welcome-back rows, craft output rows, building effect tags, flying-to-HUD particles, "need more X" toast | `resIcon`/`iconEl` (`art.ts`), `resChip`/`rewardChips`/`tagChips`/`partIcon` (`widgets.ts`) |
| Profession portraits | colonists list + detail, recruit candidates, worker slots + picker in the building inspector, "joined the colony" toast, first-colonist celebration. Chosen by the colonist's **job** (workplace's `workers.job`), else their specialty; the rarity colour is the ring | `portrait()` (`widgets.ts`), `jobOf()` (`logic/colonist.ts`) |
| Tier illustrations | colony panel ladder (done = green ring, current = orange glow, next = gold, locked = greyscale), hero thumbnail, HUD tier badge, tier-up celebration (Titanium: gold title, glow pulse, sparkles, extra confetti) | `CelebratePanel` (`art`/`artKind` args) |
| Biome postcards | region-discovered celebration, map: tap empty ground or a region row for postcard + name + status/lock reason | `MapPanel.regionCard` |
| Alien portraits | invasion banner (types of the coming wave from the tier's invasion table + the boss when due; live types while attacking), off-screen threat markers, victory card (defeated types ×N), world tap tooltip | `Banners.refreshIcon`, `Threats` |
| World events | spotted / reward-claimed toasts, ancient-structure celebration, merchant panel header, map marker card, world tap tooltip | `UI.artToast` / `UI.celebrateArt` |
| Shop cards | product cards (Season Boost reuses the premium-pass card), Colony Pass hero | `ShopPanel` |
| Item icons | inventory equipment slots (large) + item rows, craft recipe / queue rows, ingredient chips (recipes, vehicles, factory), factory recipe picker + "→ 1× Item" output line, reward chips and reward cards for items (missions, daily, season, spin wheel + prizes, merchant, shop packs, victory chest), "Crafted X!" / "X opened!" toasts. Empty equipment slots keep their slot emoji | `itemArt`/`itemIcon` (`art.ts`), `itemChips`/`rewardChips` (`widgets.ts`), `rewardParts`/`itemToast` (`logic/rewards.ts`) |
| Building thumbnails | **build menu cards** (the picture is the hero: a fixed-height box above the name, so the grid never jumps; locked cards go greyscale + dim with a 🔒 badge, "already built" gets a ✔ badge, affordability stays on the cost chips; the box shrinks on short landscape phones), blueprint rows (a fan of up to 3 of the building types the blueprint is made of) and the blueprint placement bar, the **placement bar** (picture tile next to the name and cost), the **building inspector** (hero picture beside the status chips and description; the header carries the name only), crafting station tabs, the open-jobs list in the colonists panel, research "Unlocks" chips, the colony panel's "New with <tier>" list, the tier-up "Newly available" list, the context button when you stand next to a building, the "X moved" toast | `buildingArt`/`buildingIcon` (`art.ts`), `buildingUnlock`/`tierUnlocks` (`logic/describe.ts`), `unlockChip`/`blueprintThumb`/`tabs` (`widgets.ts`) |
| Vehicle thumbnails | vehicle cards (hero picture; locked ones greyscale + 🔒) and the "Riding X" card, craft recipe / queue rows for vehicles, vehicle reward chips and cards (missions, daily, season, spin, packs: the "NEW" chip), the "Crafted X!" toast, research "Unlocks" chips, the vehicle error toasts | `vehicleArt`/`vehicleIcon` (`art.ts`), `rewardParts`/`itemToast` (`logic/rewards.ts`), `vehicleUnlock` (`logic/describe.ts`) |
| Reward art | victory chest (dim + wobbling until tapped, then lights up), free supply crate (shop card + reward card), daily gift (panel + claim card) | `rewardArt` |

Toasts and the world tooltip accept an art URL (anything starting with `art/`) in place of their emoji icon.
**Deliberately still emoji:** floating "+3 🪵" numbers over the world, the live "Now: +3 🪵/min" line in the building
inspector, the "Built X!" floating text, navigation glyphs (dock/rail/menu, the build-category tabs, the 🚙 "Open garage" button), empty equipment-slot glyphs and RP / XP / boost icons.

## Painted building icons (paused)
The build-menu icons in `public/art/buildings` + `public/art/vehicles` are baked from the in-game models
(`npm run bake:thumbs`; `--size 512` renders bigger sources). A painted pass — each render repainted with Higgsfield
`gpt_image_2_5` using the render as image reference, so the design still matches the model — looked clearly richer and
was started, but stopped after 15 of 156 when the Higgsfield balance ran out. Progress, prompt template, reference URLs
and post-processing are in `art/source/painted-building-icons.json`. Ship them only once all 156 are done (no mixed
styles); re-run the painted pass for any model that changes afterwards.

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
