using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>Second-order critically-damped style spring (semi-implicit Euler, stable at any dt).</summary>
    public struct Spring
    {
        public float value, velocity;
        public Spring(float v) { value = v; velocity = 0f; }

        public void Step(float target, float k, float d, float dt)
        {
            // sub-step so k=180,d=14 stays stable even at 15 fps
            int n = Mathf.Clamp(Mathf.CeilToInt(dt / 0.008f), 1, 16);
            float h = dt / n;
            for (int i = 0; i < n; i++)
            {
                float a = k * (target - value) - d * velocity;
                velocity += a * h;
                value += velocity * h;
            }
        }
    }

    public static class MMMath
    {
        public const float Rad2Deg = 57.29578f;

        /// <summary>Frame-rate independent exponential smoothing. halfLife in seconds.</summary>
        public static float Damp(float current, float target, float halfLife, float dt)
        {
            if (halfLife <= 0f) return target;
            return Mathf.Lerp(target, current, Mathf.Pow(0.5f, dt / halfLife));
        }

        public static Color Damp(Color c, Color t, float halfLife, float dt)
        {
            float k = 1f - Mathf.Pow(0.5f, dt / Mathf.Max(1e-4f, halfLife));
            return Color.Lerp(c, t, k);
        }

        public static float SmoothStep01(float x) { x = Mathf.Clamp01(x); return x * x * (3f - 2f * x); }
        public static float EaseInOut(float x) => SmoothStep01(x);
        public static float EaseOutBack(float x)
        {
            const float c1 = 1.70158f, c3 = c1 + 1f;
            x = Mathf.Clamp01(x) - 1f;
            return 1f + c3 * x * x * x + c1 * x * x;
        }

        public static Vector3 ToWorld(Vector2 p, float z = 0f) => new Vector3(p.x, p.y, z);

        /// <summary>Cheap hash noise, deterministic.</summary>
        public static float Hash(int n)
        {
            n = (n << 13) ^ n;
            return 1f - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824f;
        }

        public static float Noise1D(float x)
        {
            int i = Mathf.FloorToInt(x); float f = x - i;
            f = f * f * (3f - 2f * f);
            return Mathf.Lerp(Hash(i), Hash(i + 1), f);
        }
    }
}
