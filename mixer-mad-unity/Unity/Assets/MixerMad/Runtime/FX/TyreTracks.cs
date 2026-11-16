using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Tyre tracks pressed into the snow: one TrackBuffer (max 64 segments) per wheel side, drawn as a single
    /// fading ribbon mesh a few millimetres above the road. Teleported clears every buffer (no strip from the
    /// crash spot to the respawn spot); TrackBuffer also refuses any join longer than MaxJoin as a second guard.
    /// Calm motion has no effect here (tracks do not move).
    /// </summary>
    [DefaultExecutionOrder(21)]
    public sealed class TyreTracks : MonoBehaviour
    {
        const float Width = 0.42f, Lift = 0.025f, WheelRadius = 0.5f;
        static readonly Color TrackColor = new Color(0.42f, 0.50f, 0.68f, 0.6f);

        SimDriver _sim; RoadBuilder _road; TruckRig _rig;
        readonly List<TrackBuffer> _buffers = new List<TrackBuffer>();
        Mesh _mesh;
        readonly List<Vector3> _v = new List<Vector3>(); readonly List<Color> _c = new List<Color>();
        readonly List<Vector2> _uv = new List<Vector2>(); readonly List<int> _t = new List<int>();
        float _clock;

        public IReadOnlyList<TrackBuffer> Buffers => _buffers;

        public void Init(Transform truck, SimDriver sim, RoadBuilder road)
        {
            _rig = TruckRig.Find(truck); _road = road;
            // camera side and far side tracks, one per wheel side
            for (int i = 0; i < _rig.wheelZ.Count; i++) _buffers.Add(new TrackBuffer());
            _mesh = new Mesh { name = "FX_TyreTracks" };
            _mesh.MarkDynamic();
            gameObject.AddComponent<MeshFilter>().sharedMesh = _mesh;
            var r = gameObject.AddComponent<MeshRenderer>();
            r.sharedMaterial = MMMaterials.Particle(false);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off; r.receiveShadows = false;
            Bind(sim);
        }

        void Bind(SimDriver sim)
        {
            if (_sim != null) _sim.Teleported -= OnTeleported;
            _sim = sim;
            if (_sim != null) _sim.Teleported += OnTeleported;
        }

        void OnDestroy() { Bind(null); if (_mesh) Destroy(_mesh); }

        internal void OnTeleported()
        {
            foreach (var b in _buffers) b.Clear();
            Rebuild();
        }

        void LateUpdate() { Tick(); }

        internal void Tick()
        {
            if (_sim == null) return;
            _clock += _sim.PresentationDelta;
            var s = _sim.Render;
            bool on = FxToggles.Tracks;
            for (int side = 0; side < _buffers.Count; side++)
            {
                var b = _buffers[side];
                if (!on) { b.Clear(); continue; }
                if (!s.grounded || s.crashed || s.wheelCount == 0) b.Lift();
                else b.Add(RearContact(s, _rig.wheelZ[side]), _clock);
                b.Expire(_clock);
            }
            Rebuild();
        }

        /// <summary>The rear wheel (sim index 0) leaves the track; the front one runs in it.</summary>
        Vector3 RearContact(SimSnapshot s, float z)
        {
            float a = s.chassisAngle;
            var p = s.wheelPos[0] - new Vector2(-Mathf.Sin(a), Mathf.Cos(a)) * WheelRadius;
            float y = _road != null ? Mathf.Max(p.y, _road.HeightAt(p.x, z)) : p.y;
            return new Vector3(p.x, y + Lift, z);
        }

        void Rebuild()
        {
            _v.Clear(); _c.Clear(); _uv.Clear(); _t.Clear();
            foreach (var b in _buffers)
            {
                for (int i = 0; i < b.Count; i++)
                {
                    var seg = b[i];
                    var col = TrackColor; col.a *= b.Fade(_clock - seg.born);
                    var side = new Vector3(0f, 0f, Width * 0.5f);
                    int o = _v.Count;
                    _v.Add(seg.a - side); _v.Add(seg.a + side); _v.Add(seg.b + side); _v.Add(seg.b - side);
                    for (int k = 0; k < 4; k++) { _c.Add(col); _uv.Add(new Vector2(0.5f, 0.5f)); }   // uv centre = full opacity in SoftParticle
                    _t.Add(o); _t.Add(o + 1); _t.Add(o + 2); _t.Add(o); _t.Add(o + 2); _t.Add(o + 3);
                }
            }
            _mesh.Clear();
            _mesh.SetVertices(_v); _mesh.SetColors(_c); _mesh.SetUVs(0, _uv); _mesh.SetTriangles(_t, 0);
            _mesh.RecalculateBounds();
        }
    }
}
