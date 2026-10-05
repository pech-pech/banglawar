using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Presentation;

namespace Conquest.Glue
{
    /// <summary>One row of the build panel, texts already in the current language.</summary>
    public sealed class BuildRowModel
    {
        public BuildRowModel(BuildingRole role, string roleId, string label, string costText, bool enabled, string reasonText)
        {
            Role = role;
            RoleId = roleId;
            Label = label;
            CostText = costText;
            Enabled = enabled;
            ReasonText = reasonText;
        }

        public BuildingRole Role { get; }

        public string RoleId { get; }

        public string Label { get; }

        public string CostText { get; }

        public bool Enabled { get; }

        /// <summary>Why the row is disabled ("Not enough in store. Short of ■ 3"); empty when enabled.</summary>
        public string ReasonText { get; }
    }

    /// <summary>The build panel: the base, what it holds, one row per building role, and the placement step once a role is chosen.</summary>
    public sealed class BuildPanelModel
    {
        public BuildPanelModel(int baseId, string title, string stockText, IReadOnlyList<BuildRowModel> rows, BuildingRole? placing, string placingText, bool canConfirm)
        {
            BaseId = baseId;
            Title = title;
            StockText = stockText;
            Rows = rows;
            Placing = placing;
            PlacingText = placingText;
            CanConfirm = canConfirm;
        }

        public int BaseId { get; }

        public string Title { get; }

        public string StockText { get; }

        public IReadOnlyList<BuildRowModel> Rows { get; }

        /// <summary>The role being placed, or null while the player is still choosing.</summary>
        public BuildingRole? Placing { get; }

        public string PlacingText { get; }

        public bool CanConfirm { get; }

        public static BuildPanelModel Create(GameState state, TurnServices services, int baseId, int slot, Localizer text, BuildingRole? placing, GridPos? site)
        {
            string slotId = EventMapper.SlotId(slot);
            int index = state.FindBaseIndex(baseId);
            string baseName = text.Label("bld.core", slotId);
            string stock = index < 0 ? string.Empty : text.Get("ui.build_stock") + ": " + HudModels.CostText(state.BaseTable[index].Stock);
            var rows = new List<BuildRowModel>();
            foreach (BuildEntry entry in BuildMenu.Entries(state, services, baseId, slot))
            {
                rows.Add(new BuildRowModel(entry.Role, entry.RoleId, text.Label(entry.RoleId, slotId), HudModels.CostText(entry.Cost), entry.Enabled, ReasonOf(entry, text)));
            }

            string placingText = placing.HasValue
                ? text.Format("ui.build_pick_site", text.Label(RoleIds.Of(placing.Value), slotId))
                : string.Empty;
            return new BuildPanelModel(baseId, text.Format("ui.build_title", baseName), stock, rows, placing, placingText, placing.HasValue && site.HasValue);
        }

        private static string ReasonOf(BuildEntry entry, Localizer text)
        {
            if (entry.Enabled || entry.DisabledReason == null) return string.Empty;
            string reason = text.ErrorText(entry.DisabledReason);
            return entry.DisabledReason == Err.NotEnoughResources
                ? reason + ". " + text.Format("ui.build_short", HudModels.CostText(entry.Shortfall))
                : reason;
        }
    }

    /// <summary>The attack preview as lines of text for the card.</summary>
    public sealed class AttackCardModel
    {
        public AttackCardModel(string title, string forceText, string opposingText, string oddsText, string lossText, string noteText, bool canOrder, string errorText)
        {
            Title = title;
            ForceText = forceText;
            OpposingText = opposingText;
            OddsText = oddsText;
            LossText = lossText;
            NoteText = noteText;
            CanOrder = canOrder;
            ErrorText = errorText;
        }

        public string Title { get; }

        public string ForceText { get; }

        public string OpposingText { get; }

        public string OddsText { get; }

        public string LossText { get; }

        public string NoteText { get; }

        public bool CanOrder { get; }

        public string ErrorText { get; }

        /// <summary>Win chance shown in steps of five percent so the card does not promise precision it lacks.</summary>
        public static int RoundedPercent(int winPermille) => (winPermille + 25) / 50 * 5;

        public static AttackCardModel From(AttackPreview preview, Localizer text)
        {
            if (!preview.Valid) return new AttackCardModel(text.Get("ui.attack_title"), string.Empty, string.Empty, string.Empty, string.Empty, string.Empty, false, text.ErrorText(preview.ErrorCode));
            var opposingLines = new List<string>();
            if (preview.TargetIsBase) opposingLines.Add(text.Get("ui.attack_them_base"));
            if (preview.DefenderCount > 0 || !preview.TargetIsBase) opposingLines.Add(text.Format("ui.attack_them", preview.DefenderCount, preview.DefenderStrength));
            string opposing = string.Join("\n", opposingLines);

            string odds = preview.Outlook == AttackOutlook.Unknown
                ? text.Get("ui.outlook_unknown")
                : text.Format("ui.attack_odds", RoundedPercent(preview.WinPermille), text.Get(OutlookKey(preview.Outlook)));
            string loss = preview.Samples > 0 ? text.Format("ui.attack_losses", preview.ExpectedOwnLoss, preview.ExpectedOpposingLoss) : string.Empty;
            return new AttackCardModel(
                text.Get("ui.attack_title"),
                text.Format("ui.attack_you", preview.AttackerIds.Count, preview.AttackerStrength),
                opposing,
                odds,
                loss,
                text.Get("ui.attack_note"),
                true,
                string.Empty);
        }

        private static string OutlookKey(AttackOutlook outlook)
        {
            switch (outlook)
            {
                case AttackOutlook.Likely: return "ui.outlook_likely";
                case AttackOutlook.Unlikely: return "ui.outlook_unlikely";
                default: return "ui.outlook_even";
            }
        }
    }

    /// <summary>Texts for the result of a fought battle, from the core's <see cref="AttackResolved"/> event.</summary>
    public static class BattleMessages
    {
        /// <summary>The message for a battle the local slot took part in; null for a battle between others.</summary>
        public static string? For(AttackResolved e, int localSlot, Localizer text)
        {
            string x = Localizer.Number(e.Target.X);
            string y = Localizer.Number(e.Target.Y);
            if (e.AttackerSlot == localSlot)
            {
                string key = e.Winner == AttackResolved.WinnerAttacker ? "ui.attack_won" : e.Winner == AttackResolved.WinnerDefender ? "ui.attack_lost" : "ui.attack_drawn";
                return text.Format(key, x, y);
            }

            if (e.DefenderSlot != localSlot) return null;
            if (e.Winner == AttackResolved.WinnerNone) return text.Format("ui.attack_drawn", x, y);
            return text.Format(e.Winner == AttackResolved.WinnerAttacker ? "ui.defend_lost" : "ui.defended", x, y);
        }
    }
}
