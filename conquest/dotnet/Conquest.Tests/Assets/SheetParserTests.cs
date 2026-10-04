using System.Text.RegularExpressions;
using Conquest.Assets.Model;
using static Conquest.Tests.Assets.GoldenFiles;

namespace Conquest.Tests.Assets;

public class SheetParserTests
{
    private static string Golden => Text("fixture.sprite_sheet.json");

    private static void Rejects(string json, string messagePart)
    {
        var ex = Assert.Throws<SheetFormatException>(() => SheetParser.Parse(json))!;
        Assert.That(ex.Message, Does.Contain(messagePart));
    }

    [Test]
    public void Accepts_the_golden_sheet()
    {
        Assert.DoesNotThrow(() => SheetParser.Parse(Golden));
    }

    [Test]
    public void Rejects_malformed_json_as_a_sheet_error()
    {
        Rejects("{", "JSON error");
    }

    [Test]
    public void Rejects_a_root_that_is_not_an_object()
    {
        Rejects("[]", "must be an object");
    }

    [Test]
    public void Rejects_a_foreign_schema_id()
    {
        Rejects(Golden.Replace("sprite-sheet/1", "sprite-sheet/9"), "expected 'sprite-sheet/1'");
    }

    [Test]
    public void Rejects_a_missing_field_with_its_path()
    {
        Rejects(Golden.Replace("\"tile_px\"", "\"tile_pixels\""), "$.tile_px is missing");
    }

    [Test]
    public void Rejects_a_wrong_type()
    {
        Rejects(Golden.Replace("\"theme\": \"fixture\"", "\"theme\": 5"), "$.theme must be a string");
    }

    [Test]
    public void Rejects_a_non_integer_where_an_integer_is_needed()
    {
        Rejects(Golden.Replace("\"tile_px\": 64", "\"tile_px\": 64.5"), "$.tile_px must be an integer");
    }

    [Test]
    public void Rejects_a_bad_layer_sorting_mode()
    {
        Rejects(Golden.Replace("\"sorting\": \"depth\"", "\"sorting\": \"sideways\""), "must be 'depth' or 'fixed'");
    }

    [Test]
    public void Rejects_a_pair_with_the_wrong_length()
    {
        Rejects(ReplaceFirst(Golden, "\"pivot_px\": [", "\"pivot_px\": [9, "), "list of 2 integers");
    }

    [Test]
    public void Rejects_a_frame_on_a_page_that_does_not_exist()
    {
        Rejects(Golden.Replace("\"page\": 0", "\"page\": 99"), ".page 99");
    }

    [Test]
    public void Rejects_a_frame_count_that_disagrees_with_the_frames()
    {
        Rejects(Golden.Replace("\"frame_count\": 4", "\"frame_count\": 5"), "frame_count 5");
    }

    [Test]
    public void Rejects_a_duplicate_key()
    {
        Rejects(Golden.Replace("\"key\": \"tile.meadow\"", "\"key\": \"bld.core.L1\""), "duplicate key");
    }

    [Test]
    public void Rejects_a_rectangle_outside_its_page()
    {
        string json = new Regex("\"rect\": \\[\\s*\\d+").Replace(Golden, "\"rect\": [9999", 1);
        Assert.That(json, Is.Not.EqualTo(Golden));
        Rejects(json, "outside its page");
    }

    private static string ReplaceFirst(string text, string find, string with)
    {
        int at = text.IndexOf(find, StringComparison.Ordinal);
        return text.Substring(0, at) + with + text.Substring(at + find.Length);
    }

    [Test]
    public void Rejects_a_non_string_tag()
    {
        Rejects(Golden.Replace("\"terrain\"", "7"), "must be a string");
    }

    [Test]
    public void Null_fields_parse_as_null()
    {
        var entry = Sheet().Entries.First(e => e.Key == "tile.meadow");
        Assert.That(entry.Level, Is.Null);
        Assert.That(entry.Variant, Is.Null);
        Assert.That(entry.State, Is.Null);
        Assert.That(entry.Slot, Is.Null);
        Assert.That(entry.Fps, Is.Null);
        Assert.That(entry.IsAnimated, Is.False);
    }
}
