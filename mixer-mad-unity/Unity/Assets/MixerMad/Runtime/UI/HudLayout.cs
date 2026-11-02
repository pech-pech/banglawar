using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>WCAG 2.x contrast maths for HUD colours (sRGB colours as authored, alpha ignored).</summary>
    public static class Wcag
    {
        public const float NonTextMinimum = 3f;   // WCAG 1.4.11: UI parts and their edges

        static float Channel(float c) => c <= 0.04045f ? c / 12.92f : Mathf.Pow((c + 0.055f) / 1.055f, 2.4f);

        public static float Luminance(Color c) => 0.2126f * Channel(c.r) + 0.7152f * Channel(c.g) + 0.0722f * Channel(c.b);

        public static float Contrast(Color a, Color b)
        {
            float la = Luminance(a), lb = Luminance(b);
            return (Mathf.Max(la, lb) + 0.05f) / (Mathf.Min(la, lb) + 0.05f);
        }
    }

    /// <summary>
    /// Pure layout maths for the HUD (screen pixels, origin bottom-left, like Screen and Camera.WorldToScreenPoint).
    /// Kept apart from the MonoBehaviour so tests can check it at any screen size.
    /// </summary>
    public static class HudLayout
    {
        public static readonly Vector2 ReferenceResolution = new Vector2(1280f, 800f);
        public const float MatchWidthOrHeight = 0.5f;
        /// <summary>The top HUD row (pause, LOAD, stars, toast) in reference units; the finish card sits below it.</summary>
        public const float TopRowReserved = 128f;
        public const float CardMargin = 16f;
        static readonly float[] CardShrinkSteps = { 1f, 0.85f, 0.72f, 0.6f };

        /// <summary>Same scale CanvasScaler uses with ScaleWithScreenSize and MatchWidthOrHeight 0.5.</summary>
        public static float CanvasScale(Vector2 screen)
        {
            float lw = Mathf.Log(screen.x / ReferenceResolution.x, 2f), lh = Mathf.Log(screen.y / ReferenceResolution.y, 2f);
            return Mathf.Pow(2f, Mathf.Lerp(lw, lh, MatchWidthOrHeight));
        }

        /// <summary>
        /// Where the DELIVERED card goes: in the top band under the HUD row, centre first, then left, then right,
        /// shrinking step by step, so it never covers the truck (and the pour under its chute). `clear` is false only
        /// when no placement avoids the truck (then the smallest centre card is returned).
        /// </summary>
        public static Rect PlaceFinishCard(Rect safe, float scale, Vector2 cardRef, Rect truck, out bool clear)
        {
            float m = CardMargin * scale;
            Rect avoid = truck.width > 0f && truck.height > 0f ? new Rect(truck.x - m, truck.y - m, truck.width + 2 * m, truck.height + 2 * m) : Rect.zero;
            float top = safe.yMax - TopRowReserved * scale;
            Rect r = default;
            foreach (float k in CardShrinkSteps)
            {
                Vector2 c = cardRef * scale * k;
                float y = Mathf.Max(safe.yMin, top - c.y);
                float[] xs = { safe.center.x - c.x * 0.5f, safe.xMin + m, safe.xMax - m - c.x };
                foreach (float x in xs)
                {
                    r = new Rect(x, y, c.x, c.y);
                    if (avoid.width <= 0f || !avoid.Overlaps(r)) { clear = true; return r; }
                }
                r = new Rect(xs[0], y, c.x, c.y);
            }
            clear = false;
            return r;
        }

        /// <summary>Screen rect of a set of world bounds seen by a camera (points behind the camera are skipped).</summary>
        public static Rect ScreenRect(Camera cam, Bounds b)
        {
            Vector2 lo = new Vector2(float.MaxValue, float.MaxValue), hi = new Vector2(float.MinValue, float.MinValue);
            bool any = false;
            for (int i = 0; i < 8; i++)
            {
                var p = new Vector3((i & 1) == 0 ? b.min.x : b.max.x, (i & 2) == 0 ? b.min.y : b.max.y, (i & 4) == 0 ? b.min.z : b.max.z);
                var s = cam.WorldToScreenPoint(p);
                if (s.z <= 0f) continue;
                any = true; lo = Vector2.Min(lo, s); hi = Vector2.Max(hi, s);
            }
            return any ? Rect.MinMaxRect(lo.x, lo.y, hi.x, hi.y) : Rect.zero;
        }
    }
}
