#nullable enable
using System;
using System.Collections.Generic;
using Conquest.Assets.Model;

namespace Conquest.Assets.Lookup
{
    /// <summary>
    /// What the game asks for: theme-neutral role id parts, never a label. Twin of tools/assets/asset_keys.py;
    /// tests/golden/keys.golden.json pins both.
    /// </summary>
    public sealed class AssetRequest
    {
        public string Kind { get; }
        public string Role { get; }
        public int? Level { get; }
        public int? Variant { get; }
        public string? State { get; }
        public string? Slot { get; }

        public AssetRequest(string kind, string role, int? level = null, int? variant = null, string? state = null,
            string? slot = null)
        {
            if (string.IsNullOrEmpty(kind)) throw new ArgumentException("kind is required", nameof(kind));
            if (string.IsNullOrEmpty(role)) throw new ArgumentException("role is required", nameof(role));
            Kind = kind; Role = role; Level = level; Variant = variant;
            State = string.IsNullOrEmpty(state) ? null : state;
            Slot = string.IsNullOrEmpty(slot) ? null : slot;
        }

        /// <summary>kind.role[.L1][.v1][.state][@slot]</summary>
        public string Key => AssetKey.Format(Kind, Role, Level, Variant, State, Slot);

        public AssetRequest With(int? level, int? variant, string? state, string? slot) =>
            new AssetRequest(Kind, Role, level, variant, state, slot);
    }

    public static class AssetKey
    {
        public static string Format(string kind, string role, int? level = null, int? variant = null,
            string? state = null, string? slot = null)
        {
            if (string.IsNullOrEmpty(kind) || string.IsNullOrEmpty(role))
                throw new ArgumentException("kind and role are required");
            string key = kind + "." + role;
            if (level.HasValue) key += ".L" + level.Value;
            if (variant.HasValue) key += ".v" + variant.Value;
            if (!string.IsNullOrEmpty(state)) key += "." + state;
            if (!string.IsNullOrEmpty(slot)) key += "@" + slot;
            return key;
        }

        /// <summary>
        /// Keys to try, best first; the first is the exact key. Every subset of the present optional parts can be
        /// dropped, cheapest loss first (variant 1, state 2, level 4, slot 8), so the art for the wanted side is
        /// kept in preference to the wanted state, and that to the wanted level.
        /// </summary>
        public static IReadOnlyList<string> FallbackChain(AssetRequest request)
        {
            var present = new List<(string Name, int Cost)>();
            if (request.Variant.HasValue) present.Add(("variant", 1));
            if (request.State != null) present.Add(("state", 2));
            if (request.Level.HasValue) present.Add(("level", 4));
            if (request.Slot != null) present.Add(("slot", 8));

            var masks = new List<int>();
            for (int m = 0; m < (1 << present.Count); m++) masks.Add(m);
            int CostOf(int mask)
            {
                int cost = 0;
                for (int i = 0; i < present.Count; i++) if ((mask & (1 << i)) != 0) cost += present[i].Cost;
                return cost;
            }
            masks.Sort((a, b) => CostOf(a).CompareTo(CostOf(b)));

            var chain = new List<string>();
            foreach (int mask in masks)
            {
                int? level = request.Level, variant = request.Variant;
                string? state = request.State, slot = request.Slot;
                for (int i = 0; i < present.Count; i++)
                {
                    if ((mask & (1 << i)) == 0) continue;
                    switch (present[i].Name)
                    {
                        case "variant": variant = null; break;
                        case "state": state = null; break;
                        case "level": level = null; break;
                        case "slot": slot = null; break;
                    }
                }
                string key = Format(request.Kind, request.Role, level, variant, state, slot);
                if (!chain.Contains(key)) chain.Add(key);
            }
            return chain;
        }
    }

    public sealed class Resolution
    {
        public SheetEntry Entry { get; }
        public string RequestedKey { get; }
        /// <summary>True when the exact key exists; false when a fallback entry was used.</summary>
        public bool IsExact { get; }
        public Resolution(SheetEntry entry, string requestedKey, bool isExact)
        {
            Entry = entry; RequestedKey = requestedKey; IsExact = isExact;
        }
    }

    /// <summary>Read-only index over a sprite sheet. Pure data: safe for dotnet test and for the simulation's neighbours.</summary>
    public sealed class AssetCatalog
    {
        private readonly Dictionary<string, SheetEntry> _byKey;
        private readonly Dictionary<string, SheetLayer> _layers;
        public SpriteSheet Sheet { get; }

        public AssetCatalog(SpriteSheet sheet)
        {
            Sheet = sheet ?? throw new ArgumentNullException(nameof(sheet));
            _byKey = new Dictionary<string, SheetEntry>(sheet.Entries.Count, StringComparer.Ordinal);
            foreach (var e in sheet.Entries) _byKey[e.Key] = e;
            _layers = new Dictionary<string, SheetLayer>(StringComparer.Ordinal);
            foreach (var l in sheet.Layers) _layers[l.Id] = l;
        }

        public static AssetCatalog FromJson(string json) => new AssetCatalog(SheetParser.Parse(json));

        public int Count => _byKey.Count;

        public bool TryGet(string key, out SheetEntry entry)
        {
            if (_byKey.TryGetValue(key, out SheetEntry? found)) { entry = found; return true; }
            entry = null!;
            return false;
        }

        /// <summary>First hit along the fallback chain; null when nothing matches (the caller draws its placeholder).</summary>
        public Resolution? Resolve(AssetRequest request)
        {
            var chain = AssetKey.FallbackChain(request);
            for (int i = 0; i < chain.Count; i++)
                if (_byKey.TryGetValue(chain[i], out SheetEntry? entry)) return new Resolution(entry, chain[0], i == 0);
            return null;
        }

        public IEnumerable<SheetEntry> OfKind(string kind)
        {
            foreach (var e in Sheet.Entries) if (e.Kind == kind) yield return e;
        }

        public SheetLayer Layer(string id) =>
            _layers.TryGetValue(id, out SheetLayer? layer) ? layer : throw new KeyNotFoundException("layer " + id);
    }

    /// <summary>Frame choice for sprite-sheet animation. The caller passes the time; nothing here reads a clock.</summary>
    public static class AnimationClock
    {
        public static int FrameAt(SheetEntry entry, double seconds)
        {
            if (entry.FrameCount <= 1 || entry.Fps == null || entry.Fps.Value <= 0 || seconds <= 0) return 0;
            long index = (long)Math.Floor(seconds * entry.Fps.Value);
            if (entry.Loop) return (int)(index % entry.FrameCount);
            return (int)Math.Min(index, entry.FrameCount - 1);
        }

        public static double Duration(SheetEntry entry) =>
            entry.FrameCount <= 1 || entry.Fps == null || entry.Fps.Value <= 0 ? 0 : (double)entry.FrameCount / entry.Fps.Value;

        public static bool IsFinished(SheetEntry entry, double seconds) =>
            !entry.Loop && seconds >= Duration(entry);

        /// <summary>Frames whose events are due in the half-open time window (from, to]; pass from below 0 to include the event at time 0.</summary>
        public static IEnumerable<SheetEvent> EventsBetween(SheetEntry entry, double from, double to)
        {
            if (entry.Fps == null || entry.Fps.Value <= 0) yield break;
            foreach (var e in entry.Events)
            {
                double at = (double)e.Frame / entry.Fps.Value;
                if (at > from && at <= to) yield return e;
            }
        }
    }

    /// <summary>2:1 isometric projection helpers. Tile (0,0) is at the origin; +x goes down-right, +y down-left.</summary>
    public static class IsoProjection
    {
        /// <summary>Centre of tile (x, y) in world units (y up) for the given tile width and pixels per unit.</summary>
        public static (double X, double Y) TileCentre(double tileX, double tileY, int tileWidthPx, int pixelsPerUnit)
        {
            double halfW = tileWidthPx / 2.0 / pixelsPerUnit;
            double halfH = halfW / 2.0;
            return ((tileX - tileY) * halfW, -(tileX + tileY) * halfH);
        }

        /// <summary>
        /// Anchor of a footprint whose top-left cell is (x, y): its centre. Art for a 2x2 piece is anchored there.
        /// </summary>
        public static (double X, double Y) FootprintAnchor(int cellX, int cellY, IntPair footprint, int tileWidthPx,
            int pixelsPerUnit) =>
            TileCentre(cellX + (footprint.X - 1) / 2.0, cellY + (footprint.Y - 1) / 2.0, tileWidthPx, pixelsPerUnit);

        /// <summary>Depth of the front-most cell: larger draws in front. Equal depths tie-break by layer, then bias.</summary>
        public static int DepthKey(int cellX, int cellY, IntPair footprint) =>
            cellX + footprint.X - 1 + cellY + footprint.Y - 1;

        /// <summary>Total order for pieces that share the depth-sorted world layers.</summary>
        public static int Compare(int depthA, SheetLayer layerA, int biasA, int depthB, SheetLayer layerB, int biasB)
        {
            int c = depthA.CompareTo(depthB);
            if (c != 0) return c;
            c = layerA.Tiebreak.CompareTo(layerB.Tiebreak);
            return c != 0 ? c : biasA.CompareTo(biasB);
        }
    }

    /// <summary>Coordinate conversions the Unity importer needs, kept here so dotnet test can check them.</summary>
    public static class SpriteGeometry
    {
        /// <summary>Sheet rectangles are measured from the page's top-left, Unity's texture rectangles from the bottom-left.</summary>
        public static SheetRect ToUnityRect(SheetRect rect, int pageHeight) =>
            new SheetRect(rect.X, pageHeight - rect.Y - rect.Height, rect.Width, rect.Height);

        /// <summary>Sprite name used for one frame of an entry; stable across imports so references survive.</summary>
        public static string SpriteName(string key, int frame) => key + "#" + frame.ToString("00");

        /// <summary>Asset file name for a key (the @ of a slot is not friendly to every tool).</summary>
        public static string FileNameForKey(string key) => key.Replace("@", "_at_");

        /// <summary>Position of the sprite pivot in world units relative to a cell anchor placed at the origin.</summary>
        public static (double X, double Y) SortPointOffsetUnits(SheetEntry entry, int pixelsPerUnit) =>
            ((double)entry.Sort.PointOffsetPx.X / pixelsPerUnit, (double)entry.Sort.PointOffsetPx.Y / pixelsPerUnit);
    }
}
