using System;
using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Map;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// Validates a command against a state and returns a new state plus events (never mutates, never throws for
    /// invalid input). The last <see cref="EndTurnCommand"/> of the active slots resolves the whole turn.
    /// </summary>
    public static class CommandEngine
    {
        public static CommandResult Apply(GameState state, Command command, TurnServices? services = null)
        {
            TurnServices svc = services ?? TurnServices.Neutral;
            string? gate = CheckSlot(state, command.Slot);
            if (gate != null)
            {
                return CommandResult.Failure(state, gate);
            }

            switch (command)
            {
                case MoveCommand m: return Move(state, m, svc);
                case FoundBaseCommand f: return Found(state, f, svc);
                case BuildCommand b: return BuildOrders.Build(state, b);
                case UpgradeCommand u: return BuildOrders.Upgrade(state, u, svc);
                case AttackCommand a: return QueueAttack(state, a);
                case RecruitCommand r: return RecruitOrders.Recruit(state, r);
                case PatronTradeCommand p: return PatronTrade.Order(state, p, svc);
                case DetachCommand d: return RecruitOrders.Detach(state, d);
                case EndTurnCommand e: return EndTurn(state, e, svc);
                default: return CommandResult.Failure(state, Err.WrongRole);
            }
        }

        private static string? CheckSlot(GameState state, int slot)
        {
            if (state.MatchOver)
            {
                return Err.MatchOver;
            }

            if (slot < 0 || slot >= state.SlotCount)
            {
                return Err.BadSlot;
            }

            if (state.Factions[slot].Eliminated)
            {
                return Err.Eliminated;
            }

            return state.Factions[slot].EndedTurn ? Err.AlreadyEnded : null;
        }

        private static CommandResult Move(GameState state, MoveCommand cmd, TurnServices svc)
        {
            int index = state.FindUnitIndex(cmd.UnitId);
            if (index < 0)
            {
                return CommandResult.Failure(state, Err.UnknownUnit);
            }

            Unit unit = state.UnitTable[index];
            if (unit.Owner != cmd.Slot)
            {
                return CommandResult.Failure(state, Err.NotOwner);
            }

            if (!state.InBounds(cmd.Target))
            {
                return CommandResult.Failure(state, Err.OutOfBounds);
            }

            MoveClass cls = RoleIds.MoveClassOf(unit.Role);
            if (TerrainInfo.EntryCost(state.TerrainAt(cmd.Target), cls) == 0)
            {
                return CommandResult.Failure(state, Err.Impassable);
            }

            PathResult path = FindPath(state, unit, cmd.Target, unit.MovesLeft, svc);
            if (!path.Found)
            {
                return CommandResult.Failure(state, Err.Unreachable);
            }

            Unit moved = unit with { Pos = cmd.Target, MovesLeft = Math.Max(0, unit.MovesLeft - path.Cost), AttachedBase = 0, Leader = 0 };
            var events = new List<GameEvent> { new UnitMoved(unit.Id, unit.Pos, cmd.Target, cmd.Slot) };
            GameState next = CarryFollowers(state.WithUnit(moved), unit, cmd.Target, events);
            return CommandResult.Success(next, ImmArray<GameEvent>.From(events));
        }

        /// <summary>Units carried by a moving commander travel with it and raise their own move events.</summary>
        private static GameState CarryFollowers(GameState state, Unit leader, TileCoord target, List<GameEvent> events)
        {
            GameState s = state;
            for (int i = 0; i < s.UnitTable.Count; i++)
            {
                Unit f = s.UnitTable[i];
                if (f.Leader == leader.Id && f.Pos != target)
                {
                    events.Add(new UnitMoved(f.Id, f.Pos, target, f.Owner));
                    s = s.WithUnit(f with { Pos = target });
                }
            }

            return s;
        }

        /// <summary>The cheapest path within <paramref name="budget"/> hundredths, as a move order would walk it (season percent included).</summary>
        internal static PathResult FindPath(GameState state, Unit unit, TileCoord target, int budget, TurnServices svc)
        {
            MoveClass cls = RoleIds.MoveClassOf(unit.Role);
            int pct = svc.Hooks.MoveCostPct(state.Turn, cls);
            bool fresh = unit.MovesLeft == RuleTables.MoveBudget(unit.Role, unit.Level);
            return Pathfinder.Find(state.Map, unit.Pos, target, cls, budget, pct, fresh, t => IsBlockedFor(state, unit.Owner, t));
        }

        /// <summary>A tile is closed to a slot while an enemy unit or an enemy base stands on it (stacks never mix owners).</summary>
        internal static bool IsBlockedFor(GameState state, int slot, TileCoord tile)
        {
            for (int i = 0; i < state.UnitTable.Count; i++)
            {
                Unit u = state.UnitTable[i];
                if (u.Pos == tile && u.Owner != slot)
                {
                    return true;
                }
            }

            int b = state.FindBaseIndexAt(tile);
            return b >= 0 && state.BaseTable[b].Owner != slot;
        }

        private static CommandResult Found(GameState state, FoundBaseCommand cmd, TurnServices svc)
        {
            int index = state.FindUnitIndex(cmd.UnitId);
            if (index < 0)
            {
                return CommandResult.Failure(state, Err.UnknownUnit);
            }

            Unit unit = state.UnitTable[index];
            if (unit.Owner != cmd.Slot)
            {
                return CommandResult.Failure(state, Err.NotOwner);
            }

            if (unit.Role != UnitRole.Founder)
            {
                return CommandResult.Failure(state, Err.WrongRole);
            }

            if (!TerrainInfo.IsBuildable(state.TerrainAt(unit.Pos)))
            {
                return CommandResult.Failure(state, Err.IllegalSite);
            }

            for (int i = 0; i < state.BaseTable.Count; i++)
            {
                if (state.BaseTable[i].Pos.DistanceTo(unit.Pos) < RuleTables.MinBaseDistance)
                {
                    return CommandResult.Failure(state, Err.TooCloseToBase);
                }
            }

            string kitKey = StartKitKey(cmd.Slot);
            ResourceVector? kit = state.GetExt(kitKey) == 0 ? svc.Scenario.StartKit(cmd.Slot) : null;
            var created = new Base(state.NextBaseId, cmd.Slot, unit.Pos, null, 1, 0, 0, kit ?? RuleTables.StartingStock, ImmArray<Building>.Empty);
            GameState next = kit.HasValue ? state.WithExt(kitKey, 1).WithoutUnit(unit.Id) : state.WithoutUnit(unit.Id);
            next = next with { NextBaseId = next.NextBaseId + 1, BaseTable = next.BaseTable.Add(created) };
            return CommandResult.Success(next, ImmArray<GameEvent>.Of(new BaseFounded(created.Id, cmd.Slot, created.Pos)));
        }

        /// <summary>The ext counter that remembers the slot's start kit was already used by its first base.</summary>
        public static string StartKitKey(int slot) => "kit_used." + TemplateKeysSlot(slot);

        private static string TemplateKeysSlot(int slot) => Rules.TemplateKeys.SlotName(slot);

        private static CommandResult QueueAttack(GameState state, AttackCommand cmd)
        {
            if (cmd.UnitIds.Count == 0)
            {
                return CommandResult.Failure(state, Err.NoUnits);
            }

            if (!state.InBounds(cmd.Target))
            {
                return CommandResult.Failure(state, Err.OutOfBounds);
            }

            var ids = new List<int>();
            for (int i = 0; i < cmd.UnitIds.Count; i++)
            {
                int ui = state.FindUnitIndex(cmd.UnitIds[i]);
                if (ui < 0)
                {
                    return CommandResult.Failure(state, Err.UnknownUnit);
                }

                Unit u = state.UnitTable[ui];
                if (u.Owner != cmd.Slot)
                {
                    return CommandResult.Failure(state, Err.NotOwner);
                }

                if (!RuleTables.CanInitiateAttack(u.Role))
                {
                    return CommandResult.Failure(state, Err.WrongRole);
                }

                if (u.Pos.DistanceTo(cmd.Target) > Attacks.Reach)
                {
                    return CommandResult.Failure(state, Err.OutOfReach);
                }

                if (!ids.Contains(u.Id))
                {
                    ids.Add(u.Id);
                }
            }

            string? targetError = Attacks.CheckTarget(state, cmd.Slot, cmd.Target);
            if (targetError == null && cmd.Kind == AttackKind.Raid && !Attacks.HasEnemyBase(state, cmd.Slot, cmd.Target))
            {
                targetError = Err.NoTarget;
            }

            if (targetError != null)
            {
                return CommandResult.Failure(state, targetError);
            }

            ids.Sort();
            ImmArray<int> units = ImmArray<int>.From(ids);
            var order = new AttackOrder(cmd.Slot, units, cmd.Target, cmd.Kind);
            return CommandResult.Success(
                state with { Attacks = state.Attacks.Add(order) },
                ImmArray<GameEvent>.Of(new AttackOrdered(cmd.Slot, units, cmd.Target, cmd.Kind)));
        }

        private static CommandResult EndTurn(GameState state, EndTurnCommand cmd, TurnServices svc)
        {
            GameState marked = state with { Factions = state.Factions.SetItem(cmd.Slot, state.Factions[cmd.Slot] with { EndedTurn = true }) };
            for (int i = 0; i < marked.Factions.Count; i++)
            {
                if (!marked.Factions[i].Eliminated && !marked.Factions[i].EndedTurn)
                {
                    return CommandResult.Success(marked, ImmArray<GameEvent>.Empty);
                }
            }

            TurnOutcome outcome = TurnResolver.Resolve(marked, svc);
            return CommandResult.Success(outcome.State, outcome.Events);
        }
    }
}
