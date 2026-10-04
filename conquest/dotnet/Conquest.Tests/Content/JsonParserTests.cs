using Conquest.Content;
using Conquest.Content.Json;

namespace Conquest.Tests.Content;

public class JsonParserTests
{
    [Test]
    public void Parses_nested_values_with_positions()
    {
        JsonNode node = StrictJsonParser.Parse("{\n \"a\": [1, -2, true, null, \"x\\n\\u0041\"],\n \"b\": {}\n}");

        var obj = (JsonObject)node;
        Assert.That(obj.Members.Count, Is.EqualTo(2));
        var arr = (JsonArray)obj.Members[0].Value;
        Assert.That(((JsonInteger)arr.Items[1]).Value, Is.EqualTo(-2));
        Assert.That(((JsonBoolean)arr.Items[2]).Value, Is.True);
        Assert.That(arr.Items[3], Is.TypeOf<JsonNull>());
        Assert.That(((JsonString)arr.Items[4]).Value, Is.EqualTo("x\nA"));
        Assert.That(arr.Line, Is.EqualTo(2));
        Assert.That(obj.TryGet("b", out JsonNode b) && b is JsonObject, Is.True);
        Assert.That(obj.TryGet("missing", out _), Is.False);
    }

    [Test]
    public void Skips_a_leading_byte_order_mark()
    {
        Assert.That(StrictJsonParser.Parse("﻿[]"), Is.TypeOf<JsonArray>());
    }

    [TestCase("{\"a\":1,}", "json.trailing_comma")]
    [TestCase("[1,]", "json.trailing_comma")]
    [TestCase("{\"a\":1,\"a\":2}", "json.duplicate_key")]
    [TestCase("{\"a\":1.5}", "json.number_not_integer")]
    [TestCase("[1e3]", "json.number_not_integer")]
    [TestCase("[01]", "json.leading_zero")]
    [TestCase("[99999999999999999999]", "json.number_range")]
    [TestCase("[-]", "json.syntax")]
    [TestCase("{\"a\" 1}", "json.syntax")]
    [TestCase("{a:1}", "json.syntax")]
    [TestCase("[1 2]", "json.syntax")]
    [TestCase("{\"a\":1 \"b\":2}", "json.syntax")]
    [TestCase("tru", "json.syntax")]
    [TestCase("@", "json.syntax")]
    [TestCase("[1] x", "json.trailing")]
    [TestCase("[1", "json.unexpected_end")]
    [TestCase("{\"a\":1", "json.unexpected_end")]
    [TestCase("\"abc", "json.unexpected_end")]
    [TestCase("\"a\\", "json.unexpected_end")]
    [TestCase("\"a\\u12", "json.unexpected_end")]
    [TestCase("", "json.unexpected_end")]
    [TestCase("\"a\\q\"", "json.bad_escape")]
    [TestCase("\"a\\u12G4\"", "json.bad_escape")]
    [TestCase("\"a\tb\"", "json.control_char")]
    public void Rejects_anything_that_is_not_strict_json(string text, string code)
    {
        bool ok = StrictJsonParser.TryParse(text, out JsonNode? node, out ContentError? error);

        Assert.That(ok, Is.False);
        Assert.That(node, Is.Null);
        Assert.That(error!.Code, Is.EqualTo(code));
        Assert.That(error.Path, Is.EqualTo("$"));
        Assert.That(error.Line, Is.GreaterThan(0));
    }

    [Test]
    public void Reports_the_line_and_column_of_a_duplicate_key()
    {
        var ex = Assert.Throws<JsonParseException>(() => StrictJsonParser.Parse("{\n  \"a\": 1,\n  \"a\": 2\n}"))!;

        Assert.That(ex.Line, Is.EqualTo(3));
        Assert.That(ex.Column, Is.EqualTo(3));
    }

    [Test]
    public void Caps_nesting_depth()
    {
        string deep = new string('[', 100) + new string(']', 100);

        var ex = Assert.Throws<JsonParseException>(() => StrictJsonParser.Parse(deep))!;

        Assert.That(ex.Code, Is.EqualTo("json.too_deep"));
    }

    [Test]
    public void Null_text_is_a_programming_error()
    {
        Assert.Throws<ArgumentNullException>(() => StrictJsonParser.Parse(null!));
    }

    [Test]
    public void Canonical_form_sorts_keys_drops_notes_and_escapes_minimally()
    {
        JsonNode node = StrictJsonParser.Parse(
            "{ \"b\": [1, true, false, null], \"_note\": \"skip\", \"a\": \"q\\\"\\\\\\u0001\\u00e9\" }");

        string canonical = CanonicalJson.Write(node);

        Assert.That(canonical, Is.EqualTo("{\"a\":\"q\\\"\\\\\\u0001é\",\"b\":[1,true,false,null]}"));
    }

    [TestCase("", "cbf29ce484222325")]
    [TestCase("a", "af63dc4c8601ec8c")]
    [TestCase("foobar", "85944171f73967e8")]
    public void Fnv1a64_matches_the_published_vectors(string text, string expected)
    {
        Assert.That(Fnv1a64.Hex(Fnv1a64.Hash(text)), Is.EqualTo(expected));
    }

    [Test]
    public void Fnv1a64_hashes_the_utf8_bytes()
    {
        Assert.That(Fnv1a64.Hash("é"), Is.Not.EqualTo(Fnv1a64.Hash("e")));
    }

    [Test]
    public void Content_error_text_names_code_path_and_position()
    {
        var withPosition = new ContentError("$.a", "x.y", "bad", 3, 4);
        var without = new ContentError("$.a", "x.y", "bad");

        Assert.That(withPosition.ToString(), Is.EqualTo("x.y at $.a (line 3, column 4): bad"));
        Assert.That(without.ToString(), Is.EqualTo("x.y at $.a: bad"));
    }
}
