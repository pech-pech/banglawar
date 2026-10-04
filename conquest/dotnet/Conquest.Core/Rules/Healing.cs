using System;
using System.Collections.Generic;
using System.Linq;
using Conquest.Core.Contracts;

namespace Conquest.Core.Rules
{
    /// <summary>A building role that heals attached units, with a heal rate per level (spec 06 H7).</summary>
    public sealed class HealingSource
    {
        public HealingSource(string building, int[] perTurnByLevel)
        {
            Building = building;
            PerTurnByLevel = Frozen.List(perTurnByLevel);
        }

        public string Building { get; }

        public IReadOnlyList<int> PerTurnByLevel { get; }
    }

    public sealed class HealingConfig
    {
        public HealingConfig(IEnumerable<HealingSource> sources, int maxStrength)
        {
            Sources = Frozen.List(sources);
            MaxStrength = maxStrength;
        }

        /// <summary>The neutral rule: the base core heals 1 strength per turn (GDD 6.3 step 5).</summary>
        public static HealingConfig Neutral { get; } = new HealingConfig(new[] { new HealingSource("bld.core", new[] { 1, 1, 1, 1 }) }, 5);

        public IReadOnlyList<HealingSource> Sources { get; }

        public int MaxStrength { get; }
    }

    public sealed class HealBuilding
    {
        public HealBuilding(string role, int level)
        {
            Role = role;
            Level = level;
        }

        public string Role { get; }

        public int Level { get; }
    }

    public sealed class HealUnit
    {
        public HealUnit(int id, int strength, int maxStrength)
        {
            Id = id;
            Strength = strength;
            MaxStrength = maxStrength;
        }

        public int Id { get; }

        public int Strength { get; }

        public int MaxStrength { get; }
    }

    /// <summary>A base with its functional buildings and the units attached to it.</summary>
    public sealed class HealBase
    {
        public HealBase(int id, int ownerSlot, IEnumerable<HealBuilding> functionalBuildings, IEnumerable<HealUnit> units)
        {
            Id = id;
            OwnerSlot = ownerSlot;
            FunctionalBuildings = Frozen.List(functionalBuildings);
            Units = Frozen.List(units);
        }

        public int Id { get; }

        public int OwnerSlot { get; }

        public IReadOnlyList<HealBuilding> FunctionalBuildings { get; }

        public IReadOnlyList<HealUnit> Units { get; }
    }

    public sealed class HealedUnit
    {
        public HealedUnit(int unitId, int newStrength, int amount, string building, int ownerSlot)
        {
            UnitId = unitId;
            NewStrength = newStrength;
            Amount = amount;
            Building = building;
            OwnerSlot = ownerSlot;
        }

        public int UnitId { get; }

        public int NewStrength { get; }

        public int Amount { get; }

        /// <summary>The role id of the source that supplied the heal rate.</summary>
        public string Building { get; }

        public int OwnerSlot { get; }
    }

    /// <summary>Pipeline step 5: healing by building role. Sources do not stack; the best functional one counts.</summary>
    public static class HealingRules
    {
        public static IReadOnlyList<HealedUnit> Compute(HealingConfig config, IEnumerable<HealBase> bases)
        {
            List<HealedUnit> healed = new List<HealedUnit>();
            foreach (HealBase b in bases.OrderBy(x => x.Id))
            {
                string? source = BestSource(config, b, out int rate);
                if (source == null)
                {
                    continue;
                }

                foreach (HealUnit u in b.Units.OrderBy(x => x.Id))
                {
                    int cap = Math.Min(u.MaxStrength, config.MaxStrength);
                    int amount = Math.Min(rate, cap - u.Strength);
                    if (amount > 0)
                    {
                        healed.Add(new HealedUnit(u.Id, u.Strength + amount, amount, source, b.OwnerSlot));
                    }
                }
            }

            return Frozen.List(healed);
        }

        /// <summary>Checks the sources against the role table: one entry per role, one rate per role level.</summary>
        public static IReadOnlyList<RuleIssue> Validate(HealingConfig config, Func<string, int> levelsOfRole)
        {
            List<RuleIssue> issues = new List<RuleIssue>();
            List<string> seen = new List<string>();
            for (int i = 0; i < config.Sources.Count; i++)
            {
                HealingSource s = config.Sources[i];
                string path = "/hooks/healing/sources/" + i;
                if (seen.Contains(s.Building, StringComparer.Ordinal))
                {
                    issues.Add(new RuleIssue("err.healing_duplicate", path));
                }

                seen.Add(s.Building);
                int levels = levelsOfRole(s.Building);
                if (levels <= 0)
                {
                    issues.Add(new RuleIssue("err.healing_role", path));
                }
                else if (s.PerTurnByLevel.Count != levels)
                {
                    issues.Add(new RuleIssue("err.healing_levels", path));
                }
            }

            return Frozen.List(issues);
        }

        private static string? BestSource(HealingConfig config, HealBase b, out int bestRate)
        {
            string? best = null;
            bestRate = 0;
            foreach (HealBuilding building in b.FunctionalBuildings)
            {
                HealingSource? source = config.Sources.FirstOrDefault(s => string.Equals(s.Building, building.Role, StringComparison.Ordinal));
                if (source == null || building.Level < 1 || source.PerTurnByLevel.Count == 0)
                {
                    continue;
                }

                int rate = source.PerTurnByLevel[Math.Min(building.Level, source.PerTurnByLevel.Count) - 1];
                bool better = best == null || rate > bestRate || (rate == bestRate && string.CompareOrdinal(building.Role, best) < 0);
                if (rate > 0 && better)
                {
                    best = building.Role;
                    bestRate = rate;
                }
            }

            return best;
        }
    }

    /// <summary>The contract adapter: reads a game state and returns the strength changes and <c>ev.unit_healed</c> events.</summary>
    public sealed class HealingStep : IHealingSource
    {
        private readonly HealingConfig _config;

        public HealingStep(HealingConfig config)
        {
            _config = config;
        }

        /// <summary>
        /// "Attached to a base" is read as: a unit of the base's owner standing on the base tile. The contract has no
        /// attachment field; a building heals only once <c>turn &gt;= ReadyTurn</c>; the core is always functional.
        /// </summary>
        public StepResult Compute(IGameStateView state)
        {
            List<HealBase> bases = new List<HealBase>();
            foreach (BaseView b in state.Bases)
            {
                bases.Add(new HealBase(b.Id, b.Owner, FunctionalBuildings(b, state.Turn), UnitsAt(state, b)));
            }

            IReadOnlyList<HealedUnit> healed = HealingRules.Compute(_config, bases);
            if (healed.Count == 0)
            {
                return StepResult.None;
            }

            return new StepResult(
                ImmArray<UnitChange>.From(healed.Select(h => new UnitChange(h.UnitId, h.NewStrength, null))),
                ImmArray<GameEvent>.From(healed.Select(h => (GameEvent)new UnitHealed(h.UnitId, h.Amount, h.Building, h.OwnerSlot))));
        }

        private static List<HealBuilding> FunctionalBuildings(BaseView b, int turn)
        {
            List<HealBuilding> list = new List<HealBuilding>();
            if (b.CoreLevel > 0)
            {
                list.Add(new HealBuilding("bld.core", b.CoreLevel));
            }

            foreach (BuildingView v in b.Buildings)
            {
                if (turn >= v.ReadyTurn)
                {
                    list.Add(new HealBuilding(RoleIds.Of(v.Role), v.Level));
                }
            }

            return list;
        }

        private static IEnumerable<HealUnit> UnitsAt(IGameStateView state, BaseView b)
        {
            return state.UnitsAt(b.Pos)
                .Where(u => u.Owner == b.Owner && u.Strength > 0)
                .Select(u => new HealUnit(u.Id, u.Strength, Math.Max(u.Level, u.Strength)));
        }
    }
}
