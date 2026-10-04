using System.Text.Json.Nodes;
using Conquest.Content;
using Conquest.Content.Model;

namespace Conquest.Tests.Content;

/// <summary>Each case breaks one thing in a copy of the shipped scenario and expects a specific error code at a specific JSON path.</summary>
public class ScenarioBrokenVariantTests
{
    public sealed record Case(string Name, Action<JsonNode> Edit, string Path, string Code)
    {
        public override string ToString() => Name;
    }

    private static JsonNode Base(JsonNode root, int i) => root["pre_placed_bases"]![i]!;

    private static JsonNode Arrival(JsonNode root, int i) => root["arrivals"]![i]!;

    private static JsonNode Rows(JsonNode root) => root["map"]!["rows"]!;

    public static IEnumerable<Case> MapAndEntryCases()
    {
        yield return new Case("map: a row is missing", r => Rows(r).AsArray().RemoveAt(9), "$.map.rows", "map.row_count");
        yield return new Case("map: a row is too long", r => Rows(r)[3] = "oossofoorrofo", "$.map.rows[3]", "map.row_width");
        yield return new Case("map: unknown symbol in a row", r => Rows(r)[0] = "xfoohhoppoor", "$.map.rows[0]", "map.unknown_symbol");
        yield return new Case("map: unknown terrain role in the legend", r => r["map"]!["legend"]!["o"]!["terrain"] = "t.lava",
            "$.map.legend.o.terrain", "map.legend_terrain");
        yield return new Case("map: look cannot sit on that terrain", r => r["map"]!["legend"]!["f"]!["look"] = "meadow",
            "$.map.legend.f.look", "map.legend_look");
        yield return new Case("map: unknown look", r => r["map"]!["legend"]!["f"]!["look"] = "volcano",
            "$.map.legend.f.look", "map.legend_look");
        yield return new Case("map: legend symbol never used", r => r["map"]!["legend"]!["x"] = JsonNode.Parse("{\"terrain\":\"t.peak\",\"look\":\"high_hill\"}"),
            "$.map.legend.x", "map.legend_unused");
        yield return new Case("map: too small", r => r["map"]!["width"] = 2, "$.map.width", "map.size");
        yield return new Case("unit on impossible terrain: entry tile on the lake", r => Rows(r)[3] = "lossofoorrof",
            "$.entry_groups.entry.s08.tiles[0]", "entry.impassable");
        yield return new Case("entry tile outside the map", r => r["entry_groups"]!["entry.s06"]!["tiles"]![0] = JsonNode.Parse("[2, 20]"),
            "$.entry_groups.entry.s06.tiles[0]", "entry.outside");
        yield return new Case("entry tile not on the edge", r => r["entry_groups"]!["entry.s06"]!["tiles"]![0] = JsonNode.Parse("[4, 4]"),
            "$.entry_groups.entry.s06.tiles[0]", "entry.not_on_edge");
        yield return new Case("entry tile next to an opposing base", r => r["entry_groups"]!["entry.s02"]!["tiles"]![0] = JsonNode.Parse("[11, 1]"),
            "$.entry_groups.entry.s02.tiles[0]", "entry.too_close");
        yield return new Case("entry group without tiles", r => r["entry_groups"]!["entry.s06"]!["tiles"] = JsonNode.Parse("[]"),
            "$.entry_groups.entry.s06.tiles", "entry.empty");
        yield return new Case("entry group with a repeated tile", r => r["entry_groups"]!["entry.s06"]!["tiles"]![1] = JsonNode.Parse("[2, 0]"),
            "$.entry_groups.entry.s06.tiles[1]", "entry.duplicate_tile");
        yield return new Case("entry group owned by a slot that starts with bases", r => r["entry_groups"]!["entry.s06"]!["slot"] = "f2",
            "$.entry_groups.entry.s06.slot", "entry.slot");
    }

    public static IEnumerable<Case> ArrivalAndPlayerCases()
    {
        yield return new Case("arrival: unknown entry group", r => Arrival(r, 0)["entry"]!["group"] = "entry.s99",
            "$.arrivals[0].entry.group", "arrival.entry");
        yield return new Case("arrival: entry group belongs to the other side", r => Arrival(r, 4)["entry"] = JsonNode.Parse("{\"group\":\"entry.s08\"}"),
            "$.arrivals[4].entry.group", "arrival.entry");
        yield return new Case("arrival: base guards cannot be delivered", r => Arrival(r, 1)["units"]![1]!["role"] = "u.militia",
            "$.arrivals[1].units[1].role", "arrival.role_not_allowed");
        yield return new Case("arrival: unknown unit role", r => Arrival(r, 1)["units"]![1]!["role"] = "u.dragon",
            "$.arrivals[1].units[1].role", "arrival.role");
        yield return new Case("arrival: after the last turn", r => Arrival(r, 3)["turn"] = 89, "$.arrivals[3].turn", "arrival.turn");
        yield return new Case("arrival: attach without a commander", r => Arrival(r, 3)["units"]![0]!["role"] = "u.scout",
            "$.arrivals[3].attach_to_first_commander", "arrival.attach_no_commander");
        yield return new Case("arrival: player side must use an entry group", r => ((JsonObject)Arrival(r, 2)).Remove("entry"),
            "$.arrivals[2].entry", "arrival.entry_required");
        yield return new Case("arrival: boats need water entry tiles", r => Arrival(r, 2)["units"]![1]!["role"] = "u.transport",
            "$.arrivals[2].entry.group", "arrival.transport_terrain");
        yield return new Case("arrival: empty unit list", r => Arrival(r, 2)["units"] = JsonNode.Parse("[]"),
            "$.arrivals[2].units", "arrival.empty");
        yield return new Case("player: no organising team at the start", r =>
        {
            Arrival(r, 0)["units"]![0]!["role"] = "u.scout";
            Arrival(r, 1)["units"]![0]!["role"] = "u.scout";
        }, "$.players[0]", "players.no_founder");
        yield return new Case("player: duplicate slot", r => r["players"]![1]!["slot"] = "f1", "$.players[1].slot", "players.slot_duplicate");
        yield return new Case("player: no human", r => r["players"]![0]!["control"] = "ai", "$.players", "players.no_human");
        yield return new Case("player: computer count disagrees", r => r["settings"]!["computer_players"] = 2,
            "$.settings.computer_players", "settings.computer_players");
        yield return new Case("player: start kit on a slot with bases", r => r["players"]![1]!["start_kit"] = JsonNode.Parse("{\"res.basic\":1}"),
            "$.players[1].start_kit", "players.kit_unexpected");
    }

    public static IEnumerable<Case> BaseCases()
    {
        yield return new Case("base: core on forest", r => Base(r, 1)["anchor"] = JsonNode.Parse("[11, 3]"),
            "$.pre_placed_bases[1].anchor", "base.anchor_terrain");
        yield return new Case("base: anchor outside the map", r => Base(r, 1)["anchor"] = JsonNode.Parse("[40, 3]"),
            "$.pre_placed_bases[1].anchor", "base.anchor_outside");
        yield return new Case("base: two cores side by side", r => Base(r, 5)["anchor"] = JsonNode.Parse("[10, 4]"),
            "$.pre_placed_bases[5].anchor", "base.too_close");
        yield return new Case("base: building outside the base area", r => Base(r, 0)["buildings"]![2]!["at"] = JsonNode.Parse("[0, 0]"),
            "$.pre_placed_bases[0].buildings[2].at", "base.building_area");
        yield return new Case("base: building level above the core", r => Base(r, 1)["buildings"]![0]!["level"] = 3,
            "$.pre_placed_bases[1].buildings[0].level", "base.building_level");
        yield return new Case("base: ghat on dry land", r => Base(r, 0)["buildings"]![4]!["at"] = JsonNode.Parse("[10, 8]"),
            "$.pre_placed_bases[0].buildings[4].at", "base.building_terrain");
        yield return new Case("base: two buildings on one tile", r => Base(r, 0)["buildings"]![2]!["at"] = JsonNode.Parse("[9, 9]"),
            "$.pre_placed_bases[0].buildings[2].at", "base.building_overlap");
        yield return new Case("base: building off the map", r => Base(r, 3)["buildings"]![0]!["at"] = JsonNode.Parse("[12, 6]"),
            "$.pre_placed_bases[3].buildings[0].at", "base.building_outside");
        yield return new Case("base: a second core listed as a building", r => Base(r, 0)["buildings"]![1]!["role"] = "bld.core",
            "$.pre_placed_bases[0].buildings[1].role", "base.building_role");
        yield return new Case("base: more volunteers than housing", r => Base(r, 4)["pop"] = 500,
            "$.pre_placed_bases[4].pop", "base.pop_capacity");
        yield return new Case("base: garrison above the support cap", r => Base(r, 3)["garrison"]![0]!["count"] = 3,
            "$.pre_placed_bases[3].garrison", "base.garrison_cap");
        yield return new Case("base: scouts cannot start in a garrison", r => Base(r, 3)["garrison"]![0]!["role"] = "u.scout",
            "$.pre_placed_bases[3].garrison[0].role", "base.garrison_role");
        yield return new Case("base: real place that raids may destroy", r => Base(r, 0)["raid_can_destroy"] = true,
            "$.pre_placed_bases[0].raid_can_destroy", "base.raid_destroy");
        yield return new Case("base: duplicate site id", r => Base(r, 2)["site_id"] = "site.fortress_1",
            "$.pre_placed_bases[2].site_id", "base.site_duplicate");
        yield return new Case("base: site id without the site prefix", r => Base(r, 2)["site_id"] = "place.fortress_2",
            "$.pre_placed_bases[2].site_id", "base.site_id");
        yield return new Case("base: unknown tag", r => Base(r, 2)["tags"] = JsonNode.Parse("[\"stronghold\"]"),
            "$.pre_placed_bases[2].tags[0]", "base.tag");
        yield return new Case("base: no tags", r => Base(r, 2)["tags"] = JsonNode.Parse("[]"),
            "$.pre_placed_bases[2].tags", "base.tags_empty");
        yield return new Case("base: unknown stock resource", r => Base(r, 2)["stock"]!["res.gold"] = 3,
            "$.pre_placed_bases[2].stock.res.gold", "base.stock_resource");
        yield return new Case("base: negative stock", r => Base(r, 2)["stock"]!["res.food"] = -1,
            "$.pre_placed_bases[2].stock.res.food", "base.stock_amount");
        yield return new Case("base: unknown intel seed", r => Base(r, 2)["intel_seed"] = "everything",
            "$.pre_placed_bases[2].intel_seed", "base.intel_seed");
        yield return new Case("base: owner is the player side", r => Base(r, 2)["owner"] = "f1",
            "$.pre_placed_bases[2].owner", "base.owner");
        yield return new Case("base: second level-3 core in one region", r => Base(r, 2)["core_level"] = 3,
            "$.pre_placed_bases[2].core_level", "base.region_cap");
    }

    public static IEnumerable<Case> ScheduleAndEndCases()
    {
        yield return new Case("region: overlapping rectangles", r => r["regions"]![1]!["rects"] = JsonNode.Parse("[[5,0,7,10]]"),
            "$.regions[1].rects[0]", "region.overlap");
        yield return new Case("region: rectangle leaves the map", r => r["regions"]![1]!["rects"] = JsonNode.Parse("[[6,0,9,10]]"),
            "$.regions[1].rects[0]", "region.rect_outside");
        yield return new Case("region: duplicate id", r => r["regions"]![1]!["id"] = "region.r08", "$.regions[1].id", "region.duplicate");
        yield return new Case("region: cap slot is not a player", r => r["region_cap_slots"] = JsonNode.Parse("[\"f9\"]"),
            "$.region_cap_slots", "region.cap_slot");
        yield return new Case("season: ranges overlap", r => r["season_schedule"]![1]!["from_turn"] = 20,
            "$.season_schedule[1].from_turn", "season.order");
        yield return new Case("season: unknown season id", r => r["season_schedule"]![2]!["season"] = "season.none",
            "$.season_schedule[2].season", "season.unknown");
        yield return new Case("season: stated date is in another turn", r => r["season_schedule"]![1]!["first_turn_contains_date"] = "1971-06-20",
            "$.season_schedule[1].first_turn_contains_date", "season.date_mismatch");
        yield return new Case("season: bad date text", r => r["season_schedule"]![1]!["first_turn_contains_date"] = "June 1",
            "$.season_schedule[1].first_turn_contains_date", "calendar.date_format");
        yield return new Case("season: multiplier out of bounds", r => r["season_table"]!["season.wet"]!["move_cost_pct_land"] = 400,
            "$.season_table.season.wet.move_cost_pct_land", "season.bounds");
        yield return new Case("season: range runs past the last turn", r => r["season_schedule"]![2]!["to_turn"] = 95,
            "$.season_schedule[2].to_turn", "season.beyond_max");
        yield return new Case("season: reversed range", r => r["season_schedule"]![2]!["to_turn"] = 60,
            "$.season_schedule[2]", "season.range");
        yield return new Case("timed effect: unknown target", r => r["timed_effects"]![0]!["target_slot"] = "f9",
            "$.timed_effects[0].target_slot", "timed.target");
        yield return new Case("timed effect: unknown kind", r => r["timed_effects"]![0]!["effects"]![0]!["kind"] = "flood",
            "$.timed_effects[0].effects[0].kind", "timed.kind");
        yield return new Case("timed effect: wrong in-flight rule", r => r["timed_effects"]![0]!["effects"]![0]!["in_flight"] = "keep",
            "$.timed_effects[0].effects[0].in_flight", "timed.in_flight");
        yield return new Case("timed effect: date not in the start turn", r => r["timed_effects"]![0]!["first_turn_contains_date"] = "1971-11-03",
            "$.timed_effects[0].first_turn_contains_date", "timed.date_mismatch");
        yield return new Case("end: predicate names an unknown site",
            r => r["end_conditions"]!["surrender"]![0]!["when"]!["any_of"]![0]!["holds_site"]!["site"] = "site.nowhere",
            "$.end_conditions.surrender[0].when.any_of[0].holds_site.site", "predicate.site");
        yield return new Case("end: more fortress sites demanded than exist",
            r => r["end_conditions"]!["surrender"]![0]!["when"]!["any_of"]![1]!["all_of"]![0]!["holds_sites_count"]!["at_least"] = 3,
            "$.end_conditions.surrender[0].when.any_of[1].all_of[0].holds_sites_count.at_least", "predicate.unreachable");
        yield return new Case("end: predicate names an unknown tag",
            r => r["end_conditions"]!["surrender"]![0]!["when"]!["any_of"]![1]!["all_of"]![0]!["holds_sites_count"]!["tag"] = "citadel",
            "$.end_conditions.surrender[0].when.any_of[1].all_of[0].holds_sites_count.tag", "predicate.tag");
        yield return new Case("end: predicate counts a slot with no starting sites",
            r => r["end_conditions"]!["surrender"]![0]!["when"]!["any_of"]![1]!["all_of"]![1]!["initial_sites_held_at_most_pct"]!["slot"] = "f1",
            "$.end_conditions.surrender[0].when.any_of[1].all_of[1].initial_sites_held_at_most_pct.slot", "predicate.no_initial_sites");
        yield return new Case("end: unknown predicate kind",
            r => r["end_conditions"]!["surrender"]![0]!["when"] = JsonNode.Parse("{\"holds_everything\":{}}"),
            "$.end_conditions.surrender[0].when.holds_everything", "predicate.unknown_kind");
        yield return new Case("end: predicate with two kinds",
            r => r["end_conditions"]!["surrender"]![0]!["when"] = JsonNode.Parse("{\"has_base\":{\"slot\":\"f1\"},\"turn_at_least\":{\"turn\":3}}"),
            "$.end_conditions.surrender[0].when", "predicate.shape");
        yield return new Case("end: predicate too deep",
            r => r["end_conditions"]!["surrender"]![0]!["when"] = JsonNode.Parse(
                "{\"not\":{\"not\":{\"not\":{\"not\":{\"has_base\":{\"slot\":\"f1\"}}}}}}"),
            "$.end_conditions.surrender[0].when", "predicate.depth");
        yield return new Case("end: predicate with too many nodes",
            r => r["end_conditions"]!["surrender"]![0]!["when"] = JsonNode.Parse(
                "{\"any_of\":[" + string.Join(",", Enumerable.Repeat("{\"has_base\":{\"slot\":\"f1\"}}", 33)) + "]}"),
            "$.end_conditions.surrender[0].when", "predicate.nodes");
        yield return new Case("end: empty any_of",
            r => r["end_conditions"]!["surrender"]![0]!["when"] = JsonNode.Parse("{\"any_of\":[]}"),
            "$.end_conditions.surrender[0].when", "predicate.empty");
        yield return new Case("end: base_count with both bounds",
            r => r["end_conditions"]!["surrender"]![0]!["when"] = JsonNode.Parse("{\"base_count\":{\"slot\":\"f1\",\"at_least\":1,\"at_most\":3}}"),
            "$.end_conditions.surrender[0].when.base_count", "predicate.base_count_bounds");
        yield return new Case("end: unknown unit role in a predicate",
            r => r["end_conditions"]!["surrender"]![0]!["when"] = JsonNode.Parse("{\"has_unit_role\":{\"slot\":\"f1\",\"role\":\"u.dragon\"}}"),
            "$.end_conditions.surrender[0].when.has_unit_role.role", "predicate.role");
        yield return new Case("end: a slot cannot win by its own surrender", r => r["end_conditions"]!["surrender"]![0]!["winner_slot"] = "f2",
            "$.end_conditions.surrender[0].winner_slot", "end.winner");
        yield return new Case("end: no way to win", r => r["end_conditions"]!["surrender"] = JsonNode.Parse("[]"),
            "$.end_conditions.surrender", "end.no_victory_path");
        yield return new Case("end: tag count disagrees with the sites", r => r["end_conditions"]!["tag_counts"]!["fortress"] = 3,
            "$.end_conditions.tag_counts.fortress", "end.tag_count");
        yield return new Case("end: tag not declared", r => ((JsonObject)r["end_conditions"]!["tag_counts"]!).Remove("garrison_town"),
            "$.end_conditions.tag_counts", "end.tag_undeclared");
        yield return new Case("end: deadline differs from max turns", r => r["end_conditions"]!["deadline"]!["max_turns"] = 90,
            "$.end_conditions.deadline.max_turns", "end.deadline_turns");
        yield return new Case("end: a draw may not name a winner", r => r["end_conditions"]!["deadline"]!["winner_slot"] = "f1",
            "$.end_conditions.deadline.winner_slot", "end.deadline_winner");
        yield return new Case("end: last turn does not contain the stated date", r => r["end_conditions"]!["deadline"]!["last_turn_contains_date"] = "1971-12-25",
            "$.end_conditions.deadline.last_turn_contains_date", "end.date_mismatch");
        yield return new Case("end: grace shorter than the homeless limit", r => r["end_conditions"]!["elimination"]!["no_base_no_founder_grace_turns"] = 5,
            "$.end_conditions.elimination.no_base_no_founder_grace_turns", "end.elimination");
        yield return new Case("balance: coin above its bound", r => r["players"]![0]!["start_kit"]!["res.coin"] = 50,
            "$.balance.commodity_bounds.res.coin", "balance.commodity");
        yield return new Case("balance: sides too far apart", r => r["balance"]!["max_slot_ratio_pct"] = 100,
            "$.balance.max_slot_ratio_pct", "balance.ratio");
        yield return new Case("balance: bounds missing for a commodity", r => ((JsonObject)r["balance"]!["commodity_bounds"]!).Remove("res.food"),
            "$.balance.commodity_bounds", "balance.bounds_missing");
        yield return new Case("balance: min above max", r => r["balance"]!["commodity_bounds"]!["res.food"] = JsonNode.Parse("[40, 1]"),
            "$.balance.commodity_bounds.res.food", "balance.bounds");
        yield return new Case("balance: unknown resource in the player kit", r => r["players"]![0]!["start_kit"]!["res.gold"] = 1,
            "$.players[0].start_kit.res.gold", "players.kit_resource");
        yield return new Case("header: wrong schema id", r => r["schema"] = "scenario/9", "$.schema", "scenario.schema");
        yield return new Case("header: native settlements switched on", r => r["settings"]!["native_settlements"] = 2,
            "$.settings.native_settlements", "settings.native_settlements");
        yield return new Case("header: unknown difficulty", r => r["settings"]!["difficulty"] = "brutal", "$.settings.difficulty", "settings.value");
        yield return new Case("header: bad epoch", r => r["calendar"]!["epoch"] = "26 March", "$.calendar.epoch", "calendar.epoch");
        yield return new Case("header: unsupported ruleset", r => r["requires"]!["major"] = 2, "$.requires", "scenario.requires");
    }

    public static IEnumerable<Case> ShapeAndWordCases()
    {
        yield return new Case("shape: unknown top-level key", r => r["extra"] = 1, "$.extra", "schema.unknown_key");
        yield return new Case("shape: unknown nested key", r => r["map"]!["fog"] = true, "$.map.fog", "schema.unknown_key");
        yield return new Case("shape: required field missing", r => ((JsonObject)r).Remove("map"), "$.map", "schema.missing");
        yield return new Case("shape: wrong type", r => r["settings"]!["max_turns"] = "89", "$.settings.max_turns", "schema.type");
        yield return new Case("shape: number out of range", r => r["arrivals"]![0]!["units"]![0]!["level"] = 9,
            "$.arrivals[0].units[0].level", "schema.range");
        yield return new Case("shape: id pattern", r => r["id"] = "Not A Slug", "$.id", "schema.pattern");
        yield return new Case("shape: object expected", r => r["map"] = JsonNode.Parse("[1]"), "$.map", "schema.type");
        yield return new Case("shape: tile pair expected", r => Base(r, 0)["anchor"] = JsonNode.Parse("[1, 2, 3]"),
            "$.pre_placed_bases[0].anchor", "schema.type");
        yield return new Case("shape: legend key must be one character", r => r["map"]!["legend"]!["oo"] = JsonNode.Parse("{\"terrain\":\"t.open\",\"look\":\"meadow\"}"),
            "$.map.legend.oo", "schema.pattern");
        yield return new Case("words: a forbidden word in a note", r => r["_note"] = "the enemy advances", "$._note", "content.forbidden_word");
        yield return new Case("words: a civilian-state word in a key", r => r["_civilians"] = 1, "$._civilians", "content.forbidden_word");
        yield return new Case("words: a weapon in a value", r => r["settings"]!["movement"] = "rifle", "$.settings.movement", "content.forbidden_word");
        yield return new Case("words: a colonial word in a value", r => r["theme_hint"] = "colonial", "$.theme_hint", "content.forbidden_word");
        yield return new Case("words: a banned phrase in a value", r => r["_note"] = "Joy Bangla", "$._note", "content.forbidden_word");
    }

    private static IEnumerable<Case> All()
    {
        return MapAndEntryCases().Concat(ArrivalAndPlayerCases()).Concat(BaseCases()).Concat(ScheduleAndEndCases()).Concat(ShapeAndWordCases());
    }

    [Test]
    public void There_are_at_least_fifteen_broken_variants()
    {
        Assert.That(All().Count(), Is.GreaterThanOrEqualTo(15));
        Assert.That(All().Select(c => c.Name).Distinct().Count(), Is.EqualTo(All().Count()), "case names are unique");
    }

    [TestCaseSource(nameof(MapAndEntryCases))]
    public void Map_and_entry_variants_fail_with_the_right_path(Case c) => AssertRejected(c);

    [TestCaseSource(nameof(ArrivalAndPlayerCases))]
    public void Arrival_and_player_variants_fail_with_the_right_path(Case c) => AssertRejected(c);

    [TestCaseSource(nameof(BaseCases))]
    public void Base_variants_fail_with_the_right_path(Case c) => AssertRejected(c);

    [TestCaseSource(nameof(ScheduleAndEndCases))]
    public void Schedule_end_and_balance_variants_fail_with_the_right_path(Case c) => AssertRejected(c);

    [TestCaseSource(nameof(ShapeAndWordCases))]
    public void Shape_and_word_variants_fail_with_the_right_path(Case c) => AssertRejected(c);

    private static void AssertRejected(Case c)
    {
        LoadResult<ScenarioData> result = ContentTestData.LoadScenarioMutated(c.Edit);

        ContentTestData.AssertHas(result, c.Path, c.Code);
        Assert.That(result.Hash, Is.Zero, "a rejected file has no hash");
    }

    [Test]
    public void Syntax_errors_come_back_as_errors_not_exceptions()
    {
        string text = ContentTestData.ScenarioText;
        string[] broken =
        {
            text.Replace("\"max_turns\": 89,", "\"max_turns\": 89.5,"),
            text.Replace("\"width\": 12,", "\"width\": 12,\n    \"width\": 13,"),
            text.TrimEnd().TrimEnd('}') + ",}",
            text.Substring(0, text.Length / 2),
        };

        foreach (string b in broken)
        {
            LoadResult<ScenarioData> r = ContentLoader.LoadScenario(b);
            Assert.That(r.Ok, Is.False);
            Assert.That(r.Errors.Count, Is.EqualTo(1));
            Assert.That(r.Errors[0].Code, Does.StartWith("json."));
            Assert.That(r.Errors[0].Line, Is.GreaterThan(0));
        }
    }

    [Test]
    public void Without_the_allow_list_the_scenario_still_loads_because_it_needs_no_exceptions()
    {
        LoadResult<ScenarioData> r = ContentLoader.LoadScenario(ContentTestData.ScenarioText);

        Assert.That(r.Ok, Is.True, string.Join("\n", r.Errors));
    }
}
