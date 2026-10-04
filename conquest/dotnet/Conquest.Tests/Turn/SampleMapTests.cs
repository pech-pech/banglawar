using Conquest.Core.Contracts;
using Conquest.Core.Map;
using Conquest.Core.Turn;

namespace Conquest.Tests.Turn;

public class SampleMapTests
{
    [Test]
    public void A_map_loaded_from_json_runs_a_full_found_build_and_produce_loop()
    {
        const string json =
            "{\"version\":1,\"width\":8,\"height\":6,\"rows\":[\"~~~~~~~~\",\"~......~\",\"~.ff...~\",\"~......~\",\"~......~\",\"~~~~~~~~\"]}";
        var loaded = MapLoader.Parse(json);
        Assert.That(loaded.Ok, Is.True);
        GameState s = GameFactory.NewGame(loaded.Map!, 11, 1);
        s = GameFactory.AddUnit(s, 0, UnitRole.Founder, 1, new TileCoord(2, 3), out int founder);
        s = TurnTestKit.Ok(CommandEngine.Apply(s, new FoundBaseCommand(0, founder)));
        int b = s.BaseTable[0].Id;
        s = TurnTestKit.Ok(CommandEngine.Apply(s, new BuildCommand(0, b, BuildingRole.Food, new TileCoord(3, 3))));
        s = TurnTestKit.Ok(CommandEngine.Apply(s, new BuildCommand(0, b, BuildingRole.Port, new TileCoord(1, 2))));
        for (int i = 0; i < 5; i++)
        {
            s = TurnTestKit.EndAll(s);
        }

        Assert.That(s.Turn, Is.EqualTo(5));
        Assert.That(s.BaseTable[0].Stock.Food, Is.GreaterThan(RuleTables.StartingStock.Food - 5));
        Assert.That(s.BaseTable[0].Stock.Pop, Is.EqualTo(112), "capped at 100 until the farm (+40 housing) works from turn 1, then +3 a turn");
    }
}
