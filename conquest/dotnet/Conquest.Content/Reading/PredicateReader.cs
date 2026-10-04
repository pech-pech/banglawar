using System.Collections.Generic;
using Conquest.Content.Json;
using Conquest.Content.Model;

namespace Conquest.Content.Reading
{
    /// <summary>
    /// Reads the predicate grammar of hook H4. A predicate is an object with exactly one member whose key is the
    /// kind: <c>{"holds_site": {...}}</c>, <c>{"any_of": [...]}</c>, <c>{"not": {...}}</c>.
    /// </summary>
    public static class PredicateReader
    {
        public static PredicateData? Read(JsonNode node, string path, ErrorSink errors, int depth)
        {
            if (depth > 16)
            {
                errors.Add(path, "predicate.too_deep", "predicate nesting is far beyond the allowed depth", node);
                return null;
            }

            if (!(node is JsonObject obj))
            {
                errors.Add(path, "schema.type", "expected a predicate object", node);
                return null;
            }

            var members = new List<KeyValuePair<string, JsonNode>>();
            foreach (KeyValuePair<string, JsonNode> m in obj.Members)
            {
                if (!m.Key.StartsWith("_", System.StringComparison.Ordinal))
                {
                    members.Add(m);
                }
            }

            if (members.Count != 1)
            {
                errors.Add(path, "predicate.shape", "a predicate must have exactly one kind member", node);
                return null;
            }

            string kind = members[0].Key;
            JsonNode body = members[0].Value;
            string bodyPath = path + "." + kind;
            switch (kind)
            {
                case "all_of":
                case "any_of":
                    return ReadList(kind, body, bodyPath, errors, depth);
                case "not":
                    PredicateData? child = Read(body, bodyPath, errors, depth + 1);
                    return child == null ? null : new PredicateData(kind, children: new List<PredicateData> { child });
                default:
                    return ReadLeaf(kind, body, bodyPath, errors);
            }
        }

        private static PredicateData? ReadList(string kind, JsonNode body, string path, ErrorSink errors, int depth)
        {
            if (!(body is JsonArray arr))
            {
                errors.Add(path, "schema.type", "expected an array of predicates", body);
                return null;
            }

            var children = new List<PredicateData>();
            for (int i = 0; i < arr.Items.Count; i++)
            {
                PredicateData? c = Read(arr.Items[i], path + "[" + i + "]", errors, depth + 1);
                if (c != null)
                {
                    children.Add(c);
                }
            }

            return new PredicateData(kind, children: children);
        }

        private static PredicateData? ReadLeaf(string kind, JsonNode body, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(body, path, errors);
            if (o == null)
            {
                return null;
            }

            switch (kind)
            {
                case "holds_site":
                    return Finish(o, new PredicateData(kind, slot: o.Str("slot", ObjectReader.Slug), site: o.Str("site", ObjectReader.DottedId)));
                case "holds_sites_count":
                    return Finish(o, new PredicateData(kind, slot: o.Str("slot", ObjectReader.Slug), tag: o.Str("tag", ObjectReader.Slug),
                        atLeast: o.Int("at_least", 0, 1000)));
                case "initial_sites_held_at_most_pct":
                    return Finish(o, new PredicateData(kind, slot: o.Str("slot", ObjectReader.Slug), atMostPct: o.Int("at_most_pct", 0, 100),
                        tagsAny: o.Strings("tags_any", ObjectReader.Slug, false)));
                case "base_count":
                    return Finish(o, new PredicateData(kind, slot: o.Str("slot", ObjectReader.Slug), atLeast: o.OptInt("at_least", 0, 1000),
                        atMost: o.OptInt("at_most", 0, 1000)));
                case "turn_at_least":
                    return Finish(o, new PredicateData(kind, turn: o.Int("turn", 0, 1000)));
                case "has_base":
                    return Finish(o, new PredicateData(kind, slot: o.Str("slot", ObjectReader.Slug)));
                case "has_unit_role":
                    return Finish(o, new PredicateData(kind, slot: o.Str("slot", ObjectReader.Slug), role: o.Str("role", ObjectReader.DottedId)));
                default:
                    errors.Add(path, "predicate.unknown_kind", "unknown predicate kind '" + kind + "'", body);
                    o.MarkAllUsed();
                    return null;
            }
        }

        private static PredicateData Finish(ObjectReader o, PredicateData data)
        {
            o.Finish();
            return data;
        }
    }
}
