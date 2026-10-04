using Conquest.Core.Combat;
using static Conquest.Tests.Combat.BattleTestKit;

namespace Conquest.Tests.Combat
{
    public class BattleAttackTests
    {
        private const BattleSide A = BattleSide.Attacker;
        private const BattleSide D = BattleSide.Defender;

        private static BattleState Front(UnitKind attacker = UnitKind.Line, int attackerStrength = 3, int defenderStrength = 5)
        {
            return State(
                Unit(1, A, attacker, attackerStrength, 0, 1),
                Unit(2, D, UnitKind.Line, defenderStrength, 0, 2, 5),
                Reserve(9, D, UnitKind.Line, 3));
        }

        [Test]
        public void EveryStrengthPointIsOneShotOfOneDamage()
        {
            BattleState next = Apply(Front(), BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit);

            Assert.That(next.Find(2)!.Strength, Is.EqualTo(2));
            Assert.That(next.Find(1)!.Attacked, Is.True);
        }

        [Test]
        public void ZeroStrengthRemovesTheUnit()
        {
            BattleState next = Apply(Front(defenderStrength: 2), BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit);

            Assert.That(next.Find(2), Is.Null);
            Assert.That(next.Outcome, Is.Null, "a defender is still in reserve");
        }

        [Test]
        public void ShotsAreWastedWhenTheSquareIsEmptied()
        {
            BattleState next = Apply(Front(attackerStrength: 5, defenderStrength: 1), BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit);
            Assert.That(next.Units.Count, Is.EqualTo(2));
        }

        [Test]
        public void KillingTheLastDefenderWinsByElimination()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 1), Unit(2, D, UnitKind.Line, 1, 0, 2));

            BattleState next = Apply(s, BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit);

            Assert.That(next.Outcome!.Winner, Is.EqualTo(A));
            Assert.That(next.Outcome.Reason, Is.EqualTo(OutcomeReason.Eliminated));
        }

        [Test]
        public void MeleeNeedsAnAdjacentSquare()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 0), Unit(2, D, UnitKind.Line, 3, 0, 2), Reserve(9, D, UnitKind.Line, 3));
            Assert.That(Fail(s, BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit), Is.EqualTo("err.attack_out_of_reach"));
        }

        [Test]
        public void RangedFiresDownItsOwnColumnOnly()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Ranged, 3, 0, 0),
                Unit(2, D, UnitKind.Line, 5, 0, 3),
                Unit(3, D, UnitKind.Line, 5, 1, 3));

            Assert.That(Apply(s, BattleAction.Attack(new[] { 1 }, 0, 3), AlwaysHit).Find(2)!.Strength, Is.EqualTo(2));
            Assert.That(Fail(s, BattleAction.Attack(new[] { 1 }, 1, 3), AlwaysHit), Is.EqualTo("err.attack_out_of_reach"));
        }

        [Test]
        public void TargetSquareMustHoldAnEnemy()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 1), Reserve(9, D, UnitKind.Line, 3));
            Assert.That(Fail(s, BattleAction.Attack(new[] { 1 }, 0, 2)), Is.EqualTo("err.attack_no_target"));
        }

        [Test]
        public void LineAndRangedCannotAttackAfterMovingButShockMayAfterOneStep()
        {
            BattleState line = State(Unit(1, A, UnitKind.Line, 3, 0, 0), Unit(2, D, UnitKind.Line, 5, 0, 2), Reserve(9, D, UnitKind.Line, 3));
            BattleState shock = State(Unit(1, A, UnitKind.Shock, 3, 0, 0), Unit(2, D, UnitKind.Line, 5, 0, 2), Reserve(9, D, UnitKind.Line, 3));

            BattleState lineMoved = Apply(line, BattleAction.Move(1, 0, 1));
            BattleState shockMoved = Apply(shock, BattleAction.Move(1, 0, 1));
            BattleState shockFar = Apply(State(Unit(1, A, UnitKind.Shock, 3, 0, 0), Unit(2, D, UnitKind.Line, 5, 1, 3), Reserve(9, D, UnitKind.Line, 3)), BattleAction.Move(1, 1, 1));

            Assert.That(Fail(lineMoved, BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit), Is.EqualTo("err.attack_after_move"));
            Assert.That(Apply(shockMoved, BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit).Find(2)!.Strength, Is.EqualTo(2));
            Assert.That(shockFar.Find(1)!.MovedSteps, Is.EqualTo(2));
            Assert.That(Fail(shockFar, BattleAction.Attack(new[] { 1 }, 1, 3), AlwaysHit), Is.EqualTo("err.attack_after_move"));
        }

        [Test]
        public void ChargeDamagesMoreOftenThanAStandingAttack()
        {
            int standing = 0;
            int charging = 0;
            for (ulong seed = 1; seed <= 300; seed++)
            {
                BattleState idle = State(Unit(1, A, UnitKind.Shock, 1, 0, 1), Unit(2, D, UnitKind.Line, 5, 0, 2), Reserve(9, D, UnitKind.Line, 3));
                BattleState moved = State(Unit(1, A, UnitKind.Shock, 1, 0, 0), Unit(2, D, UnitKind.Line, 5, 0, 2), Reserve(9, D, UnitKind.Line, 3));
                moved = Apply(moved, BattleAction.Move(1, 0, 1));
                standing += 5 - Apply(idle, BattleAction.Attack(new[] { 1 }, 0, 2), Default, seed).Find(2)!.Strength;
                charging += 5 - Apply(moved, BattleAction.Attack(new[] { 1 }, 0, 2), Default, seed).Find(2)!.Strength;
            }

            Assert.That(charging, Is.GreaterThan(standing));
        }

        [Test]
        public void ChargeIsLostWhenTheUnitPanickedLastTurn()
        {
            HitContext charged = new HitContext(UnitKind.Shock, charged: true);
            Assert.That(Odds.HitChance(Default, charged), Is.GreaterThan(Odds.HitChance(Default, new HitContext(UnitKind.Shock))));

            BattleUnit panicked = new BattleUnit(1, A, UnitKind.Shock, 3, 3, 0, 1, movedSteps: 1, attacked: false, panicked: true);
            Assert.That(Geometry.IsCharging(panicked), Is.False);
            Assert.That(Geometry.IsCharging(new BattleUnit(1, A, UnitKind.Shock, 3, 3, 0, 1, 1)), Is.True);
            Assert.That(Geometry.IsCharging(new BattleUnit(1, A, UnitKind.Shock, 3, 3, 0, 1, 0)), Is.False);
        }

        [Test]
        public void AUnitAttacksOncePerTurn()
        {
            BattleState once = Apply(Front(), BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit);
            Assert.That(Fail(once, BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit), Is.EqualTo("err.unit_already_attacked").Or.EqualTo("err.no_attacks_left"));
        }

        [Test]
        public void WithoutACommanderOneGroupAttackPerTurn()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Line, 2, 0, 1), Unit(2, A, UnitKind.Line, 2, 1, 1),
                Unit(3, D, UnitKind.Line, 5, 0, 2), Unit(4, D, UnitKind.Line, 5, 1, 2));

            BattleState first = Apply(s, BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit);

            Assert.That(Fail(first, BattleAction.Attack(new[] { 2 }, 1, 2), AlwaysHit), Is.EqualTo("err.no_attacks_left"));
        }

        [Test]
        public void CommanderLevelSetsHowManyAttacksArePossible()
        {
            SideInfo level2 = new SideInfo(new CommanderStats(2, 3, 0));
            BattleState s = StateWith(
                level2, new SideInfo(),
                Unit(1, A, UnitKind.Line, 2, 0, 1), Unit(2, A, UnitKind.Line, 2, 1, 1), Unit(5, A, UnitKind.Line, 2, 2, 1),
                Unit(3, D, UnitKind.Line, 5, 0, 2), Unit(4, D, UnitKind.Line, 5, 1, 2), Unit(6, D, UnitKind.Line, 5, 2, 2));

            BattleState first = Apply(s, BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit);
            BattleState second = Apply(first, BattleAction.Attack(new[] { 2 }, 1, 2), AlwaysHit);

            Assert.That(second.AttacksUsed, Is.EqualTo(2));
            Assert.That(Fail(second, BattleAction.Attack(new[] { 5 }, 2, 2), AlwaysHit), Is.EqualTo("err.no_attacks_left"));
        }

        [Test]
        public void GroupAttackMustNameAttackersOfTheActingSide()
        {
            BattleState s = Front();
            Assert.That(Fail(s, BattleAction.Attack(new[] { 2 }, 0, 1), AlwaysHit), Is.EqualTo("err.unit_not_yours"));
            Assert.That(Fail(s, BattleAction.Attack(new int[0], 0, 2), AlwaysHit), Is.EqualTo("err.attack_empty"));
            Assert.That(Fail(s, BattleAction.Attack(new[] { 1, 1 }, 0, 2), AlwaysHit), Is.EqualTo("err.attack_invalid"));
        }

        [Test]
        public void GroupAttackFiresEveryUnitsShots()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Line, 2, 1, 1), Unit(2, A, UnitKind.Line, 2, 0, 2),
                Unit(3, D, UnitKind.Line, 5, 1, 2), Unit(4, D, UnitKind.Line, 5, 2, 3));

            BattleState next = Apply(s, BattleAction.Attack(new[] { 1, 2 }, 1, 2), AlwaysHit);
            Assert.That(next.Find(3)!.Strength, Is.EqualTo(1), "two units with two shots each");
        }

        [Test]
        public void TargetsAreChosenMoreOftenAmongLikeUnits()
        {
            int lineHits = 0;
            for (ulong seed = 1; seed <= 400; seed++)
            {
                BattleState s = State(
                    Unit(1, A, UnitKind.Line, 1, 0, 1),
                    Unit(10, D, UnitKind.Line, 5, 0, 2),
                    Unit(11, D, UnitKind.Ranged, 5, 0, 2));
                BattleState next = Apply(s, BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHit, seed);
                if (next.Find(10)!.Strength < 5)
                {
                    lineHits++;
                }
            }

            Assert.That(lineHits, Is.InRange(400 * 65 / 100, 400 * 85 / 100));
        }

        [Test]
        public void DamagedSurvivorsRetreatTowardTheirReserves()
        {
            BattleState next = Apply(Front(), BattleAction.Attack(new[] { 1 }, 0, 2), AlwaysHitAlwaysPanic);

            BattleUnit u = next.Find(2)!;
            Assert.That((u.Col, u.Row), Is.EqualTo((0, 3)));
            Assert.That(u.Panicked, Is.True);
            Assert.That(u.Strength, Is.EqualTo(2));
        }

        [Test]
        public void ARetreatThatIsBlockedCostsOneMoreDamage()
        {
            BattleState s = State(Unit(1, A, UnitKind.Line, 3, 0, 2), Unit(2, D, UnitKind.Line, 5, 0, 3), Reserve(9, D, UnitKind.Line, 3));

            BattleState next = Apply(s, BattleAction.Attack(new[] { 1 }, 0, 3), AlwaysHitAlwaysPanic);

            BattleUnit u = next.Find(2)!;
            Assert.That((u.Col, u.Row), Is.EqualTo((0, 3)), "home row units cannot fall back");
            Assert.That(u.Strength, Is.EqualTo(5 - 3 - 1));
            Assert.That(u.Panicked, Is.False);
        }

        [Test]
        public void ARetreatIntoAFullSquareIsBlockedToo()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Line, 1, 1, 1),
                Unit(2, D, UnitKind.Line, 5, 1, 2),
                Unit(3, D, UnitKind.Shock, 2, 1, 3), Unit(4, D, UnitKind.Shock, 2, 1, 3), Unit(5, D, UnitKind.Shock, 2, 1, 3));

            BattleState next = Apply(s, BattleAction.Attack(new[] { 1 }, 1, 2), AlwaysHitAlwaysPanic);

            Assert.That(next.Find(2)!.Row, Is.EqualTo(2));
            Assert.That(next.Find(2)!.Strength, Is.EqualTo(5 - 1 - 1));
        }

        [Test]
        public void ABlockedRetreatCanKillTheUnit()
        {
            BattleState weak = State(Unit(1, A, UnitKind.Line, 1, 0, 2), Unit(2, D, UnitKind.Line, 2, 0, 3), Unit(3, D, UnitKind.Line, 2, 2, 3));

            BattleState next = Apply(weak, BattleAction.Attack(new[] { 1 }, 0, 3), AlwaysHitAlwaysPanic);

            Assert.That(next.Find(2), Is.Null);
        }

        [Test]
        public void CharismaSpareDamagedUnitsFromPanic()
        {
            SideInfo calm = new SideInfo(new CommanderStats(1, 10, 0));
            CombatRules rules = new CombatRules(hitMin: 1000, hitMax: 1000, panicBase: 100, panicPerLostPermille: 0, panicMax: 900, charismaPerPoint: 20);
            int panics = 0;
            for (ulong seed = 1; seed <= 100; seed++)
            {
                BattleState s = StateWith(new SideInfo(), calm, Unit(1, A, UnitKind.Line, 1, 0, 1), Unit(2, D, UnitKind.Line, 5, 0, 2), Reserve(9, D, UnitKind.Line, 3));
                if (Apply(s, BattleAction.Attack(new[] { 1 }, 0, 2), rules, seed).Find(2)!.Panicked)
                {
                    panics++;
                }
            }

            Assert.That(panics, Is.EqualTo(0), "base 100 minus charisma 10 x 20 never panics");
        }

        [Test]
        public void TheTimedPanicModifierRaisesTheChance()
        {
            SideInfo shaky = new SideInfo(null, panicModifierPermille: 1000);
            CombatRules rules = new CombatRules(hitMin: 1000, hitMax: 1000, panicBase: 0, panicPerLostPermille: 0, panicMax: 1000);
            BattleState s = StateWith(new SideInfo(), shaky, Unit(1, A, UnitKind.Line, 1, 0, 1), Unit(2, D, UnitKind.Line, 5, 0, 2), Reserve(9, D, UnitKind.Line, 3));

            Assert.That(Apply(s, BattleAction.Attack(new[] { 1 }, 0, 2), rules).Find(2)!.Panicked, Is.True);
        }

        [Test]
        public void FlankAndCombinedArmsBonusesCountDistinctSquaresAndKinds()
        {
            BattleState s = State(
                Unit(1, A, UnitKind.Line, 1, 1, 1), Unit(2, A, UnitKind.Shock, 1, 0, 2), Unit(3, A, UnitKind.Line, 1, 1, 1),
                Unit(10, D, UnitKind.Line, 5, 1, 2));
            AttackProfile p = AttackResolver.Profile(s, new[] { 1, 2, 3 }, 1, 2);

            Assert.That(p.FlankSquares, Is.EqualTo(2));
            Assert.That(p.DistinctKinds, Is.EqualTo(2));
        }
    }
}
