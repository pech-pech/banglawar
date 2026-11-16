using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Soft dark contact blobs on the snow (L-MM-30, GAMEUP D2): one under each wheel on every preset (a little
    /// ambient occlusion where rubber meets snow, so the truck never floats), plus a body blob on presets without
    /// realtime shadows. Blobs lie on the visual ground (RoadBuilder.HeightAt), tilt with the slope and fade out as
    /// a wheel leaves the ground.
    ///
    /// One renderer, one dynamic mesh, the shared FX_ParticleAlpha material: per-blob strength rides in the vertex
    /// colour, so there is no per-renderer material and no MaterialPropertyBlock. It only READS the truck's
    /// transforms (which follow SimDriver.Render) and keeps no history, so a teleport needs no reset.
    ///
    /// BuildStatic() makes the same blobs once for props (boulders, posts): one combined mesh, nothing per frame.
    /// </summary>
    [DefaultExecutionOrder(70)]
    [DisallowMultipleComponent]
    public sealed class ContactShadows : MonoBehaviour
    {
        /// <summary>Blob opacity with the wheel on the ground.</summary>
        public const float MaxAlpha = 0.72f;
        /// <summary>Height of the wheel bottom above the snow at which the blob is gone.</summary>
        public const float FadeHeight = 1.6f;

        static readonly Color BlobTint = new Color(0.05f, 0.07f, 0.16f, 1f);   // navy, never pure black
        const float GroundLift = 0.04f;           // above the snow, under the wheel
        const float WheelBlobLength = 1.7f;       // along the road
        const float WheelBlobHeight = 1.1f;       // the card's other side, half of it under the snow
        const float WheelBlobTilt = 70f;          // degrees up from flat, toward the camera
        const float TowardCamera = 0.35f;         // just in front of the tyre face (tyres are ~0.4 m wide)
        // Why a tilted card: the camera looks at the road almost edge-on and the front snow bank hides the road
        // under the tyres, so a flat blob there is invisible. A card standing up at the contact line, darkest at
        // the line and fading up over the tyre bottom and out along the snow, reads as contact shadow / AO.
        const float BodyBlobLength = 5.6f, BodyBlobDepth = 2.6f, BodyAlpha = 0.42f;
        const float SlopeProbe = 0.4f;            // m either side, to tilt the blob with the road
        const float AirSpread = 0.6f;             // a blob grows by this much (x1.6) as it fades

        public TruckView truck;
        public RoadBuilder road;

        Mesh _mesh;
        MeshRenderer _renderer;
        Vector3[] _verts;
        Color[] _cols;
        int _blobs;

        /// <summary>Blob opacity for a wheel whose bottom is this many metres above the snow.</summary>
        public static float BlobAlpha(float heightAboveGround)
        {
            float k = 1f - Mathf.Clamp01(heightAboveGround / FadeHeight);
            return MaxAlpha * k * k;
        }

        void Start()
        {
            if (truck == null || road == null) { Debug.LogWarning("[MixerMad] ContactShadows: no truck or road; disabled."); enabled = false; return; }
            _renderer = MakeRenderer(gameObject, null);
        }

        /// <summary>(Re)builds the mesh when the wheel count is known or changes (TruckView binds wheels by name).</summary>
        void EnsureMesh()
        {
            int blobs = truck.wheels.Count + 1;   // + the body blob
            if (_mesh != null && blobs == _blobs) return;
            _blobs = blobs;
            _verts = new Vector3[_blobs * 4];
            _cols = new Color[_blobs * 4];
            var uv = new Vector2[_blobs * 4];
            var tris = new int[_blobs * 6];
            for (int b = 0; b < _blobs; b++) WriteQuadIndices(b, uv, tris);
            if (_mesh == null) { _mesh = new Mesh { name = "ContactShadows" }; _mesh.MarkDynamic(); }
            _mesh.Clear();
            _mesh.vertices = _verts; _mesh.colors = _cols; _mesh.uv = uv; _mesh.triangles = tris;
            GetComponent<MeshFilter>().sharedMesh = _mesh;
        }

        void OnDestroy() { if (_mesh != null) Destroy(_mesh); }

        void LateUpdate()
        {
            EnsureMesh();
            _renderer.enabled = FeatureToggles.ContactShadows;
            if (!_renderer.enabled) return;
            int b = 0;
            foreach (var w in truck.wheels)
            {
                Transform t = w.spin;
                if (t == null) { Hide(b++); continue; }
                Vector3 c = t.position;
                float ground = road.HeightAt(c.x, c.z);
                float air = c.y - w.radius - ground;
                float a = BlobAlpha(air);
                float grow = 1f + AirSpread * Mathf.Clamp01(air / FadeHeight);
                Place(b++, c.x, c.z - TowardCamera, WheelBlobLength * grow, WheelBlobHeight, a, WheelBlobTilt);
            }
            bool bodyBlob = QualityPresets.Current.shadowCascades == 0 || !FeatureToggles.Shadows;
            Vector3 p = truck.transform.position;
            if (bodyBlob) Place(b, p.x, p.z, BodyBlobLength, BodyBlobDepth, BodyAlpha * BlobAlpha(p.y - road.HeightAt(p.x, p.z) - 1f) / MaxAlpha);
            else Hide(b);

            _mesh.vertices = _verts;
            _mesh.colors = _cols;
            _mesh.RecalculateBounds();
        }

        void Place(int b, float x, float z, float length, float depth, float alpha, float tiltDeg = 0f) => PlaceInto(_verts, _cols, road, b, x, z, length, depth, alpha, tiltDeg);

        /// <summary>One blob quad on the snow at (x, z): flat (tilt 0) or tilted up toward the camera (-z) about its centre line.</summary>
        static void PlaceInto(Vector3[] verts, Color[] cols, RoadBuilder road, int b, float x, float z, float length, float depth, float alpha, float tiltDeg = 0f)
        {
            float y = road.HeightAt(x, z) + GroundLift;
            float slope = (road.HeightAt(x + SlopeProbe, z) - road.HeightAt(x - SlopeProbe, z)) / (2f * SlopeProbe);
            Vector3 along = new Vector3(1f, slope, 0f).normalized * (length * 0.5f);
            float tilt = tiltDeg * Mathf.Deg2Rad;
            Vector3 across = new Vector3(0f, Mathf.Sin(tilt), -Mathf.Cos(tilt)) * (depth * 0.5f);
            Vector3 c = new Vector3(x, y, z);
            int v = b * 4;
            verts[v] = c - along - across; verts[v + 1] = c + along - across;
            verts[v + 2] = c - along + across; verts[v + 3] = c + along + across;
            Color col = BlobTint; col.a = alpha;
            cols[v] = cols[v + 1] = cols[v + 2] = cols[v + 3] = col;
        }

        void Hide(int b)
        {
            int v = b * 4;
            for (int i = 0; i < 4; i++) { _cols[v + i] = Color.clear; _verts[v + i] = _verts[b * 4]; }
        }

        static void WriteQuadIndices(int b, Vector2[] uv, int[] tris)
        {
            int v = b * 4, t = b * 6;
            uv[v] = new Vector2(0, 0); uv[v + 1] = new Vector2(1, 0); uv[v + 2] = new Vector2(0, 1); uv[v + 3] = new Vector2(1, 1);
            // faces up (+y): seen from the camera above the road
            tris[t] = v; tris[t + 1] = v + 2; tris[t + 2] = v + 1;
            tris[t + 3] = v + 1; tris[t + 4] = v + 2; tris[t + 5] = v + 3;
        }

        static MeshRenderer MakeRenderer(GameObject go, Mesh mesh)
        {
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = MMMaterials.Particle(false);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return r;
        }

        /// <summary>
        /// Static contact blobs for props, one combined mesh. Each spot is (x, z, length along the road, depth across).
        /// For the decor builder: call once after placing boulders or posts.
        /// </summary>
        public static GameObject BuildStatic(Transform parent, RoadBuilder road, IList<Vector4> spots, float alpha = 0.4f)
        {
            var go = new GameObject("PropContactShadows");
            go.transform.SetParent(parent, false);
            if (road == null || spots == null || spots.Count == 0) return go;
            var verts = new Vector3[spots.Count * 4];
            var cols = new Color[spots.Count * 4];
            var uv = new Vector2[spots.Count * 4];
            var tris = new int[spots.Count * 6];
            for (int i = 0; i < spots.Count; i++)
            {
                Vector4 s = spots[i];
                PlaceInto(verts, cols, road, i, s.x, s.y, s.z, s.w, alpha);
                WriteQuadIndices(i, uv, tris);
            }
            var mesh = new Mesh { name = "PropContactShadows", indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
            mesh.vertices = verts; mesh.colors = cols; mesh.uv = uv; mesh.triangles = tris;
            mesh.RecalculateBounds();
            MakeRenderer(go, mesh);
            return go;
        }
    }
}
