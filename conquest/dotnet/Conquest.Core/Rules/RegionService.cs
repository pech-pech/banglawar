using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Rules
{
    /// <summary>
    /// <see cref="IRegionService"/> over a <see cref="RegionMap"/> and a <see cref="RegionRulesConfig"/>. Reads the cores of
    /// the whole state, so a pending upgrade counts against the cap and a captured core can push a slot over it
    /// without being revoked (spec 06 H6).
    /// </summary>
    public sealed class RegionService : IRegionService
    {
        private readonly RegionMap? _map;
        private readonly RegionRulesConfig _config;

        public RegionService(RegionMap? map, RegionRulesConfig config)
        {
            _map = map;
            _config = config;
        }

        public static RegionService None { get; } = new RegionService(null, RegionRulesConfig.Disabled);

        public bool Enabled => _config.Enabled;

        public string? RegionOf(TileCoord tile) => _map?.RegionOf(tile.X, tile.Y);

        public RegionCheck CheckCoreUpgrade(IGameStateView state, int slot, int baseId, int targetLevel)
        {
            if (!_config.Enabled || !state.TryGetBase(baseId, out BaseView subject))
            {
                return RegionCheck.Ok;
            }

            return RegionRules.CheckUpgrade(_config, slot, baseId, RegionOf(subject.Pos), targetLevel, Owned(state), Pending(state));
        }

        public int BonusPct(IGameStateView state, int slot, int baseId, BuildingRole role)
        {
            if (!_config.Enabled || !state.TryGetBase(baseId, out BaseView subject))
            {
                return 0;
            }

            return RegionRules.BonusPct(_config, slot, RegionOf(subject.Pos), Owned(state), role);
        }

        private List<CoreInfo> Owned(IGameStateView state)
        {
            var list = new List<CoreInfo>(state.Bases.Count);
            for (int i = 0; i < state.Bases.Count; i++)
            {
                BaseView b = state.Bases[i];
                list.Add(new CoreInfo(b.Id, b.Owner, RegionOf(b.Pos), b.CoreLevel));
            }

            return list;
        }

        private List<PendingUpgrade> Pending(IGameStateView state)
        {
            var list = new List<PendingUpgrade>();
            for (int i = 0; i < state.Bases.Count; i++)
            {
                BaseView b = state.Bases[i];
                if (b.PendingCoreLevel > 0)
                {
                    list.Add(new PendingUpgrade(b.Id, b.Owner, RegionOf(b.Pos), b.PendingCoreLevel));
                }
            }

            return list;
        }
    }
}
