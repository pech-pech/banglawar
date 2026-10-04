#nullable enable
using System.Collections.Generic;

namespace Conquest.Assets.Model
{
    /// <summary>Two integers (sizes, offsets, pivots). Rectangles use the four-field SheetRect.</summary>
    public readonly struct IntPair
    {
        public readonly int X;
        public readonly int Y;
        public IntPair(int x, int y) { X = x; Y = y; }
        public override string ToString() => "(" + X + ", " + Y + ")";
    }

    /// <summary>Rectangle in atlas pixels measured from the page's TOP-LEFT corner.</summary>
    public readonly struct SheetRect
    {
        public readonly int X;
        public readonly int Y;
        public readonly int Width;
        public readonly int Height;
        public SheetRect(int x, int y, int width, int height) { X = x; Y = y; Width = width; Height = height; }
    }

    public sealed class SheetLayer
    {
        public string Id { get; }
        public int Order { get; }
        public bool DepthSorted { get; }
        public int Tiebreak { get; }
        public SheetLayer(string id, int order, bool depthSorted, int tiebreak)
        {
            Id = id; Order = order; DepthSorted = depthSorted; Tiebreak = tiebreak;
        }
    }

    public sealed class SheetPage
    {
        public string File { get; }
        public string Group { get; }
        public int Width { get; }
        public int Height { get; }
        public string Sha256 { get; }
        public SheetPage(string file, string group, int width, int height, string sha256)
        {
            File = file; Group = group; Width = width; Height = height; Sha256 = sha256;
        }
    }

    public sealed class SheetFrame
    {
        public int Page { get; }
        public SheetRect Rect { get; }
        public SheetFrame(int page, SheetRect rect) { Page = page; Rect = rect; }
    }

    public sealed class SheetEvent
    {
        public int Frame { get; }
        public string Name { get; }
        public SheetEvent(int frame, string name) { Frame = frame; Name = name; }
    }

    /// <summary>How the presenter orders the sprite: "custom_axis_y" (depth by pivot + offset) or "fixed_layer".</summary>
    public sealed class SortInfo
    {
        public const string CustomAxisY = "custom_axis_y";
        public const string FixedLayer = "fixed_layer";
        public string Rule { get; }
        public int Bias { get; }
        /// <summary>Sort point relative to the pivot, in atlas pixels (y up). Divide by pixels per unit for world units.</summary>
        public IntPair PointOffsetPx { get; }
        public SortInfo(string rule, int bias, IntPair pointOffsetPx)
        {
            Rule = rule; Bias = bias; PointOffsetPx = pointOffsetPx;
        }
    }

    public sealed class SheetEntry
    {
        public string Key { get; }
        public string Kind { get; }
        public string Role { get; }
        public int? Level { get; }
        public int? Variant { get; }
        public string? State { get; }
        public string? Slot { get; }
        public string? Dir { get; }
        public string AtlasGroup { get; }
        public string Layer { get; }
        public SortInfo Sort { get; }
        public IntPair Footprint { get; }
        public int? Fps { get; }
        public bool Loop { get; }
        public IReadOnlyList<SheetEvent> Events { get; }
        public IReadOnlyList<string> Tags { get; }
        public string ReviewStatus { get; }
        public IntPair Size { get; }
        /// <summary>Pivot in pixels from the bottom-left of the trimmed rectangle (Unity convention); may be outside it.</summary>
        public IntPair PivotPx { get; }
        public IntPair SourceSize { get; }
        /// <summary>Anchor in the untrimmed source frame, pixels from its top-left.</summary>
        public IntPair SourceAnchorPx { get; }
        public IntPair TrimOffset { get; }
        public IReadOnlyList<SheetFrame> Frames { get; }
        public string PixelSha256 { get; }

        public bool IsAnimated => Frames.Count > 1;
        public int FrameCount => Frames.Count;
        /// <summary>Pivot as a fraction of the rectangle, the form Unity's sprite pivot takes.</summary>
        public (double X, double Y) NormalizedPivot => ((double)PivotPx.X / Size.X, (double)PivotPx.Y / Size.Y);

        public SheetEntry(string key, string kind, string role, int? level, int? variant, string? state, string? slot,
            string? dir, string atlasGroup, string layer, SortInfo sort, IntPair footprint, int? fps, bool loop,
            IReadOnlyList<SheetEvent> events, IReadOnlyList<string> tags, string reviewStatus, IntPair size,
            IntPair pivotPx, IntPair sourceSize, IntPair sourceAnchorPx, IntPair trimOffset, IReadOnlyList<SheetFrame> frames,
            string pixelSha256)
        {
            Key = key; Kind = kind; Role = role; Level = level; Variant = variant; State = state; Slot = slot;
            Dir = dir; AtlasGroup = atlasGroup; Layer = layer; Sort = sort; Footprint = footprint; Fps = fps;
            Loop = loop; Events = events; Tags = tags; ReviewStatus = reviewStatus; Size = size; PivotPx = pivotPx;
            SourceSize = sourceSize; SourceAnchorPx = sourceAnchorPx; TrimOffset = trimOffset; Frames = frames; PixelSha256 = pixelSha256;
        }
    }

    public sealed class SpriteSheet
    {
        public const string SchemaId = "sprite-sheet/1";
        public string Theme { get; }
        public int TilePx { get; }
        public int PixelsPerUnit { get; }
        public int ProjectionTileWidth { get; }
        public int ProjectionTileHeight { get; }
        public string Variant { get; }
        public IReadOnlyList<SheetLayer> Layers { get; }
        public IReadOnlyList<SheetPage> Pages { get; }
        public IReadOnlyList<SheetEntry> Entries { get; }

        public SpriteSheet(string theme, int tilePx, int pixelsPerUnit, int tileWidth, int tileHeight, string variant,
            IReadOnlyList<SheetLayer> layers, IReadOnlyList<SheetPage> pages, IReadOnlyList<SheetEntry> entries)
        {
            Theme = theme; TilePx = tilePx; PixelsPerUnit = pixelsPerUnit; ProjectionTileWidth = tileWidth;
            ProjectionTileHeight = tileHeight; Variant = variant; Layers = layers; Pages = pages; Entries = entries;
        }
    }
}
