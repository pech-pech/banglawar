using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace MixerMad.Game
{
    /// <summary>
    /// Tiny UGUI toolkit for the stub screens. The 4 glossy 9-slice kits are NOT here yet: these are generated
    /// rounded-rect placeholders with the same slicing setup (Image Sliced + Fill Center, all four borders), so
    /// swapping in kit sprites later changes only the sprite reference (L-MM-23). Minimum button 64 px.
    /// </summary>
    public static class UiKit
    {
        public const float MinButton = 64f;
        static Sprite _rounded, _circle;
        static Font _font;

        public static Font Font
        {
            get
            {
                if (_font == null) _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                return _font;
            }
        }

        public static Sprite Rounded
        {
            get
            {
                if (_rounded != null) return _rounded;
                const int n = 64; const float r = 22f;
                var t = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear, name = "UI_Rounded" };
                var px = new Color32[n * n];
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        float cx = Mathf.Clamp(x + 0.5f, r, n - r), cy = Mathf.Clamp(y + 0.5f, r, n - r);
                        float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(cx, cy));
                        float a = Mathf.Clamp01(r - d + 0.5f);
                        // soft top highlight so the plates read as glossy plastic
                        float g = 1f - 0.18f * Mathf.Clamp01((y - n * 0.5f) / (n * 0.5f)) + (y < n * 0.12f ? -0.08f : 0f);
                        byte v = (byte)Mathf.Clamp(255f * g, 0, 255);
                        px[y * n + x] = new Color32(v, v, v, (byte)(a * 255f));
                    }
                t.SetPixels32(px); t.Apply(false, true);
                _rounded = Sprite.Create(t, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, new Vector4(24, 24, 24, 24));
                return _rounded;
            }
        }

        public static Sprite Circle
        {
            get
            {
                if (_circle != null) return _circle;
                const int n = 64;
                var t = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear, name = "UI_Circle" };
                var px = new Color32[n * n];
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(n * 0.5f, n * 0.5f));
                        float a = Mathf.Clamp01(n * 0.5f - d);
                        px[y * n + x] = new Color32(255, 255, 255, (byte)(a * 255f));
                    }
                t.SetPixels32(px); t.Apply(false, true);
                _circle = Sprite.Create(t, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100f);
                return _circle;
            }
        }

        public static RectTransform Rect(Transform parent, string name, Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            rt.anchorMin = anchorMin; rt.anchorMax = anchorMax; rt.pivot = pivot;
            rt.anchoredPosition = pos; rt.sizeDelta = size;
            return rt;
        }

        public static Image Plate(Transform parent, string name, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size, Color color, bool raycast = false, Sprite sprite = null)
        {
            var rt = Rect(parent, name, anchor, anchor, pivot, pos, size);
            var img = rt.gameObject.AddComponent<Image>();
            img.sprite = sprite != null ? sprite : Rounded;
            img.type = img.sprite.border.sqrMagnitude > 0 ? Image.Type.Sliced : Image.Type.Simple;
            img.fillCenter = true;
            img.color = color;
            img.raycastTarget = raycast;
            return img;
        }

        public static Text Label(Transform parent, string text, int size, Color color, TextAnchor anchor = TextAnchor.MiddleCenter, bool outline = true)
        {
            var rt = Rect(parent, "Label", Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = Font; t.text = text; t.fontSize = Mathf.Max(20, size); t.color = color; t.alignment = anchor;
            t.horizontalOverflow = HorizontalWrapMode.Overflow; t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false; t.resizeTextForBestFit = false;
            if (outline) { var o = rt.gameObject.AddComponent<Outline>(); o.effectColor = new Color(0.13f, 0.14f, 0.17f, 1f); o.effectDistance = new Vector2(2, -2); }
            return t;
        }

        /// <summary>Button with press feedback: scale 0.94 and a 10% darken (no overlay plate).</summary>
        public static Button Button(Transform parent, string name, string label, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size, Color color, Action onClick, int fontSize = 28)
        {
            size = new Vector2(Mathf.Max(MinButton, size.x), Mathf.Max(MinButton, size.y));
            var img = Plate(parent, name, anchor, pivot, pos, size, color, true);
            var b = img.gameObject.AddComponent<Button>();
            b.targetGraphic = img;
            var cb = b.colors; cb.normalColor = Color.white; cb.highlightedColor = Color.white; cb.pressedColor = new Color(0.9f, 0.9f, 0.9f, 1f); cb.disabledColor = new Color(1, 1, 1, 0.45f);
            b.colors = cb;
            if (!string.IsNullOrEmpty(label)) Label(img.transform, label, fontSize, Color.white);
            img.gameObject.AddComponent<PressScale>();
            if (onClick != null) b.onClick.AddListener(() => onClick());
            return b;
        }

        public static Canvas Canvas(Transform parent, string name, int order)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var c = go.AddComponent<Canvas>();
            c.renderMode = RenderMode.ScreenSpaceOverlay; c.sortingOrder = order;
            var cs = go.AddComponent<CanvasScaler>();
            cs.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            cs.referenceResolution = new Vector2(1280f, 800f);
            cs.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            cs.matchWidthOrHeight = 0.5f;
            go.AddComponent<GraphicRaycaster>();
            return c;
        }

        public static void EnsureEventSystem()
        {
            if (UnityEngine.Object.FindAnyObjectByType<EventSystem>() != null) return;
            var go = new GameObject("EventSystem");
            go.AddComponent<EventSystem>();
            go.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
            // The default UI actions are created at run time. Assigning them while the editor builds the scene
            // would save a run-time InputActionAsset inside the scene file, which the player cannot read.
            go.AddComponent<UiDefaultActions>();
        }
    }

    /// <summary>Gives the UI input module its default actions when the game starts (never at edit time).</summary>
    [DefaultExecutionOrder(-100)]
    public sealed class UiDefaultActions : MonoBehaviour
    {
        void Awake()
        {
            if (!Application.isPlaying) return;
            var m = GetComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
            if (m != null && m.actionsAsset == null) m.AssignDefaultActions();
        }
    }

    /// <summary>Press feedback: scale 0.94 while held. Calm motion keeps it (it is a state, not a bounce).</summary>
    public sealed class PressScale : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        float _target = 1f;
        public void OnPointerDown(PointerEventData e) { _target = 0.94f; }
        public void OnPointerUp(PointerEventData e) { _target = 1f; }
        public void OnPointerExit(PointerEventData e) { _target = 1f; }
        void Update()
        {
            float s = Mathf.MoveTowards(transform.localScale.x, _target, Time.unscaledDeltaTime * 2.5f);
            transform.localScale = new Vector3(s, s, 1f);
        }
    }

    /// <summary>Keeps its children inside Screen.safeArea (notch, cutout, gesture bars). Re-reads on size change.</summary>
    [RequireComponent(typeof(RectTransform))]
    public sealed class SafeAreaRoot : MonoBehaviour
    {
        Rect _last; Vector2Int _res;
        void Update()
        {
            var sa = Screen.safeArea;
            if (sa == _last && _res.x == Screen.width && _res.y == Screen.height) return;
            _last = sa; _res = new Vector2Int(Screen.width, Screen.height);
            var rt = (RectTransform)transform;
            rt.anchorMin = new Vector2(sa.xMin / Screen.width, sa.yMin / Screen.height);
            rt.anchorMax = new Vector2(sa.xMax / Screen.width, sa.yMax / Screen.height);
            rt.offsetMin = rt.offsetMax = Vector2.zero;
        }
    }
}
