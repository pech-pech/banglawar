using System;
using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;

namespace Conquest.UnityView
{
    /// <summary>
    /// Attack and build orders of the map. An attack is previewed from the core's own checks and battle code
    /// (<see cref="AttackPreview"/>), confirmed with the tap-twice rule (a right click orders at once) and sent through
    /// <see cref="GameSession.Submit"/>. A build is chosen from a panel of the rules' building roles, placed on a tile
    /// the core accepts and sent through <see cref="GameSession.Build"/>. Nothing here decides a rule.
    /// </summary>
    public sealed partial class MapInteraction
    {
        /// <summary>The tile an attack is waiting to be confirmed on (second tap, right click or the Attack button).</summary>
        public GridPos? PendingAttackTile { get; private set; }

        public AttackPreview? AttackPreviewValue { get; private set; }

        public int AttacksOrdered { get; private set; }

        /// <summary>The own base selected by clicking it, or -1.</summary>
        public int SelectedBaseId { get; private set; } = -1;

        public bool BuildOpen { get; private set; }

        /// <summary>The role being placed, or null while choosing.</summary>
        public BuildingRole? BuildRole { get; private set; }

        public GridPos? BuildSite { get; private set; }

        public bool Placing => BuildRole.HasValue;

        /// <summary>The base the build panel works on: the clicked base, or the base a single selected unit stands on.</summary>
        public int CurrentBaseId
        {
            get
            {
                if (SelectedBaseId >= 0 && session.State.FindBaseIndex(SelectedBaseId) >= 0) return SelectedBaseId;
                if (Selection.Mode != SelectionMode.Single || !Selection.CanCommand) return -1;
                if (!session.State.TryGetUnit(Selection.PrimaryId, out UnitView u)) return -1;
                return OwnBaseAt(new GridPos(u.Pos.X, u.Pos.Y)) ?? -1;
            }
        }

        /// <summary>The id of the local player's base on a tile, or null.</summary>
        public int? OwnBaseAt(GridPos tile)
        {
            if (!session.State.TryGetBaseAt(new TileCoord(tile.X, tile.Y), out BaseView b)) return null;
            return b.Owner == session.LocalSlot ? b.Id : (int?)null;
        }

        // ----- attack -----

        /// <summary>
        /// A click on a tile with an opposing unit or base while own units are selected. Returns true when it was an
        /// attack click (preview shown, confirmed, or refused with a message); false lets the ordinary rules go on
        /// (inspect the unit, plan a move) because no selected unit can attack that tile.
        /// </summary>
        private bool AttackClick(GridPos tile, bool touch)
        {
            if (!AttackPreview.HasOpposingTarget(Known, session.LocalSlot, tile)) return false;
            AttackPreview preview = AttackPreview.Build(Known, session.Services, session.LocalSlot, Selection.SelectedIds, tile);
            if (!preview.Valid)
            {
                bool fallBack = preview.ErrorCode == Err.OutOfReach || preview.ErrorCode == Err.WrongRole || preview.ErrorCode == Err.NoUnits;
                if (fallBack) return false;
                ClearAttack();
                Report(new CommandOutcome(false, preview.ErrorCode));
                Changed?.Invoke();
                return true;
            }

            if (PendingAttackTile.HasValue && PendingAttackTile.Value == tile)
            {
                ConfirmAttack();
                return true;
            }

            PendingTarget = null;
            ClearPreview();
            PendingAttackTile = tile;
            AttackPreviewValue = preview;
            Message = text.Get(touch ? "ui.hint_confirm" : "ui.hint_confirm_click");
            Changed?.Invoke();
            return true;
        }

        /// <summary>Orders the attack on a tile at once (right click, or the card's button). False when the core would refuse it.</summary>
        public bool OrderAttack(GridPos tile)
        {
            AttackPreview preview = AttackPreview.Build(Known, session.Services, session.LocalSlot, Selection.SelectedIds, tile);
            if (!preview.Valid) return false;
            PendingAttackTile = tile;
            AttackPreviewValue = preview;
            ConfirmAttack();
            return true;
        }

        /// <summary>Sends the pending attack through the session.</summary>
        public CommandOutcome? ConfirmAttack()
        {
            if (!PendingAttackTile.HasValue || AttackPreviewValue == null) return null;
            GridPos tile = PendingAttackTile.Value;
            IReadOnlyList<int> ids = AttackPreviewValue.AttackerIds;
            CommandOutcome outcome = session.Submit(new PresentationCommand(CommandKind.Attack, ids, tile));
            OrdersSent++;
            if (outcome.Accepted) AttacksOrdered++;
            ClearAttack();
            LastErrorCode = outcome.Accepted ? null : outcome.ErrorCode;
            Message = outcome.Accepted ? text.Get("ui.attack_ordered") : text.ErrorText(outcome.ErrorCode);
            Changed?.Invoke();
            return outcome;
        }

        private void ClearAttack()
        {
            PendingAttackTile = null;
            AttackPreviewValue = null;
        }

        // ----- base and build -----

        public void SelectBase(int baseId)
        {
            Selection = Selection.Cleared();
            PendingTarget = null;
            ClearPreview();
            ClearOrderState();
            SelectedBaseId = baseId;
            Message = null;
            Changed?.Invoke();
        }

        /// <summary>Opens the build panel for the current base; says so when there is none.</summary>
        public bool OpenBuild()
        {
            if (CurrentBaseId < 0)
            {
                Message = text.Get("ui.select_base");
                Changed?.Invoke();
                return false;
            }

            ClearAttack();
            BuildOpen = true;
            BuildRole = null;
            BuildSite = null;
            Message = null;
            Changed?.Invoke();
            return true;
        }

        public void CloseBuild()
        {
            BuildOpen = false;
            BuildRole = null;
            BuildSite = null;
            Message = null;
            Changed?.Invoke();
        }

        /// <summary>Picks a role in the panel. A disabled role only says why; an enabled one starts placing on the nearest legal tile.</summary>
        public bool ChooseRole(BuildingRole role)
        {
            int baseId = CurrentBaseId;
            if (baseId < 0 || !BuildOpen) return false;
            foreach (BuildEntry entry in BuildMenu.Entries(session.State, session.Services, baseId, session.LocalSlot))
            {
                if (entry.Role != role) continue;
                if (!entry.Enabled)
                {
                    LastErrorCode = entry.DisabledReason;
                    Message = text.ErrorText(entry.DisabledReason);
                    Changed?.Invoke();
                    return false;
                }

                BuildRole = role;
                BuildSite = BuildMenu.NearestSite(session.State, session.Services, baseId, session.LocalSlot, role);
                Message = null;
                Changed?.Invoke();
                return true;
            }

            return false;
        }

        /// <summary>Leaves placement and returns to the role list.</summary>
        public void StopPlacing()
        {
            BuildRole = null;
            BuildSite = null;
            Message = null;
            Changed?.Invoke();
        }

        private void ClickSite(PickResult pick, bool touch)
        {
            if (!pick.Tile.HasValue) return;
            GridPos tile = pick.Tile.Value;
            if (BuildSite.HasValue && BuildSite.Value == tile)
            {
                ConfirmBuild();
                return;
            }

            SetSite(tile);
        }

        /// <summary>Moves the proposed site to a tile when the core accepts it there; otherwise says why and keeps the old one.</summary>
        public bool SetSite(GridPos tile)
        {
            int baseId = CurrentBaseId;
            if (baseId < 0 || !BuildRole.HasValue) return false;
            string? error = BuildMenu.Check(session.State, session.Services, baseId, session.LocalSlot, BuildRole.Value, tile);
            if (error != null)
            {
                LastErrorCode = error;
                Message = text.ErrorText(error);
                Changed?.Invoke();
                return false;
            }

            BuildSite = tile;
            Message = null;
            Changed?.Invoke();
            return true;
        }

        /// <summary>Sends the build order for the proposed site.</summary>
        public CommandOutcome? ConfirmBuild()
        {
            int baseId = CurrentBaseId;
            if (baseId < 0 || !BuildRole.HasValue || !BuildSite.HasValue) return null;
            BuildingRole role = BuildRole.Value;
            CommandOutcome outcome = session.Submit(new PresentationCommand(CommandKind.Build, new[] { baseId }, BuildSite.Value, RoleIds.Of(role)));
            OrdersSent++;
            LastErrorCode = outcome.Accepted ? null : outcome.ErrorCode;
            if (outcome.Accepted)
            {
                string slotId = EventMapper.SlotId(session.LocalSlot);
                Message = text.Format("ui.build_ordered", text.Label(RoleIds.Of(role), slotId));
                BuildRole = null;
                BuildSite = null;
            }
            else
            {
                Message = text.ErrorText(outcome.ErrorCode);
            }

            Changed?.Invoke();
            return outcome;
        }

        // ----- shared -----

        /// <summary>Drops the pending attack, the clicked base and the build panel (called when the selection changes).</summary>
        private void ClearOrderState()
        {
            ClearAttack();
            SelectedBaseId = -1;
            BuildOpen = false;
            BuildRole = null;
            BuildSite = null;
        }

        /// <summary>After the state changed: re-check the pending attack, the base and the placement against it.</summary>
        private void PruneOrders()
        {
            if (PendingAttackTile.HasValue)
            {
                AttackPreview preview = AttackPreview.Build(Known, session.Services, session.LocalSlot, Selection.SelectedIds, PendingAttackTile.Value);
                if (preview.Valid) AttackPreviewValue = preview;
                else ClearAttack();
            }

            if (SelectedBaseId >= 0 && session.State.FindBaseIndex(SelectedBaseId) < 0) SelectedBaseId = -1;
            if (BuildOpen && CurrentBaseId < 0)
            {
                BuildOpen = false;
                BuildRole = null;
                BuildSite = null;
            }

            if (BuildRole.HasValue && BuildSite.HasValue && BuildMenu.Check(session.State, session.Services, CurrentBaseId, session.LocalSlot, BuildRole.Value, BuildSite.Value) != null)
            {
                BuildSite = BuildMenu.NearestSite(session.State, session.Services, CurrentBaseId, session.LocalSlot, BuildRole.Value);
                if (!BuildSite.HasValue) BuildRole = null;
            }
        }
    }
}
