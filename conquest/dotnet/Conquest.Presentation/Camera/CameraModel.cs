using System;
using Conquest.Core;

namespace Conquest.Presentation
{
    /// <summary>
    /// Immutable orthographic camera over world pixels. Zoom is an integer in permille (1000 = one world
    /// pixel per screen pixel). Every change returns a new, clamped camera. Screen pixels have their origin
    /// at the top-left of the viewport and y grows downward, like world pixels.
    /// </summary>
    public sealed class CameraModel
    {
        public const int MinZoom = 250;
        public const int MaxZoom = 2000;
        public const int DefaultZoom = 1000;
        private const int Permille = 1000;

        /// <summary>Discrete zoom stops used by the + and - keys (GDD 14.3: 0.25 to 2.0).</summary>
        public static readonly int[] ZoomStops = { 250, 350, 500, 700, 1000, 1400, 2000 };

        public int CenterX { get; }
        public int CenterY { get; }
        public int ZoomPermille { get; }
        public int ViewportWidth { get; }
        public int ViewportHeight { get; }
        public PixelRect Bounds { get; }
        public int Margin { get; }

        private CameraModel(int centerX, int centerY, int zoom, int viewportWidth, int viewportHeight, PixelRect bounds, int margin)
        {
            ZoomPermille = Math.Max(MinZoom, Math.Min(MaxZoom, zoom));
            ViewportWidth = viewportWidth;
            ViewportHeight = viewportHeight;
            Bounds = bounds;
            Margin = margin;
            CenterX = ClampAxis(centerX, bounds.Left - margin, bounds.Right + margin, viewportWidth, ZoomPermille);
            CenterY = ClampAxis(centerY, bounds.Top - margin, bounds.Bottom + margin, viewportHeight, ZoomPermille);
        }

        /// <summary>Camera centred on the map at zoom 1.0.</summary>
        public static CameraModel Create(PixelRect mapBounds, int viewportWidth, int viewportHeight, int margin)
        {
            if (viewportWidth <= 0 || viewportHeight <= 0 || margin < 0 || mapBounds.Width <= 0 || mapBounds.Height <= 0)
            {
                throw new ArgumentException("Viewport and bounds must be positive; margin must not be negative.");
            }

            return new CameraModel(
                mapBounds.Left + mapBounds.Width / 2,
                mapBounds.Top + mapBounds.Height / 2,
                DefaultZoom, viewportWidth, viewportHeight, mapBounds, margin);
        }

        private static int ClampAxis(int center, int low, int high, int viewportPixels, int zoom)
        {
            int halfView = IntMath.FloorDiv(viewportPixels * Permille, 2 * zoom);
            if (high - low <= 2 * halfView)
            {
                return low + (high - low) / 2;
            }

            return Math.Max(low + halfView, Math.Min(high - halfView, center));
        }

        private CameraModel With(int centerX, int centerY, int zoom)
        {
            return new CameraModel(centerX, centerY, zoom, ViewportWidth, ViewportHeight, Bounds, Margin);
        }

        public CameraModel WithViewport(int width, int height)
        {
            if (width <= 0 || height <= 0)
            {
                throw new ArgumentException("Viewport must be positive.");
            }

            return new CameraModel(CenterX, CenterY, ZoomPermille, width, height, Bounds, Margin);
        }

        public PixelPoint ScreenToWorld(int screenX, int screenY)
        {
            return new PixelPoint(
                CenterX + IntMath.FloorDiv((screenX - ViewportWidth / 2) * Permille, ZoomPermille),
                CenterY + IntMath.FloorDiv((screenY - ViewportHeight / 2) * Permille, ZoomPermille));
        }

        public PixelPoint WorldToScreen(PixelPoint world)
        {
            return new PixelPoint(
                ViewportWidth / 2 + IntMath.FloorDiv((world.X - CenterX) * ZoomPermille, Permille),
                ViewportHeight / 2 + IntMath.FloorDiv((world.Y - CenterY) * ZoomPermille, Permille));
        }

        /// <summary>Drag-pan: the world follows the pointer, so the camera moves the opposite way.</summary>
        public CameraModel PanByScreenDelta(int deltaScreenX, int deltaScreenY)
        {
            return With(
                CenterX - IntMath.FloorDiv(deltaScreenX * Permille, ZoomPermille),
                CenterY - IntMath.FloorDiv(deltaScreenY * Permille, ZoomPermille),
                ZoomPermille);
        }

        public CameraModel CenterOn(PixelPoint world) => With(world.X, world.Y, ZoomPermille);

        /// <summary>
        /// Moves to the next zoom stop (steps &gt; 0 zooms in) while keeping the world point under the anchor
        /// (usually the pointer) fixed on screen. Steps beyond the ends stay at the end.
        /// </summary>
        public CameraModel ZoomSteps(int steps, int anchorScreenX, int anchorScreenY) =>
            ZoomSteps(steps, anchorScreenX, anchorScreenY, ZoomStops);

        /// <summary>Like <see cref="ZoomSteps(int,int,int)"/> over a caller's ascending list of stops (e.g. the crisp ones).</summary>
        public CameraModel ZoomSteps(int steps, int anchorScreenX, int anchorScreenY, System.Collections.Generic.IReadOnlyList<int> stops)
        {
            if (stops == null || stops.Count == 0) throw new ArgumentException("At least one zoom stop is needed.", nameof(stops));
            int index;
            if (steps > 0)
            {
                index = stops.Count - 1;
                for (int i = 0; i < stops.Count; i++)
                {
                    if (stops[i] > ZoomPermille)
                    {
                        index = Math.Min(stops.Count - 1, i + steps - 1);
                        break;
                    }
                }
            }
            else if (steps < 0)
            {
                index = 0;
                for (int i = stops.Count - 1; i >= 0; i--)
                {
                    if (stops[i] < ZoomPermille)
                    {
                        index = Math.Max(0, i + steps + 1);
                        break;
                    }
                }
            }
            else
            {
                return this;
            }

            return ZoomTo(stops[index], anchorScreenX, anchorScreenY);
        }

        /// <summary>Continuous zoom (mouse wheel, pinch) to a permille value, clamped to 250..2000.</summary>
        public CameraModel ZoomTo(int zoomPermille, int anchorScreenX, int anchorScreenY)
        {
            int zoom = Math.Max(MinZoom, Math.Min(MaxZoom, zoomPermille));
            PixelPoint anchor = ScreenToWorld(anchorScreenX, anchorScreenY);
            int cx = anchor.X - IntMath.FloorDiv((anchorScreenX - ViewportWidth / 2) * Permille, zoom);
            int cy = anchor.Y - IntMath.FloorDiv((anchorScreenY - ViewportHeight / 2) * Permille, zoom);
            return With(cx, cy, zoom);
        }

        /// <summary>The world rectangle currently visible.</summary>
        public PixelRect VisibleWorld()
        {
            PixelPoint topLeft = ScreenToWorld(0, 0);
            PixelPoint bottomRight = ScreenToWorld(ViewportWidth, ViewportHeight);
            return new PixelRect(topLeft.X, topLeft.Y, bottomRight.X, bottomRight.Y);
        }
    }
}
