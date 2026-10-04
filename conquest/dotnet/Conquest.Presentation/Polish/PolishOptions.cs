using System;
using Conquest.Core;

namespace Conquest.Presentation
{
    /// <summary>One of three candidates for a contested look decision (the owner adjudicates; the view can switch).</summary>
    public enum PolishChoice
    {
        C1 = 0,
        C2 = 1,
        C3 = 2,
    }

    /// <summary>The look decisions of the map polish round, each with three switchable candidates.</summary>
    public enum PolishDecision
    {
        BannerSize = 0,
        Stack = 1,
        Selection = 2,
        CameraFit = 3,
        Layering = 4,
        Footprint = 5,
        Placeholder = 6,
    }

    /// <summary>
    /// Immutable set of candidate choices, one per <see cref="PolishDecision"/>. The defaults are the candidates the
    /// polish round judged best on screenshots; every other candidate stays one key press (debug panel) away.
    /// </summary>
    public sealed class PolishOptions
    {
        public const int DecisionCount = 7;
        public const int ChoiceCount = 3;

        private readonly PolishChoice[] choices;

        private PolishOptions(PolishChoice[] choices)
        {
            this.choices = choices;
        }

        /// <summary>The defaults judged best in the polish round (see the numbers table for why).</summary>
        public static PolishOptions Default { get; } = new PolishOptions(new[]
        {
            PolishChoice.C2, // banner size: plan ratios at 1.2x, beam 0.75 of the cloth
            PolishChoice.C2, // stack: lead banner with others peeking, count badge
            PolishChoice.C2, // selection: art hologram plus tile ring
            PolishChoice.C2, // camera: contain inside the HUD-safe area, crisp zoom
            PolishChoice.C3, // layering: bands (world, path, banners)
            PolishChoice.C3, // footprint: rule tile, art fitted to it
            PolishChoice.C2, // placeholder: blue-grey clay water, mid blocks
        });

        /// <summary>All decisions on one candidate (used to render comparison sheets).</summary>
        public static PolishOptions All(PolishChoice choice)
        {
            var all = new PolishChoice[DecisionCount];
            for (int i = 0; i < all.Length; i++) all[i] = choice;
            return new PolishOptions(all);
        }

        public PolishChoice Get(PolishDecision decision) => choices[Index(decision)];

        public BannerSizing Sizing => BannerSizing.For(Get(PolishDecision.BannerSize));

        /// <summary>C1 row fan, C2 lead and peek, C3 arc fan.</summary>
        public StackStyle Stack => (StackStyle)(int)Get(PolishDecision.Stack);

        public SelectionLook Selection => SelectionLook.For(Get(PolishDecision.Selection));

        /// <summary>C1 contain with margin, C2 contain the safe area crisply, C3 focus on the own forces.</summary>
        public CameraFitMode Camera => (CameraFitMode)(int)Get(PolishDecision.CameraFit);

        /// <summary>C1 overlay on top, C2 overlay in depth, C3 bands.</summary>
        public LayeringMode Layering => (LayeringMode)(int)Get(PolishDecision.Layering);

        /// <summary>C1 top-left, C2 front tile, C3 rule tile fitted.</summary>
        public AnchorConvention Anchor => (AnchorConvention)(int)Get(PolishDecision.Footprint);

        public PlaceholderStyle Placeholders => PlaceholderStyle.For(Get(PolishDecision.Placeholder));

        public PolishOptions With(PolishDecision decision, PolishChoice choice)
        {
            if (!Enum.IsDefined(typeof(PolishChoice), choice)) throw new ArgumentOutOfRangeException(nameof(choice));
            int i = Index(decision);
            if (choices[i] == choice) return this;
            var copy = (PolishChoice[])choices.Clone();
            copy[i] = choice;
            return new PolishOptions(copy);
        }

        /// <summary>C1 -> C2 -> C3 -> C1.</summary>
        public PolishOptions Cycle(PolishDecision decision) =>
            With(decision, (PolishChoice)IntMath.FloorMod((int)Get(decision) + 1, ChoiceCount));

        public bool Equals(PolishOptions? other)
        {
            if (other == null) return false;
            for (int i = 0; i < DecisionCount; i++)
            {
                if (choices[i] != other.choices[i]) return false;
            }

            return true;
        }

        public override bool Equals(object? obj) => Equals(obj as PolishOptions);

        public override int GetHashCode()
        {
            int h = 17;
            foreach (PolishChoice c in choices) h = h * 31 + (int)c;
            return h;
        }

        /// <summary>Short form for the debug panel, e.g. "size C2 stack C2 select C2 camera C2 layer C3 anchor C3 placeholder C2".</summary>
        public string Describe()
        {
            return "size " + Get(PolishDecision.BannerSize) + "  stack " + Get(PolishDecision.Stack) + "  select " + Get(PolishDecision.Selection)
                + "  camera " + Get(PolishDecision.CameraFit) + "  layer " + Get(PolishDecision.Layering)
                + "  anchor " + Get(PolishDecision.Footprint) + "  placeholder " + Get(PolishDecision.Placeholder);
        }

        private static int Index(PolishDecision decision)
        {
            int i = (int)decision;
            if (i < 0 || i >= DecisionCount) throw new ArgumentOutOfRangeException(nameof(decision));
            return i;
        }
    }
}
