using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Map;
using Conquest.Core.Turn;

namespace Conquest.Tests.Turn;

internal static class TurnTestKit
{
    // 12 x 8; x = 0 is deep water, a lake at (11, 7), forest/hills/peak patches
    public static readonly string[] Rows =
    {
        "~...........",
        "~...ff..h...",
        "~...ff..hM..",
        "~..j........",
        "~...........",
        "~.....==....",
        "~.....==....",
        "~..........-",
    };

    public static GameMap Map()
    {
        const string legend = "~-=.fjhM";
        var tiles = new Terrain[Rows.Length * Rows[0].Length];
        for (int y = 0; y < Rows.Length; y++)
        {
            for (int x = 0; x < Rows[0].Length; x++)
            {
                tiles[y * Rows[0].Length + x] = (Terrain)legend.IndexOf(Rows[y][x]);
            }
        }

        return GameMap.Create(Rows[0].Length, Rows.Length, tiles);
    }

    public static GameState New(int slots = 2, ulong seed = 42) => GameFactory.NewGame(Map(), seed, slots);

    public static GameState Unit(GameState s, int owner, UnitRole role, int x, int y, out int id, int level = 1) =>
        GameFactory.AddUnit(s, owner, role, level, new TileCoord(x, y), out id);

    public static GameState Base(GameState s, int owner, int x, int y, out int id, int core = 1, ResourceVector? stock = null, string? site = null) =>
        GameFactory.AddBase(s, owner, new TileCoord(x, y), core, stock ?? ResourceVector.Zero, site, out id);

    public static readonly ResourceVector Rich = new ResourceVector(500, 500, 500, 500, 500, 100);

    public static GameState Ok(CommandResult r)
    {
        Assert.That(r.Ok, Is.True, r.Error);
        return r.State;
    }

    public static CommandResult Do(GameState s, Command c, TurnServices? svc = null) => CommandEngine.Apply(s, c, svc);

    public static GameState EndAll(GameState s, TurnServices? svc = null, System.Collections.Generic.List<GameEvent>? sink = null)
    {
        GameState cur = s;
        for (int slot = 0; slot < s.SlotCount; slot++)
        {
            if (cur.Factions[slot].Eliminated)
            {
                continue;
            }

            CommandResult r = CommandEngine.Apply(cur, new EndTurnCommand(slot), svc);
            Assert.That(r.Ok, Is.True, r.Error);
            cur = r.State;
            sink?.AddRange(r.Events);
        }

        return cur;
    }
}

internal sealed class KillAllResolver : ICombatResolver
{
    public ICombatContext? Last { get; private set; }

    public int Calls { get; private set; }

    public CombatResult Resolve(ICombatContext context)
    {
        Last = context;
        Calls++;
        var changes = context.Defenders.Select(d => new UnitChange(d.Id, 0, null)).ToArray();
        BaseChange? bc = context.TargetBase == null
            ? null
            : new BaseChange(context.TargetBase.Id, BaseOutcome.Captured, context.AttackerSlot, new ResourceVector(1, 1, 1, 1, 1, 1), 1,
                ImmArray<BuildingLevelChange>.Of(new BuildingLevelChange(0, 0)));
        GameEvent[] ev = context.TargetBase == null ? new GameEvent[0] : new GameEvent[] { new SiteTaken("site.x", context.DefenderSlot, context.AttackerSlot, "raid") };
        return new CombatResult(ImmArray<UnitChange>.Of(changes), bc, ImmArray<GameEvent>.Of(ev));
    }
}

internal sealed class DestroyBaseResolver : ICombatResolver
{
    public CombatResult Resolve(ICombatContext context) =>
        new CombatResult(ImmArray<UnitChange>.Empty,
            new BaseChange(context.TargetBase!.Id, BaseOutcome.Destroyed, -1, null, -1, ImmArray<BuildingLevelChange>.Empty),
            ImmArray<GameEvent>.Empty);
}

internal sealed class MoveAndHealResolver : ICombatResolver
{
    public CombatResult Resolve(ICombatContext context) =>
        new CombatResult(
            ImmArray<UnitChange>.Of(
                new UnitChange(context.Attackers[0].Id, 2, new TileCoord(99, 99)),
                new UnitChange(777, 1, null),
                new UnitChange(context.Defenders[0].Id, 3, new TileCoord(context.Target.X, context.Target.Y))),
            null,
            ImmArray<GameEvent>.Empty);
}

internal sealed class FakeHooks : IRuleHooks
{
    public string SeasonAt(int turn) => turn >= 2 ? "season.wet" : "season.pre_wet";

    public int MoveCostPct(int turn, MoveClass moveClass) => moveClass == MoveClass.Land ? 200 : 100;

    public int FoodOutputPct(int turn) => 50;
}

internal sealed class FakeHealing : IHealingSource
{
    public StepResult Compute(IGameStateView state)
    {
        var u = state.Units.First();
        return new StepResult(ImmArray<UnitChange>.Of(new UnitChange(u.Id, u.Strength + 1, null)),
            ImmArray<GameEvent>.Of(new UnitHealed(u.Id, 1, "bld.garrison", u.Owner)));
    }
}

internal sealed class FakeEnd : IEndConditions
{
    public int Calls { get; private set; }

    public EndCheckResult Evaluate(IGameStateView state)
    {
        Calls++;
        return new EndCheckResult(
            ImmArray<int>.Of(1),
            true,
            0,
            ImmArray<ExtUpdate>.Of(new ExtUpdate("no_base_turns.f2", state.GetExt("no_base_turns.f2") + 1), new ExtUpdate("zero", 0)),
            ImmArray<GameEvent>.Of(new FactionEliminated(1, "no_base_no_founder", 0), new MatchWon(0, "last_standing")));
    }
}
