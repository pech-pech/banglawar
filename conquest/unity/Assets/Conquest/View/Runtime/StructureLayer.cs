using System.Collections.Generic;
using Conquest.Assets.Model;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using Conquest.Unity.Art;
using UnityEngine;

namespace Conquest.UnityView
{
    /// <summary>One drawn structure: its rule tile, the tiles its picture covers, and the renderer.</summary>
    public readonly struct StructurePiece
    {
        public StructurePiece(string role, GridPos ruleTile, FootprintPlacementResult placement, SpriteRenderer renderer, bool usesArt)
        {
            Role = role;
            RuleTile = ruleTile;
            Placement = placement;
            Renderer = renderer;
            UsesArt = usesArt;
        }

        public string Role { get; }

        public GridPos RuleTile { get; }

        public FootprintPlacementResult Placement { get; }

        public SpriteRenderer Renderer { get; }

        public bool UsesArt { get; }
    }

    /// <summary>
    /// Bases and their buildings, rebuilt from the state whenever it changes. The rules give each structure one tile
    /// (a base's anchor, a building's "at"); a picture drawn for a larger footprint (the base core is 2 x 2) is put on
    /// the map by the <see cref="AnchorConvention"/> candidate. A role without a picture yet gets a plain extruded clay
    /// block of its footprint in the role's brown (<see cref="PlaceholderStyle"/>), sorted by its front tile.
    /// </summary>
    public sealed class StructureLayer
    {
        private readonly Transform root;
        private readonly ArtLibrary art;
        private readonly IsoProjection iso;
        private readonly List<StructurePiece> pieces = new List<StructurePiece>();
        private AnchorConvention anchor = PolishSettings.Anchor;
        private PlaceholderStyle style = PolishSettings.Placeholders;
        private LayeringMode layering = PolishSettings.Layering;
        private GameState? last;

        public StructureLayer(Transform parent, ArtLibrary art, IsoProjection iso)
        {
            root = new GameObject("Structures").transform;
            root.SetParent(parent, false);
            this.art = art;
            this.iso = iso;
        }

        public int PieceCount => pieces.Count;

        public int ArtPieceCount { get; private set; }

        public IReadOnlyList<StructurePiece> Pieces => pieces;

        public void SetOptions(PolishOptions options)
        {
            anchor = options.Anchor;
            style = options.Placeholders;
            layering = options.Layering;
            if (last != null) Rebuild(last);
        }

        public void Rebuild(GameState state)
        {
            last = state;
            foreach (StructurePiece p in pieces) ViewUtil.Destroy(p.Renderer.gameObject);
            pieces.Clear();
            ArtPieceCount = 0;
            foreach (Base b in state.BaseTable)
            {
                string slot = EventMapper.SlotId(b.Owner);
                AddPiece("core", slot, b.Pos, "base " + b.Id);
                foreach (Building building in b.Buildings)
                {
                    AddPiece(EventMapper.RoleName(RoleIds.Of(building.Role)), slot, building.Pos, RoleIds.Of(building.Role));
                }
            }
        }

        private void AddPiece(string role, string slot, TileCoord pos, string label)
        {
            var go = new GameObject("Structure " + label + " " + pos);
            go.transform.SetParent(root, false);
            var renderer = go.AddComponent<SpriteRenderer>();
            var footprint = new IntPair(1, 1);
            bool usesArt = art.TryGet("bld", role, null, slot, out ArtClip clip);
            if (usesArt)
            {
                renderer.sprite = clip.Frame(0);
                footprint = clip.Entry.Footprint;
                ArtPieceCount++;
            }

            var ruleTile = new GridPos(pos.X, pos.Y);
            FootprintPlacementResult placement = FootprintPlacement.Place(ruleTile, footprint.X, footprint.Y, anchor);
            if (!usesArt)
            {
                Color top = ViewUtil.ToColor(PlaceholderStyle.RoleTone(role));
                Color left = ViewUtil.ToColor(PlaceholderStyle.LeftWall(PlaceholderStyle.RoleTone(role)));
                Color right = ViewUtil.ToColor(PlaceholderStyle.RightWall(PlaceholderStyle.RoleTone(role)));
                int wall = iso.TileWidth * style.BlockHeightPermilleOfTile / 1000;
                renderer.sprite = art.Placeholders.ClayBlock(top, left, right, placement.Width, placement.Height, wall, style.BlockInsetPermille);
            }

            go.transform.position = ViewSpace.ToWorld(placement.CentreWorld(iso), art.PixelsPerUnit);
            float scale = placement.ScalePermille / 1000f;
            go.transform.localScale = new Vector3(scale, scale, 1f);
            renderer.sortingOrder = DrawOrder.Structure(layering, ClampToMap(placement.Front));
            pieces.Add(new StructurePiece(role, ruleTile, placement, renderer, usesArt));
        }

        /// <summary>A footprint may hang off the map (the top-left candidate at the east edge); its sort key still needs a real tile.</summary>
        private static GridPos ClampToMap(GridPos tile) => new GridPos(Mathf.Max(0, tile.X), Mathf.Max(0, tile.Y));
    }
}
