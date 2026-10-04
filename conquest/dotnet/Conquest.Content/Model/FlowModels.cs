using System.Collections.Generic;

namespace Conquest.Content.Model
{
    public sealed class SettingsData
    {
        public SettingsData(int maxTurns, int nativeSettlements, int computerPlayers, string difficulty, string resources, string movement)
        {
            MaxTurns = maxTurns;
            NativeSettlements = nativeSettlements;
            ComputerPlayers = computerPlayers;
            Difficulty = difficulty;
            Resources = resources;
            Movement = movement;
        }

        public int MaxTurns { get; }

        public int NativeSettlements { get; }

        public int ComputerPlayers { get; }

        public string Difficulty { get; }

        public string Resources { get; }

        public string Movement { get; }
    }

    public sealed class CalendarData
    {
        public CalendarData(string epoch, int stepDays)
        {
            Epoch = epoch;
            StepDays = stepDays;
        }

        /// <summary>ISO date (yyyy-MM-dd) of the first day of turn 0.</summary>
        public string Epoch { get; }

        public int StepDays { get; }
    }

    public sealed class PlayerData
    {
        public PlayerData(string slot, string control, string startMode, StockData? startKit)
        {
            Slot = slot;
            Control = control;
            StartMode = startMode;
            StartKit = startKit;
        }

        public string Slot { get; }

        public string Control { get; }

        public string StartMode { get; }

        /// <summary>Stock handed to the first base this slot founds; null when the slot starts with bases.</summary>
        public StockData? StartKit { get; }
    }

    public sealed class ArrivalData
    {
        public ArrivalData(int turn, string slot, string? entryGroup, IReadOnlyList<UnitGroup> units, bool attachToFirstCommander, bool viaPatron)
        {
            Turn = turn;
            Slot = slot;
            EntryGroup = entryGroup;
            Units = units;
            AttachToFirstCommander = attachToFirstCommander;
            ViaPatron = viaPatron;
        }

        public int Turn { get; }

        public string Slot { get; }

        /// <summary>Entry group id (hook H1), or null for the neutral transport-at-edge rule.</summary>
        public string? EntryGroup { get; }

        public IReadOnlyList<UnitGroup> Units { get; }

        public bool AttachToFirstCommander { get; }

        public bool ViaPatron { get; }
    }

    public sealed class SeasonDefinition
    {
        public SeasonDefinition(string id, int moveCostPctLand, int moveCostPctWater, int foodOutputPct)
        {
            Id = id;
            MoveCostPctLand = moveCostPctLand;
            MoveCostPctWater = moveCostPctWater;
            FoodOutputPct = foodOutputPct;
        }

        public string Id { get; }

        public int MoveCostPctLand { get; }

        public int MoveCostPctWater { get; }

        public int FoodOutputPct { get; }
    }

    public sealed class SeasonRange
    {
        public SeasonRange(int fromTurn, int toTurn, string season, string? firstTurnContainsDate)
        {
            FromTurn = fromTurn;
            ToTurn = toTurn;
            Season = season;
            FirstTurnContainsDate = firstTurnContainsDate;
        }

        public int FromTurn { get; }

        /// <summary>Inclusive.</summary>
        public int ToTurn { get; }

        public string Season { get; }

        /// <summary>Optional check: the calendar date that <see cref="FromTurn"/> must contain.</summary>
        public string? FirstTurnContainsDate { get; }
    }

    public sealed class TimedEffectKind
    {
        public TimedEffectKind(string kind, string? inFlight, string? scope, int? permille)
        {
            Kind = kind;
            InFlight = inFlight;
            Scope = scope;
            Permille = permille;
        }

        public string Kind { get; }

        public string? InFlight { get; }

        public string? Scope { get; }

        public int? Permille { get; }
    }

    public sealed class TimedEffectData
    {
        public TimedEffectData(string id, int fromTurn, int? toTurn, string targetSlot, bool announce, string? firstTurnContainsDate, IReadOnlyList<TimedEffectKind> effects)
        {
            Id = id;
            FromTurn = fromTurn;
            ToTurn = toTurn;
            TargetSlot = targetSlot;
            Announce = announce;
            FirstTurnContainsDate = firstTurnContainsDate;
            Effects = effects;
        }

        public string Id { get; }

        public int FromTurn { get; }

        public int? ToTurn { get; }

        public string TargetSlot { get; }

        public bool Announce { get; }

        public string? FirstTurnContainsDate { get; }

        public IReadOnlyList<TimedEffectKind> Effects { get; }
    }

    public sealed class CommodityBound
    {
        public CommodityBound(string resource, int min, int max)
        {
            Resource = resource;
            Min = min;
            Max = max;
        }

        public string Resource { get; }

        public int Min { get; }

        public int Max { get; }
    }

    public sealed class BalanceData
    {
        public BalanceData(IReadOnlyList<CommodityBound> commodityBounds, int maxSlotRatioPct)
        {
            CommodityBounds = commodityBounds;
            MaxSlotRatioPct = maxSlotRatioPct;
        }

        public IReadOnlyList<CommodityBound> CommodityBounds { get; }

        public int MaxSlotRatioPct { get; }
    }
}
