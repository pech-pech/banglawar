using UnityEngine;

namespace MixerMad.Game
{
    public enum WeatherKind { Clear, Snow, Blizzard }

    /// <summary>
    /// Snowfall, fog and icy-wet surfaces. A visual overlay only: the sim's weather values stay the gameplay
    /// truth and nothing here writes to the sim. The surface look runs through global shader values
    /// (_MM_Wetness, _MM_Snow) that SnowIce / ToyPlastic read, so every material reacts without per-object work.
    ///
    /// Particle layers (all Shuriken/CPU, budgets from QualityPresets):
    ///   near flakes  z -12..-2   (big, in front of the truck)
    ///   far flakes   z  3..45    (small, behind it, parallax)
    ///   mist         large slow soft puffs for blizzard / fog depth
    /// The rig follows the camera in x and y. Simulation speed follows slow-mo (flakes slow down with the world).
    /// </summary>
    [DefaultExecutionOrder(60)]
    [DisallowMultipleComponent]
    public sealed class Weather : MonoBehaviour
    {
        public static Weather Instance { get; private set; }

        public WeatherKind kind = WeatherKind.Snow;
        [Range(0f, 1f)] public float baseWetness = 0.45f;     // icy-wet pass
        public float clearFog = 0.0085f, snowFog = 0.014f, blizzardFog = 0.032f;
        public float snowCoverRate = 0.01f;                    // per second toward the target cover
        public Camera followCamera;

        public float Intensity01 { get; private set; }
        public float Wetness { get; private set; }
        public float SnowCover { get; private set; }

        ParticleSystem _near, _far, _mist;
        Transform _rig;
        float _intensity, _fog, _wind, _gust;

        void Awake()
        {
            Instance = this;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            BuildRig();
            _fog = FogFor(kind);
            _intensity = IntensityFor(kind);
            SnowCover = 0.35f * _intensity;
            Wetness = baseWetness;
            Push();
        }

        void OnDestroy() { if (Instance == this) Instance = null; }

        public void SetWeather(WeatherKind k) { kind = k; }

        float FogFor(WeatherKind k) => k == WeatherKind.Clear ? clearFog : k == WeatherKind.Snow ? snowFog : blizzardFog;
        static float IntensityFor(WeatherKind k) => k == WeatherKind.Clear ? 0f : k == WeatherKind.Snow ? 0.6f : 1f;

        // ------------------------------------------------------------------------------ rig
        void BuildRig()
        {
            var go = new GameObject("WeatherRig");
            go.transform.SetParent(transform, false);
            _rig = go.transform;
            _near = MakeLayer("Flakes_Near", new Vector3(0f, 0f, -7f), new Vector3(46f, 0.4f, 10f), 0.07f, 0.14f, 2.6f, 9f, false);
            _far = MakeLayer("Flakes_Far", new Vector3(0f, 0f, 24f), new Vector3(90f, 0.4f, 42f), 0.10f, 0.22f, 1.7f, 12f, false);
            _mist = MakeLayer("Mist", new Vector3(0f, -3f, 12f), new Vector3(90f, 8f, 30f), 5f, 12f, 0.25f, 22f, true);
        }

        ParticleSystem MakeLayer(string name, Vector3 center, Vector3 boxSize, float sMin, float sMax, float fall, float life, bool mist)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_rig, false);
            go.transform.localPosition = center + new Vector3(0, 12.5f, 0);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);

            var main = ps.main;
            main.loop = true; main.prewarm = true;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.startLifetime = life;
            main.startSpeed = 0f;
            main.startSize = new ParticleSystem.MinMaxCurve(sMin, sMax);
            main.startColor = mist ? new Color(1f, 1f, 1f, 0.06f) : new Color(1f, 1f, 1f, 0.9f);
            main.maxParticles = 4000;
            main.gravityModifier = 0f;
            main.startRotation = new ParticleSystem.MinMaxCurve(0f, 6.28f);

            var shape = ps.shape;
            shape.enabled = true; shape.shapeType = ParticleSystemShapeType.Box; shape.scale = boxSize;

            var vel = ps.velocityOverLifetime;
            vel.enabled = true; vel.space = ParticleSystemSimulationSpace.World;
            vel.x = new ParticleSystem.MinMaxCurve(-0.4f, 0.4f);
            vel.y = new ParticleSystem.MinMaxCurve(-fall * 1.15f, -fall * 0.85f);
            vel.z = new ParticleSystem.MinMaxCurve(0f, 0f);

            var noise = ps.noise;
            noise.enabled = true; noise.strength = mist ? 0.8f : 0.55f; noise.frequency = mist ? 0.05f : 0.25f; noise.scrollSpeed = 0.2f;

            var col = ps.colorOverLifetime;
            col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                      new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(1f, 0.08f), new GradientAlphaKey(1f, 0.85f), new GradientAlphaKey(0f, 1f) });
            col.color = g;

            var em = ps.emission; em.enabled = true; em.rateOverTime = 0f;

            var r = go.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Billboard;
            r.sharedMaterial = MMMaterials.Particle(false);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            r.sortingFudge = mist ? 5f : 0f;
            ps.Play();
            return ps;
        }

        // ------------------------------------------------------------------------------ update
        void Update()
        {
            var cam = followCamera ? followCamera : Camera.main;
            float dt = Time.unscaledDeltaTime;
            var sim = SimDriver.Instance;
            float speedScale = sim ? sim.SpeedScale : 1f;

            if (cam) _rig.position = new Vector3(cam.transform.position.x, cam.transform.position.y, 0f);

            // ease toward the weather's targets
            float tI = IntensityFor(kind);
            _intensity = MMMath.Damp(_intensity, tI, 1.5f, dt);
            _fog = MMMath.Damp(_fog, FogFor(kind), 2f, dt);
            _gust = Mathf.PerlinNoise(Time.unscaledTime * 0.12f, 3.7f);
            _wind = (kind == WeatherKind.Blizzard ? 5.5f : 1.2f) * (0.4f + _gust);
            SnowCover = Mathf.MoveTowards(SnowCover, Mathf.Clamp01(tI * 0.9f), snowCoverRate * dt);
            Wetness = MMMath.Damp(Wetness, baseWetness * (kind == WeatherKind.Clear ? 0.6f : 1f) + 0.15f * _intensity, 3f, dt);
            Intensity01 = _intensity;

            // budgets from the quality preset; Calm motion halves the particle counts (L-MM-4)
            var preset = QualityPresets.Current;
            float budget = preset.particleBudget * (MMSettings.CalmMotion ? 0.5f : 1f) * FeatureToggles.WeatherParticles;
            int nearN = Mathf.RoundToInt(budget * 0.25f * _intensity);
            int farN = Mathf.RoundToInt(budget * 0.55f * _intensity);
            SetRate(_near, nearN, 9f);
            SetRate(_far, farN, 12f);
            int mistN = Mathf.RoundToInt(preset.fogSheets * 3f * (0.25f + _intensity) * FeatureToggles.FogSheets);
            SetRate(_mist, mistN, 22f);

            // wind + gust push
            ApplyWind(_near, _wind, speedScale);
            ApplyWind(_far, _wind * 0.7f, speedScale);
            ApplyWind(_mist, _wind * 0.4f, speedScale);

            Push();
        }

        void SetRate(ParticleSystem ps, int live, float life)
        {
            var em = ps.emission;
            em.rateOverTime = Mathf.Max(0f, live / life);
            var main = ps.main;
            main.maxParticles = Mathf.Max(8, Mathf.RoundToInt(live * 1.25f) + 8);
        }

        void ApplyWind(ParticleSystem ps, float wind, float simSpeed)
        {
            var main = ps.main;
            main.simulationSpeed = Mathf.Max(0.0001f, simSpeed);    // flakes slow with the world in slow-mo, freeze on pause
            var vel = ps.velocityOverLifetime;
            vel.x = new ParticleSystem.MinMaxCurve(-wind * 0.5f - 0.3f, -wind * 0.5f + 0.3f);   // blowing toward -x: against the truck
        }

        /// <summary>Push the values every material reads. Cheap: three globals and the fog.</summary>
        void Push()
        {
            Shader.SetGlobalFloat("_MM_Wetness", Wetness);
            Shader.SetGlobalFloat("_MM_Snow", SnowCover);
            RenderSettings.fogDensity = _fog;
            var dn = DayNight.Instance;
            Color haze = dn ? dn.FogColor : new Color(0.85f, 0.9f, 0.96f);
            // blizzard whitens the haze
            RenderSettings.fogColor = Color.Lerp(haze, new Color(0.88f, 0.9f, 0.95f) * (dn ? dn.DayLight : 1f), kind == WeatherKind.Blizzard ? 0.4f : 0.1f);
        }
    }
}
