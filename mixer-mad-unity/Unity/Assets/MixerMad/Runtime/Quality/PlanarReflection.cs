using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace MixerMad.Game
{
    /// <summary>
    /// Mirror camera for the frozen lake (flat ice). Renders the world mirrored about y = planeY into a small
    /// RenderTexture and publishes it as the global _MM_PlanarTex that SnowIce samples (keyword _MM_PLANAR).
    ///  Low/Medium: off (probe reflection only). High: scale 0.25, every 2nd frame. Ultra: scale 0.35, every frame.
    /// Geometry below the plane is discarded by the shaders (global _MM_ReflClip / _MM_ReflPlaneY) instead of an
    /// oblique projection, which is ill-conditioned for a camera that looks parallel to the plane.
    /// </summary>
    [DefaultExecutionOrder(100)]
    [DisallowMultipleComponent]
    public sealed class PlanarReflection : MonoBehaviour
    {
        public Camera main;
        [Tooltip("Height of the flat ice plane and its x range. Set by SliceAssembler from the road surface flags.")]
        public float planeY = 0f;
        public float iceX0 = 0f, iceX1 = 0f;
        public LayerMask cullMask = ~0;

        Camera _cam;
        RenderTexture _rt;
        int _mode;
        float _scale = 0.25f;
        static readonly int PlanarTex = Shader.PropertyToID("_MM_PlanarTex");
        bool _hooked;

        void OnEnable()
        {
            RenderPipelineManager.beginCameraRendering += OnBegin;
            RenderPipelineManager.endCameraRendering += OnEnd;
            _hooked = true;
        }

        void OnDisable()
        {
            if (_hooked) { RenderPipelineManager.beginCameraRendering -= OnBegin; RenderPipelineManager.endCameraRendering -= OnEnd; _hooked = false; }
            Shader.DisableKeyword("_MM_PLANAR");
            Shader.SetGlobalFloat("_MM_ReflClip", 0f);
            if (_cam) Destroy(_cam.gameObject);
            if (_rt) { _rt.Release(); Destroy(_rt); }
        }

        public void Configure(int mode, float scale)
        {
            _mode = mode; _scale = Mathf.Clamp(scale, 0.1f, 1f);
            if (mode <= 0) { Shader.DisableKeyword("_MM_PLANAR"); if (_cam) _cam.enabled = false; }
        }

        void EnsureCamera()
        {
            if (_cam != null) return;
            var go = new GameObject("PlanarReflectionCamera");
            go.transform.SetParent(transform, false);
            _cam = go.AddComponent<Camera>();
            _cam.enabled = false;
            var d = _cam.GetUniversalAdditionalCameraData();
            d.renderPostProcessing = false; d.renderShadows = false; d.antialiasing = AntialiasingMode.None;
        }

        void EnsureRT()
        {
            int w = Mathf.Max(64, Mathf.RoundToInt(main.pixelWidth * _scale));
            int h = Mathf.Max(64, Mathf.RoundToInt(main.pixelHeight * _scale));
            if (_rt != null && _rt.width == w && _rt.height == h) return;
            if (_rt != null) { _rt.Release(); Destroy(_rt); }
            _rt = new RenderTexture(w, h, 16, RenderTextureFormat.Default) { name = "MM_PlanarRT", filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            _rt.Create();
            Shader.SetGlobalTexture(PlanarTex, _rt);
        }

        /// <summary>Mirror about the horizontal plane y = h: y' = 2h - y.</summary>
        static Matrix4x4 Reflect(float h)
        {
            var m = Matrix4x4.identity;
            m.m11 = -1f;
            m.m13 = 2f * h;
            return m;
        }

        void LateUpdate()
        {
            if (main == null) main = Camera.main;
            if (_mode <= 0 || main == null) { if (_cam) _cam.enabled = false; return; }

            EnsureCamera(); EnsureRT();
            // only render the part of the world we can see lake in: skip when the lake is far from the view
            var cx = main.transform.position.x;
            bool lakeVisible = iceX1 > iceX0 && cx > iceX0 - 30f && cx < iceX1 + 30f;
            bool turn = _mode == 2 || (Time.frameCount & 1) == 0;
            _cam.enabled = lakeVisible && turn;
            if (lakeVisible) Shader.EnableKeyword("_MM_PLANAR"); else Shader.DisableKeyword("_MM_PLANAR");
            if (!_cam.enabled) return;

            _cam.CopyFrom(main);
            _cam.targetTexture = _rt;
            _cam.depth = main.depth - 10f;
            _cam.cullingMask = cullMask & ~(1 << LayerMask.NameToLayer("UI"));
            _cam.clearFlags = CameraClearFlags.Skybox;
            _cam.worldToCameraMatrix = main.worldToCameraMatrix * Reflect(planeY);
            _cam.projectionMatrix = main.projectionMatrix;
            var d = _cam.GetUniversalAdditionalCameraData();
            d.renderPostProcessing = false; d.renderShadows = false;
        }

        void OnBegin(ScriptableRenderContext ctx, Camera cam)
        {
            if (_cam != null && cam == _cam)
            {
                GL.invertCulling = true;
                Shader.SetGlobalFloat("_MM_ReflClip", 1f);
                Shader.SetGlobalFloat("_MM_ReflPlaneY", planeY - 0.002f);
            }
        }

        void OnEnd(ScriptableRenderContext ctx, Camera cam)
        {
            if (_cam != null && cam == _cam)
            {
                GL.invertCulling = false;
                Shader.SetGlobalFloat("_MM_ReflClip", 0f);
            }
        }
    }
}
