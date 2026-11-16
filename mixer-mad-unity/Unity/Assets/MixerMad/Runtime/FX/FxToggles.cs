using System;

namespace MixerMad.Game
{
    /// <summary>
    /// One switch per showcase effect, so the benchmark and the F1 overlay can measure what each one costs.
    /// Lives beside FeatureToggles (QualityPresets.cs) but in the FX folder, so the FX workstream owns it.
    /// `-mmFx all|none|spray,tracks,...` sets them from the command line (on/off still pairs).
    /// </summary>
    public static class FxToggles
    {
        public static bool Spray = true, LandingPuff = true, Exhaust = true, Tracks = true;
        public static bool Beacon = true, Headlights = true, Sparkle = true, LivingWorld = true;
        public static event Action Changed;
        public static void Notify() { Changed?.Invoke(); }

        public static void SetAll(bool on)
        {
            Spray = LandingPuff = Exhaust = Tracks = Beacon = Headlights = Sparkle = LivingWorld = on;
        }

        /// <summary>"all", "none", or a comma list of the effects to keep ON (the rest go off). Unknown names are ignored.</summary>
        public static void Apply(string spec)
        {
            if (string.IsNullOrEmpty(spec)) return;
            spec = spec.Trim().ToLowerInvariant();
            if (spec == "all") { SetAll(true); Notify(); return; }
            SetAll(false);
            if (spec == "none") { Notify(); return; }
            foreach (var raw in spec.Split(','))
            {
                switch (raw.Trim())
                {
                    case "spray": Spray = true; break;
                    case "puff": case "landing": LandingPuff = true; break;
                    case "exhaust": Exhaust = true; break;
                    case "tracks": Tracks = true; break;
                    case "beacon": Beacon = true; break;
                    case "headlights": Headlights = true; break;
                    case "sparkle": case "gold": Sparkle = true; break;
                    case "world": case "living": LivingWorld = true; break;
                }
            }
            Notify();
        }

        /// <summary>Reads `-mmFx &lt;spec&gt;` from the command line once.</summary>
        public static void ApplyCommandLine()
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++) if (a[i] == "-mmFx") Apply(a[i + 1]);
        }
    }
}
