using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Conquest.Content.Json;
using Conquest.Content.Model;

namespace Conquest.Content.Reading
{
    /// <summary>
    /// Typed, strict access to one JSON object. Every read records the key as used; <see cref="Finish"/> reports
    /// the keys nobody asked for (except underscore keys, which are documentation notes). Failed reads add a
    /// <see cref="ContentError"/> with the full path and return a harmless default so reading can continue.
    /// </summary>
    public sealed class ObjectReader
    {
        public static readonly Regex DottedId = new Regex(
            "^[a-z][a-z0-9_]*(\\.[a-z0-9_]+)+$", RegexOptions.CultureInvariant);

        public static readonly Regex Slug = new Regex("^[a-z][a-z0-9_-]*$", RegexOptions.CultureInvariant);

        public static readonly Regex SemVer = new Regex(
            "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$", RegexOptions.CultureInvariant);

        private readonly HashSet<string> _used = new HashSet<string>(StringComparer.Ordinal);

        private ObjectReader(JsonObject node, string path, ErrorSink errors)
        {
            Node = node;
            Path = path;
            Errors = errors;
        }

        public JsonObject Node { get; }

        public string Path { get; }

        public ErrorSink Errors { get; }

        public static ObjectReader? Open(JsonNode? node, string path, ErrorSink errors)
        {
            if (node is JsonObject obj)
            {
                return new ObjectReader(obj, path, errors);
            }

            errors.Add(path, "schema.type", "expected an object", node);
            return null;
        }

        public string ChildPath(string key)
        {
            return Path + "." + key;
        }

        public bool Has(string key)
        {
            return Node.TryGet(key, out _);
        }

        /// <summary>Returns the raw child node, marking it used; adds schema.missing when required and absent.</summary>
        public JsonNode? Raw(string key, bool required)
        {
            _used.Add(key);
            if (Node.TryGet(key, out JsonNode value))
            {
                return value;
            }

            if (required)
            {
                Errors.Add(ChildPath(key), "schema.missing", "required field is missing", Node);
            }

            return null;
        }

        public string Str(string key, Regex? pattern = null)
        {
            return OptStr(key, pattern, true) ?? string.Empty;
        }

        public string? OptStr(string key, Regex? pattern = null, bool required = false)
        {
            JsonNode? n = Raw(key, required);
            if (n == null || n is JsonNull)
            {
                return null;
            }

            if (!(n is JsonString s))
            {
                Errors.Add(ChildPath(key), "schema.type", "expected a string", n);
                return null;
            }

            if (pattern != null && !pattern.IsMatch(s.Value))
            {
                Errors.Add(ChildPath(key), "schema.pattern", "'" + s.Value + "' is not a valid id here", n);
                return null;
            }

            return s.Value;
        }

        public int Int(string key, int min, int max)
        {
            return OptInt(key, min, max, true) ?? min;
        }

        public int? OptInt(string key, int min, int max, bool required = false)
        {
            JsonNode? n = Raw(key, required);
            if (n == null || n is JsonNull)
            {
                return null;
            }

            return ReadInt(n, ChildPath(key), min, max, Errors);
        }

        public static int? ReadInt(JsonNode n, string path, int min, int max, ErrorSink errors)
        {
            if (!(n is JsonInteger i))
            {
                errors.Add(path, "schema.type", "expected a whole number", n);
                return null;
            }

            if (i.Value < min || i.Value > max)
            {
                errors.Add(path, "schema.range", "value " + i.Value + " is outside " + min + ".." + max, n);
                return null;
            }

            return (int)i.Value;
        }

        public bool Bool(string key)
        {
            return OptBool(key, true) ?? false;
        }

        public bool? OptBool(string key, bool required = false)
        {
            JsonNode? n = Raw(key, required);
            if (n == null)
            {
                return null;
            }

            if (n is JsonBoolean b)
            {
                return b.Value;
            }

            Errors.Add(ChildPath(key), "schema.type", "expected true or false", n);
            return null;
        }

        public ObjectReader? Obj(string key)
        {
            JsonNode? n = Raw(key, true);
            return n == null ? null : Open(n, ChildPath(key), Errors);
        }

        public ObjectReader? OptObj(string key)
        {
            JsonNode? n = Raw(key, false);
            return n == null || n is JsonNull ? null : Open(n, ChildPath(key), Errors);
        }

        /// <summary>Reads an array of items with <paramref name="read"/>; a null result is skipped (it reported itself).</summary>
        public List<T> List<T>(string key, Func<JsonNode, string, T?> read, bool required = true)
            where T : class
        {
            var result = new List<T>();
            JsonNode? n = Raw(key, required);
            if (n == null)
            {
                return result;
            }

            if (!(n is JsonArray arr))
            {
                Errors.Add(ChildPath(key), "schema.type", "expected an array", n);
                return result;
            }

            for (int i = 0; i < arr.Items.Count; i++)
            {
                T? item = read(arr.Items[i], ChildPath(key) + "[" + i + "]");
                if (item != null)
                {
                    result.Add(item);
                }
            }

            return result;
        }

        public List<string> Strings(string key, Regex? pattern = null, bool required = true)
        {
            return List<string>(key, (node, path) =>
            {
                if (!(node is JsonString s))
                {
                    Errors.Add(path, "schema.type", "expected a string", node);
                    return null;
                }

                if (pattern != null && !pattern.IsMatch(s.Value))
                {
                    Errors.Add(path, "schema.pattern", "'" + s.Value + "' is not a valid id here", node);
                    return null;
                }

                return s.Value;
            }, required);
        }

        /// <summary>Reads an object whose members are all of one kind, in file order; underscore members are skipped.</summary>
        public List<T> Members<T>(string key, Func<string, JsonNode, string, T?> read, bool required = true)
            where T : class
        {
            var result = new List<T>();
            ObjectReader? sub = required ? Obj(key) : OptObj(key);
            if (sub == null)
            {
                return result;
            }

            foreach (KeyValuePair<string, JsonNode> member in sub.Node.Members)
            {
                if (member.Key.StartsWith("_", StringComparison.Ordinal))
                {
                    continue;
                }

                T? item = read(member.Key, member.Value, sub.ChildPath(member.Key));
                if (item != null)
                {
                    result.Add(item);
                }
            }

            sub.MarkAllUsed();
            return result;
        }

        public void MarkAllUsed()
        {
            foreach (KeyValuePair<string, JsonNode> m in Node.Members)
            {
                _used.Add(m.Key);
            }
        }

        public void Finish()
        {
            foreach (KeyValuePair<string, JsonNode> member in Node.Members)
            {
                if (member.Key.StartsWith("_", StringComparison.Ordinal) || _used.Contains(member.Key))
                {
                    continue;
                }

                Errors.Add(ChildPath(member.Key), "schema.unknown_key", "unknown field '" + member.Key + "'", member.Value);
            }
        }

        public static TilePoint? ReadTile(JsonNode node, string path, ErrorSink errors)
        {
            if (!(node is JsonArray arr) || arr.Items.Count != 2)
            {
                errors.Add(path, "schema.type", "expected a [x, y] pair", node);
                return null;
            }

            int? x = ReadInt(arr.Items[0], path + "[0]", -1000, 1000, errors);
            int? y = ReadInt(arr.Items[1], path + "[1]", -1000, 1000, errors);
            return x.HasValue && y.HasValue ? new TilePoint(x.Value, y.Value) : (TilePoint?)null;
        }

        public TilePoint Tile(string key)
        {
            JsonNode? n = Raw(key, true);
            if (n == null)
            {
                return default;
            }

            return ReadTile(n, ChildPath(key), Errors) ?? default;
        }

        public StockData Stock(string key, bool required)
        {
            ObjectReader? sub = required ? Obj(key) : OptObj(key);
            if (sub == null)
            {
                return StockData.Empty;
            }

            var amounts = new List<ResourceAmount>();
            foreach (KeyValuePair<string, JsonNode> m in sub.Node.Members)
            {
                if (m.Key.StartsWith("_", StringComparison.Ordinal))
                {
                    continue;
                }

                int? v = ReadInt(m.Value, sub.ChildPath(m.Key), -1000000, 1000000, Errors);
                if (v.HasValue)
                {
                    amounts.Add(new ResourceAmount(m.Key, v.Value));
                }
            }

            sub.MarkAllUsed();
            return new StockData(amounts);
        }
    }
}
