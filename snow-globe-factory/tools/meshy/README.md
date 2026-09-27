# Meshy hero models

1. Set your Meshy API key yourself as the user environment variable `MESHY_API_KEY` (Windows: *Edit environment
   variables for your account*). Never paste it into a chat or commit it.
2. `python meshy_generate.py --balance` checks your credits (free).
3. `python meshy_generate.py <name>` generates a model from `models.json`: a preview (20 credits) then a texture pass
   (10 credits). It saves an FBX and a PNG to `Assets/_Project/Resources/Models/Meshy/`. Task ids go in
   `meshy_tasks.json`, so a re-run resumes instead of paying twice.
4. In Unity, run **Snow Globe → Slim Meshy Models**. It rewrites each FBX and PNG (about 15 MB) as an OBJ and a
   1024 px JPG (about 1 MB) and deletes the originals. The game applies the JPG at runtime (`Models.ApplyMeshyTexture`).
5. If Meshy added a plinth or scenery, crop it: `python crop_obj.py <obj> xmin xmax ymin ymax zmin zmax`. Record the box
   as `crop` in `models.json`.
6. Place the model with `Models.Place("Meshy/<name>", ...)`. Models never bring colliders; keep the primitive for
   collision and hide its renderer.
