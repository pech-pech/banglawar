using System;
using System.Collections.Generic;

namespace MixerMad.Game
{
    /// <summary>Where in the run a still (or an on/off pair) is taken.</summary>
    public enum StillSpot { Start, Mid, Jump, Ice, Finish, Crash, CalmJump, CalmFinish, Night, Drive, Landing }

    /// <summary>
    /// The full review still set (`-mmStillsSet full`, L-MM-33/34): the file names, the times of day, and which spot
    /// shows each feature best. Pure data so a test can check the set covers what the phase promises.
    /// </summary>
    public static class StillsSet
    {
        public const string FullArg = "full";

        // Times of day for DayNight.time01 (see its key table): dawn glow, crisp day, pink dusk, deep night.
        public const float Dawn = 0.02f, Day = 0.30f, Dusk = 0.62f, Night = 0.82f;

        public const string Start = "01_start";
        public const string MidDrive = "02_mid_drive";
        public const string Jump = "03_jump";
        public const string Crash = "04_crash";
        public const string DawnStill = "05_dawn";
        public const string DuskStill = "06_dusk";
        public const string NightStill = "07_night";
        public const string Blizzard = "08_blizzard";
        public const string FrozenLake = "09_frozen_lake";
        public const string Finish = "10_finish";
        public const string CalmJump = "11_calm_jump";
        public const string CalmFinish = "12_calm_finish";

        /// <summary>Two stills of the same paused frame with nothing changed: the noise floor for the on/off diffs.</summary>
        public const string BaselineA = "fx__baseline_a", BaselineB = "fx__baseline_b";
        /// <summary>The same with particles running: the noise floor for flags that change particle counts.</summary>
        public const string BaselineLiveA = "fx__baseline_live_a", BaselineLiveB = "fx__baseline_live_b";

        /// <summary>Every scenario still the full set must produce (the on/off pairs come on top, one per flag).</summary>
        public static readonly IReadOnlyList<string> Scenarios = new[]
        {
            Start, MidDrive, Jump, Crash, DawnStill, DuskStill, NightStill, Blizzard, FrozenLake, Finish, CalmJump, CalmFinish,
        };

        /// <summary>File stem for one half of a feature pair, e.g. fx_shadows_off.</summary>
        public static string PairName(string flag, bool on) => "fx_" + flag.ToLowerInvariant() + (on ? "_on" : "_off");

        /// <summary>
        /// The spot where a flag's effect is in view: planar reflection on the ice, depth of field and the gold sparkle at the finish,
        /// headlights and the beacon glow at night (the lamps only light after dark), the landing puff just after a landing,
        /// the wheel spray while driving on snow, everything else mid-drive (where shadows, post, outline and weather all show).
        /// </summary>
        public static StillSpot SpotFor(string flag)
        {
            string f = flag.ToLowerInvariant();
            if (f.Contains("planar") || f.Contains("reflect") || f.StartsWith("ice")) return StillSpot.Ice;
            if (f.Contains("dof") || f.Contains("finish") || f.Contains("sparkle")) return StillSpot.Finish;
            if (f.Contains("headlight") || f.Contains("beacon")) return StillSpot.Night;
            if (f.Contains("landing") || f.Contains("puff")) return StillSpot.Landing;
            if (f.Contains("spray")) return StillSpot.Drive;
            return StillSpot.Mid;
        }

        /// <summary>
        /// The TruckFx particle system an emitter flag feeds, or null. In a paused frame the particles already emitted stay
        /// put, so the off half of such a pair clears them: the same frame as if the flag had been off (TruckFx itself
        /// clears the spray, exhaust and sparkle the moment their flag goes off and the game runs).
        /// </summary>
        public static string EmitterFor(string flag)
        {
            switch (flag)
            {
                case "Spray": return "FX_WheelSpray";
                case "LandingPuff": return "FX_LandingPuff";
                case "Exhaust": return "FX_Exhaust";
                case "Sparkle": return "FX_GoldSparkle";
                default: return null;
            }
        }

        /// <summary>All expected file stems for a given flag list (scenarios, baseline, then each pair).</summary>
        public static List<string> ExpectedFiles(IEnumerable<string> flags)
        {
            var list = new List<string>(Scenarios) { BaselineA, BaselineB, BaselineLiveA, BaselineLiveB };
            foreach (var f in flags) { list.Add(PairName(f, true)); list.Add(PairName(f, false)); }
            return list;
        }

        /// <summary>Reads `-mmStillsSet` from a command line; null when absent.</summary>
        public static string ModeFrom(string[] args)
        {
            if (args == null) return null;
            for (int i = 0; i < args.Length - 1; i++)
                if (args[i] == "-mmStillsSet") return args[i + 1].Trim().ToLowerInvariant();
            return null;
        }

        public static bool IsFull(string[] args) => string.Equals(ModeFrom(args), FullArg, StringComparison.Ordinal);
    }
}
