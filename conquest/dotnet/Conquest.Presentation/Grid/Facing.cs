using System;

namespace Conquest.Presentation
{
    /// <summary>The eight screen directions of a unit. Clockwise from north (screen up).</summary>
    public enum Facing
    {
        N = 0,
        NE = 1,
        E = 2,
        SE = 3,
        S = 4,
        SW = 5,
        W = 6,
        NW = 7,
    }

    public static class FacingMath
    {
        /// <summary>
        /// Facing for a grid step. Grid +x runs screen south-east, grid +y screen south-west, so (1,0) is SE,
        /// (0,1) is SW, (1,1) is S and (1,-1) is E. Only the signs of dx and dy matter. (0,0) keeps the fallback.
        /// </summary>
        public static Facing FromDelta(int dx, int dy, Facing fallback)
        {
            int sx = Math.Sign(dx);
            int sy = Math.Sign(dy);
            if (sx == 0 && sy == 0)
            {
                return fallback;
            }

            if (sx == 1) return sy == 1 ? Facing.S : sy == 0 ? Facing.SE : Facing.E;
            if (sx == 0) return sy == 1 ? Facing.SW : Facing.NE;
            return sy == 1 ? Facing.W : sy == 0 ? Facing.NW : Facing.N;
        }

        /// <summary>
        /// The facing art is drawn for: the five rendered directions (N, NE, E, SE, S) plus a mirror flag for
        /// SW, W and NW (pipeline spec 14, section 3: mirror_from SW:SE, W:E, NW:NE).
        /// </summary>
        public static Facing RenderDirection(Facing facing, out bool mirrored)
        {
            switch (facing)
            {
                case Facing.SW: mirrored = true; return Facing.SE;
                case Facing.W: mirrored = true; return Facing.E;
                case Facing.NW: mirrored = true; return Facing.NE;
                default: mirrored = false; return facing;
            }
        }

        /// <summary>Collapses to the four grid-axis directions (NE, SE, SW, NW) for four-direction art.</summary>
        public static Facing ToFourWay(Facing facing)
        {
            switch (facing)
            {
                case Facing.N: return Facing.NE;
                case Facing.E: return Facing.SE;
                case Facing.S: return Facing.SW;
                case Facing.W: return Facing.NW;
                default: return facing;
            }
        }
    }
}
