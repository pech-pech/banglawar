using System.Collections.Generic;

namespace Conquest.Core.Json
{
    /// <summary>Parsed JSON node. Integers are exact <c>long</c>; there is no floating-point node by design.</summary>
    public abstract class JsonValue
    {
        protected JsonValue(string pointer, int line, int column)
        {
            Pointer = pointer;
            Line = line;
            Column = column;
        }

        /// <summary>RFC 6901 JSON Pointer of this node.</summary>
        public string Pointer { get; }

        public int Line { get; }

        public int Column { get; }
    }

    public sealed class JsonObject : JsonValue
    {
        private readonly string[] _keys;
        private readonly JsonValue[] _values;

        public JsonObject(string pointer, int line, int column, string[] keys, JsonValue[] values)
            : base(pointer, line, column)
        {
            _keys = keys;
            _values = values;
        }

        public int Count => _keys.Length;

        public string KeyAt(int index) => _keys[index];

        public JsonValue ValueAt(int index) => _values[index];

        public bool TryGet(string key, out JsonValue value)
        {
            for (int i = 0; i < _keys.Length; i++)
            {
                if (string.Equals(_keys[i], key, System.StringComparison.Ordinal))
                {
                    value = _values[i];
                    return true;
                }
            }

            value = null!;
            return false;
        }
    }

    public sealed class JsonArray : JsonValue
    {
        private readonly JsonValue[] _items;

        public JsonArray(string pointer, int line, int column, JsonValue[] items)
            : base(pointer, line, column)
        {
            _items = items;
        }

        public int Count => _items.Length;

        public JsonValue this[int index] => _items[index];
    }

    public sealed class JsonString : JsonValue
    {
        public JsonString(string pointer, int line, int column, string value)
            : base(pointer, line, column)
        {
            Value = value;
        }

        public string Value { get; }
    }

    public sealed class JsonInt : JsonValue
    {
        public JsonInt(string pointer, int line, int column, long value)
            : base(pointer, line, column)
        {
            Value = value;
        }

        public long Value { get; }
    }

    public sealed class JsonBool : JsonValue
    {
        public JsonBool(string pointer, int line, int column, bool value)
            : base(pointer, line, column)
        {
            Value = value;
        }

        public bool Value { get; }
    }

    public sealed class JsonNull : JsonValue
    {
        public JsonNull(string pointer, int line, int column)
            : base(pointer, line, column)
        {
        }
    }

    /// <summary>A parse problem with its position and pointer. Loading never throws for bad data.</summary>
    public sealed record JsonError(string Pointer, int Line, int Column, string Message);

    public sealed class JsonParseResult
    {
        private JsonParseResult(JsonValue? root, JsonError? error)
        {
            Root = root;
            Error = error;
        }

        public bool Ok => Error == null;

        public JsonValue? Root { get; }

        public JsonError? Error { get; }

        public static JsonParseResult Success(JsonValue root) => new JsonParseResult(root, null);

        public static JsonParseResult Failure(JsonError error) => new JsonParseResult(null, error);
    }

    internal static class JsonPointer
    {
        public static string Child(string parent, string key) => parent + "/" + key.Replace("~", "~0").Replace("/", "~1");

        public static string Child(string parent, int index) => parent + "/" + index.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }
}
