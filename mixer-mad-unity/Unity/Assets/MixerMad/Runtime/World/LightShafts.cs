using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Cheap sun shafts (Preset.lightShafts, High and Ultra): a handful of long, soft, additive cards hung behind
    /// the lane, slanted along the key light as the camera sees it, so beams seem to fall from the sun through the
    /// cold air. URP-friendly (no post pass, no new package): one dynamic mesh, one renderer, one material made
    /// once from the SoftParticle shader. Strongest at dawn and dusk, gone at night, softer in snow, off when
    /// FeatureToggles.LightShafts is off. Follows the camera in x only; it holds no history, so teleports need no reset.
    /// </summary>
    [DefaultExecutionOrder(65)]
    [DisallowMultipleComponent]
    public sealed class LightShafts : MonoBehaviour
    {
        const int Cards = 5;
        const float CardLength = 70f, CardWidthMin = 3f, CardWidthMax = 7f;
        const float DepthNear = 9f, DepthFar = 28f;     // behind the lane (z), so the back hill partly hides them
        const float Spread = 46f;                        // across the view, metres along x
        const float HeightAboveCamera = 6f;
        const float DayStrength = 0.055f;                // additive, in linear HDR before tonemapping
        const float LowSunBoost = 1.4f;                  // dawn and dusk shafts read stronger
        const float SnowDim = 0.5f;                      // falling snow scatters the beams

        static Material _material;

        Mesh _mesh;
        Vector3[] _verts;
        Color[] _cols;
        MeshRenderer _renderer;

        static Material SharedMaterial()
        {
            if (_material != null) return _material;
            var sh = Shader.Find("MixerMad/SoftParticle");
            if (sh == null) { Debug.LogWarning("[MixerMad] LightShafts: SoftParticle shader missing; shafts off."); return null; }
            _material = MMMaterials.ConfigureParticle(new Material(sh) { name = "FX_LightShafts" }, true);
            _material.SetFloat("_Edge", 1f);          // all edge: a long soft falloff, no hard rim
            _material.SetFloat("_NearFade", 0.5f);
            return _material;
        }

        void Start()
        {
            var mat = SharedMaterial();
            if (mat == null) { enabled = false; return; }
            var go = new GameObject("LightShaftCards");
            go.transform.SetParent(transform, false);
            _verts = new Vector3[Cards * 4];
            _cols = new Color[Cards * 4];
            var uv = new Vector2[Cards * 4];
            var tris = new int[Cards * 6];
            for (int c = 0; c < Cards; c++)
            {
                int v = c * 4, t = c * 6;
                uv[v] = new Vector2(0, 0); uv[v + 1] = new Vector2(1, 0); uv[v + 2] = new Vector2(0, 1); uv[v + 3] = new Vector2(1, 1);
                tris[t] = v; tris[t + 1] = v + 2; tris[t + 2] = v + 1; tris[t + 3] = v + 1; tris[t + 4] = v + 2; tris[t + 5] = v + 3;
            }
            _mesh = new Mesh { name = "LightShafts" };
            _mesh.MarkDynamic();
            _mesh.vertices = _verts; _mesh.colors = _cols; _mesh.uv = uv; _mesh.triangles = tris;
            go.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = go.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = mat;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.receiveShadows = false;
        }

        void OnDestroy() { if (_mesh != null) Destroy(_mesh); }

        /// <summary>Beam strength for a time of day: 0 at night, boosted when the sun is low.</summary>
        public static float Strength(float night01, float sunUp, float snow01)
        {
            float day = Mathf.Clamp01(1f - night01 * 1.6f);
            float low = Mathf.Lerp(LowSunBoost, 1f, Mathf.Clamp01(sunUp));
            return DayStrength * day * low * Mathf.Lerp(1f, SnowDim, Mathf.Clamp01(snow01));
        }

        void LateUpdate()
        {
            if (_mesh == null) return;
            var dn = DayNight.Instance;
            var cam = Camera.main;
            bool on = QualityPresets.Current.lightShafts && FeatureToggles.LightShafts && dn != null && dn.sun != null && cam != null;
            float strength = 0f;
            Vector3 toSun = Vector3.up;
            if (on)
            {
                toSun = -dn.sun.transform.forward;
                var w = Weather.Instance;
                float snow = w ? w.Intensity01 : 0f;
                strength = (w != null && w.kind == WeatherKind.Blizzard) ? 0f : Strength(dn.Night01, toSun.y, snow);   // no sun beams in a white-out
            }
            _renderer.enabled = strength > 0.001f;
            if (!_renderer.enabled) return;

            // beam direction as the camera sees it: down and away from the sun, in the x-y plane
            Vector2 down = -new Vector2(toSun.x, toSun.y).normalized;
            Vector3 along = new Vector3(down.x, down.y, 0f);
            Vector3 across = new Vector3(-down.y, down.x, 0f);
            Vector3 camPos = cam.transform.position;
            Color tint = dn.sun.color;
            for (int c = 0; c < Cards; c++)
            {
                float f = (c + 0.5f) / Cards;
                float x = camPos.x + (f - 0.5f) * Spread + Mathf.Sin(c * 2.3f) * 3f;
                float z = Mathf.Lerp(DepthNear, DepthFar, Mathf.Repeat(c * 0.618f, 1f));
                float w = Mathf.Lerp(CardWidthMin, CardWidthMax, Mathf.Repeat(c * 0.41f + 0.2f, 1f)) * 0.5f;
                // the card starts above the view and falls along the beam
                Vector3 top = new Vector3(x, camPos.y + HeightAboveCamera, z) - along * (CardLength * 0.15f);
                Vector3 bottom = top + along * CardLength;
                int v = c * 4;
                _verts[v] = top - across * w; _verts[v + 1] = top + across * w;
                _verts[v + 2] = bottom - across * w; _verts[v + 3] = bottom + across * w;
                float flicker = 0.75f + 0.25f * Mathf.Sin(ReviewClock.Now * 0.15f + c * 1.7f);   // slow breathing, no flashing
                Color col = tint * (strength * flicker); col.a = 1f;
                _cols[v] = _cols[v + 1] = _cols[v + 2] = _cols[v + 3] = col;
            }
            _mesh.vertices = _verts;
            _mesh.colors = _cols;
            _mesh.RecalculateBounds();
        }
    }
}
