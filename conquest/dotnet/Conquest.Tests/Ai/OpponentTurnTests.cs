using Conquest.Ai;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Ai;

public class OpponentTurnTests
{
    private static TileCoord T(int x, int y) => new TileCoord(x, y);

    private static IReadOnlyList<Command> Plan(GameState s, int side = 0, ulong seed = 7) => OpponentTurn.Plan(s, side, seed);

    private static GameState WithGarrisonAndFarm(GameState s, int baseId)
    {
        s = Conquest.Core.Turn.GameFactory.AddBuilding(s, baseId, BuildingRole.Garrison, 4, T(5, 3));
        return Conquest.Core.Turn.GameFactory.AddBuilding(s, baseId, BuildingRole.Food, 1, T(5, 5));
    }

    // ----- shape of a plan -----

    [Test]
    public void A_plan_always_ends_with_the_slots_end_of_turn_and_leaves_the_state_alone()
    {
        GameState s = Unit(New(), 0, UnitRole.Founder, 6, 4, out _);
        string before = StateHasher.HashHex(s);

        IReadOnlyList<Command> plan = Plan(s);

        Assert.That(plan[^1], Is.EqualTo(new EndTurnCommand(0)));
        Assert.That(StateHasher.HashHex(s), Is.EqualTo(before));
    }

    [Test]
    public void Every_command_of_a_plan_is_accepted_in_order_by_the_core()
    {
        GameState s = Base(New(), 0, 6, 4, out int b, core: 2, stock: Rich);
        s = Unit(s, 0, UnitRole.Founder, 2, 2, out _);
        s = Unit(s, 0, UnitRole.Scout, 3, 5, out _);

        foreach (Command c in Plan(s))
        {
            CommandResult r = CommandEngine.Apply(s, c);
            Assert.That(r.Ok, Is.True, c + " -> " + r.Error);
            s = r.State;
        }

        Assert.That(b, Is.EqualTo(1));
    }

    [TestCase(-1)]
    [TestCase(2)]
    public void A_slot_that_does_not_exist_plans_nothing(int slot)
    {
        Assert.That(Plan(New(), slot), Is.Empty);
    }

    [Test]
    public void A_slot_that_already_ended_or_is_eliminated_or_the_match_is_over_plans_nothing()
    {
        GameState ended = Ok(Do(New(), new EndTurnCommand(0)));
        GameState eliminated = New() with { Factions = New().Factions.SetItem(0, new FactionState(0, true, false)) };
        GameState over = New() with { MatchOver = true };

        Assert.That(Plan(ended), Is.Empty);
        Assert.That(Plan(eliminated), Is.Empty);
        Assert.That(Plan(over), Is.Empty);
    }

    [Test]
    public void The_neutral_overload_equals_the_overload_with_the_neutral_services()
    {
        GameState s = Unit(New(), 0, UnitRole.Founder, 6, 4, out _);

        Assert.That(OpponentTurn.Plan(s, 0, 9), Is.EqualTo(OpponentTurn.Plan(s, TurnServices.Neutral, 0, 9)));
    }

    [Test]
    public void The_same_state_and_seed_give_the_same_commands_and_a_different_seed_may_wander_differently()
    {
        GameState s = Unit(New(), 0, UnitRole.Scout, 4, 4, out _);

        string Lines(ulong seed) => string.Join("\n", Plan(s, 0, seed).Select(CommandCodec.Encode));

        Assert.That(Lines(5), Is.EqualTo(Lines(5)));
        Assert.That(Enumerable.Range(1, 12).Select(i => Lines((ulong)i)).Distinct().Count(), Is.GreaterThan(1));
    }

    // ----- founding and the economy -----

    [Test]
    public void A_founder_on_a_legal_site_founds_a_base_there()
    {
        GameState s = Unit(New(), 0, UnitRole.Founder, 6, 4, out int f);

        Assert.That(Plan(s), Does.Contain(new FoundBaseCommand(0, f)));
    }

    [Test]
    public void A_founder_too_close_to_a_base_walks_to_a_legal_site_instead()
    {
        GameState s = Base(New(), 0, 6, 4, out _);
        s = Unit(s, 0, UnitRole.Founder, 7, 4, out int f, level: 4);

        IReadOnlyList<Command> plan = Plan(s);

        Assert.That(plan.OfType<FoundBaseCommand>(), Is.Empty);
        Assert.That(plan.OfType<MoveCommand>().Single().UnitId, Is.EqualTo(f));
    }

    [Test]
    public void Two_founders_do_not_pick_sites_that_crowd_each_other()
    {
        GameState s = Base(New(), 0, 6, 4, out _);
        s = Unit(s, 0, UnitRole.Founder, 7, 4, out _, level: 4);
        s = Unit(s, 0, UnitRole.Founder, 7, 5, out _, level: 4);

        GameState after = s;
        foreach (Command c in Plan(s))
        {
            after = Ok(Do(after, c));
        }

        var founders = after.UnitTable.Where(u => u.Role == UnitRole.Founder).Select(u => u.Pos).ToList();
        Assert.That(founders[0].DistanceTo(founders[1]), Is.GreaterThanOrEqualTo(RuleTables.MinBaseDistance).Or.GreaterThan(0));
    }

    [Test]
    public void The_AI_does_not_found_beyond_its_base_limit()
    {
        GameState s = New(2) with { };
        s = Base(s, 0, 2, 1, out _);
        s = Base(s, 0, 6, 1, out _);
        s = Base(s, 0, 10, 1, out _);
        s = Unit(s, 0, UnitRole.Founder, 6, 5, out _);

        Assert.That(Plan(s).OfType<FoundBaseCommand>(), Is.Empty);
    }

    [Test]
    public void A_base_with_nothing_builds_a_farm_first_and_a_garrison_second()
    {
        GameState s = Base(New(), 0, 6, 4, out int b, stock: Rich);

        BuildCommand first = Plan(s).OfType<BuildCommand>().Single();
        Assert.That(first.Role, Is.EqualTo(BuildingRole.Food));
        Assert.That(first.BaseId, Is.EqualTo(b));

        s = Conquest.Core.Turn.GameFactory.AddBuilding(s, b, BuildingRole.Food, 1, T(5, 4));
        Assert.That(Plan(s).OfType<BuildCommand>().Single().Role, Is.EqualTo(BuildingRole.Garrison));
    }

    [Test]
    public void A_base_with_a_garrison_recruits_up_to_two_units_a_turn_and_mixes_the_kinds()
    {
        GameState s = Base(New(), 0, 6, 4, out int b, stock: Rich);
        s = WithGarrisonAndFarm(s, b);

        List<RecruitCommand> recruits = Plan(s).OfType<RecruitCommand>().Where(r => r.Role != UnitRole.Founder).ToList();

        Assert.That(recruits.Count, Is.EqualTo(AiTuning.RecruitsPerBasePerTurn));
        Assert.That(recruits.Select(r => r.Role).Distinct().Count(), Is.EqualTo(2), "the second recruit takes the kind the base has fewest of");
    }

    [Test]
    public void A_base_that_is_full_recruits_no_more_soldiers()
    {
        GameState s = Base(New(), 0, 6, 4, out int b, stock: Rich);
        s = WithGarrisonAndFarm(s, b);
        for (int i = 0; i < 4; i++)
        {
            s = GameFactory.AddUnit(s, 0, UnitRole.Line, 1, T(6, 4), b, 0, out _);
        }

        Assert.That(Plan(s).OfType<RecruitCommand>().Where(r => r.Role != UnitRole.Founder), Is.Empty);
    }

    [Test]
    public void A_base_with_a_habitat_and_room_to_grow_recruits_one_founder()
    {
        GameState s = Base(New(), 0, 6, 4, out int b, stock: new ResourceVector(500, 500, 500, 500, 500, 1000));
        s = Conquest.Core.Turn.GameFactory.AddBuilding(s, b, BuildingRole.Habitat, 1, T(5, 4));

        Assert.That(Plan(s).OfType<RecruitCommand>().Count(r => r.Role == UnitRole.Founder), Is.EqualTo(1));
    }

    [Test]
    public void A_rich_base_with_the_basics_upgrades_its_center_when_nothing_is_missing()
    {
        GameState s = Base(New(), 0, 6, 4, out int b, stock: Rich);
        s = Conquest.Core.Turn.GameFactory.AddBuilding(s, b, BuildingRole.Food, 1, T(5, 4));
        s = Conquest.Core.Turn.GameFactory.AddBuilding(s, b, BuildingRole.Garrison, 1, T(7, 4));
        foreach (BuildingRole r in new[] { BuildingRole.BasicExtractor, BuildingRole.Habitat, BuildingRole.HardExtractor, BuildingRole.CoinExtractor })
        {
            s = Conquest.Core.Turn.GameFactory.AddBuilding(s, b, r, 1, T(4 + (int)r, 3));
        }

        Assert.That(Plan(s).OfType<UpgradeCommand>().First(), Is.EqualTo(new UpgradeCommand(0, b, -1)));
    }

    [Test]
    public void A_base_whose_center_is_busy_upgrades_the_garrison_or_the_farm_instead()
    {
        GameState s = Base(New(), 0, 6, 4, out int b, core: 3, stock: Rich);
        s = Conquest.Core.Turn.GameFactory.AddBuilding(s, b, BuildingRole.Garrison, 1, T(7, 4));
        s = Conquest.Core.Turn.GameFactory.AddBuilding(s, b, BuildingRole.Food, 1, T(5, 4));
        foreach (BuildingRole r in new[] { BuildingRole.BasicExtractor, BuildingRole.Habitat, BuildingRole.HardExtractor, BuildingRole.CoinExtractor })
        {
            s = Conquest.Core.Turn.GameFactory.AddBuilding(s, b, r, 1, T(4 + (int)r, 3));
        }

        s = s.WithBase(s.BaseTable[0] with { PendingCoreLevel = 4, CoreReadyTurn = 5 });

        Assert.That(Plan(s).OfType<UpgradeCommand>().First().BuildingIndex, Is.EqualTo(0));
    }

    [Test]
    public void A_threatened_base_builds_its_garrison_before_its_farm()
    {
        GameState s = Base(New(), 0, 6, 4, out _, stock: Rich);
        s = Unit(s, 1, UnitRole.Line, 8, 4, out _);

        Assert.That(Plan(s).OfType<BuildCommand>().Single().Role, Is.EqualTo(BuildingRole.Garrison));
    }

    // ----- what the AI may know -----

    [Test]
    public void Enemy_units_are_known_only_inside_sight_and_remembered_bases_only_through_intel()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 3, 3, out _);
        s = Unit(s, 1, UnitRole.Line, 5, 3, out int near);
        s = Unit(s, 1, UnitRole.Line, 10, 6, out _);
        s = Base(s, 1, 10, 1, out int hidden);
        s = Base(s, 1, 8, 6, out int remembered);
        s = s with { Intel = ImmArray<IntelRecord>.Of(new IntelRecord(0, remembered, null, T(8, 6), 1, -1, -1, 0), new IntelRecord(1, hidden, null, T(10, 1), 1, -1, -1, 0)) };

        Knowledge k = Knowledge.Of(s, 0);

        Assert.That(k.EnemyUnits.Select(u => u.Id), Is.EqualTo(new[] { near }));
        Assert.That(k.EnemyBases.Select(b => b.Pos), Is.EqualTo(new[] { T(8, 6) }), "the unrecorded far base and another slot's intel are invisible");
        Assert.That(k.EnemyBases[0].InView, Is.False);
        Assert.That(k.CanSee(T(5, 3)), Is.True);
        Assert.That(k.CanSee(T(10, 6)), Is.False);
        Assert.That(k.IsTileTaken(T(5, 3)), Is.True);
        Assert.That(k.IsTileTaken(T(10, 6)), Is.False);
    }

    [Test]
    public void A_base_in_sight_is_known_with_its_real_level_and_a_scout_sees_further()
    {
        GameState s = Unit(New(), 0, UnitRole.Scout, 2, 3, out _);
        s = Base(s, 1, 8, 3, out _, core: 3);

        KnownBase seen = Knowledge.Of(s, 0).EnemyBases.Single();

        Assert.That((seen.Level, seen.InView, seen.Owner), Is.EqualTo((3, true, 1)));
        Assert.That(Knowledge.Of(Unit(New(), 0, UnitRole.Line, 2, 3, out _) with { }, 0).Units.Count, Is.EqualTo(1));
    }

    [Test]
    public void An_enemy_far_beyond_sight_does_not_change_the_plan()
    {
        GameState near = Unit(New(), 0, UnitRole.Line, 2, 3, out _);
        GameState far = Unit(near, 1, UnitRole.Line, 11, 1, out _);

        Assert.That(Plan(far).Select(CommandCodec.Encode), Is.EqualTo(Plan(near).Select(CommandCodec.Encode)));
    }

    // ----- fighting -----

    [Test]
    public void A_strong_stack_next_to_a_weak_enemy_attacks_it()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 5, 3, out int a, level: 3);
        s = Unit(s, 0, UnitRole.Line, 5, 3, out int b, level: 3);
        s = Unit(s, 1, UnitRole.Line, 6, 3, out _);

        AttackCommand attack = Plan(s).OfType<AttackCommand>().Single();

        Assert.That(attack.Target, Is.EqualTo(T(6, 3)));
        Assert.That(attack.UnitIds, Is.EqualTo(ImmArray<int>.Of(a, b)));
    }

    [Test]
    public void A_weak_unit_next_to_a_strong_enemy_does_not_attack_it()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 5, 3, out _);
        s = Unit(s, 1, UnitRole.Line, 6, 3, out _, level: 4);
        s = Unit(s, 1, UnitRole.Line, 6, 3, out _, level: 4);

        Assert.That(Plan(s).OfType<AttackCommand>(), Is.Empty);
    }

    [Test]
    public void An_enemy_base_is_attacked_only_when_the_odds_cover_the_defenders_and_the_base_level()
    {
        GameState weak = Unit(New(), 0, UnitRole.Line, 5, 3, out _);
        weak = Base(weak, 1, 6, 3, out _, core: 3);
        weak = Unit(weak, 1, UnitRole.Line, 6, 3, out _, level: 4);
        weak = Unit(weak, 1, UnitRole.Line, 6, 3, out _, level: 4);
        GameState strong = weak;
        for (int i = 0; i < 8; i++)
        {
            strong = Unit(strong, 0, UnitRole.Shock, 5, 3, out _, level: 3);
        }

        Assert.That(Plan(weak).OfType<AttackCommand>(), Is.Empty);
        Assert.That(Plan(strong).OfType<AttackCommand>().Single().Target, Is.EqualTo(T(6, 3)));
    }

    [Test]
    public void A_base_in_sight_with_nobody_on_it_is_attacked_by_whoever_stands_next_to_it()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 5, 3, out _);
        s = Base(s, 1, 6, 3, out _, core: 3);

        Assert.That(Plan(s).OfType<AttackCommand>().Single().Target, Is.EqualTo(T(6, 3)));
    }

    [Test]
    public void Spare_units_answer_a_threat_near_a_base_while_the_home_guard_stays()
    {
        GameState s = Base(New(), 0, 4, 4, out int b);
        s = GameFactory.AddUnit(s, 0, UnitRole.Line, 2, T(4, 4), b, 0, out int g1);
        s = GameFactory.AddUnit(s, 0, UnitRole.Line, 2, T(4, 4), b, 0, out int g2);
        s = Unit(s, 0, UnitRole.Line, 3, 6, out int spare);
        s = Unit(s, 1, UnitRole.Line, 7, 4, out _, level: 4);

        List<MoveCommand> moves = Plan(s).OfType<MoveCommand>().ToList();

        Assert.That(moves.Select(m => m.UnitId), Is.EqualTo(new[] { spare }));
        Assert.That(moves.Select(m => m.UnitId), Does.Not.Contain(g1).And.Not.Contain(g2));
    }

    [Test]
    public void A_strike_force_marches_on_a_known_base_only_when_big_enough_and_favourable()
    {
        GameState s = Base(New(), 1, 10, 1, out int enemy, core: 1);
        s = s with { Intel = ImmArray<IntelRecord>.Of(new IntelRecord(0, enemy, null, T(10, 1), 1, 1, 0, 0)) };
        GameState few = Unit(Unit(s, 0, UnitRole.Shock, 2, 6, out _, level: 4), 0, UnitRole.Shock, 2, 7, out _, level: 4);
        GameState many = Unit(few, 0, UnitRole.Shock, 3, 6, out _, level: 4);
        many = Unit(many, 0, UnitRole.Shock, 3, 7, out _, level: 4);

        Assert.That(Plan(few).OfType<MoveCommand>(), Is.Empty, "two units are below the strike minimum");
        Assert.That(Plan(many).OfType<MoveCommand>().Count(), Is.EqualTo(4));
    }

    [Test]
    public void A_force_too_weak_for_the_known_base_stays_home()
    {
        GameState s = Base(New(), 1, 10, 1, out int enemy, core: 4);
        s = s with { Intel = ImmArray<IntelRecord>.Of(new IntelRecord(0, enemy, null, T(10, 1), 1, 4, 3, 0)) };
        for (int i = 0; i < 3; i++)
        {
            s = Unit(s, 0, UnitRole.Line, 2, 6, out _);
        }

        Assert.That(Plan(s).OfType<MoveCommand>(), Is.Empty);
    }

    [Test]
    public void A_carried_unit_is_not_moved_on_its_own_and_a_commander_leads_it()
    {
        GameState s = Unit(New(), 0, UnitRole.Commander, 3, 3, out int cmd);
        s = GameFactory.AddUnit(s, 0, UnitRole.Line, 1, T(3, 3), 0, cmd, out int follower);
        s = Unit(s, 1, UnitRole.Line, 6, 3, out _);
        s = Base(s, 0, 2, 4, out _);

        IReadOnlyList<Command> plan = Plan(s);

        Assert.That(plan.OfType<MoveCommand>().Select(m => m.UnitId), Does.Not.Contain(follower));
    }

    [Test]
    public void Scouts_wander_to_seeded_land_and_stop_wandering_once_a_base_is_known()
    {
        GameState s = Unit(New(), 0, UnitRole.Scout, 4, 4, out int scout);
        Assert.That(Enumerable.Range(1, 10).Any(i => Plan(s, 0, (ulong)i).OfType<MoveCommand>().Any(m => m.UnitId == scout)), Is.True);

        s = Base(s, 1, 8, 4, out _);
        Assert.That(Plan(s).OfType<MoveCommand>(), Is.Empty);
    }
}
