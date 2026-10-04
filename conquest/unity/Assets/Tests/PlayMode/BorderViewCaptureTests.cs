using System.Collections;
using System.IO;
using Conquest.Core.Contracts;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// Evidence for the map border and the other views: default, min and max camera zoom at 1280 x 720, the 1080 x 1920 portrait
    /// view, and close-ups of the river ends and the lake. Explicit; writes conquest/unity/Screenshots/border/*.png.
    /// </summary>
    [Explicit("Writes the border/zoom screenshots")]
    public sealed class BorderViewCaptureTests
    {
        private MapController map = null!;

        private IEnumerator Boot()
        {
            GameApp.Reset();
            SceneManager.LoadScene("Boot");
            yield return null;
            float until = Time.realtimeSinceStartup + 20f;
            while (Time.realtimeSinceStartup < until)
            {
                map = Object.FindAnyObjectByType<MapController>();
                if (map != null && map.IsBuilt) break;
                yield return null;
            }

            Assert.NotNull(map);
            yield return ShotKit.Frames(5);
        }

        private static IEnumerator Wait(float s)
        {
            float until = Time.realtimeSinceStartup + s;
            while (Time.realtimeSinceStartup < until) yield return null;
        }

        private IEnumerator Shot(int w, int h, string name, int zoom, GridPos? centre)
        {
            ShotKit.Target t = ShotKit.Begin(map, w, h);
            map.Rig.Refit();
            yield return Wait(0.3f);
            if (zoom > 0 || centre.HasValue)
            {
                CameraModel m = map.Rig.Model;
                if (zoom > 0) m = m.ZoomTo(zoom, m.ViewportWidth / 2, m.ViewportHeight / 2);
                if (centre.HasValue) m = m.CenterOn(new IsoProjection().GridToWorld(centre.Value));
                map.Rig.SetModel(m);
                yield return Wait(0.3f);
            }

            Texture2D shot = ShotKit.Grab(map, t);
            ShotKit.Save(shot, Path.Combine("border", name + ".png"));
            Object.Destroy(shot);
            ShotKit.End(map, t);
        }

        [UnityTest]
        public IEnumerator CaptureViews()
        {
            yield return Boot();
            yield return Shot(1280, 720, "default-1280x720", 0, null);
            yield return Shot(1280, 720, "zoom-min-1280x720", CameraModel.MinZoom, null);
            yield return Shot(1280, 720, "zoom-max-1280x720", CameraModel.MaxZoom, new GridPos(11, 0));
            yield return Shot(1280, 720, "zoom-1400-river-east", 1400, new GridPos(11, 2));
            yield return Shot(1280, 720, "zoom-1400-river-west", 1400, new GridPos(0, 8));
            yield return Shot(1280, 720, "zoom-1400-lake", 1400, new GridPos(2, 7));
            yield return Shot(1280, 720, "zoom-1400-top", 1400, new GridPos(8, 0));
            yield return Shot(1080, 1920, "portrait-default", 0, null);
            yield return Shot(1080, 1920, "portrait-zoom-min", CameraModel.MinZoom, null);
            yield return Shot(1080, 1920, "portrait-zoom-max", CameraModel.MaxZoom, new GridPos(2, 7));
        }
    }
}
