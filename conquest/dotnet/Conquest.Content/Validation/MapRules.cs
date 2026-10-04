using System.Collections.Generic;
using Conquest.Content.Model;

namespace Conquest.Content.Validation
{
    internal static class MapRules
    {
        public static void Check(ScenarioData s, ErrorSink errors)
        {
            MapData m = s.Map;
            if (m.Width < Vocabulary.MinMapSide || m.Width > Vocabulary.MaxMapSide)
            {
                errors.Add("$.map.width", "map.size", "width must be " + Vocabulary.MinMapSide + ".." + Vocabulary.MaxMapSide);
            }

            if (m.Height < Vocabulary.MinMapSide || m.Height > Vocabulary.MaxMapSide)
            {
                errors.Add("$.map.height", "map.size", "height must be " + Vocabulary.MinMapSide + ".." + Vocabulary.MaxMapSide);
            }

            CheckLegend(m, errors);
            CheckRows(m, errors);
        }

        private static void CheckLegend(MapData m, ErrorSink errors)
        {
            var usedSymbols = new HashSet<char>();
            foreach (string row in m.Rows)
            {
                foreach (char c in row)
                {
                    usedSymbols.Add(c);
                }
            }

            foreach (LegendEntry e in m.Legend)
            {
                string p = "$.map.legend." + e.Symbol;
                if (!Vocabulary.Contains(Vocabulary.Terrains, e.Terrain))
                {
                    errors.Add(p + ".terrain", "map.legend_terrain", "unknown terrain role '" + e.Terrain + "'");
                }

                if (!Vocabulary.IsKnownLook(e.Look))
                {
                    errors.Add(p + ".look", "map.legend_look", "unknown look '" + e.Look + "'");
                }
                else if (!Vocabulary.LookMatchesTerrain(e.Look, e.Terrain))
                {
                    errors.Add(p + ".look", "map.legend_look", "look '" + e.Look + "' cannot be drawn on " + e.Terrain);
                }

                if (!usedSymbols.Contains(e.Symbol))
                {
                    errors.Add(p, "map.legend_unused", "legend symbol '" + e.Symbol + "' is never used");
                }
            }
        }

        private static void CheckRows(MapData m, ErrorSink errors)
        {
            if (m.Rows.Count != m.Height)
            {
                errors.Add("$.map.rows", "map.row_count", "expected " + m.Height + " rows but found " + m.Rows.Count);
            }

            for (int y = 0; y < m.Rows.Count; y++)
            {
                string row = m.Rows[y];
                string p = "$.map.rows[" + y + "]";
                if (row.Length != m.Width)
                {
                    errors.Add(p, "map.row_width", "expected " + m.Width + " characters but found " + row.Length);
                }

                for (int x = 0; x < row.Length; x++)
                {
                    if (m.FindLegend(row[x]) == null)
                    {
                        errors.Add(p, "map.unknown_symbol", "symbol '" + row[x] + "' at column " + x + " is not in the legend");
                        break;
                    }
                }
            }
        }
    }
}
