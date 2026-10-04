using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Conquest.Content.Json
{
    /// <summary>
    /// Canonical text form of a content document, used for hashing. Rules: object keys sorted by ordinal
    /// comparison, no whitespace, members whose key starts with an underscore (documentation notes) left out,
    /// integers in invariant decimal, strings with only the escapes that are required. Array order is kept.
    /// </summary>
    public static class CanonicalJson
    {
        public static string Write(JsonNode node)
        {
            var sb = new StringBuilder();
            WriteNode(node, sb);
            return sb.ToString();
        }

        private static void WriteNode(JsonNode node, StringBuilder sb)
        {
            switch (node)
            {
                case JsonObject obj:
                    WriteObject(obj, sb);
                    break;
                case JsonArray arr:
                    sb.Append('[');
                    for (int i = 0; i < arr.Items.Count; i++)
                    {
                        if (i > 0)
                        {
                            sb.Append(',');
                        }

                        WriteNode(arr.Items[i], sb);
                    }

                    sb.Append(']');
                    break;
                case JsonString s:
                    WriteString(s.Value, sb);
                    break;
                case JsonInteger n:
                    sb.Append(n.Value.ToString(CultureInfo.InvariantCulture));
                    break;
                case JsonBoolean b:
                    sb.Append(b.Value ? "true" : "false");
                    break;
                default:
                    sb.Append("null");
                    break;
            }
        }

        private static void WriteObject(JsonObject obj, StringBuilder sb)
        {
            var keys = new List<string>();
            foreach (KeyValuePair<string, JsonNode> member in obj.Members)
            {
                if (!member.Key.StartsWith("_", StringComparison.Ordinal))
                {
                    keys.Add(member.Key);
                }
            }

            keys.Sort(StringComparer.Ordinal);
            sb.Append('{');
            for (int i = 0; i < keys.Count; i++)
            {
                if (i > 0)
                {
                    sb.Append(',');
                }

                WriteString(keys[i], sb);
                sb.Append(':');
                obj.TryGet(keys[i], out JsonNode value);
                WriteNode(value, sb);
            }

            sb.Append('}');
        }

        private static void WriteString(string value, StringBuilder sb)
        {
            sb.Append('"');
            foreach (char c in value)
            {
                if (c == '"')
                {
                    sb.Append("\\\"");
                }
                else if (c == '\\')
                {
                    sb.Append("\\\\");
                }
                else if (c < 0x20)
                {
                    sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                }
                else
                {
                    sb.Append(c);
                }
            }

            sb.Append('"');
        }
    }
}
