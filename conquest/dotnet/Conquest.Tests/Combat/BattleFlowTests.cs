using Conquest.Core.Combat;
using static Conquest.Tests.Combat.BattleTestKit;

namespace Conquest.Tests.Combat
{
    public class BattleFlowTests
    {
        private const BattleSide A = BattleSide.Attacker;
        private const BattleSide D = BattleSide.Defender;

        [Test]
        public void EndTurnPassesTheTurnAndRoundCountsAfterTheDefender()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 1), Unit(2, D, UnitKind.Line, 3, 2, 2));

            BattleState defenders = Apply(s, BattleAction.EndTurn());
            BattleState again = Apply(defenders, BattleAction.EndTurn());

            Assert.That(defenders.ToAct, Is.EqualTo(D));
            Assert.That(defenders.Round, Is.EqualTo(1));
            Assert.That(again.ToAct, Is.EqualTo(A));
            Assert.That(again.Round, Is.EqualTo(2));
        }

        [Test]
        public void EndTurnResetsTheFlagsOfTheSideThatActed()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 0), Unit(2, D, UnitKind.Line, 3, 2, 3));
            BattleState moved = Apply(s, BattleAction.Move(1, 0, 1));

            BattleState next = Apply(moved, BattleAction.EndTurn());

            Assert.That(next.Find(1)!.MovedSteps, Is.EqualTo(0));
            Assert.That(next.AttacksUsed, Is.EqualTo(0));
        }

        [Test]
        public void APanicFlagLastsThroughOwnNextTurnThenClears()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 1), Unit(2, D, UnitKind.Line, 5, 0, 2), Reserve(9, D, UnitKind.Line, 3));
            BattleState panicked = Apply(s, BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHitAlwaysPanic);
            Assert.That(panicked.Find(2)!.Panicked, Is.True);

            BattleState defendersTurn = Apply(panicked, BattleAction.EndTurn(), AlwaysHit);
            Assert.That(defendersTurn.Find(2)!.Panicked, Is.True, "still counts as panicked while it acts");

            BattleState after = Apply(defendersTurn, BattleAction.EndTurn(), AlwaysHit);
            Assert.That(after.Find(2)!.Panicked, Is.False);
        }

        [Test]
        public void TheDefenderHoldsWhenTheRoundCapIsReached()
        {
            CombatRules capped = new CombatRules(roundCap: 2);
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 0), Unit(2, D, UnitKind.Line, 3, 2, 3));

            BattleState end = s;
            for (int i = 0; i < 4; i++)
            {
                end = Apply(end, BattleAction.EndTurn(), capped);
            }

            Assert.That(end.Outcome!.Winner, Is.EqualTo(D));
            Assert.That(end.Outcome.Reason, Is.EqualTo(OutcomeReason.RoundCap));
        }

        [Test]
        public void RetreatGivesTheEnemyOneBasicParkingShotAndTheBattle()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Line, 5, 0, 1, 5),
                Unit(2, D, UnitKind.Line, 2, 0, 2),
                Unit(3, D, UnitKind.Ranged, 1, 2, 3));

            BattleStepResult r = BattleEngine.Apply(s, BattleAction.Retreat(), AlwaysHit, new SplitMix64(4));

            Assert.That(r.Ok, Is.True);
            Assert.That(r.State.Outcome!.Winner, Is.EqualTo(D));
            Assert.That(r.State.Outcome.Reason, Is.EqualTo(OutcomeReason.Retreated));
            Assert.That(r.State.Find(1)!.Strength, Is.EqualTo(5 - 3), "three strength points, three shots, one hit each");
        }

        [Test]
        public void ParkingShotCanWipeOutTheRetreatingSideAndStillCountsAsRetreat()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 1, 0, 1), Unit(2, D, UnitKind.Line, 3, 0, 2));
            BattleState r = Apply(s, BattleAction.Retreat(), AlwaysHit);

            Assert.That(r.Find(1), Is.Null);
            Assert.That(r.Outcome!.Winner, Is.EqualTo(D));
        }

        [Test]
        public void RetreatWithNothingOnTheBoardStillEndsTheBattle()
        {
            BattleState s = State(Reserve(1, A, UnitKind.Line, 3), Reserve(2, D, UnitKind.Line, 3));
            BattleState r = Apply(s, BattleAction.Retreat());
            Assert.That(r.Outcome!.Reason, Is.EqualTo(OutcomeReason.Retreated));
        }

        [Test]
        public void ActionsAfterTheEndAreRefused()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 1, 2), Reserve(9, D, UnitKind.Line, 3));
            BattleState won = Apply(s, BattleAction.Move(1, 1, 3));

            Assert.That(Fail(won, BattleAction.Retreat()), Is.EqualTo("err.battle_over"));
            Assert.That(Fail(won, BattleAction.Move(1, 1, 2)), Is.EqualTo("err.battle_over"));
        }

        [Test]
        public void SameStateActionAndDiceGiveTheSameResult()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 1), Unit(2, D, UnitKind.Line, 5, 0, 2), Reserve(9, D, UnitKind.Line, 3));
            BattleAction attack = BattleAction.Attack(new[] { 1 }, 0, 2);

            BattleStepResult a = BattleEngine.Apply(s, attack, Default, new SplitMix64(11));
            BattleStepResult b = BattleEngine.Apply(s, attack, Default, new SplitMix64(11));

            Assert.That(a.State.Find(2)?.Strength, Is.EqualTo(b.State.Find(2)?.Strength));
            Assert.That(a.Dice.State, Is.EqualTo(b.Dice.State));
            Assert.That(s.Find(2)!.Strength, Is.EqualTo(5), "input state is never mutated");
        }

        [Test]
        public void FailedActionsLeaveTheDiceUntouched()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 1), Reserve(9, D, UnitKind.Line, 3));
            SplitMix64 dice = new SplitMix64(5);

            BattleStepResult r = BattleEngine.Apply(s, BattleAction.Attack(new[] { 1 }, 0, 2), Default, dice);

            Assert.That(r.Ok, Is.False);
            Assert.That(r.Dice.State, Is.EqualTo(dice.State));
        }

        [Test]
        public void FactoryPlacesEveryUnitInReservesSortedById()
        {
            BattleState s = BattleFactory.Create(
                new[] { new BattleUnitSpec(5, UnitKind.Line, 2), new BattleUnitSpec(3, UnitKind.Ranged, 2, generated: true) },
                new SideInfo(),
                new[] { new BattleUnitSpec(9, UnitKind.Shock, 4) },
                new SideInfo());

            Assert.That(s.Units.Select(u => u.Id), Is.EqualTo(new[] { 3, 5, 9 }));
            Assert.That(s.Units.All(u => !u.OnBoard), Is.True);
            Assert.That(s.Find(3)!.Generated, Is.True);
            Assert.That(s.Find(9)!.Side, Is.EqualTo(D));
            Assert.That(s.ToAct, Is.EqualTo(A));
            Assert.That(s.Round, Is.EqualTo(1));
        }

        [Test]
        public void FactoryRejectsDuplicateIdsAndBadStrength()
        {
            Assert.Throws<ArgumentException>(() => BattleFactory.Create(
                new[] { new BattleUnitSpec(1, UnitKind.Line, 2) }, new SideInfo(),
                new[] { new BattleUnitSpec(1, UnitKind.Line, 2) }, new SideInfo()));
            Assert.Throws<ArgumentException>(() => BattleFactory.Create(
                new[] { new BattleUnitSpec(1, UnitKind.Line, 0) }, new SideInfo(),
                new[] { new BattleUnitSpec(2, UnitKind.Line, 2) }, new SideInfo()));
        }
    }

    public class BattleAutoPlayerTests
    {
        private static BattleState Setup(int attackerStrength, int defenderStrength)
        {
            return BattleFactory.Create(
                new[] { new BattleUnitSpec(1, UnitKind.Line, attackerStrength), new BattleUnitSpec(2, UnitKind.Line, attackerStrength), new BattleUnitSpec(3, UnitKind.Ranged, attackerStrength), new BattleUnitSpec(4, UnitKind.Shock, attackerStrength) },
                new SideInfo(new CommanderStats(3, 4, 0)),
                new[] { new BattleUnitSpec(11, UnitKind.Line, defenderStrength), new BattleUnitSpec(12, UnitKind.Line, defenderStrength), new BattleUnitSpec(13, UnitKind.Ranged, defenderStrength), new BattleUnitSpec(14, UnitKind.Shock, defenderStrength) },
                new SideInfo(new CommanderStats(3, 4, 0)));
        }

        [Test]
        public void EveryBattleEndsByTheRoundCap()
        {
            for (ulong seed = 1; seed <= 60; seed++)
            {
                BattleStepResult r = BattleAutoPlayer.Resolve(Setup(3, 3), CombatRules.Default, new SplitMix64(seed));
                Assert.That(r.Ok, Is.True, "seed " + seed);
                Assert.That(r.State.Outcome, Is.Not.Null, "seed " + seed);
                Assert.That(r.State.Round, Is.LessThanOrEqualTo(CombatRules.Default.RoundCap));
            }
        }

        [Test]
        public void ResolveIsDeterministicForASeed()
        {
            BattleStepResult a = BattleAutoPlayer.Resolve(Setup(3, 3), CombatRules.Default, new SplitMix64(77));
            BattleStepResult b = BattleAutoPlayer.Resolve(Setup(3, 3), CombatRules.Default, new SplitMix64(77));

            Assert.That(a.State.Outcome!.Winner, Is.EqualTo(b.State.Outcome!.Winner));
            Assert.That(a.State.Round, Is.EqualTo(b.State.Round));
            Assert.That(a.Dice.State, Is.EqualTo(b.Dice.State));
            Assert.That(a.State.Units.Select(u => (u.Id, u.Strength, u.Col, u.Row)), Is.EqualTo(b.State.Units.Select(u => (u.Id, u.Strength, u.Col, u.Row))));
        }

        [Test]
        public void TheStrongerArmyWinsMostBattles()
        {
            int strongWins = 0;
            for (ulong seed = 1; seed <= 60; seed++)
            {
                BattleStepResult r = BattleAutoPlayer.Resolve(Setup(5, 1), CombatRules.Default, new SplitMix64(seed));
                if (r.State.Outcome!.Winner == BattleSide.Attacker)
                {
                    strongWins++;
                }
            }

            Assert.That(strongWins, Is.GreaterThan(45));
        }

        [Test]
        public void PlayTurnEntersReservesAndPassesTheTurn()
        {
            BattleStepResult r = BattleAutoPlayer.PlayTurn(Setup(3, 3), CombatRules.Default, new SplitMix64(2));

            Assert.That(r.Ok, Is.True);
            Assert.That(r.State.ToAct, Is.EqualTo(BattleSide.Defender));
            Assert.That(r.State.Units.Count(u => u.Side == BattleSide.Attacker && u.OnBoard), Is.GreaterThan(0));
            Assert.That(r.State.Units.Where(u => u.OnBoard).All(u => u.Row == 0), Is.True);
        }

        [Test]
        public void PlayTurnOnAFinishedBattleDoesNothing()
        {
            BattleStepResult done = BattleAutoPlayer.Resolve(Setup(5, 1), CombatRules.Default, new SplitMix64(1));
            BattleStepResult again = BattleAutoPlayer.PlayTurn(done.State, CombatRules.Default, done.Dice);

            Assert.That(again.State, Is.SameAs(done.State));
        }

        [Test]
        public void AUnitWithNothingToAttackAdvancesTowardTheFlag()
        {
            BattleState s = BattleTestKit.State(
                BattleTestKit.Unit(1, BattleSide.Attacker, UnitKind.Line, 3, 1, 0),
                BattleTestKit.Reserve(9, BattleSide.Defender, UnitKind.Line, 3));

            BattleStepResult r = BattleAutoPlayer.PlayTurn(s, CombatRules.Default, new SplitMix64(1));

            Assert.That(r.State.Find(1)!.Row, Is.EqualTo(1));
        }
    }
}
