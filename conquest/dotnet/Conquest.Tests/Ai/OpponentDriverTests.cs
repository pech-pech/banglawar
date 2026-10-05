using Conquest.Ai;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Ai;

public class OpponentDriverTests
{
    private static GameState Setup(int slots)
    {
        GameState s = New(slots);
        for (int slot = 0; slot < slots; slot++)
        {
            s = Base(s, slot, 2 + slot * 4, 3, out _, stock: Rich);
            s = Unit(s, slot, UnitRole.Founder, 3 + slot * 4, 5, out _);
        }

        return s;
    }

    [Test]
    public void Ending_the_humans_turn_lets_the_opponent_act_first_and_then_resolves_the_turn()
    {
        GameState s = Setup(2);

        DriverResult r = OpponentDriver.EndTurnWithOpponents(s, TurnServices.Neutral, 0, new[] { 1 }, 11);

        Assert.That(r.Rejected, Is.EqualTo(0));
        Assert.That(r.State.Turn, Is.EqualTo(s.Turn + 1));
        Assert.That(r.Commands.OfType<BuildCommand>().Any(c => c.Slot == 1), Is.True, "the opponent built something");
        Assert.That(r.Commands[^1], Is.EqualTo(new EndTurnCommand(0)), "the human's end of turn is applied last");
        Assert.That(r.Commands.ToList().IndexOf(new EndTurnCommand(1)), Is.LessThan(r.Commands.Count - 1));
        Assert.That(r.Events.OfType<TurnEnded>().Count(), Is.EqualTo(1));
    }

    [Test]
    public void The_driver_matches_playing_the_planned_commands_by_hand()
    {
        GameState s = Setup(2);

        DriverResult driven = OpponentDriver.EndTurnWithOpponents(s, TurnServices.Neutral, 0, new[] { 1 }, 11);

        GameState byHand = s;
        foreach (Command c in OpponentTurn.Plan(s, 1, 11))
        {
            byHand = Ok(Do(byHand, c));
        }

        byHand = Ok(Do(byHand, new EndTurnCommand(0)));
        Assert.That(StateHasher.HashHex(driven.State), Is.EqualTo(StateHasher.HashHex(byHand)));
    }

    [Test]
    public void A_listed_ending_slot_is_not_played_for_it_and_a_slot_that_already_ended_is_counted_as_refused()
    {
        GameState s = Setup(3);
        s = Ok(Do(s, new EndTurnCommand(0)));

        DriverResult r = OpponentDriver.EndTurnWithOpponents(s, TurnServices.Neutral, 0, new[] { 0, 1 }, 3);

        Assert.That(r.Rejected, Is.EqualTo(1), "slot 0 cannot end twice");
        Assert.That(r.State.Turn, Is.EqualTo(s.Turn), "slot 2 has not ended, so the turn is still open");
        Assert.That(r.Commands.Any(c => c.Slot == 1), Is.True);
    }

    [Test]
    public void Play_all_drives_every_listed_slot_and_resolves_the_turn()
    {
        GameState s = Setup(2);

        DriverResult r = OpponentDriver.PlayAll(s, TurnServices.Neutral, new[] { 0, 1 }, 5);

        Assert.That(r.Rejected, Is.EqualTo(0));
        Assert.That(r.State.Turn, Is.EqualTo(s.Turn + 1));
        Assert.That(r.Commands.Where(c => c is EndTurnCommand).Count(), Is.EqualTo(2));
    }

    [Test]
    public void The_driver_reports_a_refused_command_instead_of_throwing()
    {
        GameState s = Setup(2);
        IReadOnlyList<Command> plan = new Command[] { new MoveCommand(1, 999, new TileCoord(1, 1)), new EndTurnCommand(1) };

        DriverResult r = (DriverResult)typeof(OpponentDriver)
            .GetMethod("Apply", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!
            .Invoke(null, new object[] { s, TurnServices.Neutral, plan })!;

        Assert.That(r.Rejected, Is.EqualTo(1));
        Assert.That(r.Commands.Count, Is.EqualTo(1));
    }

    [Test]
    public void A_finished_match_gives_an_empty_plan_and_an_unchanged_state()
    {
        GameState s = Setup(2) with { MatchOver = true, WinnerSlot = 0 };

        DriverResult r = OpponentDriver.PlayTurn(s, TurnServices.Neutral, 1, 1);

        Assert.That(r.Commands, Is.Empty);
        Assert.That(r.State, Is.SameAs(s));
    }

    [Test]
    public void The_presentation_hook_returns_the_orders_without_an_end_of_turn_and_they_are_all_accepted()
    {
        GameState s = Setup(2);
        Conquest.Presentation.IOpponentTurn hook = new AiOpponentTurn(4);

        IReadOnlyList<Command> orders = hook.Plan(1, s, TurnServices.Neutral);

        Assert.That(orders, Is.Not.Empty);
        Assert.That(orders.OfType<EndTurnCommand>(), Is.Empty);
        Assert.That(orders, Is.EqualTo(OpponentTurn.Plan(s, 1, 4).Take(orders.Count)));
        foreach (Command c in orders)
        {
            s = Ok(Do(s, c));
        }
    }
}

