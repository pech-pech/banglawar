using Conquest.Core;
using Conquest.Core.Combat;
using Conquest.Core.Contracts;

namespace Conquest.Tests.Combat
{
    internal sealed class FakeContext : ICombatContext
    {
        public int Turn { get; set; } = 10;

        public ulong BattleSeed { get; set; } = 42;

        public int AttackerSlot { get; set; } = 0;

        public int DefenderSlot { get; set; } = 1;

        public TileCoord Target { get; set; } = new TileCoord(5, 5);

        public Terrain TargetTerrain { get; set; } = Terrain.Open;

        public IReadOnlyList<UnitView> Attackers { get; set; } = new List<UnitView>();

        public IReadOnlyList<UnitView> Defenders { get; set; } = new List<UnitView>();

        public BaseView? TargetBase { get; set; }

        public IGameStateView State { get; set; } = new FakeView();

        public AttackKind Kind { get; set; } = AttackKind.Capture;

        public bool RaidCanDestroy { get; set; } = true;

        public bool CaptureLegal { get; set; } = true;

        public Func<int, bool, int> Panic { get; set; } = (_, __) => 0;

        public int PanicModifierPermille(int slot, bool defendingBase) => Panic(slot, defendingBase);
    }

    internal sealed class FakeView : IGameStateView
    {
        public int Turn { get; set; } = 10;

        public int Width => 32;

        public int Height => 32;

        public int SlotCount { get; set; } = 2;

        public List<UnitView> UnitList { get; } = new List<UnitView>();

        public List<BaseView> BaseList { get; } = new List<BaseView>();

        public HashSet<int> Eliminated { get; } = new HashSet<int>();

        public Dictionary<string, long> Ext { get; } = new Dictionary<string, long>();

        public IReadOnlyList<UnitView> Units => UnitList;

        public IReadOnlyList<BaseView> Bases => BaseList;

        public bool InBounds(TileCoord c) => c.X >= 0 && c.Y >= 0 && c.X < Width && c.Y < Height;

        public Terrain TerrainAt(TileCoord c) => Terrain.Open;

        public bool TryGetUnit(int id, out UnitView unit)
        {
            unit = UnitList.FirstOrDefault(u => u.Id == id)!;
            return unit != null;
        }

        public bool TryGetBase(int id, out BaseView baseView)
        {
            baseView = BaseList.FirstOrDefault(b => b.Id == id)!;
            return baseView != null;
        }

        public IReadOnlyList<UnitView> UnitsAt(TileCoord c) => UnitList.Where(u => u.Pos.Equals(c)).OrderBy(u => u.Id).ToList();

        public bool TryGetBaseAt(TileCoord c, out BaseView baseView)
        {
            baseView = BaseList.FirstOrDefault(b => b.Pos.Equals(c))!;
            return baseView != null;
        }

        public bool IsEliminated(int slot) => Eliminated.Contains(slot);

        public long GetExt(string key) => Ext.TryGetValue(key, out long v) ? v : 0;
    }

    public class CombatResolverTests
    {
        private static readonly TileCoord Spot = new TileCoord(5, 5);

        private static UnitView U(int id, int owner, UnitRole role, int strength, int level = 0)
        {
            return new UnitView(id, owner, role, level == 0 ? strength : level, strength, Spot, 0);
        }

        private static BaseView Base(string? site = null, int coreLevel = 1)
        {
            return new BaseView(
                7, 1, Spot, site, coreLevel, new ResourceVector(100, 100, 100, 100, 100, 80),
                ImmArray<BuildingView>.Of(
                    new BuildingView(BuildingRole.Food, 2, Spot, 0),
                    new BuildingView(BuildingRole.Garrison, 1, Spot, 0)));
        }

        private static FakeContext Strong(BaseView? target, params UnitView[] defenders)
        {
            UnitView[] attackers =
            {
                U(1, 0, UnitRole.Line, 5), U(2, 0, UnitRole.Line, 5), U(3, 0, UnitRole.Line, 5),
                U(4, 0, UnitRole.Shock, 5), U(5, 0, UnitRole.Shock, 5), U(6, 0, UnitRole.Ranged, 5),
                U(7, 0, UnitRole.Commander, 1, 4),
            };
            return new FakeContext { Attackers = attackers, Defenders = defenders, TargetBase = target };
        }

        private static CombatResolver Resolver()
        {
            return new CombatResolver(new CombatResolverOptions(BattleTestKit.AlwaysHit));
        }

        private static FakeContext Raid(FakeContext ctx, bool canDestroy = true, bool captureLegal = true)
        {
            ctx.Kind = AttackKind.Raid;
            ctx.RaidCanDestroy = canDestroy;
            ctx.CaptureLegal = captureLegal;
            return ctx;
        }

        [Test]
        public void DefendersWhoCannotFightAreRemovedWithoutABattle()
        {
            FakeContext ctx = Strong(null, U(20, 1, UnitRole.Scout, 1), U(21, 1, UnitRole.Founder, 1));

            CombatResult result = Resolver().Resolve(ctx);

            Assert.That(result.UnitChanges.Select(c => (c.UnitId, c.NewStrength)), Is.EqualTo(new[] { (20, 0), (21, 0) }));
            Assert.That(result.Events.OfType<UnitDestroyed>(), Is.Empty, "the turn pipeline raises unit_destroyed from the zero-strength changes");
            Assert.That(result.BaseChange, Is.Null);
        }

        [Test]
        public void ANoOpContextWithoutDefendersChangesNothing()
        {
            CombatResult result = Resolver().Resolve(Strong(null));
            Assert.That(result.UnitChanges.Count, Is.EqualTo(0));
        }

        [Test]
        public void AStackBattleReportsStrengthsAndDestroyedUnits()
        {
            FakeContext ctx = Strong(null, U(20, 1, UnitRole.Line, 1), U(21, 1, UnitRole.Ranged, 1));

            CombatResult result = Resolver().Resolve(ctx);

            Assert.That(result.UnitChanges.Where(c => c.UnitId >= 20).All(c => c.NewStrength <= 0), Is.True);
            Assert.That(result.UnitChanges.Count(c => c.UnitId >= 20), Is.EqualTo(2));
            Assert.That(result.BaseChange, Is.Null);
        }

        [Test]
        public void IdenticalContextsGiveIdenticalResults()
        {
            FakeContext a = Strong(null, U(20, 1, UnitRole.Line, 3), U(21, 1, UnitRole.Shock, 3));
            FakeContext b = Strong(null, U(20, 1, UnitRole.Line, 3), U(21, 1, UnitRole.Shock, 3));
            CombatResolver r = new CombatResolver(new CombatResolverOptions(CombatRules.Default));

            CombatResult first = r.Resolve(a);
            CombatResult second = r.Resolve(b);

            Assert.That(first.UnitChanges.Select(c => (c.UnitId, c.NewStrength)), Is.EqualTo(second.UnitChanges.Select(c => (c.UnitId, c.NewStrength))));
            Assert.That(first.Events.Count, Is.EqualTo(second.Events.Count));
        }

        [Test]
        public void DifferentSeedsCanGiveDifferentBattles()
        {
            HashSet<string> seen = new HashSet<string>();
            CombatResolver r = new CombatResolver(new CombatResolverOptions(CombatRules.Default));
            for (ulong seed = 1; seed <= 20; seed++)
            {
                FakeContext ctx = Strong(null, U(20, 1, UnitRole.Line, 4), U(21, 1, UnitRole.Line, 4), U(22, 1, UnitRole.Shock, 4));
                ctx.BattleSeed = seed;
                seen.Add(string.Join(",", r.Resolve(ctx).UnitChanges.Select(c => c.UnitId + ":" + c.NewStrength)));
            }

            Assert.That(seen.Count, Is.GreaterThan(1));
        }

        [Test]
        public void AWonCaptureHandsOverTheBaseAndHalvesEveryStockButPeople()
        {
            FakeContext ctx = Strong(Base(site: "site.capital"));

            CombatResult result = Resolver().Resolve(ctx);

            BaseChange change = result.BaseChange!;
            Assert.That(change.Outcome, Is.EqualTo(BaseOutcome.Captured));
            Assert.That(change.NewOwner, Is.EqualTo(0));
            ResourceVector stock = change.NewStock!.Value;
            Assert.That((stock.Basic, stock.Hard, stock.Coin, stock.Wares, stock.Food), Is.EqualTo((50, 50, 50, 50, 50)));
            Assert.That(stock.Pop, Is.InRange(0, 80), "only militia losses touch people");
            Assert.That(change.BuildingChanges.Count, Is.EqualTo(1), "one building loses one level");
            SiteTaken taken = result.Events.OfType<SiteTaken>().Single();
            Assert.That((taken.Site, taken.From, taken.TakerSlot, taken.Via), Is.EqualTo(("site.capital", 1, 0, "capture")));
        }

        [Test]
        public void ACapturedBaseWithoutASiteIdRaisesNoSiteEvent()
        {
            CombatResult result = Resolver().Resolve(Strong(Base()));
            Assert.That(result.Events.OfType<SiteTaken>(), Is.Empty);
            Assert.That(result.BaseChange!.Outcome, Is.EqualTo(BaseOutcome.Captured));
        }

        [Test]
        public void ARaidThatBreaksTheDefendersDestroysABaseThatMayBeDestroyed()
        {
            CombatResult result = Resolver().Resolve(Raid(Strong(Base())));

            Assert.That(result.BaseChange!.Outcome, Is.EqualTo(BaseOutcome.Destroyed));
            Assert.That(result.Events.OfType<SiteTaken>(), Is.Empty);
        }

        [Test]
        public void ARaidOnAProtectedSiteBecomesACaptureViaRaid()
        {
            CombatResult result = Resolver().Resolve(Raid(Strong(Base("site.capital")), canDestroy: false));

            Assert.That(result.BaseChange!.Outcome, Is.EqualTo(BaseOutcome.Captured));
            Assert.That(result.Events.OfType<SiteTaken>().Single().Via, Is.EqualTo("raid"));
        }

        [Test]
        public void ARaidOnAProtectedSiteThatCannotBeCapturedLeavesItAtLevelOne()
        {
            CombatResolver r = Resolver();

            CombatResult result = r.Resolve(Raid(Strong(Base("site.capital", coreLevel: 4)), canDestroy: false, captureLegal: false));

            Assert.That(result.BaseChange!.Outcome, Is.EqualTo(BaseOutcome.Unchanged));
            Assert.That(result.BaseChange.NewCoreLevel, Is.EqualTo(1));
            Assert.That(result.Events.OfType<SiteTaken>(), Is.Empty);
        }

        [Test]
        public void DefendersWhoHoldLeaveABaseUnchanged()
        {
            UnitView[] tinyAttack = { U(1, 0, UnitRole.Line, 1), U(7, 0, UnitRole.Commander, 1, 1) };
            FakeContext ctx = new FakeContext { Attackers = tinyAttack, Defenders = new List<UnitView>(), TargetBase = Base(coreLevel: 4), Kind = AttackKind.Raid };
            CombatResolver r = new CombatResolver(new CombatResolverOptions(CombatRules.Default));

            CombatResult result = r.Resolve(ctx);

            Assert.That(result.BaseChange!.Outcome, Is.EqualTo(BaseOutcome.Unchanged));
        }

        [Test]
        public void MilitiaLossesCostPopulationButNothingElseDoes()
        {
            CombatResult result = Resolver().Resolve(Strong(Base(coreLevel: 2)));
            ResourceVector stock = result.BaseChange!.NewStock!.Value;

            Assert.That(stock.Pop, Is.LessThan(80));
            Assert.That(stock.Pop, Is.GreaterThanOrEqualTo(0));
        }

        [Test]
        public void TheTimedPanicModifierIsAskedForTheDefendingSide()
        {
            List<(int Slot, int Turn, bool Defending)> asked = new List<(int, int, bool)>();
            CombatResolver r = Resolver();
            FakeContext ctx = Strong(Base());
            ctx.Panic = (slot, defending) => { asked.Add((slot, ctx.Turn, defending)); return 0; };

            r.Resolve(ctx);

            Assert.That(asked, Does.Contain((1, 10, true)));
        }

        [Test]
        public void TheMilitiaRoleFightsAsLineInfantry()
        {
            FakeContext ctx = Strong(null, U(20, 1, UnitRole.Militia, 2));
            CombatResult result = Resolver().Resolve(ctx);
            Assert.That(result.UnitChanges.Single(c => c.UnitId == 20).NewStrength, Is.LessThanOrEqualTo(0));
        }
    }
}
