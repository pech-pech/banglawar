using Conquest.Core.Combat;
using static Conquest.Tests.Combat.BattleTestKit;

namespace Conquest.Tests.Combat
{
    public class BattleMoveTests
    {
        private const BattleSide A = BattleSide.Attacker;
        private const BattleSide D = BattleSide.Defender;

        [Test]
        public void ReserveUnitEntersTheHomeRowAndSpendsItsMove()
        {
            BattleState s = State(Reserve(1, A, UnitKind.Line, 3), Reserve(9, D, UnitKind.Line, 3));

            BattleState next = Apply(s, BattleAction.Move(1, 0, 0));

            BattleUnit u = next.Find(1)!;
            Assert.That((u.Col, u.Row), Is.EqualTo((0, 0)));
            Assert.That(u.MovedSteps, Is.EqualTo(1));
            Assert.That(s.Find(1)!.OnBoard, Is.False, "original state is untouched");
        }

        [Test]
        public void ShockEnteringFromReserveUsesBothSteps()
        {
            BattleState s = State(Reserve(1, A, UnitKind.Shock, 3), Reserve(9, D, UnitKind.Line, 3));
            Assert.That(Apply(s, BattleAction.Move(1, 1, 0)).Find(1)!.MovedSteps, Is.EqualTo(2));
        }

        [Test]
        public void ReserveUnitMayOnlyEnterItsOwnHomeRow()
        {
            BattleState s = State(Reserve(1, A, UnitKind.Line, 3), Reserve(9, D, UnitKind.Line, 3));
            Assert.That(Fail(s, BattleAction.Move(1, 0, 1)), Is.EqualTo("err.move_not_home_row"));
        }

        [Test]
        public void OnlyTheSideToActMayMove()
        {
            BattleState s = State(Reserve(1, A, UnitKind.Line, 3), Reserve(9, D, UnitKind.Line, 3));
            Assert.That(Fail(s, BattleAction.Move(9, 0, 3)), Is.EqualTo("err.not_your_turn"));
        }

        [Test]
        public void UnknownUnitsAndEnemyUnitsAreRejected()
        {
            BattleState s = State(Reserve(1, A, UnitKind.Line, 3), Reserve(9, D, UnitKind.Line, 3));
            Assert.That(Fail(s, BattleAction.Move(77, 0, 0)), Is.EqualTo("err.unit_unknown"));
        }

        [Test]
        public void MovesOutsideTheGridAreRejected()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 0), Reserve(9, D, UnitKind.Line, 3));
            Assert.That(Fail(s, BattleAction.Move(1, -1, 0)), Is.EqualTo("err.move_illegal"));
            Assert.That(Fail(s, BattleAction.Move(1, 0, 4)), Is.EqualTo("err.move_illegal"));
        }

        [Test]
        public void LineMovesOneSquareOnly()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 0), Reserve(9, D, UnitKind.Line, 3));

            BattleState once = Apply(s, BattleAction.Move(1, 0, 1));

            Assert.That(Fail(once, BattleAction.Move(1, 0, 2)), Is.EqualTo("err.no_moves_left"));
            Assert.That(Fail(s, BattleAction.Move(1, 0, 2)), Is.EqualTo("err.move_illegal"));
        }

        [Test]
        public void DiagonalAndStationaryMovesAreIllegal()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 0), Reserve(9, D, UnitKind.Line, 3));
            Assert.That(Fail(s, BattleAction.Move(1, 1, 1)), Is.EqualTo("err.move_illegal"));
            Assert.That(Fail(s, BattleAction.Move(1, 0, 0)), Is.EqualTo("err.move_illegal"));
        }

        [Test]
        public void ShockMovesUpToTwoSquaresInTotal()
        {
            BattleState s = State(Unit(1, A, UnitKind.Shock, 3, 0, 0), Reserve(9, D, UnitKind.Line, 3));

            BattleState two = Apply(s, BattleAction.Move(1, 0, 2));
            BattleState oneThenOne = Apply(Apply(s, BattleAction.Move(1, 0, 1)), BattleAction.Move(1, 1, 1));

            Assert.That(two.Find(1)!.MovedSteps, Is.EqualTo(2));
            Assert.That(oneThenOne.Find(1)!.MovedSteps, Is.EqualTo(2));
            Assert.That(Fail(two, BattleAction.Move(1, 0, 3)), Is.EqualTo("err.no_moves_left"));
            Assert.That(Fail(s, BattleAction.Move(1, 1, 3)), Is.EqualTo("err.move_illegal"));
        }

        [Test]
        public void ShockCannotJumpThroughAnEnemySquare()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Shock, 3, 0, 0),
                Unit(2, D, UnitKind.Line, 3, 0, 1),
                Reserve(9, D, UnitKind.Line, 3));
            Assert.That(Fail(s, BattleAction.Move(1, 0, 2)), Is.EqualTo("err.move_blocked"));
        }

        [Test]
        public void RangedMovesAlongTheHomeRowOnly()
        {
            BattleState s = State(Unit(1, A, UnitKind.Ranged, 3, 0, 0), Reserve(9, D, UnitKind.Line, 3));

            Assert.That(Apply(s, BattleAction.Move(1, 1, 0)).Find(1)!.Col, Is.EqualTo(1));
            Assert.That(Fail(s, BattleAction.Move(1, 0, 1)), Is.EqualTo("err.move_not_home_row"));
        }

        [Test]
        public void UnitNextToAnEnemyMayNotStepNextToAnotherEnemy()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Line, 3, 0, 1),
                Unit(2, D, UnitKind.Line, 3, 0, 2),
                Unit(3, D, UnitKind.Line, 3, 1, 2));

            Assert.That(Fail(s, BattleAction.Move(1, 1, 1)), Is.EqualTo("err.move_adjacent_enemy"));
            Assert.That(Apply(s, BattleAction.Move(1, 0, 0)).Find(1)!.Row, Is.EqualTo(0));
        }

        [Test]
        public void UnitNotNextToAnEnemyMayStepNextToOne()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Line, 3, 0, 0),
                Unit(2, D, UnitKind.Line, 3, 0, 2));
            Assert.That(Apply(s, BattleAction.Move(1, 0, 1)).Find(1)!.Row, Is.EqualTo(1));
        }

        [Test]
        public void EnemyOccupiedSquaresAreBlocked()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Line, 3, 0, 1),
                Unit(2, D, UnitKind.Line, 3, 0, 2));
            Assert.That(Fail(s, BattleAction.Move(1, 0, 2)), Is.EqualTo("err.move_blocked"));
        }

        [Test]
        public void SquareHoldsSixLineEquivalents()
        {
            BattleUnit[] lines = { Unit(1, A, UnitKind.Line, 2, 0, 0), Unit(2, A, UnitKind.Line, 2, 0, 0), Unit(3, A, UnitKind.Line, 2, 0, 0),
                Unit(4, A, UnitKind.Line, 2, 0, 0), Unit(5, A, UnitKind.Line, 2, 0, 0) };
            List<BattleUnit> all = new List<BattleUnit>(lines)
            {
                Unit(6, A, UnitKind.Line, 2, 1, 0),
                Unit(7, A, UnitKind.Line, 2, 1, 0),
                Unit(10, D, UnitKind.Line, 2, 2, 3),
            };
            BattleState s = BattleState.Create(all, new SideInfo(), new SideInfo());

            BattleState sixth = Apply(s, BattleAction.Move(6, 0, 0));

            Assert.That(Fail(sixth, BattleAction.Move(7, 0, 0)), Is.EqualTo("err.square_full"));
        }

        [Test]
        public void CavalryStyleUnitsCountTwoSlots()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Shock, 2, 0, 0), Unit(2, A, UnitKind.Shock, 2, 0, 0), Unit(3, A, UnitKind.Shock, 2, 0, 0),
                Unit(4, A, UnitKind.Shock, 2, 1, 0),
                Unit(10, D, UnitKind.Line, 2, 2, 3));

            Assert.That(Fail(s, BattleAction.Move(4, 0, 0)), Is.EqualTo("err.square_full"));
        }

        [Test]
        public void EnteringTheEnemyFlagSquareWinsTheBattle()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 1, 2), Reserve(9, D, UnitKind.Line, 3));

            BattleState won = Apply(s, BattleAction.Move(1, 1, 3));

            Assert.That(won.Outcome, Is.Not.Null);
            Assert.That(won.Outcome!.Winner, Is.EqualTo(A));
            Assert.That(won.Outcome.Reason, Is.EqualTo(OutcomeReason.FlagEntered));
            Assert.That(Fail(won, BattleAction.EndTurn()), Is.EqualTo("err.battle_over"));
        }

        [Test]
        public void DefenderWinsByEnteringTheAttackerFlag()
        {
            BattleState s = State(Reserve(9, A, UnitKind.Line, 3), Unit(5, D, UnitKind.Line, 3, 1, 1));
            BattleState defendersTurn = Apply(s, BattleAction.EndTurn());

            BattleState won = Apply(defendersTurn, BattleAction.Move(5, 1, 0));

            Assert.That(won.Outcome!.Winner, Is.EqualTo(D));
        }

        [Test]
        public void MovingAfterAttackingIsRejected()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Shock, 3, 0, 1),
                Unit(2, D, UnitKind.Line, 3, 0, 2),
                Reserve(9, D, UnitKind.Line, 3));

            BattleState attacked = Apply(s, BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit);

            Assert.That(Fail(attacked, BattleAction.Move(1, 0, 0), AlwaysHit), Is.EqualTo("err.move_after_attack"));
        }
    }
}
