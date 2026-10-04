using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Conquest.Core.Json
{
    /// <summary>
    /// Strict JSON reader (13 section 3.7): exact integers (no fraction, exponent, leading plus or leading zeros),
    /// duplicate keys rejected, no comments, no trailing commas, no BOM, positions and JSON Pointers on every node.
    /// Never throws for bad input; returns an error with line and column.
    /// </summary>
    public static class StrictJson
    {
        private const int MaxDepth = 64;

        public static JsonParseResult Parse(string text)
        {
            var p = new Parser(text);
            try
            {
                p.SkipWhitespace();
                JsonValue root = p.ParseValue("", 0);
                p.SkipWhitespace();
                if (!p.AtEnd)
                {
                    p.Fail("Unexpected content after the document.");
                }

                return JsonParseResult.Success(root);
            }
            catch (JsonSyntaxException e)
            {
                return JsonParseResult.Failure(e.Error);
            }
        }

        private sealed class JsonSyntaxException : Exception
        {
            public JsonSyntaxException(JsonError error)
                : base(error.Message)
            {
                Error = error;
            }

            public JsonError Error { get; }
        }

        private sealed class Parser
        {
            private readonly string _s;
            private int _i;
            private int _line = 1;
            private int _col = 1;

            public Parser(string s)
            {
                _s = s;
            }

            public bool AtEnd => _i >= _s.Length;

            public void Fail(string message, string pointer = "") =>
                throw new JsonSyntaxException(new JsonError(pointer, _line, _col, message));

            private char Peek() => _i < _s.Length ? _s[_i] : '\0';

            private char Take()
            {
                char c = _s[_i++];
                if (c == '\n')
                {
                    _line++;
                    _col = 1;
                }
                else
                {
                    _col++;
                }

                return c;
            }

            public void SkipWhitespace()
            {
                while (_i < _s.Length)
                {
                    char c = _s[_i];
                    if (c == ' ' || c == '\t' || c == '\n' || c == '\r')
                    {
                        Take();
                    }
                    else
                    {
                        break;
                    }
                }
            }

            public JsonValue ParseValue(string pointer, int depth)
            {
                if (depth > MaxDepth)
                {
                    Fail("Nesting is too deep.", pointer);
                }

                if (AtEnd)
                {
                    Fail("Unexpected end of input.", pointer);
                }

                int line = _line;
                int col = _col;
                char c = Peek();
                if (c == '{')
                {
                    return ParseObject(pointer, depth, line, col);
                }

                if (c == '[')
                {
                    return ParseArray(pointer, depth, line, col);
                }

                if (c == '"')
                {
                    return new JsonString(pointer, line, col, ParseString(pointer));
                }

                if (c == '-' || (c >= '0' && c <= '9'))
                {
                    return new JsonInt(pointer, line, col, ParseInt(pointer));
                }

                if (Match("true"))
                {
                    return new JsonBool(pointer, line, col, true);
                }

                if (Match("false"))
                {
                    return new JsonBool(pointer, line, col, false);
                }

                if (Match("null"))
                {
                    return new JsonNull(pointer, line, col);
                }

                Fail("Unexpected character '" + c + "'.", pointer);
                return null!;
            }

            private bool Match(string word)
            {
                if (string.CompareOrdinal(_s, _i, word, 0, word.Length) != 0)
                {
                    return false;
                }

                for (int k = 0; k < word.Length; k++)
                {
                    Take();
                }

                return true;
            }

            private JsonValue ParseObject(string pointer, int depth, int line, int col)
            {
                Take();
                var keys = new List<string>();
                var values = new List<JsonValue>();
                SkipWhitespace();
                if (Peek() == '}')
                {
                    Take();
                    return new JsonObject(pointer, line, col, new string[0], new JsonValue[0]);
                }

                while (true)
                {
                    SkipWhitespace();
                    if (Peek() != '"')
                    {
                        Fail("Expected a string key.", pointer);
                    }

                    string key = ParseString(pointer);
                    for (int k = 0; k < keys.Count; k++)
                    {
                        if (string.Equals(keys[k], key, StringComparison.Ordinal))
                        {
                            Fail("Duplicate key '" + key + "'.", JsonPointer.Child(pointer, key));
                        }
                    }

                    SkipWhitespace();
                    if (Peek() != ':')
                    {
                        Fail("Expected ':'.", JsonPointer.Child(pointer, key));
                    }

                    Take();
                    SkipWhitespace();
                    keys.Add(key);
                    values.Add(ParseValue(JsonPointer.Child(pointer, key), depth + 1));
                    SkipWhitespace();
                    char c = Peek();
                    if (c == ',')
                    {
                        Take();
                        continue;
                    }

                    if (c == '}')
                    {
                        Take();
                        return new JsonObject(pointer, line, col, keys.ToArray(), values.ToArray());
                    }

                    Fail("Expected ',' or '}'.", pointer);
                }
            }

            private JsonValue ParseArray(string pointer, int depth, int line, int col)
            {
                Take();
                var items = new List<JsonValue>();
                SkipWhitespace();
                if (Peek() == ']')
                {
                    Take();
                    return new JsonArray(pointer, line, col, new JsonValue[0]);
                }

                while (true)
                {
                    SkipWhitespace();
                    items.Add(ParseValue(JsonPointer.Child(pointer, items.Count), depth + 1));
                    SkipWhitespace();
                    char c = Peek();
                    if (c == ',')
                    {
                        Take();
                        continue;
                    }

                    if (c == ']')
                    {
                        Take();
                        return new JsonArray(pointer, line, col, items.ToArray());
                    }

                    Fail("Expected ',' or ']'.", pointer);
                }
            }

            private long ParseInt(string pointer)
            {
                var digits = new StringBuilder();
                if (Peek() == '-')
                {
                    digits.Append(Take());
                }

                int start = digits.Length;
                while (Peek() >= '0' && Peek() <= '9')
                {
                    digits.Append(Take());
                }

                int count = digits.Length - start;
                if (count == 0)
                {
                    Fail("Expected digits.", pointer);
                }

                if (count > 1 && digits[start] == '0')
                {
                    Fail("Leading zeros are not allowed.", pointer);
                }

                char next = Peek();
                if (next == '.' || next == 'e' || next == 'E')
                {
                    Fail("Only integers are allowed (no fraction or exponent).", pointer);
                }

                if (!long.TryParse(digits.ToString(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out long value))
                {
                    Fail("Integer is out of range.", pointer);
                }

                return value;
            }

            private string ParseString(string pointer)
            {
                Take();
                var sb = new StringBuilder();
                while (true)
                {
                    if (AtEnd)
                    {
                        Fail("Unterminated string.", pointer);
                    }

                    char c = Take();
                    if (c == '"')
                    {
                        return sb.ToString();
                    }

                    if (c < ' ')
                    {
                        Fail("Control character in string.", pointer);
                    }

                    if (c != '\\')
                    {
                        sb.Append(c);
                        continue;
                    }

                    if (AtEnd)
                    {
                        Fail("Unterminated escape.", pointer);
                    }

                    char e = Take();
                    switch (e)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'b': sb.Append('\b'); break;
                        case 'f': sb.Append('\f'); break;
                        case 'n': sb.Append('\n'); break;
                        case 'r': sb.Append('\r'); break;
                        case 't': sb.Append('\t'); break;
                        case 'u': sb.Append(ParseHex4(pointer)); break;
                        default: Fail("Invalid escape.", pointer); break;
                    }
                }
            }

            private char ParseHex4(string pointer)
            {
                int v = 0;
                for (int k = 0; k < 4; k++)
                {
                    if (AtEnd)
                    {
                        Fail("Unterminated escape.", pointer);
                    }

                    char h = Take();
                    int d;
                    if (h >= '0' && h <= '9')
                    {
                        d = h - '0';
                    }
                    else if (h >= 'a' && h <= 'f')
                    {
                        d = h - 'a' + 10;
                    }
                    else if (h >= 'A' && h <= 'F')
                    {
                        d = h - 'A' + 10;
                    }
                    else
                    {
                        Fail("Invalid hex digit.", pointer);
                        d = 0;
                    }

                    v = v * 16 + d;
                }

                return (char)v;
            }
        }
    }
}
