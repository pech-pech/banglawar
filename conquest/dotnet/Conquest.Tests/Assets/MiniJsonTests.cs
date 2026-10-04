using Conquest.Assets.Json;

namespace Conquest.Tests.Assets;

public class MiniJsonTests
{
    [Test]
    public void Parses_objects_arrays_and_scalars()
    {
        var value = (Dictionary<string, object?>)MiniJson.Parse(
            "{\"a\": [1, -2, 3.5, 1e2], \"b\": {\"c\": null, \"d\": true, \"e\": false}, \"s\": \"x\"}")!;
        var a = (List<object?>)value["a"]!;
        Assert.That(a[0], Is.EqualTo(1L));
        Assert.That(a[1], Is.EqualTo(-2L));
        Assert.That(a[2], Is.EqualTo(3.5));
        Assert.That(a[3], Is.EqualTo(100.0));
        var b = (Dictionary<string, object?>)value["b"]!;
        Assert.That(b["c"], Is.Null);
        Assert.That(b["d"], Is.EqualTo(true));
        Assert.That(b["e"], Is.EqualTo(false));
        Assert.That(value["s"], Is.EqualTo("x"));
    }

    [Test]
    public void Parses_empty_containers_and_whitespace()
    {
        Assert.That(((List<object?>)MiniJson.Parse(" [ ] ")!).Count, Is.EqualTo(0));
        Assert.That(((Dictionary<string, object?>)MiniJson.Parse("\t{\r\n}\n")!).Count, Is.EqualTo(0));
    }

    [Test]
    public void Decodes_string_escapes()
    {
        Assert.That(MiniJson.Parse("\"a\\n\\t\\\"\\\\\\/\\b\\f\\r\\u0041\""), Is.EqualTo("a\n\t\"\\/\b\f\rA"));
    }

    [Test]
    public void Skips_a_byte_order_mark()
    {
        Assert.That(MiniJson.Parse("﻿[1]"), Is.InstanceOf<List<object?>>());
    }

    [TestCase("[1,]")]
    [TestCase("{\"a\":1,}")]
    [TestCase("{\"a\":1,\"a\":2}")]
    [TestCase("[1] x")]
    [TestCase("")]
    [TestCase("[01]")]
    [TestCase("-")]
    [TestCase("1.")]
    [TestCase("1e")]
    [TestCase("\"abc")]
    [TestCase("\"a\\x\"")]
    [TestCase("\"a\\u12\"")]
    [TestCase("\"a\\u12zz\"")]
    [TestCase("\"a\nb\"")]
    [TestCase("{1:2}")]
    [TestCase("{\"a\" 1}")]
    [TestCase("{\"a\":1")]
    [TestCase("[1")]
    [TestCase("tru")]
    [TestCase("?")]
    [TestCase("\"a\\")]
    public void Rejects_malformed_input(string text)
    {
        Assert.Throws<JsonFormatException>(() => MiniJson.Parse(text));
    }

    [Test]
    public void Rejects_nesting_beyond_the_limit()
    {
        string deep = new string('[', MiniJson.MaxDepth + 2) + new string(']', MiniJson.MaxDepth + 2);
        Assert.Throws<JsonFormatException>(() => MiniJson.Parse(deep));
        string ok = new string('[', MiniJson.MaxDepth) + new string(']', MiniJson.MaxDepth);
        Assert.DoesNotThrow(() => MiniJson.Parse(ok));
    }

    [Test]
    public void Error_message_names_the_offset()
    {
        var ex = Assert.Throws<JsonFormatException>(() => MiniJson.Parse("[1, ?]"))!;
        Assert.That(ex.Message, Does.Contain("offset 4"));
    }

    [Test]
    public void Null_text_is_an_argument_error()
    {
        Assert.Throws<ArgumentNullException>(() => MiniJson.Parse(null!));
    }

    [Test]
    public void Huge_integers_fall_back_to_double()
    {
        Assert.That(MiniJson.Parse("123456789012345678901234567890"), Is.InstanceOf<double>());
    }
}
