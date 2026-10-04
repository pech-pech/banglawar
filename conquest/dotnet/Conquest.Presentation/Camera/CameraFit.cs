using System;
using System.Collections.Generic;
using Conquest.Core;

namespace Conquest.Presentation
{
    /// <summary>How the first camera of a map is chosen.</summary>
    public enum CameraFitMode
    {
        /// <summary>C1: the whole map plus a 256 px margin, any zoom value, the old zoom stops (the slice as it was).</summary>
        ContainMargin = 0,

        /// <summary>C2: the map (with the tall art above its top row) inside the area the HUD leaves free, zoom snapped down to a crisp stop; in portrait zoomed in further (see PortraitMinVisibleWidthPermille).</summary>
        ContainSafeCrisp = 1,

        /// <summary>C3: the local player's units and their surroundings, between the C2 zoom and 1.0, snapped to a crisp stop.</summary>
        FocusForces = 2,
    }

    /// <summary>Screen pixels taken by the HUD on each side (model screen, top-left origin).</summary>
    public readonly struct ScreenInsets
    {
        public ScreenInsets(int top, int bottom, int left, int right)
        {
            if (top < 0 || bottom < 0 || left < 0 || right < 0) throw new ArgumentOutOfRangeException(nameof(top));
            Top = top;
            Bottom = bottom;
            Left = left;
            Right = right;
        }

        public int Top { get; }

        public int Bottom { get; }

        public int Left { get; }

        public int Right { get; }

        public static ScreenInsets None => new ScreenInsets(0, 0, 0, 0);
    }

    /// <summary>
    /// The first camera for a map and viewport, computed once from numbers only, so the first frame is already right
    /// (no refit after layout). "Crisp" zooms are multiples of 125 permille: a 256 x 128 tile is then a whole, even
    /// number of screen pixels wide (32 px per step) and exactly half as tall, so every diamond edge is a clean 2:1 line.
    /// </summary>
    public static class CameraFit
    {
        public const int MarginPx = 256;
        public const int CrispQuantum = 125;
        public const int CentreQuantumPx = 8;

        /// <summary>World pixels the tallest terrain art (trees) rises above the top row's diamond.</summary>
        public const int TallArtOverhangPx = 200;

        /// <summary>The tile skirt under the bottom row's diamond.</summary>
        public const int SkirtPx = 16;

        public const int FocusPaddingTiles = 2;

        /// <summary>
        /// A portrait viewport (taller than wide) has height to spare once the map fills its width, so the
        /// safe-crisp fit zooms in until this share (permille) of the map's width is still visible, and the
        /// player pans the rest. Landscape viewports are not affected.
        /// </summary>
        public const int PortraitMinVisibleWidthPermille = 700;

        /// <summary>Zoom stops whose tiles land on whole pixels with an exact 2:1 diamond (64 to 512 px wide).</summary>
        public static readonly int[] CrispStops = { 250, 375, 500, 750, 1000, 1500, 2000 };

        public static IReadOnlyList<int> StopsFor(CameraFitMode mode) =>
            mode == CameraFitMode.ContainMargin ? (IReadOnlyList<int>)CameraModel.ZoomStops : CrispStops;

        public static bool IsCrisp(int zoomPermille) => IntMath.FloorMod(zoomPermille, CrispQuantum) == 0;

        /// <summary>The largest crisp zoom not above <paramref name="zoomPermille"/>, never below the minimum zoom.</summary>
        public static int SnapDown(int zoomPermille) =>
            Math.Max(CameraModel.MinZoom, Math.Min(CameraModel.MaxZoom, zoomPermille / CrispQuantum * CrispQuantum));

        /// <summary>The zoom (permille) at which a world rectangle just fits an area of the screen.</summary>
        public static int ContainZoom(int worldWidth, int worldHeight, int screenWidth, int screenHeight)
        {
            if (worldWidth <= 0 || worldHeight <= 0 || screenWidth <= 0 || screenHeight <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(worldWidth), "Sizes must be positive.");
            }

            long zx = (long)screenWidth * 1000 / worldWidth;
            long zy = (long)screenHeight * 1000 / worldHeight;
            return (int)Math.Min(zx, zy);
        }

        /// <summary>
        /// UI Toolkit's "scale with screen size" factor (permille) for a reference resolution and "match width or
        /// height" 0.5. UI Toolkit blends the two ratios linearly (measured in Unity 6000.6: a 1080 x 1920 panel lays
        /// out 615 x 1094, a factor of 1.755, the arithmetic mean of 0.844 and 2.667; uGUI's canvas scaler would use
        /// the geometric mean, 1.5). Used to know the HUD's size before it is laid out.
        /// </summary>
        public static int HudScalePermille(int width, int height, int referenceWidth = 1280, int referenceHeight = 720)
        {
            if (width <= 0 || height <= 0 || referenceWidth <= 0 || referenceHeight <= 0) throw new ArgumentOutOfRangeException(nameof(width));
            long numerator = (long)width * 1000 * referenceHeight + (long)height * 1000 * referenceWidth;
            long denominator = 2L * referenceWidth * referenceHeight;
            return (int)IntMath.FloorDiv(numerator + denominator / 2, denominator);
        }

        /// <summary>The camera of the first frame.</summary>
        /// <param name="focus">World rectangle of the local player's units (FocusForces only); null falls back to ContainSafeCrisp.</param>
        public static CameraModel Fit(CameraFitMode mode, PixelRect mapBounds, int viewportWidth, int viewportHeight, ScreenInsets insets, PixelRect? focus = null)
        {
            if (viewportWidth <= 0 || viewportHeight <= 0) throw new ArgumentOutOfRangeException(nameof(viewportWidth));
            switch (mode)
            {
                case CameraFitMode.ContainMargin: return Legacy(mapBounds, viewportWidth, viewportHeight);
                case CameraFitMode.ContainSafeCrisp: return ContainSafe(mapBounds, viewportWidth, viewportHeight, insets);
                case CameraFitMode.FocusForces:
                    return focus.HasValue ? Focus(mapBounds, viewportWidth, viewportHeight, insets, focus.Value) : ContainSafe(mapBounds, viewportWidth, viewportHeight, insets);
                default: throw new ArgumentOutOfRangeException(nameof(mode));
            }
        }

        /// <summary>The slice's original fit: bounds plus one margin in each direction, centred, zoom unsnapped.</summary>
        private static CameraModel Legacy(PixelRect bounds, int width, int height)
        {
            CameraModel start = CameraModel.Create(bounds, width, height, MarginPx);
            int zoom = ContainZoom(bounds.Width + MarginPx, bounds.Height + MarginPx, width, height);
            return start.ZoomTo(zoom, width / 2, height / 2);
        }

        private static PixelRect Content(PixelRect map) =>
            new PixelRect(map.Left, map.Top - TallArtOverhangPx, map.Right, map.Bottom + SkirtPx);

        private static int SafeWidth(int width, ScreenInsets insets) => Math.Max(1, width - insets.Left - insets.Right);

        private static int SafeHeight(int height, ScreenInsets insets) => Math.Max(1, height - insets.Top - insets.Bottom);

        private static int ContainSafeZoom(PixelRect map, int width, int height, ScreenInsets insets)
        {
            PixelRect content = Content(map);
            return SnapDown(ContainZoom(content.Width, content.Height, SafeWidth(width, insets), SafeHeight(height, insets)));
        }

        /// <summary>
        /// The contain zoom, raised in portrait: the largest crisp zoom that still shows
        /// <see cref="PortraitMinVisibleWidthPermille"/> of the map's width and does not crop it vertically; never below the contain zoom.
        /// </summary>
        private static int ContainSafeStartZoom(PixelRect map, int width, int height, ScreenInsets insets)
        {
            int contain = ContainSafeZoom(map, width, height, insets);
            if (height <= width) return contain;

            PixelRect content = Content(map);
            int safeWidth = SafeWidth(width, insets);
            long byWidth = (long)safeWidth * 1000 * 1000 / ((long)PortraitMinVisibleWidthPermille * content.Width);
            int byHeight = (int)((long)SafeHeight(height, insets) * 1000 / content.Height);
            int raised = SnapDown((int)Math.Min(Math.Min(byWidth, byHeight), CameraModel.MaxZoom));
            return Math.Max(contain, raised);
        }

        private static CameraModel ContainSafe(PixelRect map, int width, int height, ScreenInsets insets)
        {
            int zoom = ContainSafeStartZoom(map, width, height, insets);
            PixelRect content = Content(map);
            return Place(map, width, height, insets, zoom, Centre(content));
        }

        private static CameraModel Focus(PixelRect map, int width, int height, ScreenInsets insets, PixelRect focus)
        {
            int padX = FocusPaddingTiles * IsoProjection.DefaultTileWidth;
            int padY = FocusPaddingTiles * IsoProjection.DefaultTileHeight;
            var padded = new PixelRect(focus.Left - padX, focus.Top - padY - TallArtOverhangPx, focus.Right + padX, focus.Bottom + padY);
            int fitAll = ContainSafeZoom(map, width, height, insets);
            int zoom = SnapDown(ContainZoom(padded.Width, padded.Height, SafeWidth(width, insets), SafeHeight(height, insets)));
            zoom = Math.Max(fitAll, Math.Min(CameraModel.DefaultZoom, zoom));
            return Place(map, width, height, insets, zoom, Centre(padded));
        }

        private static PixelPoint Centre(PixelRect r) => new PixelPoint(r.Left + r.Width / 2, r.Top + r.Height / 2);

        /// <summary>
        /// Centres <paramref name="worldCentre"/> in the safe area. The pan bounds grow by the insets (in world pixels
        /// at this zoom) so the clamp keeps the shift, and the map's edge can be panned clear of the HUD later.
        /// </summary>
        private static CameraModel Place(PixelRect map, int width, int height, ScreenInsets insets, int zoom, PixelPoint worldCentre)
        {
            int top = Quantize(insets.Top * 1000 / zoom);
            int bottom = Quantize(insets.Bottom * 1000 / zoom);
            int left = Quantize(insets.Left * 1000 / zoom);
            int right = Quantize(insets.Right * 1000 / zoom);
            var bounds = new PixelRect(map.Left - left, map.Top - top - TallArtOverhangPx, map.Right + right, map.Bottom + bottom + SkirtPx);
            int shiftX = (insets.Right - insets.Left) * 1000 / zoom / 2;
            int shiftY = (insets.Bottom - insets.Top) * 1000 / zoom / 2;
            var centre = new PixelPoint(Quantize(worldCentre.X + shiftX), Quantize(worldCentre.Y + shiftY));
            CameraModel model = CameraModel.Create(bounds, width, height, MarginPx).ZoomTo(zoom, width / 2, height / 2);
            return model.CenterOn(centre);
        }

        /// <summary>Rounds to the nearest multiple of 2 x <see cref="CentreQuantumPx"/> (halves up), so the clamp's midpoint stays on the 8 px grid too.</summary>
        private static int Quantize(int value)
        {
            int q = 2 * CentreQuantumPx;
            return IntMath.FloorDiv(value + q / 2, q) * q;
        }
    }
}
