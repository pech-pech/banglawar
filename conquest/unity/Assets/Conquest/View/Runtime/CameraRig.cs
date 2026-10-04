using System;
using System.Collections.Generic;
using Conquest.Presentation;
using UnityEngine;

namespace Conquest.UnityView
{
    /// <summary>
    /// Puts a Unity orthographic camera where the pure <see cref="CameraModel"/> says. The first camera comes from
    /// <see cref="CameraFit"/> (numbers only: map size, viewport, the HUD's known insets), so the first rendered frame
    /// is already the fitted one. Pan, zoom and clamping belong to the model; this class only copies the result.
    /// </summary>
    public sealed class CameraRig
    {
        public const int MarginPx = CameraFit.MarginPx;

        /// <summary>HUD heights at the 1280 x 720 reference (top bar plus hint strip; breathing room above the bottom row of controls).</summary>
        public const int HudTopReferencePx = HudLayout.TopInsetPx;
        public const int HudBottomReferencePx = HudLayout.BottomInsetPx;

        private readonly Camera camera;
        private readonly int ppu;
        private readonly IsoProjection iso;
        private readonly int mapWidth;
        private readonly int mapHeight;
        private readonly Func<PixelRect?> focus;
        private CameraFitMode mode;

        public CameraRig(Camera camera, IsoProjection iso, int mapWidth, int mapHeight, int pixelsPerUnit, CameraFitMode mode = CameraFitMode.ContainMargin, Func<PixelRect?>? focus = null)
        {
            this.camera = camera;
            this.iso = iso;
            this.mapWidth = mapWidth;
            this.mapHeight = mapHeight;
            this.mode = mode;
            this.focus = focus ?? (() => null);
            ppu = pixelsPerUnit;
            camera.orthographic = true;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.16f, 0.2f, 0.19f);
            Model = Fit(ViewportWidth, ViewportHeight);
            FirstFit = Model;
            Apply();
        }

        public CameraModel Model { get; private set; }

        /// <summary>The camera computed when the rig was made (before any frame): what the first frame shows.</summary>
        public CameraModel FirstFit { get; private set; }

        public Camera Camera => camera;

        public CameraFitMode Mode => mode;

        public IReadOnlyList<int> ZoomStops => CameraFit.StopsFor(mode);

        public int ViewportWidth => Mathf.Max(1, camera.pixelWidth);

        public int ViewportHeight => Mathf.Max(1, camera.pixelHeight);

        /// <summary>Times the camera re-fitted because the viewport changed size before the player touched it.</summary>
        public int Refits { get; private set; }

        public static ScreenInsets HudInsets(int width, int height)
        {
            int scale = CameraFit.HudScalePermille(width, height);
            return new ScreenInsets(HudTopReferencePx * scale / 1000, HudBottomReferencePx * scale / 1000, 0, 0);
        }

        private CameraModel Fit(int width, int height)
        {
            PixelRect bounds = iso.MapBounds(mapWidth, mapHeight);
            ScreenInsets insets = mode == CameraFitMode.ContainMargin ? ScreenInsets.None : HudInsets(width, height);
            return CameraFit.Fit(mode, bounds, width, height, insets, focus());
        }

        /// <summary>True once the player has panned, zoomed or centred: from then on a resize keeps the view instead of refitting the map.</summary>
        public bool UserAdjusted { get; private set; }

        public void SetModel(CameraModel model)
        {
            UserAdjusted = true;
            Model = model;
            Apply();
        }

        /// <summary>Switches the fit candidate and fits again (the player's adjustments are dropped).</summary>
        public void SetMode(CameraFitMode value)
        {
            mode = value;
            Refit();
        }

        public void Refit()
        {
            UserAdjusted = false;
            Model = Fit(ViewportWidth, ViewportHeight);
            FirstFit = Model;
            Apply();
        }

        /// <summary>Follows window resizes; keeps the centre and zoom once the player has moved the camera.</summary>
        public void SyncViewport()
        {
            if (Model.ViewportWidth == ViewportWidth && Model.ViewportHeight == ViewportHeight) return;
            if (!UserAdjusted) Refits++;
            Model = UserAdjusted ? Model.WithViewport(ViewportWidth, ViewportHeight) : Fit(ViewportWidth, ViewportHeight);
            Apply();
        }

        public void CenterOnTile(GridPos tile)
        {
            UserAdjusted = true;
            Model = Model.CenterOn(iso.GridToWorld(tile));
            Apply();
        }

        /// <summary>World pixels per screen pixel is 1000 / zoom; the orthographic size is half the viewport in world units.</summary>
        public static float OrthographicSize(int viewportHeight, int zoomPermille, int pixelsPerUnit) =>
            viewportHeight * 1000f / (2f * zoomPermille * pixelsPerUnit);

        public void Apply()
        {
            camera.orthographicSize = OrthographicSize(Model.ViewportHeight, Model.ZoomPermille, ppu);
            Transform t = camera.transform;
            Vector3 centre = ViewSpace.ToWorld(new PixelPoint(Model.CenterX, Model.CenterY), ppu);
            t.position = new Vector3(centre.x, centre.y, -10f);
        }
    }
}
