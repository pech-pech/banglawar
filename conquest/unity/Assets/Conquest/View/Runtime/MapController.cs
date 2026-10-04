using System.Collections.Generic;
using System.Text;
using Conquest.Assets.Lookup;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using UnityEngine;
using UnityEngine.UIElements;
using IsoProjection = Conquest.Presentation.IsoProjection;

namespace Conquest.UnityView
{
    /// <summary>
    /// Builds the map view for the running game and drives it each frame: input, camera, picking, selection,
    /// cues, banners and the HUD. It makes no rules decision: the session (core) holds the state, the view
    /// reconciles to it after each answer. Everything it creates is reachable through public properties so tests can
    /// look at it without a screen.
    /// </summary>
    public sealed class MapController : MonoBehaviour
    {
        public const int DebugRefreshFrames = 15;

        private IsoProjection iso = new IsoProjection();
        private InputRouter input = new InputRouter();
        private AnimationDirector director = null!;
        private bool stateDirty = true;
        private bool debugVisible;
        private readonly List<string> eventLog = new List<string>();
        private PickResult lastHover = PickResult.Nothing;
        private Vector2 lastHoverPointer = new Vector2(-1f, -1f);
        private int frame;
        private float fps;
        private int lastClickUnit = -1;
        private float lastClickTime = -10f;
        private readonly List<(StackBadge badge, PixelRect screen)> badgeRects = new List<(StackBadge, PixelRect)>();

        /// <summary>Two clicks on one banner within this time select its whole stack.</summary>
        public const float DoubleClickSeconds = 0.35f;

        public GameSession Session { get; private set; } = null!;

        public ArtLibrary Art { get; private set; } = null!;

        public TileLayer Tiles { get; private set; } = null!;

        public StructureLayer Structures { get; private set; } = null!;

        public BannerLayer Banners { get; private set; } = null!;

        public OverlayLayer Overlay { get; private set; } = null!;

        public CameraRig Rig { get; private set; } = null!;

        public CueRunner Runner { get; private set; } = null!;

        public HudController Hud { get; private set; } = null!;

        public MapInteraction Interaction { get; private set; } = null!;

        public Localizer Text { get; private set; } = null!;

        public bool IsBuilt { get; private set; }

        private void Start()
        {
            if (!IsBuilt) Build();
        }

        /// <summary>Creates all view objects for the current game. Safe to call once; Start calls it when nobody did.</summary>
        public void Build()
        {
            GameApp.EnsureStarted();
            ContentBundle content = GameApp.Content!;
            Session = GameApp.Session!;
            Text = content.Text;
            Art = new ArtLibrary(GameApp.Assets != null ? GameApp.Assets.artCatalog : null);
            iso = new IsoProjection(IsoProjection.DefaultTileWidth, IsoProjection.DefaultTileHeight);
            Camera camera = EnsureCamera();
            Transform world = new GameObject("World").transform;
            world.SetParent(transform, false);
            Tiles = new TileLayer(world, Art, iso, content.Scenario, content.Theme);
            Structures = new StructureLayer(world, Art, iso);
            Banners = new BannerLayer(world, Art, iso, Session.State, Session.LocalSlot);
            Overlay = new OverlayLayer(world, Art, iso);
            Rig = new CameraRig(camera, iso, content.Scenario.Map.Width, content.Scenario.Map.Height, Art.PixelsPerUnit, PolishSettings.Camera, OwnForcesWorld);
            director = new AnimationDirector(CreateClipCatalog());
            Runner = new CueRunner(Banners, Art, iso, () => Session.State, OnAnnounce);
            Interaction = new MapInteraction(Session, Text);
            Interaction.Changed += OnInteractionChanged;
            Hud = HudController.Create(transform, GameApp.Assets, Text, content.Seasons);
            Hud.EndTurnPressed = OnEndTurn;
            Hud.FoundBasePressed = OnFoundBase;
            Hud.LanguagePressed = () => Text.Toggle();
            Hud.PolishPressed = PolishSettings.Cycle;
            Hud.SetPolishLabels(PolishSettings.Current);
            Text.LocaleChanged += OnLocaleChanged;
            Session.Applied += OnApplied;
            PolishSettings.Changed += OnPolishChanged;
            Reconcile();
            Hud.SetTouchMode(false);
            IsBuilt = true;
        }

        private void OnDestroy()
        {
            if (Text != null) Text.LocaleChanged -= OnLocaleChanged;
            if (Session != null) Session.Applied -= OnApplied;
            PolishSettings.Changed -= OnPolishChanged;
        }

        /// <summary>World rectangle around the local player's units (tile centres), for the focus camera candidate.</summary>
        private PixelRect? OwnForcesWorld()
        {
            if (Session == null) return null;
            bool any = false;
            int left = 0, top = 0, right = 0, bottom = 0;
            foreach (Conquest.Core.Turn.Unit u in Session.State.UnitTable)
            {
                if (u.Owner != Session.LocalSlot) continue;
                PixelPoint p = iso.GridToWorld(new GridPos(u.Pos.X, u.Pos.Y));
                if (!any)
                {
                    left = right = p.X;
                    top = bottom = p.Y;
                    any = true;
                }

                left = Mathf.Min(left, p.X);
                right = Mathf.Max(right, p.X);
                top = Mathf.Min(top, p.Y);
                bottom = Mathf.Max(bottom, p.Y);
            }

            return any ? new PixelRect(left, top, right, bottom) : (PixelRect?)null;
        }

        /// <summary>A candidate changed (debug panel, test or tool): re-lay the affected parts; the camera re-fits only for its own decision.</summary>
        private void OnPolishChanged(PolishOptions previous, PolishOptions next)
        {
            if (!IsBuilt) return;
            ApplyPolish(next, previous.Camera != next.Camera);
        }

        public void ApplyPolish(PolishOptions options, bool refitCamera)
        {
            Banners.SetOptions(options);
            Overlay.SetOptions(options);
            Structures.SetOptions(options);
            Tiles.SetPlaceholders(options.Placeholders);
            RefreshRings();
            if (refitCamera) Rig.SetMode(options.Camera);
            Hud.SetPolishLabels(options);
            UpdateDebug(true);
        }

        private void RefreshRings()
        {
            var selected = new List<(GridPos, int)>();
            foreach (int id in Interaction.Selection.SelectedIds)
            {
                if (Session.State.TryGetUnit(id, out Conquest.Core.Contracts.UnitView u)) selected.Add((new GridPos(u.Pos.X, u.Pos.Y), u.Owner));
            }

            Overlay.SetSelectionRings(selected);
        }

        private Camera EnsureCamera()
        {
            Camera? camera = Camera.main;
            if (camera == null)
            {
                var go = new GameObject("Main Camera") { tag = "MainCamera" };
                camera = go.AddComponent<Camera>();
            }

            return camera;
        }

        private IClipCatalog CreateClipCatalog()
        {
            AssetCatalog? catalog = TryCatalog();
            return catalog != null ? new ClipCatalogAdapter(catalog) : (IClipCatalog)new NoClips();
        }

        private AssetCatalog? TryCatalog()
        {
            if (GameApp.Assets == null || GameApp.Assets.artCatalog == null) return null;
            try
            {
                return GameApp.Assets.artCatalog.Catalog;
            }
            catch (System.InvalidOperationException)
            {
                return null;
            }
        }

        private sealed class NoClips : IClipCatalog
        {
            public ClipInfo? Find(string kind, string role, string? state, string? slot, Facing renderDirection) => null;
        }

        // ----- state to view -----

        private void OnApplied(AppliedStep step)
        {
            if (!step.Ok) return;
            IReadOnlyList<PresentationEvent> events = EventMapper.Map(step, Session.Services, Session.LocalSlot);
            foreach (PresentationEvent e in events) Log(e);
            Runner.Enqueue(director.DirectAll(events));
            stateDirty = true;
        }

        private void Log(PresentationEvent e)
        {
            eventLog.Add(e.Kind + (e.UnitId >= 0 ? " u" + e.UnitId : string.Empty) + " " + e.Position);
            if (eventLog.Count > 8) eventLog.RemoveAt(0);
        }

        private void OnAnnounce(AnimationCue cue)
        {
            if (cue.Kind == CueKind.ShowTurn) Hud.ShowMessage(Text.Get("ui.turn") + " " + Localizer.Number(Session.State.Turn + 1), 1.5f);
        }

        /// <summary>Snaps banners, structures, the selection and the HUD to the session's state.</summary>
        public void Reconcile()
        {
            Banners.Reconcile(Session.State);
            Structures.Rebuild(Session.State);
            Interaction.Prune();
            Banners.SetSelection(Interaction.Selection);
            RefreshRings();
            RefreshHud();
            stateDirty = false;
        }

        private void RefreshHud()
        {
            int selected = Interaction.Selection.SelectedIds.Count > 0 ? Interaction.Selection.PrimaryId : -1;
            Hud.Refresh(Session.State, Session.LocalSlot, selected);
        }

        private void OnInteractionChanged()
        {
            Banners.SetSelection(Interaction.Selection);
            RefreshRings();
            Overlay.SetHover(Interaction.Selection.HoveredTile);
            Overlay.SetPending(Interaction.PendingTarget);
            Overlay.ShowPath(Interaction.Preview, Interaction.PendingTarget ?? (Interaction.Selection.CanCommand ? Interaction.Selection.HoveredTile : null));
            if (Interaction.Message != null) Hud.ShowMessage(Interaction.Message, 3f);
            if (Hud != null && !stateDirty) RefreshHud();
        }

        private void OnLocaleChanged(string locale)
        {
            RefreshHud();
        }

        private void OnEndTurn()
        {
            if (Runner.IsBusy) return;
            Interaction.EndTurn();
        }

        private void OnFoundBase()
        {
            if (Runner.IsBusy) return;
            Interaction.FoundBase();
        }

        // ----- per frame -----

        private void Update()
        {
            if (!IsBuilt) return;
            float dt = Time.unscaledDeltaTime;
            fps = Mathf.Lerp(fps, dt > 0f ? 1f / dt : fps, 0.1f);
            Rig.SyncViewport();
            HandleInput(input.Poll(dt), dt);
            Runner.Tick(dt * 1000f);
            if (stateDirty && !Runner.IsBusy) Reconcile();
            UpdateBanners();
            Rig.Apply();
            UpdateDebug();
            frame++;
        }

        private void HandleInput(InputFrame f, float dt)
        {
            if (f.ToggleDebug) SetDebug(!debugVisible);
            if (f.ToggleLanguage) Text.Toggle();
            if (f.Skip) Runner.Skip();
            if (f.EndTurn) OnEndTurn();
            if (f.Cancel) Interaction.Cancel();
            if (f.NextUnit && !Runner.IsBusy) CenterOnSelection(Interaction.SelectNext());
            bool touch = f.TouchMode;
            Hud.SetTouchMode(touch);
            Banners.MinHitPx = HitTargets.MinTargetPx(touch, Mathf.RoundToInt(Screen.dpi));
            ApplyCamera(f);
            if (Runner.IsBusy) return;
            bool overUi = f.HasPointer && Hud.IsPointerOverUi(f.Pointer);
            if (f.HasPointer && !overUi && f.Pointer != lastHoverPointer) HoverAt(f.Pointer);
            if (f.Click && !Hud.IsPointerOverUi(f.ClickPosition)) ClickAt(f.ClickPosition, f.Additive);
            if (f.SecondaryClick && !Hud.IsPointerOverUi(f.ClickPosition)) Interaction.SecondaryClick(PickAt(f.ClickPosition));
        }

        private void ApplyCamera(InputFrame f)
        {
            CameraModel model = Rig.Model;
            int vh = Rig.ViewportHeight;
            if (f.DragDelta != Vector2.zero) model = model.PanByScreenDelta(Mathf.RoundToInt(f.DragDelta.x), -Mathf.RoundToInt(f.DragDelta.y));
            if (f.KeyPan != Vector2.zero) model = model.PanByScreenDelta(-Mathf.RoundToInt(f.KeyPan.x), Mathf.RoundToInt(f.KeyPan.y));
            Vector2Int anchor = ViewSpace.ToModelScreen(f.ZoomAnchor == Vector2.zero ? new Vector2(Rig.ViewportWidth / 2f, vh / 2f) : f.ZoomAnchor, vh);
            if (f.ZoomSteps != 0) model = model.ZoomSteps(f.ZoomSteps, anchor.x, anchor.y, Rig.ZoomStops);
            if (Mathf.Abs(f.PinchFactor - 1f) > 0.001f) model = model.ZoomTo(Mathf.RoundToInt(model.ZoomPermille * f.PinchFactor), anchor.x, anchor.y);
            if (model != Rig.Model) Rig.SetModel(model);
        }

        private void CenterOnSelection(int unitId)
        {
            if (unitId < 0 || !Session.State.TryGetUnit(unitId, out Conquest.Core.Contracts.UnitView u)) return;
            Rig.CenterOnTile(new GridPos(u.Pos.X, u.Pos.Y));
        }

        private void HoverAt(Vector2 unityScreen)
        {
            lastHoverPointer = unityScreen;
            lastHover = PickAt(unityScreen);
            Interaction.Hover(lastHover);
        }

        private void ClickAt(Vector2 unityScreen, bool additive)
        {
            StackBadge? badge = BadgeAt(unityScreen);
            if (badge.HasValue && !additive)
            {
                Interaction.ClickStack(badge.Value.Tile);
                lastClickUnit = -1;
                return;
            }

            PickResult pick = PickAt(unityScreen);
            float now = Time.unscaledTime;
            bool doubleClick = pick.UnitId.HasValue && pick.UnitId.Value == lastClickUnit && now - lastClickTime <= DoubleClickSeconds && !additive;
            lastClickUnit = pick.UnitId ?? -1;
            lastClickTime = now;
            if (doubleClick && pick.Tile.HasValue)
            {
                Interaction.ClickStack(pick.Tile.Value);
                lastClickUnit = -1;
                return;
            }

            Interaction.Click(pick, additive, Hud.TouchMode);
        }

        /// <summary>The stack badge under a screen position (Unity origin), if any.</summary>
        public StackBadge? BadgeAt(Vector2 unityScreen)
        {
            Vector2Int p = ViewSpace.ToModelScreen(unityScreen, Rig.ViewportHeight);
            foreach ((StackBadge badge, PixelRect rect) in badgeRects)
            {
                if (rect.Contains(p.x, p.y)) return badge;
            }

            return null;
        }

        /// <summary>Unity screen position of a stack's badge centre (for tests and tools); null when the stack shows none.</summary>
        public Vector2? ScreenPointOfBadge(GridPos tile)
        {
            UpdateBadges();
            foreach ((StackBadge badge, PixelRect rect) in badgeRects)
            {
                if (badge.Tile == tile) return ViewSpace.ToUnityScreen((rect.Left + rect.Right) / 2, (rect.Top + rect.Bottom) / 2, Rig.ViewportHeight);
            }

            return null;
        }

        public IReadOnlyList<(StackBadge badge, PixelRect screen)> BadgeRects => badgeRects;

        /// <summary>Places the stack badges: a world anchor on the lead banner, a fixed size on screen (it scales with the HUD, not the zoom).</summary>
        private void UpdateBadges()
        {
            badgeRects.Clear();
            IPanel? panel = Hud.Root.panel;
            var items = new List<(Vector2, string, int)>();
            int vh = Rig.ViewportHeight;
            float panelHeight = Hud.Root.layout.height;
            float scale = panelHeight > 1f && !float.IsNaN(panelHeight) ? vh / panelHeight : CameraFit.HudScalePermille(Rig.ViewportWidth, vh) / 1000f;
            float half = HudController.BadgeSize * scale / 2f;
            float nudge = HudController.BadgeSize * 0.1f; // a little outside and above the cloth's corner
            foreach (StackBadge badge in Banners.Badges())
            {
                Vector3 s = Rig.Camera.WorldToScreenPoint(badge.AnchorWorld);
                // panel units are screen pixels over the panel's scale, y down (RuntimePanelUtils' world-to-panel
                // flips y when the panel draws into a RenderTexture, so the conversion is done here)
                float dx = PolishSettings.Stack == StackStyle.LeadPeek ? -nudge : nudge; // the peek badge sits on the left
                var panelCentre = new Vector2(s.x / scale + dx, (vh - s.y) / scale - nudge);
                string label = (badge.Plus ? "+" : string.Empty) + Localizer.Number(badge.Number);
                items.Add((panelCentre, label, badge.Owner));
                var screen = new Vector2(panelCentre.x * scale, vh - panelCentre.y * scale);
                Vector2Int m = ViewSpace.ToModelScreen(screen, vh);
                int h = Mathf.CeilToInt(half);
                badgeRects.Add((badge, new PixelRect(m.x - h, m.y - h, m.x + h, m.y + h)));
            }

            if (panel != null) Hud.SetBadges(items);
        }

        /// <summary>The banner or tile under a screen position (Unity origin, bottom-left).</summary>
        public PickResult PickAt(Vector2 unityScreen)
        {
            int vh = Rig.ViewportHeight;
            Vector2Int p = ViewSpace.ToModelScreen(unityScreen, vh);
            Rig.SyncViewport();
            IReadOnlyList<BannerRect> rects = Banners.HitRects(Rig.Camera, vh);
            var map = Session.State.Map;
            return TilePicker.Pick(Rig.Model, iso, map.Width, map.Height, p.x, p.y, rects, Banners);
        }

        /// <summary>Test and tool entry point: a left click or tap at a screen position.</summary>
        public void SimulateClick(Vector2 unityScreen, bool additive = false)
        {
            ClickAt(unityScreen, additive);
        }

        public void SimulateHover(Vector2 unityScreen) => HoverAt(unityScreen);

        /// <summary>Unity screen position of a tile's centre.</summary>
        public Vector2 ScreenPointOfTile(GridPos tile)
        {
            Vector3 world = ViewSpace.ToWorld(iso.GridToWorld(tile), Art.PixelsPerUnit);
            Vector3 s = Rig.Camera.WorldToScreenPoint(world);
            return new Vector2(s.x, s.y);
        }

        /// <summary>
        /// A screen point on a banner's cloth that no banner drawn in front of it (and no badge) covers, so a click
        /// there reaches exactly that unit. Falls back to the cloth's centre.
        /// </summary>
        public Vector2 ScreenPointOfBanner(int unitId)
        {
            Banners.TryGet(unitId, out BannerView view);
            int vh = Rig.ViewportHeight;
            PixelRect r = view.ScreenRect(Rig.Camera, vh);
            var others = new List<BannerRect>();
            foreach (BannerRect b in Banners.HitRects(Rig.Camera, vh))
            {
                if (b.UnitId != unitId && b.SortKey >= view.SortKey) others.Add(b);
            }

            int[] rows = { 5, 3, 7, 1, 9 };
            foreach (int row in rows)
            {
                for (int column = 1; column < 10; column += 2)
                {
                    int x = r.Left + r.Width * column / 10;
                    int y = r.Top + r.Height * row / 10;
                    bool covered = false;
                    foreach (BannerRect o in others) covered |= o.ScreenRect.Contains(x, y);
                    Vector2 point = ViewSpace.ToUnityScreen(x, y, vh);
                    if (!covered && BadgeAt(point) == null) return point;
                }
            }

            return ViewSpace.ToUnityScreen((r.Left + r.Right) / 2, (r.Top + r.Bottom) / 2, vh);
        }

        public void PressEndTurn() => OnEndTurn();

        private void UpdateBanners()
        {
            double now = Time.unscaledTimeAsDouble;
            int nowMs = (int)(Time.unscaledTime * 1000f);
            SelectionModel sel = Interaction.Selection;
            foreach (KeyValuePair<int, BannerView> pair in Banners.Banners)
            {
                BannerView view = pair.Value;
                BannerVisualState next = BannerVisualRules.Resolve(sel.IsSelected(pair.Key), sel.HoveredUnitId == pair.Key, false);
                view.SetVisual(next, nowMs);
            }

            Banners.Tick(now, nowMs);
            UpdateBadges();
        }

        // ----- debug panel -----

        public void SetDebug(bool value)
        {
            debugVisible = value;
            Hud.SetDebugVisible(value);
            if (value) UpdateDebug(true);
        }

        private void UpdateDebug(bool force = false)
        {
            if (!debugVisible || (!force && frame % DebugRefreshFrames != 0)) return;
            SelectionModel sel = Interaction.Selection;
            CameraModel cam = Rig.Model;
            var sb = new StringBuilder();
            sb.AppendLine("fps " + Mathf.RoundToInt(fps) + "   locale " + Text.Locale);
            sb.AppendLine(PolishSettings.Current.Describe());
            sb.AppendLine("turn " + (Session.State.Turn + 1) + "   hash " + StateHasher.HashHex(Session.State));
            sb.AppendLine("camera zoom " + cam.ZoomPermille + "  centre " + cam.CenterX + "," + cam.CenterY);
            sb.AppendLine("hover " + (sel.HoveredTile.HasValue ? sel.HoveredTile.Value.ToString() : "-") + "  unit " + sel.HoveredUnitId);
            sb.AppendLine("selected [" + string.Join(",", sel.SelectedIds) + "]  mode " + sel.Mode);
            sb.AppendLine("pending " + (Interaction.PendingTarget.HasValue ? Interaction.PendingTarget.Value.ToString() : "-") + "  path steps " + Interaction.Preview.Steps.Count + "  cost " + Interaction.Preview.TotalCost);
            sb.AppendLine("orders sent " + Interaction.OrdersSent + "  last error " + (Interaction.LastErrorCode ?? "-"));
            sb.AppendLine("tiles " + Tiles.TileCount + " (art " + Tiles.ArtTileCount + ")  banners " + Banners.Count + "  structures " + Structures.PieceCount + " (art " + Structures.ArtPieceCount + ")");
            sb.AppendLine("art " + (Art.HasCatalog ? "catalog" : "none") + "  hits " + Art.ArtHits + "/" + Art.PlaceholderHits + "  cues " + Runner.Started + (Runner.IsBusy ? " busy" : " idle") + "  clip " + (Runner.LastClipKey ?? "-"));
            sb.AppendLine("events:");
            foreach (string line in eventLog) sb.AppendLine("  " + line);
            Hud.SetDebugText(sb.ToString());
        }
    }
}
