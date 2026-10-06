# SOULSWARM: Painted Art and Video Ads

Generated with Higgsfield on 2026-10-06. The full-resolution masters are in `store/art/`. Everything the game and the native projects use is derived from them by `npm run art` (`scripts/painted-assets.sh`).

## 1. Painted art

| Master (`store/art/`) | Size | Model | Used for | Higgsfield job |
|---|---|---|---|---|
| `keyart-wide.jpg` | 2752×1536 | Nano Banana Pro | Play feature graphic, store banners, landscape ad (cinematic start frame) | `b4973d51-1222-419b-8db8-819a2a7258cb` |
| `keyart-vertical.jpg` | 1536×2752 | Nano Banana Pro | Poster, in-app boot screen, native splash, vertical ad (cinematic start frame and end card) | `5d35e791-1ee4-4b47-9d91-443ea7a80bfc` |
| `icon.jpg` | 2048×2048 | Nano Banana Pro | App icon (iOS and Android adaptive) | `d98c1db7-99f4-4dfb-bde4-e8df6e35e0f2` |
| `hero-vael.jpg` | 1792×2400 | Nano Banana Pro | Vael's hero card, hero detail and altar shard cards | `2884cb94-f0d8-42b4-8e5f-64d04226f1ba` |
| `hero-nyx.jpg` | 1792×2400 | Nano Banana Pro | Nyx's hero card, plus the starter pack and shop banner | `4d570c17-4869-4e55-aa56-e105b8df49bd` |
| `hero-seraphine.jpg` | 1792×2400 | Nano Banana Pro | Seraphine's hero card | `f13a35a8-8125-4c8f-b803-829bcf38d3ba` |
| `hero-mordrake.jpg` | 1792×2400 | Nano Banana Pro | Mordrake's hero card | `046be80a-f562-4eed-8802-d16db05fa70f` |
| `hero-liora.jpg` | 1792×2400 | Nano Banana Pro | Liora's hero card (5th hero, Epic) | `0f2133d3-a67a-4317-9948-98231363c867` |
| `boss-gravemaw.jpg` | 1792×2400 | Nano Banana Pro | "The Hollow King approaches" boss warning, boss reveal ad clip | `6899f0c9-8b53-4ca4-b052-df4279d237bb` |
| `logo-transparent.png` | 2048×1360, alpha | GPT Image 2.5 | Boot screen, settings credits, ad end cards, store listing | `3cf6edf7-20d5-4d80-ac09-fd57074e79a9` |

The hero and boss splashes were generated with the vertical poster as an image reference, which keeps the painterly style consistent across the set.

**In the game** (`src/ui/art.js`, WebP copies in `src/assets/art/`, about 390 KB in total):
- **Painted splash vs 3D render:** a hero's painted splash replaces the live 3D portrait everywhere, except when that hero wears a skin. Skins exist only on the 3D model, so the render stays in that case (`paintedArt()` in `src/ui/meta/util.js`).
- **Boss warning:** the banner fades in the Hollow King above its title, kept clear of the player at screen centre.
- **Altar reveal:** a card that grants hero shards shows that hero's painting behind the card face.

### Style guide for new art (heroes, skins, chapters)

- **Palette ("Neon Gothic"):**
  - obsidian black and deep navy;
  - spectral cyan `#4EF2FF` for the player's side;
  - ember orange-red for the horde;
  - magenta for Gravemaw;
  - each hero's own colour for its wisps (Seraphine `#7CFFD4`, Mordrake `#6DFF9A`, Nyx violet).
- **Rendering:** painterly digital illustration with visible brush texture, strong rim light, volumetric fog and glowing particles.
- **Text:** never put text in the art. Add it in layout.
- **Style consistency:** pass the vertical poster (job `5d35e791…`) as an image reference.
- **Hero cards:** 3:4 at 2K, with the full body in a three-quarter view, centred, on a dark vignette.

## 2. Video ads (`store/ads/`)

| File | Format | Length | Cut |
|---|---|---|---|
| `soulswarm-ad-vertical-9x16.mp4` | 1080×1920, 30 fps, H.264 + AAC 48 kHz stereo | 34.8 s | 0–8 s cinematic: souls erupt from the graves and the crown ignites (Kling 3.0 Pro from the poster). 8–23.8 s actual gameplay, with the game's own music and SFX recorded from the build. 23.8–30.3 s cinematic: Gravemaw rises (Kling 3.0 Pro from the boss splash). 30.3–34.8 s end card. |
| `soulswarm-ad-landscape-16x9.mp4` | 1920×1080, same codecs | 28.3 s | 0–8 s cinematic: the soul wave hits the horde (Kling 3.0 Pro from the wide key art). 8–23.8 s actual gameplay, pillarboxed over the blurred key art. 23.8–28.3 s end card. |

**Gameplay footage:** comes from `store/trailer-9x16.mp4` (`npm run trailer`).

**End card:** the painted logo and poster, a PLAY FREE button, "iOS · Android", "Free to play · In-app purchases" and "Cinematic sequences are not actual gameplay."

**Labels:** every cinematic shot carries a CINEMATIC label on screen. Every gameplay shot carries an ACTUAL GAMEPLAY label.

**Where these ads can run:**
- These ads are for **paid user acquisition** (Meta, TikTok, AppLovin, Unity, Google App campaigns, YouTube).
- They are **not App Store app previews or the Play promo video.** Previews must be footage captured in the app. Use `store/trailer-9x16.mp4` there.

**File quality:**
- The repo copies are re-encoded at CRF 23 (21 MB and 12 MB).
- Full-quality masters (CRF 19), confirmed in the Higgsfield media library:
  - vertical: https://d2ol7oe51mr4n9.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi/9f1a1167-ff55-4e34-a795-8c3715f37184.mp4
  - landscape: https://d2ol7oe51mr4n9.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi/acefac00-a0d1-48b1-907d-e59d1642b140.mp4

**Raw cinematic clips** (8 s, with generated sound, Kling 3.0 Pro):
| Clip | Format | Higgsfield job |
|---|---|---|
| rise | 9:16 | `35a8e903-58b3-412a-b9dc-3d32889ebde1` |
| soul wave | 16:9 | `928ba105-1d39-4972-af06-320d3bb8419f` |
| boss reveal | 9:16 | `75879ac8-4a9d-497f-832d-1a48cd4b3457` |

**Generation cost:** 78.75 credits in total:
- 3 Kling clips at 20 credits each;
- 8 Nano Banana Pro 2K images at 2 credits each;
- 1 GPT Image 2.5 high image at 2.75 credits.

New clips for the creative-testing rotation (`MARKETING.md` §6) cost about 20 credits per 8 s shot.
