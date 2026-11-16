using System;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Dawn / day / dusk / night for the snowy pass. One cycle = dayLengthSeconds (default 12 min, "admin default").
    /// Drives: the key light (colour, intensity, direction), tri-light ambient, fog colour, the sky material,
    /// and the shader globals _MM_DayLight / _MM_SunDir. Reads nothing from the sim; writes nothing to it.
    /// The key stays a warm light from the upper right at day (contract section 6); at night it becomes a cool moon.
    /// P2 polish (L-MM-30): the key sits BEHIND the scene and to the side (toSun.z > 0), so shadows fall toward
    /// the camera onto the road top and front lip. A soft shadowless fill from the camera side keeps the truck's
    /// visible face from going flat. `-mmTime 0..1` on the command line pins the time of day (review stills).
    /// </summary>
    [DefaultExecutionOrder(-50)]
    [DisallowMultipleComponent]
    public sealed class DayNight : MonoBehaviour
    {
        public static DayNight Instance { get; private set; }

        public Light sun;
        [Tooltip("Shadowless fill from the camera side; created at start when empty.")]
        public Light fill;
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

        // Snowy mountain pass: lilac-blue dawn / crisp day / pink alpenglow dusk / navy night (S1 table).
        // P2 polish (L-MM-28): the key is a little softer and the ambient a lot darker than P2, so lit snow sits
        // under the clip point and shade reads at least 1.3:1 against it at every time with a sun
        // (LightingTests.Shade_ReadsAgainstLitSnow_AtEveryTimeWithASun). Dawn and dusk keep the sun high enough
        // (10-12 deg) to throw a readable shadow; night is navy, dark enough for the cabin window to glow.
        static readonly Key[] Keys =
        {
            new Key{ t=0.00f, night=0.35f, elev=12, sunCol=C("#ffb9cf"), intensity=1.20f, skyTop=C("#6f78c4"), skyHorizon=C("#f2b7d2"), skyBottom=C("#a9a6d6"), ambSky=C("#6e76b0"), ambEq=C("#8c84a8"), ambGround=C("#5c6088"), fog=C("#b8b0d4"), disc=C("#fff0d0"), stars=0.2f, clouds=0.5f },
            new Key{ t=0.12f, night=0.00f, elev=34, sunCol=C("#fff1dc"), intensity=1.20f, skyTop=C("#4f8fe0"), skyHorizon=C("#d6ecff"), skyBottom=C("#c4d8f0"), ambSky=C("#86a6d8"), ambEq=C("#9fb0cc"), ambGround=C("#75839e"), fog=C("#c8d8ec"), disc=C("#fffbe8"), stars=0f, clouds=0.45f },
            new Key{ t=0.30f, night=0.00f, elev=55, sunCol=C("#fffaf0"), intensity=1.30f, skyTop=C("#3f86e6"), skyHorizon=C("#cfe8ff"), skyBottom=C("#bfd6f2"), ambSky=C("#88aadc"), ambEq=C("#a2b4ce"), ambGround=C("#7888a4"), fog=C("#c8daee"), disc=C("#ffffff"), stars=0f, clouds=0.4f },
            new Key{ t=0.50f, night=0.00f, elev=36, sunCol=C("#fff0d8"), intensity=1.25f, skyTop=C("#4a86d8"), skyHorizon=C("#d8e8fa"), skyBottom=C("#c2d3ea"), ambSky=C("#88a6d6"), ambEq=C("#a4b0c6"), ambGround=C("#76829c"), fog=C("#cad6ea"), disc=C("#fffbe8"), stars=0f, clouds=0.5f },
            new Key{ t=0.62f, night=0.25f, elev=11, sunCol=C("#ff8a60"), intensity=1.30f, skyTop=C("#5a5fb8"), skyHorizon=C("#ff9d78"), skyBottom=C("#b88aa8"), ambSky=C("#7a70ac"), ambEq=C("#a07c84"), ambGround=C("#5a5878"), fog=C("#d4a2a0"), disc=C("#ffd8a0"), stars=0.1f, clouds=0.55f },
            new Key{ t=0.72f, night=0.75f, elev=12, sunCol=C("#7a6cc8"), intensity=0.60f, skyTop=C("#222a62"), skyHorizon=C("#6a5aa8"), skyBottom=C("#3a3c78"), ambSky=C("#3e468a"), ambEq=C("#4e4e86"), ambGround=C("#30345c"), fog=C("#3e3e78"), disc=C("#dfe6ff"), stars=0.7f, clouds=0.4f },
            new Key{ t=0.80f, night=1.00f, elev=38, sunCol=C("#7f98e8"), intensity=0.55f, skyTop=C("#0d1740"), skyHorizon=C("#27407a"), skyBottom=C("#1a2850"), ambSky=C("#34488c"), ambEq=C("#3a4c84"), ambGround=C("#22305a"), fog=C("#1e2c5a"), disc=C("#e8efff"), stars=1f, clouds=0.3f },
            new Key{ t=0.93f, night=1.00f, elev=28, sunCol=C("#7088e0"), intensity=0.50f, skyTop=C("#0a1236"), skyHorizon=C("#22386e"), skyBottom=C("#16224a"), ambSky=C("#2e4080"), ambEq=C("#34467c"), ambGround=C("#1e2a52"), fog=C("#1a2852"), disc=C("#e0e8ff"), stars=1f, clouds=0.3f },
        };

        /// <summary>toSun.z per unit of horizontal sun: positive = the key sits behind the scene (shadows fall toward the camera).</summary>
        const float SunBehind = 0.85f;
        /// <summary>Fill strength as a share of the key (more when the sun is low and the scene is backlit), and how much of the sky colour it takes.</summary>
        const float FillShare = 0.38f, FillSkyTint = 0.6f, LowSunFill = 0.25f;
        /// <summary>Direction TOWARD the fill: from the camera side (-z), a little above, opposite the key's side.</summary>
        static readonly Vector3 FillFromCamera = new Vector3(0f, 0.45f, -1f);

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
            if (fill == null) fill = MakeFill(sun);
            if (GetComponent<LightShafts>() == null) gameObject.AddComponent<LightShafts>();
            ApplyTimePin();
            Evaluate(true);
        }

        static Light MakeFill(Light key)
        {
            var go = new GameObject("Fill_Camera");
            if (key != null) go.transform.SetParent(key.transform.parent, false);
            var l = go.AddComponent<Light>();
            l.type = LightType.Directional;
            l.shadows = LightShadows.None;
            return l;
        }

        /// <summary>`-mmTime 0..1` pins the time of day and stops the clock (stills at dawn, dusk and night).</summary>
        void ApplyTimePin()
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++)
            {
                if (a[i] != "-mmTime") continue;
                if (float.TryParse(a[i + 1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out float t))
                { time01 = Mathf.Repeat(t, 1f); autoAdvance = false; }
                else Debug.LogWarning("[MixerMad] -mmTime needs a number 0..1, got " + a[i + 1]);
            }
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

        static Key Sample(float t, bool smooth)
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

        /// <summary>
        /// Direction TOWARD the key light (sun by day, moon by night) at a time of day. The arc runs from the right
        /// of the sky to the left (sun t 0..0.70, moon 0.70..1).
        /// </summary>
        public static Vector3 SunDirection(float time01) => SunDirection(time01, Sample(time01, true).elev);

        static Vector3 SunDirection(float time01, float elevDeg)
        {
            bool moon = time01 >= 0.70f;
            float u = moon ? Mathf.InverseLerp(0.70f, 1.0f, time01) : Mathf.InverseLerp(0.0f, 0.70f, time01);
            float elev = Mathf.Deg2Rad * elevDeg;
            float x = Mathf.Lerp(0.9f, -0.9f, u) * Mathf.Cos(elev);
            return new Vector3(x, Mathf.Sin(elev), SunBehind * Mathf.Cos(elev)).normalized;
        }

        /// <summary>How "night" the sky is at a time of day, 0 (day) .. 1 (night).</summary>
        public static float NightAt(float time01) => Sample(time01, true).night;

        /// <summary>
        /// Model check for L-MM-28: lit level-ground snow vs the same snow in shadow, as a luminance ratio.
        /// Lit = key * cos(angle to the ground normal) + ambient sky; shade = ambient sky only.
        /// </summary>
        public static float GroundShadeContrast(float time01)
        {
            Key k = Sample(time01, true);
            float ndl = Mathf.Max(0f, SunDirection(time01).y);
            float key = k.intensity * Lum(k.sunCol) * ndl;
            float amb = Lum(k.ambSky);
            return (key + amb) / Mathf.Max(1e-4f, amb);
        }

        static float Lum(Color c) { Color l = c.linear; return 0.2126f * l.r + 0.7152f * l.g + 0.0722f * l.b; }

        void Evaluate(bool force)
        {
            Key k = Sample(time01, smooth);
            Night01 = k.night;
            DayLight = Mathf.Lerp(1f, 0.3f, Mathf.Clamp01(k.night));

            Vector3 toSun = SunDirection(time01, k.elev);
            if (sun)
            {
                sun.transform.rotation = Quaternion.LookRotation(-toSun, Vector3.up);
                sun.color = k.sunCol;
                sun.intensity = k.intensity;
                sun.shadows = QualityPresets.SoftShadowsOn ? LightShadows.Soft : LightShadows.Hard;
            }
            if (fill)
            {
                Vector3 toFill = new Vector3(-Mathf.Sign(toSun.x) * 0.35f, FillFromCamera.y, FillFromCamera.z).normalized;
                fill.transform.rotation = Quaternion.LookRotation(-toFill, Vector3.up);
                fill.color = Color.Lerp(k.sunCol, k.ambSky, FillSkyTint);
                fill.intensity = k.intensity * (FillShare + LowSunFill * (1f - Mathf.Clamp01(toSun.y)));
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
