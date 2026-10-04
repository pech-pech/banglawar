using System.Collections.Generic;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using UnityEngine;
using UnityEngine.Rendering;

namespace Conquest.UnityView
{
    /// <summary>A stack's count badge: where it goes and what it says.</summary>
    public readonly struct StackBadge
    {
        public StackBadge(GridPos tile, int leadId, int owner, int number, bool plus, Vector3 anchorWorld)
        {
            Tile = tile;
            LeadId = leadId;
            Owner = owner;
            Number = number;
            Plus = plus;
            AnchorWorld = anchorWorld;
        }

        public GridPos Tile { get; }

        public int LeadId { get; }

        public int Owner { get; }

        public int Number { get; }

        /// <summary>True for "+n" (hidden units), false for the whole count.</summary>
        public bool Plus { get; }

        public Vector3 AnchorWorld { get; }
    }

    /// <summary>
    /// The banners of all units: creates, places, removes and hit-tests them. State is the only authority. Units
    /// sharing a tile are laid out by <see cref="StackLayout"/> with the lead from <see cref="UnitStack"/> in front.
    /// </summary>
    public sealed class BannerLayer : ITileOccupancy
    {
        private readonly Transform root;
        private readonly SortingGroup group;
        private readonly ArtLibrary art;
        private readonly IsoProjection iso;
        private readonly Dictionary<int, BannerView> banners = new Dictionary<int, BannerView>();
        private readonly Dictionary<GridPos, List<StackMember>> stacks = new Dictionary<GridPos, List<StackMember>>();
        private readonly Dictionary<GridPos, int> leads = new Dictionary<GridPos, int>();
        private GameState state;
        private SelectionModel selection;
        private PolishOptions options = PolishSettings.Current;

        public BannerLayer(Transform parent, ArtLibrary art, IsoProjection iso, GameState state, int localSlot = 0)
        {
            root = new GameObject("Banners").transform;
            root.SetParent(parent, false);
            group = root.gameObject.AddComponent<SortingGroup>();
            this.art = art;
            this.iso = iso;
            this.state = state;
            selection = SelectionModel.Create(localSlot);
            ApplyLayering();
        }

        public IReadOnlyDictionary<int, BannerView> Banners => banners;

        public int Count => banners.Count;

        public Transform Root => root;

        /// <summary>Minimum hit size in screen pixels (0 = the picture's own rectangle).</summary>
        public int MinHitPx { get; set; }

        public bool TryGet(int unitId, out BannerView view) => banners.TryGetValue(unitId, out view!);

        public BannerView GetOrCreate(int unitId)
        {
            if (banners.TryGetValue(unitId, out BannerView? existing)) return existing;
            int index = state.FindUnitIndex(unitId);
            Unit u = index >= 0 ? state.UnitTable[index] : new Unit(unitId, 0, Conquest.Core.Contracts.UnitRole.Line, 1, 1, new Conquest.Core.Contracts.TileCoord(0, 0), 0);
            string role = EventMapper.RoleName(Conquest.Core.Contracts.RoleIds.Of(u.Role));
            BannerView view = BannerView.Create(root, art, unitId, u.Owner, role, EventMapper.SlotId(u.Owner));
            view.Configure(options.Sizing, options.Selection);
            banners[unitId] = view;
            return view;
        }

        /// <summary>Applies new candidates: every banner re-sizes, the band group switches, stacks are laid out again.</summary>
        public void SetOptions(PolishOptions value)
        {
            options = value;
            foreach (BannerView view in banners.Values) view.Configure(options.Sizing, options.Selection);
            ApplyLayering();
            Layout();
        }

        private void ApplyLayering()
        {
            int? band = DrawOrder.GroupOrder(options.Layering, DrawRole.Banner);
            group.enabled = band.HasValue;
            if (band.HasValue) group.sortingOrder = band.Value;
        }

        /// <summary>Makes the banners match the state: one per unit, on its tile, none extra. Busy banners keep their position.</summary>
        public void Reconcile(GameState current)
        {
            state = current;
            stacks.Clear();
            foreach (Unit u in current.UnitTable)
            {
                var tile = new GridPos(u.Pos.X, u.Pos.Y);
                if (!stacks.TryGetValue(tile, out List<StackMember>? list)) stacks[tile] = list = new List<StackMember>();
                list.Add(new StackMember(u.Id, u.Owner, BannerSizeClasses.Of(EventMapper.RoleName(Conquest.Core.Contracts.RoleIds.Of(u.Role)))));
                GetOrCreate(u.Id);
            }

            var gone = new List<int>();
            foreach (KeyValuePair<int, BannerView> pair in banners)
            {
                if (current.FindUnitIndex(pair.Key) < 0 && !pair.Value.Dying) gone.Add(pair.Key);
            }

            foreach (int id in gone) Remove(id);
            Layout();
        }

        /// <summary>The selection decides each stack's lead; call when it changes.</summary>
        public void SetSelection(SelectionModel value)
        {
            if (ReferenceEquals(value, selection)) return;
            bool leadsMayChange = value.PrimaryId != selection.PrimaryId || value.SelectedIds.Count != selection.SelectedIds.Count;
            selection = value;
            if (leadsMayChange) Layout();
        }

        private void Layout()
        {
            leads.Clear();
            foreach (KeyValuePair<GridPos, List<StackMember>> stack in stacks)
            {
                int lead = UnitStack.LeadOf(stack.Value, selection);
                leads[stack.Key] = lead;
                IReadOnlyList<StackMember> order = UnitStack.DisplayOrder(stack.Value, lead);
                BannerView leadView = GetOrCreate(lead);
                int width = Mathf.Max(1, leadView.WidthArtPx * options.Sizing.ScalePermille(leadView.SizeClass) / 1000);
                StackSlot[] slots = StackLayout.Arrange(options.Stack, order.Count, width, iso.TileWidth);
                for (int i = 0; i < order.Count; i++)
                {
                    BannerView view = GetOrCreate(order[i].Id);
                    if (!view.Busy) view.Place(stack.Key, slots[i], i, order.Count, iso);
                }
            }
        }

        /// <summary>The stack on a tile in display order (lead first); empty when nobody stands there.</summary>
        public IReadOnlyList<StackMember> StackAt(GridPos tile)
        {
            if (!stacks.TryGetValue(tile, out List<StackMember>? members)) return System.Array.Empty<StackMember>();
            return UnitStack.DisplayOrder(members, leads.TryGetValue(tile, out int lead) ? lead : SelectionModel.NoUnit);
        }

        public IEnumerable<KeyValuePair<GridPos, List<StackMember>>> Stacks => stacks;

        public void Remove(int unitId)
        {
            if (!banners.TryGetValue(unitId, out BannerView? view)) return;
            banners.Remove(unitId);
            ViewUtil.Destroy(view.gameObject);
        }

        public void Tick(double nowSeconds, int nowMs)
        {
            foreach (BannerView view in banners.Values) view.Tick(nowSeconds, nowMs);
        }

        /// <summary>The lead of the stack on a tile (what a tap on the bare tile selects).</summary>
        public int? UnitAt(GridPos tile)
        {
            if (leads.TryGetValue(tile, out int lead) && lead != SelectionModel.NoUnit) return lead;
            foreach (Unit u in state.UnitTable)
            {
                if (u.Pos.X == tile.X && u.Pos.Y == tile.Y) return u.Id;
            }

            return null;
        }

        public List<BannerRect> HitRects(Camera camera, int viewportHeight)
        {
            var rects = new List<BannerRect>(banners.Count);
            foreach (BannerView view in banners.Values)
            {
                if (view.Dying || view.Hidden) continue;
                PixelRect r = view.ScreenRect(camera, viewportHeight);
                if (MinHitPx > 0) r = HitTargets.Inflate(r, MinHitPx);
                rects.Add(new BannerRect(view.UnitId, view.Tile, r, view.SortKey));
            }

            return rects;
        }

        /// <summary>
        /// Where a stack's badge goes: clear of the banners it counts. Lead and peek: the lead's top-left corner (the
        /// others peek out to the right). Row fan: the top-right corner of the right-most banner ("+n" continues the
        /// row). Arc: the lead's top-right corner.
        /// </summary>
        private Vector3 BadgeAnchor(List<StackMember> members, BannerView lead)
        {
            switch (options.Stack)
            {
                case StackStyle.LeadPeek: return lead.ClothTopCornerWorld(false);
                case StackStyle.RowFan:
                    BannerView rightmost = lead;
                    foreach (StackMember m in members)
                    {
                        if (banners.TryGetValue(m.Id, out BannerView? v) && !v.Hidden && v.transform.position.x > rightmost.transform.position.x) rightmost = v;
                    }

                    return rightmost.ClothTopCornerWorld(true);
                default: return lead.ClothTopCornerWorld(true);
            }
        }

        /// <summary>Badges for the stacks that show one under the current stack style.</summary>
        public List<StackBadge> Badges()
        {
            var result = new List<StackBadge>();
            foreach (KeyValuePair<GridPos, List<StackMember>> stack in stacks)
            {
                int count = stack.Value.Count;
                if (!StackLayout.ShowsBadge(options.Stack, count)) continue;
                int lead = leads.TryGetValue(stack.Key, out int l) ? l : stack.Value[0].Id;
                if (!banners.TryGetValue(lead, out BannerView? view) || view.Busy) continue;
                bool plus = options.Stack != StackStyle.LeadPeek;
                result.Add(new StackBadge(stack.Key, lead, view.Owner, StackLayout.BadgeNumber(options.Stack, count), plus, BadgeAnchor(stack.Value, view)));
            }

            return result;
        }
    }
}
