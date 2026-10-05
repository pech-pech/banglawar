using Conquest.Core;
using Conquest.Core.Combat;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Presentation;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Presentation;

public class AttackPreviewTests
{
    private static TurnServices Services => new TurnServices(new CombatResolver(new CombatResolverOptions()));

    /// <summary>Slot 0 stands at (5,5) with the given line units; slot 1 holds (6,5).</summary>
    private static GameState Field(int ownLevel, int ownCount, int foeLevel, int foeCount, out int[] ownIds)
    {
        GameState s = New(2, 7);
        var ids = new List<int>();
        for (int i = 0; i < ownCount; i++)
        {
            s = Unit(s, 0, UnitRole.Line, 5, 5, out int id, ownLevel);
            ids.Add(id);
        }

        for (int i = 0; i < foeCount; i++) s = Unit(s, 1, UnitRole.Line, 6, 5, out _, foeLevel);
        ownIds = ids.ToArray();
        return s;
    }

    [Test]
    public void An_adjacent_stack_can_be_ordered_and_the_preview_lists_the_attackers_and_the_target()
    {
        GameState s = Field(2, 2, 1, 1, out int[] own);

        AttackPreview p = AttackPreview.Build(s, Services, 0, own, new GridPos(6, 5));

        Assert.That(p.Valid, Is.True, p.ErrorCode);
        Assert.That(p.AttackerIds, Is.EqualTo(own.OrderBy(i => i).ToArray()));
        Assert.That(p.AttackerStrength, Is.EqualTo(4));
        Assert.That(p.DefenderCount, Is.EqualTo(1));
        Assert.That(p.DefenderStrength, Is.EqualTo(1));
        Assert.That(p.TargetIsBase, Is.False);
        Assert.That(p.Samples, Is.EqualTo(AttackPreview.DefaultSamples));
    }

    [Test]
    public void A_strong_attacker_reads_likely_and_a_weak_one_unlikely()
    {
        GameState strong = Field(4, 4, 1, 1, out int[] a);
        GameState weak = Field(1, 1, 4, 4, out int[] b);

        AttackPreview likely = AttackPreview.Build(strong, Services, 0, a, new GridPos(6, 5));
        AttackPreview unlikely = AttackPreview.Build(weak, Services, 0, b, new GridPos(6, 5));

        Assert.That(likely.Outlook, Is.EqualTo(AttackOutlook.Likely), "win " + likely.WinPermille);
        Assert.That(unlikely.Outlook, Is.EqualTo(AttackOutlook.Unlikely), "win " + unlikely.WinPermille);
        Assert.That(likely.WinPermille, Is.GreaterThan(unlikely.WinPermille));
        Assert.That(likely.ExpectedOpposingLoss, Is.GreaterThan(0));
    }

    [Test]
    public void The_estimate_is_repeatable_and_changes_nothing()
    {
        GameState s = Field(2, 2, 2, 2, out int[] own);
        string before = StateHasher.HashHex(s);

        AttackPreview one = AttackPreview.Build(s, Services, 0, own, new GridPos(6, 5));
        AttackPreview two = AttackPreview.Build(s, Services, 0, own, new GridPos(6, 5));

        Assert.That(two.WinPermille, Is.EqualTo(one.WinPermille));
        Assert.That(two.ExpectedOwnLoss, Is.EqualTo(one.ExpectedOwnLoss));
        Assert.That(two.ExpectedOpposingLoss, Is.EqualTo(one.ExpectedOpposingLoss));
        Assert.That(StateHasher.HashHex(s), Is.EqualTo(before), "the real random state is not consumed");
    }

    [Test]
    public void Units_out_of_reach_or_unable_to_attack_are_left_out_and_the_core_names_the_reason()
    {
        GameState s = Field(1, 1, 1, 1, out int[] own);
        s = Unit(s, 0, UnitRole.Line, 1, 1, out int far);
        s = Unit(s, 0, UnitRole.Scout, 5, 4, out int scout);

        AttackPreview mixed = AttackPreview.Build(s, Services, 0, new[] { own[0], far, scout }, new GridPos(6, 5));
        AttackPreview onlyFar = AttackPreview.Build(s, Services, 0, new[] { far }, new GridPos(6, 5));
        AttackPreview onlyScout = AttackPreview.Build(s, Services, 0, new[] { scout }, new GridPos(6, 5));

        Assert.That(mixed.AttackerIds, Is.EqualTo(new[] { own[0] }));
        Assert.That(onlyFar.Valid, Is.False);
        Assert.That(onlyFar.ErrorCode, Is.EqualTo(Err.OutOfReach));
        Assert.That(onlyScout.ErrorCode, Is.EqualTo(Err.WrongRole));
    }

    [Test]
    public void Empty_and_friendly_tiles_are_refused_with_the_cores_codes()
    {
        GameState s = Field(1, 1, 1, 1, out int[] own);
        s = Unit(s, 0, UnitRole.Line, 4, 5, out _);

        Assert.That(AttackPreview.Build(s, Services, 0, own, new GridPos(5, 6)).ErrorCode, Is.EqualTo(Err.NoTarget));
        Assert.That(AttackPreview.Build(s, Services, 0, own, new GridPos(4, 5)).ErrorCode, Is.EqualTo(Err.FriendlyTarget));
        Assert.That(AttackPreview.Build(s, Services, 0, Array.Empty<int>(), new GridPos(6, 5)).ErrorCode, Is.EqualTo(Err.NoUnits));
    }

    [Test]
    public void An_opposing_base_is_a_target_even_with_nobody_standing_on_it()
    {
        GameState s = New(2, 7);
        s = Unit(s, 0, UnitRole.Line, 5, 4, out int id, 3);
        s = Base(s, 1, 6, 4, out _, core: 1, stock: Rich);

        AttackPreview p = AttackPreview.Build(s, Services, 0, new[] { id }, new GridPos(6, 4));

        Assert.That(AttackPreview.HasOpposingTarget(s, 0, new GridPos(6, 4)), Is.True);
        Assert.That(p.Valid, Is.True, p.ErrorCode);
        Assert.That(p.TargetIsBase, Is.True);
        Assert.That(p.DefenderCount, Is.EqualTo(0));
    }

    [Test]
    public void Without_a_resolver_the_order_is_valid_but_there_is_no_estimate()
    {
        GameState s = Field(1, 1, 1, 1, out int[] own);

        AttackPreview p = AttackPreview.Build(s, TurnServices.Neutral, 0, own, new GridPos(6, 5));

        Assert.That(p.Valid, Is.True);
        Assert.That(p.Outlook, Is.EqualTo(AttackOutlook.Unknown));
        Assert.That(p.Samples, Is.EqualTo(0));
    }

    [Test]
    public void Opposing_target_detection_ignores_friends_and_empty_or_outside_tiles()
    {
        GameState s = Field(1, 1, 1, 1, out _);

        Assert.That(AttackPreview.HasOpposingTarget(s, 0, new GridPos(6, 5)), Is.True);
        Assert.That(AttackPreview.HasOpposingTarget(s, 0, new GridPos(5, 5)), Is.False);
        Assert.That(AttackPreview.HasOpposingTarget(s, 0, new GridPos(2, 2)), Is.False);
        Assert.That(AttackPreview.HasOpposingTarget(s, 0, new GridPos(-1, 40)), Is.False);
    }
}
