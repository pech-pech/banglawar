using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Visual-only squash and stretch on a child "Visual" transform above the mesh. It never touches
    /// colliders, sim bodies or the root transform. Volume preserving: scale (1/sqrt(1+s), 1+s, 1/sqrt(1+s)).
    /// Spring k=180, d=14, max |s| 0.18 (0.10 for heavy trucks). Calm motion halves it.
    /// Pivot = the object's origin, so put it at the ground contact (truck root) and wheels stay planted.
    /// </summary>
    public sealed class SquashStretch : MonoBehaviour
    {
        public float k = 180f, d = 14f;
        public float maxStretch = 0.18f;
        [Tooltip("Driver exaggerates 1.5x the vehicle.")]
        public float gain = 1f;
        public Transform target;
        Spring _s;
        Vector3 _baseScale = Vector3.one;
        float _accelStretch;

        void Awake()
        {
            if (target == null) target = transform;
            _baseScale = target.localScale;
        }

        float Calm => MMSettings.CalmMotion ? 0.5f : 1f;

        public void Landing(float impactSpeed)
        {
            float a = Mathf.Clamp01(impactSpeed / 15f) * maxStretch * gain;
            _s.value = -a; _s.velocity = 0f;
        }
        public void Takeoff() { _s.value = 0.5f * maxStretch * gain; _s.velocity = 0f; }
        public void Crash() { _s.value = -0.25f * gain; _s.velocity = 0f; }
        public void Pop(float amount = 0.2f) { _s.value = amount * gain; _s.velocity = 0f; }

        /// <summary>Brake / accel stretch 0..0.06 along the travel direction (x).</summary>
        public void SetAccelStretch(float v) { _accelStretch = Mathf.Clamp(v, -0.06f, 0.06f); }

        public void Tick(float dt)
        {
            if (dt <= 0f) return;
            _s.Step(0f, k, d, dt);
            float s = Mathf.Clamp(_s.value, -0.3f, 0.3f) * Calm;
            float sy = 1f + s;
            float sxz = 1f / Mathf.Sqrt(sy);
            target.localScale = new Vector3(_baseScale.x * sxz * (1f + _accelStretch * Calm), _baseScale.y * sy, _baseScale.z * sxz);
        }
    }
}
