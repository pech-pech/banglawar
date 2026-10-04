using System;
using System.Collections.Generic;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Map;
using Conquest.Core.Turn;
using Conquest.Presentation;

namespace Conquest.Glue
{
    /// <summary>One command the core accepted (or refused), with the states around it.</summary>
    public sealed class AppliedStep
    {
        public AppliedStep(Command command, GameState before, GameState after, ImmArray<GameEvent> events, string? error)
        {
            Command = command;
            Before = before;
            After = after;
            Events = events;
            Error = error;
        }

        public Command Command { get; }

        public GameState Before { get; }

        public GameState After { get; }

        public ImmArray<GameEvent> Events { get; }

        /// <summary>An <c>err.*</c> code when the core refused the command; null when it was applied.</summary>
        public string? Error { get; }

        public bool Ok => Error == null;
    }

    /// <summary>
    /// SWAP SPOT 2. The only class that calls <see cref="CommandEngine.Apply"/>, <see cref="Pathfinder"/> and
    /// <see cref="RuleTables"/>. It keeps the current <see cref="GameState"/>, maps <see cref="PresentationCommand"/>
    /// to core commands, answers path queries, and records every command it applied (for replay). The core has no
    /// AI yet, so ending the local turn also ends the turn of every other slot (they do nothing).
    /// </summary>
    public sealed class GameSession : ICommandSink, IMovementQuery
    {
        public const string ErrNotInSlice = "err.not_in_slice";

        private readonly List<Command> accepted = new List<Command>();
        private readonly TurnServices services;

        public GameSession(GameState initial, int localSlot, TurnServices? services = null)
        {
            State = initial ?? throw new ArgumentNullException(nameof(initial));
            LocalSlot = localSlot;
            this.services = services ?? TurnServices.Neutral;
        }

        public GameState State { get; private set; }

        public int LocalSlot { get; }

        public TurnServices Services => services;

        /// <summary>Commands the core accepted, in order.</summary>
        public IReadOnlyList<Command> AcceptedCommands => accepted;

        /// <summary>Raised after every command the core answered, accepted or not, before Submit returns.</summary>
        public event Action<AppliedStep>? Applied;

        public CommandOutcome Submit(PresentationCommand command)
        {
            if (command == null) throw new ArgumentNullException(nameof(command));
            switch (command.Kind)
            {
                case CommandKind.Move: return SubmitMoves(command);
                case CommandKind.Attack: return Outcome(Apply(new AttackCommand(LocalSlot, ImmArray<int>.From(command.UnitIds), ToCoord(command.Target))));
                case CommandKind.EndTurn: return SubmitEndTurn();
                default: return new CommandOutcome(false, ErrNotInSlice);
            }
        }

        public CommandOutcome FoundBase(int unitId) => Outcome(Apply(new FoundBaseCommand(LocalSlot, unitId)));

        /// <summary>
        /// The core's own plan (<see cref="GameQueries"/>): the path may take several turns. Per-step costs are added
        /// here from <see cref="Pathfinder.StepCost"/> because the query returns tiles and a total only.
        /// </summary>
        public Conquest.Presentation.MovePlan? PlanMove(int unitId, GridPos target)
        {
            if (!State.TryGetUnit(unitId, out UnitView unit)) return null;
            var queries = new GameQueries(State, services);
            Conquest.Core.Contracts.MovePlan plan = queries.PlanMove(unitId, ToCoord(target));
            if (!plan.Found || plan.Steps.Count == 0) return null;
            MoveClass cls = RoleIds.MoveClassOf(unit.Role);
            int pct = services.Hooks.MoveCostPct(State.Turn, cls);
            var steps = new List<PathStep>(plan.Steps.Count);
            for (int i = 0; i < plan.Steps.Count; i++)
            {
                TileCoord t = plan.Steps[i];
                steps.Add(new PathStep(new GridPos(t.X, t.Y), Pathfinder.StepCost(State.TerrainAt(t), cls, pct)));
            }

            int perTurn = queries.MovesPerTurn(unit.Role, unit.Level) * RuleTables.MovementScale;
            return new Conquest.Presentation.MovePlan(new GridPos(unit.Pos.X, unit.Pos.Y), steps, unit.MovesLeft, perTurn);
        }

        /// <summary>The path the core's own move command would take (same budget, same blocking). Used by the event mapper.</summary>
        public static PathResult FindPath(GameState state, UnitView unit, TileCoord target, TurnServices services)
        {
            MoveClass cls = RoleIds.MoveClassOf(unit.Role);
            int pct = services.Hooks.MoveCostPct(state.Turn, cls);
            bool fresh = unit.MovesLeft == RuleTables.MoveBudget(unit.Role, unit.Level);
            return Pathfinder.Find(state.Map, unit.Pos, target, cls, unit.MovesLeft, pct, fresh, t => IsBlockedFor(state, unit.Owner, t));
        }

        // Same rule as CommandEngine.IsBlockedFor (internal in the core): an enemy unit or base closes a tile.
        private static bool IsBlockedFor(GameState state, int slot, TileCoord tile)
        {
            for (int i = 0; i < state.UnitTable.Count; i++)
            {
                if (state.UnitTable[i].Pos == tile && state.UnitTable[i].Owner != slot) return true;
            }

            int b = state.FindBaseIndexAt(tile);
            return b >= 0 && state.BaseTable[b].Owner != slot;
        }

        private CommandOutcome SubmitMoves(PresentationCommand command)
        {
            var ids = new List<int>(command.UnitIds);
            ids.Sort();
            if (ids.Count == 0) return new CommandOutcome(false, Err.NoUnits);
            AppliedStep? last = null;
            foreach (int id in ids)
            {
                last = Apply(new MoveCommand(LocalSlot, id, ToCoord(command.Target)));
                if (!last.Ok) return Outcome(last);
            }

            return Outcome(last!);
        }

        private CommandOutcome SubmitEndTurn()
        {
            AppliedStep step = Apply(new EndTurnCommand(LocalSlot));
            if (!step.Ok) return Outcome(step);
            for (int slot = 0; slot < State.SlotCount; slot++)
            {
                if (slot == LocalSlot || State.MatchOver) continue;
                if (State.Factions[slot].Eliminated || State.Factions[slot].EndedTurn) continue;
                step = Apply(new EndTurnCommand(slot));
            }

            return Outcome(step);
        }

        private AppliedStep Apply(Command command)
        {
            GameState before = State;
            CommandResult result = CommandEngine.Apply(before, command, services);
            var step = new AppliedStep(command, before, result.State, result.Events, result.Ok ? null : result.Error ?? "err.unknown");
            if (result.Ok)
            {
                State = result.State;
                accepted.Add(command);
            }

            Applied?.Invoke(step);
            return step;
        }

        private static CommandOutcome Outcome(AppliedStep step) => new CommandOutcome(step.Ok, step.Error);

        private static TileCoord ToCoord(GridPos p) => new TileCoord(p.X, p.Y);
    }
}
