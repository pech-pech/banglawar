using System;
using System.Collections.Generic;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Presentation
{
    /// <summary>How the preview reads the odds for the attacker. Wording only; the numbers are in the preview.</summary>
    public enum AttackOutlook
    {
        /// <summary>No resolver is wired, so no estimate exists.</summary>
        Unknown = 0,
        Likely = 1,
        Even = 2,
        Unlikely = 3,
    }

    /// <summary>
    /// What the player sees before ordering an attack: which of the selected units can take part, who stands on the
    /// target, and an estimate of the result. The order itself is validated by the core (a dry run of the real
    /// <see cref="AttackCommand"/>, never a copy of its rules). The estimate plays the battle through the core's own
    /// <see cref="ICombatResolver"/> with a fixed set of seeds, so it is repeatable and consumes none of the game's
    /// random numbers; the real battle is drawn when the turn resolves, so the estimate is a likelihood, not a promise.
    /// </summary>
    public sealed class AttackPreview
    {
        /// <summary>How many seeded battles the estimate plays.</summary>
        public const int DefaultSamples = 24;

        /// <summary>Win chance (per mille) from which the outlook reads Likely.</summary>
        public const int LikelyFromPermille = 650;

        /// <summary>Win chance (per mille) below which the outlook reads Unlikely.</summary>
        public const int UnlikelyBelowPermille = 350;

        private const ulong SeedStep = 0x9E3779B97F4A7C15UL;

        private AttackPreview(
            bool valid,
            string? errorCode,
            IReadOnlyList<int> attackerIds,
            int attackerStrength,
            int defenderCount,
            int defenderStrength,
            bool targetIsBase,
            int samples,
            int winPermille,
            int ownLoss,
            int opposingLoss,
            AttackOutlook outlook)
        {
            Valid = valid;
            ErrorCode = errorCode;
            AttackerIds = attackerIds;
            AttackerStrength = attackerStrength;
            DefenderCount = defenderCount;
            DefenderStrength = defenderStrength;
            TargetIsBase = targetIsBase;
            Samples = samples;
            WinPermille = winPermille;
            ExpectedOwnLoss = ownLoss;
            ExpectedOpposingLoss = opposingLoss;
            Outlook = outlook;
        }

        public static AttackPreview None { get; } = new AttackPreview(false, null, Array.Empty<int>(), 0, 0, 0, false, 0, 0, 0, 0, AttackOutlook.Unknown);

        /// <summary>True when the core would accept the order for <see cref="AttackerIds"/>.</summary>
        public bool Valid { get; }

        /// <summary>An <c>err.*</c> code when the order cannot be given; null when valid (or when there is no preview).</summary>
        public string? ErrorCode { get; }

        /// <summary>The selected units the core accepts for this target, ascending.</summary>
        public IReadOnlyList<int> AttackerIds { get; }

        public int AttackerStrength { get; }

        /// <summary>Units of the opposing side standing on the target tile (0 when only a base is there).</summary>
        public int DefenderCount { get; }

        public int DefenderStrength { get; }

        public bool TargetIsBase { get; }

        public int Samples { get; }

        /// <summary>Share of the seeded battles the attackers won, per mille.</summary>
        public int WinPermille { get; }

        /// <summary>Average strength points the attackers lose in a battle.</summary>
        public int ExpectedOwnLoss { get; }

        /// <summary>Average strength points the opposing units lose in a battle.</summary>
        public int ExpectedOpposingLoss { get; }

        public AttackOutlook Outlook { get; }

        /// <summary>True when a tile holds a unit or a base of another slot, so an attack order has something to hit.</summary>
        public static bool HasOpposingTarget(GameState state, int slot, GridPos tile)
        {
            var at = new TileCoord(tile.X, tile.Y);
            if (!state.InBounds(at)) return false;
            int b = state.FindBaseIndexAt(at);
            if (b >= 0 && state.BaseTable[b].Owner != slot) return true;
            foreach (UnitView u in state.UnitsAt(at))
            {
                if (u.Owner != slot) return true;
            }

            return false;
        }

        public static AttackPreview Build(GameState state, TurnServices services, int slot, IEnumerable<int> selected, GridPos target, int samples = DefaultSamples)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            if (services == null) throw new ArgumentNullException(nameof(services));
            var at = new TileCoord(target.X, target.Y);
            var eligible = new List<int>();
            string? firstError = null;
            var seen = new HashSet<int>();
            foreach (int id in selected)
            {
                if (!seen.Add(id)) continue;
                CommandResult dry = CommandEngine.Apply(state, new AttackCommand(slot, ImmArray<int>.Of(id), at), services);
                if (dry.Ok) eligible.Add(id);
                else firstError = firstError ?? dry.Error;
            }

            if (eligible.Count == 0) return Failed(firstError ?? Err.NoUnits);
            eligible.Sort();
            return Estimate(state, services, slot, eligible, at, samples < 1 ? 1 : samples);
        }

        private static AttackPreview Failed(string code) =>
            new AttackPreview(false, code, Array.Empty<int>(), 0, 0, 0, false, 0, 0, 0, 0, AttackOutlook.Unknown);

        private static AttackPreview Estimate(GameState state, TurnServices services, int slot, List<int> ids, TileCoord at, int samples)
        {
            var attackers = new List<UnitView>();
            int attackerStrength = 0;
            foreach (int id in ids)
            {
                if (!state.TryGetUnit(id, out UnitView u)) continue;
                attackers.Add(u);
                attackerStrength += u.Strength;
            }

            var defenders = new List<UnitView>();
            int defenderStrength = 0;
            foreach (UnitView u in state.UnitsAt(at))
            {
                if (u.Owner == slot) continue;
                defenders.Add(u);
                defenderStrength += u.Strength;
            }

            BaseView? targetBase = state.TryGetBaseAt(at, out BaseView b) && b.Owner != slot ? b : null;
            bool isBase = targetBase != null;
            if (services.Combat == null)
            {
                return new AttackPreview(true, null, ids, attackerStrength, defenders.Count, defenderStrength, isBase, 0, 0, 0, 0, AttackOutlook.Unknown);
            }

            int defenderSlot = defenders.Count > 0 ? defenders[0].Owner : targetBase!.Owner;
            int wins = 0;
            long ownLoss = 0;
            long opposingLoss = 0;
            for (int i = 0; i < samples; i++)
            {
                ulong seed = unchecked(state.Seed + ((ulong)(i + 1) * SeedStep));
                var ctx = new PreviewContext(state, services, seed, slot, defenderSlot, at, attackers, defenders, targetBase);
                CombatResult result = services.Combat.Resolve(ctx);
                if (result.Winner == BattleWinner.Attacker) wins++;
                for (int c = 0; c < result.UnitChanges.Count; c++)
                {
                    UnitChange change = result.UnitChanges[c];
                    if (!state.TryGetUnit(change.UnitId, out UnitView before)) continue;
                    int lost = Math.Max(0, before.Strength - Math.Max(0, change.NewStrength));
                    if (before.Owner == slot) ownLoss += lost;
                    else opposingLoss += lost;
                }
            }

            int win = wins * 1000 / samples;
            AttackOutlook outlook = win >= LikelyFromPermille ? AttackOutlook.Likely : win < UnlikelyBelowPermille ? AttackOutlook.Unlikely : AttackOutlook.Even;
            return new AttackPreview(true, null, ids, attackerStrength, defenders.Count, defenderStrength, isBase, samples, win, RoundDiv(ownLoss, samples), RoundDiv(opposingLoss, samples), outlook);
        }

        private static int RoundDiv(long total, int count) => (int)((total * 2 + count) / (count * 2));

        private sealed class PreviewContext : ICombatContext
        {
            private readonly TurnServices services;

            public PreviewContext(GameState state, TurnServices services, ulong seed, int attackerSlot, int defenderSlot, TileCoord target, IReadOnlyList<UnitView> attackers, IReadOnlyList<UnitView> defenders, BaseView? targetBase)
            {
                State = state;
                this.services = services;
                BattleSeed = seed;
                AttackerSlot = attackerSlot;
                DefenderSlot = defenderSlot;
                Target = target;
                Attackers = attackers;
                Defenders = defenders;
                TargetBase = targetBase;
            }

            public int Turn => State.Turn;

            public ulong BattleSeed { get; }

            public int AttackerSlot { get; }

            public int DefenderSlot { get; }

            public TileCoord Target { get; }

            public Terrain TargetTerrain => State.TerrainAt(Target);

            public IReadOnlyList<UnitView> Attackers { get; }

            public IReadOnlyList<UnitView> Defenders { get; }

            public BaseView? TargetBase { get; }

            public IGameStateView State { get; }

            public AttackKind Kind => AttackKind.Capture;

            public bool RaidCanDestroy => TargetBase?.SiteId == null || services.Scenario.RaidCanDestroy(TargetBase.SiteId);

            public bool CaptureLegal => services.Scenario.CaptureLegal(AttackerSlot, DefenderSlot);

            public int PanicModifierPermille(int slot, bool defendingBase) => services.TimedEffects.PanicModifier(slot, Turn, defendingBase);
        }
    }
}
