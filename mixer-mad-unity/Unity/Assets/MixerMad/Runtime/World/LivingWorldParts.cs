using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Cheap meshes for the living world, each merged into ONE mesh per material so a prop is one or two draw calls:
    /// snow plough, ski-lift pylon and chair, bird (body + two flapping wings), roof snow.
    /// Background rule: matte World_* materials without the navy outline.
    /// </summary>
    public static class LivingWorldParts
    {
        static readonly Dictionary<string, Mesh> Cache = new Dictionary<string, Mesh>();

        static Mesh Box(Vector3 size, float r = 0.06f)
        {
            string k = "box" + size + r;
            if (!Cache.TryGetValue(k, out var m) || m == null) { m = ProcMesh.RoundedBox(size, r, 2); Cache[k] = m; }
            return m;
        }

        public static GameObject Renderer(Transform parent, string name, Mesh mesh, string material, bool shadows = false)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = MMMaterials.Get(material);
            r.shadowCastingMode = shadows ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        /// <summary>Snow plough facing +x, origin at the ground between the wheels. About 3.6 m long.</summary>
        public static Transform Plough(Transform parent)
        {
            var root = new GameObject("Plough").transform;
            root.SetParent(parent, false);
            var orange = new List<ProcMesh.Part>
            {
                new ProcMesh.Part(Box(new Vector3(2.2f, 1.0f, 1.5f)), new Vector3(-0.4f, 1.0f, 0f), Quaternion.identity),
                new ProcMesh.Part(Box(new Vector3(1.0f, 1.0f, 1.4f)), new Vector3(0.75f, 1.7f, 0f), Quaternion.identity),
            };
            var navy = new List<ProcMesh.Part>
            {
                new ProcMesh.Part(Box(new Vector3(0.75f, 0.75f, 1.6f), 0.2f), new Vector3(-1.0f, 0.38f, 0f), Quaternion.identity),
                new ProcMesh.Part(Box(new Vector3(0.75f, 0.75f, 1.6f), 0.2f), new Vector3(0.6f, 0.38f, 0f), Quaternion.identity),
                new ProcMesh.Part(Box(new Vector3(0.7f, 0.5f, 1.2f)), new Vector3(0.75f, 1.85f, 0f), Quaternion.identity),       // window band
            };
            var blade = new List<ProcMesh.Part>
            {
                new ProcMesh.Part(Box(new Vector3(0.18f, 0.8f, 2.2f)), new Vector3(1.55f, 0.45f, 0f), Quaternion.Euler(0f, 0f, -18f)),
            };
            Renderer(root, "Plough_Body", ProcMesh.Combine(orange, "Plough_Body"), "World_Orange");
            Renderer(root, "Plough_Dark", ProcMesh.Combine(navy, "Plough_Dark"), "World_Navy");
            Renderer(root, "Plough_Blade", ProcMesh.Combine(blade, "Plough_Blade"), "Toy_Yellow");
            var beacon = Renderer(root, "Plough_Beacon", ProcMesh.Sphere(0.16f, 6, 10), "FX_Beacon_On");
            beacon.transform.localPosition = new Vector3(0.75f, 2.3f, 0f);
            return root;
        }

        /// <summary>Lift pylon: a unit post (scale its y to the height) and a cross arm (move it to the top). Origin at the foot.</summary>
        public static Transform Pylon(Transform parent, out Transform post, out Transform arm)
        {
            var root = new GameObject("Lift_Pylon").transform;
            root.SetParent(parent, false);
            post = Renderer(root, "Post", Box(new Vector3(0.35f, 1f, 0.35f), 0.05f), "World_Navy").transform;
            arm = Renderer(root, "Arm", Box(new Vector3(0.25f, 0.25f, 1.8f)), "World_Navy").transform;
            return root;
        }

        public static void SetPylonHeight(Transform post, Transform arm, float h)
        {
            post.localScale = new Vector3(1f, h, 1f); post.localPosition = new Vector3(0f, h * 0.5f, 0f);
            arm.localPosition = new Vector3(0f, h, 0f);
        }

        /// <summary>One chair: hanger + seat, origin at the cable grip.</summary>
        public static Mesh ChairMesh()
        {
            if (Cache.TryGetValue("chair", out var m) && m != null) return m;
            var parts = new List<ProcMesh.Part>
            {
                new ProcMesh.Part(Box(new Vector3(0.06f, 1.3f, 0.06f), 0.02f), new Vector3(0f, -0.65f, 0f), Quaternion.identity),
                new ProcMesh.Part(Box(new Vector3(0.7f, 0.12f, 0.9f), 0.04f), new Vector3(0f, -1.3f, 0f), Quaternion.identity),
                new ProcMesh.Part(Box(new Vector3(0.12f, 0.6f, 0.9f), 0.04f), new Vector3(-0.32f, -1.0f, 0f), Quaternion.identity),
            };
            m = ProcMesh.Combine(parts, "Lift_Chair"); Cache["chair"] = m; return m;
        }

        /// <summary>A bird: body plus two wing pivots (returned) that flap around the body's x axis.</summary>
        public static Transform Bird(Transform parent, out Transform wingL, out Transform wingR)
        {
            var root = new GameObject("Bird").transform;
            root.SetParent(parent, false);
            Renderer(root, "Bird_Body", Box(new Vector3(0.55f, 0.16f, 0.16f), 0.07f), "World_Navy");
            wingL = new GameObject("Wing_L").transform; wingL.SetParent(root, false);
            wingR = new GameObject("Wing_R").transform; wingR.SetParent(root, false);
            var wing = Box(new Vector3(0.28f, 0.04f, 0.55f), 0.015f);
            Renderer(wingL, "Wing", wing, "World_Navy").transform.localPosition = new Vector3(0f, 0f, -0.3f);
            Renderer(wingR, "Wing", wing, "World_Navy").transform.localPosition = new Vector3(0f, 0f, 0.3f);
            return root;
        }

        /// <summary>Snow on the cabin: a cap over the roof pyramid, a soft lip on the front eave, and a chimney cap.</summary>
        public static void RoofSnow(Transform cabin, Transform parent)
        {
            if (cabin == null) return;
            var root = new GameObject("Roof_Snow").transform;
            root.SetParent(parent, false);
            root.SetPositionAndRotation(cabin.position, cabin.rotation);
            // roof in SnowyPassDecor: 4-sided cone at y 3.0, height 2, scale (4.6, 2, 3.6), turned 45 degrees.
            const float k = 0.55f;   // top 55 % of the pyramid
            var cap = ProcMesh.Cone(1f, 1f, 0f, 4);
            var parts = new List<ProcMesh.Part>
            {
                new ProcMesh.Part(cap, new Vector3(0f, 3.0f + 2f * (1f - k) + 0.03f, 0f), Quaternion.Euler(0f, 45f, 0f), new Vector3(4.6f * k * 1.05f, 2f * k, 3.6f * k * 1.05f)),
                new ProcMesh.Part(Box(new Vector3(6.2f, 0.26f, 0.5f), 0.12f), new Vector3(0f, 3.05f, -2.45f), Quaternion.identity),
                new ProcMesh.Part(Box(new Vector3(0.8f, 0.22f, 0.8f), 0.1f), new Vector3(1.4f, 5.25f, 0.3f), Quaternion.identity),
            };
            Renderer(root, "Roof_Snow_Mesh", ProcMesh.Combine(parts, "Roof_Snow"), "World_Snow");
        }
    }
}
