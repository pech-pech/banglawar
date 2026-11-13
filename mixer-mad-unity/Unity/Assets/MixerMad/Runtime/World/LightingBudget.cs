using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// The lighting budgets that come from the camera rig (L-MM-29, L-MM-30), in one place so code and tests agree.
    ///   - Fog: at most 10% haze over the truck lane (Clear and Snow). Blizzard is allowed to exceed it on purpose:
    ///     it is the one weather where the lane is meant to go soft.
    ///   - Shadows: drawn at least 15 m past the lane, so the road behind the truck and the hill foot stay grounded.
    /// </summary>
    public static class LightingBudget
    {
        /// <summary>Most haze allowed over the lane for Clear and Snow (S1 cap).</summary>
        public const float LaneHazeCap = 0.10f;

        /// <summary>How far past the lane realtime shadows must still be drawn.</summary>
        public const float ShadowDepthPastLane = 15f;

        /// <summary>Camera-to-lane distance at the resting zoom: (17 m / 2) / tan(15 deg) = 31.7 m.</summary>
        public static float LaneDistance => DistanceFor(CameraRig.HeightRest);

        /// <summary>Camera-to-lane distance at the widest zoom (top speed lead-out).</summary>
        public static float LaneDistanceMax => DistanceFor(CameraRig.HeightMax);

        /// <summary>Shortest shadow distance that still grounds everything at the resting zoom.</summary>
        public static float MinShadowDistance => LaneDistance + ShadowDepthPastLane;

        static float DistanceFor(float visibleHeight) => visibleHeight * 0.5f / Mathf.Tan(CameraRig.Fov * 0.5f * Mathf.Deg2Rad);

        /// <summary>
        /// Share of the surface colour that survives Unity's exponential-squared fog at a distance:
        /// exp(-(density * distance)^2). 1 = no fog, 0 = all fog.
        /// </summary>
        public static float Exp2Transmittance(float density, float distance)
        {
            float x = density * distance;
            return Mathf.Exp(-x * x);
        }
    }
}
