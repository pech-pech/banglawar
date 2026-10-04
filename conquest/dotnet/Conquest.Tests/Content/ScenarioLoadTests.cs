using System.Text.Json.Nodes;
using Conquest.Content;
using Conquest.Content.Model;
using Conquest.Content.Validation;

namespace Conquest.Tests.Content;

public class ScenarioLoadTests
{
    [Test]
    public void Shipped_scenario_loads_with_no_errors()
    {
        LoadResult<ScenarioData> result = ContentLoader.LoadScenario(ContentTestData.ScenarioText, ContentTestData.AllowList());

        Assert.That(result.Errors, Is.Empty, string.Join("\n", result.Errors));
        Assert.That(result.Ok, Is.True);
        Assert.That(result.Data!.Id, Is.EqualTo("liberation-1971-skirmish"));
    }

    [Test]
    public void Shipped_scenario_has_the_small_map_and_sides_the_plan_describes()
    {
        ScenarioData s = ContentTestData.Scenario();

        Assert.That(s.Map.Width, Is.EqualTo(12));
        Assert.That(s.Map.Height, Is.EqualTo(10));
        Assert.That(s.Players.Select(p => p.Slot), Is.EqualTo(new[] { "f1", "f2" }));
        Assert.That(s.Players[0].Control, Is.EqualTo("human"));
        Assert.That(s.Players[0].StartMode, Is.EqualTo("entry_tiles"));
        Assert.That(s.PrePlacedBases.All(b => b.Owner == "f2"), Is.True, "the player starts with no base");
        Assert.That(s.PrePlacedBases.Select(b => b.SiteId), Is.EqualTo(new[]
        {
            "site.capital", "site.fortress_1", "site.fortress_2", "site.zone_1", "site.town_01", "site.town_02",
        }));
        Assert.That(s.Settings.MaxTurns, Is.EqualTo(89));
    }

    [Test]
    public void Map_uses_every_terrain_family_of_the_concept_art()
    {
        ScenarioData s = ContentTestData.Scenario();
        var looks = s.Map.Legend.Select(l => l.Look).ToHashSet();

        Assert.That(looks, Is.SupersetOf(new[] { "meadow", "paddy_water", "paddy_dense", "stubble", "forest", "tea", "water" }));
        Assert.That(s.Map.Legend.Select(l => l.Terrain).Distinct(),
            Is.SupersetOf(new[] { "t.open", "t.wood_a", "t.rough", "t.river", "t.still" }));
    }

    [Test]
    public void River_runs_diagonally_across_the_map_and_a_lake_sits_beside_it()
    {
        ScenarioData s = ContentTestData.Scenario();
        var river = new HashSet<(int, int)>();
        int lake = 0;
        for (int y = 0; y < s.Map.Height; y++)
        {
            for (int x = 0; x < s.Map.Width; x++)
            {
                string? t = s.Map.TerrainAt(x, y);
                if (t == "t.river")
                {
                    river.Add((x, y));
                }
                else if (t == "t.still")
                {
                    lake++;
                }
            }
        }

        Assert.That(river.Count, Is.GreaterThanOrEqualTo(15));
        Assert.That(lake, Is.GreaterThanOrEqualTo(3));
        Assert.That(Reaches(river, (s.Map.Width - 1, 0), (x, y) => y == s.Map.Height - 1), Is.True,
            "the river connects the north-east corner to the south edge");
    }

    [Test]
    public void Lake_is_one_real_body_of_water_that_no_building_or_base_stands_in_or_against()
    {
        ScenarioData s = ContentTestData.Scenario();
        var lake = new HashSet<(int, int)>();
        for (int y = 0; y < s.Map.Height; y++)
        {
            for (int x = 0; x < s.Map.Width; x++)
            {
                if (s.Map.TerrainAt(x, y) == "t.still")
                {
                    lake.Add((x, y));
                }
            }
        }

        Assert.That(lake.Count, Is.GreaterThanOrEqualTo(6), "big enough to read as a lake, not a puddle");
        (int, int) first = lake.OrderBy(t => t.Item2).ThenBy(t => t.Item1).First();
        var seen = new HashSet<(int, int)> { first };
        var queue = new Queue<(int, int)>(new[] { first });
        while (queue.Count > 0)
        {
            (int x, int y) = queue.Dequeue();
            foreach ((int, int) next in new[] { (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1) })
            {
                if (lake.Contains(next) && seen.Add(next))
                {
                    queue.Enqueue(next);
                }
            }
        }

        Assert.That(seen.Count, Is.EqualTo(lake.Count), "one body of water (4-connected), not scattered pools");
        Assert.That(lake.Max(t => t.Item1) - lake.Min(t => t.Item1), Is.GreaterThanOrEqualTo(2), "at least three tiles across");
        Assert.That(lake.Max(t => t.Item2) - lake.Min(t => t.Item2), Is.GreaterThanOrEqualTo(2), "at least three tiles down");

        var structures = new List<(string Name, int X, int Y)>();
        foreach (PrePlacedBase b in s.PrePlacedBases)
        {
            structures.Add((b.SiteId + " core", b.Anchor.X, b.Anchor.Y));
            foreach (BuildingPlacement bp in b.Buildings)
            {
                int size = Vocabulary.Footprint(bp.Role);
                for (int dy = 0; dy < size; dy++)
                {
                    for (int dx = 0; dx < size; dx++)
                    {
                        structures.Add((b.SiteId + " " + bp.Role, bp.At.X + dx, bp.At.Y + dy));
                    }
                }
            }
        }

        foreach ((string name, int sx, int sy) in structures)
        {
            bool touchesLake = lake.Any(t => Math.Max(Math.Abs(t.Item1 - sx), Math.Abs(t.Item2 - sy)) <= 1);
            Assert.That(touchesLake, Is.False, name + " at [" + sx + ", " + sy + "] stands in or right against the lake, where its picture would hide it");
        }
    }

    [Test]
    public void The_port_stands_on_the_river_inside_its_base_area()
    {
        ScenarioData s = ContentTestData.Scenario();
        PrePlacedBase capital = s.PrePlacedBases.Single(b => b.SiteId == "site.capital");
        BuildingPlacement port = capital.Buildings.Single(b => b.Role == "bld.port");

        Assert.That(s.Map.TerrainAt(port.At.X, port.At.Y), Is.EqualTo("t.river"));
        Assert.That(Math.Max(Math.Abs(port.At.X - capital.Anchor.X), Math.Abs(port.At.Y - capital.Anchor.Y)),
            Is.LessThanOrEqualTo(Vocabulary.AreaRadius(capital.CoreLevel)));
    }

    private static bool Reaches(HashSet<(int, int)> tiles, (int, int) start, Func<int, int, bool> goal)
    {
        var seen = new HashSet<(int, int)> { start };
        var queue = new Queue<(int, int)>();
        queue.Enqueue(start);
        while (queue.Count > 0)
        {
            (int x, int y) = queue.Dequeue();
            if (goal(x, y))
            {
                return true;
            }

            for (int dy = -1; dy <= 1; dy++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    (int, int) next = (x + dx, y + dy);
                    if (tiles.Contains(next) && seen.Add(next))
                    {
                        queue.Enqueue(next);
                    }
                }
            }
        }

        return false;
    }

    [Test]
    public void No_unit_starts_on_impossible_terrain()
    {
        ScenarioData s = ContentTestData.Scenario();

        foreach (EntryGroupData g in s.EntryGroups)
        {
            foreach (TilePoint t in g.Tiles)
            {
                Assert.That(Vocabulary.IsLandPassable(s.Map.TerrainAt(t.X, t.Y)!), Is.True, g.Id + " " + t);
            }
        }

        foreach (PrePlacedBase b in s.PrePlacedBases)
        {
            Assert.That(s.Map.TerrainAt(b.Anchor.X, b.Anchor.Y), Is.EqualTo("t.open"), b.SiteId);
        }
    }

    [Test]
    public void End_conditions_count_six_starting_garrison_positions_for_the_opposing_side()
    {
        ScenarioData s = ContentTestData.Scenario();

        Assert.That(s.PrePlacedBases.Count(b => b.Owner == "f2"), Is.EqualTo(6));
        Assert.That(s.EndConditions.TagCounts.Select(t => (t.Tag, t.Count)),
            Is.EqualTo(new[] { ("capital", 1), ("fortress", 2), ("defence_zone", 1), ("garrison_town", 2) }));
        SurrenderRule rule = s.EndConditions.Surrender.Single();
        Assert.That(rule.Slot, Is.EqualTo("f2"));
        Assert.That(rule.WinnerSlot, Is.EqualTo("f1"));
        Assert.That(s.EndConditions.Deadline.Result, Is.EqualTo("draw"));
        Assert.That(s.EndConditions.Deadline.WinnerSlot, Is.Null);
    }

    [Test]
    public void Calendar_dates_line_up_with_the_season_and_deadline_turns()
    {
        ScenarioData s = ContentTestData.Scenario();
        CalendarMath.TryParseDate(s.Calendar.Epoch, out DateTime epoch);

        Assert.That(CalendarMath.TurnContains(epoch, 3, 22, new DateTime(1971, 6, 1)), Is.True);
        Assert.That(CalendarMath.TurnContains(epoch, 3, 63, new DateTime(1971, 10, 1)), Is.True);
        Assert.That(CalendarMath.TurnContains(epoch, 3, 84, new DateTime(1971, 12, 3)), Is.True);
        Assert.That(CalendarMath.TurnContains(epoch, 3, 88, new DateTime(1971, 12, 16)), Is.True);
        Assert.That(CalendarMath.TurnContains(epoch, 3, 21, new DateTime(1971, 6, 1)), Is.False);
    }

    [Test]
    public void Opening_resources_are_balanced_within_the_stated_bounds()
    {
        ScenarioData s = ContentTestData.Scenario();
        int f1 = s.Players[0].StartKit!.Amounts.Where(a => a.Resource != "res.pop").Sum(a => a.Amount);
        int f2 = s.PrePlacedBases.Sum(b => b.Stock.Amounts.Sum(a => a.Amount));

        Assert.That(f1, Is.EqualTo(40));
        Assert.That(f2, Is.EqualTo(69));
        Assert.That(f2 * 100, Is.LessThanOrEqualTo(f1 * s.Balance.MaxSlotRatioPct));
    }

    [Test]
    public void Hash_is_the_same_on_every_load_and_ignores_layout_and_notes()
    {
        string text = ContentTestData.ScenarioText;
        LoadResult<ScenarioData> a = ContentLoader.LoadScenario(text, ContentTestData.AllowList());
        LoadResult<ScenarioData> b = ContentLoader.LoadScenario(text, ContentTestData.AllowList());
        string reformatted = ContentTestData.Mutate(text, root => root["_note"] = "a different note");
        LoadResult<ScenarioData> c = ContentLoader.LoadScenario(reformatted, ContentTestData.AllowList());

        Assert.That(a.Hash, Is.Not.Zero);
        Assert.That(b.Hash, Is.EqualTo(a.Hash));
        Assert.That(c.Hash, Is.EqualTo(a.Hash));
        Assert.That(c.Canonical, Is.EqualTo(a.Canonical));
    }

    [Test]
    public void Hash_changes_when_any_data_value_changes()
    {
        ulong original = ContentLoader.LoadScenario(ContentTestData.ScenarioText, ContentTestData.AllowList()).Hash;

        ulong moved = ContentTestData.LoadScenarioMutated(root => root["pre_placed_bases"]![0]!["stock"]!["res.coin"] = 7).Hash;

        Assert.That(moved, Is.Not.EqualTo(original));
    }

    /// <summary>
    /// Golden hash of the shipped scenario. If this fails after an intended data change, re-derive the value
    /// independently (canonical form: sorted keys, no notes, no whitespace; FNV-1a 64 over UTF-8) and update it
    /// in the same commit as the data change.
    /// </summary>
    [Test]
    public void Golden_hash_of_the_shipped_scenario_is_pinned()
    {
        LoadResult<ScenarioData> result = ContentLoader.LoadScenario(ContentTestData.ScenarioText, ContentTestData.AllowList());

        Assert.That(result.HashHex, Is.EqualTo(GoldenHashes.Scenario));
        Assert.That(result.Canonical.Length, Is.EqualTo(GoldenHashes.ScenarioCanonicalLength));
    }

    [Test]
    public void Loader_returns_no_data_and_a_zero_hash_for_a_rejected_file()
    {
        LoadResult<ScenarioData> result = ContentTestData.LoadScenarioMutated(root => root["map"]!["width"] = 13);

        Assert.That(result.Ok, Is.False);
        Assert.That(result.Data, Is.Null);
        Assert.That(result.Hash, Is.Zero);
        Assert.That(result.Canonical, Is.Empty);
        Assert.That(result.HashHex, Is.EqualTo("0000000000000000"));
    }

    [Test]
    public void Model_helpers_answer_lookups()
    {
        ScenarioData s = ContentTestData.Scenario();

        Assert.That(s.Map.FindLegend('o')!.Look, Is.EqualTo("meadow"));
        Assert.That(s.Map.FindLegend('?'), Is.Null);
        Assert.That(s.Map.TerrainAt(-1, 0), Is.Null);
        Assert.That(s.Map.TerrainAt(5, 5), Is.EqualTo("t.open"));
        Assert.That(StockData.Empty.Get("res.food"), Is.Zero);
        Assert.That(new TilePoint(2, 3).ToString(), Is.EqualTo("[2, 3]"));
        Assert.That(s.PrePlacedBases[0].Stock.Get("res.coin"), Is.EqualTo(6));
    }

    [Test]
    public void Vocabulary_tables_answer_the_rule_questions()
    {
        Assert.That(Vocabulary.HousingOfLevel(1), Is.EqualTo(100));
        Assert.That(Vocabulary.HousingOfLevel(2), Is.EqualTo(300));
        Assert.That(Vocabulary.HousingOfLevel(3), Is.EqualTo(600));
        Assert.That(Vocabulary.HousingOfLevel(4), Is.EqualTo(1000));
        Assert.That(Vocabulary.GarrisonSupport(0), Is.EqualTo(2));
        Assert.That(Vocabulary.GarrisonSupport(1), Is.EqualTo(4));
        Assert.That(Vocabulary.GarrisonSupport(2), Is.EqualTo(7));
        Assert.That(Vocabulary.GarrisonSupport(3), Is.EqualTo(9));
        Assert.That(Vocabulary.GarrisonSupport(4), Is.EqualTo(10));
        Assert.That(Vocabulary.BuildingMaxLevel("bld.academy"), Is.EqualTo(1));
        Assert.That(Vocabulary.Footprint("bld.garrison"), Is.EqualTo(2));
        Assert.That(Vocabulary.LookMatchesTerrain("mangrove", "t.wood_b"), Is.True);
        Assert.That(Vocabulary.LookMatchesTerrain("high_hill", "t.peak"), Is.True);
        Assert.That(Vocabulary.LookMatchesTerrain("water", "t.deep"), Is.True);
        Assert.That(Vocabulary.LookMatchesTerrain("bogus", "t.open"), Is.False);
        Assert.That(Vocabulary.BuildingMayStandOn("bld.core", "t.wood_a"), Is.False);
        Assert.That(Vocabulary.BuildingMayStandOn("bld.port", "t.still"), Is.True);
        Assert.That(Vocabulary.AllRoles().Count, Is.EqualTo(6 + 12 + 8 + 8));
    }
}
