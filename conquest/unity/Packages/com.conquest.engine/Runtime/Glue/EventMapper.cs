using System.Collections.Generic;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Map;
using Conquest.Core.Turn;
using Conquest.Presentation;

namespace Conquest.Glue
{
    /// <summary>
    /// SWAP SPOT 3. Core events to the presentation's vocabulary. Three things are derived because the core now emits UnitSpawned and
    /// BuildingCompleted, so the diff of the unit tables is only a safety net for a unit appearing, a unit leaving without a
    /// <see cref="UnitDestroyed"/> (for example a founder that founded a base), and the path of a move (the core's
    /// <see cref="UnitMoved"/> carries only From and To, so the path is recomputed with the core's pathfinder on the
    /// state before the command). Slots are written "f1", "f2" as the asset manifest expects.
    /// </summary>
    public static class EventMapper
    {
        public static string SlotId(int slot) => "f" + (slot + 1);

        public static IReadOnlyList<PresentationEvent> Map(AppliedStep step, TurnServices services, int viewerSlot = -1)
        {
            var result = new List<PresentationEvent>();
            if (!step.Ok) return result;
            var covered = new HashSet<int>();
            for (int i = 0; i < step.Events.Count; i++)
            {
                if (viewerSlot >= 0 && !step.Events[i].VisibleTo(viewerSlot)) continue;
                MapOne(step, step.Events[i], services, covered, result);
            }

            DeriveSpawnsAndExits(step, covered, result);
            return result;
        }

        private static void MapOne(AppliedStep step, GameEvent e, TurnServices services, HashSet<int> covered, List<PresentationEvent> output)
        {
            switch (e)
            {
                case UnitMoved m:
                    output.Add(Moved(step.Before, m, services));
                    break;
                case UnitDestroyed d:
                    covered.Add(d.Unit);
                    output.Add(Destroyed(step.Before, d.Unit));
                    break;
                case UnitSpawned sp:
                    covered.Add(sp.Unit);
                    output.Add(new PresentationEvent(PresentationEventKind.UnitSpawned, sp.Unit, RoleName(RoleIds.Of(sp.Role)), SlotId(sp.Owner), Grid(sp.Pos)));
                    break;
                case BuildingCompleted bc:
                    output.Add(new PresentationEvent(PresentationEventKind.BuildingCompleted, SelectionModel.NoUnit, RoleName(RoleIds.Of(bc.Role)), SlotId(bc.Slot), BasePos(step.After, bc.Base)));
                    break;
                case BaseFounded f:
                    output.Add(new PresentationEvent(PresentationEventKind.BuildingCompleted, SelectionModel.NoUnit, "core", SlotId(f.Owner), Grid(f.Pos)));
                    break;
                case BuildingOrdered b:
                    output.Add(new PresentationEvent(PresentationEventKind.BuildingStarted, SelectionModel.NoUnit, RoleName(RoleIds.Of(b.Role)), SlotId(b.Slot), BasePos(step.After, b.Base)));
                    break;
                case SeasonStarted s:
                    output.Add(new PresentationEvent(PresentationEventKind.SeasonChanged, SelectionModel.NoUnit, null, null, new GridPos(0, 0), null, s.Season));
                    break;
                case TurnEnded t: // the core writes the NEW turn index into TurnEnded (TurnResolver: new TurnEnded(next))
                    output.Add(new PresentationEvent(PresentationEventKind.TurnStarted, SelectionModel.NoUnit, null, null, new GridPos(0, 0), null, null, t.Turn));
                    break;
            }
        }

        private static PresentationEvent Moved(GameState before, UnitMoved m, TurnServices services)
        {
            var path = new List<GridPos> { Grid(m.From) };
            if (before.TryGetUnit(m.Unit, out UnitView unit))
            {
                PathResult found = GameSession.FindPath(before, unit, m.To, services);
                if (found.Found)
                {
                    foreach (TileCoord t in found.Steps) path.Add(Grid(t));
                }
            }

            if (path.Count < 2) path.Add(Grid(m.To));
            string? role = before.TryGetUnit(m.Unit, out UnitView u) ? RoleName(RoleIds.Of(u.Role)) : null;
            return new PresentationEvent(PresentationEventKind.UnitMoved, m.Unit, role, SlotId(m.Slot), Grid(m.To), path);
        }

        private static PresentationEvent Destroyed(GameState before, int unitId)
        {
            if (before.TryGetUnit(unitId, out UnitView u))
            {
                return new PresentationEvent(PresentationEventKind.UnitDestroyed, unitId, RoleName(RoleIds.Of(u.Role)), SlotId(u.Owner), Grid(u.Pos));
            }

            return new PresentationEvent(PresentationEventKind.UnitDestroyed, unitId, null, null, new GridPos(0, 0));
        }

        private static void DeriveSpawnsAndExits(AppliedStep step, HashSet<int> covered, List<PresentationEvent> output)
        {
            foreach (Unit u in step.After.UnitTable)
            {
                if (step.Before.FindUnitIndex(u.Id) < 0 && !covered.Contains(u.Id))
                {
                    output.Add(new PresentationEvent(PresentationEventKind.UnitSpawned, u.Id, RoleName(RoleIds.Of(u.Role)), SlotId(u.Owner), Grid(u.Pos)));
                }
            }

            foreach (Unit u in step.Before.UnitTable)
            {
                if (step.After.FindUnitIndex(u.Id) < 0 && !covered.Contains(u.Id))
                {
                    output.Add(Destroyed(step.Before, u.Id));
                }
            }
        }

        private static GridPos BasePos(GameState state, int baseId) =>
            state.TryGetBase(baseId, out BaseView b) ? Grid(b.Pos) : new GridPos(0, 0);

        /// <summary>"u.scout" becomes "scout"; the manifest key is kind + "." + role.</summary>
        public static string RoleName(string roleId)
        {
            int dot = roleId.IndexOf('.');
            return dot < 0 ? roleId : roleId.Substring(dot + 1);
        }

        public static GridPos Grid(TileCoord c) => new GridPos(c.X, c.Y);
    }
}
