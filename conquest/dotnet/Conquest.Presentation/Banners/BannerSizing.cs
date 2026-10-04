using System;

namespace Conquest.Presentation
{
    /// <summary>Banner size classes of the unit banner plan (21 section 4): light units small, the commander large.</summary>
    public enum BannerSizeClass
    {
        Small = 0,
        Medium = 1,
        Large = 2,
    }

    public static class BannerSizeClasses
    {
        /// <summary>The class of a manifest role (without the "u." prefix): scout and founder S, commander L, the rest M.</summary>
        public static BannerSizeClass Of(string role)
        {
            if (role == null) throw new ArgumentNullException(nameof(role));
            switch (role)
            {
                case "scout":
                case "founder":
                    return BannerSizeClass.Small;
                case "commander":
                    return BannerSizeClass.Large;
                default:
                    return BannerSizeClass.Medium;
            }
        }
    }

    /// <summary>
    /// How big a banner is drawn and how high it floats. The art is drawn once per class (cloth heights S 95, M 114,
    /// L 133 px for the player side, about 0.82 : 1 : 1.17 like the plan's 0.9 : 1.1 : 1.3) with a beam about half
    /// the cloth height. A candidate scales each class and sets the beam length as a fraction of the cloth height;
    /// 0 keeps the beam as drawn. The beam never gets shorter than drawn (the art cannot be cut).
    /// </summary>
    public sealed class BannerSizing
    {
        private readonly int[] scalePermille;

        private BannerSizing(PolishChoice choice, int small, int medium, int large, int beamPermilleOfCloth)
        {
            Choice = choice;
            scalePermille = new[] { small, medium, large };
            BeamPermilleOfCloth = beamPermilleOfCloth;
        }

        public PolishChoice Choice { get; }

        /// <summary>Beam length (cloth bottom to the ground point) as permille of the cloth height; 0 = as drawn.</summary>
        public int BeamPermilleOfCloth { get; }

        /// <summary>C1 as drawn (the polish composite's 60 percent banners), C2 S boosted most so its icon reads, beam 0.75; C3 the plan's W1a rule (beam = cloth height) at 1.5x.</summary>
        public static BannerSizing For(PolishChoice choice)
        {
            switch (choice)
            {
                case PolishChoice.C1: return new BannerSizing(choice, 1000, 1000, 1000, 0);
                case PolishChoice.C2: return new BannerSizing(choice, 1300, 1200, 1150, 750);
                case PolishChoice.C3: return new BannerSizing(choice, 1500, 1500, 1500, 1000);
                default: throw new ArgumentOutOfRangeException(nameof(choice));
            }
        }

        public int ScalePermille(BannerSizeClass sizeClass)
        {
            int i = (int)sizeClass;
            if (i < 0 || i >= scalePermille.Length) throw new ArgumentOutOfRangeException(nameof(sizeClass));
            return scalePermille[i];
        }

        /// <summary>
        /// Extra beam in art pixels (before scaling) to add to a picture whose cloth is <paramref name="clothHeightPx"/>
        /// tall and whose drawn beam is <paramref name="drawnBeamPx"/>. Never negative.
        /// </summary>
        public int ExtraBeamPx(int clothHeightPx, int drawnBeamPx)
        {
            if (clothHeightPx < 0 || drawnBeamPx < 0) throw new ArgumentOutOfRangeException(nameof(clothHeightPx));
            if (BeamPermilleOfCloth == 0) return 0;
            int target = clothHeightPx * BeamPermilleOfCloth / 1000;
            return Math.Max(0, target - drawnBeamPx);
        }

        /// <summary>A length in art pixels on screen, in whole pixels, for a class at a zoom (permille).</summary>
        public int ScreenPx(int artPx, BannerSizeClass sizeClass, int zoomPermille) =>
            (int)((long)artPx * ScalePermille(sizeClass) * zoomPermille / 1_000_000);
    }
}
