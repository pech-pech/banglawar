using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Primitive mixer truck so the slice runs before the Blender art arrives.
    /// 1 m scale, +X forward, pivot at the chassis bottom centre, wheel radius 0.5 exactly (physics value),
    /// length about 4.6 m, height about 2.7 m. Same node names the FBX must use (see README), so replacing
    /// this with Truck_Mixer.fbx is a drop-in: the TruckView binds by name.
    /// </summary>
    public static class PlaceholderTruckFactory
    {
        public const float WheelRadius = 0.5f;
        public const float RearAxleX = -1.2f, FrontAxleX = 1.15f, AxleZ = 0.95f;

        static Mesh _lug;

        static Mesh Box(float r = 0.08f) { var m = ProcMesh.RoundedBox(Vector3.one, 0.08f, 5); MeshSmoothNormals.Bake(m); return m; }

        static GameObject P(Transform parent, string name, Mesh mesh, string mat, Vector3 pos, Vector3 scale, Vector3? euler = null)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            if (euler.HasValue) go.transform.localRotation = Quaternion.Euler(euler.Value);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = MMMaterials.Get(mat);
            return go;
        }

        static Mesh Baked(Mesh m) { MeshSmoothNormals.Bake(m); return m; }

        public static GameObject CreateMixer(string skinMaterial = "Toy_Yellow")
        {
            var root = new GameObject("Truck_Mixer");
            var visual = new GameObject("Visual"); visual.transform.SetParent(root.transform, false);
            visual.AddComponent<SquashStretch>().maxStretch = 0.18f;
            var body = new GameObject("Body"); body.transform.SetParent(visual.transform, false);
            var b = body.transform;

            Mesh box = Box();

            // chassis frame + cradle
            P(b, "Chassis_Frame", box, "Toy_Navy", new Vector3(0f, 0.62f, 0f), new Vector3(4.5f, 0.30f, 1.5f));
            P(b, "Drum_Cradle", box, "Toy_Navy", new Vector3(-0.55f, 0.92f, 0f), new Vector3(1.0f, 0.28f, 1.1f));

            // cab: lower body, roof, two pillars, windshield, bumper
            P(b, "Cab_Lower", box, skinMaterial, new Vector3(1.55f, 1.075f, 0f), new Vector3(1.30f, 0.75f, 1.80f));
            P(b, "Cab_Roof", box, skinMaterial, new Vector3(1.55f, 2.30f, 0f), new Vector3(1.34f, 0.30f, 1.84f));
            P(b, "Cab_Pillar_R", box, skinMaterial, new Vector3(0.98f, 1.80f, 0f), new Vector3(0.14f, 0.72f, 1.80f));
            P(b, "Cab_Pillar_F", box, skinMaterial, new Vector3(2.13f, 1.80f, 0f), new Vector3(0.14f, 0.72f, 1.80f));
            P(b, "Windshield", box, "Toy_Glass", new Vector3(2.19f, 1.80f, 0f), new Vector3(0.06f, 0.66f, 1.50f));
            P(b, "Seat_Back", box, "Toy_Navy", new Vector3(1.22f, 1.55f, 0f), new Vector3(0.14f, 0.45f, 0.85f));
            P(b, "Bumper", box, "Toy_Navy", new Vector3(2.28f, 0.72f, 0f), new Vector3(0.22f, 0.30f, 1.95f));
            P(b, "Grille", box, "Toy_Cream", new Vector3(2.22f, 1.10f, 0f), new Vector3(0.06f, 0.30f, 1.0f));
            P(b, "Headlight_Mesh_L", box, "Toy_Cream", new Vector3(2.24f, 0.98f, -0.72f), new Vector3(0.08f, 0.16f, 0.22f));
            P(b, "Headlight_Mesh_R", box, "Toy_Cream", new Vector3(2.24f, 0.98f, 0.72f), new Vector3(0.08f, 0.16f, 0.22f));
            AddHeadlight(b, "Headlight_L", new Vector3(2.3f, 0.98f, -0.72f));
            AddHeadlight(b, "Headlight_R", new Vector3(2.3f, 0.98f, 0.72f));

            // mixer drum: tilt node (rear up), spinning drum, cream spiral fins
            var tilt = new GameObject("Drum_Tilt"); tilt.transform.SetParent(b, false);
            tilt.transform.localPosition = new Vector3(-0.75f, 1.80f, 0f);
            tilt.transform.localRotation = Quaternion.Euler(0f, 0f, -12f);
            var drum = new GameObject("Drum"); drum.transform.SetParent(tilt.transform, false);
            const float L = 3.0f, MaxR = 0.84f, EndR = 0.50f;
            var drumMesh = Baked(ProcMesh.Transformed(ProcMesh.Drum(L, MaxR, EndR), Matrix4x4.Rotate(Quaternion.Euler(0f, 90f, 0f))));
            drum.AddComponent<MeshFilter>().sharedMesh = drumMesh;
            drum.AddComponent<MeshRenderer>().sharedMaterial = MMMaterials.Get("Toy_Orange");
            var fins = new List<ProcMesh.Part>();
            var fin = Baked(ProcMesh.RoundedBox(new Vector3(0.20f, 0.09f, 0.20f), 0.04f, 3));
            for (int arm = 0; arm < 2; arm++)
                for (int i = 0; i < 34; i++)
                {
                    float t = 0.06f + 0.74f * i / 33f;                          // along the drum
                    float ang = (t * 2.2f * Mathf.PI * 2f) + arm * Mathf.PI;     // two helical blades
                    float r = ProcMesh.DrumRadius(t, MaxR, EndR) + 0.02f;
                    float x = -L * 0.5f + t * L;
                    Vector3 pos = new Vector3(x, Mathf.Cos(ang) * r, Mathf.Sin(ang) * r);
                    Quaternion rot = Quaternion.LookRotation(new Vector3(0, Mathf.Cos(ang), Mathf.Sin(ang)), Vector3.right);
                    fins.Add(new ProcMesh.Part(fin, pos, rot));
                }
            var finGo = new GameObject("Drum_Fins"); finGo.transform.SetParent(drum.transform, false);
            finGo.AddComponent<MeshFilter>().sharedMesh = Baked(ProcMesh.Combine(fins, "DrumFins"));
            finGo.AddComponent<MeshRenderer>().sharedMaterial = MMMaterials.Get("Toy_Cream");

            // chute: hinge at the rear mouth of the drum
            var chuteHinge = new GameObject("Chute"); chuteHinge.transform.SetParent(b, false);
            chuteHinge.transform.localPosition = new Vector3(-2.18f, 1.95f, 0f);
            chuteHinge.transform.localRotation = Quaternion.Euler(0f, 0f, -14f);
            P(chuteHinge.transform, "Chute_Mesh", box, "Toy_Cream", new Vector3(-0.55f, 0f, 0f), new Vector3(1.1f, 0.14f, 0.42f));
            P(chuteHinge.transform, "Chute_Lip_A", box, "Toy_Navy", new Vector3(-0.55f, 0.1f, -0.2f), new Vector3(1.1f, 0.10f, 0.05f));
            P(chuteHinge.transform, "Chute_Lip_B", box, "Toy_Navy", new Vector3(-0.55f, 0.1f, 0.2f), new Vector3(1.1f, 0.10f, 0.05f));

            // driver seat + builder
            var seat = new GameObject("Driver_Seat"); seat.transform.SetParent(b, false);
            seat.transform.localPosition = new Vector3(1.55f, 1.65f, 0f);
            DriverView.BuildPlaceholder(seat.transform);

            // wheels: near (z<0, seen by the camera) and far side
            var tyre = Baked(ProcMesh.Wheel(WheelRadius, 0.36f, 0.30f));
            var hub = Baked(ProcMesh.Wheel(0.28f, 0.42f, 0.01f));
            for (int side = 0; side < 2; side++)
            {
                float z = side == 0 ? -AxleZ : AxleZ;
                AddWheel(visual.transform, "R", side, RearAxleX, z, tyre, hub);
                AddWheel(visual.transform, "F", side, FrontAxleX, z, tyre, hub);
                // fenders over the wheels
                P(b, "Fender_R_" + side, box, "Toy_Navy", new Vector3(RearAxleX, 1.07f, z), new Vector3(1.35f, 0.12f, 0.52f));
                P(b, "Fender_F_" + side, box, "Toy_Navy", new Vector3(FrontAxleX, 1.07f, z), new Vector3(1.25f, 0.12f, 0.52f));
            }

            var tv = root.AddComponent<TruckView>();   // Awake auto-binds Visual/Body/Drum/Chute/wheels/headlights
            tv.squash = visual.GetComponent<SquashStretch>();
            tv.driver = root.GetComponentInChildren<DriverView>();
            return root;
        }

        static void AddHeadlight(Transform parent, string name, Vector3 pos)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localRotation = Quaternion.Euler(8f, 90f, 0f);    // points forward (+x), slightly down
            var l = go.AddComponent<Light>();
            l.type = LightType.Spot; l.range = 18f; l.spotAngle = 55f; l.innerSpotAngle = 20f;
            l.intensity = 14f; l.color = new Color(1f, 0.94f, 0.78f);
            l.shadows = LightShadows.None;
            l.enabled = false;
        }

        static void AddWheel(Transform visual, string axle, int side, float x, float z, Mesh tyre, Mesh hub)
        {
            var susp = new GameObject("Susp_" + axle + "_" + side);
            susp.transform.SetParent(visual, false);
            susp.transform.localPosition = new Vector3(x, WheelRadius, z);
            var wheel = new GameObject("Wheel_" + axle + "_" + side);
            wheel.transform.SetParent(susp.transform, false);
            wheel.AddComponent<MeshFilter>().sharedMesh = tyre;
            wheel.AddComponent<MeshRenderer>().sharedMaterial = MMMaterials.Get("Toy_Rubber");
            var cap = new GameObject("Hub"); cap.transform.SetParent(wheel.transform, false);
            cap.AddComponent<MeshFilter>().sharedMesh = hub;
            cap.AddComponent<MeshRenderer>().sharedMaterial = MMMaterials.Get("Toy_Cream");
            // lug nuts so the spin reads
            for (int i = 0; i < 5; i++)
            {
                float a = i / 5f * Mathf.PI * 2f;
                var lug = new GameObject("Lug_" + i); lug.transform.SetParent(wheel.transform, false);
                lug.transform.localPosition = new Vector3(Mathf.Cos(a) * 0.17f, Mathf.Sin(a) * 0.17f, side == 0 ? -0.23f : 0.23f);
                lug.transform.localScale = new Vector3(0.09f, 0.09f, 0.05f);
                if (_lug == null) _lug = Baked(ProcMesh.Sphere(0.5f, 6, 10));
                lug.AddComponent<MeshFilter>().sharedMesh = _lug;
                lug.AddComponent<MeshRenderer>().sharedMaterial = MMMaterials.Get("Toy_Navy");
            }
        }
    }
}
