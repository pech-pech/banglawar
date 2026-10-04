using System.Collections.Generic;
using Conquest.Content.Json;
using Conquest.Content.Model;

namespace Conquest.Content.Reading
{
    /// <summary>Maps a parsed scenario document onto <see cref="ScenarioData"/>. Shape errors only; meaning is checked by the validator.</summary>
    public static class ScenarioReader
    {
        public static ScenarioData? Read(JsonNode root, ErrorSink errors)
        {
            ObjectReader? r = ObjectReader.Open(root, "$", errors);
            if (r == null)
            {
                return null;
            }

            string schema = r.Str("schema");
            string id = r.Str("id", ObjectReader.Slug);
            string version = r.Str("version", ObjectReader.SemVer);
            RequiresData requires = ReadRequires(r.Obj("requires"));
            string themeHint = r.Str("theme_hint", ObjectReader.Slug);
            SettingsData settings = ReadSettings(r.Obj("settings"));
            CalendarData calendar = ReadCalendar(r.Obj("calendar"));
            MapData map = ReadMap(r.Obj("map"));
            var players = r.List("players", (n, p) => ReadPlayer(n, p, errors));
            var groups = r.Members("entry_groups", (key, n, p) => ReadEntryGroup(key, n, p, errors));
            var arrivals = r.List("arrivals", (n, p) => ReadArrival(n, p, errors));
            var bases = r.List("pre_placed_bases", (n, p) => ReadBase(n, p, errors));
            var regions = r.List("regions", (n, p) => ReadRegion(n, p, errors));
            var capSlots = r.Strings("region_cap_slots", ObjectReader.Slug);
            var seasonTable = ReadSeasonTable(r);
            var schedule = r.List("season_schedule", (n, p) => ReadSeasonRange(n, p, errors));
            var timed = r.List("timed_effects", (n, p) => ReadTimedEffect(n, p, errors));
            BalanceData balance = ReadBalance(r.Obj("balance"), errors);
            EndConditionsData end = ReadEndConditions(r.Obj("end_conditions"), errors);
            r.Finish();

            return new ScenarioData(schema, id, version, requires, themeHint, settings, calendar, map, players, groups,
                arrivals, bases, regions, capSlots, seasonTable, schedule, timed, balance, end);
        }

        private static RequiresData ReadRequires(ObjectReader? o)
        {
            if (o == null)
            {
                return new RequiresData(string.Empty, 0, 0, new List<string>());
            }

            var data = new RequiresData(o.Str("ruleset", ObjectReader.Slug), o.Int("major", 0, 99), o.Int("min_minor", 0, 99),
                o.Strings("variants"));
            o.Finish();
            return data;
        }

        private static SettingsData ReadSettings(ObjectReader? o)
        {
            if (o == null)
            {
                return new SettingsData(0, 0, 0, string.Empty, string.Empty, string.Empty);
            }

            var data = new SettingsData(o.Int("max_turns", 0, 1000), o.Int("native_settlements", 0, 100),
                o.Int("computer_players", 0, 5), o.Str("difficulty"), o.Str("resources"), o.Str("movement"));
            o.Finish();
            return data;
        }

        private static CalendarData ReadCalendar(ObjectReader? o)
        {
            if (o == null)
            {
                return new CalendarData(string.Empty, 1);
            }

            var data = new CalendarData(o.Str("epoch"), o.Int("step_days", 1, 31));
            o.Finish();
            return data;
        }

        private static MapData ReadMap(ObjectReader? o)
        {
            if (o == null)
            {
                return new MapData(0, 0, new List<LegendEntry>(), new List<string>());
            }

            int width = o.Int("width", 1, 256);
            int height = o.Int("height", 1, 256);
            var legend = new List<LegendEntry>();
            ObjectReader? lg = o.Obj("legend");
            if (lg != null)
            {
                foreach (KeyValuePair<string, JsonNode> m in lg.Node.Members)
                {
                    if (m.Key.StartsWith("_", System.StringComparison.Ordinal))
                    {
                        continue;
                    }

                    string path = lg.ChildPath(m.Key);
                    if (m.Key.Length != 1)
                    {
                        o.Errors.Add(path, "schema.pattern", "a legend key must be a single character", m.Value);
                        continue;
                    }

                    ObjectReader? e = ObjectReader.Open(m.Value, path, o.Errors);
                    if (e != null)
                    {
                        legend.Add(new LegendEntry(m.Key[0], e.Str("terrain", ObjectReader.DottedId), e.Str("look", ObjectReader.Slug)));
                        e.Finish();
                    }
                }

                lg.MarkAllUsed();
            }

            var rows = o.Strings("rows");
            o.Finish();
            return new MapData(width, height, legend, rows);
        }

        private static PlayerData? ReadPlayer(JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            string slot = o.Str("slot", ObjectReader.Slug);
            string control = o.Str("control");
            ObjectReader? start = o.Obj("start");
            string mode = start?.Str("mode") ?? string.Empty;
            start?.Finish();
            StockData? kit = o.Has("start_kit") ? o.Stock("start_kit", false) : null;
            o.Finish();
            return new PlayerData(slot, control, mode, kit);
        }

        private static EntryGroupData? ReadEntryGroup(string key, JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            string slot = o.Str("slot", ObjectReader.Slug);
            var tiles = new List<TilePoint>();
            JsonNode? t = o.Raw("tiles", true);
            if (t is JsonArray arr)
            {
                for (int i = 0; i < arr.Items.Count; i++)
                {
                    TilePoint? p = ObjectReader.ReadTile(arr.Items[i], path + ".tiles[" + i + "]", errors);
                    if (p.HasValue)
                    {
                        tiles.Add(p.Value);
                    }
                }
            }
            else if (t != null)
            {
                errors.Add(path + ".tiles", "schema.type", "expected an array", t);
            }

            o.Finish();
            return new EntryGroupData(key, slot, tiles);
        }

        private static UnitGroup? ReadUnitGroup(JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            var u = new UnitGroup(o.Str("role", ObjectReader.DottedId), o.Int("level", 1, 4), o.Int("count", 1, 99));
            o.Finish();
            return u;
        }

        private static ArrivalData? ReadArrival(JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            int turn = o.Int("turn", 0, 1000);
            string slot = o.Str("slot", ObjectReader.Slug);
            ObjectReader? entry = o.OptObj("entry");
            string? group = entry?.Str("group", ObjectReader.DottedId);
            entry?.Finish();
            var units = o.List("units", (n, p) => ReadUnitGroup(n, p, errors));
            bool attach = o.OptBool("attach_to_first_commander") ?? false;
            bool viaPatron = o.OptBool("via_patron") ?? false;
            o.Finish();
            return new ArrivalData(turn, slot, group, units, attach, viaPatron);
        }

        private static PrePlacedBase? ReadBase(JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            string siteId = o.Str("site_id", ObjectReader.DottedId);
            string owner = o.Str("owner", ObjectReader.Slug);
            TilePoint anchor = o.Tile("anchor");
            int coreLevel = o.Int("core_level", 1, 4);
            var buildings = o.List("buildings", (n, p) => ReadBuilding(n, p, errors));
            StockData stock = o.Stock("stock", true);
            int pop = o.Int("pop", 0, 100000);
            var garrison = o.List("garrison", (n, p) => ReadUnitGroup(n, p, errors));
            ObjectReader? cmd = o.OptObj("commander");
            int? commanderLevel = cmd?.Int("level", 1, 4);
            cmd?.Finish();
            var tags = o.Strings("tags", ObjectReader.Slug);
            bool realPlace = o.Bool("real_place");
            bool raidCanDestroy = o.Bool("raid_can_destroy");
            string intel = o.OptStr("intel_seed") ?? "owner_only";
            o.Finish();
            return new PrePlacedBase(siteId, owner, anchor, coreLevel, buildings, stock, pop, garrison, commanderLevel, tags,
                realPlace, raidCanDestroy, intel);
        }

        private static BuildingPlacement? ReadBuilding(JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            var b = new BuildingPlacement(o.Str("role", ObjectReader.DottedId), o.Int("level", 1, 4), o.Tile("at"));
            o.Finish();
            return b;
        }

        private static RegionData? ReadRegion(JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            string id = o.Str("id", ObjectReader.DottedId);
            var rects = new List<RectData>();
            JsonNode? rn = o.Raw("rects", true);
            if (rn is JsonArray arr)
            {
                for (int i = 0; i < arr.Items.Count; i++)
                {
                    RectData? rect = ReadRect(arr.Items[i], path + ".rects[" + i + "]", errors);
                    if (rect != null)
                    {
                        rects.Add(rect);
                    }
                }
            }
            else if (rn != null)
            {
                errors.Add(path + ".rects", "schema.type", "expected an array", rn);
            }

            o.Finish();
            return new RegionData(id, rects);
        }

        private static RectData? ReadRect(JsonNode node, string path, ErrorSink errors)
        {
            if (!(node is JsonArray a) || a.Items.Count != 4)
            {
                errors.Add(path, "schema.type", "expected an [x, y, width, height] array", node);
                return null;
            }

            int? x = ObjectReader.ReadInt(a.Items[0], path + "[0]", 0, 1000, errors);
            int? y = ObjectReader.ReadInt(a.Items[1], path + "[1]", 0, 1000, errors);
            int? w = ObjectReader.ReadInt(a.Items[2], path + "[2]", 1, 1000, errors);
            int? h = ObjectReader.ReadInt(a.Items[3], path + "[3]", 1, 1000, errors);
            return x.HasValue && y.HasValue && w.HasValue && h.HasValue ? new RectData(x.Value, y.Value, w.Value, h.Value) : null;
        }

        private static List<SeasonDefinition> ReadSeasonTable(ObjectReader r)
        {
            return r.Members("season_table", (key, node, path) =>
            {
                ObjectReader? o = ObjectReader.Open(node, path, r.Errors);
                if (o == null)
                {
                    return null;
                }

                var d = new SeasonDefinition(key, o.Int("move_cost_pct_land", 0, 10000), o.Int("move_cost_pct_water", 0, 10000),
                    o.Int("food_output_pct", 0, 10000));
                o.Finish();
                return d;
            });
        }

        private static SeasonRange? ReadSeasonRange(JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            var s = new SeasonRange(o.Int("from_turn", 0, 1000), o.Int("to_turn", 0, 1000), o.Str("season", ObjectReader.DottedId),
                o.OptStr("first_turn_contains_date"));
            o.Finish();
            return s;
        }

        private static TimedEffectData? ReadTimedEffect(JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            string id = o.Str("id", ObjectReader.DottedId);
            int from = o.Int("from_turn", 0, 1000);
            int? to = o.OptInt("to_turn", 0, 1000);
            string target = o.Str("target_slot", ObjectReader.Slug);
            bool announce = o.OptBool("announce") ?? false;
            string? date = o.OptStr("first_turn_contains_date");
            var effects = o.List("effects", (n, p) =>
            {
                ObjectReader? e = ObjectReader.Open(n, p, errors);
                if (e == null)
                {
                    return null;
                }

                var k = new TimedEffectKind(e.Str("kind", ObjectReader.Slug), e.OptStr("in_flight"), e.OptStr("scope"),
                    e.OptInt("permille", 0, 1000));
                e.Finish();
                return k;
            });
            o.Finish();
            return new TimedEffectData(id, from, to, target, announce, date, effects);
        }

        private static BalanceData ReadBalance(ObjectReader? o, ErrorSink errors)
        {
            if (o == null)
            {
                return new BalanceData(new List<CommodityBound>(), 0);
            }

            var bounds = o.Members("commodity_bounds", (key, node, path) =>
            {
                if (!(node is JsonArray a) || a.Items.Count != 2)
                {
                    errors.Add(path, "schema.type", "expected a [min, max] pair", node);
                    return null;
                }

                int? min = ObjectReader.ReadInt(a.Items[0], path + "[0]", 0, 100000, errors);
                int? max = ObjectReader.ReadInt(a.Items[1], path + "[1]", 0, 100000, errors);
                return min.HasValue && max.HasValue ? new CommodityBound(key, min.Value, max.Value) : null;
            });
            var data = new BalanceData(bounds, o.Int("max_slot_ratio_pct", 100, 10000));
            o.Finish();
            return data;
        }

        private static EndConditionsData ReadEndConditions(ObjectReader? o, ErrorSink errors)
        {
            if (o == null)
            {
                return new EndConditionsData(new List<SurrenderRule>(), new EliminationData(0, 0),
                    new DeadlineData(0, string.Empty, null, null), new List<TagCount>());
            }

            var surrender = o.List("surrender", (n, p) => ReadSurrender(n, p, errors));
            ObjectReader? el = o.Obj("elimination");
            var elimination = new EliminationData(el?.Int("homeless_turns_limit", 0, 1000) ?? 0,
                el?.Int("no_base_no_founder_grace_turns", 0, 1000) ?? 0);
            el?.Finish();
            ObjectReader? dl = o.Obj("deadline");
            var deadline = new DeadlineData(dl?.Int("max_turns", 0, 1000) ?? 0, dl?.Str("result") ?? string.Empty,
                dl?.OptStr("winner_slot"), dl?.OptStr("last_turn_contains_date"));
            dl?.Finish();
            var tagCounts = o.Members("tag_counts", (key, node, path) =>
            {
                int? c = ObjectReader.ReadInt(node, path, 0, 1000, errors);
                return c.HasValue ? new TagCount(key, c.Value) : null;
            });
            o.Finish();
            return new EndConditionsData(surrender, elimination, deadline, tagCounts);
        }

        private static SurrenderRule? ReadSurrender(JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            string slot = o.Str("slot", ObjectReader.Slug);
            string winner = o.Str("winner_slot", ObjectReader.Slug);
            JsonNode? when = o.Raw("when", true);
            PredicateData? predicate = when == null ? null : PredicateReader.Read(when, path + ".when", errors, 0);
            o.Finish();
            return predicate == null ? null : new SurrenderRule(slot, winner, predicate);
        }
    }
}
