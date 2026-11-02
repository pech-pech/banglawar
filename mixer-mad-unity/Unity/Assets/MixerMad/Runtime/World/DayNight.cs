using System;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Dawn / day / dusk / night for the snowy pass. One cycle = dayLengthSeconds (default 12 min, "admin default").
    /// Drives: the key light (colour, intensity, direction), tri-light ambient, fog colour, the sky material,
    /// and the shader globals _MM_DayLight / _MM_SunDir. Reads nothing from the sim; writes nothing to it.
    /// The key stays a warm light from the upper right at day (contract section 6); at night it becomes a cool moon.
    /// </summary>
    [DefaultExecutionOrder(-50)]
    [DisallowMultipleComponent]
    public sealed class DayNight : MonoBehaviour
    {
        public static DayNight Instance { get; private set; }

        public Light sun;
        public Material skyMaterial;
        [Min(30f)] public float dayLengthSeconds = 720f;
        [Range(0f, 1f)] public float time01 = 0.22f;       // starts in the morning
        public bool autoAdvance = true;
        [Tooltip("Low preset steps the cycle instead of smooth blending.")]
        public bool smooth = true;

        public float Night01 { get; private set; }
        public float DayLight { get; private set; } = 1f;
        public Color FogColor { get; private set; } = Color.white;
        public string Phase { get; private set; } = "Day";
        public event Action<string> PhaseChanged;

        struct Key
        {
            public float t, night, elev; public Color sunCol; public float intensity;
            public Color skyTop, skyHorizon, skyBottom, ambSky, ambEq, ambGround, fog, disc; public float stars, clouds;
        }

        static Color C(string h) { ColorUtility.TryParseHtmlString(h, out var c); return c; }

        // Snowy mountain pass: lilac-blue dawn / crisp white day / pink alpenglow dusk / navy night (S1 table).
        static readonly Key[] Keys =
        {
            new Key{ t=0.00f, night=0.35f, elev=7,  sunCol=C("#ffb9cf"), intensity=0.95f, skyTop=C("#6f78c4"), skyHorizon=C("#f2b7d2"), skyBottom=C("#a9a6d6"), ambSky=C("#9aa2de"), ambEq=C("#c9bcdc"), ambGround=C("#8f93b8"), fog=C("#c9bfe0"), disc=C("#fff0d0"), stars=0.2f, clouds=0.5f },
            new Key{ t=0.12f, night=0.00f, elev=34, sunCol=C("#fff1dc"), intensity=1.35f, skyTop=C("#4f8fe0"), skyHorizon=C("#d6ecff"), skyBottom=C("#c4d8f0"), ambSky=C("#a8c8f4"), ambEq=C("#dfe9f6"), ambGround=C("#a9b8d0"), fog=C("#dbe9f7"), disc=C("#fffbe8"), stars=0f, clouds=0.45f },
            new Key{ t=0.30f, night=0.00f, elev=62, sunCol=C("#fffaf0"), intensity=1.55f, skyTop=C("#3f86e6"), skyHorizon=C("#cfe8ff"), skyBottom=C("#bfd6f2"), ambSky=C("#a4c6f6"), ambEq=C("#e2ecf8"), ambGround=C("#aab9d2"), fog=C("#d9e8f8"), disc=C("#ffffff"), stars=0f, clouds=0.4f },
            new Key{ t=0.50f, night=0.00f, elev=38, sunCol=C("#fff0d8"), intensity=1.4f, skyTop=C("#4a86d8"), skyHorizon=C("#d8e8fa"), skyBottom=C("#c2d3ea"), ambSky=C("#a8c4ee"), ambEq=C("#e0e6f2"), ambGround=C("#a8b2c8"), fog=C("#dae3f2"), disc=C("#fffbe8"), stars=0f, clouds=0.5f },
            new Key{ t=0.62f, night=0.25f, elev=7,  sunCol=C("#ff8a60"), intensity=1.05f, skyTop=C("#5a5fb8"), skyHorizon=C("#ff9d78"), skyBottom=C("#b88aa8"), ambSky=C("#9a8cc8"), ambEq=C("#e0a898"), ambGround=C("#7e7a9c"), fog=C("#e6b0a8"), disc=C("#ffd8a0"), stars=0.1f, clouds=0.55f },
            new Key{ t=0.72f, night=0.75f, elev=8,  sunCol=C("#7a6cc8"), intensity=0.55f, skyTop=C("#222a62"), skyHorizon=C("#6a5aa8"), skyBottom=C("#3a3c78"), ambSky=C("#5a64b0"), ambEq=C("#6a6aa8"), ambGround=C("#444878"), fog=C("#4c4c88"), disc=C("#dfe6ff"), stars=0.7f, clouds=0.4f },
            new Key{ t=0.80f, night=1.00f, elev=38, sunCol=C("#7f98e8"), intensity=0.62f, skyTop=C("#0d1740"), skyHorizon=C("#27407a"), skyBottom=C("#1a2850"), ambSky=C("#4c64b4"), ambEq=C("#5870b0"), ambGround=C("#34467c"), fog=C("#26386a"), disc=C("#e8efff"), stars=1f, clouds=0.3f },
            new Key{ t=0.93f, night=1.00f, elev=26, sunCol=C("#7088e0"), intensity=0.55f, skyTop=C("#0a1236"), skyHorizon=C("#22386e"), skyBottom=C("#16224a"), ambSky=C("#44589f"), ambEq=C("#4e64a4"), ambGround=C("#30406f"), fog=C("#223260"), disc=C("#e0e8ff"), stars=1f, clouds=0.3f },
        };

        float _gi;
        string _lastPhase;

        void Awake()
        {
            Instance = this;
            if (sun == null) sun = FindAnyObjectByType<Light>();
            if (skyMaterial == null) skyMaterial = MMMaterials.Sky();
            RenderSettings.skybox = skyMaterial;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.sun = sun;
            RenderSettings.defaultReflectionMode = UnityEngine.Rendering.DefaultReflectionMode.Skybox;
            Evaluate(true);
        }

        /// <summary>Editor: apply the lighting once without entering play mode.</summary>
        public void Preview() { Awake(); }

        void OnDestroy() { if (Instance == this) Instance = null; }

        void Update()
        {
            if (autoAdvance && SimDriver.Instance != null && !SimDriver.Instance.Paused)
                time01 = Mathf.Repeat(time01 + Time.unscaledDeltaTime / dayLengthSeconds, 1f);   // real time, not slowed by slow-mo
            Evaluate(false);
        }

        public void SetTime(float t01) { time01 = Mathf.Repeat(t01, 1f); Evaluate(true); }

        static Key Lerp(Key a, Key b, float f)
        {
            return new Key
            {
                t = Mathf.Lerp(a.t, b.t, f), night = Mathf.Lerp(a.night, b.night, f), elev = Mathf.Lerp(a.elev, b.elev, f),
                sunCol = Color.Lerp(a.sunCol, b.sunCol, f), intensity = Mathf.Lerp(a.intensity, b.intensity, f),
                skyTop = Color.Lerp(a.skyTop, b.skyTop, f), skyHorizon = Color.Lerp(a.skyHorizon, b.skyHorizon, f), skyBottom = Color.Lerp(a.skyBottom, b.skyBottom, f),
                ambSky = Color.Lerp(a.ambSky, b.ambSky, f), ambEq = Color.Lerp(a.ambEq, b.ambEq, f), ambGround = Color.Lerp(a.ambGround, b.ambGround, f),
                fog = Color.Lerp(a.fog, b.fog, f), disc = Color.Lerp(a.disc, b.disc, f), stars = Mathf.Lerp(a.stars, b.stars, f), clouds = Mathf.Lerp(a.clouds, b.clouds, f)
            };
        }

        Key Sample(float t)
        {
            if (!smooth) t = Mathf.Floor(t * 48f) / 48f;
            int n = Keys.Length;
            for (int i = 0; i < n; i++)
            {
                Key a = Keys[i];
                Key b = Keys[(i + 1) % n];
                float tb = i == n - 1 ? 1f + Keys[0].t : b.t;
                float ta = a.t;
                float tt = (i == n - 1 && t < ta) ? t + 1f : t;
                if (tt >= ta && tt <= tb)
                {
                    float f = Mathf.InverseLerp(ta, tb, tt);
                    return Lerp(a, b, MMMath.SmoothStep01(f));
                }
            }
            return Keys[0];
        }

        void Evaluate(bool force)
        {
            Key k = Sample(time01);
            Night01 = k.night;
            DayLight = Mathf.Lerp(1f, 0.3f, Mathf.Clamp01(k.night));

            // sun arc (t 0..0.70) then moon arc (0.70..1.0): from the right side of the sky to the left, always front-lit
            bool moon = time01 >= 0.70f || time01 < 0.0f;
            float u = moon ? Mathf.InverseLerp(0.70f, 1.0f, time01) : Mathf.InverseLerp(0.0f, 0.70f, time01);
            float elev = Mathf.Deg2Rad * k.elev;
            float x = Mathf.Lerp(0.9f, -0.9f, u) * Mathf.Cos(elev);
            Vector3 toSun = new Vector3(x, Mathf.Sin(elev), -0.55f * Mathf.Cos(elev)).normalized;
            if (sun)
            {
                sun.transform.rotation = Quaternion.LookRotation(-toSun, Vector3.up);
                sun.color = k.sunCol;
                sun.intensity = k.intensity;
                sun.shadows = QualityPresets.SoftShadowsOn ? LightShadows.Soft : LightShadows.Hard;
            }

            RenderSettings.ambientSkyColor = k.ambSky;
            RenderSettings.ambientEquatorColor = k.ambEq;
            RenderSettings.ambientGroundColor = k.ambGround;
            FogColor = k.fog;

            if (skyMaterial)
            {
                skyMaterial.SetColor("_TopColor", k.skyTop);
                skyMaterial.SetColor("_HorizonColor", k.skyHorizon);
                skyMaterial.SetColor("_BottomColor", k.skyBottom);
                skyMaterial.SetColor("_SunColor", k.disc);
                skyMaterial.SetFloat("_StarStrength", k.stars);
                skyMaterial.SetFloat("_CloudAmount", k.clouds);
                skyMaterial.SetColor("_CloudColor", Color.Lerp(Color.white, k.skyHorizon, 0.35f));
            }
            Shader.SetGlobalFloat("_MM_DayLight", DayLight);
            Shader.SetGlobalVector("_MM_SunDir", new Vector4(toSun.x, toSun.y, toSun.z, 0f));

            // reflection probe (default skybox probe) refreshed slowly: it is not free
            _gi += Time.unscaledDeltaTime;
            if (force || _gi > 5f) { _gi = 0f; DynamicGI.UpdateEnvironment(); }

            string phase = time01 < 0.06f || time01 >= 0.96f ? "Dawn" : time01 < 0.56f ? "Day" : time01 < 0.68f ? "Dusk" : "Night";
            if (phase != _lastPhase) { _lastPhase = phase; Phase = phase; PhaseChanged?.Invoke(phase); }
        }
    }
}
