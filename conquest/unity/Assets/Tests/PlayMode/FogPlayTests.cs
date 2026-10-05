using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Conquest.Ai;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// Fog of war through the running game: real clicks on End turn and on the map, the real input router and picker, and the
    /// opponent's own knowledge view (<see cref="Knowledge"/>, written separately) as the oracle of what is in sight.
    /// </summary>
    public sealed class FogPlayTests : UiPlayHarness
    {
        private const int OwnSlot = 0;

        private IEnumerator EndTurnByClick()
        {
            yield return ClickElement("end-turn");
            yield return WaitIdle();
        }

        private static List<Unit> Enemies(GameState s) => s.UnitTable.Where(u => u.Owner != OwnSlot).ToList();

        private static bool InSight(GameState s, Unit enemy) => Knowledge.Of(s, OwnSlot).EnemyUnits.Any(u => u.Id == enemy.Id);

        private void AssertBannersFollowSight(string when)
        {
            GameState s = map.Session.State;
            foreach (Unit e in Enemies(s))
            {
                bool drawn = map.Banners.TryGet(e.Id, out BannerView v) && v != null;
                Assert.AreEqual(InSight(s, e), drawn, when + ": enemy " + e.Id + " at " + e.Pos + (drawn ? " is drawn but unseen" : " is seen but not drawn"));
            }

            foreach (Unit own in s.UnitTable.Where(u => u.Owner == OwnSlot)) Assert.IsTrue(map.Banners.TryGet(own.Id, out _), when + ": own banner " + own.Id);
            Assert.AreEqual(s.UnitTable.Count(u => u.Owner == OwnSlot) + Enemies(s).Count(e => InSight(s, e)), map.Banners.Count, when + ": banner count");
            foreach (StackBadge b in map.Banners.Badges())
            {
                Assert.IsTrue(map.Banners.StackAt(b.Tile).All(m => m.Owner == OwnSlot || s.UnitTable.Any(u => u.Id == m.Id && InSight(s, u))), when + ": badge on " + b.Tile + " counts an unseen unit");
            }

            Knowledge known = Knowledge.Of(s, OwnSlot);
            foreach (StructurePiece p in map.Structures.Pieces)
            {
                Base? b = s.BaseTable.FirstOrDefault(x => x.Pos.X == p.RuleTile.X && x.Pos.Y == p.RuleTile.Y);
                if (b != null && b.Owner != OwnSlot && p.Renderer.color.a >= 1f) Assert.IsTrue(known.CanSee(b.Pos), when + ": live base piece at unseen " + b.Pos);
            }
        }

        [UnityTest]
        public IEnumerator HiddenEnemyBannersStayHiddenThroughTenRealEndTurns()
        {
            SaveStorageFactory.Override = new MemorySaveStorage();
            yield return Boot();
            AssertBannersFollowSight("turn 0");
            Assert.IsTrue(Enemies(map.Session.State).Any(e => !InSight(map.Session.State, e)), "fixture: the fog hides something at the start");
            for (int turn = 1; turn <= 10; turn++)
            {
                yield return EndTurnByClick();
                AssertBannersFollowSight("turn " + turn);
                string line = map.LastOpponentText ?? string.Empty;
                StringAssert.DoesNotContain(" 0 ", line.Replace("Opponent:", string.Empty) + " ", "zero counts are left out: " + line);
            }
        }

        [UnityTest]
        public IEnumerator PickingAndClickingAnUnseenEnemyTileFindsNothing()
        {
            SaveStorageFactory.Override = new MemorySaveStorage();
            yield return Boot();
            GameState s = map.Session.State;
            Unit hidden = Enemies(s).First(e => !InSight(s, e));
            var tile = new GridPos(hidden.Pos.X, hidden.Pos.Y);
            map.Rig.CenterOnTile(tile);
            yield return Frames(3);
            Vector2 at = map.ScreenPointOfTile(tile);

            Assert.IsNull(map.PickAt(at).UnitId, "no banner to hit");
            yield return ClickAt(at); // nothing selected: a click on bare ground
            Assert.AreEqual(0, map.Interaction.Selection.SelectedIds.Count);
            Assert.AreEqual(-1, map.Interaction.Selection.HoveredUnitId, "no hover cue");

            Unit own = s.UnitTable.First(u => u.Owner == OwnSlot && u.Role == UnitRole.Scout);
            map.Rig.CenterOnTile(new GridPos(own.Pos.X, own.Pos.Y));
            yield return Frames(3);
            yield return ClickAt(map.ScreenPointOfBanner(own.Id));
            Assert.AreEqual(1, map.Interaction.Selection.SelectedIds.Count);
            map.Rig.CenterOnTile(tile);
            yield return Frames(3);
            yield return ClickAt(map.ScreenPointOfTile(tile), right: true);
            Assert.IsNull(map.Interaction.AttackPreviewValue, "no attack card for an unseen unit");
            Assert.AreEqual(0, map.Interaction.AttacksOrdered);
            Assert.AreNotEqual(Err.TileOccupied, map.Interaction.LastErrorCode);
        }

        /// <summary>Own line unit placed 1 tile outside sight of an unseen enemy line unit, with a free open tile that puts it in sight.</summary>
        private bool Stage(out int watcherId, out GridPos far, out GridPos near, out int targetId)
        {
            GameState s = map.Session.State;
            int r = SightRules.VisionRadius;
            Unit mover = s.UnitTable.First(u => u.Owner == OwnSlot && u.Role == UnitRole.Line);
            foreach (Unit h in Enemies(s).Where(e => !InSight(s, e)))
            {
                for (int dy = -r - 1; dy <= r + 1; dy++)
                {
                    for (int dx = -r - 1; dx <= r + 1; dx++)
                    {
                        var p = new TileCoord(h.Pos.X + dx, h.Pos.Y + dy);
                        if (p.DistanceTo(h.Pos) != r + 1 || !Free(s, p)) continue;
                        foreach (var n in Neighbours(p))
                        {
                            if (n.DistanceTo(h.Pos) != r || !Free(s, n)) continue;
                            // the watcher must be the only own unit that could see the target after the step
                            watcherId = mover.Id;
                            far = new GridPos(p.X, p.Y);
                            near = new GridPos(n.X, n.Y);
                            targetId = h.Id;
                            return true;
                        }
                    }
                }
            }

            watcherId = targetId = 0;
            far = near = default;
            return false;
        }

        private static IEnumerable<TileCoord> Neighbours(TileCoord p)
        {
            for (int dy = -1; dy <= 1; dy++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    if (dx != 0 || dy != 0) yield return new TileCoord(p.X + dx, p.Y + dy);
                }
            }
        }

        private static bool Free(GameState s, TileCoord t) =>
            s.InBounds(t) && s.TerrainAt(t) == Conquest.Core.Contracts.Terrain.Open && s.UnitsAt(t).Count == 0 && s.FindBaseIndexAt(t) < 0;

        [UnityTest]
        public IEnumerator AnEnemyIsRevealedWhenAnOwnUnitWalksNextToItAndHiddenAgainWhenItWalksAway()
        {
            SaveStorageFactory.Override = new MemorySaveStorage();
            yield return Boot();
            Assert.IsTrue(Stage(out int watcher, out GridPos far, out GridPos near, out int target), "fixture: a staging spot exists on the map");
            GameState s = map.Session.State;
            Unit moved = s.UnitTable[s.FindUnitIndex(watcher)] with { Pos = new TileCoord(far.X, far.Y), Leader = 0, AttachedBase = 0 };
            map.Session.Restore(s.WithUnit(moved));
            yield return Frames(3);
            if (InSight(map.Session.State, map.Session.State.UnitTable[map.Session.State.FindUnitIndex(target)])) Assert.Ignore("another own unit already sees the target");
            Assert.IsFalse(map.Banners.TryGet(target, out _), "before: hidden");

            map.Rig.CenterOnTile(far);
            yield return Frames(3);
            yield return ClickAt(map.ScreenPointOfBanner(watcher));
            Assert.AreEqual(watcher, map.Interaction.Selection.PrimaryId, "the watcher is selected by a real click");
            yield return ClickAt(map.ScreenPointOfTile(near), right: true);
            yield return WaitIdle();
            Assert.AreEqual(new TileCoord(near.X, near.Y), map.Session.State.UnitTable[map.Session.State.FindUnitIndex(watcher)].Pos, "the move went through");
            Assert.IsTrue(map.Banners.TryGet(target, out BannerView v) && v != null, "revealed after moving next to it");
            AssertBannersFollowSight("revealed");

            yield return ClickAt(map.ScreenPointOfBanner(watcher));
            yield return ClickAt(map.ScreenPointOfTile(far), right: true);
            yield return WaitIdle();
            Assert.AreEqual(new TileCoord(far.X, far.Y), map.Session.State.UnitTable[map.Session.State.FindUnitIndex(watcher)].Pos);
            Assert.IsFalse(map.Banners.TryGet(target, out _), "hidden again once sight is lost");
            AssertBannersFollowSight("hidden again");
        }

        [UnityTest]
        public IEnumerator EnemyBasesFollowTheSameSightAndNoLiveBaseShowsInTheFog()
        {
            SaveStorageFactory.Override = new MemorySaveStorage();
            yield return Boot();
            for (int turn = 0; turn <= 6; turn++)
            {
                AssertBannersFollowSight("turn " + turn);
                GameState s = map.Session.State;
                Knowledge k = Knowledge.Of(s, OwnSlot);
                int liveEnemyPieces = 0;
                foreach (StructurePiece p in map.Structures.Pieces)
                {
                    Base? b = s.BaseTable.FirstOrDefault(x => x.Pos.X == p.RuleTile.X && x.Pos.Y == p.RuleTile.Y);
                    if (b != null && b.Owner != OwnSlot && p.Renderer.color.a >= 1f) liveEnemyPieces++;
                }

                Assert.AreEqual(k.EnemyBases.Count(b => b.InView), liveEnemyPieces, "turn " + turn + ": live enemy base pieces = enemy bases in sight");
                yield return EndTurnByClick();
            }
        }

        // ----- pictures (Explicit) -----

        [UnityTest, Explicit("Writes Screenshots/fog/ pictures and a log")]
        public IEnumerator TenTurnFogLog()
        {
            SaveStorageFactory.Override = new MemorySaveStorage();
            yield return Boot();
            var log = new StringBuilder();
            for (int turn = 0; turn <= 10; turn++)
            {
                GameState s = map.Session.State;
                int shown = Enemies(s).Count(e => map.Banners.TryGet(e.Id, out BannerView v) && v != null);
                log.AppendLine("turn " + turn + ": opp units " + Enemies(s).Count + " | in my sight " + Knowledge.Of(s, OwnSlot).EnemyUnits.Count + " | opp banners drawn " + shown
                    + " | structure pieces live " + map.Structures.Pieces.Count(p => p.Renderer.color.a >= 1f) + ", remembered (dim) " + map.Structures.RememberedCount + ", memory " + map.Memory.Records.Count + " [" + string.Join(" ", map.Memory.Records.Select(r => "b" + r.BaseId + "@" + r.Pos + (map.Fog.IsVisible(r.Pos) ? "v" : "") + " L" + r.Level + " t" + r.TurnSeen)) + "] dim0 " + DescribeDim() + " pieces [" + string.Join(" ", map.Structures.Pieces.Select(p => p.Role + "@" + p.RuleTile + (p.Renderer.color.a < 1f ? "~" : "") + p.Renderer.bounds.center + (p.Renderer.isVisible ? "V" : "-"))) + "]"
                    + " | banner: " + (map.Hud.CurrentMessage.Length == 0 ? "-" : map.Hud.CurrentMessage));
                if (turn == 0 || turn == 10)
                {
                    var rec = map.Memory.OutOfSight(map.Fog);
                    if (rec.Count > 0) yield return PictureAt("remembered-" + turn.ToString("00"), new GridPos(rec[0].Pos.X, rec[0].Pos.Y));
                }

                if (turn == 0 || turn == 7 || turn == 10 || turn == 3)
                {
                    yield return Picture("turn-" + turn.ToString("00"), s);
                    if (turn == 7 || turn == 10) yield return Picture("own-turn-" + turn.ToString("00"), s, true);
                }

                if (turn == 10 || s.MatchOver) break;
                yield return EndTurnByClick();
            }

            string path = Path.Combine(ShotKit.Folder("fog"), "log.txt");
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, log.ToString());
            Debug.Log("[fog-log]\n" + log);
        }

        private string DescribeDim()
        {
            foreach (StructurePiece p in map.Structures.Pieces)
            {
                if (p.Renderer.color.a >= 1f) continue;
                SpriteRenderer r = p.Renderer;
                return "sprite " + (r.sprite != null ? r.sprite.name : "null") + " enabled " + r.enabled + " visible " + r.isVisible + " bounds " + r.bounds.center + " size " + r.bounds.size + " order " + r.sortingOrder + " layer " + r.sortingLayerName + " color " + r.color + " active " + r.gameObject.activeInHierarchy;
            }

            return "none";
        }

        private IEnumerator Picture(string name, GameState s, bool onOwn = false)
        {
            Unit target = s.UnitTable.First(u => u.Owner == (onOwn ? OwnSlot : 1));
            yield return PictureAt(name, new GridPos(target.Pos.X, target.Pos.Y));
        }

        private IEnumerator PictureAt(string name, GridPos centre)
        {
            ShotKit.Target t = ShotKit.Begin(map, 1280, 720);
            map.Rig.Refit();
            map.Rig.CenterOnTile(centre);
            yield return ShotKit.Frames(8);
            Texture2D picture = ShotKit.Grab(map, t);
            ShotKit.Save(picture, "fog/" + name + ".png");
            Object.Destroy(picture);
            ShotKit.End(map, t);
            map.Rig.Refit();
            yield return ShotKit.Frames(3);
        }

        [UnityTest]
        public IEnumerator ALongTurnBannerWrapsInsideItsStripAtEverySizeAndLanguage()
        {
            SaveStorageFactory.Override = new MemorySaveStorage();
            yield return Boot();
            foreach ((int w, int h) in new[] { (1280, 720), (720, 1280), (540, 960) })
            {
                foreach (string locale in new[] { "en", "bn" })
                {
                    map.Text.SetLocale(locale);
                    string line = (locale == "en" ? "Turn 8" : "পালা ৮") + " · " + new OpponentTally(9, 3, 2).Describe(map.Text) + " · " + map.Text.Format("ui.defend_lost", 9, 0);
                    map.Hud.ShowMessage(line, 60f);
                    ShotKit.Target t = ShotKit.Begin(map, w, h);
                    map.Rig.Refit();
                    yield return ShotKit.Frames(6);
                    var message = (Label)map.Hud.Root.Q("message");
                    Rect strip = message.worldBound, root = map.Hud.Root.worldBound;
                    Vector2 oneLine = message.MeasureTextSize(line, 0f, VisualElement.MeasureMode.Undefined, 0f, VisualElement.MeasureMode.Undefined);
                    string where = w + "x" + h + " " + locale;
                    Assert.GreaterOrEqual(strip.xMin, root.xMin - 0.5f, where + ": left edge");
                    Assert.LessOrEqual(strip.xMax, root.xMax + 0.5f, where + ": right edge");
                    Assert.LessOrEqual(strip.yMax, root.yMax + 0.5f, where + ": bottom edge");
                    Assert.AreEqual(WhiteSpace.Normal, message.resolvedStyle.whiteSpace, where);
                    Assert.Greater(oneLine.x, strip.width, where + ": fixture: the line is longer than the strip, so it must wrap");
                    Assert.GreaterOrEqual(strip.height, oneLine.y * 2f, where + ": the strip grew to hold the wrapped text");
                    ShotKit.End(map, t);
                    map.Rig.Refit();
                    yield return ShotKit.Frames(2);
                }
            }

            map.Text.SetLocale("en");
        }

        [UnityTest, Explicit("Writes Screenshots/fog/ banner pictures")]
        public IEnumerator TurnBannerAtSizesAndLanguages()
        {
            SaveStorageFactory.Override = new MemorySaveStorage();
            yield return Boot();
            var sb = new StringBuilder();
            foreach ((int w, int h, string tag) in new[] { (1280, 720, "landscape"), (720, 1280, "portrait"), (1920, 1080, "wide"), (540, 960, "small-portrait") })
            {
                foreach (string locale in new[] { "en", "bn" })
                {
                    map.Text.SetLocale(locale);
                    string line = (locale == "en" ? "Turn 8" : "পালা ৮") + " · " + new OpponentTally(9, 3, 2).Describe(map.Text) + " · " + map.Text.Format("ui.defend_lost", 9, 0);
                    map.Hud.ShowMessage(line, 60f);
                    ShotKit.Target t = ShotKit.Begin(map, w, h);
                    map.Rig.Refit();
                    yield return ShotKit.Frames(6);
                    VisualElement message = map.Hud.Root.Q("message");
                    Rect box = message.worldBound;
                    Rect rootBox = map.Hud.Root.worldBound;
                    var text = (message as Label)!.MeasureTextSize(line, box.width - 0f, VisualElement.MeasureMode.AtMost, 0f, VisualElement.MeasureMode.Undefined);
                    sb.AppendLine(tag + " " + locale + ": strip " + box + " root " + rootBox + " measured text " + text + " lines~" + (text.y / 20f));
                    Texture2D picture = ShotKit.Grab(map, t);
                    ShotKit.Save(picture, "fog/banner-" + tag + "-" + locale + ".png");
                    Object.Destroy(picture);
                    ShotKit.End(map, t);
                    map.Rig.Refit();
                    yield return ShotKit.Frames(2);
                }
            }

            File.WriteAllText(Path.Combine(ShotKit.Folder("fog"), "banner-measure.txt"), sb.ToString());
            Debug.Log("[banner]\n" + sb);
        }
    }
}
