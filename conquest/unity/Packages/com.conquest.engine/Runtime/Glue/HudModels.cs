using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Glue
{
    /// <summary>One resource chip: id, display text and a shape badge (never colour alone).</summary>
    public sealed class ResourceChip
    {
        public ResourceChip(Resource resource, string id, string label, int amount, string badge)
        {
            Resource = resource;
            Id = id;
            Label = label;
            Amount = amount;
            Badge = badge;
        }

        public Resource Resource { get; }

        public string Id { get; }

        public string Label { get; }

        public int Amount { get; }

        public string Badge { get; }
    }

    public sealed class UnitCardModel
    {
        public UnitCardModel(int unitId, string title, string levelText, string strengthText, string movesText, bool friendly, bool canFoundBase, string ownerBadge)
        {
            UnitId = unitId;
            Title = title;
            LevelText = levelText;
            StrengthText = strengthText;
            MovesText = movesText;
            Friendly = friendly;
            CanFoundBase = canFoundBase;
            OwnerBadge = ownerBadge;
        }

        public int UnitId { get; }

        public string Title { get; }

        public string LevelText { get; }

        public string StrengthText { get; }

        public string MovesText { get; }

        public bool Friendly { get; }

        public bool CanFoundBase { get; }

        /// <summary>Owner shown by pattern as well as colour: a letter badge ("1", "2").</summary>
        public string OwnerBadge { get; }
    }

    public sealed class TurnBarModel
    {
        public TurnBarModel(string turnText, string seasonText, bool endTurnEnabled, string endTurnText)
        {
            TurnText = turnText;
            SeasonText = seasonText;
            EndTurnEnabled = endTurnEnabled;
            EndTurnText = endTurnText;
        }

        public string TurnText { get; }

        public string SeasonText { get; }

        public bool EndTurnEnabled { get; }

        public string EndTurnText { get; }
    }

    /// <summary>Plain view-models for the HUD panels: the presenters only bind them to elements.</summary>
    public static class HudModels
    {
        private static readonly Resource[] Order = { Resource.Basic, Resource.Hard, Resource.Coin, Resource.Wares, Resource.Food, Resource.Pop };
        private static readonly string[] Badges = { "■", "▲", "●", "◆", "★", "✚" };

        /// <summary>Totals over all of the slot's bases (zero before the first base is founded).</summary>
        public static IReadOnlyList<ResourceChip> Resources(GameState state, int slot, Localizer text)
        {
            var total = ResourceVector.Zero;
            foreach (Base b in state.BaseTable)
            {
                if (b.Owner == slot) total = total.Add(b.Stock);
            }

            string slotId = EventMapper.SlotId(slot);
            var chips = new List<ResourceChip>(Order.Length);
            for (int i = 0; i < Order.Length; i++)
            {
                string id = RoleIds.Of(Order[i]);
                chips.Add(new ResourceChip(Order[i], id, text.Label(id, slotId), total.Get(Order[i]), Badges[i]));
            }

            return chips;
        }

        public static UnitCardModel? Card(GameState state, int unitId, int localSlot, Localizer text)
        {
            if (!state.TryGetUnit(unitId, out UnitView u)) return null;
            string slotId = EventMapper.SlotId(u.Owner);
            int moves = u.MovesLeft / RuleTables.MovementScale;
            return new UnitCardModel(
                u.Id,
                text.Label(RoleIds.Of(u.Role), slotId),
                text.Get("ui.level") + " " + Localizer.Number(u.Level),
                text.Get("ui.strength") + " " + Localizer.Number(u.Strength),
                text.Get("ui.moves") + " " + Localizer.Number(moves),
                u.Owner == localSlot,
                u.Owner == localSlot && u.Role == UnitRole.Founder && u.Owner == localSlot,
                Localizer.Number(u.Owner + 1));
        }

        public static TurnBarModel TurnBar(GameState state, int localSlot, SeasonLookup seasons, Localizer text)
        {
            bool ended = state.Factions[localSlot].EndedTurn || state.MatchOver;
            return new TurnBarModel(
                text.Get("ui.turn") + " " + Localizer.Number(state.Turn + 1),
                seasons.Label(text, state.Turn),
                !ended,
                text.Get("ui.end_turn"));
        }
    }
}

namespace Conquest.Glue
{
    public static class GameStateViews
    {
        /// <summary>The state through the core's read-only query interface (ordered lists of unit and base views).</summary>
        public static Conquest.Core.Contracts.IGameStateView AsView(this Conquest.Core.Turn.GameState state) => state;
    }
}
