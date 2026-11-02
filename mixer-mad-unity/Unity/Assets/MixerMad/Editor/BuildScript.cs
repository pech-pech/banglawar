using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;
using Debug = UnityEngine.Debug;

namespace MixerMad.Editor
{
    /// <summary>
    /// macOS app build. Menu: MixerMad > Build macOS App.
    /// Command line:
    ///   /Applications/Unity/Hub/Editor/&lt;ver&gt;/Unity.app/Contents/MacOS/Unity -batchmode -nographics -quit \
    ///     -projectPath /path/to/Unity -executeMethod MixerMad.Editor.BuildScript.BuildMac \
    ///     -logFile build.log [-mmOut Builds/macOS/MixerMad.app] [-mmDev] [-mmRebuildScene]
    /// (do not pass -nographics if shaders must compile for Metal on a machine without a display: omit it)
    /// Writes Builds/build-report.json with size, total time, per-step timings, warnings and errors.
    /// Exit code 0 on success, 2 on build failure, 3 on setup failure.
    /// </summary>
    public static class BuildScript
    {
        [MenuItem("MixerMad/Build macOS App", priority = 20)]
        public static void BuildMenu() { Run(false); }

        [MenuItem("MixerMad/Build macOS App (development, profiler)", priority = 21)]
        public static void BuildDevMenu() { Run(true); }

        public static void BuildMac()
        {
            var args = Environment.GetCommandLineArgs();
            bool dev = Array.IndexOf(args, "-mmDev") >= 0;
            string outPath = Arg(args, "-mmOut") ?? "Builds/macOS/MixerMad.app";
            bool rebuildScene = Array.IndexOf(args, "-mmRebuildScene") >= 0;
            int code = 0;
            try { code = Run(dev, outPath, rebuildScene); }
            catch (Exception e) { Debug.LogError("[MixerMad] build crashed: " + e); code = 3; }
            if (Application.isBatchMode) EditorApplication.Exit(code);
        }

        static string Arg(string[] args, string name)
        {
            int i = Array.IndexOf(args, name);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }

        static int Run(bool dev, string outPath = "Builds/macOS/MixerMad.app", bool rebuildScene = false)
        {
            var total = Stopwatch.StartNew();
            var phases = new List<KeyValuePair<string, double>>();
            var sw = Stopwatch.StartNew();

            ProjectSetup.Apply();
            phases.Add(new KeyValuePair<string, double>("project setup", sw.Elapsed.TotalSeconds)); sw.Restart();

            if (rebuildScene || !File.Exists(SceneBuilder.ScenePath)) SceneBuilder.Build(false);
            phases.Add(new KeyValuePair<string, double>("scene build", sw.Elapsed.TotalSeconds)); sw.Restart();

            Directory.CreateDirectory(Path.GetDirectoryName(outPath) ?? "Builds");
            var opts = new BuildPlayerOptions
            {
                scenes = new[] { SceneBuilder.ScenePath },
                locationPathName = outPath,
                target = BuildTarget.StandaloneOSX,
                targetGroup = BuildTargetGroup.Standalone,
                options = dev ? BuildOptions.Development | BuildOptions.ConnectWithProfiler : BuildOptions.None
            };
            BuildReport report = BuildPipeline.BuildPlayer(opts);
            var s = report.summary;
            phases.Add(new KeyValuePair<string, double>("BuildPipeline.BuildPlayer", sw.Elapsed.TotalSeconds));

            int warnings = 0, errors = 0;
            foreach (var step in report.steps)
                foreach (var m in step.messages)
                {
                    if (m.type == LogType.Warning) warnings++;
                    else if (m.type == LogType.Error || m.type == LogType.Exception) errors++;
                }

            var json = new StringBuilder();
            json.Append("{\n");
            json.AppendFormat("  \"result\": \"{0}\",\n", s.result);
            json.AppendFormat("  \"output\": \"{0}\",\n", s.outputPath.Replace("\\", "/"));
            json.AppendFormat("  \"development\": {0},\n", dev ? "true" : "false");
            json.AppendFormat("  \"total_size_bytes\": {0},\n", s.totalSize);
            json.AppendFormat("  \"total_size_mb\": {0:F1},\n", s.totalSize / 1048576.0);
            json.AppendFormat("  \"build_time_s\": {0:F1},\n", s.totalTime.TotalSeconds);
            json.AppendFormat("  \"wall_time_s\": {0:F1},\n", total.Elapsed.TotalSeconds);
            json.AppendFormat("  \"unity\": \"{0}\",\n", Application.unityVersion);
            json.AppendFormat("  \"warnings\": {0},\n  \"errors\": {1},\n", warnings, errors);
            json.Append("  \"phases\": [");
            for (int i = 0; i < phases.Count; i++) json.AppendFormat("{0}{{\"name\":\"{1}\",\"s\":{2:F1}}}", i > 0 ? "," : "", phases[i].Key, phases[i].Value);
            json.Append("],\n  \"steps\": [");
            for (int i = 0; i < report.steps.Length; i++)
                json.AppendFormat("{0}{{\"name\":\"{1}\",\"s\":{2:F1}}}", i > 0 ? "," : "", report.steps[i].name.Replace("\"", "'"), report.steps[i].duration.TotalSeconds);
            json.Append("]\n}\n");
            Directory.CreateDirectory("Builds");
            File.WriteAllText("Builds/build-report.json", json.ToString());

            Debug.Log("[MixerMad] build " + s.result + ": " + (s.totalSize / 1048576.0).ToString("F1") + " MB in " + s.totalTime.TotalSeconds.ToString("F0") + " s. Report: Builds/build-report.json");
            return s.result == BuildResult.Succeeded ? 0 : 2;
        }
    }
}
