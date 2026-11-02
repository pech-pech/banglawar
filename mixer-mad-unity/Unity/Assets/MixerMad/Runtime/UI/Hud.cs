using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace MixerMad.Game
{
    /// <summary>
    /// Clean 2D driving HUD (UGUI): pause, load meter, 3 stars, gas and brake pedals, toast line.
    /// Gas/brake touch zones are the InputReader's 22%-wide columns; the pedal art (140 px) is just the hint.
    /// All buttons are >= 64 px with an 80 px hit area. This is a STUB: plates are generated rounded rects,
    /// to be replaced by the glossy 9-slice kits (same Image Sliced + Fill Center setup, so only the sprite changes).
    ///
    /// Desktop shortcuts (QA): Esc pause, R restart, G garage, C calm motion, 1-4 quality,
    /// F3 cycle weather, T +10% time of day, F1 perf overlay, F2 CSV log.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class Hud : MonoBehaviour
    {
        public InputReader input;
        public GarageStub garage;
        public float finishX = 232f;

        SimDriver _sim;
        RectTransform _safe, _gasZone, _brakeZone;
        Image _gasPlate, _brakePlate, _loadBack, _loadFill, _gasHalo, _brakeHalo;
        Image[] _stars = new Image[3];
        Text _toast, _calmLabel, _finishTitle;
        GameObject _pause, _finish;
        float _toastT, _finishShowT = -1f;
        bool _paused;
        static readonly Color Gold = new Color(1f, 0.85f, 0.29f), Navy = new Color(0.13f, 0.145f, 0.17f), Plate = new Color(0.20f, 0.55f, 0.95f);

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
        }

        void OnDestroy() { if (_sim != null) { _sim.SimEventRaised -= OnSimEvent; _sim.Restarted -= OnRestart; } }

        // ------------------------------------------------------------------------------ build
        void BuildUi()
        {
            var canvas = UiKit.Canvas(transform, "HUD_Canvas", 10);
            var root = (RectTransform)canvas.transform;

            // touch-zone hints: faint columns, full height of the zone, art inside
            _brakeZone = Zone(root, "BrakeZone"); _gasZone = Zone(root, "GasZone");
            (_brakePlate, _brakeHalo) = Pedal(_brakeZone, "BRAKE", new Color(0.86f, 0.26f, 0.22f));
            (_gasPlate, _gasHalo) = Pedal(_gasZone, "GAS", new Color(0.27f, 0.75f, 0.30f));

            _safe = UiKit.Rect(root, "SafeArea", Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            _safe.gameObject.AddComponent<SafeAreaRoot>();

            // pause: 64 px art, 80 px hit area
            var hit = UiKit.Rect(_safe, "Pause", new Vector2(0, 1), new Vector2(0, 1), new Vector2(0, 1), new Vector2(20, -20), new Vector2(80, 80));
            var hitImg = hit.gameObject.AddComponent<Image>(); hitImg.color = new Color(0, 0, 0, 0.001f);
            var pauseBtn = hit.gameObject.AddComponent<Button>(); pauseBtn.targetGraphic = hitImg;
            pauseBtn.onClick.AddListener(() => SetPaused(true));
            var art = UiKit.Plate(hit, "Art", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(64, 64), Plate);
            UiKit.Plate(art.transform, "BarL", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-9, 0), new Vector2(10, 28), Color.white);
            UiKit.Plate(art.transform, "BarR", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(9, 0), new Vector2(10, 28), Color.white);

            // load meter (top centre)
            _loadBack = UiKit.Plate(_safe, "LoadBack", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -24), new Vector2(380, 32), new Color(0.13f, 0.145f, 0.17f, 0.85f));
            _loadFill = UiKit.Plate(_loadBack.transform, "Fill", new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(3, 0), new Vector2(374, 26), Plate);
            var lt = UiKit.Label(_loadBack.transform, "LOAD", 20, Color.white); lt.alignment = TextAnchor.MiddleCenter;

            // 3 stars (top right)
            for (int i = 0; i < 3; i++)
                _stars[i] = UiKit.Plate(_safe, "Star" + i, new Vector2(1, 1), new Vector2(1, 1), new Vector2(-24 - (2 - i) * 56 - 0, -26), new Vector2(46, 46), new Color(0.13f, 0.145f, 0.17f, 0.6f), false, UiKit.Circle);

            _toast = UiKit.Label(_safe, "", 32, Color.white);
            var trt = _toast.rectTransform; trt.anchorMin = new Vector2(0.5f, 1); trt.anchorMax = new Vector2(0.5f, 1); trt.pivot = new Vector2(0.5f, 1);
            trt.anchoredPosition = new Vector2(0, -74); trt.sizeDelta = new Vector2(600, 48);

            BuildPause(root);
            BuildFinish(root);
        }

        RectTransform Zone(RectTransform root, string name)
        {
            var z = UiKit.Rect(root, name, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero, Vector2.zero);
            var img = z.gameObject.AddComponent<Image>(); img.sprite = UiKit.Rounded; img.type = Image.Type.Sliced; img.color = new Color(1, 1, 1, 0.045f); img.raycastTarget = false;
            return z;
        }

        (Image, Image) Pedal(RectTransform zone, string label, Color c)
        {
            var halo = UiKit.Plate(zone, "Halo", new Vector2(0.5f, 0.28f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(176, 176), new Color(c.r, c.g, c.b, 0f), false, UiKit.Circle);
            var plate = UiKit.Plate(zone, "Pedal", new Vector2(0.5f, 0.28f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(140, 140), c);
            var t = UiKit.Label(plate.transform, label, 30, Color.white);
            return (plate, halo);
        }

        void BuildPause(RectTransform root)
        {
            _pause = new GameObject("PausePanel", typeof(RectTransform));
            var rt = (RectTransform)_pause.transform; rt.SetParent(root, false);
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = rt.offsetMax = Vector2.zero;
            var dim = _pause.AddComponent<Image>(); dim.color = new Color(0.08f, 0.1f, 0.16f, 0.55f);
            var card = UiKit.Plate(rt, "Card", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(640, 560), new Color(0.18f, 0.22f, 0.32f, 0.97f), true);
            var title = UiKit.Label(card.transform, "PAUSED", 48, Color.white); title.rectTransform.anchorMin = new Vector2(0, 1); title.rectTransform.anchorMax = new Vector2(1, 1); title.rectTransform.pivot = new Vector2(0.5f, 1); title.rectTransform.sizeDelta = new Vector2(0, 90); title.rectTransform.anchoredPosition = new Vector2(0, -10);

            UiKit.Button(card.transform, "Resume", "RESUME", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -110), new Vector2(300, 88), new Color(0.27f, 0.75f, 0.30f), () => SetPaused(false), 32);
            UiKit.Button(card.transform, "Retry", "RETRY", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(-165, -214), new Vector2(150, 72), Plate, () => { SetPaused(false); _sim.Restart(); }, 26);
            UiKit.Button(card.transform, "Garage", "GARAGE", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -214), new Vector2(160, 72), Plate, () => { SetPaused(false); if (garage) garage.Open(); }, 26);
            var calm = UiKit.Button(card.transform, "Calm", "CALM MOTION", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -312), new Vector2(420, 72), new Color(0.38f, 0.42f, 0.55f), ToggleCalm, 26);
            _calmLabel = calm.GetComponentInChildren<Text>();

            var ql = UiKit.Label(card.transform, "QUALITY", 24, new Color(0.85f, 0.9f, 1f)); ql.rectTransform.anchorMin = new Vector2(0.5f, 1); ql.rectTransform.anchorMax = new Vector2(0.5f, 1); ql.rectTransform.pivot = new Vector2(0.5f, 1); ql.rectTransform.sizeDelta = new Vector2(300, 32); ql.rectTransform.anchoredPosition = new Vector2(0, -392);
            string[] names = { "LOW", "MED", "HIGH", "ULTRA" };
            for (int i = 0; i < 4; i++)
            {
                int lvl = i;
                UiKit.Button(card.transform, "Q" + i, names[i], new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(-225 + i * 150, -430), new Vector2(136, 72), new Color(0.38f, 0.42f, 0.55f),
                    () => { if (QualityPresets.Instance) QualityPresets.Instance.SetLevel((QualityLevel)lvl); }, 22);
            }
            _pause.SetActive(false);
        }

        void BuildFinish(RectTransform root)
        {
            _finish = new GameObject("FinishPanel", typeof(RectTransform));
            var rt = (RectTransform)_finish.transform; rt.SetParent(root, false);
            rt.anchorMin = new Vector2(0.5f, 0.5f); rt.anchorMax = rt.anchorMin; rt.pivot = new Vector2(0.5f, 0.5f); rt.sizeDelta = new Vector2(560, 260); rt.anchoredPosition = new Vector2(0, 40);
            var card = _finish.AddComponent<Image>(); card.sprite = UiKit.Rounded; card.type = Image.Type.Sliced; card.color = new Color(0.18f, 0.22f, 0.32f, 0.92f);
            _finishTitle = UiKit.Label(rt, "DELIVERED!", 56, Gold); _finishTitle.rectTransform.anchorMin = new Vector2(0, 1); _finishTitle.rectTransform.anchorMax = new Vector2(1, 1); _finishTitle.rectTransform.pivot = new Vector2(0.5f, 1); _finishTitle.rectTransform.sizeDelta = new Vector2(0, 100); _finishTitle.rectTransform.anchoredPosition = new Vector2(0, -16);
            UiKit.Button(rt, "Retry", "AGAIN", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(-130, 30), new Vector2(220, 88), new Color(0.27f, 0.75f, 0.30f), () => { _sim.Restart(); }, 32);
            UiKit.Button(rt, "Garage", "GARAGE", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(130, 30), new Vector2(220, 88), Plate, () => { if (garage) garage.Open(); }, 32);
            _finish.SetActive(false);
        }

        // ------------------------------------------------------------------------------ logic
        void OnSimEvent(SimEvent e)
        {
            switch (e.kind)
            {
                case SimEventKind.BigAir: Toast("WOOO!"); break;
                case SimEventKind.Crash: Toast("Ouch!"); break;
                case SimEventKind.Finish: Toast("Delivered!"); _finishShowT = 1.5f; break;
            }
        }

        void OnRestart() { _finish.SetActive(false); _finishShowT = -1f; }

        public void Toast(string s) { _toast.text = s; _toastT = 1.5f; }

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

            // zones follow the input reader (swap pedals, near-square screens)
            if (input)
            {
                SetZone(_gasZone, input.GasZone); SetZone(_brakeZone, input.BrakeZone);
                Press(_gasPlate, _gasHalo, input.GasHeld); Press(_brakePlate, _brakeHalo, input.BrakeHeld);
            }

            float load = Mathf.Clamp01(s.load01);
            _loadFill.rectTransform.sizeDelta = new Vector2(374f * load, 26f);
            _loadFill.color = load >= 0.995f ? Gold : Plate;

            float prog = Mathf.Clamp01(s.chassisPos.x / Mathf.Max(1f, finishX));
            for (int i = 0; i < 3; i++)
            {
                bool on = s.finished || prog >= (i + 1) / 3.2f;
                _stars[i].color = on ? Gold : new Color(0.13f, 0.145f, 0.17f, 0.6f);
            }

            if (_toastT > 0f) { _toastT -= Time.unscaledDeltaTime; if (_toastT <= 0f) _toast.text = ""; }
            if (_finishShowT > 0f) { _finishShowT -= Time.unscaledDeltaTime; if (_finishShowT <= 0f) _finish.SetActive(true); }

            Keys();
        }

        static void SetZone(RectTransform z, Rect r)
        {
            z.anchorMin = new Vector2(r.xMin, r.yMin); z.anchorMax = new Vector2(r.xMax, r.yMax);
            z.offsetMin = z.offsetMax = Vector2.zero;
        }

        static void Press(Image plate, Image halo, bool held)
        {
            float k = held ? 0.92f : 1f;
            plate.transform.localScale = Vector3.Lerp(plate.transform.localScale, new Vector3(k, k, 1), 0.4f);
            var c = halo.color; c.a = Mathf.MoveTowards(c.a, held ? 0.35f : 0f, Time.unscaledDeltaTime * 4f); halo.color = c;
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
