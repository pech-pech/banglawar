using System;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace MixerMad.Game
{
    /// <summary>One row of the S2 preset table. All numbers are targets until measured with PerfOverlay.</summary>
    [Serializable]
    public struct Preset
    {
        public string name;
        public float renderScale;       // of native: 0.5 / 0.67 / 0.8 / 1.0
        public bool hdr;
        public int msaa;                // 1, 2, 4
        public bool fxaa;               // post AA when MSAA is off
        public int shadowCascades;      // 0 = blob shadows only
        public int shadowRes;
        public float shadowDistance;
        public bool softShadows;
        public bool bloom;
        public bool bloomHighQuality;
        public int dof;                 // 0 fake, 1 Gaussian on finish, 2 Bokeh on finish
        public int planar;              // 0 off, 1 every 2nd frame, 2 every frame
        public float planarScale;
        public int fogSheets;           // 0..4
        public bool lightShafts;
        public int particleBudget;      // live particles
        public bool ssao;
        public int targetFps;
        public bool smoothDayNight;
        public bool outline;
    }

    /// <summary>Per-feature kill switches so one build answers "what does each thing cost". 1 = on.</summary>
    public static class FeatureToggles
    {
        public static bool Shadows = true, Bloom = true, Dof = true, Planar = true, Outline = true, PostProcess = true;
        public static bool Ssao = true, LightShafts = true, ContactShadows = true;
        public static float WeatherParticles = 1f, FogSheets = 1f;
        public static event Action Changed;
        /// <summary>Also tells the FX listeners, so one call covers every flag the stills and benchmark switch.</summary>
        public static void Notify() { Changed?.Invoke(); FxToggles.Notify(); }

        /// <summary>
        /// `-mmOff ssao,shafts,contact,shadows` on the command line switches lighting features off for on/off still
        /// pairs (L-MM-33). Unknown names are reported, never guessed.
        /// </summary>
        public static void ApplyCommandLine(string[] args)
        {
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] != "-mmOff") continue;
                foreach (var raw in args[i + 1].Split(','))
                {
                    switch (raw.Trim().ToLowerInvariant())
                    {
                        case "ssao": Ssao = false; break;
                        case "shafts": LightShafts = false; break;
                        case "contact": ContactShadows = false; break;
                        case "shadows": Shadows = false; break;
                        case "": break;
                        default: UnityEngine.Debug.LogWarning("[MixerMad] -mmOff: unknown feature " + raw); break;
                    }
                }
            }
        }
    }

    /// <summary>
    /// Low / Medium / High / Ultra. Render scale 0.5 / 0.67 / 0.8 / 1.0. High = 60 fps default (user answer).
    /// Applies: URP asset values (on a runtime CLONE so the asset on disk is never modified), vsync/fps cap,
    /// a global post-process Volume (bloom, tonemap, vignette, grade), a separate finish-only DoF Volume,
    /// the planar-reflection camera, camera AA, and the shader outline toggle.
    /// </summary>
    [DefaultExecutionOrder(-200)]
    [DisallowMultipleComponent]
    public sealed class QualityPresets : MonoBehaviour
    {
        public static QualityPresets Instance { get; private set; }
        /// <summary>Soft (true) or hard main-light shadows for the active preset; DayNight reads it.</summary>
        public static bool SoftShadowsOn { get; private set; } = true;

        public static readonly Preset[] Table =
        {
            new Preset{ name="Low",    renderScale=0.50f, hdr=false, msaa=1, fxaa=true,  shadowCascades=0, shadowRes=512,  shadowDistance=0f,  softShadows=false, bloom=false, bloomHighQuality=false, dof=0, planar=0, planarScale=0f,    fogSheets=0, lightShafts=false, particleBudget=300,   ssao=false, targetFps=60, smoothDayNight=false, outline=true },
            new Preset{ name="Medium", renderScale=0.67f, hdr=false, msaa=2, fxaa=false, shadowCascades=1, shadowRes=1024, shadowDistance=55f, softShadows=false, bloom=false, bloomHighQuality=false, dof=0, planar=0, planarScale=0f,    fogSheets=2, lightShafts=false, particleBudget=1500,  ssao=false, targetFps=60, smoothDayNight=true,  outline=true },
            new Preset{ name="High",   renderScale=0.80f, hdr=true,  msaa=2, fxaa=false, shadowCascades=2, shadowRes=2048, shadowDistance=55f, softShadows=true , bloom=true,  bloomHighQuality=false, dof=1, planar=1, planarScale=0.25f, fogSheets=3, lightShafts=true,  particleBudget=4000,  ssao=false, targetFps=60, smoothDayNight=true,  outline=true },
            new Preset{ name="Ultra",  renderScale=1.00f, hdr=true,  msaa=4, fxaa=false, shadowCascades=3, shadowRes=4096, shadowDistance=55f, softShadows=true,  bloom=true,  bloomHighQuality=true,  dof=2, planar=2, planarScale=0.35f, fogSheets=4, lightShafts=true,  particleBudget=30000, ssao=true,  targetFps=45, smoothDayNight=true,  outline=true },
        };

        public static Preset Current { get; private set; } = Table[(int)QualityLevel.High];

        // ---- exposure and grade (L-MM-28): Neutral tonemapping rolls lit snow off below the clip point, so exposure
        // can stay a little up (+0.4 EV) and snow still reads bright white-blue instead of grey. Tuned on the built
        // app's stills with tools/still_metrics.py (day stills clip <= 3%, lit snow ~235-253).
        const float PostExposureEv = 0.4f, GradeContrast = 12f, GradeSaturation = 14f;
        const float BloomThreshold = 1.0f, BloomIntensity = 0.55f;   // only HDR emitters (beacon, lamps, gold) pass 1.0 after exposure
        // ---- cascade splits (share of shadowDistance): the lane (~31.7 m of 55 m) sits in the sharpest cascade
        const float Cascade2Split = 0.72f;
        static readonly Vector2 Cascade3Split = new Vector2(0.45f, 0.8f);
        public static event Action<Preset> Applied;

        public Camera mainCamera;
        public PlanarReflection planar;
        public Volume postVolume, dofVolume;
        [Range(0f, 1f)] public float finishDof;

        UniversalRenderPipelineAsset _clone;
        ScriptableRendererFeature _ssaoFeature; bool _ssaoWasActive;
        Bloom _bloom; Tonemapping _tone; Vignette _vig; ColorAdjustments _grade; DepthOfField _dof;
        QualityLevel _level = QualityLevel.High;

        void Awake()
        {
            Instance = this;
            if (mainCamera == null) mainCamera = Camera.main;
            FeatureToggles.ApplyCommandLine(Environment.GetCommandLineArgs());
            EnsureVolumes();
            MMSettings.Changed += OnSettingsChanged;
            FeatureToggles.Changed += Reapply;
        }

        void Start() { Apply(MMSettings.Quality); }

        void OnDestroy()
        {
            MMSettings.Changed -= OnSettingsChanged;
            FeatureToggles.Changed -= Reapply;
            if (Instance == this) Instance = null;
            if (_clone != null) Destroy(_clone);
            if (_ssaoFeature != null) _ssaoFeature.SetActive(_ssaoWasActive);   // never leave the shared renderer asset changed
        }

        void OnSettingsChanged() { if (MMSettings.Quality != _level) Apply(MMSettings.Quality); }
        public void Reapply() { Apply(_level); }

        public void SetLevel(QualityLevel level) { MMSettings.Quality = level; Apply(level); }

        void EnsureVolumes()
        {
            if (postVolume == null)
            {
                var go = new GameObject("PostVolume");
                go.transform.SetParent(transform, false);
                postVolume = go.AddComponent<Volume>();
                postVolume.isGlobal = true; postVolume.priority = 1f;
                var p = ScriptableObject.CreateInstance<VolumeProfile>();
                _bloom = p.Add<Bloom>(true);
                _tone = p.Add<Tonemapping>(true);
                _vig = p.Add<Vignette>(true);
                _grade = p.Add<ColorAdjustments>(true);
                postVolume.sharedProfile = p;
            }
            if (dofVolume == null)
            {
                var go = new GameObject("FinishDofVolume");
                go.transform.SetParent(transform, false);
                dofVolume = go.AddComponent<Volume>();
                dofVolume.isGlobal = true; dofVolume.priority = 2f; dofVolume.weight = 0f;
                var p = ScriptableObject.CreateInstance<VolumeProfile>();
                _dof = p.Add<DepthOfField>(true);
                dofVolume.sharedProfile = p;
            }
        }

        public void Apply(QualityLevel level)
        {
            _level = level;
            Preset p = Table[(int)level];
            Current = p;

            // ---- frame pacing
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = p.targetFps;

            // ---- URP asset (clone, never edit the disk asset)
            if (_clone == null)
            {
                var src = UniversalRenderPipeline.asset;
                if (src != null) { _clone = Instantiate(src); _clone.name = "MM_URP_Runtime"; QualitySettings.renderPipeline = _clone; }
            }
            if (_clone != null)
            {
                _clone.renderScale = p.renderScale;
                _clone.supportsHDR = p.hdr;
                _clone.msaaSampleCount = p.msaa;
                _clone.shadowCascadeCount = Mathf.Max(1, p.shadowCascades);
                _clone.cascade2Split = Cascade2Split;
                _clone.cascade3Split = Cascade3Split;
                _clone.mainLightShadowmapResolution = p.shadowRes;
                // URP 17.6: supportsSoftShadows has an internal setter. Soft vs hard is chosen per light instead
                // (the build asset keeps soft shadows supported so the variants are not stripped).
                SoftShadowsOn = p.softShadows;
                if (RenderSettings.sun != null && RenderSettings.sun.shadows != LightShadows.None)
                    RenderSettings.sun.shadows = p.softShadows ? LightShadows.Soft : LightShadows.Hard;
                _clone.shadowDistance = (p.shadowCascades > 0 && FeatureToggles.Shadows) ? p.shadowDistance : 0f;   // 0 = shadows off, blob shadows take over
            }

            // ---- camera
            if (mainCamera != null)
            {
                var data = mainCamera.GetUniversalAdditionalCameraData();
                data.renderPostProcessing = FeatureToggles.PostProcess;
                data.antialiasing = p.fxaa ? AntialiasingMode.FastApproximateAntialiasing : AntialiasingMode.None;
                data.renderShadows = p.shadowCascades > 0 && FeatureToggles.Shadows;
            }

            // ---- post stack
            bool bloomOn = p.bloom && FeatureToggles.Bloom;
            _bloom.active = bloomOn;
            _bloom.intensity.Override(BloomIntensity);
            _bloom.threshold.Override(BloomThreshold);
            _bloom.scatter.Override(0.65f);
            _bloom.highQualityFiltering.Override(p.bloomHighQuality);
            _tone.mode.Override(TonemappingMode.Neutral);
            _vig.intensity.Override(0.18f); _vig.smoothness.Override(0.45f);
            _grade.saturation.Override(GradeSaturation); _grade.contrast.Override(GradeContrast); _grade.postExposure.Override(PostExposureEv);
            _grade.colorFilter.Override(Color.white);

            // ---- DoF: finish only. High Gaussian, Ultra Bokeh. Low/Medium would fake it with a blurred layer (not in this slice).
            _dof.active = p.dof > 0 && FeatureToggles.Dof;
            if (p.dof == 2)
            {
                _dof.mode.Override(DepthOfFieldMode.Bokeh);
                _dof.focusDistance.Override(31f); _dof.aperture.Override(5.6f); _dof.focalLength.Override(50f);
            }
            else
            {
                _dof.mode.Override(DepthOfFieldMode.Gaussian);
                _dof.gaussianStart.Override(34f); _dof.gaussianEnd.Override(70f); _dof.gaussianMaxRadius.Override(1.2f);
                _dof.highQualitySampling.Override(false);
            }

            // ---- SSAO (Ultra): the URP renderer feature that ProjectSetup adds (active on disk so the build keeps its shader), switched here
            ApplySsao(p.ssao && FeatureToggles.Ssao && FeatureToggles.PostProcess);

            // ---- planar reflections (frozen lake), outline, day-night stepping
            if (planar != null) planar.Configure(FeatureToggles.Planar ? p.planar : 0, p.planarScale);
            Shader.SetGlobalFloat("_MM_OutlineOn", (p.outline && FeatureToggles.Outline) ? 1f : 0f);
            if (DayNight.Instance != null) DayNight.Instance.smooth = p.smoothDayNight;

            Applied?.Invoke(p);
        }

        void ApplySsao(bool on)
        {
            if (_ssaoFeature == null && _clone != null)
            {
                foreach (var data in _clone.rendererDataList)
                {
                    if (data == null) continue;
                    foreach (var f in data.rendererFeatures)
                        if (f is ScreenSpaceAmbientOcclusion) { _ssaoFeature = f; _ssaoWasActive = f.isActive; break; }
                    if (_ssaoFeature != null) break;
                }
                if (_ssaoFeature == null && on) Debug.LogWarning("[MixerMad] SSAO asked for but the renderer has no SSAO feature (run MixerMad > 1. Apply Project Setup).");
            }
            if (_ssaoFeature != null && _ssaoFeature.isActive != on) _ssaoFeature.SetActive(on);
        }

        void Update()
        {
            if (dofVolume != null) dofVolume.weight = Mathf.MoveTowards(dofVolume.weight, finishDof, Time.unscaledDeltaTime / 0.3f);
        }

        /// <summary>Called by the finish camera: fades depth of field in over 0.3 s (Calm motion keeps it off).</summary>
        public void SetFocusDistance(float metres) { if (_dof != null) _dof.focusDistance.Override(metres); }

        public void SetFinishDof(float w01) { finishDof = MMSettings.CalmMotion ? 0f : Mathf.Clamp01(w01); }

        /// <summary>Finish camera with a moving focus: Bokeh focuses at focusMetres, the Gaussian blur starts at blurStartMetres
        /// (just behind the truck) and is full 25 m further back. Added by the LEVEL/CAMERA workstream (D8).</summary>
        public void SetFinishDof(float w01, float focusMetres, float blurStartMetres)
        {
            SetFinishDof(w01); SetFocusDistance(focusMetres);
            if (_dof != null) { _dof.gaussianStart.Override(blurStartMetres); _dof.gaussianEnd.Override(blurStartMetres + 25f); }
        }
    }
}
