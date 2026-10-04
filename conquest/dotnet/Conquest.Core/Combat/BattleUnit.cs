namespace Conquest.Core.Combat
{
    /// <summary>
    /// One unit on the battle board or in its reserves (<c>Col = Row = -1</c>). Immutable; every change returns a new
    /// instance. <c>Strength</c> is both hit points and shots per attack (GDD 11.1). <c>Generated</c> marks the red
    /// colony defenders (militia and fort ranged).
    /// </summary>
    public sealed class BattleUnit
    {
        public BattleUnit(
            int id,
            BattleSide side,
            UnitKind kind,
            int strength,
            int maxStrength,
            int col = -1,
            int row = -1,
            int movedSteps = 0,
            bool attacked = false,
            bool panicked = false,
            bool generated = false)
        {
            Id = id;
            Side = side;
            Kind = kind;
            Strength = strength;
            MaxStrength = maxStrength;
            Col = col;
            Row = row;
            MovedSteps = movedSteps;
            Attacked = attacked;
            Panicked = panicked;
            Generated = generated;
        }

        public int Id { get; }

        public BattleSide Side { get; }

        public UnitKind Kind { get; }

        public int Strength { get; }

        public int MaxStrength { get; }

        public int Col { get; }

        public int Row { get; }

        /// <summary>Steps spent this combat turn (a unit entering from reserves spends all of its steps).</summary>
        public int MovedSteps { get; }

        public bool Attacked { get; }

        /// <summary>Set when the unit fell back in the enemy's last turn; cleared at the end of its own side's turn.</summary>
        public bool Panicked { get; }

        public bool Generated { get; }

        public bool OnBoard => Row >= 0;

        public BattleUnit WithStrength(int strength)
        {
            return new BattleUnit(Id, Side, Kind, strength, MaxStrength, Col, Row, MovedSteps, Attacked, Panicked, Generated);
        }

        public BattleUnit WithPlace(int col, int row, int movedSteps)
        {
            return new BattleUnit(Id, Side, Kind, Strength, MaxStrength, col, row, movedSteps, Attacked, Panicked, Generated);
        }

        public BattleUnit WithAttacked()
        {
            return new BattleUnit(Id, Side, Kind, Strength, MaxStrength, Col, Row, MovedSteps, true, Panicked, Generated);
        }

        public BattleUnit WithFallenBack(int col, int row)
        {
            return new BattleUnit(Id, Side, Kind, Strength, MaxStrength, col, row, MovedSteps, Attacked, true, Generated);
        }

        /// <summary>The state at the end of its side's turn: nothing spent, nothing carried over.</summary>
        public BattleUnit WithTurnReset()
        {
            return new BattleUnit(Id, Side, Kind, Strength, MaxStrength, Col, Row, 0, false, false, Generated);
        }
    }
}
