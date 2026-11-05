using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// HDR emitters on the truck so bloom has something to catch (L-MM-33):
    ///  - an amber cab beacon that blinks slowly (steady in Calm motion) by swapping two shared materials;
    ///  - headlamp glow discs that light up at dusk and night (DayNight.Night01).
    /// Glow sprites use the SoftParticle shader with an HDR tint. No instancing, no property blocks.
    /// </summary>
    [DefaultExecutionOrder(22)]
    public sealed class TruckEmissives : MonoBehaviour
    {
        public const float BlinkPeriod = 1.4f, BlinkOnFraction = 0.45f;
        public const float HeadlightNightOn = 0.2f;

        TruckRig _rig;
        MeshRenderer _beacon, _beaconGlow;
        GameObject _beaconRoot;
        readonly MeshRenderer[] _lamps = new MeshRenderer[2], _lampGlows = new MeshRenderer[2];
        Material _on, _off;
        float _t;

        public bool BeaconLit { get; private set; }
        public bool HeadlightsLit { get; private set; }

        /// <summary>Pure blink rule, unit tested: steady in Calm motion, otherwise on for the first part of each period.</summary>
        public static bool BlinkOn(float t, bool calm) => calm || Mathf.Repeat(t, BlinkPeriod) < BlinkPeriod * BlinkOnFraction;

        public void Init(Transform truck)
        {
            _rig = TruckRig.Find(truck);
            _on = MMMaterials.Get("FX_Beacon_On"); _off = MMMaterials.Get("FX_Beacon_Off");
            var quad = FxParticles.GlowQuad();

            // beacon: gold base + amber dome, parented to Body so it rides the suspension and the squash
            _beaconRoot = new GameObject("FX_Beacon");
            _beaconRoot.transform.SetParent(_rig.body, false);
            _beaconRoot.transform.position = _rig.RoofTop();
            _beaconRoot.transform.rotation = _rig.body.rotation;
            Unscale(_beaconRoot.transform);
            var baseMesh = ProcMesh.Cone(0.22f, 0.08f, 0.2f, 16);
            Child(_beaconRoot.transform, "Beacon_Base", baseMesh, MMMaterials.Get("FX_Gold"), Vector3.zero, Vector3.one);
            _beacon = Child(_beaconRoot.transform, "Beacon_Dome", ProcMesh.Sphere(0.17f, 8, 14), _on, new Vector3(0f, 0.14f, 0f), new Vector3(1f, 1.15f, 1f));
            _beaconGlow = Child(_beaconRoot.transform, "Beacon_Glow", quad, MMMaterials.ParticleTinted("FX_GlowAmber", new Color(2.4f, 1.3f, 0.25f, 0.55f), true), new Vector3(0f, 0.16f, -0.35f), Vector3.one * 1.5f);

            // headlamp glow discs on the Headlight_L/R sockets (camera side first)
            var lampMat = MMMaterials.Get("FX_Headlamp");
            var glowMat = MMMaterials.ParticleTinted("FX_GlowWarm", new Color(2.2f, 2.0f, 1.5f, 0.6f), true);
            var heads = new[] { _rig.headL, _rig.headR };
            for (int i = 0; i < 2; i++)
            {
                if (heads[i] == null) continue;
                var root = new GameObject("FX_Headlamp_" + i).transform;
                root.SetParent(heads[i], false);
                root.rotation = _rig.body.rotation;   // socket may be turned for the spot light; the glow faces the camera
                Unscale(root);
                _lamps[i] = Child(root, "Lamp", ProcMesh.Sphere(0.09f, 6, 10), lampMat, Vector3.zero, new Vector3(0.6f, 1f, 1f));
                _lampGlows[i] = Child(root, "Lamp_Glow", quad, glowMat, new Vector3(0.15f, 0f, -0.25f), Vector3.one * 0.85f);
            }
            Apply(true);
        }

        /// <summary>FBX nodes can carry an import scale: keep FX sizes in metres whatever the parent's scale.</summary>
        static void Unscale(Transform t)
        {
            var p = t.parent != null ? t.parent.lossyScale : Vector3.one;
            t.localScale = new Vector3(1f / Mathf.Max(1e-4f, p.x), 1f / Mathf.Max(1e-4f, p.y), 1f / Mathf.Max(1e-4f, p.z));
        }

        static MeshRenderer Child(Transform parent, string name, Mesh mesh, Material mat, Vector3 local, Vector3 scale)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = local; go.transform.localScale = scale;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return r;
        }

        void LateUpdate()
        {
            _t += ReviewClock.Delta;   // real time, held still for review stills
            Apply(false);
            // glow sprites face the camera (side-on camera looks along +z, so keep them upright in world space)
            if (_beaconGlow) _beaconGlow.transform.rotation = Quaternion.identity;
            foreach (var g in _lampGlows) if (g) g.transform.rotation = Quaternion.identity;
        }

        void Apply(bool force)
        {
            bool beaconOn = FxToggles.Beacon;
            if (_beaconRoot && _beaconRoot.activeSelf != beaconOn) _beaconRoot.SetActive(beaconOn);
            bool lit = beaconOn && BlinkOn(_t, MMSettings.CalmMotion);
            if (force || lit != BeaconLit)
            {
                BeaconLit = lit;
                if (_beacon) _beacon.sharedMaterial = lit ? _on : _off;
                if (_beaconGlow) _beaconGlow.enabled = lit;
            }
            var dn = DayNight.Instance;
            bool lamps = FxToggles.Headlights && dn != null && dn.Night01 > HeadlightNightOn;
            if (force || lamps != HeadlightsLit)
            {
                HeadlightsLit = lamps;
                for (int i = 0; i < 2; i++)
                {
                    if (_lamps[i]) _lamps[i].enabled = lamps;
                    if (_lampGlows[i]) _lampGlows[i].enabled = lamps;
                }
            }
        }
    }
}
