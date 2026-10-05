using System.Collections.Generic;
using System.Linq;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using Conquest.Unity.Art;
using NUnit.Framework;
using UnityEngine;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// Fog of war in the map view, on the real scenario and the real layers: what the player cannot see is not drawn, picked,
    /// previewed, counted or named in a message. Each test names the leak it closes.
    /// </summary>
    public sealed class FogViewTests
    {
        private GameObject root = null!;
        private ArtLibrary art = null!;
        private GameSession session = null!;
        private readonly IsoProjection iso = new IsoProjection();

        [SetUp]
        public void SetUp()
        {
            PolishSettings.Reset();
            root = new GameObject("FogViewTests");
            ViewAssets? assets = ViewAssets.Load();
            art = new ArtLibrary(assets != null ? assets.artCatalog : null);
            session = TestContent.NewSession();
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(root);
            PolishSettings.Reset();
        }

        private FogView Sight(GameState s) => FogView.Of(s, session.LocalSlot);

        private List<Unit> Hidden(GameState s) => s.UnitTable.Where(u => u.Owner != session.LocalSlot && !Sight(s).IsVisible(u.Pos)).ToList();

        private List<Unit> Seen(GameState s) => s.UnitTable.Where(u => u.Owner != session.LocalSlot && Sight(s).IsVisible(u.Pos)).ToList();

        private BannerLayer Layer(GameState s, bool fog)
        {
            var layer = new BannerLayer(root.transform, art, iso, s, session.LocalSlot);
            layer.Reconcile(s, fog ? Sight(s) : null);
            return layer;
        }

        /// <summary>A copy of the state with every own unit moved next to the given tile (own units get sight there).</summary>
        private static GameState WithWatcherNear(GameState s, int ownerSlot, TileCoord near)
        {
            Unit own = s.UnitTable.First(u => u.Owner == ownerSlot);
            return s.WithUnit(own with { Pos = near, Leader = 0, AttachedBase = 0 });
        }

        private static TileCoord FarCorner(GameState s, IEnumerable<Unit> others) =>
            new[] { new TileCoord(0, 0), new TileCoord(s.Width - 1, 0), new TileCoord(0, s.Height - 1), new TileCoord(s.Width - 1, s.Height - 1) }
                .OrderByDescending(c => others.Min(u => u.Pos.DistanceTo(c))).First();

        [Test]
        public void TheScenarioStartHasBothSeenAndUnseenOpposingUnits()
        {
            GameState s = session.State;
            Assert.That(Seen(s), Is.Not.Empty, "fixture assumption");
            Assert.That(Hidden(s), Is.Not.Empty, "fixture assumption: the fog has something to hide");
        }

        [Test]
        public void NoBannerIsMadeForAnUnseenOpposingUnit()
        {
            GameState s = session.State;
            BannerLayer layer = Layer(s, true);

            foreach (Unit u in Hidden(s)) Assert.IsFalse(layer.TryGet(u.Id, out _), "banner of hidden unit " + u.Id);
            foreach (Unit u in Seen(s)) Assert.IsTrue(layer.TryGet(u.Id, out _), "banner of seen unit " + u.Id);
            foreach (Unit u in s.UnitTable.Where(x => x.Owner == session.LocalSlot)) Assert.IsTrue(layer.TryGet(u.Id, out _), "own banner " + u.Id);
            Assert.AreEqual(s.UnitTable.Count - Hidden(s).Count, layer.Count);
        }

        [Test]
        public void AnUnseenStackHasNoBadgeNoStackAndNoPick()
        {
            GameState s = session.State;
            BannerLayer layer = Layer(s, true);
            Unit hidden = Hidden(s).GroupBy(u => u.Pos).OrderByDescending(g => g.Count()).First().First();
            var tile = new GridPos(hidden.Pos.X, hidden.Pos.Y);

            Assert.AreEqual(0, layer.StackAt(tile).Count, "stack");
            Assert.IsNull(layer.UnitAt(tile), "a bare tile pick must not find the unit through the state");
            Assert.IsFalse(layer.Badges().Any(b => b.Tile == tile), "badge count");
        }

        [Test]
        public void ARevealedBannerAppearsAndGoesAgainWhenSightIsLost()
        {
            GameState s = session.State;
            Unit target = Hidden(s).First();
            BannerLayer layer = Layer(s, true);
            Assert.IsFalse(layer.TryGet(target.Id, out _));

            // an own unit walks next to it: now it is seen
            var next = new TileCoord(target.Pos.X, System.Math.Max(0, target.Pos.Y - 1));
            GameState near = WithWatcherNear(s, session.LocalSlot, next);
            layer.Reconcile(near, Sight(near));
            Assert.IsTrue(layer.TryGet(target.Id, out _), "revealed");

            // and away again: the banner must not stay
            GameState away = WithWatcherNear(near, session.LocalSlot, FarCorner(near, near.UnitTable.Where(u => u.Owner != session.LocalSlot)));
            if (Sight(away).IsVisible(target.Pos)) Assert.Ignore("another own unit still sees the target in this scenario");
            layer.Reconcile(away, Sight(away));
            Assert.IsFalse(layer.TryGet(target.Id, out _), "hidden again");
        }

        [Test]
        public void TheOpponentOwnTilesAreNeverHiddenFromTheOpponentSide()
        {
            // the fog is the local player's: a view for the other slot would hide the player's units instead (parity with the AI's Knowledge)
            GameState s = session.State;
            FogView theirs = FogView.Of(s, 1);
            foreach (Unit u in s.UnitTable.Where(x => x.Owner == 1)) Assert.IsTrue(theirs.CanSeeUnit(u));
        }

        [Test]
        public void StructuresOfTheOtherSideAppearOnlyOnSeenTiles()
        {
            GameState s = session.State;
            FogView fog = Sight(s);
            var layer = new StructureLayer(root.transform, art, iso);
            layer.Rebuild(s, fog);
            int expected = 0;
            foreach (Base b in s.BaseTable)
            {
                if (fog.CanSeeBase(b)) expected++;
                expected += b.Buildings.Count(x => b.Owner == fog.Viewer || fog.IsVisible(x.Pos));
            }

            Assert.AreEqual(expected, layer.PieceCount);
            var all = new StructureLayer(root.transform, art, iso);
            all.Rebuild(s);
            Assert.Greater(all.PieceCount, layer.PieceCount, "the fog hides something at the start");
        }

        [Test]
        public void ARememberedBaseIsDrawnDimAndLabelledNotLive()
        {
            GameState s = session.State;
            Base enemy = s.BaseTable.First(b => b.Owner != session.LocalSlot);
            var record = new IntelRecord(session.LocalSlot, enemy.Id, enemy.SiteId, enemy.Pos, enemy.Owner, 1, -1, 0);
            FogView far = FogView.Of(s with { UnitTable = ImmArray<Unit>.From(new Unit[0]) }, session.LocalSlot);
            var layer = new StructureLayer(root.transform, art, iso);

            layer.Rebuild(s, far, new[] { record });

            Assert.AreEqual(1, layer.RememberedCount);
            StructurePiece remembered = layer.Pieces.Last();
            Assert.That(remembered.Renderer.color.a, Is.LessThan(1f), "dim, see-through");
            Assert.AreEqual(StructureLayer.RememberedTint, remembered.Renderer.color);
        }

        [Test]
        public void AnUnseenEnemyMoveProducesNoPresentationEventButTheViewerOwnAndSeenOnesStay()
        {
            GameState s = session.State;
            Unit hidden = Hidden(s).First();
            Unit seen = Seen(s).First();
            Unit mine = s.UnitTable.First(u => u.Owner == session.LocalSlot);

            Assert.AreEqual(0, MoveEvents(s, hidden, session.LocalSlot).Count, "unseen to unseen");
            Assert.AreEqual(1, MoveEvents(s, hidden, -1).Count, "without a viewer the mapper stays complete");
            Assert.AreEqual(1, MoveEvents(s, mine, session.LocalSlot).Count, "own move");
            Unit stay = seen;
            Assert.AreEqual(1, MoveEventsToSeenTile(s, stay, session.LocalSlot).Count, "seen to seen");
        }

        private IReadOnlyList<PresentationEvent> MoveEvents(GameState s, Unit u, int viewer)
        {
            TileCoord to = new TileCoord(u.Pos.X + (u.Pos.X + 1 < s.Width ? 1 : -1), u.Pos.Y);
            return Step(s, u, to, viewer);
        }

        private IReadOnlyList<PresentationEvent> MoveEventsToSeenTile(GameState s, Unit u, int viewer)
        {
            FogView fog = Sight(s);
            TileCoord to = new[] { -1, 1 }.Select(d => new TileCoord(u.Pos.X + d, u.Pos.Y)).First(t => s.InBounds(t) && fog.IsVisible(t));
            return Step(s, u, to, viewer);
        }

        private IReadOnlyList<PresentationEvent> Step(GameState s, Unit u, TileCoord to, int viewer)
        {
            GameState after = s.WithUnit(u with { Pos = to });
            var events = ImmArray<GameEvent>.From(new GameEvent[] { new UnitMoved(u.Id, u.Pos, to, u.Owner) });
            var step = new AppliedStep(new MoveCommand(u.Owner, u.Id, to), s, after, events, null);
            return EventMapper.Map(step, session.Services, viewer);
        }

        [Test]
        public void AnEnemyMoveInSightToAnUnseenTileIsDroppedSoNoBannerSlidesIntoTheFog()
        {
            GameState s = session.State;
            FogView fog = Sight(s);
            Unit seen = Seen(s).First();
            TileCoord hiddenTile = Hidden(s).First().Pos;
            Assert.IsFalse(fog.IsVisible(hiddenTile));

            Assert.AreEqual(0, Step(s, seen, hiddenTile, session.LocalSlot).Count(e => e.Kind == PresentationEventKind.UnitMoved));
        }

        [Test]
        public void TheOpponentTallyCountsOnlyWhatTheMapperKept()
        {
            GameState s = session.State;
            Unit hidden = Hidden(s).First();
            OpponentTally tally = OpponentTally.Of(MoveEvents(s, hidden, session.LocalSlot), "f1");
            Assert.IsTrue(tally.IsEmpty, "a move in the fog is not counted");
        }

        [Test]
        public void TheTallyLineLeavesOutZeroCountsAndUsesTheSingularInBothLanguages()
        {
            Localizer text = TestContent.Load().Text;
            Assert.AreEqual(string.Empty, OpponentTally.Empty.Describe(text));
            Assert.AreEqual("Opponent: 9 moves", new OpponentTally(9, 0, 0).Describe(text));
            Assert.AreEqual("Opponent: 1 move, 1 new unit, 2 buildings", new OpponentTally(1, 1, 2).Describe(text));
            text.SetLocale("bn");
            string bn = new OpponentTally(0, 0, 3).Describe(text);
            StringAssert.DoesNotContain("০", bn.Replace("১০", string.Empty).Replace("৩০", string.Empty).Replace("২০", string.Empty), "no zero count in " + bn);
            StringAssert.Contains("ভবন", bn);
            StringAssert.DoesNotContain("চাল", bn);
        }

        [Test]
        public void HoveringOrClickingAnUnseenEnemyTileGivesTheSamePathPreviewAsAnEmptyTile()
        {
            var interaction = new MapInteraction(session, TestContent.Load().Text);
            Unit scout = session.State.UnitTable.First(u => u.Owner == session.LocalSlot && u.Role == UnitRole.Scout);
            // an unseen enemy whose tile the scout could walk to if nothing stood on it: the real state blocks it, the player's picture does not
            Unit hidden = Hidden(session.State).First(u => session.PlanMove(scout.Id, new GridPos(u.Pos.X, u.Pos.Y)) == null
                && session.PlanMove(scout.Id, new GridPos(u.Pos.X, u.Pos.Y), interaction.Known) != null);
            interaction.Click(new PickResult(new GridPos(scout.Pos.X, scout.Pos.Y), scout.Id), false);

            interaction.Hover(new PickResult(new GridPos(hidden.Pos.X, hidden.Pos.Y), null));

            Assert.IsNull(interaction.AttackPreviewValue, "no attack card for something unseen");
            Assert.IsNull(interaction.PendingAttackTile);
            Assert.IsNull(interaction.Message, "no message about the tile");
            // the preview reads the player's own picture of the world: the tile is just open ground
            Assert.IsFalse(interaction.Known.UnitTable.Any(u => u.Id == hidden.Id));
            Assert.IsTrue(interaction.Preview.Found, "a path is planned to a tile that looks empty");
        }

        [Test]
        public void StackAndSelectionNeverReachAnUnseenUnit()
        {
            var interaction = new MapInteraction(session, TestContent.Load().Text);
            Unit hidden = Hidden(session.State).First();

            interaction.ClickStack(new GridPos(hidden.Pos.X, hidden.Pos.Y));

            Assert.AreEqual(0, interaction.StackAt(new GridPos(hidden.Pos.X, hidden.Pos.Y)).Count);
            Assert.AreEqual(0, interaction.Selection.SelectedIds.Count);
        }

        [Test]
        public void AnInspectedEnemyThatLeavesSightIsDeselected()
        {
            var interaction = new MapInteraction(session, TestContent.Load().Text);
            Unit seen = Seen(session.State).First();
            interaction.Click(new PickResult(new GridPos(seen.Pos.X, seen.Pos.Y), seen.Id), false);
            Assert.AreEqual(1, interaction.Selection.SelectedIds.Count);

            // the enemy walks out of sight (placed on the corner farthest from every own unit)
            GameState s = session.State;
            TileCoord corner = FarCorner(s, s.UnitTable.Where(u => u.Owner == session.LocalSlot));
            session.Restore(s.WithUnit(seen with { Pos = corner }));
            if (Sight(session.State).IsVisible(corner)) Assert.Ignore("corner is in sight");
            interaction.Prune();

            Assert.AreEqual(0, interaction.Selection.SelectedIds.Count, "no card, no ring for what is no longer seen");
        }

        [Test]
        public void ARefusedMoveOntoAnUnseenOccupiedTileDoesNotSayOccupied()
        {
            var interaction = new MapInteraction(session, TestContent.Load().Text);
            Unit hidden = Hidden(session.State).First(u => session.State.TerrainAt(u.Pos) == Conquest.Core.Contracts.Terrain.Open);
            Unit scout = session.State.UnitTable.First(u => u.Owner == session.LocalSlot && u.Role == UnitRole.Scout);
            interaction.Click(new PickResult(new GridPos(scout.Pos.X, scout.Pos.Y), scout.Id), false);
            var tile = new GridPos(hidden.Pos.X, hidden.Pos.Y);

            interaction.SecondaryClick(new PickResult(tile, null));

            Assert.AreNotEqual(Err.TileOccupied, interaction.LastErrorCode);
            if (interaction.Message != null) StringAssert.DoesNotContain(TestContent.Load().Text.ErrorText(Err.TileOccupied), interaction.Message);
        }
    }
}
