using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Save;
using Conquest.Core.Turn;
using Conquest.Presentation;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Presentation;

public class SaveServiceTests
{
    private const string Scenario = "test-scenario";

    private static GameState Played()
    {
        GameState s = Base(New(2, 99), 0, 9, 3, out int b, core: 1, stock: Rich);
        s = Unit(s, 0, UnitRole.Line, 5, 5, out int line);
        s = Unit(s, 1, UnitRole.Line, 6, 5, out _);
        s = Ok(Do(s, new BuildCommand(0, b, BuildingRole.Food, new TileCoord(9, 4))));
        s = Ok(Do(s, new AttackCommand(0, ImmArray<int>.Of(line), new TileCoord(6, 5))));
        return s;
    }

    private static string TempDir() => Path.Combine(Path.GetTempPath(), "conquest-save-test-" + Guid.NewGuid().ToString("N"));

    [Test]
    public void A_saved_game_loads_back_with_the_identical_hash()
    {
        var svc = new GameSaveService(new MemorySaveStorage(), Scenario);
        GameState s = Played();

        SaveOutcome saved = svc.Save(s, GameSaveService.Quicksave);
        LoadOutcome loaded = svc.Load(GameSaveService.Quicksave);

        Assert.That(saved.Ok, Is.True, saved.Detail);
        Assert.That(saved.Hash, Is.EqualTo(StateHasher.HashHex(s)));
        Assert.That(loaded.Ok, Is.True, loaded.ErrorCode);
        Assert.That(StateHasher.HashHex(loaded.State!), Is.EqualTo(StateHasher.HashHex(s)));
        Assert.That(svc.HasSave(GameSaveService.Quicksave), Is.True);
    }

    [Test]
    public void The_file_is_the_cores_versioned_strict_json()
    {
        var storage = new MemorySaveStorage();
        new GameSaveService(storage, Scenario).Save(Played(), GameSaveService.Autosave);

        storage.TryRead(GameSaveService.FileName(GameSaveService.Autosave), out string? text, out _);

        Assert.That(text, Does.StartWith("{\"format\":\"" + SaveFormat.Magic + "\",\"version\":" + SaveFormat.CurrentVersion));
        Assert.That(Conquest.Core.Json.StrictJson.Parse(text!).Ok, Is.True);
    }

    [Test]
    public void Loading_a_slot_that_was_never_saved_says_so()
    {
        var svc = new GameSaveService(new MemorySaveStorage(), Scenario);

        LoadOutcome r = svc.Load(GameSaveService.Quicksave);

        Assert.That(r.Ok, Is.False);
        Assert.That(r.ErrorCode, Is.EqualTo(GameSaveService.ErrNoSave));
        Assert.That(svc.HasSave(GameSaveService.Quicksave), Is.False);
    }

    [TestCase("not json at all")]
    [TestCase("{\"format\":\"conquest.save\",\"version\":1}")]
    [TestCase("")]
    public void A_damaged_file_is_reported_not_thrown(string text)
    {
        var storage = new MemorySaveStorage();
        var svc = new GameSaveService(storage, Scenario);
        storage.Overwrite(GameSaveService.FileName("slot-1"), text);

        LoadOutcome r = svc.Load("slot-1");

        Assert.That(r.Ok, Is.False);
        Assert.That(r.ErrorCode, Is.EqualTo(GameSaveService.ErrDamaged));
    }

    [Test]
    public void A_changed_byte_fails_the_hash_check()
    {
        var storage = new MemorySaveStorage();
        var svc = new GameSaveService(storage, Scenario);
        svc.Save(Played(), "slot-1");
        storage.TryRead(GameSaveService.FileName("slot-1"), out string? text, out _);
        storage.Overwrite(GameSaveService.FileName("slot-1"), text!.Replace("\"turn\":0", "\"turn\":5"));

        LoadOutcome r = svc.Load("slot-1");

        Assert.That(r.Ok, Is.False);
        Assert.That(r.ErrorCode, Is.EqualTo(GameSaveService.ErrDamaged));
    }

    [Test]
    public void A_save_from_a_newer_version_is_refused_with_its_own_code()
    {
        var storage = new MemorySaveStorage();
        var svc = new GameSaveService(storage, Scenario);
        svc.Save(Played(), "slot-1");
        storage.TryRead(GameSaveService.FileName("slot-1"), out string? text, out _);
        storage.Overwrite(GameSaveService.FileName("slot-1"), text!.Replace("\"version\":" + SaveFormat.CurrentVersion + ",", "\"version\":99,"));

        Assert.That(svc.Load("slot-1").ErrorCode, Is.EqualTo(GameSaveService.ErrNewer));
    }

    [Test]
    public void A_save_of_another_scenario_is_refused()
    {
        var storage = new MemorySaveStorage();
        new GameSaveService(storage, "other").Save(Played(), "slot-1");

        LoadOutcome r = new GameSaveService(storage, Scenario).Load("slot-1");

        Assert.That(r.ErrorCode, Is.EqualTo(GameSaveService.ErrOtherScenario));
    }

    [TestCase("../evil")]
    [TestCase("a/b")]
    [TestCase("UPPER")]
    [TestCase("")]
    [TestCase("with space")]
    public void Bad_slot_names_never_reach_the_storage(string slot)
    {
        var storage = new MemorySaveStorage();
        var svc = new GameSaveService(storage, Scenario);

        Assert.That(svc.Save(Played(), slot).Ok, Is.False);
        Assert.That(svc.Load(slot).Ok, Is.False);
        Assert.That(svc.HasSave(slot), Is.False);
        Assert.That(storage.Count, Is.EqualTo(0));
    }

    [Test]
    public void The_directory_storage_writes_atomically_and_reads_back()
    {
        string dir = TempDir();
        try
        {
            var svc = new GameSaveService(new DirectorySaveStorage(dir), Scenario);
            GameState s = Played();

            Assert.That(svc.Save(s, "slot-1").Ok, Is.True);
            Assert.That(svc.Save(s, "slot-1").Ok, Is.True, "overwriting works");

            Assert.That(Directory.GetFiles(dir), Is.EqualTo(new[] { Path.Combine(dir, "slot-1.save.json") }), "no temporary file is left");
            Assert.That(StateHasher.HashHex(svc.Load("slot-1").State!), Is.EqualTo(StateHasher.HashHex(s)));
        }
        finally
        {
            if (Directory.Exists(dir)) Directory.Delete(dir, true);
        }
    }

    [Test]
    public void An_unwritable_folder_returns_an_error_and_the_fallback_takes_the_save()
    {
        string blocker = Path.Combine(Path.GetTempPath(), "conquest-save-blocker-" + Guid.NewGuid().ToString("N"));
        File.WriteAllText(blocker, "a file where a folder is needed");
        try
        {
            var broken = new DirectorySaveStorage(Path.Combine(blocker, "saves"));
            GameState s = Played();

            SaveOutcome direct = new GameSaveService(broken, Scenario).Save(s, "slot-1");
            var chain = new FallbackSaveStorage(broken, new MemorySaveStorage());
            var svc = new GameSaveService(chain, Scenario);
            SaveOutcome viaChain = svc.Save(s, "slot-1");
            LoadOutcome back = svc.Load("slot-1");

            Assert.That(direct.Ok, Is.False);
            Assert.That(direct.ErrorCode, Is.EqualTo(GameSaveService.ErrSaveFailed));
            Assert.That(viaChain.Ok, Is.True);
            Assert.That(chain.ActiveIndex, Is.EqualTo(1));
            Assert.That(StateHasher.HashHex(back.State!), Is.EqualTo(StateHasher.HashHex(s)));
        }
        finally
        {
            File.Delete(blocker);
        }
    }

    [Test]
    public void Reading_from_a_missing_folder_is_a_clean_miss()
    {
        var storage = new DirectorySaveStorage(Path.Combine(TempDir(), "never-made"));

        Assert.That(storage.Exists("slot-1.save.json"), Is.False);
        Assert.That(storage.TryRead("slot-1.save.json", out string? text, out string? error), Is.False);
        Assert.That(text, Is.Null);
        Assert.That(error, Is.Not.Null);
    }

    [Test]
    public void Settings_default_to_autosave_off_and_survive_a_round_trip()
    {
        var storage = new MemorySaveStorage();
        Assert.That(UiSettings.Load(storage).AutosaveOnEndTurn, Is.False);
        Assert.That(UiSettings.Default.Locale, Is.EqualTo("en"));

        Assert.That(UiSettings.Default.WithAutosave(true).WithLocale("bn").Save(storage), Is.True);
        UiSettings back = UiSettings.Load(storage);

        Assert.That(back.AutosaveOnEndTurn, Is.True);
        Assert.That(back.Locale, Is.EqualTo("bn"));
    }

    [TestCase("garbage")]
    [TestCase("{\"version\":2,\"autosave_on_end_turn\":true}")]
    [TestCase("[]")]
    [TestCase(null)]
    public void Damaged_or_newer_settings_give_the_defaults(string? text)
    {
        Assert.That(UiSettings.FromJson(text).AutosaveOnEndTurn, Is.False);
        Assert.That(UiSettings.FromJson(text).Locale, Is.EqualTo("en"));
    }

    [Test]
    public void The_opponent_hook_does_nothing_by_default()
    {
        Assert.That(NoOpponentTurn.Instance.Plan(1, New(), TurnServices.Neutral), Is.Empty);
    }
}
