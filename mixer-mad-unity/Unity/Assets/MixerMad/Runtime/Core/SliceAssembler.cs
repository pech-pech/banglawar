using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace MixerMad.Game
{
    /// <summary>
    /// Builds the whole snowy-pass slice from code. ONE code path used by:
    ///   - the Editor one-click builder (MixerMad > Build Snowy Pass Scene), which saves the result as a scene,
    ///   - SliceBootstrap, so a blank scene with one empty GameObject also plays.
    /// Order matters (Awake runs when a component is added in play mode): input and slow-mo before SimDriver,
    /// the sun before DayNight, the planar camera before QualityPresets applies in Start.
    /// </summary>
    public static class SliceAssembler
    {
        public sealed class Result
        {
            public Camera camera; public Light sun; public SimDriver sim; public TruckView truck; public RoadBuilder road;
            public CameraRig rig; public Hud hud; public GarageStub garage; public QualityPresets quality;
        }

        /// <param name="truckPrefab">Optional Blender-made truck (FBX or prefab with the agreed node names). Null = primitive placeholder.</param>
        public static Result Assemble(Transform parent, GameObject truckPrefab = null)
        {
            var r = new Result();
            var world = new GameObject("MixerMad_Snowy_Pass").transform;
            world.SetParent(parent, false);

            // ---- light + camera
            var sunGo = new GameObject("Sun_Key");
            sunGo.transform.SetParent(world, false);
            r.sun = sunGo.AddComponent<Light>();
            r.sun.type = LightType.Directional; r.sun.shadows = LightShadows.Soft; r.sun.shadowStrength = 0.9f; r.sun.shadowBias = 0.03f; r.sun.shadowNormalBias = 0.6f;
            RenderSettings.sun = r.sun;

            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            camGo.transform.SetParent(world, false);
            r.camera = camGo.AddComponent<Camera>();
            camGo.AddComponent<AudioListener>();
            r.camera.clearFlags = CameraClearFlags.Skybox;
            r.camera.fieldOfView = CameraRig.Fov;
            var cd = r.camera.GetUniversalAdditionalCameraData();
            cd.renderPostProcessing = true;
            cd.requiresDepthOption = CameraOverrideOption.On;     // finish depth of field needs depth

            // ---- systems (order matters, see class comment)
            var sys = new GameObject("Systems");
            sys.transform.SetParent(world, false);
            var input = sys.AddComponent<InputReader>();
            var slow = sys.AddComponent<SlowMo>();
            r.sim = sys.AddComponent<SimDriver>();
            sys.AddComponent<DayNight>().sun = r.sun;
            var weather = sys.AddComponent<Weather>(); weather.followCamera = r.camera;
            r.quality = sys.AddComponent<QualityPresets>(); r.quality.mainCamera = r.camera;
            sys.AddComponent<PerfOverlay>();

            // ---- level: road mesh from the physics line, set dressing
            var backend = r.sim.Backend ?? BackendFactory.Create(false);
            var roadGo = new GameObject("Road");
            roadGo.transform.SetParent(world, false);
            r.road = roadGo.AddComponent<RoadBuilder>();
            r.road.roadMaterial = MMMaterials.Snow();
            r.road.debugLine = backend.RoadLine;
            // Visual line = physics line plus flat run-in / run-out so the set never ends in a void. Collision stays on the physics line.
            RoadPad.Extend(backend.RoadLine, backend.RoadSurface, 60f, 90f, out var vLine, out var vSurf);
            r.road.Build(vLine, vSurf);
            SnowyPassDecor.Build(world, r.road, vLine);
            RoadPad.FindIce(vLine, vSurf, out float iceX0, out float iceX1, out float iceY);

            // ---- truck
            GameObject truckGo;
            if (truckPrefab != null) { truckGo = Object.Instantiate(truckPrefab, world); truckGo.name = "Truck_Mixer"; FbxTruckAdapter.Prepare(truckGo); if (truckGo.GetComponent<TruckView>() == null) truckGo.AddComponent<TruckView>(); }
            else truckGo = PlaceholderTruckFactory.CreateMixer();
            truckGo.transform.SetParent(world, false);
            r.truck = truckGo.GetComponent<TruckView>();
            // contact blobs under every wheel (all presets) + a body blob when realtime shadows are off (replaces BlobShadow)
            var contact = new GameObject("ContactShadows").AddComponent<ContactShadows>(); contact.transform.SetParent(world, false); contact.truck = r.truck; contact.road = r.road;

            // ---- camera rig (Cinemachine)
            r.rig = CameraRig.Build(r.camera, world);
            FxInstaller.Install(world, r.truck, r.road, r.camera, r.sim);   // FX pack + living world (Runtime/FX)

            // ---- planar reflection for the frozen lake
            var pgo = new GameObject("PlanarReflection");
            pgo.transform.SetParent(world, false);
            var planar = pgo.AddComponent<PlanarReflection>(); planar.main = r.camera;
            planar.iceX0 = iceX0; planar.iceX1 = iceX1; planar.planeY = iceY;
            r.quality.planar = planar;

            // ---- UI
            r.hud = Hud.Build(world, input);
            r.garage = GarageStub.Build(world, r.rig, r.truck, input);
            r.hud.garage = r.garage;
            return r;
        }
    }

    /// <summary>Helpers that turn the physics line into the longer visual line and find the biggest flat ice run.</summary>
    public static class RoadPad
    {
        public static void Extend(Vector2[] line, byte[] surf, float before, float after, out Vector2[] outLine, out byte[] outSurf)
        {
            var l = new System.Collections.Generic.List<Vector2>(line.Length + 2);
            var s = new System.Collections.Generic.List<byte>(line.Length + 2);
            l.Add(new Vector2(line[0].x - before, line[0].y)); s.Add(0);
            for (int i = 0; i < line.Length; i++) { l.Add(line[i]); if (i < line.Length - 1) s.Add(surf != null && i < surf.Length ? surf[i] : (byte)0); }
            s.Add(0);
            var last = line[line.Length - 1];
            l.Add(new Vector2(last.x + after, last.y));
            outLine = l.ToArray(); outSurf = s.ToArray();
        }

        /// <summary>Longest run of ice segments that is flat within 0.15 m. x1 &lt;= x0 when there is none.</summary>
        public static void FindIce(Vector2[] line, byte[] surf, out float x0, out float x1, out float y)
        {
            x0 = x1 = y = 0f;
            int i = 0; float bestLen = 0f;
            while (i < surf.Length)
            {
                if (surf[i] != SnowyPassData.Ice) { i++; continue; }
                int j = i; float lo = line[i].y, hi = line[i].y;
                while (j < surf.Length && surf[j] == SnowyPassData.Ice)
                {
                    lo = Mathf.Min(lo, line[j + 1].y); hi = Mathf.Max(hi, line[j + 1].y);
                    if (hi - lo > 0.15f) break;
                    j++;
                }
                float len = line[Mathf.Min(j, line.Length - 1)].x - line[i].x;
                if (len > bestLen) { bestLen = len; x0 = line[i].x; x1 = line[Mathf.Min(j, line.Length - 1)].x; y = 0.5f * (lo + hi); }
                i = Mathf.Max(j, i + 1);
            }
        }
    }

    /// <summary>
    /// Put this on an empty GameObject in a blank scene to get the slice at runtime without the Editor builder.
    /// Also starts the headless benchmark when the player is launched with -mmBenchmark.
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public sealed class SliceBootstrap : MonoBehaviour
    {
        [Tooltip("Blender truck (Art/Models/Truck_Mixer.fbx). Empty = primitive placeholder.")]
        public GameObject truckPrefab;

        void Awake()
        {
            if (FindAnyObjectByType<SimDriver>() == null) SliceAssembler.Assemble(null, truckPrefab);
        }

        void Start()
        {
            if (BenchmarkRunner.Requested && FindAnyObjectByType<BenchmarkRunner>() == null)
                new GameObject("Benchmark").AddComponent<BenchmarkRunner>();
            else if (StillsRunner.Requested && FindAnyObjectByType<StillsRunner>() == null)
                new GameObject("Stills").AddComponent<StillsRunner>();
            else if (CrashRepro.Requested && FindAnyObjectByType<CrashRepro>() == null)
                new GameObject("CrashRepro").AddComponent<CrashRepro>();
        }
    }
}
