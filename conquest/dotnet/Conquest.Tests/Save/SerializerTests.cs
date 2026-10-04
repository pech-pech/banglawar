using System.Text.Json;
using System.Text.Json.Nodes;
using Conquest.Bootstrap;
using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Save;
using Conquest.Core.Turn;
using static Conquest.Tests.Bootstrap.BootstrapTestKit;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Save;

public class SerializerTests
{
    /// <summary>A mid-game state that uses every part of the format.</summary>
    internal static GameState Busy()
    {
        GameState s = New(3, ulong.MaxValue - 5);
        s = Base(s, 0, 6, 3, out int b, core: 2, stock: Rich, site: "site.\"odd\"\\name\u0001\u00e9");
        s = GameFactory.AddBuilding(s, b, BuildingRole.Garrison, 2, new TileCoord(7, 3));
        s = GameFactory.AddBuilding(s, b, BuildingRole.Port, 1, new TileCoord(5, 5));
        s = GameFactory.AddUnit(s, 0, UnitRole.Commander, 3, new TileCoord(6, 3), b, 0, out int cmd);
        s = GameFactory.AddUnit(s, 0, UnitRole.Line, 2, new TileCoord(6, 3), b, cmd, out int line);
        s = s.WithUnit(s.UnitTable[s.FindUnitIndex(cmd)] with { Reputation = 7, Strength = 2, MovesLeft = 120 });
        s = Base(s, 1, 9, 6, out int enemy, core: 1, stock: Rich);
        s = Unit(s, 1, UnitRole.Ranged, 7, 4, out int target);
        s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(line), new TileCoord(7, 4), AttackKind.Capture)));
        s = Ok(Do(s, new RecruitCommand(0, b, UnitRole.Line, 1)));
        s = Ok(Do(s, new PatronTradeCommand(0, b, Resource.Hard, 4, true)));
        s = Ok(Do(s, new UpgradeCommand(0, b, -1)));
        s = Ok(Do(s, new UpgradeCommand(0, b, 1)));
        s = s.WithExt("arrival_done.3", 1).WithExt("homeless_turns.f2", 4).WithExt("kit_used.f1", 1);
        s = s with { Intel = ImmArray<IntelRecord>.Of(new IntelRecord(0, enemy, "site.x", new TileCoord(9, 6), 1, -1, -1, -1), new IntelRecord(1, b, null, new TileCoord(6, 3), 0, 2, 1, 4)) };
        s = s with { Factions = s.Factions.SetItem(2, s.Factions[2] with { Eliminated = true }), MatchOver = true, WinnerSlot = 1 };
        Assert.That(target, Is.GreaterThan(0));
        return s;
    }

    private static void AssertSame(GameState a, GameState b)
    {
        Assert.That(StateHasher.HashHex(b), Is.EqualTo(StateHasher.HashHex(a)));
        Assert.That(b.Turn, Is.EqualTo(a.Turn));
        Assert.That(b.Seed, Is.EqualTo(a.Seed));
        Assert.That(b.Rng, Is.EqualTo(a.Rng));
        Assert.That(b.Map.Fingerprint, Is.EqualTo(a.Map.Fingerprint));
        Assert.That(b.UnitTable.ToArray(), Is.EqualTo(a.UnitTable.ToArray()));
        Assert.That(b.BaseTable.ToArray(), Is.EqualTo(a.BaseTable.ToArray()));
        Assert.That(b.Factions.ToArray(), Is.EqualTo(a.Factions.ToArray()));
        Assert.That(b.Attacks.ToArray(), Is.EqualTo(a.Attacks.ToArray()));
        Assert.That(b.Recruits.ToArray(), Is.EqualTo(a.Recruits.ToArray()));
        Assert.That(b.PatronOrders.ToArray(), Is.EqualTo(a.PatronOrders.ToArray()));
        Assert.That(b.Intel.ToArray(), Is.EqualTo(a.Intel.ToArray()));
        Assert.That(b.Ext.ToArray(), Is.EqualTo(a.Ext.ToArray()));
        Assert.That((b.MatchOver, b.WinnerSlot, b.NextUnitId, b.NextBaseId), Is.EqualTo((a.MatchOver, a.WinnerSlot, a.NextUnitId, a.NextBaseId)));
    }

    private static GameState Load(string text)
    {
        SaveLoadResult r = GameSerializer.Deserialize(text);
        Assert.That(r.Errors, Is.Empty, string.Join("\n", r.Errors));
        return r.State!;
    }

    [Test]
    public void A_busy_state_survives_a_round_trip_in_every_field()
    {
        GameState s = Busy();

        string text = GameSerializer.Serialize(s, "scn");
        SaveLoadResult r = GameSerializer.Deserialize(text);

        Assert.That(r.Ok, Is.True, string.Join("\n", r.Errors));
        Assert.That(r.ScenarioId, Is.EqualTo("scn"));
        Assert.That(r.Version, Is.EqualTo(SaveFormat.CurrentVersion));
        AssertSame(s, r.State!);
    }

    [Test]
    public void The_text_is_canonical_serialising_again_gives_the_same_bytes()
    {
        GameState s = Busy();
        string first = GameSerializer.Serialize(s, "scn");

        string again = GameSerializer.Serialize(Load(first), "scn");

        Assert.That(again, Is.EqualTo(first));
        Assert.That(first, Does.Not.Contain(" ").And.Not.Contain("\n"));
        Assert.That(first, Does.StartWith("{\"format\":\"conquest.save\",\"version\":1,\"scenario\":\"scn\",\"state_hash\":\""));
    }

    [Test]
    public void The_booted_scenario_round_trips_and_keeps_playing_identically()
    {
        BootResult boot = Boot();
        GameState restored = Load(GameSerializer.Serialize(boot.State!, boot.ScenarioId));
        string[] script = { "end 0", "end 1", "move 0 21 1 3", "end 0", "end 1" };

        ReplayResult original = GameReplay.Run(boot.State!, boot.Services!, script);
        ReplayResult resumed = GameReplay.Run(restored, boot.Services!, script);

        AssertSame(boot.State!, restored);
        Assert.That(original.Ok, Is.True, original.Error);
        Assert.That(resumed.Trail.Select(t => t.HashHex), Is.EqualTo(original.Trail.Select(t => t.HashHex)));
    }

    [Test]
    public void Large_seeds_and_odd_site_ids_survive()
    {
        GameState s = Busy();

        GameState r = Load(GameSerializer.Serialize(s));

        Assert.That(r.Seed, Is.EqualTo(ulong.MaxValue - 5));
        Assert.That(r.BaseTable[0].SiteId, Is.EqualTo("site.\"odd\"\\name\u0001\u00e9"));
    }

    [Test]
    public void The_opening_save_matches_the_golden_file_and_its_hash()
    {
        BootResult boot = Boot();
        string text = GameSerializer.Serialize(boot.State!, boot.ScenarioId);
        string path = Path.Combine(AppContext.BaseDirectory, "golden", "skirmish-opening.save.json");
        if (Environment.GetEnvironmentVariable("UPDATE_GOLDEN") == "1")
        {
            File.WriteAllText(SourceGolden(), text + "\n");
            TestContext.Out.WriteLine("golden text hash " + Fnv1a64.ToHex(Fnv1a64.Hash(text)));
            Assert.Inconclusive("golden file rewritten; run again without UPDATE_GOLDEN");
        }

        Assert.That(text, Is.EqualTo(File.ReadAllText(path).TrimEnd()), "regenerate golden/skirmish-opening.save.json only when the format or the opening changes on purpose");
        Assert.That(Fnv1a64.ToHex(Fnv1a64.Hash(text)), Is.EqualTo(SaveGolden.OpeningTextHash));
    }

    private static string SourceGolden([System.Runtime.CompilerServices.CallerFilePath] string here = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(here)!, "..", "golden", "skirmish-opening.save.json"));

    [Test]
    public void A_save_is_refused_when_it_is_not_json_or_not_an_object()
    {
        Assert.That(GameSerializer.Deserialize("{nope").Errors.Single().Code, Is.EqualTo(SaveFormat.BadJson));
        Assert.That(GameSerializer.Deserialize("[1]").Errors.Single().Code, Is.EqualTo(SaveFormat.BadShape));
        Assert.That(GameSerializer.Deserialize("").Ok, Is.False);
    }

    private static string Edit(Action<JsonNode> edit)
    {
        JsonNode root = JsonNode.Parse(GameSerializer.Serialize(Busy(), "scn"))!;
        edit(root);
        return root.ToJsonString();
    }

    private static string FirstCode(string text)
    {
        SaveLoadResult r = GameSerializer.Deserialize(text);
        Assert.That(r.Ok, Is.False);
        Assert.That(r.State, Is.Null);
        return r.Errors[0].Code;
    }

    [Test]
    public void Wrong_magic_and_wrong_versions_are_named()
    {
        Assert.That(FirstCode(Edit(r => r["format"] = "other")), Is.EqualTo(SaveFormat.BadMagic));
        Assert.That(FirstCode(Edit(r => r["version"] = SaveFormat.CurrentVersion + 1)), Is.EqualTo(SaveFormat.NewerVersion));
        Assert.That(FirstCode(Edit(r => r["version"] = 0)), Is.EqualTo(SaveFormat.OldVersion));
        Assert.That(SaveMigrations.OldestReadable, Is.EqualTo(1));
    }

    [Test]
    public void A_tampered_save_fails_its_hash_check()
    {
        string text = Edit(r => r["state"]!["bases"]![0]!["stock"]![0] = 12345);

        SaveLoadResult res = GameSerializer.Deserialize(text);

        Assert.That(res.Ok, Is.False);
        Assert.That(res.Errors.Single().Code, Is.EqualTo(SaveFormat.HashMismatch));
        Assert.That(res.Errors.Single().Pointer, Is.EqualTo("/state_hash"));
    }

    [Test]
    public void Unknown_members_are_typos_and_are_refused_with_their_pointer()
    {
        SaveLoadResult r = GameSerializer.Deserialize(Edit(n => n["state"]!["units"]![0]!["colour"] = 3));

        Assert.That(r.Errors.Single().Code, Is.EqualTo(SaveFormat.UnknownKey));
        Assert.That(r.Errors.Single().Pointer, Is.EqualTo("/state/units/0/colour"));
    }

    [Test]
    public void Bad_values_are_refused_with_the_pointer_of_the_value()
    {
        var cases = new (Action<JsonNode> Edit, string Pointer, string Code)[]
        {
            (n => n["state"]!["units"]![0]!["role"] = "u.dragon", "/state/units/0/role", SaveFormat.BadValue),
            (n => n["state"]!["units"]![0]!["x"] = 99, "/state/units/0/x", SaveFormat.BadValue),
            (n => n["state"]!["units"]![0]!["id"] = 500, "/state/units/0/id", SaveFormat.BadValue),
            (n => n["state"]!["units"]![1]!["id"] = 1, "/state/units/1/id", SaveFormat.BadOrder),
            (n => n["state"]!["bases"]![0]!["core"] = 9, "/state/bases/0/core", SaveFormat.BadValue),
            (n => n["state"]!["bases"]![0]!["stock"]![2] = -1, "/state/bases/0/stock/2", SaveFormat.BadValue),
            (n => n["state"]!["seed"] = "12x", "/state/seed", SaveFormat.BadValue),
            (n => n["state"]!["slots"] = 9, "/state/slots", SaveFormat.BadValue),
            (n => n["state"]!["ext"]![0]!["v"] = 0, "/state/ext/0/v", SaveFormat.BadValue),
            (n => n["state"]!["map"]!["tiles"] = "0000", "/state/map/tiles", SaveFormat.BadValue),
            (n => n["state"]!["factions"]!.AsArray().RemoveAt(0), "/state/factions", SaveFormat.BadValue),
            (n => n["state"]!["attacks"]![0]!["kind"] = 5, "/state/attacks/0/kind", SaveFormat.BadValue),
            (n => n["state"]!["patron"]![0]!["resource"] = "res.gold", "/state/patron/0/resource", SaveFormat.BadValue),
            (n => n["state"]!.AsObject().Remove("turn"), "/state/turn", SaveFormat.BadShape),
            (n => n["state"]!["over"] = "yes", "/state/over", SaveFormat.BadShape),
        };

        foreach ((Action<JsonNode> edit, string pointer, string code) in cases)
        {
            SaveLoadResult r = GameSerializer.Deserialize(Edit(edit));
            Assert.That(r.Ok, Is.False, pointer);
            Assert.That(r.Errors.Any(e => e.Pointer == pointer && e.Code == code), Is.True, pointer + " -> " + string.Join(" | ", r.Errors));
        }
    }

    [Test]
    public void References_between_records_are_checked()
    {
        var cases = new (Action<JsonNode> Edit, string Pointer)[]
        {
            (n => n["state"]!["units"]![0]!["leader"] = 1, "/state/units/0/leader"),
            (n => n["state"]!["units"]![1]!["leader"] = 77, "/state/units/1/leader"),
            (n => n["state"]!["units"]![0]!["base"] = 9, "/state/units/0/base"),
            (n => n["state"]!["units"]![2]!["base"] = 1, "/state/units/2/base"),
            (n => n["state"]!["attacks"]![0]!["units"]![0] = 3, "/state/attacks/0/units/0"),
            (n => n["state"]!["recruits"]![0]!["base"] = 5, "/state/recruits/0/base"),
            (n => n["state"]!["patron"]![0]!["base"] = 2, "/state/patron/0/base"),
            (n => n["state"]!["over"] = false, "/state/winner"),
        };

        foreach ((Action<JsonNode> edit, string pointer) in cases)
        {
            SaveLoadResult r = GameSerializer.Deserialize(Edit(edit));
            Assert.That(r.Ok, Is.False, pointer);
            Assert.That(r.Errors.Any(e => e.Pointer == pointer && e.Code == SaveFormat.BadReference), Is.True, pointer + " -> " + string.Join(" | ", r.Errors));
        }
    }

    [Test]
    public void Ext_keys_must_be_ascending()
    {
        string text = Edit(n =>
        {
            JsonArray ext = n["state"]!["ext"]!.AsArray();
            JsonNode first = ext[0]!.DeepClone();
            ext.RemoveAt(0);
            ext.Add(first);
        });

        Assert.That(FirstCode(text), Is.EqualTo(SaveFormat.BadOrder));
    }

    [Test]
    public void A_large_game_serialises_to_a_save_that_loads_back_to_the_same_hash()
    {
        GameState s = New(2, 9);
        for (int i = 0; i < 40; i++)
        {
            s = Unit(s, i % 2, UnitRole.Line, 1 + (i % 10), 1 + (i / 10), out _);
        }

        Assert.That(StateHasher.HashHex(Load(GameSerializer.Serialize(s))), Is.EqualTo(StateHasher.HashHex(s)));
    }
}

internal static class SaveGolden
{
    public const string OpeningTextHash = "25d723f622bde778";
}
