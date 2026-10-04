using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class StackPolishTests
    {
        private static readonly StackStyle[] Styles = { StackStyle.RowFan, StackStyle.LeadPeek, StackStyle.ArcFan };

        [Test]
        public void ASingleBannerSitsOnTheTileCentre()
        {
            foreach (StackStyle style in Styles)
            {
                StackSlot[] slots = StackLayout.Arrange(style, 1, 120, 256);
                Assert.That(slots, Has.Length.EqualTo(1));
                Assert.That((slots[0].OffsetX, slots[0].OffsetY, slots[0].ScalePermille, slots[0].Visible, slots[0].Depth), Is.EqualTo((0, 0, 1000, true, 0)), style.ToString());
            }

            Assert.That(StackLayout.Arrange(StackStyle.RowFan, 0, 120, 256), Is.Empty);
        }

        [TestCase(2)]
        [TestCase(3)]
        [TestCase(4)]
        [TestCase(5)]
        [TestCase(6)]
        [TestCase(12)]
        public void EveryUnitIsVisibleOrCountedByTheBadge(int count)
        {
            foreach (StackStyle style in Styles)
            {
                StackSlot[] slots = StackLayout.Arrange(style, count, 120, 256);
                int visible = slots.Count(s => s.Visible);
                int hiddenOrCounted = StackLayout.ShowsBadge(style, count) ? count : 0;
                Assert.That(visible == count || hiddenOrCounted == count || visible + StackLayout.BadgeNumber(style, count) == count, Is.True, style + " " + count);
                Assert.That(visible, Is.EqualTo(Math.Min(count, StackLayout.MaxVisible(style))));
                Assert.That(slots[0].Depth, Is.EqualTo(0), "the lead is in front");
                Assert.That(slots.Where(s => s.Visible).Select(s => s.Depth).Distinct().Count(), Is.EqualTo(visible), "no two visible banners share a depth");
            }
        }

        [Test]
        public void VisibleBannersNeverShareAPosition()
        {
            foreach (StackStyle style in Styles)
            {
                for (int count = 2; count <= 8; count++)
                {
                    StackSlot[] slots = StackLayout.Arrange(style, count, 100, 256);
                    var places = slots.Where(s => s.Visible).Select(s => (s.OffsetX, s.OffsetY)).ToList();
                    Assert.That(places.Distinct().Count(), Is.EqualTo(places.Count), style + " " + count);
                }
            }
        }

        [Test]
        public void RowFanIsCentredAndStepsByAFixedShareOfTheWidth()
        {
            StackSlot[] three = StackLayout.Arrange(StackStyle.RowFan, 3, 100, 256);
            Assert.That(three.Select(s => s.OffsetX), Is.EqualTo(new[] { 0, 62, -62 }));
            Assert.That(three[1].OffsetY, Is.EqualTo(-StackLayout.BackRowRisePx));
            StackSlot[] two = StackLayout.Arrange(StackStyle.RowFan, 2, 100, 256);
            Assert.That(two[0].OffsetX, Is.EqualTo(0), "the lead stays on the tile centre");
            Assert.That(two[1].OffsetX, Is.EqualTo(62));
        }

        [Test]
        public void LeadPeekStepsUpAndRightAndShrinks()
        {
            StackSlot[] slots = StackLayout.Arrange(StackStyle.LeadPeek, 6, 100, 256);
            Assert.That(slots[1].OffsetX, Is.EqualTo(30));
            Assert.That(slots[1].OffsetY, Is.EqualTo(-22));
            Assert.That(slots[3].ScalePermille, Is.EqualTo(1000 - 3 * StackLayout.PeekShrinkPermille));
            Assert.That(slots[4].Visible, Is.False);
            Assert.That(slots[5].Depth, Is.EqualTo(5));
        }

        [Test]
        public void ArcFanStaysInsideTheTileAndCompactsFromThree()
        {
            StackSlot[] six = StackLayout.Arrange(StackStyle.ArcFan, 6, 120, 256);
            Assert.That(six.Max(s => s.OffsetX) - six.Min(s => s.OffsetX), Is.LessThanOrEqualTo(256 * 84 / 100));
            Assert.That(six.All(s => s.ScalePermille == StackLayout.ArcCompactScale), Is.True);
            Assert.That(six[0].OffsetY, Is.GreaterThan(six.Min(s => s.OffsetY)), "the middle is lower than the raised ends");
            StackSlot[] two = StackLayout.Arrange(StackStyle.ArcFan, 2, 120, 256);
            Assert.That(two.All(s => s.ScalePermille == 1000), Is.True);
            StackSlot[] seven = StackLayout.Arrange(StackStyle.ArcFan, 7, 120, 256);
            Assert.That(seven[6].Visible, Is.False);
        }

        [TestCase(1, new[] { 0 })]
        [TestCase(2, new[] { 0, 1 })]
        [TestCase(3, new[] { 1, 2, 0 })]
        [TestCase(4, new[] { 1, 2, 0, 3 })]
        [TestCase(6, new[] { 2, 3, 1, 4, 0, 5 })]
        public void CentreOutOrderStartsInTheMiddle(int columns, int[] expected)
        {
            Assert.That(StackLayout.CentreOutOrder(columns), Is.EqualTo(expected));
        }

        [Test]
        public void BadgeRulesPerStyle()
        {
            Assert.That(StackLayout.ShowsBadge(StackStyle.LeadPeek, 1), Is.False);
            Assert.That(StackLayout.ShowsBadge(StackStyle.LeadPeek, 2), Is.True);
            Assert.That(StackLayout.BadgeNumber(StackStyle.LeadPeek, 5), Is.EqualTo(5));
            Assert.That(StackLayout.ShowsBadge(StackStyle.RowFan, 4), Is.False);
            Assert.That(StackLayout.BadgeNumber(StackStyle.RowFan, 6), Is.EqualTo(2), "+2 hidden");
            Assert.That(StackLayout.BadgeNumber(StackStyle.ArcFan, 6), Is.EqualTo(0));
            Assert.That(StackLayout.BadgeNumber(StackStyle.ArcFan, 9), Is.EqualTo(3));
        }

        [Test]
        public void LayoutRejectsBadInput()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => StackLayout.Arrange(StackStyle.RowFan, -1, 100, 256));
            Assert.Throws<ArgumentOutOfRangeException>(() => StackLayout.Arrange(StackStyle.RowFan, 2, 0, 256));
            Assert.Throws<ArgumentOutOfRangeException>(() => StackLayout.Arrange((StackStyle)9, 2, 100, 256));
            Assert.Throws<ArgumentOutOfRangeException>(() => StackLayout.MaxVisible((StackStyle)9));
            Assert.Throws<ArgumentOutOfRangeException>(() => StackLayout.ShowsBadge((StackStyle)9, 2));
            Assert.Throws<ArgumentOutOfRangeException>(() => StackLayout.ShowsBadge(StackStyle.RowFan, -1));
            Assert.Throws<ArgumentOutOfRangeException>(() => StackLayout.CentreOutOrder(0));
        }

        // ----- lead, order and clicks -----

        private static StackMember M(int id, BannerSizeClass c = BannerSizeClass.Medium, int owner = 0) => new StackMember(id, owner, c);

        [Test]
        public void LeadIsTheSelectedUnitThenTheLargestClassThenTheLowestId()
        {
            var stack = new[] { M(7), M(3, BannerSizeClass.Small), M(9, BannerSizeClass.Large), M(4) };
            SelectionModel none = SelectionModel.Create(0);

            Assert.That(UnitStack.LeadOf(stack, none), Is.EqualTo(9), "the commander leads");
            Assert.That(UnitStack.LeadOf(new[] { M(7), M(4) }, none), Is.EqualTo(4));
            SelectionModel picked = none.Click(new UnitRef(7, 0), false);
            Assert.That(UnitStack.LeadOf(stack, picked), Is.EqualTo(7));
            SelectionModel elsewhere = none.Click(new UnitRef(50, 0), false).Click(new UnitRef(4, 0), true);
            Assert.That(elsewhere.PrimaryId, Is.EqualTo(4));
            SelectionModel groupPrimaryAway = none.Click(new UnitRef(3, 0), false).Click(new UnitRef(50, 0), true);
            Assert.That(UnitStack.LeadOf(stack, groupPrimaryAway), Is.EqualTo(3), "a selected member leads even when the primary is elsewhere");
            Assert.That(UnitStack.LeadOf(Array.Empty<StackMember>(), none), Is.EqualTo(SelectionModel.NoUnit));
        }

        [Test]
        public void DisplayOrderIsLeadThenAscending()
        {
            var stack = new[] { M(7), M(3), M(9), M(4) };
            Assert.That(UnitStack.DisplayOrder(stack, 7).Select(m => m.Id), Is.EqualTo(new[] { 7, 3, 4, 9 }));
            Assert.That(UnitStack.DisplayOrder(stack, 99).Select(m => m.Id), Is.EqualTo(new[] { 3, 4, 7, 9 }), "an absent lead changes nothing");
        }

        [Test]
        public void NextAfterWrapsInAscendingOrder()
        {
            int[] ids = { 9, 3, 7 };
            Assert.That(UnitStack.NextAfter(ids, 3), Is.EqualTo(7));
            Assert.That(UnitStack.NextAfter(ids, 9), Is.EqualTo(3));
            Assert.That(UnitStack.NextAfter(ids, -1), Is.EqualTo(3));
            Assert.That(UnitStack.NextAfter(Array.Empty<int>(), 3), Is.EqualTo(SelectionModel.NoUnit));
        }

        [Test]
        public void ReclickingTheSelectedLeadCyclesThroughTheWholeStack()
        {
            var stack = new[] { M(3), M(4), M(7) };
            SelectionModel sel = SelectionModel.Create(0);
            var seen = new List<int>();
            UnitRef clicked = new UnitRef(3, 0);
            for (int i = 0; i < 4; i++)
            {
                sel = UnitStack.Click(sel, stack, clicked, false);
                seen.Add(sel.PrimaryId);
                clicked = new UnitRef(sel.PrimaryId, 0); // the new lead is in front, so the next click lands on it
            }

            Assert.That(seen, Is.EqualTo(new[] { 3, 4, 7, 3 }));
            Assert.That(sel.Mode, Is.EqualTo(SelectionMode.Single));
        }

        [Test]
        public void AdditiveClicksAndSingleUnitTilesDoNotCycle()
        {
            var stack = new[] { M(3), M(4) };
            SelectionModel sel = SelectionModel.Create(0).Click(new UnitRef(3, 0), false);
            SelectionModel added = UnitStack.Click(sel, stack, new UnitRef(4, 0), true);
            Assert.That(added.SelectedIds, Is.EqualTo(new[] { 3, 4 }));
            SelectionModel alone = UnitStack.Click(sel, new[] { M(3) }, new UnitRef(3, 0), false);
            Assert.That(alone.PrimaryId, Is.EqualTo(3));
            Assert.Throws<ArgumentNullException>(() => UnitStack.Click(null!, stack, new UnitRef(3, 0), false));
            Assert.Throws<ArgumentNullException>(() => UnitStack.Click(sel, null!, new UnitRef(3, 0), false));
        }

        [Test]
        public void SelectAllTakesEveryFriendlyUnitOfTheStack()
        {
            var stack = new[] { M(7), M(3), M(9, BannerSizeClass.Large), M(20, owner: 1) };
            SelectionModel all = UnitStack.SelectAll(SelectionModel.Create(0), stack, 9);

            Assert.That(all.SelectedIds, Is.EqualTo(new[] { 3, 7, 9 }));
            Assert.That(all.PrimaryId, Is.EqualTo(9));
            Assert.That(all.Mode, Is.EqualTo(SelectionMode.Multi));
        }

        [Test]
        public void SelectAllOnAnOpposingStackInspectsTheLeadOnly()
        {
            var stack = new[] { M(20, owner: 1), M(21, owner: 1) };
            SelectionModel inspect = UnitStack.SelectAll(SelectionModel.Create(0), stack, 21);
            Assert.That(inspect.Mode, Is.EqualTo(SelectionMode.Inspect));
            Assert.That(inspect.SelectedIds, Is.EqualTo(new[] { 21 }));
            SelectionModel firstOne = SelectionModel.Create(0).SelectGroup(new[] { new UnitRef(20, 1) }, 99);
            Assert.That(firstOne.PrimaryId, Is.EqualTo(20));
        }

        [Test]
        public void SelectGroupCapsAndHandlesEdgeCases()
        {
            UnitRef[] many = Enumerable.Range(1, 20).Select(i => new UnitRef(i, 0)).ToArray();
            SelectionModel capped = SelectionModel.Create(0).SelectGroup(many, 15);
            Assert.That(capped.SelectedIds, Has.Count.EqualTo(SelectionModel.MaxMultiSelect));
            Assert.That(capped.PrimaryId, Is.EqualTo(1), "a primary beyond the cap falls back to the first");
            SelectionModel one = SelectionModel.Create(0).SelectGroup(new[] { new UnitRef(5, 0) }, 5);
            Assert.That(one.Mode, Is.EqualTo(SelectionMode.Single));
            SelectionModel cleared = one.SelectGroup(Array.Empty<UnitRef>(), 5);
            Assert.That(cleared.Mode, Is.EqualTo(SelectionMode.None));
            Assert.Throws<ArgumentNullException>(() => one.SelectGroup(null!, 1));
            Assert.Throws<ArgumentNullException>(() => UnitStack.SelectAll(null!, Array.Empty<StackMember>(), 1));
            Assert.Throws<ArgumentNullException>(() => UnitStack.SelectAll(one, null!, 1));
            Assert.Throws<ArgumentNullException>(() => UnitStack.LeadOf(null!, one));
            Assert.Throws<ArgumentNullException>(() => UnitStack.LeadOf(Array.Empty<StackMember>(), null!));
            Assert.Throws<ArgumentNullException>(() => UnitStack.DisplayOrder(null!, 1));
            Assert.Throws<ArgumentNullException>(() => UnitStack.NextAfter(null!, 1));
            Assert.That(new StackMember(4, 1, BannerSizeClass.Large).Ref.Owner, Is.EqualTo(1));
        }
    }
}
