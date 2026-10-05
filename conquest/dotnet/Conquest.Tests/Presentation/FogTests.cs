using Conquest.Ai;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Presentation;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Presentation;

public class FogTests
{
    private static bool HasUnit(GameState s, int id) => s.FindUnitIndex(id) >= 0;

    [Test]
    public void An_enemy_unit_is_seen_exactly_at_the_vision_radius_and_not_one_tile_further()
    {
        GameState s = New(2, 7);
        s = Unit(s, 0, UnitRole.Line, 1, 3, out _);
        s = Unit(s, 1, UnitRole.Line, 1 + SightRules.VisionRadius, 3, out int near);
        s = Unit(s, 1, UnitRole.Line, 2 + SightRules.VisionRadius, 3, out int far);

        FogView fog = FogView.Of(s, 0);

        Assert.That(fog.CanSeeUnit(s.UnitTable[s.FindUnitIndex(near)]), Is.True);
        Assert.That(fog.CanSeeUnit(s.UnitTable[s.FindUnitIndex(far)]), Is.False);
    }

    [Test]
    public void A_scout_sees_further_than_other_units()
    {
        GameState s = New(2, 7);
        s = Unit(s, 0, UnitRole.Scout, 1, 3, out _);
        s = Unit(s, 1, UnitRole.Line, SightRules.ScoutVisionRadius + 1, 3, out int seen);
        s = Unit(s, 1, UnitRole.Line, SightRules.ScoutVisionRadius + 2, 3, out int hidden);

        FogView fog = FogView.Of(s, 0);

        Assert.That(fog.CanSeeUnit(s.UnitTable[s.FindUnitIndex(seen)]), Is.True);
        Assert.That(fog.CanSeeUnit(s.UnitTable[s.FindUnitIndex(hidden)]), Is.False);
    }

    [Test]
    public void A_base_of_the_viewer_gives_sight_and_the_viewers_own_things_are_never_hidden()
    {
        GameState s = New(2, 7);
        s = Base(s, 0, 1, 1, out _);
        s = Unit(s, 0, UnitRole.Line, 10, 7, out int farOwn);
        s = Unit(s, 1, UnitRole.Line, 1 + SightRules.VisionRadius, 1, out int enemy);

        FogView fog = FogView.Of(s, 0);

        Assert.That(fog.CanSeeUnit(s.UnitTable[s.FindUnitIndex(farOwn)]), Is.True, "own units are always visible");
        Assert.That(fog.CanSeeUnit(s.UnitTable[s.FindUnitIndex(enemy)]), Is.True, "own base sees");
    }

    [Test]
    public void The_sight_of_the_viewer_is_the_sight_of_the_opponents_knowledge_view_on_every_tile()
    {
        GameState s = New(2, 7);
        s = Unit(s, 0, UnitRole.Scout, 2, 2, out _);
        s = Unit(s, 0, UnitRole.Line, 9, 5, out _);
        s = Base(s, 0, 4, 5, out _);
        s = Unit(s, 1, UnitRole.Line, 5, 4, out _);

        FogView fog = FogView.Of(s, 0);
        Knowledge knowledge = Knowledge.Of(s, 0);

        for (int y = 0; y < s.Height; y++)
        {
            for (int x = 0; x < s.Width; x++) Assert.That(fog.IsVisible(x, y), Is.EqualTo(knowledge.CanSee(new TileCoord(x, y))), x + "," + y);
        }
    }

    [Test]
    public void The_masked_state_has_no_unseen_enemy_unit_base_building_or_queued_attack()
    {
        GameState s = New(2, 7);
        s = Unit(s, 0, UnitRole.Line, 1, 3, out int mine);
        s = Unit(s, 1, UnitRole.Line, 2, 3, out int seen);
        s = Unit(s, 1, UnitRole.Line, 10, 3, out int hidden);
        s = Base(s, 1, 10, 6, out int hiddenBase);
        s = s with { Attacks = ImmArray<AttackOrder>.From(new[] { new AttackOrder(1, ImmArray<int>.From(new[] { hidden }), new TileCoord(1, 3)) }) };

        GameState known = FogView.Of(s, 0).Mask(s);

        Assert.That(HasUnit(known, mine), Is.True);
        Assert.That(HasUnit(known, seen), Is.True);
        Assert.That(HasUnit(known, hidden), Is.False);
        Assert.That(known.FindBaseIndex(hiddenBase), Is.LessThan(0));
        Assert.That(known.Attacks.Count, Is.EqualTo(0), "the enemy's queued attack is not the viewer's to know");
        Assert.That(HasUnit(s, hidden), Is.True, "masking never changes the real state");
    }

    [Test]
    public void An_enemy_base_seen_is_remembered_when_sight_is_lost_and_forgotten_when_its_tile_is_seen_empty()
    {
        GameState s = New(2, 7);
        s = Unit(s, 0, UnitRole.Line, 6, 3, out int watcher);
        s = Base(s, 1, 9, 3, out int enemyBase);
        FogView fog = FogView.Of(s, 0);
        IntelMemory memory = IntelMemory.Empty.Observe(fog, s);
        Assert.That(memory.Records.Count, Is.EqualTo(1));
        Assert.That(memory.OutOfSight(fog), Is.Empty, "in sight it is drawn live, not from memory");

        GameState away = s with { UnitTable = ImmArray<Unit>.From(new[] { s.UnitTable[s.FindUnitIndex(watcher)] with { Pos = new TileCoord(1, 7) } }) };
        FogView awayFog = FogView.Of(away, 0);
        IntelMemory kept = memory.Observe(awayFog, away);
        Assert.That(kept.OutOfSight(awayFog).Count, Is.EqualTo(1));
        Assert.That(kept.OutOfSight(awayFog)[0].BaseId, Is.EqualTo(enemyBase));
        Assert.That(kept.OutOfSight(awayFog)[0].TurnSeen, Is.EqualTo(s.Turn));

        GameState razed = s with { BaseTable = ImmArray<Base>.From(new Base[0]) };
        IntelMemory forgotten = kept.Observe(FogView.Of(razed, 0), razed);
        Assert.That(forgotten.Records, Is.Empty);
    }

    [Test]
    public void Memory_never_holds_the_viewers_own_bases()
    {
        GameState s = New(2, 7);
        s = Base(s, 0, 3, 3, out _);
        IntelMemory memory = IntelMemory.Empty.Observe(FogView.Of(s, 0), s);
        Assert.That(memory.Records, Is.Empty);
    }
}
