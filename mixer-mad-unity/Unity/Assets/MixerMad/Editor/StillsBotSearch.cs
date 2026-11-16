using System.Collections.Generic;
using System.Text;
using UnityEditor;
using UnityEngine;
using MixerMad.Game;

namespace MixerMad.Editor
{
    /// <summary>
    /// -executeMethod MixerMad.Editor.StillsBotSearch.Run : drives the real sim headlessly with a grid of
    /// StillsBot settings and lists the ones that reach the finish (sim time, crashes, jumps). Review tooling only.
    /// </summary>
    public static class StillsBotSearch
    {
        const double MaxSimSeconds = 150.0;

        public static void Run()
        {
            var sb = new StringBuilder("[MixerMad] stills bot search\n");
            var wins = new List<string>();
            float[] downs = { -0.6f, -0.35f, -0.15f, 0.05f };
            float[] ups = { 0.15f, 0.35f, 0.6f, 0.9f };
            float[] caps = { 6f, 9f, 13f, 30f };
            float[] grounds = { 0.6f, 1.0f };
            foreach (var d in downs) foreach (var u in ups) foreach (var c in caps) foreach (var g in grounds)
            {
                if (u <= d) continue;
                var bot = new StillsBot(d, u, g, c);
                var r = Simulate(bot);
                string line = $"{bot}: {(r.finished ? "FINISH" : "no")} t={r.t:F1}s maxX={r.maxX:F1}/{r.finishX:F0} crashes={r.crashes} bigAir={r.bigAir}";
                sb.AppendLine(line);
                if (r.finished) wins.Add(line);
            }
            // pure gas, the benchmark bot
            var pure = Simulate(null);
            sb.AppendLine($"gas only: {(pure.finished ? "FINISH" : "no")} t={pure.t:F1}s maxX={pure.maxX:F1} crashes={pure.crashes}");
            sb.AppendLine("WINNERS: " + wins.Count);
            foreach (var w in wins) sb.AppendLine("  " + w);
            Debug.Log(sb.ToString());
            if (Application.isBatchMode) EditorApplication.Exit(0);
        }

        struct Result { public bool finished; public double t; public float maxX, finishX; public int crashes, bigAir; }

        static Result Simulate(StillsBot? bot)
        {
            var be = BackendFactory.Create(false);
            be.Reset();
            var snap = new SimSnapshot();
            var r = new Result { finishX = be.FinishX };
            int steps = (int)(MaxSimSeconds / be.StepSeconds);
            for (int i = 0; i < steps; i++)
            {
                be.Capture(snap);
                if (snap.finished) { r.finished = true; r.t = i * be.StepSeconds; break; }
                var input = bot.HasValue ? bot.Value.Drive(snap) : new SimInput { gas = 1f };
                be.Step(input);
                r.maxX = Mathf.Max(r.maxX, snap.chassisPos.x);
                while (be.TryDequeueEvent(out var e))
                {
                    if (e.kind == SimEventKind.Crash) r.crashes++;
                    if (e.kind == SimEventKind.BigAir) r.bigAir++;
                    if (e.kind == SimEventKind.Finish) { r.finished = true; r.t = i * be.StepSeconds; }
                }
                if (r.finished) break;
            }
            return r;
        }
    }
}
