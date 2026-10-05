namespace Conquest.Ai
{
    /// <summary>Every number the opponent uses, in one place. All integers; percent values are marked.</summary>
    public static class AiTuning
    {
        /// <summary>Tiles (8-way) an own unit or base can see enemy units and bases.</summary>
        public const int VisionRadius = Conquest.Presentation.SightRules.VisionRadius;

        /// <summary>Scouts see further than other units.</summary>
        public const int ScoutVisionRadius = Conquest.Presentation.SightRules.ScoutVisionRadius;

        /// <summary>An attack is queued only when attacking power is at least this percent of the defending power.</summary>
        public const int FavourablePct = 150;

        /// <summary>Each level of the Colony Center adds this percent to the defending power of its tile.</summary>
        public const int BaseDefencePctPerLevel = 25;

        /// <summary>Units of a remembered base whose garrison is not in view are assumed to number this many.</summary>
        public const int AssumedGarrisonUnits = 3;

        /// <summary>Military units each base keeps at home when it sends a strike force out.</summary>
        public const int HomeGuard = 2;

        /// <summary>The strike force sets out only with at least this many mobile military units.</summary>
        public const int StrikeMinUnits = 3;

        /// <summary>An enemy unit this close to an own base (8-way) is a threat.</summary>
        public const int DefendRadius = 3;

        /// <summary>The AI founds at most this many bases.</summary>
        public const int MaxBases = 3;

        public const int RecruitsPerBasePerTurn = 2;

        /// <summary>Wanted military units per base: this plus <see cref="MilitaryPerCoreLevel"/> times the Colony Center level.</summary>
        public const int MilitaryBase = 2;

        public const int MilitaryPerCoreLevel = 2;

        /// <summary>Founders look for a site within this many tiles.</summary>
        public const int FoundSearchRadius = 8;

        /// <summary>Only this many nearest sites are costed with the path finder.</summary>
        public const int FoundCandidateLimit = 12;

        /// <summary>A scout's wander goal changes every this many turns.</summary>
        public const int ScoutGoalTurns = 5;

        public const int ScoutGoalAttempts = 4;

        /// <summary>The most step targets tried for one move order (farthest first).</summary>
        public const int MaxStepTries = 24;
    }
}
