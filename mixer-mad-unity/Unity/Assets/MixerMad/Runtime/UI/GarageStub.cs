using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace MixerMad.Game
{
    /// <summary>
    /// Garage stub: pauses the sim, orbits a Cinemachine camera around the truck (drag = rotate, wheel or pinch =
    /// zoom), skin swatches repaint the truck live (material swap only), tap the drum/chute buttons to wiggle parts,
    /// biome list (only the snowy pass exists), quality row, Calm motion toggle, big DRIVE button.
    /// The truck is NOT moved: the garage camera goes to the truck, so the sim state is untouched.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class GarageStub : MonoBehaviour
    {
        public CameraRig cameraRig;
        public TruckView truck;
        public InputReader input;
        public bool IsOpen { get; private set; }

        GameObject _panel, _root;
        Text _calmLabel;
        string _skin = "Toy_Yellow";
        static readonly string[] SkinNames = { "Toy_Yellow", "Skin_Sky", "Skin_Lime", "Skin_Pink" };
        static readonly Color[] SkinSwatch = { new Color(1f, 0.76f, 0.1f), new Color(0.25f, 0.65f, 0.91f), new Color(0.55f, 0.82f, 0.23f), new Color(1f, 0.5f, 0.71f) };

        public static GarageStub Build(Transform parent, CameraRig rig, TruckView truck, InputReader input)
        {
            var go = new GameObject("Garage");
            go.transform.SetParent(parent, false);
            var g = go.AddComponent<GarageStub>();
            g.cameraRig = rig; g.truck = truck; g.input = input;
            g.BuildUi();
            return g;
        }

        void BuildUi()
        {
            var canvas = UiKit.Canvas(transform, "Garage_Canvas", 20);
            _root = canvas.gameObject;
            var root = (RectTransform)canvas.transform;
            var safe = UiKit.Rect(root, "SafeArea", Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            safe.gameObject.AddComponent<SafeAreaRoot>();
            _panel = safe.gameObject;

            var title = UiKit.Label(safe, "GARAGE", 56, Color.white, TextAnchor.UpperLeft);
            title.rectTransform.anchorMin = new Vector2(0, 1); title.rectTransform.anchorMax = new Vector2(0, 1); title.rectTransform.pivot = new Vector2(0, 1);
            title.rectTransform.anchoredPosition = new Vector2(100, -24); title.rectTransform.sizeDelta = new Vector2(420, 70);
            UiKit.Button(safe, "Back", "<", new Vector2(0, 1), new Vector2(0, 1), new Vector2(20, -20), new Vector2(72, 72), new Color(0.2f, 0.55f, 0.95f), Close, 36);

            var sub = UiKit.Label(safe, "Mixer (placeholder art)   speed|grip|load", 24, new Color(0.88f, 0.93f, 1f), TextAnchor.UpperLeft);
            sub.rectTransform.anchorMin = new Vector2(0, 1); sub.rectTransform.anchorMax = new Vector2(0, 1); sub.rectTransform.pivot = new Vector2(0, 1);
            sub.rectTransform.anchoredPosition = new Vector2(104, -88); sub.rectTransform.sizeDelta = new Vector2(700, 32);

            // skins: swatch chips along the bottom
            for (int i = 0; i < SkinNames.Length; i++)
            {
                int k = i;
                UiKit.Button(safe, "Skin" + i, "", new Vector2(0, 0), new Vector2(0, 0), new Vector2(24 + i * 84, 24), new Vector2(72, 72), SkinSwatch[i], () => ApplySkin(SkinNames[k]));
            }
            // wiggle parts
            UiKit.Button(safe, "Drum", "DRUM", new Vector2(0, 0), new Vector2(0, 0), new Vector2(24, 112), new Vector2(150, 72), new Color(1f, 0.48f, 0.1f), () => { if (truck) truck.Poke(true); }, 24);
            UiKit.Button(safe, "Chute", "CHUTE", new Vector2(0, 0), new Vector2(0, 0), new Vector2(186, 112), new Vector2(150, 72), new Color(1f, 0.48f, 0.1f), () => { if (truck) truck.Poke(false); }, 24);

            // biome (right)
            var bl = UiKit.Label(safe, "BIOME", 24, new Color(0.88f, 0.93f, 1f), TextAnchor.UpperRight);
            bl.rectTransform.anchorMin = new Vector2(1, 1); bl.rectTransform.anchorMax = new Vector2(1, 1); bl.rectTransform.pivot = new Vector2(1, 1);
            bl.rectTransform.anchoredPosition = new Vector2(-24, -28); bl.rectTransform.sizeDelta = new Vector2(300, 32);
            string[] biomes = { "Snowy pass", "City site (soon)", "Desert dig (soon)", "Jungle quarry (soon)" };
            for (int i = 0; i < biomes.Length; i++)
            {
                var b = UiKit.Button(safe, "Biome" + i, biomes[i], new Vector2(1, 1), new Vector2(1, 1), new Vector2(-24, -66 - i * 80), new Vector2(300, 72), i == 0 ? new Color(0.2f, 0.55f, 0.95f) : new Color(0.38f, 0.42f, 0.5f), null, 24);
                b.interactable = i == 0;
            }

            // settings: quality + calm
            var calm = UiKit.Button(safe, "Calm", "CALM MOTION", new Vector2(1, 0), new Vector2(1, 0), new Vector2(-24, 220), new Vector2(380, 72), new Color(0.38f, 0.42f, 0.55f), () => { MMSettings.CalmMotion = !MMSettings.CalmMotion; RefreshCalm(); }, 24);
            _calmLabel = calm.GetComponentInChildren<Text>();
            string[] q = { "LOW", "MED", "HIGH", "ULTRA" };
            for (int i = 0; i < 4; i++)
            {
                int lvl = i;
                UiKit.Button(safe, "Q" + i, q[i], new Vector2(1, 0), new Vector2(1, 0), new Vector2(-24 - (3 - i) * 96 - 0, 130), new Vector2(88, 72), new Color(0.38f, 0.42f, 0.55f), () => { if (QualityPresets.Instance) QualityPresets.Instance.SetLevel((QualityLevel)lvl); }, 20);
            }
            UiKit.Button(safe, "Drive", "DRIVE", new Vector2(1, 0), new Vector2(1, 0), new Vector2(-24, 24), new Vector2(240, 88), new Color(0.27f, 0.75f, 0.30f), Close, 36);
            _root.SetActive(false);
        }

        void RefreshCalm() { if (_calmLabel) _calmLabel.text = "CALM MOTION: " + (MMSettings.CalmMotion ? "ON" : "off"); }

        public void Open()
        {
            if (IsOpen) return;
            IsOpen = true; _root.SetActive(true); RefreshCalm();
            var sim = SimDriver.Instance; if (sim) sim.Paused = true;
            if (input) input.Blocked = true;
            if (cameraRig && sim) { var c = sim.Render.chassisPos; cameraRig.SetGarage(true, new Vector3(c.x, c.y + 1.3f, 0f)); }
        }

        public void Close()
        {
            if (!IsOpen) return;
            IsOpen = false; _root.SetActive(false);
            var sim = SimDriver.Instance; if (sim) sim.Paused = false;
            if (input) input.Blocked = false;
            if (cameraRig) cameraRig.SetGarage(false, Vector3.zero);
        }

        public void ApplySkin(string mat)
        {
            if (truck == null) return;
            var next = MMMaterials.Get(mat); var prev = MMMaterials.Get(_skin);
            foreach (var r in truck.GetComponentsInChildren<MeshRenderer>(true))
            {
                // Blender meshes carry several materials per renderer: swap every slot that uses the old skin
                var mats = r.sharedMaterials; bool hit = false;
                for (int i = 0; i < mats.Length; i++) if (mats[i] == prev) { mats[i] = next; hit = true; }
                if (hit) r.sharedMaterials = mats;
            }
            _skin = mat;
        }

        void Update()
        {
            if (!IsOpen) return;
            // turntable: drag to rotate, wheel / pinch to zoom (not when the pointer is over a button)
            bool overUi = EventSystem.current != null && EventSystem.current.IsPointerOverGameObject();
            float dy = 0f, dp = 0f, dz = 0f;
            var ts = Touchscreen.current;
            int touches = 0;
            if (ts != null) foreach (var t in ts.touches) if (t.press.isPressed) touches++;
            if (touches >= 2)
            {
                var a = ts.touches[0]; var b = ts.touches[1];
                float d = Vector2.Distance(a.position.ReadValue(), b.position.ReadValue());
                float dprev = Vector2.Distance(a.position.ReadValue() - a.delta.ReadValue(), b.position.ReadValue() - b.delta.ReadValue());
                dz = -(d - dprev) * 0.02f;
            }
            else if (!overUi)
            {
                var ptr = Pointer.current;
                if (ptr != null && ptr.press.isPressed) { Vector2 d = ptr.delta.ReadValue(); dy = d.x * 0.25f; dp = -d.y * 0.2f; }
            }
            var m = Mouse.current; if (m != null) dz += -m.scroll.ReadValue().y * 0.01f;
            if (cameraRig) cameraRig.OrbitGarage(dy, dp, dz);

        }
    }
}
