using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Conquest.Content.Json
{
    /// <summary>Thrown for any text that is not strict JSON for content files.</summary>
    public sealed class JsonParseException : Exception
    {
        public JsonParseException(string code, string message, int line, int column)
            : base(message)
        {
            Code = code;
            Line = line;
            Column = column;
        }

        public string Code { get; }

        public int Line { get; }

        public int Column { get; }
    }

    /// <summary>
    /// Strict JSON reader for content files: RFC 8259 grammar with no comments, no trailing commas, no duplicate
    /// keys, no raw control characters in strings and integers only (a fraction or exponent is an error, because
    /// the simulation is integer-only). Depth is capped so hostile input cannot overflow the stack.
    /// </summary>
    public sealed class StrictJsonParser
    {
        public const int MaxDepth = 64;

        private readonly string _text;
        private int _pos;
        private int _line = 1;
        private int _column = 1;

        private StrictJsonParser(string text)
        {
            _text = text;
        }

        /// <summary>Parses a document; throws <see cref="JsonParseException"/> with a position on failure.</summary>
        public static JsonNode Parse(string text)
        {
            if (text == null)
            {
                throw new ArgumentNullException(nameof(text));
            }

            var parser = new StrictJsonParser(text);
            if (parser.Peek() == '﻿')
            {
                parser.Advance();
            }

            parser.SkipWhitespace();
            JsonNode root = parser.ParseValue(0);
            parser.SkipWhitespace();
            if (parser._pos < text.Length)
            {
                throw parser.Fail("json.trailing", "unexpected text after the document");
            }

            return root;
        }

        /// <summary>Parses without throwing; returns false and fills <paramref name="error"/> on failure.</summary>
        public static bool TryParse(string text, out JsonNode? node, out ContentError? error)
        {
            try
            {
                node = Parse(text);
                error = null;
                return true;
            }
            catch (JsonParseException ex)
            {
                node = null;
                error = new ContentError("$", ex.Code, ex.Message, ex.Line, ex.Column);
                return false;
            }
        }

        private JsonParseException Fail(string code, string message)
        {
            return new JsonParseException(code, message, _line, _column);
        }

        private char Peek()
        {
            return _pos < _text.Length ? _text[_pos] : '\0';
        }

        private bool AtEnd => _pos >= _text.Length;

        private char Advance()
        {
            char c = _text[_pos++];
            if (c == '\n')
            {
                _line++;
                _column = 1;
            }
            else
            {
                _column++;
            }

            return c;
        }

        private void SkipWhitespace()
        {
            while (!AtEnd)
            {
                char c = Peek();
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r')
                {
                    Advance();
                }
                else
                {
                    break;
                }
            }
        }

        private JsonNode ParseValue(int depth)
        {
            if (depth > MaxDepth)
            {
                throw Fail("json.too_deep", "nesting is deeper than " + MaxDepth);
            }

            if (AtEnd)
            {
                throw Fail("json.unexpected_end", "unexpected end of text");
            }

            int line = _line;
            int column = _column;
            char c = Peek();
            switch (c)
            {
                case '{':
                    return ParseObject(depth, line, column);
                case '[':
                    return ParseArray(depth, line, column);
                case '"':
                    return new JsonString(ParseString(), line, column);
                case 't':
                    ExpectWord("true");
                    return new JsonBoolean(true, line, column);
                case 'f':
                    ExpectWord("false");
                    return new JsonBoolean(false, line, column);
                case 'n':
                    ExpectWord("null");
                    return new JsonNull(line, column);
                default:
                    if (c == '-' || (c >= '0' && c <= '9'))
                    {
                        return ParseInteger(line, column);
                    }

                    throw Fail("json.syntax", "unexpected character '" + c + "'");
            }
        }

        private void ExpectWord(string word)
        {
            for (int i = 0; i < word.Length; i++)
            {
                if (AtEnd || Peek() != word[i])
                {
                    throw Fail("json.syntax", "expected '" + word + "'");
                }

                Advance();
            }
        }

        private JsonNode ParseInteger(int line, int column)
        {
            var sb = new StringBuilder();
            if (Peek() == '-')
            {
                sb.Append(Advance());
            }

            if (AtEnd || Peek() < '0' || Peek() > '9')
            {
                throw Fail("json.syntax", "a digit must follow '-'");
            }

            if (Peek() == '0')
            {
                sb.Append(Advance());
                if (!AtEnd && Peek() >= '0' && Peek() <= '9')
                {
                    throw Fail("json.leading_zero", "numbers may not have leading zeros");
                }
            }
            else
            {
                while (!AtEnd && Peek() >= '0' && Peek() <= '9')
                {
                    sb.Append(Advance());
                }
            }

            if (!AtEnd && (Peek() == '.' || Peek() == 'e' || Peek() == 'E'))
            {
                throw Fail("json.number_not_integer", "only whole numbers are allowed in content files");
            }

            if (!long.TryParse(sb.ToString(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out long value))
            {
                throw Fail("json.number_range", "number does not fit in 64 bits");
            }

            return new JsonInteger(value, line, column);
        }

        private string ParseString()
        {
            Advance();
            var sb = new StringBuilder();
            while (true)
            {
                if (AtEnd)
                {
                    throw Fail("json.unexpected_end", "unterminated string");
                }

                char c = Advance();
                if (c == '"')
                {
                    return sb.ToString();
                }

                if (c < 0x20)
                {
                    throw Fail("json.control_char", "raw control character in string");
                }

                if (c != '\\')
                {
                    sb.Append(c);
                    continue;
                }

                if (AtEnd)
                {
                    throw Fail("json.unexpected_end", "unterminated escape");
                }

                char e = Advance();
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
                    case 'u': sb.Append(ParseUnicodeEscape()); break;
                    default:
                        throw Fail("json.bad_escape", "unknown escape '\\" + e + "'");
                }
            }
        }

        private char ParseUnicodeEscape()
        {
            int value = 0;
            for (int i = 0; i < 4; i++)
            {
                if (AtEnd)
                {
                    throw Fail("json.unexpected_end", "unterminated unicode escape");
                }

                char h = Advance();
                int digit = h >= '0' && h <= '9' ? h - '0'
                    : h >= 'a' && h <= 'f' ? h - 'a' + 10
                    : h >= 'A' && h <= 'F' ? h - 'A' + 10
                    : -1;
                if (digit < 0)
                {
                    throw Fail("json.bad_escape", "bad hex digit in unicode escape");
                }

                value = (value * 16) + digit;
            }

            return (char)value;
        }

        private JsonNode ParseArray(int depth, int line, int column)
        {
            Advance();
            var items = new List<JsonNode>();
            SkipWhitespace();
            if (Peek() == ']')
            {
                Advance();
                return new JsonArray(items, line, column);
            }

            while (true)
            {
                SkipWhitespace();
                items.Add(ParseValue(depth + 1));
                SkipWhitespace();
                if (AtEnd)
                {
                    throw Fail("json.unexpected_end", "unterminated array");
                }

                char c = Advance();
                if (c == ']')
                {
                    return new JsonArray(items, line, column);
                }

                if (c != ',')
                {
                    throw Fail("json.syntax", "expected ',' or ']' in array");
                }

                SkipWhitespace();
                if (Peek() == ']')
                {
                    throw Fail("json.trailing_comma", "trailing comma in array");
                }
            }
        }

        private JsonNode ParseObject(int depth, int line, int column)
        {
            Advance();
            var members = new List<KeyValuePair<string, JsonNode>>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            SkipWhitespace();
            if (Peek() == '}')
            {
                Advance();
                return new JsonObject(members, line, column);
            }

            while (true)
            {
                SkipWhitespace();
                if (Peek() != '"')
                {
                    throw Fail("json.syntax", "expected a quoted key");
                }

                int keyLine = _line;
                int keyColumn = _column;
                string key = ParseString();
                if (!seen.Add(key))
                {
                    throw new JsonParseException("json.duplicate_key", "duplicate key '" + key + "'", keyLine, keyColumn);
                }

                SkipWhitespace();
                if (AtEnd || Advance() != ':')
                {
                    throw Fail("json.syntax", "expected ':' after key");
                }

                SkipWhitespace();
                members.Add(new KeyValuePair<string, JsonNode>(key, ParseValue(depth + 1)));
                SkipWhitespace();
                if (AtEnd)
                {
                    throw Fail("json.unexpected_end", "unterminated object");
                }

                char c = Advance();
                if (c == '}')
                {
                    return new JsonObject(members, line, column);
                }

                if (c != ',')
                {
                    throw Fail("json.syntax", "expected ',' or '}' in object");
                }

                SkipWhitespace();
                if (Peek() == '}')
                {
                    throw Fail("json.trailing_comma", "trailing comma in object");
                }
            }
        }
    }
}
