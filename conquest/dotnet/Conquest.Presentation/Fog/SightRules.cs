using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Presentation
{
    /// <summary>
    /// The one rule for what a side can see: a tile is in sight when an own unit or own base is within its radius (8-way,
    /// Chebyshev). The opponent's knowledge view (Conquest.Ai <c>Knowledge</c>) and the map view's fog both use it, so the
    /// player and the AI play under the same fog. Tiles themselves are never hidden by this rule; it decides who may see units and bases.
    /// </summary>
    public static class SightRules
    {
        /// <summary>Tiles (8-way) an own unit or base can see.</summary>
        public const int VisionRadius = 4;

        /// <summary>Scouts see further than other units.</summary>
        public const int ScoutVisionRadius = 6;

        public static int RadiusOf(UnitRole role) => role == UnitRole.Scout ? ScoutVisionRadius : VisionRadius;

        public static bool InSight(IReadOnlyList<Unit> ownUnits, IReadOnlyList<Base> ownBases, TileCoord tile)
        {
            for (int i = 0; i < ownUnits.Count; i++)
            {
                if (ownUnits[i].Pos.DistanceTo(tile) <= RadiusOf(ownUnits[i].Role))
                {
                    return true;
                }
            }

            for (int i = 0; i < ownBases.Count; i++)
            {
                if (ownBases[i].Pos.DistanceTo(tile) <= VisionRadius)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
