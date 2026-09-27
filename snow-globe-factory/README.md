# Little Lives: Snow Globe Factory (prototype)

A first-person snow globe shop hiding a creepy, increasingly automated business built around living miniature people.
Unity 6 · C# · Windows PC · keyboard + mouse.

* **Design and implementation plan:** [`docs/DESIGN_PLAN.md`](docs/DESIGN_PLAN.md). It covers the concept, loop, design conflicts, architecture, roadmap, economy tables, risks and acceptance criteria.
* **Map:** rebuilt from the concept paintings in [`docs/concept/`](docs/concept). A top-down plan is in [`docs/floorplan.png`](docs/floorplan.png).
* **Status:** Milestones 1 (greybox loop), 3 (automation), 4 (customers, orders, themes) and 5 (horror & roster) are code-complete. Milestone 7 (content & balance) is under way: all six themes, the supplier's ledger story with two endings, late-game upgrades, and an economy pass in [`docs/BALANCE.md`](docs/BALANCE.md).
  * Everything runs in Unity 6 (6000.6): 108 EditMode and 16 PlayMode tests pass in the editor, and a Windows build boots and passes its smoke test. The core alone also runs under .NET (`tools/CoreTests`).
  * What's left for Milestone 2 is human playtesting: feel, pacing and whether the horror works.

## Run it in Unity

**Option A (recommended)**

1. In Unity Hub, create a new **Unity 6 (6000.0 LTS)** project from the **Universal 3D** template.
2. Copy `Assets/_Project/` from this folder into the new project's `Assets/`.
3. In the editor, choose **Snow Globe Factory → Create Prototype Scene**. This saves `Assets/_Project/Scenes/SnowGlobePrototype.unity`.
4. Press **Play**.

**Option B:** open this folder directly in Unity Hub (*Add → Add project from disk*) with any Unity 6000.0 editor. It uses the built-in render pipeline and legacy input. Then do steps 3–4 above.

Notes:

* Nothing needs importing by hand. The building, the miniature characters, UI and audio are generated at runtime; people and props use the CC0 Kenney models bundled in `Assets/_Project/Resources/Models` (credits: [`docs/ASSET_CREDITS.md`](docs/ASSET_CREDITS.md)), with primitive placeholders if a model is missing.
* Input works with either the legacy Input Manager or the Input System package.
* Materials use URP/Lit when a URP asset is active, and Standard otherwise. With URP, runtime materials are cloned from the templates in `Assets/_Project/Resources/SnowGlobeShaders/`, which is what gets the shaders (and the transparent and emissive variants) into a player build.

## Build a Windows player

* **From the editor:** **Snow Globe Factory → Build Windows Player**. It writes `Builds/SnowGlobeFactory/SnowGlobeFactory.exe` in the project folder and builds only the Snow Globe scene, whatever else is in *Build Settings*.
* **From a terminal** (with the editor closed):

  ```
  Unity.exe -batchmode -quit -projectPath <project> -executeMethod SnowGlobe.EditorTools.SnowGlobeBuild.BuildFromCommandLine [-buildOutput <path/to/game.exe>] [-development]
  ```

* **Smoke test a build:** run the game with `-smoketest`. It boots, starts a new game, opens the shop, runs for 10 seconds and quits with exit code 0 only if nothing logged an error. It saves to a temporary folder, never to your real saves. Add `-batchmode -nographics` to run it headless, `-smokeshot <file.png>` to save a frame of the shop (handy for spotting missing shaders, which show up pink or opaque), or `-smokestress` to add 20 products (12 loose) and log frame times in each area.

  ```
  SnowGlobeFactory.exe -batchmode -nographics -smoketest -logFile smoke.log
  ```

* A build uses the project's company and product name for its save folder, so in a project called "AURA PROJECT" it shares saves with the editor.

## Controls

| Key | Action |
|---|---|
| WASD / mouse, Shift | Move / look, walk faster |
| LMB | Pick up / place (releasing near a valid spot snaps it in) |
| E | Interact / station action (hold E where prompted) |
| X | Secondary action (reject a globe, offer an exchange) |
| Q | Re-dose serum on a prepared character (held or looked at) |
| RMB + mouse, scroll | Rotate the held item |
| F | Hold the item close to look at it |
| G | Shake a sealed globe (held or on the shelf): showcase it for a minute (+10% price, shoppers drawn to it). A weak seal may let the figure move! |
| 1 / 2 / 3, A / D, arrows | Station choices (scenery, pose, fold sequence) |
| Tab | Management: supplies, characters, upgrades, themes, orders, notes, save/load, settings, help |
| Esc | Pause / step away from a station |
| E / X on a machine panel | Switch automatic ↔ manual / repair or service (automation upgrades) |
| E at the security desk | Watch the cameras (A/D switch feeds, Esc stand up) — Security Cameras upgrade |
| E / X at the order board | Pin the next special order / unpin (day 4+); deliver the box to the counter's pickup spot |
| F5 / F9 | Save / load (saving only while the shop is closed) |

## The loop

1. Basement: open a glass cabinet (E), grab an awake character and carry them up the stairs to the **Preparation Cradle**.
2. Time the (fictional) Stillness Serum injection. A countdown starts.
3. **Assembly:** choose the pose and turn the figure to face front, pick scenery with 1–3, then hold E to pour snow into the green band.
4. **Sealer:** drop the swinging dome when it's centred, then seal. Do this before the serum runs out.
5. **Inspection** (optional): turn the globe under the lamp. It gets +10% value if certified, and X rejects a bad one.
6. **Packaging:** follow the fold/tape keys.
7. Carry the box to a shop shelf slot to unbox it. Flip the OPEN sign. Ring up customers at the counter.
8. After closing: pay bills, buy upgrades and themes (Tab), then start the next day (a checkpoint is saved automatically).
9. From day 4: pin special orders at the board by the counter. The assembly card follows the pinned order, and the finished box goes on the counter's order pickup spot.
10. From day 8: red envelopes from "H." arrive in the morning crate. Answer them in Tab → Notes, and put any globe H. asks for in the freight-lift crate in the basement. The last page ends the story with a choice.

## Tests and checks (no Unity needed)

```bash
dotnet test tools/CoreTests          # 103 NUnit tests for the engine-free simulation core (C# 9)
dotnet run --project tools/BalanceSim -- 36 2024   # headless 36-day economy run with a scripted player
tools/typecheck-unity.sh             # compile-only check of Core + Runtime against UnityEngine reference assemblies
python3 tools/art/generate_art.py    # rebuild Resources/SnowGlobeArt textures from docs/concept (needs Pillow)
python3 tools/art/floorplan.py       # redraw docs/floorplan.png
```

In Unity's Test Runner:
* **EditMode** runs the same core tests, plus `EditModeRuntime` (JsonUtility save round trip, figure build).
* **PlayMode** runs smoke tests that boot the real scene and drive a character from a cabinet to a sale, run the auto-prep machine, and save/load.

These Unity-side tests are type-checked here but have not been run.

## Layout

```
Assets/_Project/Scripts/Core      engine-free rules: products & states, economy, suspicion, director, days, saves
Assets/_Project/Scripts/Runtime   Unity presentation: level builder, player, stations, customers, horror, HUD, audio
Assets/_Project/Scripts/Editor    scene-creation menu
Assets/_Project/Tests/EditMode    NUnit tests (shared by Unity and dotnet)
tools/                            .NET projects for running tests / type-checks outside Unity
docs/DESIGN_PLAN.md               the plan
```

Content note: the serum and stasis seals are fictional devices, shown only as charges, timers and integrity values. There is no gore and no way to harm a character. Rejected globes return their character to holding, unharmed.
