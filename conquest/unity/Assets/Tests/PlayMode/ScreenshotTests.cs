using System.Collections;
using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// Saves pictures of the running Map scene to conquest/unity/Screenshots (git-ignored). The world camera and the
    /// UI Toolkit panel are each rendered into a RenderTexture (batch mode has no window to capture), read back and
    /// composited on the CPU. They are evidence for a human, not assertions: the only checks are that a picture was
    /// produced and is not one flat colour.
    /// </summary>
    public sealed class ScreenshotTests
    {
        private const int Width = 1280;
        private const int Height = 720;

        private IEnumerator Boot(System.Action<MapController> got)
        {
            GameApp.Reset();
            SceneManager.LoadScene("Boot");
            yield return null;
            MapController? map = null;
            float until = Time.realtimeSinceStartup + 20f;
            while (Time.realtimeSinceStartup < until)
            {
                map = Object.FindFirstObjectByType<MapController>();
                if (map != null && map.IsBuilt) break;
                yield return null;
            }

            Assert.NotNull(map);
            for (int i = 0; i < 10; i++) yield return null;
            got(map!);
        }

        /// <summary>Renders into cleared RenderTextures of the shot's size (see <see cref="ShotKit"/>), saves and checks the picture.</summary>
        private static IEnumerator Capture(MapController map, string name)
        {
            ShotKit.Target target = ShotKit.Begin(map, Width, Height);
            float until = Time.realtimeSinceStartup + 0.4f; // the rig re-fits to the target; fades settle
            while (Time.realtimeSinceStartup < until) yield return null;
            Texture2D shot = ShotKit.Grab(map, target);
            ShotKit.Save(shot, name);
            Debug.Log("screenshot " + name + " " + Width + "x" + Height);
            Object.Destroy(shot);
            ShotKit.End(map, target);
            for (int i = 0; i < 4; i++) yield return null; // let the rig re-sync to the real viewport before anyone clicks
        }

        [UnityTest]
        public IEnumerator CaptureMapSelectedWithPathAndBengali()
        {
            MapController map = null!;
            yield return Boot(m => map = m);
            yield return Capture(map, "map-start.png");

            var all = map.Session.State.AsView().Units;
            UnitView unit = all.First(u => u.Owner == 0 && u.Role == UnitRole.Commander);
            map.SimulateClick(map.ScreenPointOfBanner(unit.Id));
            map.SimulateClick(map.ScreenPointOfTile(new GridPos(unit.Pos.X + 3, unit.Pos.Y))); // first tap: path preview, waiting for the second
            map.SetDebug(true);
            float settle = Time.realtimeSinceStartup + 0.3f;
            while (Time.realtimeSinceStartup < settle) yield return null;
            yield return Capture(map, "map-selected-path-debug.png");

            map.SetDebug(false);
            map.Text.SetLocale(Localizer.Bengali);
            for (int i = 0; i < 10; i++) yield return null;
            yield return Capture(map, "map-bengali.png");
        }
    }
}
