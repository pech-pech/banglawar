using System.Collections;
using System.Linq;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace Conquest.UnityView.Tests
{
    /// <summary>The debug panel's candidate buttons switch a decision at run time and the map re-lays itself out.</summary>
    public sealed class PolishSwitchTests
    {
        [TearDown]
        public void TearDown() => PolishSettings.Reset();

        [UnityTest]
        public IEnumerator DebugPanelButtonsCycleTheCandidatesLive()
        {
            PolishSettings.Reset();
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
            map!.SetDebug(true);
            yield return null;
            Button size = map.Hud.Root.Q<Button>("polish-" + PolishDecision.BannerSize);
            Assert.AreEqual("size C2", size.text);
            BannerView line = map.Banners.Banners.Values.First(b => b.SizeClass == BannerSizeClass.Medium);
            int before = line.ScalePermille;

            using (var e = new NavigationSubmitEvent { target = size }) size.SendEvent(e);
            yield return null;

            Assert.AreEqual(PolishChoice.C3, PolishSettings.Current.Get(PolishDecision.BannerSize));
            Assert.AreEqual("size C3", size.text);
            Assert.Greater(line.ScalePermille, before, "the banners grew at once");

            PolishSettings.Cycle(PolishDecision.Layering); // C3 -> C1: the old single layer
            yield return null;
            Assert.IsFalse(map.Banners.Root.GetComponent<SortingGroup>().enabled);
            PolishSettings.Cycle(PolishDecision.CameraFit); // C2 -> C3: the camera re-fits on its own decision only
            yield return null;
            Assert.AreEqual(CameraFitMode.FocusForces, map.Rig.Mode);
            StringAssert.Contains("camera C3", map.Hud.Root.Q<Label>("debug-text").text);
        }
    }
}
