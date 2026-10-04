using UnityEngine;

namespace Conquest.UnityView
{
    /// <summary>Small engine helpers shared by the view.</summary>
    public static class ViewUtil
    {
        /// <summary>Destroy that also works outside play mode (EditMode tests build views too).</summary>
        public static void Destroy(Object? target)
        {
            if (target == null) return;
            if (Application.isPlaying) Object.Destroy(target);
            else Object.DestroyImmediate(target);
        }

        public static Color ToColor(Conquest.Presentation.Rgb rgb, float alpha = 1f) =>
            new Color(rgb.R / 255f, rgb.G / 255f, rgb.B / 255f, alpha);
    }
}
