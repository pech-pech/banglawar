using Conquest.Presentation;
using UnityEngine;

namespace Conquest.UnityView
{
    /// <summary>
    /// Conversions between the presentation's integer pixels (y down, tile 256 x 128) and Unity. World units are
    /// projection pixels divided by the sprite sheet's pixels-per-unit (256 today), y flipped. Screen positions
    /// from Unity have their origin bottom-left; the camera model's origin is top-left.
    /// </summary>
    public static class ViewSpace
    {
        public const int DefaultPixelsPerUnit = 256;

        public static Vector3 ToWorld(PixelPoint p, int pixelsPerUnit) =>
            new Vector3(p.X / (float)pixelsPerUnit, -p.Y / (float)pixelsPerUnit, 0f);

        public static Vector3 ToWorld(PixelPoint p, PixelPoint offset, int pixelsPerUnit) =>
            new Vector3((p.X + offset.X) / (float)pixelsPerUnit, -(p.Y + offset.Y) / (float)pixelsPerUnit, 0f);

        public static PixelPoint FromWorld(Vector3 w, int pixelsPerUnit) =>
            new PixelPoint(Mathf.RoundToInt(w.x * pixelsPerUnit), Mathf.RoundToInt(-w.y * pixelsPerUnit));

        /// <summary>Unity screen (bottom-left origin) to model screen (top-left origin).</summary>
        public static Vector2Int ToModelScreen(Vector2 unityScreen, int viewportHeight) =>
            new Vector2Int(Mathf.RoundToInt(unityScreen.x), viewportHeight - Mathf.RoundToInt(unityScreen.y));

        public static Vector2 ToUnityScreen(int modelX, int modelY, int viewportHeight) =>
            new Vector2(modelX, viewportHeight - modelY);
    }
}
