# SOULSWARM: Painted Art and Video Ads

Generated with Higgsfield on 2026-10-06 (the chapter and Bestiary paintings on 2026-10-07). The full-resolution masters are in `store/art/`. Everything the game and the native projects use is derived from them by `npm run art` (`scripts/painted-assets.sh`).

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
| `boss-gravemaw.jpg` | 1792×2400 | Nano Banana Pro | "The Hollow King approaches" boss warning, boss reveal ad clip, and Gravemaw's Bestiary portrait (`foe-gravemaw.webp`, 540×720) | `6899f0c9-8b53-4ca4-b052-df4279d237bb` |
| `chapter-1.jpg` | 2752×1536 | Nano Banana Pro | Ashen Necropolis: home chapter card, run intro card, results header | `cc31413d-f7d8-4325-81c1-7178eba2bed0` |
| `chapter-2.jpg` | 2752×1536 | Nano Banana Pro | Ember Wastes: the same three places | `58d39cf1-1b16-4ff1-99e7-68adc2c4f904` |
| `chapter-3.jpg` | 2752×1536 | Nano Banana Pro | Frozen Ossuary: the same three places | `d60d3dfe-9e0a-4d3c-8cf1-b1ac7d733494` |
| `chapter-4.jpg` | 2752×1536 | Nano Banana Pro | Abyssal Cathedral: the same three places | `6e36d14a-4a87-486e-b976-c6367eab9575` |
| `chapter-5.jpg` | 2752×1536 | Nano Banana Pro | Crimson Throne: the same three places | `12b28c50-2a1d-42dd-9a29-b82235892a60` |
| `chapter-6.jpg` | 2752×1536 | Nano Banana Pro | Endless Abyss (chapter id 6): the same three places | `5a314fea-7a1d-4c1e-ae6c-da46e9f75ca1` |
| `foe-husk.jpg` | 1792×2400 | Nano Banana Pro | Husk's Bestiary entry | `5db2b5a4-d4cd-4508-bde4-2f2c1a8ab3d8` |
| `foe-ghoul.jpg` | 1792×2400 | Nano Banana Pro | Ghoul's Bestiary entry | `61602183-968a-4c4f-94fb-7493db4ef1dd` |
| `foe-brute.jpg` | 1792×2400 | Nano Banana Pro | Brute's Bestiary entry | `33bf340b-d945-4270-be3a-b67d103d704c` |
| `foe-witch.jpg` | 1792×2400 | Nano Banana Pro | Cinder Witch's Bestiary entry | `d97e345a-c712-4240-a044-5828c9317e22` |
| `foe-bloater.jpg` | 1792×2400 | Nano Banana Pro | Bloater's Bestiary entry | `d5266c5f-7e42-4fb0-a746-57b21637bbbb` |
| `foe-thief.jpg` | 1792×2400 | Nano Banana Pro | Soul Thief's Bestiary entry (the run event) | `53d3197b-9ed3-4ecc-98cc-c0b7f982d57f` |
| `logo-transparent.png` | 2048×1360, alpha | GPT Image 2.5 | Boot screen, settings credits, ad end cards, store listing | `3cf6edf7-20d5-4d80-ac09-fd57074e79a9` |

The hero and boss splashes were generated with the vertical poster as an image reference, which keeps the painterly style consistent across the set. So were the 12 chapter and Bestiary paintings (2K, poster job `5d35e791…` as the style reference): chapters as 16:9 landscapes, foes at 3:4 as full-body portraits on a dark vignette, like the hero cards.

The voice lines in `src/assets/voice/` are documented separately, with the voice system.

**In the game** (`src/ui/art.js`, WebP copies in `src/assets/art/`, about 900 KB in total; the 13 new images are the 6 chapter paintings at 960 px wide and the 7 Bestiary portraits at 540×720, about 515 KB):
- **Painted splash vs 3D render:** a hero's painted splash replaces the live 3D portrait everywhere, except when that hero wears a skin. Skins exist only on the 3D model, so the render stays in that case (`paintedArt()` in `src/ui/meta/util.js`).
- **Boss warning:** the banner fades in the Hollow King above its title, kept clear of the player at screen centre.
- **Altar reveal:** a card that grants hero shards shows that hero's painting behind the card face.
- **Chapter card (home):** the selected chapter's painting fills the card behind its name, record line, difficulty selector and arrows, darkened by gradients so they stay readable, and cross-fades when the chapter changes (GDD §8).
- **Run intro card:** for about 2.4 s at the start of a run, the chapter's painting as a wide strip in the top third with the chapter name, its twist and the difficulty / Blood Moon tags (GDD §8). A faint strip of it also sits behind the results header.
- **Bestiary:** each foe's portrait on its card and entry sheet; until the first kill it shows as a dark, cold silhouette (a CSS filter on the same image, so no extra files) (GDD §5.2).

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

**Gameplay footage:** the first 15.8 s of `store/trailer-9x16.mp4` (`npm run trailer`). The current cut (v2) shows the gameplay update: the shepherd alone, the dead rising, a guarded gate, a 301-soul Nova, and the Hollow King's arena closing in.

**Beats in the gameplay segment** (trailer time; add 8 s for ad time):
- 0 s: "One shepherd against the horde";
- about 4 s: "But every enemy you kill…" as the dead rise;
- 10.3 s: the gate pick;
- 13.4 s: the Nova detonation;
- 15.0 s: Gravemaw's arena wall rises.

**Re-cutting:** `scripts/ads/render.sh` rebuilds both ads in a Higgsfield sandbox. It fetches the Kling clips, the painted art, the trailer and `src/audio/audio.js`, records the game's music and SFX in headless Chromium from the cue list in `cues.py`, then renders the overlays, segments and end cards. Cue times in `cues.py` must match the trailer beats above.

To run it:
1. Push the branch, so the sandbox can fetch the files from GitHub.
2. Request two upload slots with `media_upload`.
3. Run `render.sh` in the sandbox in the background, with `UPLOAD_V` and `UPLOAD_L` set to the presigned URLs.
4. Poll the job with short calls. A sandbox call that times out discards the sandbox and the job with it.
5. Call `media_confirm` once both PUTs return 200.

**End card:** the painted logo and poster, a PLAY FREE button, "iOS · Android", "Free to play · In-app purchases" and "Cinematic sequences are not actual gameplay."

**Labels:** every cinematic shot carries a CINEMATIC label on screen. Every gameplay shot carries an ACTUAL GAMEPLAY label.

**Where these ads can run:**
- These ads are for **paid user acquisition** (Meta, TikTok, AppLovin, Unity, Google App campaigns, YouTube).
- They are **not App Store app previews or the Play promo video.** Previews must be footage captured in the app. Use `store/trailer-9x16.mp4` there.

**File quality:**
- The repo copies are re-encoded at CRF 23 (22 MB and 12 MB).
- Full-quality v2 masters (CRF 19), confirmed in the Higgsfield media library:
  - vertical: https://d2ol7oe51mr4n9.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi/1f31c88c-19de-4f99-a35f-72b05742628f.mp4
  - landscape: https://d2ol7oe51mr4n9.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi/55230719-5786-4354-a79c-85aa57920f21.mp4
- The v1 masters (cut from the gameplay before the update) are kept for A/B comparison:
  - vertical: https://d2ol7oe51mr4n9.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi/9f1a1167-ff55-4e34-a795-8c3715f37184.mp4
  - landscape: https://d2ol7oe51mr4n9.cloudfront.net/user_3JNt8sa075rFfx7BmFXIV25jSbi/acefac00-a0d1-48b1-907d-e59d1642b140.mp4

**Raw cinematic clips** (8 s, with generated sound, Kling 3.0 Pro):
| Clip | Format | Higgsfield job |
|---|---|---|
| rise | 9:16 | `35a8e903-58b3-412a-b9dc-3d32889ebde1` |
| soul wave | 16:9 | `928ba105-1d39-4972-af06-320d3bb8419f` |
| boss reveal | 9:16 | `75879ac8-4a9d-497f-832d-1a48cd4b3457` |

**Generation cost:** 80.75 credits in total:
- 3 Kling clips at 20 credits each;
- 9 Nano Banana Pro 2K images at 2 credits each, including Liora's splash;
- 1 GPT Image 2.5 high image at 2.75 credits.

The 12 chapter and Bestiary paintings (2026-10-07) add 24 credits at the same rate (12 Nano Banana Pro 2K images at 2 credits each). Gravemaw's Bestiary portrait is cut from his existing splash, so it cost nothing.

Re-cutting the ads in the sandbox costs no credits.

New clips for the creative-testing rotation (`MARKETING.md` §6) cost about 20 credits per 8 s shot.
