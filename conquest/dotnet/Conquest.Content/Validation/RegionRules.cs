using System.Collections.Generic;
using System.Linq;
using Conquest.Content.Model;

namespace Conquest.Content.Validation
{
    internal static class RegionRules
    {
        public static void Check(ScenarioData s, ErrorSink errors)
        {
            var ids = new HashSet<string>();
            var owner = new Dictionary<long, string>();
            for (int i = 0; i < s.Regions.Count; i++)
            {
                RegionData r = s.Regions[i];
                string path = "$.regions[" + i + "]";
                if (!ids.Add(r.Id))
                {
                    errors.Add(path + ".id", "region.duplicate", "region id '" + r.Id + "' is used twice");
                }

                for (int j = 0; j < r.Rects.Count; j++)
                {
                    CheckRect(s, r, r.Rects[j], path + ".rects[" + j + "]", owner, errors);
                }
            }

            foreach (string slot in s.RegionCapSlots)
            {
                if (EntryRules.FindPlayer(s, slot) == null)
                {
                    errors.Add("$.region_cap_slots", "region.cap_slot", "slot '" + slot + "' is not a player");
                }
            }

            CheckCap(s, errors);
        }

        private static void CheckRect(ScenarioData s, RegionData r, RectData rect, string path, Dictionary<long, string> owner, ErrorSink errors)
        {
            if (rect.X + rect.Width > s.Map.Width || rect.Y + rect.Height > s.Map.Height)
            {
                errors.Add(path, "region.rect_outside", "rectangle leaves the map");
                return;
            }

            for (int y = rect.Y; y < rect.Y + rect.Height; y++)
            {
                for (int x = rect.X; x < rect.X + rect.Width; x++)
                {
                    long key = ((long)x << 32) | (uint)y;
                    if (owner.TryGetValue(key, out string? other) && other != r.Id)
                    {
                        errors.Add(path, "region.overlap", "tile [" + x + ", " + y + "] also belongs to " + other);
                        return;
                    }

                    owner[key] = r.Id;
                }
            }
        }

        /// <summary>Region cap (hook H6): at most one core of level 3 or more per region, per capped slot.</summary>
        private static void CheckCap(ScenarioData s, ErrorSink errors)
        {
            var count = new Dictionary<string, int>();
            for (int i = 0; i < s.PrePlacedBases.Count; i++)
            {
                PrePlacedBase b = s.PrePlacedBases[i];
                if (b.CoreLevel < 3 || !s.RegionCapSlots.Contains(b.Owner))
                {
                    continue;
                }

                string? region = RegionOf(s, b.Anchor);
                if (region == null)
                {
                    continue;
                }

                string key = b.Owner + "|" + region;
                count.TryGetValue(key, out int n);
                count[key] = n + 1;
                if (n >= 1)
                {
                    errors.Add("$.pre_placed_bases[" + i + "].core_level", "base.region_cap",
                        b.Owner + " already holds a level 3+ core in " + region);
                }
            }
        }

        private static string? RegionOf(ScenarioData s, TilePoint p)
        {
            foreach (RegionData r in s.Regions)
            {
                foreach (RectData rect in r.Rects)
                {
                    if (p.X >= rect.X && p.X < rect.X + rect.Width && p.Y >= rect.Y && p.Y < rect.Y + rect.Height)
                    {
                        return r.Id;
                    }
                }
            }

            return null;
        }
    }
}
