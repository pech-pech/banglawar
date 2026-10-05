using System.Collections.Generic;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Presentation
{
    /// <summary>
    /// What one side can see right now, as a bitmap of tiles built once from a state with <see cref="SightRules"/>. Own units and
    /// bases are always visible; an opposing unit, base or building only on a seen tile. <see cref="Mask"/> returns the state
    /// as that side knows it (opposing things outside sight and the opponent's queued attacks removed), which is what every
    /// preview, pick and hint must read so nothing hidden leaks into the screen. Immutable.
    /// </summary>
    public sealed class FogView
    {
        private readonly bool[] seen;

        private FogView(int viewer, int width, int height, bool[] seen)
        {
            Viewer = viewer;
            Width = width;
            Height = height;
            this.seen = seen;
        }

        public int Viewer { get; }

        public int Width { get; }

        public int Height { get; }

        public static FogView Of(GameState state, int viewer)
        {
            var units = new List<Unit>();
            for (int i = 0; i < state.UnitTable.Count; i++)
            {
                if (state.UnitTable[i].Owner == viewer) units.Add(state.UnitTable[i]);
            }

            var bases = new List<Base>();
            for (int i = 0; i < state.BaseTable.Count; i++)
            {
                if (state.BaseTable[i].Owner == viewer) bases.Add(state.BaseTable[i]);
            }

            int width = state.Width, height = state.Height;
            var bits = new bool[width * height];
            for (int i = 0; i < units.Count; i++) Mark(bits, width, height, units[i].Pos, SightRules.RadiusOf(units[i].Role));
            for (int i = 0; i < bases.Count; i++) Mark(bits, width, height, bases[i].Pos, SightRules.VisionRadius);
            return new FogView(viewer, width, height, bits);
        }

        private static void Mark(bool[] bits, int width, int height, TileCoord centre, int radius)
        {
            int x0 = System.Math.Max(0, centre.X - radius), x1 = System.Math.Min(width - 1, centre.X + radius);
            int y0 = System.Math.Max(0, centre.Y - radius), y1 = System.Math.Min(height - 1, centre.Y + radius);
            for (int y = y0; y <= y1; y++)
            {
                for (int x = x0; x <= x1; x++) bits[y * width + x] = true;
            }
        }

        public bool IsVisible(int x, int y) => x >= 0 && y >= 0 && x < Width && y < Height && seen[y * Width + x];

        public bool IsVisible(TileCoord tile) => IsVisible(tile.X, tile.Y);

        public bool CanSeeUnit(Unit unit) => unit.Owner == Viewer || IsVisible(unit.Pos);

        public bool CanSeeBase(Base b) => b.Owner == Viewer || IsVisible(b.Pos);

        /// <summary>The state as the viewer knows it: nothing of the other sides outside sight, and none of their queued attacks.</summary>
        public GameState Mask(GameState state)
        {
            var units = new List<Unit>();
            for (int i = 0; i < state.UnitTable.Count; i++)
            {
                if (CanSeeUnit(state.UnitTable[i])) units.Add(state.UnitTable[i]);
            }

            var bases = new List<Base>();
            for (int i = 0; i < state.BaseTable.Count; i++)
            {
                Base b = state.BaseTable[i];
                if (b.Owner == Viewer)
                {
                    bases.Add(b);
                    continue;
                }

                Base? shown = Shown(b);
                if (shown != null) bases.Add(shown);
            }

            var attacks = new List<AttackOrder>();
            for (int i = 0; i < state.Attacks.Count; i++)
            {
                if (state.Attacks[i].Slot == Viewer) attacks.Add(state.Attacks[i]);
            }

            return state with { UnitTable = ImmArray<Unit>.From(units), BaseTable = ImmArray<Base>.From(bases), Attacks = ImmArray<AttackOrder>.From(attacks) };
        }

        /// <summary>An opposing base as far as the viewer sees it (its core tile and the buildings on seen tiles), or null when nothing of it is seen.</summary>
        private Base? Shown(Base b)
        {
            var buildings = new List<Building>();
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                if (IsVisible(b.Buildings[i].Pos)) buildings.Add(b.Buildings[i]);
            }

            if (!IsVisible(b.Pos) && buildings.Count == 0) return null;
            return b with { Buildings = ImmArray<Building>.From(buildings) };
        }

        /// <summary>The opposing buildings of a base that the viewer sees now (all of an own base's).</summary>
        public IReadOnlyList<Building> VisibleBuildings(Base b)
        {
            var list = new List<Building>();
            for (int i = 0; i < b.Buildings.Count; i++)
            {
                if (b.Owner == Viewer || IsVisible(b.Buildings[i].Pos)) list.Add(b.Buildings[i]);
            }

            return list;
        }
    }
}
