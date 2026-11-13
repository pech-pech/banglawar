using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace MixerMad.Game
{
    /// <summary>
    /// Driving HUD (UGUI) on M's glossy candy kit (HudSkin): pause, LOAD bar, 3 stars, gas and brake pedals, toast line,
    /// pause card and the DELIVERED card. Code-drawn plates are only the fallback when the kit art is missing.
    /// Gas/brake touch zones are the InputReader's columns; the pedal art is the permanent hint. The zone outlines
    /// (navy edge + white line, at least 3:1 on sky, snow and night) show for the first seconds of each run and then
    /// fade out once (a cut in Calm motion), so they teach the zones without framing the play view all run. No pulsing.
    /// Finish: pedals and zones hide, and the card goes in the top band where it does not cover the truck or the pour.
    ///
    /// Desktop shortcuts (QA): Esc pause, R restart, G garage, C calm motion, 1-4 quality,
    /// F3 cycle weather, T +10% time of day, F1 perf overlay, F2 CSV log.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class Hud : MonoBehaviour
    {
        public const float ZoneHintSeconds = 3.5f, ZoneHintFadeSeconds = 0.8f;
        public static readonly Vector2 FinishCardSize = new Vector2(520f, 210f);
        const float LoadW = 374f, LoadH = 28f;

        public InputReader input;
        public GarageStub garage;
        public float finishX = 232f;

        SimDriver _sim;
        Canvas _canvas;
        RectTransform _gasZone, _brakeZone, _finishRt;
        Image _gasPedal, _brakePedal, _gasFrame, _brakeFrame, _loadFill;
        readonly Image[] _stars = new Image[3];
        Text _toast, _calmLabel;
        GameObject _pause, _finish;
        Renderer[] _truckRenderers;
        float _toastT, _finishShowT = -1f, _runT;
        float _loadFillMinW;
        bool _paused, _pedalsVisible = true;

        static readonly Color Gold = new Color(1f, 0.85f, 0.29f), Plate = new Color(0.20f, 0.55f, 0.95f);
        static readonly Color SocketFallback = UiKit.Navy;

        public static Hud Build(Transform parent, InputReader input)
        {
            UiKit.EnsureEventSystem();
            var go = new GameObject("HUD");
            go.transform.SetParent(parent, false);
            var h = go.AddComponent<Hud>();
            h.input = input;
            h.BuildUi();
            return h;
        }

        void Start()
        {
            _sim = SimDriver.Instance;
            if (_sim != null) { _sim.SimEventRaised += OnSimEvent; _sim.Restarted += OnRestart; finishX = _sim.Backend.FinishX; }
            var truck = FindAnyObjectByType<TruckView>();
            if (truck) _truckRenderers = truck.GetComponentsInChildren<Renderer>(true);
        }

        void OnDestroy() { if (_sim != null) { _sim.SimEventRaised -= OnSimEvent; _sim.Restarted -= OnRestart; } }

        // ------------------------------------------------------------------------------ build
        void BuildUi()
        {
            _canvas = UiKit.Canvas(transform, "HUD_Canvas", 10);
            var root = (RectTransform)_canvas.transform;
            var skin = HudSkin.Current;

            _brakeZone = Zone(root, "BrakeZone", out _brakeFrame); _gasZone = Zone(root, "GasZone", out _gasFrame);
            _brakePedal = Pedal(_brakeZone, "BRAKE", skin ? skin.brake : null, new Vector2(176, 130), new Color(0.86f, 0.26f, 0.22f));
            _gasPedal = Pedal(_gasZone, "GAS", skin ? skin.gas : null, new Vector2(92, 218), new Color(0.27f, 0.75f, 0.30f));

            var safe = UiKit.Rect(root, "SafeArea", Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            safe.gameObject.AddComponent<SafeAreaRoot>();
            BuildPauseButton(safe, skin);
            BuildLoadBar(safe, skin);
            for (int i = 0; i < 3; i++)
            {
                _stars[i] = UiKit.Plate(safe, "Star" + i, new Vector2(1, 1), new Vector2(1, 1), new Vector2(-24 - (2 - i) * 60, -22), new Vector2(54, 54), SocketFallback, false, UiKit.Circle);
                if (skin && skin.starEmpty) UiKit.ApplyKit(_stars[i], skin.starEmpty, new Vector2(54, 54), 1f);
            }

            _toast = UiKit.Label(safe, "", 32, Color.white);
            var trt = _toast.rectTransform; trt.anchorMin = new Vector2(0.5f, 1); trt.anchorMax = new Vector2(0.5f, 1); trt.pivot = new Vector2(0.5f, 1);
            trt.anchoredPosition = new Vector2(0, -74); trt.sizeDelta = new Vector2(600, 48);

            BuildPause(root);
            BuildFinish(root);
        }

        RectTransform Zone(RectTransform root, string name, out Image frame)
        {
            var z = UiKit.Rect(root, name, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero);
            var f = UiKit.Rect(z, "EdgeHint", Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            f.offsetMin = new Vector2(10, 10); f.offsetMax = new Vector2(-10, -10);
            frame = f.gameObject.AddComponent<Image>();
            frame.sprite = UiKit.Frame; frame.type = Image.Type.Sliced; frame.fillCenter = false; frame.raycastTarget = false;
            return z;
        }

        static Image Pedal(RectTransform zone, string label, Sprite art, Vector2 artSize, Color fallback)
        {
            var anchor = new Vector2(0.5f, 0.3f);
            if (art != null)
            {
                var img = UiKit.Plate(zone, "Pedal", anchor, new Vector2(0.5f, 0.5f), Vector2.zero, artSize, Color.white);
                UiKit.ApplyKit(img, art, artSize, 1f);
                return img;
            }
            var plate = UiKit.Plate(zone, "Pedal", anchor, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(140, 140), fallback);
            UiKit.Label(plate.transform, label, 30, Color.white);
            return plate;
        }

        void BuildPauseButton(RectTransform safe, HudSkin skin)
        {
            var hit = UiKit.Rect(safe, "Pause", new Vector2(0, 1), new Vector2(0, 1), new Vector2(0, 1), new Vector2(20, -20), new Vector2(80, 80));
            var hitImg = hit.gameObject.AddComponent<Image>(); hitImg.color = new Color(0, 0, 0, 0.001f);
            var btn = hit.gameObject.AddComponent<Button>(); btn.targetGraphic = hitImg; btn.transition = Selectable.Transition.None;
            btn.onClick.AddListener(() => SetPaused(true));
            hit.gameObject.AddComponent<PressScale>();
            bool kit = skin && skin.button;
            var art = UiKit.Plate(hit, "Art", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(72, 72), Plate);
            if (kit) UiKit.ApplyKit(art, skin.button, new Vector2(72, 72), UiKit.ButtonSliceScale);
            var bar = kit ? UiKit.Navy : Color.white;
            UiKit.Plate(art.transform, "BarL", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-9, 2), new Vector2(11, 30), bar);
            UiKit.Plate(art.transform, "BarR", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(9, 2), new Vector2(11, 30), bar);
        }

        void BuildLoadBar(RectTransform safe, HudSkin skin)
        {
            // navy track (a dark recess, so it holds 3:1 on sky and snow), candy plate as the fill
            var track = UiKit.Plate(safe, "LoadBack", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -24), new Vector2(LoadW + 8, LoadH + 10), UiKit.Navy);
            _loadFill = UiKit.Plate(track.transform, "Fill", new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(4, 0), new Vector2(LoadW, LoadH), Plate);
            if (skin && skin.button)
            {
                UiKit.ApplyKit(_loadFill, skin.button, new Vector2(LoadW, LoadH), UiKit.ButtonSliceScale);
                var b = skin.button.border; _loadFillMinW = (b.x + b.z) / _loadFill.pixelsPerUnitMultiplier;
            }
            var lt = UiKit.Label(track.transform, "LOAD", 20, UiKit.Navy, TextAnchor.MiddleCenter, false);
            var o = lt.gameObject.AddComponent<Outline>(); o.effectColor = Color.white; o.effectDistance = new Vector2(1.5f, -1.5f);
        }

        void BuildPause(RectTransform root)
        {
            _pause = new GameObject("PausePanel", typeof(RectTransform));
            var rt = (RectTransform)_pause.transform; rt.SetParent(root, false);
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = rt.offsetMax = Vector2.zero;
            var dim = _pause.AddComponent<Image>(); dim.color = new Color(0.08f, 0.1f, 0.16f, 0.55f);
            var card = UiKit.KitPanel(rt, "Card", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(660, 580));
            var title = UiKit.Label(card.transform, "PAUSED", 48, UiKit.PanelInk, TextAnchor.MiddleCenter, false); TopStrip(title.rectTransform, 90, -24);

            var grey = new Color(0.38f, 0.42f, 0.55f);
            UiKit.KitButton(card.transform, "Resume", "RESUME", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -116), new Vector2(300, 88), new Color(0.27f, 0.75f, 0.30f), () => SetPaused(false), 32);
            UiKit.KitButton(card.transform, "Retry", "RETRY", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(-170, -216), new Vector2(160, 76), Plate, () => { SetPaused(false); _sim.Restart(); }, 26);
            UiKit.KitButton(card.transform, "Garage", "GARAGE", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -216), new Vector2(170, 76), Plate, () => { SetPaused(false); if (garage) garage.Open(); }, 26);
            var calm = UiKit.KitButton(card.transform, "Calm", "CALM MOTION", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -310), new Vector2(430, 76), grey, ToggleCalm, 26);
            _calmLabel = calm.GetComponentInChildren<Text>();

            var ql = UiKit.Label(card.transform, "QUALITY", 24, UiKit.PanelInk, TextAnchor.MiddleCenter, false);
            ql.rectTransform.anchorMin = ql.rectTransform.anchorMax = new Vector2(0.5f, 1); ql.rectTransform.pivot = new Vector2(0.5f, 1);
            ql.rectTransform.sizeDelta = new Vector2(300, 32); ql.rectTransform.anchoredPosition = new Vector2(0, -394);
            string[] names = { "LOW", "MED", "HIGH", "ULTRA" };
            for (int i = 0; i < 4; i++)
            {
                int lvl = i;
                UiKit.KitButton(card.transform, "Q" + i, names[i], new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(-228 + i * 152, -432), new Vector2(140, 76), grey,
                    () => { if (QualityPresets.Instance) QualityPresets.Instance.SetLevel((QualityLevel)lvl); }, 22);
            }
            _pause.SetActive(false);
        }

        void BuildFinish(RectTransform root)
        {
            // compact card; placed in the top band by PlaceFinishCard (anchor bottom-left so screen pixels map directly)
            var card = UiKit.KitPanel(root, "FinishPanel", Vector2.zero, Vector2.zero, Vector2.zero, FinishCardSize);
            _finish = card.gameObject; _finishRt = card.rectTransform;
            var title = UiKit.Label(_finishRt, "DELIVERED!", 52, UiKit.PanelInk, TextAnchor.MiddleCenter, false); TopStrip(title.rectTransform, 80, -18);
            UiKit.KitButton(_finishRt, "Retry", "AGAIN", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(-118, 26), new Vector2(210, 84), new Color(0.27f, 0.75f, 0.30f), () => { _sim.Restart(); }, 32);
            UiKit.KitButton(_finishRt, "Garage", "GARAGE", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(118, 26), new Vector2(210, 84), Plate, () => { if (garage) garage.Open(); }, 32);
            _finish.SetActive(false);
        }

        static void TopStrip(RectTransform rt, float height, float y)
        {
            rt.anchorMin = new Vector2(0, 1); rt.anchorMax = new Vector2(1, 1); rt.pivot = new Vector2(0.5f, 1);
            rt.sizeDelta = new Vector2(0, height); rt.anchoredPosition = new Vector2(0, y);
        }

        // ------------------------------------------------------------------------------ state for tests and the crash repro
        public string ToastText => _toast != null ? _toast.text : "";
        public bool FinishShown => _finish != null && _finish.activeSelf;
        public bool PedalsVisible => _pedalsVisible;
        /// <summary>Screen-pixel rect of the DELIVERED card after the last placement.</summary>
        public Rect FinishCardRect { get; private set; }
        /// <summary>False when the last placement could not avoid the truck.</summary>
        public bool FinishCardClear { get; private set; } = true;
        public float ZoneHintAlpha => _gasFrame != null ? _gasFrame.color.a : 0f;

        /// <summary>Zone-outline opacity after t seconds of a run: full, then one fade (a cut in Calm motion).</summary>
        public static float ZoneHintAlphaAt(float t, bool calm)
        {
            if (t < ZoneHintSeconds) return 1f;
            if (calm) return 0f;
            return Mathf.Clamp01(1f - (t - ZoneHintSeconds) / ZoneHintFadeSeconds);
        }

        // ------------------------------------------------------------------------------ logic
        void OnSimEvent(SimEvent e)
        {
            switch (e.kind)
            {
                case SimEventKind.BigAir: Toast("WOOO!"); break;
                case SimEventKind.Crash: Toast("Ouch!"); break;
                case SimEventKind.Finish: Toast("Delivered!"); _finishShowT = 1.5f; SetPedalsVisible(false); break;
                case SimEventKind.Respawn: ClearTransient(); break;
            }
        }

        void OnRestart() { _finish.SetActive(false); _finishShowT = -1f; _runT = 0f; SetPedalsVisible(true); ClearTransient(); }

        /// <summary>A new attempt starts clean: no "Ouch!" or "WOOO!" left over from the last one.</summary>
        internal void ClearTransient() { if (_toast != null) _toast.text = ""; _toastT = 0f; }

        public void Toast(string s) { _toast.text = s; _toastT = 1.5f; }

        internal void SetPedalsVisible(bool on)
        {
            _pedalsVisible = on;
            if (_gasZone) _gasZone.gameObject.SetActive(on);
            if (_brakeZone) _brakeZone.gameObject.SetActive(on);
        }

        /// <summary>Shows the DELIVERED card placed clear of the truck. All rects in screen pixels.</summary>
        internal void ShowFinish(Rect safePx, Rect truckPx, float canvasScale)
        {
            SetPedalsVisible(false);
            ClearTransient();
            PlaceFinishCard(safePx, truckPx, canvasScale);
            _finish.SetActive(true);
        }

        void PlaceFinishCard(Rect safePx, Rect truckPx, float canvasScale)
        {
            var r = HudLayout.PlaceFinishCard(safePx, canvasScale, FinishCardSize, truckPx, out bool clear);
            float k = r.width / (FinishCardSize.x * canvasScale);
            _finishRt.anchorMin = _finishRt.anchorMax = Vector2.zero; _finishRt.pivot = Vector2.zero;
            _finishRt.sizeDelta = FinishCardSize; _finishRt.localScale = new Vector3(k, k, 1f);
            _finishRt.anchoredPosition = r.position / canvasScale;
            FinishCardRect = r; FinishCardClear = clear;
        }

        Rect TruckScreenRect()
        {
            var cam = Camera.main;
            if (cam == null || _truckRenderers == null) return Rect.zero;
            bool any = false; var b = new Bounds();
            foreach (var r in _truckRenderers)
            {
                if (r == null || !r.enabled || !r.gameObject.activeInHierarchy) continue;
                if (!any) { b = r.bounds; any = true; } else b.Encapsulate(r.bounds);
            }
            return any ? HudLayout.ScreenRect(cam, b) : Rect.zero;
        }

        Rect SafePx() => Screen.safeArea;
        float CanvasScale() => _canvas != null && _canvas.scaleFactor > 0f ? _canvas.scaleFactor : HudLayout.CanvasScale(new Vector2(Screen.width, Screen.height));

        public void SetPaused(bool p)
        {
            _paused = p;
            if (_sim) _sim.Paused = p;
            if (input) input.Blocked = p || (garage && garage.IsOpen);
            _pause.SetActive(p);
            RefreshCalm();
        }

        void ToggleCalm() { MMSettings.CalmMotion = !MMSettings.CalmMotion; RefreshCalm(); }
        void RefreshCalm() { if (_calmLabel) _calmLabel.text = "CALM MOTION: " + (MMSettings.CalmMotion ? "ON" : "off"); }

        void Update()
        {
            if (_sim == null) return;
            var s = _sim.Render;
            if (!_sim.Paused) _runT += Time.unscaledDeltaTime;

            if (s.finished && _pedalsVisible) SetPedalsVisible(false);
            if (input && _pedalsVisible)
            {
                SetZone(_gasZone, input.GasZone); SetZone(_brakeZone, input.BrakeZone);
                Press(_gasPedal, input.GasHeld); Press(_brakePedal, input.BrakeHeld);
                float a = ZoneHintAlphaAt(_runT, MMSettings.CalmMotion);
                SetAlpha(_gasFrame, a); SetAlpha(_brakeFrame, a);
            }

            UpdateLoad(Mathf.Clamp01(s.load01));
            UpdateStars(s.finished, Mathf.Clamp01(s.chassisPos.x / Mathf.Max(1f, finishX)));

            if (_toastT > 0f) { _toastT -= Time.unscaledDeltaTime; if (_toastT <= 0f) _toast.text = ""; }
            if (_finishShowT > 0f) { _finishShowT -= Time.unscaledDeltaTime; if (_finishShowT <= 0f) ShowFinish(SafePx(), TruckScreenRect(), CanvasScale()); }
            else if (FinishShown)
            {
                // the finish camera keeps moving: re-place only if the truck has come under the card
                var truck = TruckScreenRect();
                if (truck.Overlaps(FinishCardRect)) PlaceFinishCard(SafePx(), truck, CanvasScale());
            }

            Keys();
        }

        void UpdateLoad(float load)
        {
            float w = LoadW * load;
            _loadFill.enabled = w >= Mathf.Max(2f, _loadFillMinW);
            _loadFill.rectTransform.sizeDelta = new Vector2(w, LoadH);
            if (_loadFillMinW <= 0f) _loadFill.color = load >= 0.995f ? Gold : Plate;   // fallback plate only: kit art is never tinted
        }

        void UpdateStars(bool finished, float prog)
        {
            var skin = HudSkin.Current;
            for (int i = 0; i < 3; i++)
            {
                bool on = finished || prog >= (i + 1) / 3.2f;
                if (skin && skin.starFull && skin.starEmpty) { var sp = on ? skin.starFull : skin.starEmpty; if (_stars[i].sprite != sp) _stars[i].sprite = sp; }
                else _stars[i].color = on ? Gold : SocketFallback;
            }
        }

        static void SetAlpha(Image img, float a) { var c = img.color; if (!Mathf.Approximately(c.a, a)) { c.a = a; img.color = c; } }

        static void SetZone(RectTransform z, Rect r)
        {
            z.anchorMin = new Vector2(r.xMin, r.yMin); z.anchorMax = new Vector2(r.xMax, r.yMax);
            z.offsetMin = z.offsetMax = Vector2.zero;
        }

        static void Press(Image pedal, bool held)
        {
            float k = held ? 0.92f : 1f;
            pedal.transform.localScale = Vector3.Lerp(pedal.transform.localScale, new Vector3(k, k, 1), 0.4f);
        }

        void Keys()
        {
            var kb = Keyboard.current; if (kb == null) return;
            if (kb.escapeKey.wasPressedThisFrame) { if (garage && garage.IsOpen) garage.Close(); else SetPaused(!_paused); }
            if (kb.rKey.wasPressedThisFrame) { SetPaused(false); _sim.Restart(); }
            if (kb.gKey.wasPressedThisFrame && garage) { if (garage.IsOpen) garage.Close(); else garage.Open(); }
            if (kb.cKey.wasPressedThisFrame) { ToggleCalm(); Toast("Calm motion " + (MMSettings.CalmMotion ? "ON" : "off")); }
            if (kb.f3Key.wasPressedThisFrame && Weather.Instance) { var w = Weather.Instance; w.SetWeather((WeatherKind)(((int)w.kind + 1) % 3)); Toast("Weather: " + w.kind); }
            if (kb.tKey.wasPressedThisFrame && DayNight.Instance) { DayNight.Instance.SetTime(DayNight.Instance.time01 + 0.1f); Toast("Time " + DayNight.Instance.Phase); }
            if (QualityPresets.Instance != null)
            {
                if (kb.digit1Key.wasPressedThisFrame) QualityPresets.Instance.SetLevel(QualityLevel.Low);
                if (kb.digit2Key.wasPressedThisFrame) QualityPresets.Instance.SetLevel(QualityLevel.Medium);
                if (kb.digit3Key.wasPressedThisFrame) QualityPresets.Instance.SetLevel(QualityLevel.High);
                if (kb.digit4Key.wasPressedThisFrame) QualityPresets.Instance.SetLevel(QualityLevel.Ultra);
            }
        }
    }
}
