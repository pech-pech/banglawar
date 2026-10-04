using Conquest.Core.Combat;

namespace Conquest.Tests.Combat
{
    /// <summary>Builders and rule presets shared by the battle tests.</summary>
    internal static class BattleTestKit
    {
        public static readonly CombatRules Default = CombatRules.Default;

        /// <summary>Every shot hits.</summary>
        public static readonly CombatRules AlwaysHit = new CombatRules(hitMin: 1000, hitMax: 1000, panicBase: 0, panicPerLostPermille: 0, panicMax: 0);

        /// <summary>Every shot hits and every damaged survivor panics.</summary>
        public static readonly CombatRules AlwaysHitAlwaysPanic = new CombatRules(hitMin: 1000, hitMax: 1000, panicBase: 1000, panicPerLostPermille: 0, panicMax: 1000);

        public static BattleUnit Unit(int id, BattleSide side, UnitKind kind, int strength, int col, int row, int maxStrength = 0)
        {
            return new BattleUnit(id, side, kind, strength, maxStrength == 0 ? strength : maxStrength, col, row);
        }

        public static BattleUnit Reserve(int id, BattleSide side, UnitKind kind, int strength)
        {
            return new BattleUnit(id, side, kind, strength, strength, -1, -1);
        }

        public static BattleState State(params BattleUnit[] units)
        {
            return BattleState.Create(units, new SideInfo(), new SideInfo());
        }

        public static BattleState StateWith(SideInfo attacker, SideInfo defender, params BattleUnit[] units)
        {
            return BattleState.Create(units, attacker, defender);
        }

        public static BattleState Apply(BattleState state, BattleAction action, CombatRules? rules = null, ulong seed = 1)
        {
            BattleStepResult r = BattleEngine.Apply(state, action, rules ?? Default, new SplitMix64(seed));
            Assert.That(r.Ok, Is.True, "expected ok but got " + r.Error);
            return r.State;
        }

        public static string Fail(BattleState state, BattleAction action, CombatRules? rules = null)
        {
            BattleStepResult r = BattleEngine.Apply(state, action, rules ?? Default, new SplitMix64(1));
            Assert.That(r.Ok, Is.False);
            Assert.That(r.State, Is.SameAs(state));
            return r.Error!;
        }
    }
}
