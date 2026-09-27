using UnityEditor;

namespace SnowGlobe.EditorTools
{
    /// <summary>
    /// Import settings for the bundled models (the repo doesn't track .meta files, so they live here instead).
    /// Characters import their clips as legacy animation so PersonModel can play and crossfade them with a plain
    /// Animation component; props have no animation or rig at all.
    /// </summary>
    sealed class ModelImportSettings : AssetPostprocessor
    {
        const string Root = "Assets/_Project/Resources/Models/";

        void OnPreprocessModel()
        {
            if (!assetPath.StartsWith(Root)) return;
            var importer = (ModelImporter)assetImporter;
            bool character = assetPath.StartsWith(Root + "Characters/");
            importer.animationType = character ? ModelImporterAnimationType.Legacy : ModelImporterAnimationType.None;
            importer.importAnimation = character;
            importer.importCameras = false;
            importer.importLights = false;
            // Props under the level's static root are combined with StaticBatchingUtility at runtime, which needs readable meshes.
            importer.isReadable = true;
            // Meshy models get their texture at runtime (Models.ApplyMeshyTexture); skip the OBJ's own material.
            if (assetPath.StartsWith(Root + "Meshy/")) importer.materialImportMode = ModelImporterMaterialImportMode.None;
        }
    }
}
