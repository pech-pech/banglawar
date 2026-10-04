using System.Collections;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// The first camera must already be the fitted one: the Map scene is booted with its camera drawing into a
    /// RenderTexture of the target size from the start (set when the scene loads, before any Start), and the camera
    /// must not move during the first frames (no refit jump), for each fit candidate at 1280 x 720, 1920 x 1080 and
    /// a 1080 x 1920 phone held upright. The fit must equal the pure <see cref="CameraFit"/> answer.
    /// </summary>
    public sealed class CameraFirstFrameTests
    {
        private RenderTexture? target;

        private void OnSceneLoaded(Scene scene, LoadSceneMode mode)
        {
            if (scene.name != BootBootstrap.MapSceneName) return;
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                Camera? cam = root.GetComponentInChildren<Camera>();
                if (cam != null) cam.targetTexture = target;
            }
        }

        [UnityTest]
        public IEnumerator FirstFrameIsTheFitAndNothingJumps(
            [Values(1280, 1920, 1080)] int width,
            [Values(CameraFitMode.ContainMargin, CameraFitMode.ContainSafeCrisp, CameraFitMode.FocusForces)] CameraFitMode mode)
        {
            int height = width == 1280 ? 720 : width == 1920 ? 1080 : 1920;
            target = new RenderTexture(width, height, 24);
            PolishSettings.Set(PolishOptions.Default.With(PolishDecision.CameraFit, (PolishChoice)(int)mode));
            SceneManager.sceneLoaded += OnSceneLoaded;
            try
            {
                GameApp.Reset();
                SceneManager.LoadScene("Boot");
                yield return null;
                MapController? map = null;
                float until = Time.realtimeSinceStartup + 20f;
                while (Time.realtimeSinceStartup < until)
                {
                    map = Object.FindAnyObjectByType<MapController>();
                    if (map != null && map.IsBuilt) break;
                    yield return null;
                }

                Assert.NotNull(map);
                CameraModel first = map!.Rig.FirstFit;
                Assert.AreEqual(width, first.ViewportWidth, "the first fit used the real target size");
                Assert.AreEqual(height, first.ViewportHeight);
                for (int i = 0; i < 10; i++) yield return null;

                CameraModel now = map.Rig.Model;
                Assert.AreEqual(0, map.Rig.Refits, "no refit after the first frame");
                Assert.AreEqual((first.CenterX, first.CenterY, first.ZoomPermille), (now.CenterX, now.CenterY, now.ZoomPermille), "the camera did not move");
                if (mode != CameraFitMode.ContainMargin) Assert.IsTrue(CameraFit.IsCrisp(now.ZoomPermille), "crisp zoom " + now.ZoomPermille);
                Debug.Log("first-fit " + mode + " " + width + "x" + height + " zoom " + now.ZoomPermille + " centre " + now.CenterX + "," + now.CenterY);
                map.Rig.Camera.targetTexture = null;
            }
            finally
            {
                SceneManager.sceneLoaded -= OnSceneLoaded;
                PolishSettings.Reset();
                target.Release();
            }
        }
    }
}
