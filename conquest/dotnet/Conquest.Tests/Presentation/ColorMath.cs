using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    /// <summary>WCAG colour measurements for the tests (floats stay out of the deterministic projects).</summary>
    public static class ColorMath
    {
        /// <summary>WCAG relative luminance, 0 to 1.</summary>
        public static double Luminance(Rgb c) => 0.2126 * Linear(c.R) + 0.7152 * Linear(c.G) + 0.0722 * Linear(c.B);

        /// <summary>WCAG contrast ratio between two colours (1 to 21).</summary>
        public static double Contrast(Rgb a, Rgb b)
        {
            double la = Luminance(a);
            double lb = Luminance(b);
            return (Math.Max(la, lb) + 0.05) / (Math.Min(la, lb) + 0.05);
        }

        private static double Linear(int channel)
        {
            double c = channel / 255.0;
            return c <= 0.03928 ? c / 12.92 : Math.Pow((c + 0.055) / 1.055, 2.4);
        }
    }
}
