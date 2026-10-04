using System;
using System.Collections.Generic;
using Conquest.Content.Model;

namespace Conquest.Content.Validation
{
    internal static class EntryRules
    {
        public static void Check(ScenarioData s, ErrorSink errors)
        {
            foreach (EntryGroupData g in s.EntryGroups)
            {
                string path = "$.entry_groups." + g.Id;
                PlayerData? owner = FindPlayer(s, g.Slot);
                if (owner == null || owner.StartMode != "entry_tiles")
                {
                    errors.Add(path + ".slot", "entry.slot", "slot '" + g.Slot + "' is not a player that starts at entry tiles");
                }

                if (g.Tiles.Count == 0)
                {
                    errors.Add(path + ".tiles", "entry.empty", "an entry group needs at least one tile");
                }

                CheckTiles(s, g, path, errors);
            }
        }

        private static void CheckTiles(ScenarioData s, EntryGroupData g, string path, ErrorSink errors)
        {
            var seen = new HashSet<long>();
            for (int i = 0; i < g.Tiles.Count; i++)
            {
                TilePoint t = g.Tiles[i];
                string p = path + ".tiles[" + i + "]";
                if (!seen.Add(((long)t.X << 32) | (uint)t.Y))
                {
                    errors.Add(p, "entry.duplicate_tile", "tile " + t + " is listed twice");
                }

                string? terrain = s.Map.TerrainAt(t.X, t.Y);
                if (!s.Map.Contains(t.X, t.Y))
                {
                    errors.Add(p, "entry.outside", "tile " + t + " is outside the map");
                    continue;
                }

                if (terrain == null || !Vocabulary.IsLandPassable(terrain))
                {
                    errors.Add(p, "entry.impassable", "tile " + t + " is not land a unit can stand on");
                }

                if (t.X != 0 && t.Y != 0 && t.X != s.Map.Width - 1 && t.Y != s.Map.Height - 1)
                {
                    errors.Add(p, "entry.not_on_edge", "entry tiles lie on the map edge (the border)");
                }

                CheckDistance(s, g, t, p, errors);
            }
        }

        private static void CheckDistance(ScenarioData s, EntryGroupData g, TilePoint t, string path, ErrorSink errors)
        {
            foreach (PrePlacedBase b in s.PrePlacedBases)
            {
                if (b.Owner == g.Slot)
                {
                    continue;
                }

                int d = Math.Max(Math.Abs(b.Anchor.X - t.X), Math.Abs(b.Anchor.Y - t.Y));
                if (d < Vocabulary.MinEntryDistanceToOpposingBase)
                {
                    errors.Add(path, "entry.too_close", "tile " + t + " is " + d + " tiles from opposing base " + b.SiteId
                        + "; the minimum is " + Vocabulary.MinEntryDistanceToOpposingBase);
                    return;
                }
            }
        }

        public static PlayerData? FindPlayer(ScenarioData s, string slot)
        {
            foreach (PlayerData p in s.Players)
            {
                if (p.Slot == slot)
                {
                    return p;
                }
            }

            return null;
        }
    }
}
