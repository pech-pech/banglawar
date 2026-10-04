using System;
using System.Collections.Generic;
using System.Linq;

namespace Conquest.Presentation
{
    /// <summary>A unit as the presentation sees it: an id and the owning player slot.</summary>
    public readonly struct UnitRef
    {
        public int Id { get; }
        public int Owner { get; }

        public UnitRef(int id, int owner)
        {
            Id = id;
            Owner = owner;
        }
    }

    public enum SelectionMode
    {
        None = 0,
        Single = 1,
        Multi = 2,

        /// <summary>One opposing unit is selected for its card only; it cannot be commanded.</summary>
        Inspect = 3,
    }

    /// <summary>
    /// Immutable selection and hover state. Rules: a plain click selects one unit; Shift-click toggles a
    /// friendly unit in a multi-selection (at most MaxMultiSelect); an opposing unit can only be inspected,
    /// alone; a click on nothing clears. Ids are kept in ascending order so the model is deterministic.
    /// </summary>
    public sealed class SelectionModel
    {
        public const int MaxMultiSelect = 12;
        public const int NoUnit = -1;

        private static readonly IReadOnlyList<int> NoIds = Array.Empty<int>();

        public int LocalPlayer { get; }
        public IReadOnlyList<int> SelectedIds { get; }
        public int PrimaryId { get; }
        public SelectionMode Mode { get; }
        public GridPos? HoveredTile { get; }
        public int HoveredUnitId { get; }

        private SelectionModel(int localPlayer, IReadOnlyList<int> ids, int primary, SelectionMode mode, GridPos? hoverTile, int hoverUnit)
        {
            LocalPlayer = localPlayer;
            SelectedIds = ids;
            PrimaryId = primary;
            Mode = mode;
            HoveredTile = hoverTile;
            HoveredUnitId = hoverUnit;
        }

        public static SelectionModel Create(int localPlayer)
        {
            return new SelectionModel(localPlayer, NoIds, NoUnit, SelectionMode.None, null, NoUnit);
        }

        public bool IsSelected(int unitId) => SelectedIds.Contains(unitId);

        public bool CanCommand => Mode == SelectionMode.Single || Mode == SelectionMode.Multi;

        public SelectionModel WithHover(GridPos? tile, UnitRef? unit)
        {
            int unitId = unit.HasValue ? unit.Value.Id : NoUnit;
            if (Nullable.Equals(tile, HoveredTile) && unitId == HoveredUnitId)
            {
                return this;
            }

            return new SelectionModel(LocalPlayer, SelectedIds, PrimaryId, Mode, tile, unitId);
        }

        public SelectionModel Click(UnitRef? unit, bool additive)
        {
            if (!unit.HasValue)
            {
                return additive ? this : Cleared();
            }

            UnitRef clicked = unit.Value;
            if (clicked.Owner != LocalPlayer)
            {
                return additive && CanCommand ? this : Selected(new[] { clicked.Id }, clicked.Id, SelectionMode.Inspect);
            }

            if (!additive || !CanCommand)
            {
                return Selected(new[] { clicked.Id }, clicked.Id, SelectionMode.Single);
            }

            if (IsSelected(clicked.Id))
            {
                int[] remaining = SelectedIds.Where(id => id != clicked.Id).ToArray();
                if (remaining.Length == 0)
                {
                    return Cleared();
                }

                int primary = PrimaryId == clicked.Id ? remaining[0] : PrimaryId;
                return Selected(remaining, primary, remaining.Length == 1 ? SelectionMode.Single : SelectionMode.Multi);
            }

            if (SelectedIds.Count >= MaxMultiSelect)
            {
                return this;
            }

            int[] grown = SelectedIds.Concat(new[] { clicked.Id }).OrderBy(id => id).ToArray();
            return Selected(grown, clicked.Id, SelectionMode.Multi);
        }

        /// <summary>
        /// Selects several units at once (a stack): the friendly ones, ascending, at most <see cref="MaxMultiSelect"/>,
        /// with <paramref name="primaryId"/> as primary when it is among them. With no friendly unit it inspects the
        /// primary (or the first) opposing unit; with no unit at all it clears.
        /// </summary>
        public SelectionModel SelectGroup(IReadOnlyList<UnitRef> units, int primaryId)
        {
            if (units == null) throw new ArgumentNullException(nameof(units));
            int[] friendly = units.Where(u => u.Owner == LocalPlayer).Select(u => u.Id).Distinct().OrderBy(id => id).Take(MaxMultiSelect).ToArray();
            if (friendly.Length == 0)
            {
                if (units.Count == 0) return Cleared();
                int inspect = units.Any(u => u.Id == primaryId) ? primaryId : units[0].Id;
                return Selected(new[] { inspect }, inspect, SelectionMode.Inspect);
            }

            int primary = friendly.Contains(primaryId) ? primaryId : friendly[0];
            return Selected(friendly, primary, friendly.Length == 1 ? SelectionMode.Single : SelectionMode.Multi);
        }

        public SelectionModel Cleared()
        {
            return Mode == SelectionMode.None
                ? this
                : new SelectionModel(LocalPlayer, NoIds, NoUnit, SelectionMode.None, HoveredTile, HoveredUnitId);
        }

        /// <summary>Drops selected and hovered units that no longer exist (died, left view). Call after events.</summary>
        public SelectionModel Prune(Func<int, bool> exists)
        {
            if (exists == null) throw new ArgumentNullException(nameof(exists));

            int[] kept = SelectedIds.Where(exists).ToArray();
            int hover = HoveredUnitId != NoUnit && exists(HoveredUnitId) ? HoveredUnitId : NoUnit;
            if (kept.Length == SelectedIds.Count && hover == HoveredUnitId)
            {
                return this;
            }

            if (kept.Length == 0)
            {
                return new SelectionModel(LocalPlayer, NoIds, NoUnit, SelectionMode.None, HoveredTile, hover);
            }

            int primary = kept.Contains(PrimaryId) ? PrimaryId : kept[0];
            SelectionMode mode = Mode == SelectionMode.Inspect ? Mode : kept.Length == 1 ? SelectionMode.Single : SelectionMode.Multi;
            return new SelectionModel(LocalPlayer, kept, primary, mode, HoveredTile, hover);
        }

        private SelectionModel Selected(int[] ids, int primary, SelectionMode mode)
        {
            return new SelectionModel(LocalPlayer, ids, primary, mode, HoveredTile, HoveredUnitId);
        }
    }
}
