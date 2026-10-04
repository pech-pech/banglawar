namespace Conquest.Core.Combat
{
    public enum BattleSide
    {
        Attacker = 0,
        Defender = 1,
    }

    /// <summary>Fighting kinds on the 3x4 board (neutral names of GDD 2.1: line, shock, ranged).</summary>
    public enum UnitKind
    {
        Line = 0,
        Shock = 1,
        Ranged = 2,
    }

    public enum OutcomeReason
    {
        FlagEntered = 0,
        Eliminated = 1,
        Retreated = 2,
        RoundCap = 3,
    }

    public sealed class BattleOutcome
    {
        public BattleOutcome(BattleSide winner, OutcomeReason reason)
        {
            Winner = winner;
            Reason = reason;
        }

        public BattleSide Winner { get; }

        public OutcomeReason Reason { get; }
    }

    /// <summary>A commander's battle stats: level sets attacks per turn, charisma lowers own panic, reputation raises enemy panic.</summary>
    public sealed class CommanderStats
    {
        private const int StatMax = 10;

        public CommanderStats(int level, int charisma, int reputation)
        {
            Level = level;
            Charisma = charisma;
            Reputation = reputation;
        }

        public int Level { get; }

        public int Charisma { get; }

        public int Reputation { get; }

        /// <summary>Charisma = 2 + level + rng(0..2), clamped to 0-10; reputation starts at 0 (GDD 11.5).</summary>
        public static CommanderStats Create(int level, SplitMix64 dice, out SplitMix64 next)
        {
            next = dice.Below(3, out int roll);
            int charisma = 2 + level + roll;
            return new CommanderStats(level, charisma > StatMax ? StatMax : charisma, 0);
        }

        /// <summary>+1 for a won battle, -1 for a lost one, clamped to 0-10.</summary>
        public CommanderStats AfterBattle(bool won)
        {
            int next = Reputation + (won ? 1 : -1);
            next = next < 0 ? 0 : next > StatMax ? StatMax : next;
            return new CommanderStats(Level, Charisma, next);
        }
    }

    /// <summary>Per-side inputs that are not units: the commander, the timed panic modifier (H5) and a flat hit bonus (academy rating).</summary>
    public sealed class SideInfo
    {
        public SideInfo(CommanderStats? commander = null, int panicModifierPermille = 0, int hitBonusPermille = 0)
        {
            Commander = commander;
            PanicModifierPermille = panicModifierPermille;
            HitBonusPermille = hitBonusPermille;
        }

        public CommanderStats? Commander { get; }

        public int PanicModifierPermille { get; }

        public int HitBonusPermille { get; }
    }
}
