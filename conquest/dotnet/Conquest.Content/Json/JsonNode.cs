using System.Collections.Generic;

namespace Conquest.Content.Json
{
    /// <summary>
    /// Read-only JSON document tree produced by <see cref="StrictJsonParser"/>. Every node knows where it came from
    /// (1-based line and column) so validation errors can point at the file. Numbers are exact integers only.
    /// </summary>
    public abstract class JsonNode
    {
        protected JsonNode(int line, int column)
        {
            Line = line;
            Column = column;
        }

        public int Line { get; }

        public int Column { get; }
    }

    public sealed class JsonObject : JsonNode
    {
        private readonly List<KeyValuePair<string, JsonNode>> _members;

        public JsonObject(List<KeyValuePair<string, JsonNode>> members, int line, int column)
            : base(line, column)
        {
            _members = members;
        }

        /// <summary>Members in file order. Keys are unique (the parser rejects duplicates).</summary>
        public IReadOnlyList<KeyValuePair<string, JsonNode>> Members => _members;

        public bool TryGet(string key, out JsonNode value)
        {
            for (int i = 0; i < _members.Count; i++)
            {
                if (string.Equals(_members[i].Key, key, System.StringComparison.Ordinal))
                {
                    value = _members[i].Value;
                    return true;
                }
            }

            value = null!;
            return false;
        }
    }

    public sealed class JsonArray : JsonNode
    {
        public JsonArray(List<JsonNode> items, int line, int column)
            : base(line, column)
        {
            Items = items;
        }

        public IReadOnlyList<JsonNode> Items { get; }
    }

    public sealed class JsonString : JsonNode
    {
        public JsonString(string value, int line, int column)
            : base(line, column)
        {
            Value = value;
        }

        public string Value { get; }
    }

    public sealed class JsonInteger : JsonNode
    {
        public JsonInteger(long value, int line, int column)
            : base(line, column)
        {
            Value = value;
        }

        public long Value { get; }
    }

    public sealed class JsonBoolean : JsonNode
    {
        public JsonBoolean(bool value, int line, int column)
            : base(line, column)
        {
            Value = value;
        }

        public bool Value { get; }
    }

    public sealed class JsonNull : JsonNode
    {
        public JsonNull(int line, int column)
            : base(line, column)
        {
        }
    }
}
