using System;
using System.Collections.Generic;
using System.Linq;
using Conquest.Core.Contracts;

namespace Conquest.Core.Rules
{
    /// <summary>A per-unit-role movement override inside a season.</summary>
    public sealed class RolePct
    {
        public RolePct(UnitRole role, int pct)
        {
            Role = role;
            Pct = pct;
        }

        public UnitRole Role { get; }

        public int Pct { get; }
    }

    /// <summary>What a season does: integer percents on movement cost (by class or by unit role) and on food output.</summary>
    public sealed class SeasonDefinition
    {
        public SeasonDefinition(string id, int landPct = 100, int waterPct = 100, int foodPct = 100, IEnumerable<RolePct>? byUnit = null)
        {
            Id = id;
            LandPct = landPct;
            WaterPct = waterPct;
            FoodPct = foodPct;
            ByUnit = Frozen.List(byUnit);
        }

        public string Id { get; }

        public int LandPct { get; }

        public int WaterPct { get; }

        public int FoodPct { get; }

        public IReadOnlyList<RolePct> ByUnit { get; }
    }

    /// <summary>An inclusive turn range of the scenario's calendar mapped to a season id.</summary>
    public sealed class SeasonRange
    {
        public SeasonRange(int fromTurn, int toTurn, string seasonId)
        {
            FromTurn = fromTurn;
            ToTurn = toTurn;
            SeasonId = seasonId;
        }

        public int FromTurn { get; }

        public int ToTurn { get; }

        public string SeasonId { get; }
    }

    /// <summary>
    /// Spec 06 H3: the season table. Definitions come from the ruleset, the schedule from the scenario. Terrain never reads
    /// it. With the hook off every lookup returns the neutral season and 100 per cent.
    /// </summary>
    public sealed class SeasonTable : IRuleHooks
    {
        public const string NeutralId = "season.neutral";
        private const int Neutral = 100;

        public SeasonTable(
            bool enabled,
            IEnumerable<SeasonDefinition> definitions,
            IEnumerable<SeasonRange> schedule,
            int moveMinPct = 50,
            int moveMaxPct = 300,
            int foodMinPct = 50,
            int foodMaxPct = 200)
        {
            Enabled = enabled;
            Definitions = Frozen.List(definitions);
            Schedule = Frozen.List(schedule);
            MoveMinPct = moveMinPct;
            MoveMaxPct = moveMaxPct;
            FoodMinPct = foodMinPct;
            FoodMaxPct = foodMaxPct;
        }

        public static SeasonTable Disabled { get; } = new SeasonTable(false, new SeasonDefinition[0], new SeasonRange[0]);

        public bool Enabled { get; }

        public IReadOnlyList<SeasonDefinition> Definitions { get; }

        public IReadOnlyList<SeasonRange> Schedule { get; }

        public int MoveMinPct { get; }

        public int MoveMaxPct { get; }

        public int FoodMinPct { get; }

        public int FoodMaxPct { get; }

        public string SeasonAt(int turn)
        {
            if (!Enabled)
            {
                return NeutralId;
            }

            foreach (SeasonRange r in Schedule)
            {
                if (turn >= r.FromTurn && turn <= r.ToTurn)
                {
                    return r.SeasonId;
                }
            }

            return NeutralId;
        }

        public int MoveCostPct(int turn, MoveClass moveClass)
        {
            SeasonDefinition? d = DefinitionAt(turn);
            if (d == null)
            {
                return Neutral;
            }

            return moveClass == MoveClass.Water ? d.WaterPct : d.LandPct;
        }

        /// <summary>The unit's own percent when the season overrides its role, else the percent of its movement class.</summary>
        public int MoveCostPctFor(int turn, UnitRole role)
        {
            SeasonDefinition? d = DefinitionAt(turn);
            if (d == null)
            {
                return Neutral;
            }

            RolePct? own = d.ByUnit.FirstOrDefault(r => r.Role == role);
            return own != null ? own.Pct : MoveCostPct(turn, RoleIds.MoveClassOf(role));
        }

        public int FoodOutputPct(int turn)
        {
            return DefinitionAt(turn)?.FoodPct ?? Neutral;
        }

        /// <summary>Step cost in hundredths of a movement point: terrain cost times the percent.</summary>
        public static int StepCostHundredths(int terrainCost, int pct)
        {
            return checked(terrainCost * pct);
        }

        /// <summary><c>floor(base * (100 + modifier) * foodPct / 10000)</c>, one floor after both percents (spec 06 H3).</summary>
        public int FoodOutput(int baseOutput, int modifierPct, int turn)
        {
            long numerator = (long)baseOutput * (100 + modifierPct) * FoodOutputPct(turn);
            return checked((int)IntMath.FloorDiv(numerator, 10000L));
        }

        /// <summary>The <c>ev.season_started</c> event for the end of <paramref name="turn"/>, or null when the season does not change.</summary>
        public SeasonStarted? SeasonStartedAfter(int turn)
        {
            if (!Enabled)
            {
                return null;
            }

            string next = SeasonAt(turn + 1);
            return string.Equals(next, SeasonAt(turn), StringComparison.Ordinal) ? null : new SeasonStarted(next);
        }

        public IReadOnlyList<RuleIssue> Validate()
        {
            List<RuleIssue> issues = new List<RuleIssue>();
            if (!Enabled)
            {
                if (Schedule.Count > 0)
                {
                    issues.Add(new RuleIssue("err.hook_disabled", "/hooks/seasons/enabled"));
                }

                return Frozen.List(issues);
            }

            CheckDefinitions(issues);
            CheckSchedule(issues);
            return Frozen.List(issues);
        }

        private SeasonDefinition? DefinitionAt(int turn)
        {
            if (!Enabled)
            {
                return null;
            }

            string id = SeasonAt(turn);
            return Definitions.FirstOrDefault(d => string.Equals(d.Id, id, StringComparison.Ordinal));
        }

        private void CheckDefinitions(List<RuleIssue> issues)
        {
            for (int i = 0; i < Definitions.Count; i++)
            {
                SeasonDefinition d = Definitions[i];
                string path = "/hooks/seasons/definitions/" + i;
                if (Definitions.Take(i).Any(o => string.Equals(o.Id, d.Id, StringComparison.Ordinal)))
                {
                    issues.Add(new RuleIssue("err.season_duplicate", path));
                }

                bool movesOk = InRange(d.LandPct, MoveMinPct, MoveMaxPct) && InRange(d.WaterPct, MoveMinPct, MoveMaxPct)
                    && d.ByUnit.All(r => InRange(r.Pct, MoveMinPct, MoveMaxPct));
                if (!movesOk || !InRange(d.FoodPct, FoodMinPct, FoodMaxPct))
                {
                    issues.Add(new RuleIssue("err.season_bounds", path));
                }
            }
        }

        private void CheckSchedule(List<RuleIssue> issues)
        {
            for (int i = 0; i < Schedule.Count; i++)
            {
                SeasonRange r = Schedule[i];
                string path = "/season_schedule/" + i;
                if (r.FromTurn > r.ToTurn)
                {
                    issues.Add(new RuleIssue("err.season_range", path));
                }

                if (!Definitions.Any(d => string.Equals(d.Id, r.SeasonId, StringComparison.Ordinal)))
                {
                    issues.Add(new RuleIssue("err.season_unknown", path));
                }
            }

            List<SeasonRange> ordered = Schedule.OrderBy(r => r.FromTurn).ToList();
            for (int i = 1; i < ordered.Count; i++)
            {
                if (ordered[i].FromTurn <= ordered[i - 1].ToTurn)
                {
                    issues.Add(new RuleIssue("err.season_overlap", "/season_schedule"));
                    break;
                }
            }
        }

        private static bool InRange(int value, int min, int max)
        {
            return value >= min && value <= max;
        }
    }
}
