using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Conquest.Core.Contracts;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// The polish round's evidence: for every contested decision, each candidate (C1, C2, C3) rendered at 1280 x 720,
    /// 1920 x 1080 and a 1080 x 1920 phone held upright, saved to Screenshots/polish, with a text-free contact sheet
    /// per decision and the measured numbers (numbers.jsonl). Explicit: run it on purpose with
    /// conquest/tools/unity/polish_capture.sh (about a minute). It asserts only that pictures were made.
    /// </summary>
    [Explicit("Writes the polish screenshots; run with tools/unity/polish_capture.sh")]
    public sealed class PolishCaptureTests
    {
        public static readonly (int w, int h, string name)[] Sizes = { (1280, 720, "1280x720"), (1920, 1080, "1920x1080"), (1080, 1920, "1080x1920") };

        /// <summary>A typical 1080 px wide Android phone: 412 dp wide, so 2.625 device pixels per CSS pixel (assumed, not measured).</summary>
        public const int PhoneDprPermille = 2625;

        private static readonly PolishChoice[] Choices = { PolishChoice.C1, PolishChoice.C2, PolishChoice.C3 };
        private readonly StringBuilder numbers = new StringBuilder();
        private MapController map = null!;

        private IEnumerator Boot()
        {
            PolishSettings.Reset();
            GameApp.Reset();
            SceneManager.LoadScene("Boot");
            yield return null;
            float until = Time.realtimeSinceStartup + 20f;
            while (Time.realtimeSinceStartup < until)
            {
                map = Object.FindAnyObjectByType<MapController>();
                if (map != null && map.IsBuilt) break;
                yield return null;
            }

            Assert.NotNull(map);
            yield return ShotKit.Frames(5);
        }

        private UnitView Commander => map.Session.State.AsView().Units.First(u => u.Owner == map.Session.LocalSlot && u.Role == UnitRole.Commander);

        /// <summary>A forest tile: the last dots sit among tall trees.</summary>
        private static readonly GridPos PathTarget = new GridPos(3, 6);

        /// <summary>For the layering shots: a path that also ends under the floating banners of the fortress stack at (6,7).</summary>
        private static readonly GridPos LayeringTarget = new GridPos(5, 5);

        private void SelectCommanderWithPath(GridPos target)
        {
            map.Interaction.Deselect();
            UnitView c = Commander;
            map.Interaction.Click(new PickResult(new GridPos(c.Pos.X, c.Pos.Y), c.Id), false);
            map.Interaction.Hover(new PickResult(target, null));
        }

        [UnityTest]
        public IEnumerator CaptureEveryCandidateAtThreeSizes()
        {
            yield return Boot();
            string folder = ShotKit.Folder("polish");
            Directory.CreateDirectory(folder);
            foreach (PolishDecision decision in (PolishDecision[])System.Enum.GetValues(typeof(PolishDecision)))
            {
                var rows = new List<IReadOnlyList<Texture2D>>();
                foreach (PolishChoice choice in Choices)
                {
                    PolishSettings.Set(PolishOptions.Default.With(decision, choice));
                    var row = new List<Texture2D>();
                    foreach ((int w, int h, string name) size in Sizes)
                    {
                        Texture2D? idle = null;
                        ShotKit.Target target = ShotKit.Begin(map, size.w, size.h);
                        map.Rig.Refit();
                        if (decision == PolishDecision.Selection)
                        {
                            map.Interaction.Deselect();
                            yield return WaitReal(0.3f);
                            idle = ShotKit.Grab(map, target);
                        }

                        SelectCommanderWithPath(decision == PolishDecision.Layering ? LayeringTarget : PathTarget);
                        yield return WaitReal(0.4f); // the hologram fades in over 180 ms of presentation time
                        Texture2D shot = ShotKit.Grab(map, target);
                        string file = Slug(decision) + "-" + choice + "-" + size.name + ".png";
                        ShotKit.Save(shot, Path.Combine("polish", file));
                        Measure(decision, choice, size.w, size.h, idle, shot);
                        if (idle != null) Object.Destroy(idle);
                        ShotKit.End(map, target);
                        row.Add(shot);
                    }

                    rows.Add(row);
                }

                Texture2D sheet = ShotKit.Sheet(rows, 360);
                ShotKit.Save(sheet, Path.Combine("polish", "sheet-" + Slug(decision) + ".png"));
                Object.Destroy(sheet);
                foreach (IReadOnlyList<Texture2D> r in rows)
                {
                    foreach (Texture2D t in r) Object.Destroy(t);
                }
            }

            PolishSettings.Reset();
            File.WriteAllText(Path.Combine(folder, "numbers.jsonl"), numbers.ToString());
            Debug.Log("polish capture written to " + folder);
        }

        private static IEnumerator WaitReal(float seconds)
        {
            float until = Time.realtimeSinceStartup + seconds;
            while (Time.realtimeSinceStartup < until) yield return null;
        }

        public static string Slug(PolishDecision d)
        {
            switch (d)
            {
                case PolishDecision.BannerSize: return "a-banner-size";
                case PolishDecision.Stack: return "b-stack";
                case PolishDecision.Selection: return "c-selection";
                case PolishDecision.CameraFit: return "d-camera";
                case PolishDecision.Layering: return "e-layering";
                case PolishDecision.Footprint: return "f-footprint";
                default: return "g-placeholder";
            }
        }

        // ----- measurements -----

        private void Measure(PolishDecision decision, PolishChoice choice, int width, int height, Texture2D? idle, Texture2D shot)
        {
            var row = new Dictionary<string, object>
            {
                ["decision"] = Slug(decision),
                ["choice"] = choice.ToString(),
                ["size"] = width + "x" + height,
                ["zoom"] = map.Rig.Model.ZoomPermille,
                ["crisp"] = CameraFit.IsCrisp(map.Rig.Model.ZoomPermille),
            };
            int zoom = map.Rig.Model.ZoomPermille;
            bool phone = height > width;
            int dpr = phone ? PhoneDprPermille : 1000;
            foreach (BannerSizeClass c in new[] { BannerSizeClass.Small, BannerSizeClass.Medium, BannerSizeClass.Large })
            {
                BannerView? v = map.Banners.Banners.Values.FirstOrDefault(b => b.SizeClass == c && b.Owner == 0 && !b.Hidden);
                v ??= map.Banners.Banners.Values.FirstOrDefault(b => b.SizeClass == c);
                if (v == null) continue;
                int scale = PolishSettings.Sizing.ScalePermille(c);
                row["cloth_px_" + c.ToString()[0]] = v.ClothArtPx * scale / 1000 * zoom / 1000;
                row["total_px_" + c.ToString()[0]] = (v.ClothArtPx + v.BeamArtPx) * scale / 1000 * zoom / 1000;
                row["cloth_px_1x_" + c.ToString()[0]] = v.ClothArtPx * scale / 1000;
                row["beam_px_1x_" + c.ToString()[0]] = v.BeamArtPx * scale / 1000;
            }

            int vh = map.Rig.ViewportHeight;
            var visible = map.Banners.Banners.Values.Where(b => !b.Hidden && !b.Dying).ToList();
            List<PixelRect> bannerRects = visible.Select(b => b.ScreenRect(map.Rig.Camera, vh)).ToList();
            BannerView? medium = visible.FirstOrDefault(b => b.SizeClass == BannerSizeClass.Medium);
            if (medium != null)
            {
                PixelRect r = medium.ScreenRect(map.Rig.Camera, vh);
                row["target_M_px"] = r.Width + "x" + r.Height;
                row["target_M_css"] = HitTargets.CssPx(r.Width, dpr) + "x" + HitTargets.CssPx(r.Height, dpr);
                int scaleM = PolishSettings.Sizing.ScalePermille(BannerSizeClass.Medium);
                row["zoom_for_44css_M"] = 44L * dpr * 1000 / ((long)medium.WidthArtPx * scaleM);
                int w1x = medium.WidthArtPx * scaleM / 1000;
                int h1x = medium.ClothArtPx * scaleM / 1000;
                row["target_M_1x_px"] = w1x + "x" + h1x;
                row["target_M_1x_phone_css"] = HitTargets.CssPx(w1x, PhoneDprPermille) + "x" + HitTargets.CssPx(h1x, PhoneDprPermille);
            }

            int minCss = phone ? HitTargets.TouchMinCssPx : HitTargets.MouseMinCssPx;
            row["targets_meeting_min"] = bannerRects.Count(r => Mathf.Min(r.Width, r.Height) * 1000 / dpr >= minCss) + "/" + bannerRects.Count;
            row["min_css"] = minCss;
            int touchPx = HitTargets.TouchMinCssPx * dpr / 1000;
            List<PixelRect> inflated = bannerRects.Select(r => HitTargets.Inflate(r, touchPx)).ToList();
            row["touch_hit_px"] = touchPx;
            row["touch_hit_overlaps"] = HitTargets.CountOverlaps(inflated, inflated, 250);
            List<PixelRect> structures = map.Structures.Pieces.Select(p => ScreenRect(p.Renderer.bounds, vh)).ToList();
            row["overlap_banner_structure"] = HitTargets.CountOverlaps(bannerRects, structures, 250);
            row["overlap_banner_banner"] = HitTargets.CountOverlaps(bannerRects, bannerRects, 250);
            row["banners_visible"] = visible.Count + "/" + map.Banners.Count;
            (int clear, int stacked) = StackedClear(vh);
            row["stacked_clear"] = clear + "/" + stacked;
            row["stack_width_tiles"] = WidestStack(vh);
            row["badges"] = map.BadgeRects.Count;
            row["hud_scale"] = CameraFit.HudScalePermille(width, height);
            int hud = CameraFit.HudScalePermille(width, height);
            row["card_title_px"] = 19 * hud / 1000;
            row["card_body_px"] = 15 * hud / 1000;
            row["card_body_css"] = 15 * hud / dpr;
            row["coverage_pct"] = Coverage(width, height);
            row["top_row_clear_of_bar"] = TopRowClear(height);
            (int under, int over) = DotLayering();
            row["dots"] = map.Overlay.VisibleDots;
            row["dots_under_art"] = under;
            row["dots_over_banners"] = over;
            row["rings"] = map.Overlay.VisibleRings;
            int offMap = 0, coveredOthers = 0;
            var ruleTiles = map.Structures.Pieces.Select(p => p.RuleTile).ToList();
            foreach (StructurePiece p in map.Structures.Pieces)
            {
                offMap += FootprintPlacement.OffMapTiles(p.Placement, map.Tiles.Width, map.Tiles.Height);
                coveredOthers += FootprintPlacement.CoveredOthers(p.Placement, p.RuleTile, ruleTiles);
            }

            row["footprint_off_map_tiles"] = offMap;
            row["footprint_covers_other_rule_tiles"] = coveredOthers;
            PlaceholderStyle style = PolishSettings.Placeholders;
            row["water"] = style.Water.ToString();
            row["water_border_contrast"] = System.Math.Round(Contrast(style.Water, style.WaterBorder), 2);
            row["block_wall_px"] = 256 * style.BlockHeightPermilleOfTile / 1000;
            if (idle != null) row["selection_changed_pct"] = SelectionChange(idle, shot);
            numbers.AppendLine(Json(row));
        }

        /// <summary>
        /// Banners that share a tile and still show at least 60 percent of their cloth (not covered by a banner drawn
        /// in front): a readable pictogram. Sampled on a 10 x 10 grid per cloth.
        /// </summary>
        private (int clear, int stacked) StackedClear(int vh)
        {
            var all = map.Banners.Banners.Values.Where(b => !b.Dying).ToList();
            var rects = all.ToDictionary(b => b.UnitId, b => b.ScreenRect(map.Rig.Camera, vh));
            int clear = 0, stacked = 0;
            foreach (BannerView b in all.Where(v => v.StackSize > 1))
            {
                stacked++;
                if (b.Hidden) continue;
                PixelRect r = rects[b.UnitId];
                var front = all.Where(o => o.UnitId != b.UnitId && !o.Hidden && o.SortKey > b.SortKey).Select(o => rects[o.UnitId]).ToList();
                int open = 0;
                for (int i = 0; i < 10; i++)
                {
                    for (int j = 0; j < 10; j++)
                    {
                        int x = r.Left + r.Width * (2 * i + 1) / 20;
                        int y = r.Top + r.Height * (2 * j + 1) / 20;
                        if (!front.Any(f => f.Contains(x, y))) open++;
                    }
                }

                if (open >= 60) clear++;
            }

            return (clear, stacked);
        }

        /// <summary>Screen width of the widest stack, in tile widths at the current zoom.</summary>
        private string WidestStack(int vh)
        {
            float tile = 256f * map.Rig.Model.ZoomPermille / 1000f;
            float widest = 0f;
            foreach (IGrouping<GridPos, BannerView> g in map.Banners.Banners.Values.Where(b => !b.Hidden).GroupBy(b => b.Tile))
            {
                var rs = g.Select(b => b.ScreenRect(map.Rig.Camera, vh)).ToList();
                widest = Mathf.Max(widest, rs.Max(r => r.Right) - rs.Min(r => r.Left));
            }

            return (widest / tile).ToString("0.00", CultureInfo.InvariantCulture);
        }

        private PixelRect ScreenRect(Bounds b, int vh)
        {
            Camera cam = map.Rig.Camera;
            Vector3 lo = cam.WorldToScreenPoint(b.min);
            Vector3 hi = cam.WorldToScreenPoint(b.max);
            return new PixelRect(Mathf.FloorToInt(lo.x), vh - Mathf.CeilToInt(hi.y), Mathf.CeilToInt(hi.x), vh - Mathf.FloorToInt(lo.y));
        }

        /// <summary>Percent of the viewport showing the map diamond (sampled every 8 px).</summary>
        private int Coverage(int width, int height)
        {
            var iso = new IsoProjection();
            int inside = 0, total = 0;
            for (int y = 4; y < height; y += 8)
            {
                for (int x = 4; x < width; x += 8)
                {
                    total++;
                    if (iso.IsInside(iso.WorldToGrid(map.Rig.Model.ScreenToWorld(x, y)), map.Tiles.Width, map.Tiles.Height)) inside++;
                }
            }

            return inside * 100 / total;
        }

        /// <summary>Whether the top row's tall art (200 world px above its diamond) starts below the HUD's top bar.</summary>
        private bool TopRowClear(int height)
        {
            int top = map.Rig.Model.WorldToScreen(new PixelPoint(0, -64 - CameraFit.TallArtOverhangPx)).Y;
            return top >= CameraRig.HudInsets(map.Rig.ViewportWidth, height).Top;
        }

        private static DrawKey KeyOf(Renderer r)
        {
            SortingGroup? g = r.GetComponentInParent<SortingGroup>();
            return g != null && g.enabled ? new DrawKey(g.sortingOrder, r.sortingOrder) : new DrawKey(0, r.sortingOrder);
        }

        private static bool Overlap(Bounds a, Bounds b) => a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y;

        /// <summary>Path dots drawn under some overlapping terrain or structure picture, and dots drawn over some overlapping banner.</summary>
        private (int under, int over) DotLayering()
        {
            var art = new List<Renderer>();
            art.AddRange(map.Tiles.Root.GetComponentsInChildren<SpriteRenderer>());
            art.AddRange(map.Structures.Pieces.Select(p => (Renderer)p.Renderer));
            var bannerRenderers = map.Banners.Banners.Values.Where(b => !b.Hidden).Select(b => (Renderer)b.ClayRenderer).ToList();
            int under = 0, over = 0;
            foreach (SpriteRenderer dot in map.Overlay.Dots)
            {
                DrawKey k = KeyOf(dot);
                Bounds db = dot.bounds;
                if (art.Any(a => Overlap(a.bounds, db) && KeyOf(a).CompareTo(k) > 0 && a.bounds.max.y > db.max.y)) under++;
                if (bannerRenderers.Any(b => Overlap(b.bounds, db) && KeyOf(b).CompareTo(k) < 0)) over++;
            }

            return (under, over);
        }

        /// <summary>Percent of pixels in the selected unit's neighbourhood that change between idle and selected.</summary>
        private int SelectionChange(Texture2D idle, Texture2D selected)
        {
            UnitView c = Commander;
            Vector2 centre = map.ScreenPointOfTile(new GridPos(c.Pos.X, c.Pos.Y));
            float tile = 256f * map.Rig.Model.ZoomPermille / 1000f;
            int x0 = Mathf.Max(0, Mathf.RoundToInt(centre.x - tile * 0.6f));
            int x1 = Mathf.Min(idle.width, Mathf.RoundToInt(centre.x + tile * 0.6f));
            int y0 = Mathf.Max(0, Mathf.RoundToInt(centre.y - tile * 0.35f));
            int y1 = Mathf.Min(idle.height, Mathf.RoundToInt(centre.y + tile * 1.6f));
            Color32[] a = idle.GetPixels32();
            Color32[] b = selected.GetPixels32();
            int changed = 0, total = 0;
            for (int y = y0; y < y1; y++)
            {
                for (int x = x0; x < x1; x++)
                {
                    int i = y * idle.width + x;
                    int d = Mathf.Abs(a[i].r - b[i].r) + Mathf.Abs(a[i].g - b[i].g) + Mathf.Abs(a[i].b - b[i].b);
                    total++;
                    if (d > 60) changed++;
                }
            }

            return total == 0 ? 0 : changed * 100 / total;
        }

        private static double Linear(int channel)
        {
            double c = channel / 255.0;
            return c <= 0.03928 ? c / 12.92 : System.Math.Pow((c + 0.055) / 1.055, 2.4);
        }

        private static double Luminance(Rgb c) => 0.2126 * Linear(c.R) + 0.7152 * Linear(c.G) + 0.0722 * Linear(c.B);

        /// <summary>WCAG contrast ratio.</summary>
        private static double Contrast(Rgb a, Rgb b)
        {
            double la = Luminance(a), lb = Luminance(b);
            return (System.Math.Max(la, lb) + 0.05) / (System.Math.Min(la, lb) + 0.05);
        }

        private static string Json(Dictionary<string, object> row)
        {
            var sb = new StringBuilder("{");
            bool first = true;
            foreach (KeyValuePair<string, object> pair in row)
            {
                if (!first) sb.Append(", ");
                first = false;
                sb.Append('"').Append(pair.Key).Append("\": ");
                switch (pair.Value)
                {
                    case string s: sb.Append('"').Append(s).Append('"'); break;
                    case bool b: sb.Append(b ? "true" : "false"); break;
                    case double d: sb.Append(d.ToString(CultureInfo.InvariantCulture)); break;
                    default: sb.Append(System.Convert.ToString(pair.Value, CultureInfo.InvariantCulture)); break;
                }
            }

            return sb.Append('}').ToString();
        }
    }
}
