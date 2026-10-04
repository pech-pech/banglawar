using System.Text.Json.Nodes;
using Conquest.Content;
using Conquest.Content.Json;
using Conquest.Content.Model;
using Conquest.Content.Validation;

namespace Conquest.Tests.Content;

public class WordScannerTests
{
    private static List<ContentError> Scan(string json, string scope = "theme", AllowListData? allow = null)
    {
        var sink = new ErrorSink();
        ContentWordScanner.Scan(StrictJsonParser.Parse(json), scope, allow ?? AllowListData.Empty, sink);
        return sink.Errors.ToList();
    }

    [TestCase("Villagers", "civilian_state")]
    [TestCase("a refugee camp", "civilian_state")]
    [TestCase("kill_count", "civilian_state")]
    [TestCase("Death toll", "civilian_state")]
    [TestCase("starvation", "civilian_state")]
    [TestCase("Colonist", "colonial")]
    [TestCase("settlement", "colonial")]
    [TestCase("Tax", "colonial")]
    [TestCase("the invader", "loaded_word")]
    [TestCase("Terrorist", "loaded_word")]
    [TestCase("Mosque", "religion")]
    [TestCase("Razakar", "paramilitary_name")]
    [TestCase("Al-Badr", "paramilitary_name")]
    [TestCase("joy bangla", "slogan")]
    [TestCase("population", "person_word")]
    [TestCase("a portrait", "depiction")]
    [TestCase("Photographs", "depiction")]
    [TestCase("Red Cross", "depiction")]
    [TestCase("a grenade", "weapon")]
    [TestCase("hill town", "town_wording")]
    public void Flags_each_forbidden_category(string text, string category)
    {
        List<ContentError> errors = Scan("{\"x\": \"" + text + "\"}");

        Assert.That(errors.Any(e => e.Message.Contains("(" + category + ")")), Is.True, text);
        Assert.That(errors.All(e => e.Path == "$.x" && e.Code == "content.forbidden_word"), Is.True);
    }

    [TestCase("Bamboo and timber")]
    [TestCase("Freedom-fighter section")]
    [TestCase("Garrison position 1")]
    [TestCase("Field hospital")]
    [TestCase("Padded")]
    public void Passes_ordinary_labels(string text)
    {
        Assert.That(Scan("{\"x\": \"" + text + "\"}"), Is.Empty);
    }

    [Test]
    public void Keys_are_checked_for_civilian_state_words_only()
    {
        Assert.That(Scan("{\"native_settlements\": 0, \"weapon\": 1}", "scenario"), Is.Empty);
        List<ContentError> errors = Scan("{\"civilians\": 0}", "scenario");
        Assert.That(errors.Single().Path, Is.EqualTo("$.civilians"));
        Assert.That(Scan("{\"ev.village_burned\": 0}", "scenario").Single().Path, Is.EqualTo("$.ev.village_burned"));
        Assert.That(Scan("{\"x\": \"Village grove\"}", "scenario"), Is.Empty);
    }

    [Test]
    public void The_town_rule_applies_to_themes_only()
    {
        Assert.That(Scan("{\"x\": \"site.town_01\"}", "scenario"), Is.Empty);
        Assert.That(Scan("{\"x\": \"site.town_01\"}", "theme"), Is.Not.Empty);
    }

    [Test]
    public void Walks_arrays_and_nested_objects_with_full_paths()
    {
        List<ContentError> errors = Scan("{\"a\": [{\"b\": \"rifle\"}], \"c\": 5, \"d\": null, \"e\": true}");

        Assert.That(errors.Single().Path, Is.EqualTo("$.a[0].b"));
    }

    [Test]
    public void Allow_list_excuses_only_the_exact_path_and_word()
    {
        var allow = new AllowListData(new[]
        {
            new AllowListEntry("theme", "$.x", "rifle", "reviewer", "reason"),
        });

        Assert.That(Scan("{\"x\": \"Rifle\"}", "theme", allow), Is.Empty);
        Assert.That(Scan("{\"y\": \"Rifle\"}", "theme", allow).Select(e => e.Code),
            Is.EquivalentTo(new[] { "content.forbidden_word", "allowlist.stale" }));
        Assert.That(Scan("{\"x\": \"Rifle grenade\"}", "theme", allow).Select(e => e.Path), Is.EqualTo(new[] { "$.x" }));
    }

    [Test]
    public void Stale_and_unreviewed_allow_list_entries_are_reported_for_their_own_scope_only()
    {
        var allow = new AllowListData(new[]
        {
            new AllowListEntry("theme", "$.gone", "tank", "pending", "was a label"),
            new AllowListEntry("theme", "$.x", "tank", "", "no reviewer"),
            new AllowListEntry("scenario", "$.other", "tank", "pending", "other scope"),
        });

        List<ContentError> errors = Scan("{\"x\": \"tank\"}", "theme", allow);

        Assert.That(errors.Select(e => (e.Path, e.Code)), Is.EquivalentTo(new[]
        {
            ("$.gone", "allowlist.stale"),
            ("$.x", "allowlist.unreviewed"),
        }));
    }

    [Test]
    public void Tokens_split_on_anything_that_is_not_a_letter_or_digit()
    {
        Assert.That(ContentWordScanner.Tokens("Al-Badr, v2_x.y"), Is.EqualTo(new[] { "al", "badr", "v2", "x", "y" }));
        Assert.That(ContentWordScanner.Tokens(string.Empty), Is.Empty);
    }

    [Test]
    public void Shipped_allow_list_loads_and_every_entry_is_reviewed_or_pending_with_a_reason()
    {
        AllowListData allow = ContentTestData.AllowList();

        Assert.That(allow.Entries.Count, Is.EqualTo(5));
        Assert.That(allow.Entries.All(e => e.Scope == "theme" && e.Reason.Length > 10 && e.Reviewer.Length > 0), Is.True);
    }

    [TestCase("{\"schema\": \"allowlist/2\", \"entries\": []}", "$.schema", "schema.value")]
    [TestCase("{\"schema\": \"allowlist/1\"}", "$.entries", "schema.missing")]
    [TestCase("{\"schema\": \"allowlist/1\", \"entries\": [{\"scope\": \"theme\"}]}", "$.entries[0].path", "schema.missing")]
    [TestCase("{\"schema\": \"allowlist/1\", \"entries\": [], \"more\": 1}", "$.more", "schema.unknown_key")]
    [TestCase("[]", "$", "schema.type")]
    public void Broken_allow_lists_are_rejected(string json, string path, string code)
    {
        LoadResult<AllowListData> r = ContentLoader.LoadAllowList(json);

        ContentTestData.AssertHas(r, path, code);
    }

    [Test]
    public void Allow_list_syntax_errors_are_reported()
    {
        LoadResult<AllowListData> r = ContentLoader.LoadAllowList("{");

        Assert.That(r.Ok, Is.False);
        Assert.That(r.Errors.Single().Code, Does.StartWith("json."));
    }

    [Test]
    public void Mutation_helper_round_trips_the_scenario()
    {
        string copy = ContentTestData.Mutate(ContentTestData.ScenarioText, _ => { });

        Assert.That(ContentLoader.LoadScenario(copy).Hash, Is.EqualTo(ContentLoader.LoadScenario(ContentTestData.ScenarioText).Hash));
    }
}
