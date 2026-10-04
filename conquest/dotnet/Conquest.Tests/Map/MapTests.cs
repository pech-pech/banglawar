using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Map;

namespace Conquest.Tests.Map;

public class MapTests
{
    private const string Good =
        "{\"version\":1,\"width\":6,\"height\":4,\"rows\":[\"~~~~~~\",\"~..ff~\",\"~jh=M~\",\"~-...~\"]}";

    [Test]
    public void MapLoader_reads_every_terrain_character()
    {
        var r = MapLoader.Parse(Good);
        Assert.That(r.Ok, Is.True);
        GameMap m = r.Map!;
        Assert.That(m.Width, Is.EqualTo(6));
        Assert.That(m.Height, Is.EqualTo(4));
        Assert.That(m.TerrainAt(new TileCoord(0, 0)), Is.EqualTo(Terrain.Deep));
        Assert.That(m.TerrainAt(new TileCoord(1, 1)), Is.EqualTo(Terrain.Open));
        Assert.That(m.TerrainAt(new TileCoord(3, 1)), Is.EqualTo(Terrain.WoodA));
        Assert.That(m.TerrainAt(new TileCoord(1, 2)), Is.EqualTo(Terrain.WoodB));
        Assert.That(m.TerrainAt(new TileCoord(2, 2)), Is.EqualTo(Terrain.Rough));
        Assert.That(m.TerrainAt(new TileCoord(3, 2)), Is.EqualTo(Terrain.River));
        Assert.That(m.TerrainAt(new TileCoord(4, 2)), Is.EqualTo(Terrain.Peak));
        Assert.That(m.TerrainAt(new TileCoord(1, 3)), Is.EqualTo(Terrain.Still));
    }

    [TestCase("[]", "object")]
    [TestCase("{", "string key")]
    [TestCase("{\"version\":1,\"width\":2,\"height\":1,\"rows\":[\"..\"],\"extra\":1}", "Unknown key")]
    [TestCase("{\"width\":2,\"height\":1,\"rows\":[\"..\"]}", "Missing 'version'")]
    [TestCase("{\"version\":\"1\",\"width\":2,\"height\":1,\"rows\":[\"..\"]}", "must be an integer")]
    [TestCase("{\"version\":2,\"width\":2,\"height\":1,\"rows\":[\"..\"]}", "Unsupported version")]
    [TestCase("{\"version\":1,\"width\":0,\"height\":1,\"rows\":[\"\"]}", "1..256")]
    [TestCase("{\"version\":1,\"width\":257,\"height\":1,\"rows\":[\"\"]}", "1..256")]
    [TestCase("{\"version\":1,\"width\":2,\"height\":1}", "Missing 'rows'")]
    [TestCase("{\"version\":1,\"width\":2,\"height\":1,\"rows\":5}", "must be an array")]
    [TestCase("{\"version\":1,\"width\":2,\"height\":2,\"rows\":[\"..\"]}", "Expected 2 rows")]
    [TestCase("{\"version\":1,\"width\":2,\"height\":1,\"rows\":[7]}", "must be a string")]
    [TestCase("{\"version\":1,\"width\":2,\"height\":1,\"rows\":[\"...\"]}", "Expected 2 characters")]
    [TestCase("{\"version\":1,\"width\":2,\"height\":1,\"rows\":[\".?\"]}", "Unknown tile")]
    public void MapLoader_returns_errors_instead_of_throwing(string json, string fragment)
    {
        var r = MapLoader.Parse(json);
        Assert.That(r.Ok, Is.False);
        Assert.That(r.Map, Is.Null);
        Assert.That(r.Errors.Count, Is.GreaterThan(0));
        Assert.That(r.Errors[0].Message, Does.Contain(fragment));
    }

    [Test]
    public void MapLoader_error_carries_a_json_pointer()
    {
        var r = MapLoader.Parse("{\"version\":1,\"width\":2,\"height\":2,\"rows\":[\"..\",\"?.\"]}");
        Assert.That(r.Errors[0].Pointer, Is.EqualTo("/rows/1"));
    }

    [Test]
    public void GameMap_validates_size_and_bounds()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => GameMap.Create(0, 1, new Terrain[0]));
        Assert.Throws<ArgumentOutOfRangeException>(() => GameMap.Create(257, 1, new Terrain[257]));
        Assert.Throws<ArgumentException>(() => GameMap.Create(2, 2, new Terrain[3]));
        GameMap m = MapLoader.Parse(Good).Map!;
        Assert.That(m.InBounds(new TileCoord(5, 3)), Is.True);
        Assert.That(m.InBounds(new TileCoord(6, 0)), Is.False);
        Assert.That(m.InBounds(new TileCoord(-1, 0)), Is.False);
        Assert.Throws<ArgumentOutOfRangeException>(() => m.TerrainAt(new TileCoord(9, 9)));
        Assert.That(m.CoordOf(m.IndexOf(new TileCoord(4, 2))), Is.EqualTo(new TileCoord(4, 2)));
    }

    [Test]
    public void GameMap_copies_its_input_and_fingerprints_the_world()
    {
        var tiles = new[] { Terrain.Open, Terrain.Open };
        GameMap a = GameMap.Create(2, 1, tiles);
        tiles[0] = Terrain.Peak;
        Assert.That(a.TerrainAt(new TileCoord(0, 0)), Is.EqualTo(Terrain.Open));
        GameMap same = GameMap.Create(2, 1, new[] { Terrain.Open, Terrain.Open });
        GameMap other = GameMap.Create(2, 1, new[] { Terrain.Open, Terrain.Peak });
        Assert.That(a.Fingerprint, Is.EqualTo(same.Fingerprint));
        Assert.That(a.Fingerprint, Is.Not.EqualTo(other.Fingerprint));
    }

    [Test]
    public void TryNeighbor_walks_all_eight_directions_and_stops_at_the_edge()
    {
        GameMap m = MapLoader.Parse(Good).Map!;
        var seen = new System.Collections.Generic.List<TileCoord>();
        for (int d = 0; d < GameMap.DirectionCount; d++)
        {
            Assert.That(m.TryNeighbor(new TileCoord(2, 2), d, out TileCoord n), Is.True);
            Assert.That(n.DistanceTo(new TileCoord(2, 2)), Is.EqualTo(1));
            seen.Add(n);
        }

        Assert.That(seen.Distinct().Count(), Is.EqualTo(8));
        Assert.That(m.TryNeighbor(new TileCoord(0, 0), 0, out _), Is.False);
        Assert.That(m.TryNeighbor(new TileCoord(0, 0), 6, out _), Is.False);
    }

    [Test]
    public void TouchesWater_sees_ocean_lake_and_river_neighbours()
    {
        GameMap m = MapLoader.Parse(Good).Map!;
        Assert.That(m.TouchesWater(new TileCoord(1, 1)), Is.True);
        Assert.That(m.TouchesWater(new TileCoord(3, 3)), Is.True);
        GameMap dry = GameMap.Create(3, 3, Enumerable.Repeat(Terrain.Open, 9).ToArray());
        Assert.That(dry.TouchesWater(new TileCoord(1, 1)), Is.False);
    }

    [Test]
    public void TerrainInfo_applies_the_assumed_cost_table()
    {
        Assert.That(TerrainInfo.EntryCost(Terrain.Open, MoveClass.Land), Is.EqualTo(1));
        Assert.That(TerrainInfo.EntryCost(Terrain.River, MoveClass.Land), Is.EqualTo(1));
        Assert.That(TerrainInfo.EntryCost(Terrain.WoodA, MoveClass.Land), Is.EqualTo(2));
        Assert.That(TerrainInfo.EntryCost(Terrain.WoodB, MoveClass.Land), Is.EqualTo(3));
        Assert.That(TerrainInfo.EntryCost(Terrain.Rough, MoveClass.Land), Is.EqualTo(3));
        Assert.That(TerrainInfo.EntryCost(Terrain.Peak, MoveClass.Land), Is.EqualTo(4));
        Assert.That(TerrainInfo.EntryCost(Terrain.Deep, MoveClass.Land), Is.EqualTo(0));
        Assert.That(TerrainInfo.EntryCost(Terrain.Still, MoveClass.Land), Is.EqualTo(0));
        Assert.That(TerrainInfo.EntryCost(Terrain.Deep, MoveClass.Water), Is.EqualTo(1));
        Assert.That(TerrainInfo.EntryCost(Terrain.River, MoveClass.Water), Is.EqualTo(0));
        Assert.That(TerrainInfo.EntryCost(Terrain.Open, MoveClass.Water), Is.EqualTo(0));
        Assert.That(TerrainInfo.IsLand(Terrain.Peak), Is.True);
        Assert.That(TerrainInfo.IsLand(Terrain.Deep), Is.False);
        Assert.That(TerrainInfo.IsWater(Terrain.River), Is.True);
        Assert.That(TerrainInfo.IsWater(Terrain.Open), Is.False);
        Assert.That(TerrainInfo.IsBuildable(Terrain.WoodB), Is.True);
        Assert.That(TerrainInfo.IsBuildable(Terrain.Rough), Is.False);
        Assert.That(TerrainInfo.IsBuildable(Terrain.Peak), Is.False);
    }
}
