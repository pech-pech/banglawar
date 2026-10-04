using System.Collections.Generic;

namespace Conquest.Content.Model
{
    public sealed class ResourceAmount
    {
        public ResourceAmount(string resource, int amount)
        {
            Resource = resource;
            Amount = amount;
        }

        public string Resource { get; }

        public int Amount { get; }
    }

    /// <summary>A stock of resources in file order. Core maps each entry onto its per-resource integer array.</summary>
    public sealed class StockData
    {
        public static readonly StockData Empty = new StockData(new List<ResourceAmount>());

        public StockData(IReadOnlyList<ResourceAmount> amounts)
        {
            Amounts = amounts;
        }

        public IReadOnlyList<ResourceAmount> Amounts { get; }

        public int Get(string resource)
        {
            foreach (ResourceAmount a in Amounts)
            {
                if (a.Resource == resource)
                {
                    return a.Amount;
                }
            }

            return 0;
        }
    }

    public sealed class BuildingPlacement
    {
        public BuildingPlacement(string role, int level, TilePoint at)
        {
            Role = role;
            Level = level;
            At = at;
        }

        public string Role { get; }

        public int Level { get; }

        /// <summary>Top-left tile of the footprint.</summary>
        public TilePoint At { get; }
    }

    public sealed class UnitGroup
    {
        public UnitGroup(string role, int level, int count)
        {
            Role = role;
            Level = level;
            Count = count;
        }

        public string Role { get; }

        public int Level { get; }

        public int Count { get; }
    }

    public sealed class PrePlacedBase
    {
        public PrePlacedBase(
            string siteId,
            string owner,
            TilePoint anchor,
            int coreLevel,
            IReadOnlyList<BuildingPlacement> buildings,
            StockData stock,
            int pop,
            IReadOnlyList<UnitGroup> garrison,
            int? commanderLevel,
            IReadOnlyList<string> tags,
            bool realPlace,
            bool raidCanDestroy,
            string intelSeed)
        {
            SiteId = siteId;
            Owner = owner;
            Anchor = anchor;
            CoreLevel = coreLevel;
            Buildings = buildings;
            Stock = stock;
            Pop = pop;
            Garrison = garrison;
            CommanderLevel = commanderLevel;
            Tags = tags;
            RealPlace = realPlace;
            RaidCanDestroy = raidCanDestroy;
            IntelSeed = intelSeed;
        }

        /// <summary>Opaque id kept by the base for its whole life (hook H2); the theme gives it a display name.</summary>
        public string SiteId { get; }

        public string Owner { get; }

        public TilePoint Anchor { get; }

        public int CoreLevel { get; }

        public IReadOnlyList<BuildingPlacement> Buildings { get; }

        public StockData Stock { get; }

        /// <summary>Opening <c>res.pop</c> (volunteers or personnel) held by the base.</summary>
        public int Pop { get; }

        public IReadOnlyList<UnitGroup> Garrison { get; }

        public int? CommanderLevel { get; }

        /// <summary>Free scenario tags; only predicates give them meaning.</summary>
        public IReadOnlyList<string> Tags { get; }

        public bool RealPlace { get; }

        public bool RaidCanDestroy { get; }

        public string IntelSeed { get; }
    }
}
