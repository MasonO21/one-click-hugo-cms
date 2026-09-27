using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace SnowGlobe.EditorTools
{
    /// <summary>
    /// Builds a playable Windows player containing only the Snow Globe Factory scene. It never touches the
    /// project's Build Settings scene list, so it's safe in a project that has other scenes too.
    ///
    /// From the editor: Snow Globe Factory → Build Windows Player.
    /// From a terminal (editor closed):
    ///   Unity.exe -batchmode -quit -projectPath &lt;project&gt; -executeMethod SnowGlobe.EditorTools.SnowGlobeBuild.BuildFromCommandLine [-buildOutput &lt;path to .exe&gt;]
    /// </summary>
    public static class SnowGlobeBuild
    {
        public const string DefaultOutput = "Builds/SnowGlobeFactory/SnowGlobeFactory.exe";

        [MenuItem("Snow Globe Factory/Build Windows Player")]
        public static void BuildFromMenu()
        {
            var report = BuildWindows(DefaultOutput, development: false);
            if (report.summary.result == BuildResult.Succeeded) EditorUtility.RevealInFinder(Path.GetFullPath(DefaultOutput));
        }

        public static void BuildFromCommandLine()
        {
            string output = DefaultOutput;
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == "-buildOutput") output = args[i + 1];
            var report = BuildWindows(output, development: Array.IndexOf(args, "-development") >= 0);
            EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
        }

        public static BuildReport BuildWindows(string output, bool development)
        {
            if (!File.Exists(PrototypeSceneMenu.ScenePath))
                throw new InvalidOperationException("Missing " + PrototypeSceneMenu.ScenePath + ". Run Snow Globe Factory → Create Prototype Scene first.");
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output)));
            var options = new BuildPlayerOptions
            {
                scenes = new[] { PrototypeSceneMenu.ScenePath },
                locationPathName = output,
                target = BuildTarget.StandaloneWindows64,
                targetGroup = BuildTargetGroup.Standalone,
                options = development ? BuildOptions.Development : BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(options);
            var s = report.summary;
            Debug.Log("[SnowGlobe] Build " + s.result + ": " + s.outputPath + " (" + (s.totalSize / (1024f * 1024f)).ToString("0.0") + " MB, " +
                      s.totalErrors + " errors, " + s.totalWarnings + " warnings, " + s.totalTime.TotalSeconds.ToString("0") + " s)");
            return report;
        }
    }
}
