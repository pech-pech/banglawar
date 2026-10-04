using System.Collections.Generic;
using Conquest.Assets.Lookup;
using Conquest.Content.Model;
using Conquest.Presentation;
using Conquest.Unity.Art;
using UnityEngine;
using IsoProjection = Conquest.Presentation.IsoProjection;

namespace Conquest.UnityView
{
    /// <summary>
    /// The terrain grid: one SpriteRenderer per tile (the slice's maps are small; a 256 x 256 map would need the
    /// culled pool of the design, section 4). The picture of a tile is chosen by the scenario's art "look" through the
    /// theme (look to asset key). A look that resolves to the open-water key picks its shore piece from the eight
    /// neighbours (<see cref="ShoreAutotile"/>; land is any tile whose terrain is not water, outside the map counts as
    /// water); a look with no picture at all gets a drawn diamond.
    /// </summary>
    public sealed class TileLayer
    {
        private const int TerrainTiebreak = 0;
        private readonly List<(SpriteRenderer renderer, string terrain)> placeholders = new List<(SpriteRenderer, string)>();
        private readonly ArtLibrary library;
        private readonly bool[] land;
        private readonly BorderClip borderClip;
        private PlaceholderStyle style = PolishSettings.Placeholders;

        public TileLayer(Transform parent, ArtLibrary art, IsoProjection iso, ScenarioData scenario, ThemeData theme)
        {
            library = art;
            borderClip = new BorderClip(art.PixelsPerUnit);
            Root = new GameObject("Ground").transform;
            Root.SetParent(parent, false);
            Width = scenario.Map.Width;
            Height = scenario.Map.Height;
            var assets = new Dictionary<string, string>();
            foreach (NamedEntry e in theme.TerrainAssets) assets[e.Key] = e.Value;
            land = BuildLandGrid(scenario);
            for (int y = 0; y < Height; y++)
            {
                for (int x = 0; x < Width; x++) Create(art, iso, scenario, assets, x, y);
            }
        }

        public Transform Root { get; }

        public int Width { get; }

        public int Height { get; }

        public int TileCount { get; private set; }

        public int ArtTileCount { get; private set; }

        /// <summary>Water tiles on the NE/NW map border whose shore props are clipped to the map (<see cref="BorderClip"/>).</summary>
        public int ClippedTileCount { get; private set; }

        private void Create(ArtLibrary art, IsoProjection iso, ScenarioData scenario, Dictionary<string, string> assets, int x, int y)
        {
            char symbol = scenario.Map.Rows[y][x];
            LegendEntry? legend = scenario.Map.FindLegend(symbol);
            string look = legend?.Look ?? "meadow";
            string terrain = legend?.Terrain ?? "t.open";
            var go = new GameObject("Tile " + x + "," + y + " " + look);
            go.transform.SetParent(Root, false);
            go.transform.position = ViewSpace.ToWorld(iso.GridToWorld(new GridPos(x, y)), art.PixelsPerUnit);
            var renderer = go.AddComponent<SpriteRenderer>();
            renderer.sortingOrder = SortKey.ForDepthLayer(new GridPos(x, y), TerrainTiebreak, 0);
            ArtClip clip = default;
            bool found = assets.TryGetValue(look, out string? key) && TryPicture(art, key!, x, y, out clip);
            if (found)
            {
                renderer.sprite = clip.Frame(0);
                ArtTileCount++;
                if (IsWater(terrain) && borderClip.Attach(renderer, x, y)) ClippedTileCount++;
            }
            else
            {
                renderer.sprite = PlaceholderSprite(terrain);
                placeholders.Add((renderer, terrain));
            }

            TileCount++;
        }

        /// <summary>The picture for a tile: a water tile tries its shore piece first and falls back to open water.</summary>
        private bool TryPicture(ArtLibrary art, string key, int x, int y, out ArtClip clip)
        {
            if (key == ShoreAutotile.OpenWaterKey)
            {
                string shore = ShoreAutotile.KeyAt(x, y, IsLandAt);
                if (shore != key && art.TryGet(AssetKeyParts.Request(shore, null), out clip)) return true;
            }

            return art.TryGet(AssetKeyParts.Request(key, null), out clip);
        }

        /// <summary>True for a tile inside the map whose terrain role is not water.</summary>
        public bool IsLandAt(int x, int y) => x >= 0 && y >= 0 && x < Width && y < Height && land[y * Width + x];

        private static bool[] BuildLandGrid(ScenarioData scenario)
        {
            int w = scenario.Map.Width;
            var grid = new bool[w * scenario.Map.Height];
            for (int y = 0; y < scenario.Map.Height; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    LegendEntry? legend = scenario.Map.FindLegend(scenario.Map.Rows[y][x]);
                    grid[y * w + x] = !IsWater(legend?.Terrain ?? "t.open");
                }
            }

            return grid;
        }

        /// <summary>Re-draws the tiles that have no picture yet with a placeholder candidate.</summary>
        public void SetPlaceholders(PlaceholderStyle value)
        {
            style = value;
            foreach ((SpriteRenderer renderer, string terrain) in placeholders) renderer.sprite = PlaceholderSprite(terrain);
        }

        public int PlaceholderCount => placeholders.Count;

        private Sprite PlaceholderSprite(string terrain)
        {
            if (IsWater(terrain))
            {
                return library.Placeholders.Diamond(ViewUtil.ToColor(style.Water), ViewUtil.ToColor(style.WaterBorder), 256, 128, style.WaterBorderPx);
            }

            return library.Placeholders.Diamond(TerrainColor(terrain), new Color(0f, 0f, 0f, 0.35f));
        }

        public static bool IsWater(string terrain) => terrain == "t.river" || terrain == "t.still" || terrain == "t.deep";

        private static Color TerrainColor(string terrain)
        {
            switch (terrain)
            {
                case "t.river":
                case "t.still":
                case "t.deep": return new Color(0.35f, 0.6f, 0.78f);
                case "t.rough":
                case "t.peak": return new Color(0.62f, 0.55f, 0.4f);
                case "t.wood_a":
                case "t.wood_b": return new Color(0.3f, 0.5f, 0.3f);
                default: return new Color(0.62f, 0.75f, 0.45f);
            }
        }
    }

    /// <summary>Splits manifest keys such as "tile.meadow" into a request (kind, role).</summary>
    public static class AssetKeyParts
    {
        public static AssetRequest Request(string roleKey, string? slot, string? state = null)
        {
            int dot = roleKey.IndexOf('.');
            string kind = dot < 0 ? roleKey : roleKey.Substring(0, dot);
            string role = dot < 0 ? roleKey : roleKey.Substring(dot + 1);
            return new AssetRequest(kind, role, state: state, slot: slot);
        }
    }
}
