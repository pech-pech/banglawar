using System.Text;
using UnityEditor;
using UnityEngine;

namespace MixerMad.Editor
{
    /// <summary>
    /// MixerMad > Check Truck FBX (also -executeMethod MixerMad.Editor.FbxTruckCheck.Run): prints where the
    /// Blender truck's key nodes land after import and checks the contract (cab toward +X, wheels at hub
    /// height 0.173 m, near side at -Z, upright body). Exit code 0 = pass, 5 = fail in batch mode.
    /// </summary>
    public static class FbxTruckCheck
    {
        const float HubY = 0.173f, Tol = 0.03f;

        [MenuItem("MixerMad/Check Truck FBX", priority = 30)]
        public static void Menu() { Check(); }

        public static void Run()
        {
            bool ok = Check();
            if (Application.isBatchMode) EditorApplication.Exit(ok ? 0 : 5);
        }

        static bool Check()
        {
            var fbx = AssetDatabase.LoadAssetAtPath<GameObject>(SceneBuilder.TruckFbx);
            if (fbx == null) { Debug.LogError("[MixerMad] no FBX at " + SceneBuilder.TruckFbx); return false; }
            var go = Object.Instantiate(fbx);
            try
            {
                var sb = new StringBuilder("[MixerMad] truck FBX check\n");
                bool ok = true;
                var asset = fbx.transform;
                sb.AppendFormat("asset root local rot {0}\n", asset.localRotation.eulerAngles);
                foreach (var t in go.GetComponentsInChildren<Transform>(true))
                {
                    var r = t.GetComponent<Renderer>();
                    sb.AppendFormat("  {0,-14} pos {1} rot {2}{3}\n", t.name, t.position.ToString("F3"), t.rotation.eulerAngles.ToString("F1"),
                        r ? " bounds " + r.bounds.min.ToString("F2") + ".." + r.bounds.max.ToString("F2") : "");
                }
                ok &= Expect(sb, "cab toward +X", Center(go, "Cab_Mesh").x > 0.3f);
                ok &= Expect(sb, "drum toward -X", Center(go, "Drum_Mesh").x < -0.3f);
                ok &= Expect(sb, "near front wheel at -Z", Pos(go, "Wheel_F_0").z < -0.5f);
                ok &= Expect(sb, "front wheels at hub height", Mathf.Abs(Pos(go, "Wheel_F_0").y - HubY) < Tol && Mathf.Abs(Pos(go, "Wheel_F_1").y - HubY) < Tol);
                ok &= Expect(sb, "body upright (cab top above 2 m)", Max(go, "Cab_Mesh").y > 2.0f);
                ok &= Expect(sb, "drum mesh near body (centre y 1.4..2.0)", Center(go, "Drum_Mesh").y > 1.4f && Center(go, "Drum_Mesh").y < 2.0f);
                ok &= Expect(sb, "asset root rotation 0 (TruckView overwrites it)", Quaternion.Angle(asset.localRotation, Quaternion.identity) < 0.1f);
                foreach (var n in new[] { "Visual", "Body", "Susp_F_0", "Wheel_F_0", "Wheel_R_1", "Chute" })
                    ok &= Expect(sb, n + " rotation 0", Quaternion.Angle(Rot(go, n), Quaternion.identity) < 0.1f);
                var tiltAxis = Rot(go, "Drum") * Vector3.right;
                float tiltDeg = Mathf.Atan2(-tiltAxis.y, tiltAxis.x) * Mathf.Rad2Deg;
                ok &= Expect(sb, "drum spin axis tilts 14.3 deg, front down (" + tiltDeg.ToString("F1") + ")", Mathf.Abs(Mathf.Abs(tiltDeg) - 14.3f) < 0.5f && Mathf.Abs(tiltAxis.z) < 0.01f);
                Debug.Log(sb.ToString());
                return ok;
            }
            finally { Object.DestroyImmediate(go); }
        }

        static bool Expect(StringBuilder sb, string what, bool ok) { sb.AppendFormat("{0} {1}\n", ok ? "[PASS]" : "[FAIL]", what); return ok; }
        static Transform Find(GameObject g, string n) { foreach (var t in g.GetComponentsInChildren<Transform>(true)) if (t.name == n) return t; return null; }
        static Vector3 Pos(GameObject g, string n) { var t = Find(g, n); return t ? t.position : new Vector3(float.NaN, float.NaN, float.NaN); }
        static Quaternion Rot(GameObject g, string n) { var t = Find(g, n); return t ? t.rotation : new Quaternion(0, 0, 0, 0); }
        static Vector3 Center(GameObject g, string n) { var t = Find(g, n); var r = t ? t.GetComponent<Renderer>() : null; return r ? r.bounds.center : new Vector3(float.NaN, float.NaN, float.NaN); }
        static Vector3 Max(GameObject g, string n) { var t = Find(g, n); var r = t ? t.GetComponent<Renderer>() : null; return r ? r.bounds.max : new Vector3(float.NaN, float.NaN, float.NaN); }
    }
}
