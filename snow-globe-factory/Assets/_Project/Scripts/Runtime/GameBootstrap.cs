using System.Collections;
using UnityEngine;

namespace SnowGlobe.Game
{
    /// <summary>
    /// Drop this on an empty GameObject in an empty scene (or use the menu
    /// "Snow Globe Factory > Create Prototype Scene") and press Play. The whole
    /// prototype — building, player, stations, customers, UI, audio — is generated at runtime.
    /// </summary>
    public sealed class GameBootstrap : MonoBehaviour
    {
        [Tooltip("Seed for the first session shown behind the title screen.")]
        public uint Seed = 1225;

        int _errors;

        void Start()
        {
            bool smoke = System.Array.IndexOf(System.Environment.GetCommandLineArgs(), "-smoketest") >= 0 && !Application.isEditor;
            if (smoke)
            {
                // Build check: never touch the player's real saves.
                SaveSystem.DirectoryOverride = System.IO.Path.Combine(Application.temporaryCachePath, "SmokeTest");
                System.IO.Directory.CreateDirectory(SaveSystem.DirectoryOverride);
                Application.logMessageReceived += CountErrors;
            }
            // Remove default scene cameras/lights so the generated player camera and lighting own the view.
            foreach (var cam in FindObjectsByType<Camera>(FindObjectsSortMode.None)) Destroy(cam.gameObject);
            foreach (var l in FindObjectsByType<Light>(FindObjectsSortMode.None)) if (l.type == LightType.Directional) Destroy(l.gameObject);
            gameObject.AddComponent<GameRoot>().Boot(Seed);
            if (smoke) StartCoroutine(SmokeTest());
        }

        void CountErrors(string message, string stackTrace, LogType type)
        {
            if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert) _errors++;
        }

        /// <summary>
        /// Run a built player with -smoketest (it works headless with -batchmode -nographics too): it boots,
        /// starts a new game, opens the shop, runs about 10 seconds and quits with exit code 0 only if nothing
        /// logged an error. Used by the build pipeline to check a fresh build actually plays.
        /// </summary>
        IEnumerator SmokeTest()
        {
            yield return null;
            var root = GameRoot.I;
            root.StartNewGame();
            root.Hud.CloseAllPanels();
            root.OpenShop();
            float t = 0f;
            int frames = 0;
            while (t < 10f) { t += Time.unscaledDeltaTime; frames++; yield return null; }
            // Optional -smokeshot <file.png>: a frame from the shop floor, to eyeball shaders in a real build.
            var args = System.Environment.GetCommandLineArgs();
            int shot = System.Array.IndexOf(args, "-smokeshot");
            if (shot >= 0 && shot + 1 < args.Length)
            {
                root.Player.Teleport(root.Level.PlayerSpawn.position, root.Level.PlayerSpawnYaw);
                for (int i = 0; i < 30; i++) yield return null;
                yield return new WaitForEndOfFrame();
                ScreenCapture.CaptureScreenshot(args[shot + 1]);
                for (int i = 0; i < 10; i++) yield return null; // the capture is written at the end of a later frame
            }
            bool ok = _errors == 0 && root.Level != null && root.Views.Count > 0;
            Debug.Log("[SnowGlobe] Smoke test " + (ok ? "PASSED" : "FAILED") + ": " + frames + " frames, " + _errors + " errors, " + root.Views.Count + " products in the world.");
            Application.Quit(ok ? 0 : 1);
        }
    }
}
