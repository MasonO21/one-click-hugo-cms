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
            var args = System.Environment.GetCommandLineArgs();
            // Optional -smokestress: the §9.13 performance check (20 products, 12 of them loose) in each area.
            if (System.Array.IndexOf(args, "-smokestress") >= 0)
            {
                QualitySettings.vSyncCount = 0; // measure headroom, not the monitor's refresh rate
                Application.targetFrameRate = -1;
                var st = root.Session.State;
                float by = Level.BasementFloorY;
                for (int i = 0; i < 6; i++) root.SpawnView(st.AddCharacter(SnowGlobe.Core.ArchetypeId.SleepyOne, SnowGlobe.Core.ProductLocation.Loose(1.5f + i * 0.5f, 0.2f, 4f + (i % 2))));
                for (int i = 0; i < 6; i++) root.SpawnView(st.AddCharacter(SnowGlobe.Core.ArchetypeId.SleepyOne, SnowGlobe.Core.ProductLocation.Loose(-4f + i * 0.6f, by + 0.2f, 30f + (i % 2))));
                for (int i = 0; i < 5; i++) root.SpawnView(st.AddCharacter(SnowGlobe.Core.ArchetypeId.SleepyOne, SnowGlobe.Core.ProductLocation.Holding(0)));
                var spots = new[] { root.Level.PlayerSpawn.position, new Vector3(3.75f, 0f, 8.5f), new Vector3(0f, 0f, 15f), new Vector3(-2f, by, 27f) };
                var names = new[] { "shop", "hallway", "backroom", "basement" };
                for (int s = 0; s < spots.Length; s++)
                {
                    root.Player.Teleport(spots[s], s == 0 ? root.Level.PlayerSpawnYaw : 0f);
                    for (int i = 0; i < 60; i++) yield return null; // settle
                    var times = new System.Collections.Generic.List<float>();
                    for (float t2 = 0f; t2 < 3f; t2 += Time.unscaledDeltaTime) { times.Add(Time.unscaledDeltaTime * 1000f); yield return null; }
                    times.Sort();
                    float avg = 0f;
                    foreach (var x in times) avg += x;
                    avg /= times.Count;
                    Debug.Log("[SnowGlobe] Perf " + names[s] + ": " + root.Views.Count + " products, avg " + avg.ToString("0.0") + " ms (" + (1000f / avg).ToString("0") +
                              " fps), 99th pct " + times[(int)(times.Count * 0.99f)].ToString("0.0") + " ms, worst " + times[times.Count - 1].ToString("0.0") + " ms");
                }
            }
            // Optional -smokeshot <file.png>: a frame from the shop floor, to eyeball shaders in a real build.
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
