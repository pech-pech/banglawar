using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// The real scenario with one of the player's line units moved next to an opposing stack, so an attack order is
    /// possible without playing many turns. The state is built through the core's own immutable <c>WithUnit</c>.
    /// </summary>
    public sealed class FightFixture
    {
        public readonly ContentBundle Content = TestContent.Load();
        public readonly GameSession Session;
        public readonly MapInteraction Interaction;
        public readonly UnitView Own;
        public readonly UnitView Opposing;
        public readonly GridPos Target;

        public FightFixture()
        {
            GameState state = Content.Boot.State;
            Opposing = state.AsView().Units.First(u => u.Owner != Content.Boot.LocalSlot && u.Role == UnitRole.Line);
            Target = new GridPos(Opposing.Pos.X, Opposing.Pos.Y);
            GridPos spot = FreeNeighbour(state, Opposing.Pos);
            UnitView line = state.AsView().Units.First(u => u.Owner == Content.Boot.LocalSlot && u.Role == UnitRole.Line);
            Unit moved = state.UnitTable[state.FindUnitIndex(line.Id)] with { Pos = new TileCoord(spot.X, spot.Y), Leader = 0, AttachedBase = 0 };
            Session = new GameSession(state.WithUnit(moved), Content.Boot.LocalSlot, Content.Boot.Services);
            Interaction = new MapInteraction(Session, Content.Text);
            Own = Session.State.AsView().Units.First(u => u.Id == line.Id);
        }

        public PickResult OnOpposing => new PickResult(Target, Opposing.Id);

        public PickResult OnOwn => new PickResult(new GridPos(Own.Pos.X, Own.Pos.Y), Own.Id);

        public Localizer Text => Content.Text;

        private static GridPos FreeNeighbour(GameState state, TileCoord around)
        {
            for (int dy = -1; dy <= 1; dy++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    if (dx == 0 && dy == 0) continue;
                    var t = new TileCoord(around.X + dx, around.Y + dy);
                    if (!state.InBounds(t) || state.TerrainAt(t) != Terrain.Open) continue;
                    if (state.UnitsAt(t).Count > 0 || state.FindBaseIndexAt(t) >= 0) continue;
                    return new GridPos(t.X, t.Y);
                }
            }

            throw new System.InvalidOperationException("no free neighbour tile next to " + around);
        }
    }
}
