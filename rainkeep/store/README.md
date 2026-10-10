# Store art

Everything here was made from the game itself, so it shows what players get.

| File | Use |
|---|---|
| `ios-6.7/01-wyrm.jpg` … `07-story.jpg` | App Store screenshots, 6.7" iPhone (1290×2796), captions included. App Store Connect scales them for the smaller iPhones |
| `android/01-wyrm.jpg` … `07-story.jpg` | Google Play phone screenshots (1080×1920), the same seven |
| `google-play-feature-1024x500.png` | Google Play's required feature graphic |
| `keyart-wide-2752x1536.jpg` | The key art in landscape (the portrait painting outpainted), for banners, Discord, a press kit |
| `trailer-1080x1920.mp4` | A 30-second vertical gameplay trailer (no sound) for ads, TikTok/Reels/Shorts and the Play promo video |

The order and captions follow `STORE_LISTING.md`:

1. **Raise the last water dragon**: the keep at golden hour, close on the Rainwyrm
2. **See the storm coming. Be ready.**: a sandstorm over the keep
3. **25 heroes. Every one has a job at home.**: the heroes roster
4. **Cross the Dunes**: the Dunes map in 3D
5. **Play with real people**: a real Caravan with its chat and the Glass Serpent (two players on the test backend)
6. **Nine forms. One storm to choose.**: the Rainwyrm sheet at a late form
7. **Every boss has a story**: a story scene before a boss

## How they were made

A headless Chromium plays a built copy of the game at the stores' sizes (430×932 and 360×640 points at 3× pixel
density), sets up a built-up keep, takes each shot and lays the caption band over it in the game's own type. The
trailer pauses the page's clock and steps it one frame at a time, so the video is a smooth 30 fps whatever the
machine, then `ffmpeg` encodes it. The feature graphic is the key art outpainted to landscape (Higgsfield) with the
wordmark set in El Messiri.

To retake them by hand instead: run the game in a desktop browser with the device toolbar at the sizes above (or the
iOS Simulator), screenshot, and add the caption in any editor. Apple's App Preview video (886×1920 for the 6.7"
iPhone) is best recorded in the Simulator (File › Record Screen), following the script in `STORE_LISTING.md`.

Before a large ad spend, A/B test the first two screenshots and the icon (App Store product page optimization,
Google Play store listing experiments): they move installs more than anything else on the page.
