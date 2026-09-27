# Asset credits

Everything else in the game (the building, the miniature characters, the signage textures and the sound) is generated
by the game's own code and tools.

## 3D models

All bundled models are by **Kenney** ([kenney.nl](https://www.kenney.nl)) and released under **Creative Commons Zero
(CC0)**, public domain. Credit isn't required, but it's given gladly. Each pack's `License.txt` sits next to its models
in `Assets/_Project/Resources/Models/`.

| Pack | Folder | Used for |
|---|---|---|
| [Mini Characters](https://kenney.nl/assets/mini-characters) 1.0 | `Characters/` | Customers and the shop assistant (animated: idle, walk, sprint, pick-up, gestures) |
| [Holiday Kit](https://kenney.nl/assets/holiday-kit) 2.0 | `Holiday/` | Christmas tree, presents, wreath, stockings, nutcracker, window-sill decor, and the trees, snowmen, lanterns and reindeer inside Winter Village and Woodland Cabin globes |
| [Furniture Kit](https://kenney.nl/assets/furniture-kit) | `Furniture/` | Potted plants and cardboard boxes |
| [Factory Kit](https://kenney.nl/assets/factory-kit) 3.0 | `Factory/` | Basement crates |

Only the models the game uses are included. Import settings (legacy animation for characters, readable meshes) are
applied by `Scripts/Editor/ModelImportSettings.cs`, because the repo doesn't track `.meta` files.

The miniature living characters inside the globes deliberately keep their own procedural look, which follows the
concept art in `docs/concept/`.
