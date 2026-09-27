using System.IO;
using SnowGlobe.Game;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace SnowGlobe.EditorTools
{
    public static class PrototypeSceneMenu
    {
        const string ScenePath = "Assets/_Project/Scenes/SnowGlobePrototype.unity";

        [MenuItem("Snow Globe Factory/Create Prototype Scene")]
        public static void CreateScene()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var go = new GameObject("SnowGlobeFactory");
            go.AddComponent<GameBootstrap>();
            EditorSceneManager.SaveScene(scene, ScenePath);

            var scenes = EditorBuildSettings.scenes;
            bool listed = false;
            foreach (var s in scenes) if (s.path == ScenePath) listed = true;
            if (!listed)
            {
                var list = new System.Collections.Generic.List<EditorBuildSettingsScene>(scenes) { new EditorBuildSettingsScene(ScenePath, true) };
                EditorBuildSettings.scenes = list.ToArray();
            }
            Debug.Log("[SnowGlobe] Created " + ScenePath + ". Press Play.");
        }

        [MenuItem("Snow Globe Factory/Open Save Folder")]
        public static void OpenSaveFolder()
        {
            EditorUtility.RevealInFinder(Application.persistentDataPath);
        }
    }
}
