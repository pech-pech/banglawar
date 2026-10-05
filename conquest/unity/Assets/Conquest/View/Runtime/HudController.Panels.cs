using System;
using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Glue;
using UnityEngine;
using UnityEngine.UIElements;

namespace Conquest.UnityView
{
    /// <summary>
    /// The panels added after the first slice: the attack card, the base card, the build panel, the queued-orders line
    /// and the pause menu. Like the rest of the HUD they only show view-models and report presses through callbacks.
    /// Element names: left-column, attack-card, attack-confirm, attack-cancel, base-card, build-open, build-panel,
    /// build-row-&lt;role id&gt;, build-confirm, build-back, build-close, orders-label, menu-button, pause-menu and the pause-* buttons.
    /// </summary>
    public sealed partial class HudController
    {
        private static readonly Color Scrim = new Color(0f, 0f, 0f, 0.62f);

        private VisualElement leftColumn = null!;
        private Button menuButton = null!;
        private Label ordersLabel = null!;
        private VisualElement attackCard = null!;
        private Label attackTitle = null!;
        private Label attackForce = null!;
        private Label attackOpposing = null!;
        private Label attackOdds = null!;
        private Label attackLoss = null!;
        private Label attackNote = null!;
        private Label attackError = null!;
        private Button attackConfirm = null!;
        private Button attackCancel = null!;
        private VisualElement baseCard = null!;
        private Label baseTitle = null!;
        private Label baseLevel = null!;
        private Button buildOpen = null!;
        private VisualElement buildPanel = null!;
        private Label buildTitle = null!;
        private Label buildStock = null!;
        private ScrollView buildRows = null!;
        private Label buildPlacing = null!;
        private Button buildConfirm = null!;
        private Button buildBack = null!;
        private Button buildClose = null!;
        private VisualElement pauseRoot = null!;
        private Label pauseTitle = null!;
        private Label pauseStatus = null!;
        private Button pauseResume = null!;
        private Button pauseSave = null!;
        private Button pauseLoad = null!;
        private Button pauseLanguage = null!;
        private Button pauseAutosave = null!;
        private Button pauseQuit = null!;
        private bool autosaveOn;
        private string lastBuildSignature = string.Empty;

        public Action? MenuPressed { get; set; }

        public Action? ResumePressed { get; set; }

        public Action? SavePressed { get; set; }

        public Action? LoadPressed { get; set; }

        public Action? AutosavePressed { get; set; }

        public Action? QuitPressed { get; set; }

        public Action? AttackConfirmPressed { get; set; }

        public Action? AttackCancelPressed { get; set; }

        public Action? BuildOpenPressed { get; set; }

        public Action<BuildingRole>? BuildRolePressed { get; set; }

        public Action? BuildConfirmPressed { get; set; }

        public Action? BuildBackPressed { get; set; }

        public Action? BuildClosePressed { get; set; }

        public bool PauseVisible => pauseRoot.style.display.value != DisplayStyle.None;

        public bool BuildPanelVisible => buildPanel.style.display.value != DisplayStyle.None;

        public bool AttackCardVisible => attackCard.style.display.value != DisplayStyle.None;

        public bool BaseCardVisible => baseCard.style.display.value != DisplayStyle.None;

        /// <summary>Names of the build rows that are enabled right now, for tests.</summary>
        public IEnumerable<string> EnabledBuildRows
        {
            get
            {
                var names = new List<string>();
                buildRows.Query<Button>().ForEach(b =>
                {
                    if (b.enabledSelf && b.name != null && b.name.StartsWith("build-row-")) names.Add(b.name);
                });
                return names;
            }
        }

        private void BuildLeftColumn()
        {
            leftColumn = new VisualElement { name = "left-column", pickingMode = PickingMode.Ignore };
            leftColumn.style.position = Position.Absolute;
            leftColumn.style.left = 14;
            leftColumn.style.bottom = 14;
            leftColumn.style.width = 300;
            leftColumn.style.flexDirection = FlexDirection.ColumnReverse;
            root.Add(leftColumn);
        }

        private void BuildPanels()
        {
            BuildBaseCard();
            BuildAttackCard();
            BuildBuildPanel();
        }

        /// <summary>A phone held upright: the build panel spans the width, under the message line.</summary>
        private void ApplyNarrowPanels(bool narrowNow)
        {
            buildPanel.style.left = narrowNow ? 14 : StyleKeyword.Auto;
            buildPanel.style.width = narrowNow ? StyleKeyword.Auto : 380;
            buildPanel.style.top = Conquest.Presentation.HudLayout.TopInsetPx + (narrowNow ? 56 : 8);
            buildPanel.style.maxHeight = narrowNow ? 760 : 470;

            // upright phone: the attack card sits under the message line (the empty band above the map), so the target tile is not hidden behind it
            if (narrowNow)
            {
                root.Add(attackCard);
                attackCard.style.position = Position.Absolute;
                attackCard.style.left = 14;
                attackCard.style.right = 14;
                attackCard.style.top = Conquest.Presentation.HudLayout.TopInsetPx + 56;
                attackCard.style.marginBottom = 0;
            }
            else
            {
                leftColumn.Add(attackCard);
                attackCard.style.position = Position.Relative;
                attackCard.style.left = StyleKeyword.Auto;
                attackCard.style.right = StyleKeyword.Auto;
                attackCard.style.top = StyleKeyword.Auto;
                attackCard.style.marginBottom = 8;
            }
        }

        private static void Pad(VisualElement e, int h, int v)
        {
            e.style.paddingLeft = h;
            e.style.paddingRight = h;
            e.style.paddingTop = v;
            e.style.paddingBottom = v;
        }

        private void BuildBaseCard()
        {
            baseCard = Box("base-card", Panel);
            Pad(baseCard, 12, 10);
            baseCard.style.marginBottom = 8;
            baseTitle = MakeLabel("base-title", 19, Ink, true);
            baseTitle.style.whiteSpace = WhiteSpace.Normal;
            baseLevel = MakeLabel("base-level", 15, Dim, false);
            buildOpen = MakeButton("build-open", ButtonFill, 17, () => BuildOpenPressed?.Invoke());
            buildOpen.style.marginTop = 8;
            buildOpen.style.height = 38;
            baseCard.Add(baseTitle);
            baseCard.Add(baseLevel);
            baseCard.Add(buildOpen);
            baseCard.style.display = DisplayStyle.None;
            leftColumn.Add(baseCard);
        }

        private void BuildAttackCard()
        {
            attackCard = Box("attack-card", Panel);
            Pad(attackCard, 12, 10);
            attackCard.style.marginBottom = 8;
            attackTitle = MakeLabel("attack-title", 19, Accent, true);
            attackForce = MakeLabel("attack-force", 15, Ink, false);
            attackOpposing = MakeLabel("attack-opposing", 15, Ink, false);
            attackOdds = MakeLabel("attack-odds", 16, Accent, true);
            attackLoss = MakeLabel("attack-loss", 14, Dim, false);
            attackNote = MakeLabel("attack-note", 12, Dim, false);
            attackError = MakeLabel("attack-error", 15, new Color(1f, 0.6f, 0.5f), true);
            foreach (Label l in new[] { attackForce, attackOpposing, attackOdds, attackLoss, attackNote, attackError })
            {
                l.style.whiteSpace = WhiteSpace.Normal;
                l.style.marginTop = 2;
            }

            var row = new VisualElement { pickingMode = PickingMode.Ignore };
            row.style.flexDirection = FlexDirection.Row;
            row.style.marginTop = 8;
            attackConfirm = MakeButton("attack-confirm", new Color(0.6f, 0.22f, 0.16f), 17, () => AttackConfirmPressed?.Invoke());
            attackConfirm.style.flexGrow = 1;
            attackConfirm.style.height = 38;
            attackCancel = MakeButton("attack-cancel", ButtonOff, 17, () => AttackCancelPressed?.Invoke());
            attackCancel.style.flexGrow = 1;
            attackCancel.style.height = 38;
            attackCancel.style.marginLeft = 6;
            row.Add(attackConfirm);
            row.Add(attackCancel);
            foreach (VisualElement e in new VisualElement[] { attackTitle, attackForce, attackOpposing, attackOdds, attackLoss, attackNote, attackError, row }) attackCard.Add(e);
            attackCard.style.display = DisplayStyle.None;
            leftColumn.Add(attackCard);
        }

        private void BuildBuildPanel()
        {
            buildPanel = Box("build-panel", Panel);
            Pad(buildPanel, 12, 10);
            buildPanel.style.position = Position.Absolute;
            buildPanel.style.right = 14;
            buildPanel.style.top = Conquest.Presentation.HudLayout.TopInsetPx + 8;
            buildPanel.style.width = 380;
            buildPanel.style.maxHeight = 470;
            buildTitle = MakeLabel("build-title", 19, Accent, true);
            buildTitle.style.whiteSpace = WhiteSpace.Normal;
            buildStock = MakeLabel("build-stock", 14, Dim, false);
            buildStock.style.marginBottom = 6;
            buildStock.style.whiteSpace = WhiteSpace.Normal;
            buildRows = new ScrollView(ScrollViewMode.Vertical) { name = "build-rows" };
            buildRows.style.flexShrink = 1;
            buildPlacing = MakeLabel("build-placing", 16, Ink, false);
            buildPlacing.style.whiteSpace = WhiteSpace.Normal;
            buildPlacing.style.marginTop = 4;
            buildConfirm = MakeButton("build-confirm", ButtonFill, 18, () => BuildConfirmPressed?.Invoke());
            buildConfirm.style.height = 40;
            buildConfirm.style.marginTop = 8;
            buildBack = MakeButton("build-back", ButtonOff, 16, () => BuildBackPressed?.Invoke());
            buildBack.style.height = 36;
            buildBack.style.marginTop = 6;
            buildClose = MakeButton("build-close", ButtonOff, 16, () => BuildClosePressed?.Invoke());
            buildClose.style.height = 36;
            buildClose.style.marginTop = 6;
            foreach (VisualElement e in new VisualElement[] { buildTitle, buildStock, buildRows, buildPlacing, buildConfirm, buildBack, buildClose }) buildPanel.Add(e);
            buildPanel.style.display = DisplayStyle.None;
            root.Add(buildPanel);
        }

        private void BuildPause()
        {
            pauseRoot = new VisualElement { name = "pause-menu" };
            pauseRoot.style.position = Position.Absolute;
            pauseRoot.style.left = 0;
            pauseRoot.style.right = 0;
            pauseRoot.style.top = 0;
            pauseRoot.style.bottom = 0;
            pauseRoot.style.backgroundColor = Scrim;
            pauseRoot.style.alignItems = Align.Center;
            pauseRoot.style.justifyContent = Justify.Center;
            var column = Box("pause-column", new Color(0.08f, 0.11f, 0.1f, 0.96f));
            Pad(column, 20, 16);
            column.style.width = 380;
            column.style.maxWidth = Length.Percent(92);
            pauseTitle = MakeLabel("pause-title", 26, Accent, true);
            pauseTitle.style.unityTextAlign = TextAnchor.MiddleCenter;
            pauseTitle.style.marginBottom = 10;
            pauseStatus = MakeLabel("pause-status", 15, Ink, false);
            pauseStatus.style.unityTextAlign = TextAnchor.MiddleCenter;
            pauseStatus.style.whiteSpace = WhiteSpace.Normal;
            pauseStatus.style.minHeight = 22;
            pauseStatus.style.marginBottom = 8;
            pauseResume = PauseButton("pause-resume", () => ResumePressed?.Invoke());
            pauseSave = PauseButton("pause-save", () => SavePressed?.Invoke());
            pauseLoad = PauseButton("pause-load", () => LoadPressed?.Invoke());
            pauseLanguage = PauseButton("pause-language", () => LanguagePressed?.Invoke());
            pauseAutosave = PauseButton("pause-autosave", () => AutosavePressed?.Invoke());
            pauseQuit = PauseButton("pause-quit", () => QuitPressed?.Invoke());
            column.Add(pauseTitle);
            column.Add(pauseStatus);
            foreach (Button b in new[] { pauseResume, pauseSave, pauseLoad, pauseLanguage, pauseAutosave, pauseQuit }) column.Add(b);
            pauseRoot.Add(column);
            pauseRoot.style.display = DisplayStyle.None;
            root.Add(pauseRoot);
        }

        private static Button PauseButton(string name, Action onClick)
        {
            Button b = MakeButton(name, ButtonFill, 20, onClick);
            b.style.height = 48;
            b.style.marginTop = 6;
            return b;
        }

        private void RefreshPanelText()
        {
            menuButton.text = text.Get("ui.menu");
            buildOpen.text = text.Get("ui.build");
            attackConfirm.text = text.Get("ui.attack");
            attackCancel.text = text.Get("ui.cancel");
            buildConfirm.text = text.Get("ui.build_confirm");
            buildBack.text = text.Get("ui.cancel");
            buildClose.text = text.Get("ui.close");
            pauseTitle.text = text.Get("ui.pause_title");
            pauseResume.text = text.Get("ui.resume");
            pauseSave.text = text.Get("ui.save");
            pauseLoad.text = text.Get("ui.load");
            pauseLanguage.text = text.Get("ui.language") + ": " + text.Get("ui.language_name");
            pauseAutosave.text = text.Get("ui.autosave") + ": " + text.Get(autosaveOn ? "ui.on" : "ui.off");
            pauseQuit.text = text.Get("ui.quit_title");
        }

        // ----- updating -----

        /// <summary>Shows the attack preview card, or hides it for null.</summary>
        public void SetAttackCard(AttackCardModel? model)
        {
            attackCard.style.display = model == null ? DisplayStyle.None : DisplayStyle.Flex;
            if (model == null) return;
            attackTitle.text = model.Title;
            Set(attackForce, model.ForceText);
            Set(attackOpposing, model.OpposingText);
            Set(attackOdds, model.OddsText);
            Set(attackLoss, model.LossText);
            Set(attackNote, model.NoteText);
            Set(attackError, model.ErrorText);
            attackConfirm.style.display = model.CanOrder ? DisplayStyle.Flex : DisplayStyle.None;
        }

        private static void Set(Label label, string value)
        {
            label.text = value;
            label.style.display = string.IsNullOrEmpty(value) ? DisplayStyle.None : DisplayStyle.Flex;
        }

        /// <summary>Shows the base card (a clicked base, or the base under the selected unit) with its Build button.</summary>
        public void SetBaseCard(string? title, string levelText)
        {
            baseCard.style.display = title == null ? DisplayStyle.None : DisplayStyle.Flex;
            if (title == null) return;
            baseTitle.text = title;
            baseLevel.text = levelText;
        }

        /// <summary>Shows the build panel, or hides it for null. Rebuilds the rows from the model.</summary>
        public void SetBuildPanel(BuildPanelModel? model)
        {
            buildPanel.style.display = model == null ? DisplayStyle.None : DisplayStyle.Flex;
            if (model == null)
            {
                lastBuildSignature = string.Empty;
                return;
            }

            // Hover and every other interaction change refresh the HUD; rebuilding the rows under a pressed button would
            // swallow its click, so nothing is touched while the model reads the same.
            string signature = Signature(model);
            if (signature == lastBuildSignature) return;
            lastBuildSignature = signature;
            buildTitle.text = model.Title;
            buildStock.text = model.StockText;
            bool placing = model.Placing.HasValue;
            buildRows.style.display = placing ? DisplayStyle.None : DisplayStyle.Flex;
            buildClose.style.display = placing ? DisplayStyle.None : DisplayStyle.Flex;
            buildPlacing.style.display = placing ? DisplayStyle.Flex : DisplayStyle.None;
            buildConfirm.style.display = placing ? DisplayStyle.Flex : DisplayStyle.None;
            buildBack.style.display = placing ? DisplayStyle.Flex : DisplayStyle.None;
            buildPlacing.text = model.PlacingText;
            buildConfirm.SetEnabled(model.CanConfirm);
            buildConfirm.style.backgroundColor = model.CanConfirm ? ButtonFill : ButtonOff;
            buildRows.Clear();
            if (placing) return;
            foreach (BuildRowModel row in model.Rows) buildRows.Add(MakeBuildRow(row));
        }

        private static string Signature(BuildPanelModel model)
        {
            var sb = new System.Text.StringBuilder();
            sb.Append(model.BaseId).Append('|').Append(model.Title).Append('|').Append(model.StockText).Append('|').Append(model.Placing).Append('|').Append(model.PlacingText).Append('|').Append(model.CanConfirm);
            foreach (BuildRowModel r in model.Rows) sb.Append('|').Append(r.RoleId).Append(r.Label).Append(r.CostText).Append(r.Enabled).Append(r.ReasonText);
            return sb.ToString();
        }

        private Button MakeBuildRow(BuildRowModel row)
        {
            BuildingRole role = row.Role;
            Button b = MakeButton("build-row-" + row.RoleId, row.Enabled ? ButtonFill : ButtonOff, 16, () => BuildRolePressed?.Invoke(role));
            b.style.marginBottom = 4;
            b.style.alignItems = Align.FlexStart;
            b.style.unityTextAlign = TextAnchor.MiddleLeft;
            b.style.paddingLeft = 8;
            b.style.paddingRight = 8;
            b.style.paddingTop = 4;
            b.style.paddingBottom = 4;
            b.text = string.Empty;
            Label name = MakeLabel("row-name", 17, row.Enabled ? Ink : Dim, true);
            Label cost = MakeLabel("row-cost", 14, row.Enabled ? Accent : Dim, false);
            b.Add(name);
            b.Add(cost);
            name.text = row.Label;
            cost.text = row.CostText;
            if (!row.Enabled)
            {
                Label reason = MakeLabel("row-reason", 12, new Color(1f, 0.72f, 0.6f), false);
                reason.style.whiteSpace = WhiteSpace.Normal;
                reason.text = row.ReasonText;
                b.Add(reason);
            }

            foreach (Label l in b.Query<Label>().ToList()) l.pickingMode = PickingMode.Ignore;
            b.SetEnabled(row.Enabled);
            return b;
        }

        /// <summary>Attacks the local player has queued this turn (hidden at zero).</summary>
        public void SetQueuedOrders(string? textValue)
        {
            ordersLabel.style.display = string.IsNullOrEmpty(textValue) ? DisplayStyle.None : DisplayStyle.Flex;
            ordersLabel.text = textValue ?? string.Empty;
        }

        public void ShowPause(bool visible)
        {
            pauseRoot.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            if (!visible) pauseStatus.text = string.Empty;
        }

        /// <summary>Enables or disables the pause menu's Save and Load and shows the autosave setting.</summary>
        public void SetPauseState(bool canSave, bool canLoad, bool autosave)
        {
            autosaveOn = autosave;
            pauseSave.SetEnabled(canSave);
            pauseLoad.SetEnabled(canLoad);
            pauseSave.style.backgroundColor = canSave ? ButtonFill : ButtonOff;
            pauseLoad.style.backgroundColor = canLoad ? ButtonFill : ButtonOff;
            RefreshPanelText();
        }

        /// <summary>A line inside the pause menu (the scrim hides the ordinary message line).</summary>
        public void SetPauseStatus(string value) => pauseStatus.text = value;

        public string PauseStatus => pauseStatus.text;
    }
}
