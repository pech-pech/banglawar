using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>Applies contract results (<see cref="UnitChange"/>, <see cref="BaseChange"/>) to a state.</summary>
    internal static class ChangeApplier
    {
        public static GameState Units(GameState state, ImmArray<UnitChange> changes, List<GameEvent> events)
        {
            GameState s = state;
            for (int i = 0; i < changes.Count; i++)
            {
                UnitChange c = changes[i];
                int index = s.FindUnitIndex(c.UnitId);
                if (index < 0)
                {
                    continue;
                }

                Unit u = s.UnitTable[index];
                if (c.NewStrength <= 0)
                {
                    s = s.WithoutUnit(u.Id);
                    events.Add(new UnitDestroyed(u.Id, u.Owner));
                    continue;
                }

                TileCoord pos = c.NewPos.HasValue && s.InBounds(c.NewPos.Value) ? c.NewPos.Value : u.Pos;
                s = s.WithUnit(u with { Strength = c.NewStrength, Pos = pos });
            }

            return s;
        }

        /// <summary>Sets commanders' new reputation (0 to 10).</summary>
        public static GameState Reputation(GameState state, ImmArray<ReputationChange> changes)
        {
            GameState s = state;
            for (int i = 0; i < changes.Count; i++)
            {
                int index = s.FindUnitIndex(changes[i].UnitId);
                if (index >= 0)
                {
                    s = s.WithUnit(s.UnitTable[index] with { Reputation = IntMath.Clamp(changes[i].NewReputation, 0, 10) });
                }
            }

            return s;
        }

        /// <summary>Moves retreating units one tile. A retreat to an illegal tile is ignored; a retreating unit leaves its carrier and base.</summary>
        public static GameState Retreats(GameState state, ImmArray<UnitRetreat> retreats, List<GameEvent> events)
        {
            GameState s = state;
            for (int i = 0; i < retreats.Count; i++)
            {
                int index = s.FindUnitIndex(retreats[i].UnitId);
                if (index < 0)
                {
                    continue;
                }

                Unit u = s.UnitTable[index];
                TileCoord to = retreats[i].To;
                if (!CanStandAt(s, u, to))
                {
                    continue;
                }

                events.Add(new UnitRetreated(u.Id, u.Pos, to, u.Owner));
                s = s.WithUnit(u with { Pos = to, AttachedBase = 0, Leader = 0 });
            }

            return s;
        }

        private static bool CanStandAt(GameState s, Unit u, TileCoord to)
        {
            return s.InBounds(to)
                && Map.TerrainInfo.EntryCost(s.TerrainAt(to), RoleIds.MoveClassOf(u.Role)) > 0
                && !CommandEngine.IsBlockedFor(s, u.Owner, to);
        }

        /// <summary>Credits raid spoils to the raider's first base (lowest id); with no base to receive them they are lost.</summary>
        public static GameState Spoils(GameState state, int takerSlot, int fromBase, ResourceVector seized, List<GameEvent> events)
        {
            if (seized.Equals(ResourceVector.Zero))
            {
                return state;
            }

            int toBase = 0;
            GameState s = state;
            for (int i = 0; i < s.BaseTable.Count && toBase == 0; i++)
            {
                if (s.BaseTable[i].Owner == takerSlot)
                {
                    toBase = s.BaseTable[i].Id;
                    s = s.WithBase(s.BaseTable[i] with { Stock = s.BaseTable[i].Stock.Add(seized) });
                }
            }

            events.Add(new RaidSpoilsTaken(fromBase, toBase, takerSlot, seized));
            return s;
        }

        public static GameState Base(GameState state, BaseChange? change)
        {
            if (change == null)
            {
                return state;
            }

            int index = state.FindBaseIndex(change.BaseId);
            if (index < 0)
            {
                return state;
            }

            if (change.Outcome == BaseOutcome.Destroyed)
            {
                return state.WithoutBase(change.BaseId);
            }

            Base b = state.BaseTable[index];
            if (change.Outcome == BaseOutcome.Captured)
            {
                b = b with { Owner = change.NewOwner };
            }

            if (change.NewStock.HasValue)
            {
                b = b with { Stock = change.NewStock.Value };
            }

            if (change.NewCoreLevel >= 1)
            {
                b = b with { CoreLevel = change.NewCoreLevel };
            }

            b = b with { Buildings = ApplyBuildings(b.Buildings, change.BuildingChanges) };
            return state.WithBase(b);
        }

        private static ImmArray<Building> ApplyBuildings(ImmArray<Building> buildings, ImmArray<BuildingLevelChange> changes)
        {
            if (changes.Count == 0)
            {
                return buildings;
            }

            var levels = new int[buildings.Count];
            for (int i = 0; i < levels.Length; i++)
            {
                levels[i] = buildings[i].Level;
            }

            for (int i = 0; i < changes.Count; i++)
            {
                BuildingLevelChange c = changes[i];
                if (c.Index >= 0 && c.Index < levels.Length)
                {
                    levels[c.Index] = c.NewLevel < 0 ? 0 : c.NewLevel;
                }
            }

            var kept = new List<Building>();
            for (int i = 0; i < levels.Length; i++)
            {
                if (levels[i] > 0)
                {
                    kept.Add(buildings[i] with { Level = levels[i] });
                }
            }

            return ImmArray<Building>.From(kept);
        }
    }
}
