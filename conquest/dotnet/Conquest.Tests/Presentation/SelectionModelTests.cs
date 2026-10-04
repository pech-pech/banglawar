using System.Linq;
using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class SelectionModelTests
    {
        private const int Me = 1;
        private const int Them = 2;

        private static UnitRef Mine(int id) => new UnitRef(id, Me);

        private static UnitRef Theirs(int id) => new UnitRef(id, Them);

        private static SelectionModel Fresh() => SelectionModel.Create(Me);

        [Test]
        public void StartsEmpty()
        {
            SelectionModel m = Fresh();
            Assert.That(m.Mode, Is.EqualTo(SelectionMode.None));
            Assert.That(m.SelectedIds, Is.Empty);
            Assert.That(m.PrimaryId, Is.EqualTo(SelectionModel.NoUnit));
            Assert.That(m.CanCommand, Is.False);
        }

        [Test]
        public void PlainClickSelectsOneFriendlyUnit_AndReplacesTheOldSelection()
        {
            SelectionModel m = Fresh().Click(Mine(5), false).Click(Mine(9), false);
            Assert.That(m.SelectedIds, Is.EqualTo(new[] { 9 }));
            Assert.That(m.Mode, Is.EqualTo(SelectionMode.Single));
            Assert.That(m.PrimaryId, Is.EqualTo(9));
            Assert.That(m.CanCommand, Is.True);
        }

        [Test]
        public void ShiftClickBuildsAMultiSelection_InAscendingOrder()
        {
            SelectionModel m = Fresh().Click(Mine(9), false).Click(Mine(3), true).Click(Mine(5), true);
            Assert.That(m.SelectedIds, Is.EqualTo(new[] { 3, 5, 9 }));
            Assert.That(m.Mode, Is.EqualTo(SelectionMode.Multi));
            Assert.That(m.PrimaryId, Is.EqualTo(5));
            Assert.That(m.IsSelected(9), Is.True);
            Assert.That(m.IsSelected(4), Is.False);
        }

        [Test]
        public void ShiftClickOnASelectedUnitRemovesIt()
        {
            SelectionModel m = Fresh().Click(Mine(1), false).Click(Mine(2), true).Click(Mine(3), true);
            m = m.Click(Mine(3), true);
            Assert.That(m.SelectedIds, Is.EqualTo(new[] { 1, 2 }));
            Assert.That(m.PrimaryId, Is.EqualTo(1));
            m = m.Click(Mine(2), true);
            Assert.That(m.SelectedIds, Is.EqualTo(new[] { 1 }));
            Assert.That(m.Mode, Is.EqualTo(SelectionMode.Single));
            Assert.That(m.PrimaryId, Is.EqualTo(1));
            m = m.Click(Mine(1), true);
            Assert.That(m.Mode, Is.EqualTo(SelectionMode.None));
        }

        [Test]
        public void RemovingANonPrimaryUnitKeepsThePrimary()
        {
            SelectionModel m = Fresh().Click(Mine(1), false).Click(Mine(2), true).Click(Mine(3), true);
            m = m.Click(Mine(1), true);
            Assert.That(m.PrimaryId, Is.EqualTo(3));
        }

        [Test]
        public void ShiftClickWithNothingSelectedActsLikeAPlainClick()
        {
            SelectionModel m = Fresh().Click(Mine(4), true);
            Assert.That(m.SelectedIds, Is.EqualTo(new[] { 4 }));
            Assert.That(m.Mode, Is.EqualTo(SelectionMode.Single));
        }

        [Test]
        public void MultiSelectionIsCapped()
        {
            SelectionModel m = Fresh().Click(Mine(100), false);
            for (int id = 0; id < 30; id++)
            {
                m = m.Click(Mine(id), true);
            }

            Assert.That(m.SelectedIds.Count, Is.EqualTo(SelectionModel.MaxMultiSelect));
            SelectionModel same = m.Click(Mine(500), true);
            Assert.That(same, Is.SameAs(m));
        }

        [Test]
        public void OpposingUnitsCanOnlyBeInspected_AndNeverJoinAGroup()
        {
            SelectionModel inspect = Fresh().Click(Theirs(7), false);
            Assert.That(inspect.Mode, Is.EqualTo(SelectionMode.Inspect));
            Assert.That(inspect.CanCommand, Is.False);
            Assert.That(inspect.SelectedIds, Is.EqualTo(new[] { 7 }));

            SelectionModel afterShift = inspect.Click(Mine(1), true);
            Assert.That(afterShift.Mode, Is.EqualTo(SelectionMode.Single));
            Assert.That(afterShift.SelectedIds, Is.EqualTo(new[] { 1 }));

            SelectionModel mine = Fresh().Click(Mine(1), false).Click(Mine(2), true);
            SelectionModel ignored = mine.Click(Theirs(8), true);
            Assert.That(ignored, Is.SameAs(mine));
            SelectionModel replaced = mine.Click(Theirs(8), false);
            Assert.That(replaced.Mode, Is.EqualTo(SelectionMode.Inspect));
            Assert.That(replaced.SelectedIds, Is.EqualTo(new[] { 8 }));
        }

        [Test]
        public void ClickOnNothingClears_ButShiftClickOnNothingKeeps()
        {
            SelectionModel m = Fresh().Click(Mine(1), false);
            Assert.That(m.Click(null, true), Is.SameAs(m));
            Assert.That(m.Click(null, false).Mode, Is.EqualTo(SelectionMode.None));
            SelectionModel empty = Fresh();
            Assert.That(empty.Cleared(), Is.SameAs(empty));
            Assert.That(empty.Click(null, false), Is.SameAs(empty));
        }

        [Test]
        public void HoverTracksTileAndUnit_AndIsIdempotent()
        {
            var tile = new GridPos(2, 3);
            SelectionModel m = Fresh().WithHover(tile, Mine(6));
            Assert.That(m.HoveredTile, Is.EqualTo((GridPos?)tile));
            Assert.That(m.HoveredUnitId, Is.EqualTo(6));
            Assert.That(m.WithHover(tile, Mine(6)), Is.SameAs(m));
            SelectionModel cleared = m.WithHover(null, null);
            Assert.That(cleared.HoveredTile, Is.Null);
            Assert.That(cleared.HoveredUnitId, Is.EqualTo(SelectionModel.NoUnit));
        }

        [Test]
        public void HoverSurvivesSelectionChanges()
        {
            SelectionModel m = Fresh().WithHover(new GridPos(1, 1), Mine(3)).Click(Mine(3), false);
            Assert.That(m.HoveredUnitId, Is.EqualTo(3));
            Assert.That(m.Cleared().HoveredUnitId, Is.EqualTo(3));
        }

        [Test]
        public void PruneDropsUnitsThatNoLongerExist()
        {
            SelectionModel m = Fresh().Click(Mine(1), false).Click(Mine(2), true).Click(Mine(3), true).WithHover(null, Mine(2));
            SelectionModel pruned = m.Prune(id => id != 2 && id != 3);
            Assert.That(pruned.SelectedIds, Is.EqualTo(new[] { 1 }));
            Assert.That(pruned.Mode, Is.EqualTo(SelectionMode.Single));
            Assert.That(pruned.PrimaryId, Is.EqualTo(1));
            Assert.That(pruned.HoveredUnitId, Is.EqualTo(SelectionModel.NoUnit));

            SelectionModel allGone = m.Prune(id => false);
            Assert.That(allGone.Mode, Is.EqualTo(SelectionMode.None));
            Assert.That(allGone.SelectedIds, Is.Empty);

            Assert.That(m.Prune(id => true), Is.SameAs(m));
        }

        [Test]
        public void PruneKeepsInspectModeAndFixesAMissingPrimary()
        {
            SelectionModel inspect = Fresh().Click(Theirs(7), false);
            Assert.That(inspect.Prune(id => true).Mode, Is.EqualTo(SelectionMode.Inspect));

            SelectionModel multi = Fresh().Click(Mine(1), false).Click(Mine(2), true).Click(Mine(3), true);
            SelectionModel pruned = multi.Prune(id => id != 3);
            Assert.That(pruned.PrimaryId, Is.EqualTo(1));
            Assert.That(pruned.Mode, Is.EqualTo(SelectionMode.Multi));
            Assert.Throws<System.ArgumentNullException>(() => multi.Prune(null!));
        }

        [Test]
        public void SelectedIdsAreAlwaysSortedAndUnique()
        {
            SelectionModel m = Fresh().Click(Mine(8), false);
            foreach (int id in new[] { 3, 8, 1, 3, 12, 1 })
            {
                m = m.Click(Mine(id), true);
            }

            Assert.That(m.SelectedIds.SequenceEqual(m.SelectedIds.OrderBy(i => i)), Is.True);
            Assert.That(m.SelectedIds.Distinct().Count(), Is.EqualTo(m.SelectedIds.Count));
        }
    }

    public class BannerVisualTests
    {
        [Test]
        public void Resolve_PrioritisesSelectedThenStatusThenHover()
        {
            Assert.That(BannerVisualRules.Resolve(true, true, true), Is.EqualTo(BannerVisualState.HologramSelected));
            Assert.That(BannerVisualRules.Resolve(false, true, true), Is.EqualTo(BannerVisualState.HologramStatus));
            Assert.That(BannerVisualRules.Resolve(false, true, false), Is.EqualTo(BannerVisualState.ClayHover));
            Assert.That(BannerVisualRules.Resolve(false, false, false), Is.EqualTo(BannerVisualState.Clay));
        }

        [Test]
        public void ClipStateNamesMatchTheManifestStates()
        {
            Assert.That(BannerVisualRules.ClipState(BannerVisualState.HologramSelected), Is.EqualTo("selected"));
            Assert.That(BannerVisualRules.ClipState(BannerVisualState.HologramStatus), Is.EqualTo("status"));
            Assert.That(BannerVisualRules.ClipState(BannerVisualState.Clay), Is.EqualTo("idle"));
            Assert.That(BannerVisualRules.ClipState(BannerVisualState.ClayHover), Is.EqualTo("idle"));
        }

        [Test]
        public void SettledTransitionShowsTheTargetImmediately()
        {
            BannerTransition t = BannerTransition.Settled(BannerVisualState.Clay);
            Assert.That(t.IsSettled(0), Is.True);
            Assert.That(t.BlendPermille(0), Is.EqualTo(1000));
            Assert.That(t.Begin(BannerVisualState.Clay, 5), Is.SameAs(t));
        }

        [Test]
        public void FadeInRunsForTheHologramInDuration_WithASmoothCurve()
        {
            BannerTransition t = BannerTransition.Settled(BannerVisualState.Clay).Begin(BannerVisualState.HologramSelected, 1000);
            Assert.That(t.From, Is.EqualTo(BannerVisualState.Clay));
            Assert.That(t.To, Is.EqualTo(BannerVisualState.HologramSelected));
            Assert.That(t.DurationMs, Is.EqualTo(BannerTransition.HologramInMs));
            Assert.That(t.BlendPermille(1000), Is.EqualTo(0));
            Assert.That(t.BlendPermille(1000 + BannerTransition.HologramInMs / 2), Is.EqualTo(500));
            Assert.That(t.BlendPermille(1000 + BannerTransition.HologramInMs), Is.EqualTo(1000));
            Assert.That(t.BlendPermille(9999), Is.EqualTo(1000));
            Assert.That(t.IsSettled(1000 + BannerTransition.HologramInMs), Is.True);
            Assert.That(t.BlendPermille(500), Is.EqualTo(0));
            Assert.That(t.BlendPermille(1030), Is.LessThan(t.ProgressPermille(1030)));
        }

        [Test]
        public void FadeOutIsFasterThanFadeIn()
        {
            BannerTransition t = BannerTransition.Settled(BannerVisualState.HologramSelected).Begin(BannerVisualState.Clay, 0);
            Assert.That(t.DurationMs, Is.EqualTo(BannerTransition.HologramOutMs));
            Assert.That(t.IsSettled(BannerTransition.HologramOutMs), Is.True);
        }

        [Test]
        public void ReversingMidFadeContinuesFromTheCurrentBlend()
        {
            BannerTransition t = BannerTransition.Settled(BannerVisualState.Clay).Begin(BannerVisualState.HologramSelected, 0);
            int half = BannerTransition.HologramInMs / 2;
            int blendBefore = t.BlendPermille(half);
            BannerTransition back = t.Begin(BannerVisualState.Clay, half);
            Assert.That(back.From, Is.EqualTo(BannerVisualState.HologramSelected));
            Assert.That(back.To, Is.EqualTo(BannerVisualState.Clay));
            Assert.That(back.BlendPermille(half), Is.EqualTo(1000 - blendBefore).Within(2));
        }

        [Test]
        public void SwitchingToAThirdLookStartsFromWhicheverIsMoreVisible()
        {
            BannerTransition t = BannerTransition.Settled(BannerVisualState.Clay).Begin(BannerVisualState.HologramSelected, 0);
            BannerTransition early = t.Begin(BannerVisualState.HologramStatus, 10);
            Assert.That(early.From, Is.EqualTo(BannerVisualState.Clay));
            BannerTransition late = t.Begin(BannerVisualState.HologramStatus, 170);
            Assert.That(late.From, Is.EqualTo(BannerVisualState.HologramSelected));
            Assert.That(late.To, Is.EqualTo(BannerVisualState.HologramStatus));
        }
    }
}
