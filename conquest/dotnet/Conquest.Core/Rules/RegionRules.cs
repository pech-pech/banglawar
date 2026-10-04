using System;
using System.Collections.Generic;
using System.Linq;
using Conquest.Core.Contracts;

namespace Conquest.Core.Rules
{
    /// <summary>Named map regions: one region index per tile (-1 = none). A base belongs to the region of its core tile.</summary>
    public sealed class RegionMap
    {
        private readonly int[] _byTile;

        public RegionMap(int width, int height, IEnumerable<string> regionIds, int[] regionIndexByTile)
        {
            Width = width;
            Height = height;
            RegionIds = Frozen.List(regionIds);
            _byTile = (int[])regionIndexByTile.Clone();
        }

        public int Width { get; }

        public int Height { get; }

        public IReadOnlyList<string> RegionIds { get; }

        public string? RegionOf(int x, int y)
        {
            if (x < 0 || y < 0 || x >= Width || y >= Height)
            {
                return null;
            }

            int index = _byTile[(y * Width) + x];
            return index < 0 || index >= RegionIds.Count ? null : RegionIds[index];
        }
    }

    public sealed class RegionRulesConfig
    {
        public RegionRulesConfig(
            bool enabled,
            int capMinLevel,
            int capMaxPerRegion,
            IEnumerable<int> cappedSlots,
            int bonusPct,
            IEnumerable<BuildingRole> bonusAppliesTo)
        {
            Enabled = enabled;
            CapMinLevel = capMinLevel;
            CapMaxPerRegion = capMaxPerRegion;
            CappedSlots = Frozen.List(cappedSlots);
            BonusPct = bonusPct;
            BonusAppliesTo = Frozen.List(bonusAppliesTo);
        }

        public static RegionRulesConfig Disabled { get; } = new RegionRulesConfig(false, 0, 0, new int[0], 0, new BuildingRole[0]);

        public bool Enabled { get; }

        /// <summary>Cores at or above this level count towards the cap and the bonus.</summary>
        public int CapMinLevel { get; }

        public int CapMaxPerRegion { get; }

        public IReadOnlyList<int> CappedSlots { get; }

        /// <summary>Percentage points added to the productivity modifier before the clamp (GDD 8.4).</summary>
        public int BonusPct { get; }

        public IReadOnlyList<BuildingRole> BonusAppliesTo { get; }
    }

    public sealed class CoreInfo
    {
        public CoreInfo(int baseId, int slot, string? region, int level)
        {
            BaseId = baseId;
            Slot = slot;
            Region = region;
            Level = level;
        }

        public int BaseId { get; }

        public int Slot { get; }

        public string? Region { get; }

        public int Level { get; }
    }

    public sealed class PendingUpgrade
    {
        public PendingUpgrade(int baseId, int slot, string? region, int targetLevel)
        {
            BaseId = baseId;
            Slot = slot;
            Region = region;
            TargetLevel = targetLevel;
        }

        public int BaseId { get; }

        public int Slot { get; }

        public string? Region { get; }

        public int TargetLevel { get; }
    }

    public sealed class RegionCheck
    {
        private RegionCheck(bool allowed, string? errorCode, string? region)
        {
            Allowed = allowed;
            ErrorCode = errorCode;
            Region = region;
        }

        public bool Allowed { get; }

        public string? ErrorCode { get; }

        public string? Region { get; }

        public static RegionCheck Ok { get; } = new RegionCheck(true, null, null);

        public static RegionCheck Refused(string region)
        {
            return new RegionCheck(false, "err.region_cap", region);
        }
    }

    /// <summary>
    /// Spec 06 H6. The cap is checked when an order is queued: a core upgrade to the cap level is refused when the faction
    /// already owns, or has queued, the allowed number of such cores in the region. Ownership is never revoked.
    /// </summary>
    public static class RegionRules
    {
        public static RegionCheck CheckUpgrade(
            RegionRulesConfig config,
            int slot,
            int baseId,
            string? region,
            int targetLevel,
            IReadOnlyList<CoreInfo> owned,
            IReadOnlyList<PendingUpgrade> pending)
        {
            if (!config.Enabled || region == null || targetLevel < config.CapMinLevel || !config.CappedSlots.Contains(slot))
            {
                return RegionCheck.Ok;
            }

            int ownedCount = owned.Count(c => c.Slot == slot && c.BaseId != baseId && Same(c.Region, region) && c.Level >= config.CapMinLevel);
            int pendingCount = pending.Count(p => p.Slot == slot && p.BaseId != baseId && Same(p.Region, region) && p.TargetLevel >= config.CapMinLevel);
            return ownedCount + pendingCount >= config.CapMaxPerRegion ? RegionCheck.Refused(region) : RegionCheck.Ok;
        }

        /// <summary>The productivity bonus (percentage points) for a building of a base in <paramref name="region"/>.</summary>
        public static int BonusPct(RegionRulesConfig config, int slot, string? region, IReadOnlyList<CoreInfo> owned, BuildingRole role)
        {
            if (!config.Enabled || region == null || !config.BonusAppliesTo.Contains(role))
            {
                return 0;
            }

            bool holdsCore = owned.Any(c => c.Slot == slot && Same(c.Region, region) && c.Level >= config.CapMinLevel);
            return holdsCore ? config.BonusPct : 0;
        }

        private static bool Same(string? a, string? b)
        {
            return string.Equals(a, b, StringComparison.Ordinal);
        }
    }
}
