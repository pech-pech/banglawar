using System;
using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Plans snow-fence runs on sloped ground (pure: no scene objects, so tests can check it).
    /// Every rail spans post to post: both ends are sampled on the ground and the rail is rotated to the slope.
    /// Every run starts and ends with a post. A run stops before a span that is too steep, or where the ground
    /// bends so much between two posts that a straight rail would float or dig in.
    /// </summary>
    public static class FencePlanner
    {
        public const float Spacing = 2.5f;
        public const int PostsPerRun = 7;
        public const float GapBetweenRuns = 9f;
        public const float PostHeight = 1.2f;
        public const float PostSink = 0.03f;           // feet go a hair into the snow
        public const float MaxSpanRise = 0.9f;         // about 20 degrees over 2.5 m
        public const float MaxSpanBend = 0.12f;        // ground vs straight rail at mid-span
        public static readonly float[] RailHeights = { 0.45f, 0.95f };

        public struct Rail { public Vector3 a, b; public float height; }

        public sealed class Plan
        {
            public readonly List<Vector3> postFeet = new List<Vector3>();
            public readonly List<Rail> rails = new List<Rail>();
            /// <summary>Index of the first and last post of each run in postFeet.</summary>
            public readonly List<Vector2Int> runs = new List<Vector2Int>();
        }

        public static Plan Make(Func<float, float, float> ground, float x0, float x1, float z)
        {
            var plan = new Plan();
            float x = x0;
            while (x + Spacing <= x1)
            {
                var run = Run(ground, x, x1, z);
                if (run.Count >= 2) AddRun(plan, ground, run, z);
                x = (run.Count >= 2 ? run[run.Count - 1] : x) + GapBetweenRuns;
            }
            return plan;
        }

        /// <summary>Post x positions for one run starting at x (at least the first post).</summary>
        static List<float> Run(Func<float, float, float> ground, float x, float x1, float z)
        {
            var xs = new List<float> { x };
            while (xs.Count < PostsPerRun)
            {
                float a = xs[xs.Count - 1], b = a + Spacing;
                if (b > x1 || !SpanOk(ground, a, b, z)) break;
                xs.Add(b);
            }
            return xs;
        }

        public static bool SpanOk(Func<float, float, float> ground, float a, float b, float z)
        {
            float ya = ground(a, z), yb = ground(b, z);
            if (Mathf.Abs(yb - ya) > MaxSpanRise) return false;
            for (int i = 1; i < 4; i++)
            {
                float t = i / 4f;
                if (Mathf.Abs(ground(Mathf.Lerp(a, b, t), z) - Mathf.Lerp(ya, yb, t)) > MaxSpanBend) return false;
            }
            return true;
        }

        static void AddRun(Plan plan, Func<float, float, float> ground, List<float> xs, float z)
        {
            int first = plan.postFeet.Count;
            foreach (float px in xs) plan.postFeet.Add(new Vector3(px, ground(px, z) - PostSink, z));
            plan.runs.Add(new Vector2Int(first, plan.postFeet.Count - 1));
            for (int i = 0; i < xs.Count - 1; i++)
            {
                float ga = ground(xs[i], z), gb = ground(xs[i + 1], z);
                foreach (float h in RailHeights)
                    plan.rails.Add(new Rail { a = new Vector3(xs[i], ga + h, z), b = new Vector3(xs[i + 1], gb + h, z), height = h });
            }
        }
    }
}
