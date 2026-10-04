#nullable enable
using System;
using System.Collections.Generic;
using Conquest.Assets.Json;

namespace Conquest.Assets.Model
{
    /// <summary>Raised when a sprite sheet is well-formed JSON but not a valid sprite-sheet/1 document.</summary>
    public sealed class SheetFormatException : Exception
    {
        public SheetFormatException(string message) : base(message) { }
    }

    /// <summary>Reads sprite_sheet.json (written by tools/assets/pack_atlas.py) into immutable model objects.</summary>
    public static class SheetParser
    {
        public static SpriteSheet Parse(string json)
        {
            object? root;
            try { root = MiniJson.Parse(json); }
            catch (JsonFormatException e) { throw new SheetFormatException(e.Message); }
            var doc = AsObject(root, "$");
            string schema = Str(doc, "schema", "$");
            if (schema != SpriteSheet.SchemaId)
                throw new SheetFormatException("$.schema is '" + schema + "', expected '" + SpriteSheet.SchemaId + "'");

            var projection = Obj(doc, "projection", "$");
            var layers = new List<SheetLayer>();
            foreach (var (item, path) in Items(doc, "layers", "$"))
            {
                var o = AsObject(item, path);
                string sorting = Str(o, "sorting", path);
                if (sorting != "depth" && sorting != "fixed")
                    throw new SheetFormatException(path + ".sorting must be 'depth' or 'fixed'");
                layers.Add(new SheetLayer(Str(o, "id", path), Int(o, "order", path), sorting == "depth",
                    Int(o, "tiebreak", path)));
            }

            var pages = new List<SheetPage>();
            foreach (var (item, path) in Items(doc, "pages", "$"))
            {
                var o = AsObject(item, path);
                var size = Pair(o, "size", path);
                pages.Add(new SheetPage(Str(o, "file", path), Str(o, "group", path), size.X, size.Y,
                    Str(o, "sha256", path)));
            }

            var entries = new List<SheetEntry>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var (item, path) in Items(doc, "entries", "$"))
            {
                var entry = ParseEntry(AsObject(item, path), path, pages);
                if (!seen.Add(entry.Key)) throw new SheetFormatException(path + ": duplicate key '" + entry.Key + "'");
                entries.Add(entry);
            }

            return new SpriteSheet(Str(doc, "theme", "$"), Int(doc, "tile_px", "$"), Int(doc, "pixels_per_unit", "$"),
                Int(projection, "tile_w", "$.projection"), Int(projection, "tile_h", "$.projection"),
                Str(doc, "variant", "$"), layers, pages, entries);
        }

        private static SheetEntry ParseEntry(Dictionary<string, object?> o, string path, List<SheetPage> pages)
        {
            var sortObj = Obj(o, "sort", path);
            var sort = new SortInfo(Str(sortObj, "rule", path + ".sort"), Int(sortObj, "bias", path + ".sort"),
                Pair(sortObj, "point_offset_px", path + ".sort"));

            var events = new List<SheetEvent>();
            foreach (var (item, p) in Items(o, "events", path))
            {
                var e = AsObject(item, p);
                events.Add(new SheetEvent(Int(e, "frame", p), Str(e, "name", p)));
            }
            var tags = new List<string>();
            foreach (var (item, p) in Items(o, "tags", path))
                tags.Add(item as string ?? throw new SheetFormatException(p + " must be a string"));

            var size = Pair(o, "size", path);
            var frames = new List<SheetFrame>();
            foreach (var (item, p) in Items(o, "frames", path))
            {
                var f = AsObject(item, p);
                int page = Int(f, "page", p);
                if (page < 0 || page >= pages.Count)
                    throw new SheetFormatException(p + ".page " + page + " is outside the " + pages.Count + " pages");
                var r = Ints(f, "rect", p, 4);
                var rect = new SheetRect(r[0], r[1], r[2], r[3]);
                if (rect.Width != size.X || rect.Height != size.Y)
                    throw new SheetFormatException(p + ".rect size differs from the entry size");
                if (rect.X < 0 || rect.Y < 0 || rect.X + rect.Width > pages[page].Width ||
                    rect.Y + rect.Height > pages[page].Height)
                    throw new SheetFormatException(p + ".rect lies outside its page");
                frames.Add(new SheetFrame(page, rect));
            }
            int frameCount = Int(o, "frame_count", path);
            if (frames.Count == 0 || frames.Count != frameCount)
                throw new SheetFormatException(path + ": frame_count " + frameCount + " does not match " + frames.Count + " frames");
            if (size.X < 1 || size.Y < 1) throw new SheetFormatException(path + ".size must be positive");

            var review = Obj(o, "review", path);
            return new SheetEntry(Str(o, "key", path), Str(o, "kind", path), Str(o, "role", path),
                OptInt(o, "level", path), OptInt(o, "variant", path), OptStr(o, "state", path), OptStr(o, "slot", path),
                OptStr(o, "dir", path), Str(o, "atlas_group", path), Str(o, "layer", path), sort,
                Pair(o, "footprint", path), OptInt(o, "fps", path), Bool(o, "loop", path), events, tags,
                Str(review, "status", path + ".review"), size, Pair(o, "pivot_px", path),
                Pair(o, "source_size", path), Pair(o, "source_anchor_px", path), Pair(o, "trim_offset", path), frames, Str(o, "pixel_sha256", path));
        }

        // ---- typed accessors with JSON-path error messages
        private static Dictionary<string, object?> AsObject(object? value, string path) =>
            value as Dictionary<string, object?> ?? throw new SheetFormatException(path + " must be an object");

        private static object? Field(Dictionary<string, object?> o, string name, string path)
        {
            if (!o.TryGetValue(name, out object? value)) throw new SheetFormatException(path + "." + name + " is missing");
            return value;
        }

        private static Dictionary<string, object?> Obj(Dictionary<string, object?> o, string name, string path) =>
            AsObject(Field(o, name, path), path + "." + name);

        private static string Str(Dictionary<string, object?> o, string name, string path) =>
            Field(o, name, path) as string ?? throw new SheetFormatException(path + "." + name + " must be a string");

        private static string? OptStr(Dictionary<string, object?> o, string name, string path)
        {
            object? v = Field(o, name, path);
            if (v == null) return null;
            return v as string ?? throw new SheetFormatException(path + "." + name + " must be a string or null");
        }

        private static int ToInt(object? v, string where)
        {
            if (v is long l && l >= int.MinValue && l <= int.MaxValue) return (int)l;
            throw new SheetFormatException(where + " must be an integer");
        }

        private static int Int(Dictionary<string, object?> o, string name, string path) =>
            ToInt(Field(o, name, path), path + "." + name);

        private static int? OptInt(Dictionary<string, object?> o, string name, string path)
        {
            object? v = Field(o, name, path);
            return v == null ? (int?)null : ToInt(v, path + "." + name);
        }

        private static bool Bool(Dictionary<string, object?> o, string name, string path) =>
            Field(o, name, path) is bool b ? b : throw new SheetFormatException(path + "." + name + " must be true or false");

        private static int[] Ints(Dictionary<string, object?> o, string name, string path, int count)
        {
            var list = Field(o, name, path) as List<object?>;
            if (list == null || list.Count != count)
                throw new SheetFormatException(path + "." + name + " must be a list of " + count + " integers");
            var result = new int[count];
            for (int i = 0; i < count; i++) result[i] = ToInt(list[i], path + "." + name + "[" + i + "]");
            return result;
        }

        private static IntPair Pair(Dictionary<string, object?> o, string name, string path)
        {
            var v = Ints(o, name, path, 2);
            return new IntPair(v[0], v[1]);
        }

        private static IEnumerable<(object? Item, string Path)> Items(Dictionary<string, object?> o, string name, string path)
        {
            var list = Field(o, name, path) as List<object?>
                       ?? throw new SheetFormatException(path + "." + name + " must be a list");
            for (int i = 0; i < list.Count; i++) yield return (list[i], path + "." + name + "[" + i + "]");
        }
    }
}
