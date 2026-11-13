using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Finds the FX sockets on the truck by node name at runtime (works for the Blender FBX and the placeholder):
    /// Body, Chute, Headlight_L/R, and the z of each wheel side (from Wheel_* nodes). Read only.
    /// </summary>
    public sealed class TruckRig
    {
        /// <summary>Cab roof on the Blender truck, in Body space (agreed with the DRIVER workstream).</summary>
        public static readonly Vector3 CabRoofLocal = new Vector3(1.0f, 2.38f, 0f);
        /// <summary>Exhaust stack outlet behind the cab, Body space (no node in the FBX yet).</summary>
        public static readonly Vector3 ExhaustLocal = new Vector3(0.35f, 2.5f, -0.55f);   // camera side, just behind the cab

        public Transform root, body, chute, headL, headR, cabRoof;
        public readonly List<float> wheelZ = new List<float>();

        public static TruckRig Find(Transform truck)
        {
            var r = new TruckRig { root = truck };
            if (truck == null) return r;
            r.body = Deep(truck, "Body") ?? truck;
            r.chute = Deep(truck, "Chute");
            r.headL = Deep(truck, "Headlight_L");
            r.headR = Deep(truck, "Headlight_R");
            r.cabRoof = Deep(truck, "Cab_Roof");   // placeholder only
            foreach (var t in truck.GetComponentsInChildren<Transform>(true))
            {
                if (!t.name.StartsWith("Wheel_") || t.name.Contains(".")) continue;
                float z = truck.InverseTransformPoint(t.position).z;
                bool known = false;
                foreach (var w in r.wheelZ) if (Mathf.Abs(w - z) < 0.2f) known = true;
                if (!known) r.wheelZ.Add(z);
            }
            if (r.wheelZ.Count == 0) { r.wheelZ.Add(-0.75f); r.wheelZ.Add(0.75f); }
            r.wheelZ.Sort();   // [0] = camera side (most negative z)
            return r;
        }

        /// <summary>World point on top of the cab roof (beacon socket).</summary>
        public Vector3 RoofTop()
        {
            if (cabRoof != null && cabRoof.TryGetComponent<Renderer>(out var rr))
            {
                var b = rr.bounds; return new Vector3(b.center.x, b.max.y, b.center.z);
            }
            return body != null ? body.TransformPoint(CabRoofLocal) : Vector3.zero;
        }

        public Vector3 Exhaust() => body != null ? body.TransformPoint(ExhaustLocal) : Vector3.zero;

        static Transform Deep(Transform t, string n)
        {
            if (t.name == n) return t;
            for (int i = 0; i < t.childCount; i++) { var f = Deep(t.GetChild(i), n); if (f) return f; }
            return null;
        }
    }
}
