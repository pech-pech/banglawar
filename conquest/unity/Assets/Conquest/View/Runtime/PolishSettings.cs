using System;
using Conquest.Presentation;

namespace Conquest.UnityView
{
    /// <summary>
    /// The candidate choices the map is drawn with (banner size, stacks, selection, camera fit, layering, footprint
    /// anchor, placeholders). A plain static holder so the debug panel, tests and tools can switch a candidate at run
    /// time; the map listens and re-lays itself out. Defaults: <see cref="PolishOptions.Default"/>.
    /// </summary>
    public static class PolishSettings
    {
        public static PolishOptions Current { get; private set; } = PolishOptions.Default;

        public static event Action<PolishOptions, PolishOptions>? Changed;

        public static void Set(PolishOptions options)
        {
            if (options == null) throw new ArgumentNullException(nameof(options));
            if (options.Equals(Current)) return;
            PolishOptions previous = Current;
            Current = options;
            Changed?.Invoke(previous, options);
        }

        public static void Cycle(PolishDecision decision) => Set(Current.Cycle(decision));

        public static void Reset() => Set(PolishOptions.Default);

        public static BannerSizing Sizing => Current.Sizing;

        public static StackStyle Stack => Current.Stack;

        public static SelectionLook Selection => Current.Selection;

        public static CameraFitMode Camera => Current.Camera;

        public static LayeringMode Layering => Current.Layering;

        public static AnchorConvention Anchor => Current.Anchor;

        public static PlaceholderStyle Placeholders => Current.Placeholders;
    }
}
