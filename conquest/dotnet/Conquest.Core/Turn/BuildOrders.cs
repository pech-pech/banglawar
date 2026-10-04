using Conquest.Core.Contracts;
using Conquest.Core.Map;

namespace Conquest.Core.Turn
{
    /// <summary>Build and upgrade orders (GDD 8.1, 8.6). Costs are paid at order time; the result is functional next turn.</summary>
    internal static class BuildOrders
    {
        public static CommandResult Build(GameState state, BuildCommand cmd)
        {
            int bi = state.FindBaseIndex(cmd.BaseId);
            if (bi < 0)
            {
                return CommandResult.Failure(state, Err.UnknownBase);
            }

            Base b = state.BaseTable[bi];
            if (b.Owner != cmd.Slot)
            {
                return CommandResult.Failure(state, Err.NotOwner);
            }

            if (!state.InBounds(cmd.At))
            {
                return CommandResult.Failure(state, Err.OutOfBounds);
            }

            if (b.Pos.DistanceTo(cmd.At) > b.CoreLevel + 1)
            {
                return CommandResult.Failure(state, Err.OutsideArea);
            }

            if (!TerrainInfo.IsBuildable(state.TerrainAt(cmd.At)) || cmd.At == b.Pos)
            {
                return CommandResult.Failure(state, Err.IllegalSite);
            }

            if (cmd.Role == BuildingRole.Port && !state.Map.TouchesWater(cmd.At))
            {
                return CommandResult.Failure(state, Err.NeedsWater);
            }

            for (int i = 0; i < b.Buildings.Count; i++)
            {
                if (b.Buildings[i].Pos == cmd.At)
                {
                    return CommandResult.Failure(state, Err.TileOccupied);
                }

                if (cmd.Role == BuildingRole.Academy && b.Buildings[i].Role == BuildingRole.Academy)
                {
                    return CommandResult.Failure(state, Err.DuplicateBuilding);
                }
            }

            ResourceVector cost = RuleTables.BuildingCost(cmd.Role, 1);
            if (!b.Stock.Covers(cost))
            {
                return CommandResult.Failure(state, Err.NotEnoughResources);
            }

            Base updated = b with
            {
                Stock = b.Stock.Subtract(cost),
                Buildings = b.Buildings.Add(new Building(cmd.Role, 1, cmd.At, state.Turn + 1, 0)),
            };
            return CommandResult.Success(state.WithBase(updated), ImmArray<GameEvent>.Of(new BuildingOrdered(b.Id, cmd.Role, 1, cmd.Slot)));
        }

        public static CommandResult Upgrade(GameState state, UpgradeCommand cmd, TurnServices svc)
        {
            int bi = state.FindBaseIndex(cmd.BaseId);
            if (bi < 0)
            {
                return CommandResult.Failure(state, Err.UnknownBase);
            }

            Base b = state.BaseTable[bi];
            if (b.Owner != cmd.Slot)
            {
                return CommandResult.Failure(state, Err.NotOwner);
            }

            return cmd.BuildingIndex < 0 ? UpgradeCore(state, b, cmd, svc) : UpgradeBuilding(state, b, cmd);
        }

        private static CommandResult UpgradeCore(GameState state, Base b, UpgradeCommand cmd, TurnServices svc)
        {
            if (b.PendingCoreLevel > 0)
            {
                return CommandResult.Failure(state, Err.NotReady);
            }

            int target = b.CoreLevel + 1;
            if (target > RuleTables.MaxLevel)
            {
                return CommandResult.Failure(state, Err.MaxLevel);
            }

            if (!svc.Regions.CheckCoreUpgrade(state, cmd.Slot, b.Id, target).Allowed)
            {
                return CommandResult.Failure(state, Err.RegionCap);
            }

            ResourceVector cost = RuleTables.CoreCost(target);
            if (!b.Stock.Covers(cost))
            {
                return CommandResult.Failure(state, Err.NotEnoughResources);
            }

            Base updated = b with { Stock = b.Stock.Subtract(cost), PendingCoreLevel = target, CoreReadyTurn = state.Turn + 1 };
            return CommandResult.Success(state.WithBase(updated), ImmArray<GameEvent>.Of(new CoreUpgradeOrdered(b.Id, target, cmd.Slot)));
        }

        private static CommandResult UpgradeBuilding(GameState state, Base b, UpgradeCommand cmd)
        {
            if (cmd.BuildingIndex >= b.Buildings.Count)
            {
                return CommandResult.Failure(state, Err.UnknownBuilding);
            }

            Building x = b.Buildings[cmd.BuildingIndex];
            if (x.PendingLevel > 0 || x.ReadyTurn > state.Turn)
            {
                return CommandResult.Failure(state, Err.NotReady);
            }

            int target = x.Level + 1;
            if (target > RuleTables.MaxBuildingLevel(x.Role))
            {
                return CommandResult.Failure(state, Err.MaxLevel);
            }

            if (target > b.CoreLevel)
            {
                return CommandResult.Failure(state, Err.CenterTooLow);
            }

            ResourceVector cost = RuleTables.BuildingCost(x.Role, target);
            if (!b.Stock.Covers(cost))
            {
                return CommandResult.Failure(state, Err.NotEnoughResources);
            }

            Building pending = x with { PendingLevel = target, ReadyTurn = state.Turn + 1 };
            Base updated = b with { Stock = b.Stock.Subtract(cost), Buildings = b.Buildings.SetItem(cmd.BuildingIndex, pending) };
            return CommandResult.Success(state.WithBase(updated), ImmArray<GameEvent>.Of(new BuildingOrdered(b.Id, x.Role, target, cmd.Slot)));
        }
    }
}
