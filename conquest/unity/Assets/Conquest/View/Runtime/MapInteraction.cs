using System;
using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Glue;
using Conquest.Presentation;

namespace Conquest.UnityView
{
    /// <summary>
    /// The selection and ordering rules of the map, with no Unity types: hover, select, preview a path and confirm a
    /// move by choosing the same tile twice (design decision O-8; the mouse also confirms with a right click). Orders
    /// only go out through <see cref="GameSession"/>, the answer decides what is shown.
    /// </summary>
    public sealed class MapInteraction
    {
        private readonly GameSession session;
        private readonly Localizer text;

        public MapInteraction(GameSession session, Localizer text)
        {
            this.session = session;
            this.text = text;
            Selection = SelectionModel.Create(session.LocalSlot);
        }

        public SelectionModel Selection { get; private set; }

        /// <summary>The tile chosen once and waiting for a second choice.</summary>
        public GridPos? PendingTarget { get; private set; }

        public PathPreview Preview { get; private set; } = PathPreview.None;

        public GridPos? BlockedTarget { get; private set; }

        /// <summary>A short message for the HUD (an error from the core, or a hint); null when there is none.</summary>
        public string? Message { get; private set; }

        public string? LastErrorCode { get; private set; }

        public int OrdersSent { get; private set; }

        public event Action? Changed;

        public void Hover(PickResult pick)
        {
            UnitRef? unit = pick.UnitId.HasValue ? RefOf(pick.UnitId.Value) : (UnitRef?)null;
            Selection = Selection.WithHover(pick.Tile, unit);
            if (PendingTarget.HasValue) return;
            if (Selection.CanCommand && pick.Tile.HasValue && !pick.UnitId.HasValue) Plan(pick.Tile.Value);
            else ClearPreview();
            Changed?.Invoke();
        }

        public void Click(PickResult pick, bool additive)
        {
            if (!pick.Tile.HasValue)
            {
                Deselect();
                return;
            }

            if (pick.UnitId.HasValue)
            {
                UnitRef clicked = RefOf(pick.UnitId.Value);
                Selection = UnitStack.Click(Selection, StackOf(pick.UnitId.Value), clicked, additive);
                ClearPreview();
                PendingTarget = null;
                Message = null;
                Changed?.Invoke();
                return;
            }

            if (!Selection.CanCommand)
            {
                Selection = Selection.Click(null, additive);
                Changed?.Invoke();
                return;
            }

            GridPos tile = pick.Tile.Value;
            if (PendingTarget.HasValue && PendingTarget.Value == tile)
            {
                Confirm(tile);
                return;
            }

            Plan(tile);
            PendingTarget = Preview.Found ? tile : (GridPos?)null;
            Message = Preview.Found ? text.Get("ui.hint_confirm") : text.ErrorText(Conquest.Core.Turn.Err.Unreachable);
            Changed?.Invoke();
        }

        /// <summary>
        /// Selects the whole stack on a tile (its count badge was clicked, or its banner double-clicked): every friendly
        /// unit there; an opposing stack is only inspected through its lead.
        /// </summary>
        public void ClickStack(GridPos tile)
        {
            IReadOnlyList<StackMember> members = StackAt(tile);
            if (members.Count == 0) return;
            Selection = UnitStack.SelectAll(Selection, members, UnitStack.LeadOf(members, Selection));
            ClearPreview();
            PendingTarget = null;
            Message = null;
            Changed?.Invoke();
        }

        /// <summary>The units standing on a tile, in the state's order (for stack rules).</summary>
        public IReadOnlyList<StackMember> StackAt(GridPos tile)
        {
            var members = new List<StackMember>();
            foreach (Conquest.Core.Turn.Unit u in session.State.UnitTable)
            {
                if (u.Pos.X != tile.X || u.Pos.Y != tile.Y) continue;
                members.Add(new StackMember(u.Id, u.Owner, BannerSizeClasses.Of(EventMapper.RoleName(RoleIds.Of(u.Role)))));
            }

            return members;
        }

        private IReadOnlyList<StackMember> StackOf(int unitId) =>
            session.State.TryGetUnit(unitId, out UnitView u) ? StackAt(new GridPos(u.Pos.X, u.Pos.Y)) : Array.Empty<StackMember>();

        /// <summary>Right click: order the move at once, no second step.</summary>
        public void SecondaryClick(PickResult pick)
        {
            if (!pick.Tile.HasValue || !Selection.CanCommand) return;
            Confirm(pick.Tile.Value);
        }

        public void Cancel()
        {
            if (PendingTarget.HasValue)
            {
                PendingTarget = null;
                ClearPreview();
                Message = null;
                Changed?.Invoke();
                return;
            }

            Deselect();
        }

        public void Deselect()
        {
            Selection = Selection.Cleared();
            PendingTarget = null;
            ClearPreview();
            Message = null;
            Changed?.Invoke();
        }

        /// <summary>Drops units that no longer exist and an order target that is no longer valid. Call after the state changed.</summary>
        public void Prune()
        {
            Selection = Selection.Prune(id => session.State.FindUnitIndex(id) >= 0);
            if (!Selection.CanCommand)
            {
                PendingTarget = null;
                ClearPreview();
            }
            else if (PendingTarget.HasValue)
            {
                Plan(PendingTarget.Value);
                if (!Preview.Found) PendingTarget = null;
            }

            Changed?.Invoke();
        }

        public CommandOutcome EndTurn()
        {
            PendingTarget = null;
            ClearPreview();
            CommandOutcome outcome = session.Submit(new PresentationCommand(CommandKind.EndTurn, Array.Empty<int>(), new GridPos(0, 0)));
            Report(outcome);
            return outcome;
        }

        public CommandOutcome? FoundBase()
        {
            if (Selection.Mode != SelectionMode.Single) return null;
            CommandOutcome outcome = session.FoundBase(Selection.PrimaryId);
            Report(outcome);
            return outcome;
        }

        /// <summary>Selects the next of the local player's units after the current one (wraps).</summary>
        public int SelectNext()
        {
            var mine = new List<int>();
            foreach (Conquest.Core.Turn.Unit u in session.State.UnitTable)
            {
                if (u.Owner == session.LocalSlot) mine.Add(u.Id);
            }

            if (mine.Count == 0) return SelectionModel.NoUnit;
            int index = mine.IndexOf(Selection.PrimaryId);
            int next = mine[(index + 1) % mine.Count];
            Selection = Selection.Click(RefOf(next), false);
            PendingTarget = null;
            ClearPreview();
            Changed?.Invoke();
            return next;
        }

        private void Confirm(GridPos tile)
        {
            var ids = new List<int>(Selection.SelectedIds);
            CommandOutcome outcome = session.Submit(new PresentationCommand(CommandKind.Move, ids, tile));
            OrdersSent++;
            PendingTarget = null;
            ClearPreview();
            Report(outcome);
            Changed?.Invoke();
        }

        private void Report(CommandOutcome outcome)
        {
            LastErrorCode = outcome.Accepted ? null : outcome.ErrorCode;
            Message = outcome.Accepted ? null : text.ErrorText(outcome.ErrorCode);
        }

        private void Plan(GridPos tile)
        {
            Conquest.Presentation.MovePlan? plan = session.PlanMove(Selection.PrimaryId, tile);
            if (plan == null || plan.Steps.Count == 0)
            {
                Preview = PathPreview.None;
                BlockedTarget = tile;
                return;
            }

            Preview = PathPreview.Build(plan.Origin, plan.Steps, plan.MovePointsLeft, plan.MovePointsPerTurn);
            BlockedTarget = null;
        }

        private void ClearPreview()
        {
            Preview = PathPreview.None;
            BlockedTarget = null;
        }

        private UnitRef RefOf(int unitId)
        {
            return session.State.TryGetUnit(unitId, out UnitView u) ? new UnitRef(unitId, u.Owner) : new UnitRef(unitId, -1);
        }
    }
}
