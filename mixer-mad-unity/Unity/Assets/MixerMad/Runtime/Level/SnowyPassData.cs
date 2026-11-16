using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// The snowy-pass strip as a physics road line (x forward, y up, metres) plus visual surface flags.
    /// This is placeholder level data so the slice runs before the v7 level data is wired in.
    /// The real source of truth is the sim's level; MixerSimBackend returns the sim's own line instead.
    /// Layout: gentle start, climb, ramp jump, landing flat, FROZEN LAKE (flat ice, wet reflections),
    /// bumpy descent, finish flag. About 240 m.
    /// </summary>
    public static class SnowyPassData
    {
        public const byte Road = 0;
        public const byte Ice = 1;

        public static void Build(out Vector2[] line, out byte[] surface, out float finishX)
        {
            // (x, y) control points; linear between. Slopes <= ~30 deg.
            var p = new List<Vector2>
            {
                new Vector2(-30f, 0f), new Vector2(0f, 0f), new Vector2(20f, 0f),
                new Vector2(38f, 4.5f), new Vector2(52f, 6.2f), new Vector2(58f, 6.4f),   // climb
                new Vector2(66f, 6.0f),                                                    // lip of the ramp
                new Vector2(66.5f, 3.0f), new Vector2(76f, 1.0f),                           // drop (jump gap)
                new Vector2(96f, 1.0f),                                                    // landing flat
                new Vector2(100f, 1.0f), new Vector2(160f, 1.0f),                          // frozen lake (ice)
                new Vector2(164f, 1.0f), new Vector2(176f, 2.4f), new Vector2(184f, 1.6f),
                new Vector2(192f, 2.6f), new Vector2(204f, 0.8f), new Vector2(216f, 0.4f),
                new Vector2(236f, 0.4f), new Vector2(260f, 0.4f)
            };
            // Densify to 1 m spacing so slopes and interpolation are smooth for the sim and the mesh.
            var dense = new List<Vector2>();
            for (int i = 0; i < p.Count - 1; i++)
            {
                Vector2 a = p[i], b = p[i + 1];
                float len = Mathf.Abs(b.x - a.x);
                int n = Mathf.Max(1, Mathf.CeilToInt(len / 1f));
                if (len < 1f) n = 1;
                for (int k = 0; k < n; k++)
                {
                    float t = (float)k / n;
                    float s = len > 6f ? Mathf.SmoothStep(0f, 1f, t) * 0.35f + t * 0.65f : t;   // soften long slopes
                    dense.Add(new Vector2(Mathf.Lerp(a.x, b.x, t), Mathf.Lerp(a.y, b.y, s)));
                }
            }
            dense.Add(p[p.Count - 1]);
            line = dense.ToArray();
            surface = new byte[line.Length - 1];
            for (int i = 0; i < surface.Length; i++)
            {
                float mx = 0.5f * (line[i].x + line[i + 1].x);
                surface[i] = (mx >= 98f && mx <= 162f) ? Ice : Road;
            }
            finishX = 232f;
        }

        public const float IceY = 1.0f;       // the flat lake plane height (planar reflection plane)
        public const float IceX0 = 98f, IceX1 = 162f;

        public static float HeightAt(Vector2[] line, float x)
        {
            if (x <= line[0].x) return line[0].y;
            int lo = 0, hi = line.Length - 1;
            while (hi - lo > 1) { int mid = (lo + hi) >> 1; if (line[mid].x <= x) lo = mid; else hi = mid; }
            float t = Mathf.InverseLerp(line[lo].x, line[hi].x, x);
            return Mathf.Lerp(line[lo].y, line[hi].y, t);
        }
    }
}
