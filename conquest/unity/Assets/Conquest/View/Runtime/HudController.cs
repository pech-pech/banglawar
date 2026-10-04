using System;
using System.Collections.Generic;
using System.Text;
using Conquest.Core.Turn;
using Conquest.Glue;
using UnityEngine;
using UnityEngine.UIElements;

namespace Conquest.UnityView
{
    /// <summary>
    /// The UI Toolkit overlay, built in code: resource bar and season/turn indicator across the top, the unit card at
    /// the bottom left, the end-turn button at the bottom right, a message line, the language switch and the debug
    /// panel. It only shows view-models (<see cref="HudModels"/>) and reports button presses through callbacks.
    /// Elements carry names (resource-bar, season-indicator, unit-card, end-turn, language-button, message,
    /// debug-panel) so tests can find them.
    /// </summary>
    public sealed class HudController : MonoBehaviour
    {
        private static readonly Color Panel = new Color(0.08f, 0.11f, 0.1f, 0.86f);
        private static readonly Color Ink = new Color(0.95f, 0.96f, 0.92f);
        private static readonly Color Dim = new Color(0.72f, 0.78f, 0.74f);
        private static readonly Color Accent = new Color(0.98f, 0.86f, 0.4f);
        private static readonly Color ButtonFill = new Color(0.2f, 0.42f, 0.32f);
        private static readonly Color ButtonOff = new Color(0.25f, 0.28f, 0.27f);

        private UIDocument document = null!;
        private Localizer text = null!;
        private SeasonLookup seasons = null!;
        private FontProvider fonts = null!;
        private VisualElement root = null!;
        private VisualElement resourceBar = null!;
        private Label turnLabel = null!;
        private Label seasonLabel = null!;
        private Button languageButton = null!;
        private VisualElement unitCard = null!;
        private Label cardTitle = null!;
        private Label cardLevel = null!;
        private Label cardStrength = null!;
        private Label cardMoves = null!;
        private Label cardOwner = null!;
        private Button foundButton = null!;
        private Button endTurnButton = null!;
        private Label message = null!;
        private Label hint = null!;
        private VisualElement debugPanel = null!;
        private Label debugText = null!;
        private VisualElement badgeLayer = null!;
        private readonly List<Label> badges = new List<Label>();
        private readonly Dictionary<Conquest.Presentation.PolishDecision, Button> polishButtons = new Dictionary<Conquest.Presentation.PolishDecision, Button>();
        private float messageUntil;
        private bool touchMode;
        private bool narrow;

        /// <summary>Below this panel width (a phone held upright) the HUD drops the resource names and re-flows the message line.</summary>
        public const float NarrowPanelWidth = 900f;

        public bool Narrow => narrow;

        public Action? EndTurnPressed { get; set; }

        public Action? FoundBasePressed { get; set; }

        public Action? LanguagePressed { get; set; }

        /// <summary>A debug-panel candidate button was pressed (cycle that decision C1, C2, C3).</summary>
        public Action<Conquest.Presentation.PolishDecision>? PolishPressed { get; set; }

        public VisualElement Root => root;

        /// <summary>The hint strip under the top bar (a fixed band the map is never fitted under).</summary>
        public VisualElement HintStrip => hint;

        public bool DebugVisible => debugPanel.style.display.value != DisplayStyle.None;

        public UIDocument Document => document;

        public static HudController Create(Transform parent, ViewAssets? assets, Localizer text, SeasonLookup seasons)
        {
            var go = new GameObject("HUD");
            go.transform.SetParent(parent, false);
            var hud = go.AddComponent<HudController>();
            hud.Build(go, assets, text, seasons);
            return hud;
        }

        private void Build(GameObject host, ViewAssets? assets, Localizer localizer, SeasonLookup seasonLookup)
        {
            text = localizer;
            seasons = seasonLookup;
            fonts = new FontProvider(assets != null ? assets.bengaliFont : null);
            PanelSettings settings = assets != null && assets.panelSettings != null ? assets.panelSettings : CreatePanelSettings();
            document = host.AddComponent<UIDocument>();
            document.panelSettings = settings;
            root = document.rootVisualElement;
            root.style.position = Position.Absolute;
            root.style.left = 0;
            root.style.top = 0;
            root.style.right = 0;
            root.style.bottom = 0;
            root.pickingMode = PickingMode.Ignore;
            BuildBadges();
            BuildTopBar();
            BuildUnitCard();
            BuildBottomRight();
            BuildMessages();
            BuildDebug();
            root.RegisterCallback<GeometryChangedEvent>(e => SetNarrow(e.newRect.width > 0f && e.newRect.width < NarrowPanelWidth));
            text.LocaleChanged += OnLocaleChanged;
            ApplyFonts();
            RefreshStaticText();
        }

        private static PanelSettings CreatePanelSettings()
        {
            var settings = ScriptableObject.CreateInstance<PanelSettings>();
            settings.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            settings.referenceResolution = new Vector2Int(1280, 720);
            settings.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            settings.match = 0.5f;
            return settings;
        }

        private void OnDestroy()
        {
            if (text != null) text.LocaleChanged -= OnLocaleChanged;
        }

        // ----- construction -----

        private void BuildTopBar()
        {
            VisualElement bar = Box("top-bar", Panel);
            bar.style.position = Position.Absolute;
            bar.style.left = 0;
            bar.style.right = 0;
            bar.style.top = 0;
            bar.style.height = Conquest.Presentation.HudLayout.TopBarPx;
            bar.style.flexDirection = FlexDirection.Row;
            bar.style.alignItems = Align.Center;
            bar.style.paddingLeft = 12;
            bar.style.paddingRight = 12;
            resourceBar = new VisualElement { name = "resource-bar", pickingMode = PickingMode.Ignore };
            resourceBar.style.flexDirection = FlexDirection.Row;
            resourceBar.style.flexGrow = 1;
            bar.Add(resourceBar);
            VisualElement season = new VisualElement { name = "season-indicator", pickingMode = PickingMode.Ignore };
            season.style.alignItems = Align.FlexEnd;
            season.style.marginRight = 14;
            turnLabel = MakeLabel("turn-label", 20, Accent, true);
            seasonLabel = MakeLabel("season-label", 14, Dim, false);
            season.Add(turnLabel);
            season.Add(seasonLabel);
            bar.Add(season);
            languageButton = MakeButton("language-button", ButtonFill, 16, () => LanguagePressed?.Invoke());
            languageButton.style.minWidth = 84;
            languageButton.style.height = 36;
            bar.Add(languageButton);
            root.Add(bar);
        }

        private void BuildUnitCard()
        {
            unitCard = Box("unit-card", Panel);
            unitCard.style.position = Position.Absolute;
            unitCard.style.left = 14;
            unitCard.style.bottom = 14;
            unitCard.style.width = 300;
            unitCard.style.paddingLeft = 12;
            unitCard.style.paddingRight = 12;
            unitCard.style.paddingTop = 10;
            unitCard.style.paddingBottom = 10;
            VisualElement titleRow = new VisualElement { pickingMode = PickingMode.Ignore };
            titleRow.style.flexDirection = FlexDirection.Row;
            titleRow.style.alignItems = Align.Center;
            cardOwner = MakeLabel("card-owner", 18, Color.black, true);
            cardOwner.style.backgroundColor = Accent;
            cardOwner.style.width = 28;
            cardOwner.style.height = 28;
            cardOwner.style.unityTextAlign = TextAnchor.MiddleCenter;
            cardOwner.style.marginRight = 8;
            cardOwner.style.borderTopLeftRadius = 14;
            cardOwner.style.borderTopRightRadius = 14;
            cardOwner.style.borderBottomLeftRadius = 14;
            cardOwner.style.borderBottomRightRadius = 14;
            cardTitle = MakeLabel("card-title", 19, Ink, true);
            cardTitle.style.whiteSpace = WhiteSpace.Normal;
            cardTitle.style.flexShrink = 1;
            titleRow.Add(cardOwner);
            titleRow.Add(cardTitle);
            cardLevel = MakeLabel("card-level", 15, Dim, false);
            cardStrength = MakeLabel("card-strength", 15, Dim, false);
            cardMoves = MakeLabel("card-moves", 15, Dim, false);
            foundButton = MakeButton("found-base", ButtonFill, 16, () => FoundBasePressed?.Invoke());
            foundButton.style.marginTop = 8;
            foundButton.style.height = 34;
            unitCard.Add(titleRow);
            unitCard.Add(cardLevel);
            unitCard.Add(cardStrength);
            unitCard.Add(cardMoves);
            unitCard.Add(foundButton);
            unitCard.style.display = DisplayStyle.None;
            root.Add(unitCard);
        }

        private void BuildBottomRight()
        {
            endTurnButton = MakeButton("end-turn", ButtonFill, 24, () => EndTurnPressed?.Invoke());
            endTurnButton.style.position = Position.Absolute;
            endTurnButton.style.right = 14;
            endTurnButton.style.bottom = 14;
            endTurnButton.style.width = 230;
            endTurnButton.style.height = 66;
            root.Add(endTurnButton);
        }

        private void BuildMessages()
        {
            message = MakeLabel("message", 20, Accent, true);
            message.style.position = Position.Absolute;
            message.style.left = 340;
            message.style.right = 260;
            message.style.bottom = 20;
            message.style.unityTextAlign = TextAnchor.MiddleCenter;
            message.style.backgroundColor = Panel;
            message.style.paddingTop = 6;
            message.style.paddingBottom = 6;
            message.style.display = DisplayStyle.None;
            message.pickingMode = PickingMode.Ignore;
            root.Add(message);
            hint = MakeLabel("hint", 14, Dim, false);
            hint.style.position = Position.Absolute;
            hint.style.left = 0;
            hint.style.right = 0;
            hint.style.top = Conquest.Presentation.HudLayout.TopBarPx; // its own strip under the bar, outside the area the camera fits the map into
            hint.style.height = Conquest.Presentation.HudLayout.HintStripPx;
            hint.style.backgroundColor = Panel;
            hint.style.unityTextAlign = TextAnchor.MiddleCenter;
            root.Add(hint);
        }

        private void BuildDebug()
        {
            debugPanel = Box("debug-panel", new Color(0f, 0f, 0f, 0.78f));
            debugPanel.style.position = Position.Absolute;
            debugPanel.style.right = 14;
            debugPanel.style.top = Conquest.Presentation.HudLayout.TopInsetPx + 6;
            debugPanel.style.width = 420;
            debugPanel.style.paddingLeft = 10;
            debugPanel.style.paddingTop = 8;
            debugPanel.style.paddingBottom = 8;
            debugPanel.style.paddingRight = 10;
            debugText = MakeLabel("debug-text", 12, new Color(0.7f, 1f, 0.75f), false);
            debugText.style.whiteSpace = WhiteSpace.Normal;
            debugPanel.Add(debugText);
            var row = new VisualElement { name = "polish-buttons" };
            row.style.flexDirection = FlexDirection.Row;
            row.style.flexWrap = Wrap.Wrap;
            row.style.marginTop = 6;
            foreach (Conquest.Presentation.PolishDecision decision in (Conquest.Presentation.PolishDecision[])Enum.GetValues(typeof(Conquest.Presentation.PolishDecision)))
            {
                Conquest.Presentation.PolishDecision captured = decision;
                Button b = MakeButton("polish-" + decision, ButtonFill, 11, () => PolishPressed?.Invoke(captured));
                b.style.marginRight = 4;
                b.style.marginBottom = 4;
                b.style.height = 24;
                polishButtons[decision] = b;
                row.Add(b);
            }

            debugPanel.Add(row);
            debugPanel.style.display = DisplayStyle.None;
            root.Add(debugPanel);
        }

        private void BuildBadges()
        {
            badgeLayer = new VisualElement { name = "stack-badges", pickingMode = PickingMode.Ignore };
            badgeLayer.style.position = Position.Absolute;
            badgeLayer.style.left = 0;
            badgeLayer.style.top = 0;
            badgeLayer.style.right = 0;
            badgeLayer.style.bottom = 0;
            root.Add(badgeLayer);
        }

        /// <summary>Badge size in panel units (scaled with the panel): a disc wide enough for two digits.</summary>
        public const int BadgeSize = 22;

        /// <summary>Shows the stack count badges at panel positions (their centres). Pooled labels; picking is done by the map.</summary>
        public void SetBadges(IReadOnlyList<(Vector2 panelCentre, string text, int owner)> items)
        {
            while (badges.Count < items.Count)
            {
                Label b = MakeLabel("stack-badge", 13, Ink, true);
                b.style.position = Position.Absolute;
                b.style.width = BadgeSize;
                b.style.height = BadgeSize;
                b.style.unityTextAlign = TextAnchor.MiddleCenter;
                b.style.borderTopLeftRadius = BadgeSize / 2f;
                b.style.borderTopRightRadius = BadgeSize / 2f;
                b.style.borderBottomLeftRadius = BadgeSize / 2f;
                b.style.borderBottomRightRadius = BadgeSize / 2f;
                b.style.borderTopWidth = 2;
                b.style.borderBottomWidth = 2;
                b.style.borderLeftWidth = 2;
                b.style.borderRightWidth = 2;
                Color rim = new Color(0.98f, 0.95f, 0.85f, 1f);
                b.style.borderTopColor = rim;
                b.style.borderBottomColor = rim;
                b.style.borderLeftColor = rim;
                b.style.borderRightColor = rim;
                b.style.paddingLeft = 0;
                b.style.paddingRight = 0;
                b.style.paddingTop = 0;
                b.style.paddingBottom = 0;
                badgeLayer.Add(b);
                badges.Add(b);
            }

            for (int i = 0; i < badges.Count; i++)
            {
                Label b = badges[i];
                if (i >= items.Count)
                {
                    b.style.display = DisplayStyle.None;
                    continue;
                }

                b.style.display = DisplayStyle.Flex;
                b.text = items[i].text;
                b.style.left = items[i].panelCentre.x - BadgeSize / 2f;
                b.style.top = items[i].panelCentre.y - BadgeSize / 2f;
                b.style.backgroundColor = items[i].owner == 0 ? new Color(0.12f, 0.44f, 0.47f, 1f) : new Color(0.62f, 0.4f, 0.05f, 1f);
            }
        }

        public int VisibleBadges
        {
            get
            {
                int n = 0;
                foreach (Label b in badges)
                {
                    if (b.style.display != DisplayStyle.None) n++;
                }

                return n;
            }
        }

        public void SetPolishLabels(Conquest.Presentation.PolishOptions options)
        {
            foreach (KeyValuePair<Conquest.Presentation.PolishDecision, Button> pair in polishButtons)
            {
                pair.Value.text = PolishLabel(pair.Key) + " " + options.Get(pair.Key);
            }
        }

        private static string PolishLabel(Conquest.Presentation.PolishDecision d)
        {
            switch (d)
            {
                case Conquest.Presentation.PolishDecision.BannerSize: return "size";
                case Conquest.Presentation.PolishDecision.Stack: return "stack";
                case Conquest.Presentation.PolishDecision.Selection: return "select";
                case Conquest.Presentation.PolishDecision.CameraFit: return "camera";
                case Conquest.Presentation.PolishDecision.Layering: return "layer";
                case Conquest.Presentation.PolishDecision.Footprint: return "anchor";
                default: return "placeholder";
            }
        }

        private static VisualElement Box(string name, Color fill)
        {
            var e = new VisualElement { name = name };
            e.style.backgroundColor = fill;
            e.style.borderTopLeftRadius = 8;
            e.style.borderTopRightRadius = 8;
            e.style.borderBottomLeftRadius = 8;
            e.style.borderBottomRightRadius = 8;
            return e;
        }

        private static Label MakeLabel(string name, int size, Color color, bool bold)
        {
            var label = new Label { name = name, pickingMode = PickingMode.Ignore };
            label.style.fontSize = size;
            label.style.color = color;
            label.style.unityFontStyleAndWeight = bold ? FontStyle.Bold : FontStyle.Normal;
            label.style.marginLeft = 0;
            label.style.marginTop = 0;
            label.style.marginBottom = 0;
            label.style.marginRight = 0;
            return label;
        }

        private static Button MakeButton(string name, Color fill, int size, Action onClick)
        {
            var button = new Button(onClick) { name = name };
            button.style.backgroundColor = fill;
            button.style.color = Ink;
            button.style.fontSize = size;
            button.style.unityFontStyleAndWeight = FontStyle.Bold;
            button.style.borderTopWidth = 2;
            button.style.borderBottomWidth = 2;
            button.style.borderLeftWidth = 2;
            button.style.borderRightWidth = 2;
            Color edge = new Color(0.9f, 0.95f, 0.85f, 0.6f);
            button.style.borderTopColor = edge;
            button.style.borderBottomColor = edge;
            button.style.borderLeftColor = edge;
            button.style.borderRightColor = edge;
            button.style.borderTopLeftRadius = 8;
            button.style.borderTopRightRadius = 8;
            button.style.borderBottomLeftRadius = 8;
            button.style.borderBottomRightRadius = 8;
            return button;
        }

        // ----- updating -----

        private void OnLocaleChanged(string locale)
        {
            ApplyFonts();
            RefreshStaticText();
        }

        private void ApplyFonts() => fonts.Apply(root, text.Locale);

        private void RefreshStaticText()
        {
            languageButton.text = text.Get("ui.language_switch");
            foundButton.text = text.Get("ui.found_base");
            hint.text = text.Get(touchMode ? "ui.hint_touch" : "ui.hint_move");
        }

        private void SetNarrow(bool value)
        {
            if (narrow == value) return;
            narrow = value;
            message.style.left = value ? 14 : 340;
            message.style.right = value ? 14 : 260;
            message.style.bottom = value ? 100 : 20;
            resourceBar.Query<VisualElement>(className: null).ForEach(e =>
            {
                if (e.name != null && e.name.StartsWith("chip-")) StyleChip(e);
            });
        }

        private void StyleChip(VisualElement chip)
        {
            chip.style.marginRight = narrow ? 10 : 16;
            chip.style.minWidth = narrow ? 0 : 70;
            Label? name = chip.Q<Label>("name");
            if (name != null) name.style.display = narrow ? DisplayStyle.None : DisplayStyle.Flex;
        }

        public void SetTouchMode(bool value)
        {
            if (touchMode == value) return;
            touchMode = value;
            RefreshStaticText();
        }

        public void Refresh(GameState state, int localSlot, int selectedUnit)
        {
            RefreshResources(state, localSlot);
            TurnBarModel bar = HudModels.TurnBar(state, localSlot, seasons, text);
            turnLabel.text = bar.TurnText;
            seasonLabel.text = bar.SeasonText;
            endTurnButton.text = bar.EndTurnText;
            endTurnButton.SetEnabled(bar.EndTurnEnabled);
            endTurnButton.style.backgroundColor = bar.EndTurnEnabled ? ButtonFill : ButtonOff;
            UnitCardModel? card = selectedUnit >= 0 ? HudModels.Card(state, selectedUnit, localSlot, text) : null;
            ShowCard(card);
            RefreshStaticText();
        }

        private void RefreshResources(GameState state, int localSlot)
        {
            IReadOnlyList<ResourceChip> chips = HudModels.Resources(state, localSlot, text);
            resourceBar.Clear();
            foreach (ResourceChip chip in chips)
            {
                VisualElement box = new VisualElement { name = "chip-" + chip.Id, pickingMode = PickingMode.Ignore };
                box.style.marginRight = 16;
                box.style.minWidth = 70;
                VisualElement top = new VisualElement { pickingMode = PickingMode.Ignore };
                top.style.flexDirection = FlexDirection.Row;
                top.style.alignItems = Align.Center;
                Label badge = MakeLabel("badge", 16, Accent, true);
                badge.text = chip.Badge;
                badge.style.marginRight = 5;
                Label amount = MakeLabel("amount", 20, Ink, true);
                amount.text = Localizer.Number(chip.Amount);
                top.Add(badge);
                top.Add(amount);
                Label name = MakeLabel("name", 11, Dim, false);
                name.text = chip.Label;
                box.Add(top);
                box.Add(name);
                StyleChip(box);
                resourceBar.Add(box);
            }
        }

        private void ShowCard(UnitCardModel? card)
        {
            if (card == null)
            {
                unitCard.style.display = DisplayStyle.None;
                return;
            }

            unitCard.style.display = DisplayStyle.Flex;
            cardTitle.text = card.Title;
            cardLevel.text = card.LevelText;
            cardStrength.text = card.StrengthText;
            cardMoves.text = card.MovesText;
            cardOwner.text = card.OwnerBadge;
            foundButton.style.display = card.CanFoundBase ? DisplayStyle.Flex : DisplayStyle.None;
        }

        public void ShowMessage(string? value, float seconds = 3f)
        {
            if (string.IsNullOrEmpty(value))
            {
                message.style.display = DisplayStyle.None;
                messageUntil = 0f;
                return;
            }

            message.text = value;
            message.style.display = DisplayStyle.Flex;
            messageUntil = Time.unscaledTime + seconds;
        }

        public string CurrentMessage => message.style.display == DisplayStyle.None ? string.Empty : message.text;

        private void Update()
        {
            if (messageUntil > 0f && Time.unscaledTime > messageUntil) ShowMessage(null);
        }

        public void SetDebugVisible(bool value) => debugPanel.style.display = value ? DisplayStyle.Flex : DisplayStyle.None;

        public void SetDebugText(string value) => debugText.text = value;

        public bool IsPointerOverUi(Vector2 unityScreen)
        {
            IPanel? panel = root.panel;
            if (panel == null) return false;
            Vector2 panelPos = RuntimePanelUtils.ScreenToPanel(panel, new Vector2(unityScreen.x, Screen.height - unityScreen.y));
            VisualElement? picked = panel.Pick(panelPos);
            return picked != null && picked != root;
        }

        /// <summary>Plain text of the visible labels, for tests and the debug panel.</summary>
        public string DumpText()
        {
            var sb = new StringBuilder();
            root.Query<Label>().ForEach(l =>
            {
                if (!string.IsNullOrEmpty(l.text)) sb.Append(l.text).Append(" | ");
            });
            root.Query<Button>().ForEach(b => sb.Append("[").Append(b.text).Append("] "));
            return sb.ToString();
        }
    }
}
