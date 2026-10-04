using System.Collections.Generic;
using Conquest.Presentation;
using UnityEngine;
using UnityEngine.Rendering;

namespace Conquest.UnityView
{
    /// <summary>
    /// What the player aims with, drawn on the ground: the selection ring under each selected unit, the hover diamond,
    /// the previewed path (dots, a larger mark where a turn ends or the path ends), the confirm diamond and the red
    /// diamond when no path exists. Pooled sprites. Where they sort is the <see cref="LayeringMode"/>: in the band
    /// mode the whole layer is one sorting group above all terrain and structure art and below the banners.
    /// </summary>
    public sealed class OverlayLayer
    {
        private const int RingLayer = 0;
        private const int HoverLayer = 1;
        private const int BlockedLayer = 2;
        private const int DotLayer = 4;
        private const int PendingLayer = 6;

        private readonly Transform root;
        private readonly SortingGroup group;
        private readonly ArtLibrary art;
        private readonly IsoProjection iso;
        private readonly SpriteRenderer hover;
        private readonly SpriteRenderer blocked;
        private readonly SpriteRenderer pending;
        private readonly List<SpriteRenderer> dots = new List<SpriteRenderer>();
        private readonly List<(SpriteRenderer edge, SpriteRenderer fill)> rings = new List<(SpriteRenderer, SpriteRenderer)>();
        private readonly Color nearColor = new Color(1f, 0.93f, 0.55f, 1f);
        private readonly Color farColor = new Color(1f, 0.93f, 0.55f, 0.5f);
        private readonly List<GridPos> dotTiles = new List<GridPos>();
        private GridPos? hoverTile;
        private GridPos? pendingTile;
        private GridPos? blockedTile;
        private LayeringMode layering = LayeringMode.Bands;
        private SelectionLook look = SelectionLook.For(PolishChoice.C2);

        public OverlayLayer(Transform parent, ArtLibrary art, IsoProjection iso)
        {
            root = new GameObject("Overlay").transform;
            root.SetParent(parent, false);
            group = root.gameObject.AddComponent<SortingGroup>();
            this.art = art;
            this.iso = iso;
            hover = Make("HoverDiamond", art.Placeholders.DiamondOutline(new Color(1f, 1f, 1f, 0.9f), 256, 128, 5));
            blocked = Make("BlockedDiamond", art.Placeholders.Diamond(new Color(0.85f, 0.15f, 0.12f, 0.45f), new Color(0.85f, 0.15f, 0.12f, 0.9f)));
            pending = Make("PendingDiamond", art.Placeholders.DiamondOutline(new Color(1f, 0.85f, 0.2f, 1f), 256, 128, 10));
            SetOptions(PolishSettings.Current);
        }

        public int VisibleDots { get; private set; }

        public int VisibleRings { get; private set; }

        public bool HoverVisible => hover.enabled;

        public bool PendingVisible => pending.enabled;

        public Transform Root => root;

        /// <summary>Every overlay piece that is switched on right now (name and world position), for tests and the debug panel.</summary>
        public IEnumerable<(string name, Vector3 position)> ActivePieces()
        {
            foreach (SpriteRenderer r in root.GetComponentsInChildren<SpriteRenderer>())
            {
                if (r.enabled) yield return (r.gameObject.name, r.transform.position);
            }
        }

        /// <summary>The path dots currently shown (for layering checks).</summary>
        public IEnumerable<SpriteRenderer> Dots
        {
            get
            {
                for (int i = 0; i < VisibleDots; i++) yield return dots[i];
            }
        }

        public IReadOnlyList<GridPos> DotTiles => dotTiles;

        public void SetOptions(PolishOptions options)
        {
            layering = options.Layering;
            look = options.Selection;
            int? band = DrawOrder.GroupOrder(layering, DrawRole.Overlay);
            group.enabled = band.HasValue;
            if (band.HasValue) group.sortingOrder = band.Value;
            Resort();
        }

        private SpriteRenderer Make(string name, Sprite? sprite)
        {
            var go = new GameObject(name);
            go.transform.SetParent(root, false);
            var r = go.AddComponent<SpriteRenderer>();
            r.sprite = sprite;
            r.enabled = false;
            return r;
        }

        private void Order(SpriteRenderer r, GridPos tile, int layer) => r.sortingOrder = DrawOrder.Overlay(layering, tile, layer).Order;

        private void Place(SpriteRenderer r, GridPos tile, int layer)
        {
            r.transform.position = ViewSpace.ToWorld(iso.GridToWorld(tile), art.PixelsPerUnit);
            Order(r, tile, layer);
            r.enabled = true;
        }

        private void Resort()
        {
            if (hoverTile.HasValue) Order(hover, hoverTile.Value, HoverLayer);
            if (pendingTile.HasValue) Order(pending, pendingTile.Value, PendingLayer);
            if (blockedTile.HasValue) Order(blocked, blockedTile.Value, BlockedLayer);
            for (int i = 0; i < VisibleDots; i++) Order(dots[i], dotTiles[i], DotLayer);
        }

        public void SetHover(GridPos? tile)
        {
            hoverTile = tile;
            if (!tile.HasValue) hover.enabled = false;
            else Place(hover, tile.Value, HoverLayer);
        }

        public void SetPending(GridPos? tile)
        {
            pendingTile = tile;
            if (!tile.HasValue) pending.enabled = false;
            else Place(pending, tile.Value, PendingLayer);
        }

        /// <summary>One ring per selected unit's tile, in the unit side's hologram colour (none when the look has no tile ring).</summary>
        public void SetSelectionRings(IReadOnlyList<(GridPos tile, int owner)> selected)
        {
            int wanted = look.TileRing ? selected.Count : 0;
            while (rings.Count < wanted) rings.Add((Make("SelectionRing " + rings.Count, null), Make("SelectionFill " + rings.Count, null)));
            var seen = new HashSet<GridPos>();
            int used = 0;
            for (int i = 0; i < wanted; i++)
            {
                if (!seen.Add(selected[i].tile)) continue;
                Color glow = ViewUtil.ToColor(SelectionLook.SideGlow(selected[i].owner));
                (SpriteRenderer edge, SpriteRenderer fill) = rings[used++];
                edge.sprite = art.Placeholders.DiamondOutline(glow, 256, 128, look.RingEdgePx);
                fill.sprite = art.Placeholders.Diamond(new Color(glow.r, glow.g, glow.b, look.RingFillAlphaPermille / 1000f), new Color(0f, 0f, 0f, 0f), 256, 128, 0);
                Place(fill, selected[i].tile, RingLayer);
                Place(edge, selected[i].tile, RingLayer);
            }

            for (int i = used; i < rings.Count; i++)
            {
                rings[i].edge.enabled = false;
                rings[i].fill.enabled = false;
            }

            VisibleRings = used;
        }

        public void ShowPath(PathPreview preview, GridPos? blockedTarget)
        {
            HideDots();
            blocked.enabled = false;
            blockedTile = null;
            if (!preview.Found)
            {
                if (blockedTarget.HasValue)
                {
                    blockedTile = blockedTarget;
                    Place(blocked, blockedTarget.Value, BlockedLayer);
                }

                return;
            }

            for (int i = 0; i < preview.Steps.Count; i++)
            {
                PathPreviewStep step = preview.Steps[i];
                bool endMark = step.IsDestination;
                SpriteRenderer dot = Dot(i, endMark || step.IsTurnEnd);
                dot.color = step.TurnIndex == 0 ? nearColor : farColor;
                dot.transform.localScale = endMark ? Vector3.one * 1.5f : Vector3.one;
                dotTiles.Add(step.Pos);
                Place(dot, step.Pos, DotLayer);
                VisibleDots = i + 1;
            }
        }

        public void Clear()
        {
            HideDots();
            blocked.enabled = false;
            pending.enabled = false;
            blockedTile = null;
            pendingTile = null;
        }

        private void HideDots()
        {
            foreach (SpriteRenderer d in dots) d.enabled = false;
            dotTiles.Clear();
            VisibleDots = 0;
        }

        private SpriteRenderer Dot(int index, bool big)
        {
            while (dots.Count <= index)
            {
                var go = new GameObject("PathDot " + dots.Count);
                go.transform.SetParent(root, false);
                dots.Add(go.AddComponent<SpriteRenderer>());
            }

            SpriteRenderer dot = dots[index];
            var ink = new Color(0.2f, 0.15f, 0f, 1f);
            dot.sprite = big ? art.Placeholders.Disc(Color.white, ink, 44) : art.Placeholders.Disc(Color.white, ink, 30);
            return dot;
        }
    }
}
