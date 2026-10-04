using System.Collections;
using System.Linq;
using Conquest.Core.Contracts;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Conquest.UnityView.Tests
{
    /// <summary>Stacked units through real screen clicks: the badge selects the stack, every visible banner is its own target, a re-click cycles.</summary>
    public sealed class StackClickTests
    {
        private MapController map = null!;

        private IEnumerator Boot(PolishChoice stack)
        {
            PolishSettings.Set(PolishOptions.Default.With(PolishDecision.Stack, stack));
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
            for (int i = 0; i < 5; i++) yield return null;
        }

        private UnitView[] BiggestFriendlyStack() =>
            map.Session.State.AsView().Units.Where(u => u.Owner == map.Session.LocalSlot)
                .GroupBy(u => (u.Pos.X, u.Pos.Y)).OrderByDescending(g => g.Count()).First().ToArray();

        [TearDown]
        public void TearDown() => PolishSettings.Reset();

        [UnityTest]
        public IEnumerator ClickingTheBadgeSelectsTheWholeStack()
        {
            yield return Boot(PolishChoice.C2);
            UnitView[] stack = BiggestFriendlyStack();
            var tile = new GridPos(stack[0].Pos.X, stack[0].Pos.Y);
            Vector2? badge = map.ScreenPointOfBadge(tile);
            Assert.IsTrue(badge.HasValue, "lead and peek shows a badge on every stack");

            map.SimulateClick(badge!.Value);
            yield return null;

            CollectionAssert.AreEquivalent(stack.Select(u => u.Id), map.Interaction.Selection.SelectedIds);
            Assert.AreEqual(1, map.Overlay.VisibleRings, "one ring on the stack's tile");
        }

        [UnityTest]
        public IEnumerator EveryVisibleBannerOfARowFanIsItsOwnTargetAndTheLeadCycles()
        {
            yield return Boot(PolishChoice.C1);
            UnitView[] stack = BiggestFriendlyStack();
            foreach (UnitView u in stack)
            {
                BannerView view = map.Banners.Banners[u.Id];
                if (view.Hidden) continue;
                map.Interaction.Deselect();
                map.SimulateClick(map.ScreenPointOfBanner(u.Id));
                yield return null;
                Assert.AreEqual(u.Id, map.Interaction.Selection.PrimaryId, "banner of unit " + u.Id + " (" + u.Role + ") is clickable");
            }

            // every unit, hidden ones too, is reachable by clicking the selected lead again
            map.Interaction.Deselect();
            var reached = new System.Collections.Generic.HashSet<int>();
            for (int i = 0; i < stack.Length; i++)
            {
                int lead = map.Banners.StackAt(new GridPos(stack[0].Pos.X, stack[0].Pos.Y))[0].Id;
                map.SimulateClick(map.ScreenPointOfBanner(lead));
                yield return new WaitForSecondsRealtime(MapController.DoubleClickSeconds + 0.05f); // not a double click
                reached.Add(map.Interaction.Selection.PrimaryId);
            }

            Assert.AreEqual(stack.Length, reached.Count);
        }
    }
}
