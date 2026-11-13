using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace MixerMad.Game
{
    /// <summary>
    /// Tiny UGUI toolkit. Buttons and panels use M's glossy candy kit (HudSkin: F04 9-slice plates, all four edges
    /// sliced, Fill Center on, never tinted or covered by a gradient, L-MM-23). When the kit art is missing, the
    /// generated rounded rects below are the fallback with the same slicing setup. Minimum button 64 px.
    /// </summary>
    public static class UiKit
    {
        public const float MinButton = 64f;
        /// <summary>Ink colour for text and glyphs on the kit plates (matches the kit's navy rim).</summary>
        public static readonly Color Navy = new Color(0.12f, 0.14f, 0.25f, 1f);
        /// <summary>9-slice border scale: kit plates are 2K art, drawn about 5x smaller on a 1280x800 canvas.</summary>
        public const float ButtonSliceScale = 5.5f, PanelSliceScale = 3.6f;
        static Sprite _rounded, _circle, _frame;
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

        /// <summary>Outline-only 9-slice frame: a 4 px navy edge with a 2 px white line inside, clear centre.
        /// Navy carries the edge on bright sky and snow, white carries it at night.</summary>
        public static Sprite Frame
        {
            get
            {
                if (_frame != null) return _frame;
                const int n = 48; const float r = 16f, navyW = 4f, whiteW = 2f;
                var t = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear, name = "UI_Frame" };
                var px = new Color32[n * n];
                Color32 navy = Navy, white = Color.white;
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        float cx = Mathf.Clamp(x + 0.5f, r, n - r), cy = Mathf.Clamp(y + 0.5f, r, n - r);
                        float inside = r - Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(cx, cy)); // px from the edge
                        Color32 c = inside < navyW ? navy : inside < navyW + whiteW ? white : new Color32(0, 0, 0, 0);
                        float a = Mathf.Clamp01(inside + 0.5f) * (inside < navyW + whiteW ? 1f : 0f);
                        c.a = (byte)(a * 255f);
                        px[y * n + x] = c;
                    }
                t.SetPixels32(px); t.Apply(false, true);
                _frame = Sprite.Create(t, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, new Vector4(20, 20, 20, 20));
                return _frame;
            }
        }

        /// <summary>
        /// Puts a kit sprite on an Image untinted. 9-slice sprites are Sliced with Fill Center, with the border scale
        /// raised when the rect is too small for the corners; plain sprites keep their aspect.
        /// </summary>
        public static void ApplyKit(Image img, Sprite sprite, Vector2 size, float sliceScale)
        {
            img.sprite = sprite;
            img.color = Color.white;
            var b = sprite.border;
            if (b.sqrMagnitude > 0f)
            {
                img.type = Image.Type.Sliced; img.fillCenter = true;
                float need = Mathf.Max((b.x + b.z) / Mathf.Max(1f, size.x * 0.95f), (b.y + b.w) / Mathf.Max(1f, size.y * 0.95f));
                img.pixelsPerUnitMultiplier = Mathf.Max(sliceScale, need);
            }
            else { img.type = Image.Type.Simple; img.preserveAspect = true; }
        }

        /// <summary>Kit button plate (candy F04) with a navy label; falls back to a coloured rounded plate.</summary>
        public static Button KitButton(Transform parent, string name, string label, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size, Color fallback, Action onClick, int fontSize = 28)
        {
            var skin = HudSkin.Current;
            if (skin == null || skin.button == null) return Button(parent, name, label, anchor, pivot, pos, size, fallback, onClick, fontSize);
            var b = Button(parent, name, "", anchor, pivot, pos, size, Color.white, onClick, fontSize);
            b.transition = Selectable.Transition.None;   // press feedback is PressScale only: the art is never tinted
            var img = (Image)b.targetGraphic;
            ApplyKit(img, skin.button, img.rectTransform.sizeDelta, ButtonSliceScale);
            if (!string.IsNullOrEmpty(label))
            {
                var t = Label(img.transform, label, fontSize, Navy, TextAnchor.MiddleCenter, false);
                t.rectTransform.offsetMin = new Vector2(0, 4);   // the plate's lip is at the bottom: centre on the face
            }
            return b;
        }

        /// <summary>Kit panel plate (candy F04); falls back to a dark rounded card.</summary>
        public static Image KitPanel(Transform parent, string name, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size, bool raycast = true)
        {
            var skin = HudSkin.Current;
            var img = Plate(parent, name, anchor, pivot, pos, size, new Color(0.18f, 0.22f, 0.32f, 0.97f), raycast);
            if (skin != null && skin.panel != null) ApplyKit(img, skin.panel, size, PanelSliceScale);
            return img;
        }

        /// <summary>Text colour for a title on a panel: navy on the light kit panel, white on the dark fallback.</summary>
        public static Color PanelInk => HudSkin.Current != null && HudSkin.Current.panel != null ? Navy : Color.white;

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
            cs.referenceResolution = HudLayout.ReferenceResolution;
            cs.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            cs.matchWidthOrHeight = HudLayout.MatchWidthOrHeight;
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
