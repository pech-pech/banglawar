using Conquest.Core.Json;

namespace Conquest.Tests.Json;

public class StrictJsonTests
{
    [Test]
    public void Parses_objects_arrays_scalars_with_pointers_and_positions()
    {
        var r = StrictJson.Parse("{\n \"a\": [1, -2, \"x\\n\\u0041\\/\\\\\\\"\\b\\f\\r\\t\"],\n \"b\": {\"t\": true, \"f\": false, \"n\": null}, \"e\": {}, \"z\": []}");
        Assert.That(r.Ok, Is.True);
        var root = (JsonObject)r.Root!;
        Assert.That(root.Count, Is.EqualTo(4));
        Assert.That(root.KeyAt(0), Is.EqualTo("a"));
        var arr = (JsonArray)root.ValueAt(0);
        Assert.That(arr.Pointer, Is.EqualTo("/a"));
        Assert.That(((JsonInt)arr[1]).Value, Is.EqualTo(-2));
        Assert.That(arr[1].Pointer, Is.EqualTo("/a/1"));
        Assert.That(arr[1].Line, Is.EqualTo(2));
        Assert.That(arr[1].Column, Is.GreaterThan(1));
        Assert.That(((JsonString)arr[2]).Value, Is.EqualTo("x\nA/\\\"\b\f\r\t"));
        Assert.That(root.TryGet("b", out JsonValue b), Is.True);
        var bo = (JsonObject)b;
        Assert.That(((JsonBool)bo.ValueAt(0)).Value, Is.True);
        Assert.That(((JsonBool)bo.ValueAt(1)).Value, Is.False);
        Assert.That(bo.ValueAt(2), Is.InstanceOf<JsonNull>());
        Assert.That(root.TryGet("missing", out _), Is.False);
        Assert.That(((JsonObject)root.ValueAt(2)).Count, Is.EqualTo(0));
        Assert.That(((JsonArray)root.ValueAt(3)).Count, Is.EqualTo(0));
    }

    [Test]
    public void Parses_exact_64_bit_integers()
    {
        Assert.That(((JsonInt)StrictJson.Parse("9223372036854775807").Root!).Value, Is.EqualTo(long.MaxValue));
        Assert.That(((JsonInt)StrictJson.Parse("-9223372036854775808").Root!).Value, Is.EqualTo(long.MinValue));
        Assert.That(((JsonInt)StrictJson.Parse("0").Root!).Value, Is.EqualTo(0));
    }

    [TestCase("1.5", "fraction")]
    [TestCase("1e3", "fraction")]
    [TestCase("1E3", "fraction")]
    [TestCase("01", "Leading")]
    [TestCase("-", "digits")]
    [TestCase("9223372036854775808", "range")]
    [TestCase("+1", "Unexpected")]
    [TestCase("NaN", "Unexpected")]
    [TestCase("{\"a\":1,\"a\":2}", "Duplicate")]
    [TestCase("{\"a\":1,}", "string key")]
    [TestCase("[1,]", "Unexpected")]
    [TestCase("[1 2]", "Expected ','")]
    [TestCase("{\"a\" 1}", "Expected ':'")]
    [TestCase("{\"a\":1 \"b\":2}", "Expected ','")]
    [TestCase("{1:2}", "string key")]
    [TestCase("// c\n1", "Unexpected")]
    [TestCase("\uFEFF1", "Unexpected")]
    [TestCase("1 2", "after the document")]
    [TestCase("\"abc", "Unterminated")]
    [TestCase("\"a\\", "Unterminated")]
    [TestCase("\"a\\q\"", "escape")]
    [TestCase("\"\\u12G4\"", "hex")]
    [TestCase("\"\\u12", "Unterminated")]
    [TestCase("\"a\tb\"", "Control")]
    [TestCase("", "end of input")]
    [TestCase("tru", "Unexpected")]
    public void Rejects_invalid_documents_with_an_error_and_never_throws(string text, string fragment)
    {
        var r = StrictJson.Parse(text);
        Assert.That(r.Ok, Is.False);
        Assert.That(r.Root, Is.Null);
        Assert.That(r.Error!.Message, Does.Contain(fragment));
        Assert.That(r.Error.Line, Is.GreaterThanOrEqualTo(1));
    }

    [Test]
    public void Duplicate_key_error_points_at_the_key()
    {
        var r = StrictJson.Parse("{\"a\":{\"b\":1,\"b\":2}}");
        Assert.That(r.Error!.Pointer, Is.EqualTo("/a/b"));
    }

    [Test]
    public void Pointer_escapes_slash_and_tilde()
    {
        var root = (JsonObject)StrictJson.Parse("{\"a/b\":1,\"c~d\":2}").Root!;
        Assert.That(root.ValueAt(0).Pointer, Is.EqualTo("/a~1b"));
        Assert.That(root.ValueAt(1).Pointer, Is.EqualTo("/c~0d"));
    }

    [Test]
    public void Rejects_documents_nested_too_deeply()
    {
        string deep = new string('[', 100) + new string(']', 100);
        var r = StrictJson.Parse(deep);
        Assert.That(r.Ok, Is.False);
        Assert.That(r.Error!.Message, Does.Contain("deep"));
    }

    [Test]
    public void Reports_line_and_column_of_the_error()
    {
        var r = StrictJson.Parse("{\n  \"a\": ?\n}");
        Assert.That(r.Error!.Line, Is.EqualTo(2));
        Assert.That(r.Error.Column, Is.EqualTo(8));
    }
}
