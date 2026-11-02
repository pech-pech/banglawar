using System.Collections.Generic;
using System.IO;
using System.Reflection;
using NUnit.Framework;
using UnityEngine;
using MixerMad.Game;

namespace MixerMad.Tests
{
    /// <summary>
    /// D6 (HUD contrast) and D7 (finish state). Background colours are read from the live DayNight keys and the
    /// Snow_Road material, and the kit's edge colours are measured from the PNGs, so nothing here is typed from memory.
    /// </summary>
    public class HudTests
    {
        const string ArtUi = "Assets/MixerMad/Art/UI/";
        static readonly string[] KitArt = { "F04-button-9slice", "ui2_candy_gas", "ui2_candy_brake", "ui2_candy_star_empty", "ui2_candy_star_full" };

        readonly List<GameObject> _made = new List<GameObject>();
        [TearDown] public void TearDown() { HudSkin.ForceFallback = false; foreach (var g in _made) if (g) Object.DestroyImmediate(g); _made.Clear(); }

        // ------------------------------------------------------------------ background colours from the project
        static List<Color> SkyKeyColours()
        {
            var t = typeof(DayNight);
            var keysField = t.GetField("Keys", BindingFlags.NonPublic | BindingFlags.Static);
            Assert.NotNull(keysField, "DayNight.Keys not found: update this test with the new key table name");
            var keys = (System.Array)keysField.GetValue(null);
            var cols = new List<Color>();
            foreach (var k in keys)
                foreach (var name in new[] { "skyTop", "skyHorizon", "skyBottom" })
                    cols.Add((Color)k.GetType().GetField(name).GetValue(k));
            Assert.Greater(cols.Count, 0);
            return cols;
        }

        static Color Brightest(List<Color> c) { var b = c[0]; foreach (var x in c) if (Wcag.Luminance(x) > Wcag.Luminance(b)) b = x; return b; }
        static Color Darkest(List<Color> c) { var b = c[0]; foreach (var x in c) if (Wcag.Luminance(x) < Wcag.Luminance(b)) b = x; return b; }

        static Color SnowColour()
        {
            var m = Resources.Load<Material>("MixerMad/Snow_Road");
            Assert.NotNull(m, "Snow_Road material missing");
            Assert.IsTrue(m.HasProperty("_SnowColor"), "Snow_Road has no _SnowColor");
            return m.GetColor("_SnowColor");
        }

        // ------------------------------------------------------------------ kit edge measurement
        static Texture2D LoadPng(string name)
        {
            var path = ArtUi + name + ".png";
            Assert.IsTrue(File.Exists(path), "kit art missing: " + path);
            var t = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            Assert.IsTrue(t.LoadImage(File.ReadAllBytes(path)));
            return t;
        }

        /// <summary>Median-luminance colour of the outermost opaque pixels (within 3 px of transparency): the edge the eye sees against the world.</summary>
        static Color Rim(Texture2D t) => Median(t, true);

        /// <summary>Median-luminance colour of the opaque pixels inside the rim: the candy body.</summary>
        static Color Body(Texture2D t) => Median(t, false);

        static Color Median(Texture2D t, bool wantRim)
        {
            var px = t.GetPixels(); int w = t.width, h = t.height;
            var picked = new List<Color>();
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    if (px[y * w + x].a < 0.95f) continue;
                    bool edge = false;
                    for (int dy = -3; dy <= 3 && !edge; dy++)
                        for (int dx = -3; dx <= 3 && !edge; dx++)
                        {
                            int xx = x + dx, yy = y + dy;
                            edge = xx < 0 || yy < 0 || xx >= w || yy >= h || px[yy * w + xx].a < 0.5f;
                        }
                    if (edge == wantRim) picked.Add(px[y * w + x]);
                }
            Assert.Greater(picked.Count, 10);
            picked.Sort((a, b) => Wcag.Luminance(a).CompareTo(Wcag.Luminance(b)));
            return picked[picked.Count / 2];
        }

        static Color Centre(Texture2D t) => t.GetPixel(t.width / 2, t.height / 2);

        static void Check(string what, Color fg, Color bg, string bgName, List<string> log, List<string> fails, float min = Wcag.NonTextMinimum)
        {
            float r = Wcag.Contrast(fg, bg);
            string line = $"{what} vs {bgName}: {r:0.00}:1";
            log.Add(line);
            if (r < min) fails.Add(line);
        }

        [Test]
        public void HudEdges_AtLeast3to1_OnBrightestSkyAndSnow()
        {
            var sky = SkyKeyColours();
            Color bright = Brightest(sky), snow = SnowColour();
            var log = new List<string> { $"brightest sky #{ColorUtility.ToHtmlStringRGB(bright)}, snow #{ColorUtility.ToHtmlStringRGB(snow)}" };
            var fails = new List<string>();
            foreach (var n in KitArt)
            {
                var rim = Rim(LoadPng(n));
                Check(n + " rim #" + ColorUtility.ToHtmlStringRGB(rim), rim, bright, "brightest sky", log, fails);
                Check(n + " rim", rim, snow, "snow", log, fails);
            }
            // code-drawn parts: LOAD track and the zone outline edge are UiKit.Navy
            Check("LOAD track / zone edge (navy)", UiKit.Navy, bright, "brightest sky", log, fails);
            Check("LOAD track / zone edge (navy)", UiKit.Navy, snow, "snow", log, fails);
            Check("LOAD track / zone edge (navy)", UiKit.Navy, Color.white, "white cloud", log, fails);
            foreach (var l in log) Debug.Log("[HUD-CONTRAST] " + l);
            Assert.IsEmpty(fails, string.Join("\n", fails));
        }

        [Test]
        public void HudEdges_StillReadAtNight_AndGlyphsReadOnTheirPlates()
        {
            var sky = SkyKeyColours();
            Color dark = Darkest(sky);
            var log = new List<string> { $"darkest sky #{ColorUtility.ToHtmlStringRGB(dark)}" };
            var fails = new List<string>();
            // at night the navy rims sink into the sky; the candy body (or the frame's white line) must carry the shape
            foreach (var n in KitArt)
            {
                var t = LoadPng(n);
                Color body = Body(t), rim = Rim(t);
                Color best = Wcag.Contrast(body, dark) >= Wcag.Contrast(rim, dark) ? body : rim;
                Check(n + " body/rim", best, dark, "darkest sky", log, fails);
            }
            Check("zone edge inner line (white)", Color.white, dark, "darkest sky", log, fails);
            // pause bars and button labels are navy ink on the candy button face
            var face = Centre(LoadPng("F04-button-9slice"));
            Check("navy ink on button face", UiKit.Navy, face, "button face", log, fails, 4.5f);
            var panelFace = Centre(LoadPng("F04-panel-9slice"));
            Check("navy title on panel face", UiKit.Navy, panelFace, "panel face", log, fails, 4.5f);
            foreach (var l in log) Debug.Log("[HUD-CONTRAST] " + l);
            Assert.IsEmpty(fails, string.Join("\n", fails));
        }

        // ------------------------------------------------------------------ the kit is wired, sliced and untinted
        [Test]
        public void Kit_IsLoaded_WithFourSidedSlices()
        {
            var skin = HudSkin.Current;
            Assert.NotNull(skin, "HudSkin asset missing: run MixerMad.Editor.UiKitImport.Run");
            Assert.NotNull(skin.button); Assert.NotNull(skin.panel); Assert.NotNull(skin.gas); Assert.NotNull(skin.brake);
            Assert.NotNull(skin.starEmpty); Assert.NotNull(skin.starFull);
            Assert.AreEqual(new Vector4(210, 180, 210, 180), skin.button.border, "F04 button insets (F04-9SLICE-NOTES.md)");
            Assert.AreEqual(new Vector4(330, 330, 330, 330), skin.panel.border, "F04 panel insets (F04-9SLICE-NOTES.md)");
        }

        [Test]
        public void KitButton_IsSlicedFillCenterAndUntinted()
        {
            var parent = Track(new GameObject("UI")).transform;
            var b = UiKit.KitButton(parent, "B", "GO", Vector2.zero, Vector2.zero, Vector2.zero, new Vector2(200, 80), Color.red, null);
            var img = (UnityEngine.UI.Image)b.targetGraphic;
            Assert.AreEqual(UnityEngine.UI.Image.Type.Sliced, img.type);
            Assert.IsTrue(img.fillCenter);
            Assert.AreEqual(Color.white, img.color, "kit art must not be tinted");
            Assert.AreEqual(UnityEngine.UI.Selectable.Transition.None, b.transition);
        }

        // ------------------------------------------------------------------ zone hint: shown, then one fade, no pulse
        [Test]
        public void ZoneHint_ShowsThenFadesOnce_CutInCalmMotion()
        {
            Assert.AreEqual(1f, Hud.ZoneHintAlphaAt(0f, false));
            Assert.AreEqual(1f, Hud.ZoneHintAlphaAt(Hud.ZoneHintSeconds - 0.01f, false));
            Assert.AreEqual(0f, Hud.ZoneHintAlphaAt(Hud.ZoneHintSeconds + Hud.ZoneHintFadeSeconds + 0.01f, false));
            Assert.AreEqual(0f, Hud.ZoneHintAlphaAt(Hud.ZoneHintSeconds + 0.01f, true), "Calm motion cuts instead of fading");
            float prev = 1f;
            for (float t = 0f; t < 30f; t += 0.05f)
            {
                float a = Hud.ZoneHintAlphaAt(t, false);
                Assert.LessOrEqual(a, prev + 1e-6f, "the zone hint pulsed back up at t=" + t);
                prev = a;
            }
        }

        // ------------------------------------------------------------------ D7: finish state
        static readonly Vector2[] Screens = { new Vector2(1920, 1200), new Vector2(2176, 1812), new Vector2(1920, 1080) };

        /// <summary>Truck rects as fractions of the screen (x0, y0, x1, y1, origin bottom-left). The first is the 04 still.</summary>
        static readonly Rect[] TruckFractions =
        {
            Rect.MinMaxRect(0.40f, 0.00f, 0.79f, 0.45f),   // P2 04_finish: close finish camera, truck in the lower right half
            Rect.MinMaxRect(0.30f, 0.05f, 0.70f, 0.55f),   // centred, taller
            Rect.MinMaxRect(0.40f, 0.15f, 0.78f, 0.68f),   // pushed in and high: the centre slot is blocked
        };

        static Rect Scale(Rect f, Vector2 s) => Rect.MinMaxRect(f.xMin * s.x, f.yMin * s.y, f.xMax * s.x, f.yMax * s.y);

        [Test]
        public void FinishCard_PlacementAvoidsTheTruck_InTheTopBand_AtBothAspects()
        {
            foreach (var screen in Screens)
                foreach (var tf in TruckFractions)
                {
                    var safe = new Rect(0, 0, screen.x, screen.y);
                    var truck = Scale(tf, screen);
                    float scale = HudLayout.CanvasScale(screen);
                    var r = HudLayout.PlaceFinishCard(safe, scale, Hud.FinishCardSize, truck, out bool clear);
                    string at = $"{screen.x}x{screen.y} truck {truck}";
                    Assert.IsTrue(clear, "no clear placement at " + at);
                    Assert.IsFalse(r.Overlaps(truck), "card " + r + " covers the truck at " + at);
                    Assert.GreaterOrEqual(r.yMin, screen.y * 0.5f, "card left the top half at " + at);
                    Assert.LessOrEqual(r.yMax, screen.y - HudLayout.TopRowReserved * scale + 0.5f, "card covers the top HUD row at " + at);
                    Assert.GreaterOrEqual(r.xMin, 0f); Assert.LessOrEqual(r.xMax, screen.x);
                    Debug.Log($"[HUD-FINISH] {at} -> card {r}");
                }
        }

        [Test]
        public void FinishCard_RespectsTheSafeArea()
        {
            var screen = new Vector2(2176, 1812);
            var safe = new Rect(90, 40, screen.x - 180, screen.y - 120);   // cut-outs on all sides
            float scale = HudLayout.CanvasScale(screen);
            var r = HudLayout.PlaceFinishCard(safe, scale, Hud.FinishCardSize, Scale(TruckFractions[0], screen), out _);
            Assert.IsTrue(safe.Contains(r.min) && safe.Contains(r.max), "card " + r + " outside safe area " + safe);
        }

        [Test]
        public void FinishState_HidesPedals_AndCardClearsTheTruck()
        {
            var input = Track(new GameObject("Input")).AddComponent<InputReader>();
            var hud = Track(Hud.Build(Track(new GameObject("UI")).transform, input).gameObject).GetComponent<Hud>();
            Assert.IsTrue(hud.PedalsVisible);
            var screen = new Vector2(1920, 1200);
            var truck = Scale(TruckFractions[0], screen);
            hud.Toast("Delivered!");
            hud.ShowFinish(new Rect(0, 0, screen.x, screen.y), truck, HudLayout.CanvasScale(screen));
            Assert.IsTrue(hud.FinishShown);
            Assert.IsFalse(hud.PedalsVisible, "GAS and BRAKE stayed on the finish card");
            Assert.IsTrue(hud.FinishCardClear);
            Assert.IsFalse(hud.FinishCardRect.Overlaps(truck), "the DELIVERED card covers the truck");
            Assert.AreEqual("", hud.ToastText, "the toast would sit on the card");
        }

        [Test]
        public void Hud_BuildsOnTheCodeFallback_WhenTheKitIsMissing()
        {
            HudSkin.ForceFallback = true;
            var input = Track(new GameObject("Input")).AddComponent<InputReader>();
            var hud = Hud.Build(Track(new GameObject("UI")).transform, input);
            Track(hud.gameObject);
            Assert.IsTrue(hud.PedalsVisible);
            hud.Toast("Ouch!"); hud.ClearTransient();
            Assert.AreEqual("", hud.ToastText);
        }

        GameObject Track(GameObject g) { _made.Add(g); return g; }
    }
}
