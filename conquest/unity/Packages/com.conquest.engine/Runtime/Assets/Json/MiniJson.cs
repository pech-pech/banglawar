#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Conquest.Assets.Json
{
    /// <summary>Raised for malformed JSON; the message carries the character offset.</summary>
    public sealed class JsonFormatException : Exception
    {
        public JsonFormatException(string message) : base(message) { }
    }

    /// <summary>
    /// Strict JSON reader with no dependencies. Objects become Dictionary&lt;string, object?&gt;, arrays
    /// List&lt;object?&gt;, numbers long (integers) or double, plus string, bool and null.
    /// Rejects trailing commas, comments, duplicate keys, trailing text and nesting deeper than MaxDepth.
    /// </summary>
    public static class MiniJson
    {
        public const int MaxDepth = 64;

        public static object? Parse(string text)
        {
            if (text == null) throw new ArgumentNullException(nameof(text));
            var reader = new Reader(text);
            reader.SkipSpace();
            object? value = reader.ReadValue(0);
            reader.SkipSpace();
            if (!reader.AtEnd) throw reader.Fail("unexpected text after the value");
            return value;
        }

        private sealed class Reader
        {
            private readonly string _text;
            private int _pos;

            public Reader(string text) { _text = text.Length > 0 && text[0] == '﻿' ? text.Substring(1) : text; }

            public bool AtEnd => _pos >= _text.Length;

            public JsonFormatException Fail(string what) =>
                new JsonFormatException("JSON error at offset " + _pos + ": " + what);

            public void SkipSpace()
            {
                while (_pos < _text.Length)
                {
                    char c = _text[_pos];
                    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') _pos++;
                    else break;
                }
            }

            public object? ReadValue(int depth)
            {
                if (depth > MaxDepth) throw Fail("nesting is deeper than " + MaxDepth);
                if (AtEnd) throw Fail("unexpected end of input");
                char c = _text[_pos];
                switch (c)
                {
                    case '{': return ReadObject(depth);
                    case '[': return ReadArray(depth);
                    case '"': return ReadString();
                    case 't': ExpectWord("true"); return true;
                    case 'f': ExpectWord("false"); return false;
                    case 'n': ExpectWord("null"); return null;
                    default:
                        if (c == '-' || (c >= '0' && c <= '9')) return ReadNumber();
                        throw Fail("unexpected character '" + c + "'");
                }
            }

            private void ExpectWord(string word)
            {
                if (string.CompareOrdinal(_text, _pos, word, 0, word.Length) != 0) throw Fail("expected " + word);
                _pos += word.Length;
            }

            private Dictionary<string, object?> ReadObject(int depth)
            {
                var result = new Dictionary<string, object?>(StringComparer.Ordinal);
                _pos++;
                SkipSpace();
                if (!AtEnd && _text[_pos] == '}') { _pos++; return result; }
                while (true)
                {
                    SkipSpace();
                    if (AtEnd || _text[_pos] != '"') throw Fail("expected a string key");
                    string key = ReadString();
                    if (result.ContainsKey(key)) throw Fail("duplicate key '" + key + "'");
                    SkipSpace();
                    if (AtEnd || _text[_pos] != ':') throw Fail("expected ':'");
                    _pos++;
                    SkipSpace();
                    result[key] = ReadValue(depth + 1);
                    SkipSpace();
                    if (AtEnd) throw Fail("unterminated object");
                    char c = _text[_pos++];
                    if (c == '}') return result;
                    if (c != ',') throw Fail("expected ',' or '}'");
                }
            }

            private List<object?> ReadArray(int depth)
            {
                var result = new List<object?>();
                _pos++;
                SkipSpace();
                if (!AtEnd && _text[_pos] == ']') { _pos++; return result; }
                while (true)
                {
                    SkipSpace();
                    result.Add(ReadValue(depth + 1));
                    SkipSpace();
                    if (AtEnd) throw Fail("unterminated array");
                    char c = _text[_pos++];
                    if (c == ']') return result;
                    if (c != ',') throw Fail("expected ',' or ']'");
                }
            }

            private string ReadString()
            {
                _pos++;
                var sb = new StringBuilder();
                while (true)
                {
                    if (AtEnd) throw Fail("unterminated string");
                    char c = _text[_pos++];
                    if (c == '"') return sb.ToString();
                    if (c < ' ') throw Fail("control character in string");
                    if (c != '\\') { sb.Append(c); continue; }
                    if (AtEnd) throw Fail("unterminated escape");
                    char e = _text[_pos++];
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
                        case 'u':
                            if (_pos + 4 > _text.Length) throw Fail("short \\u escape");
                            if (!int.TryParse(_text.Substring(_pos, 4), NumberStyles.AllowHexSpecifier,
                                    CultureInfo.InvariantCulture, out int code))
                                throw Fail("bad \\u escape");
                            sb.Append((char)code);
                            _pos += 4;
                            break;
                        default: throw Fail("bad escape '\\" + e + "'");
                    }
                }
            }

            private object ReadNumber()
            {
                int start = _pos;
                if (_text[_pos] == '-') _pos++;
                int digitsStart = _pos;
                while (!AtEnd && _text[_pos] >= '0' && _text[_pos] <= '9') _pos++;
                if (_pos == digitsStart) throw Fail("digits expected");
                if (_text[digitsStart] == '0' && _pos - digitsStart > 1) throw Fail("leading zero");
                bool isInteger = true;
                if (!AtEnd && _text[_pos] == '.')
                {
                    isInteger = false;
                    _pos++;
                    int fracStart = _pos;
                    while (!AtEnd && _text[_pos] >= '0' && _text[_pos] <= '9') _pos++;
                    if (_pos == fracStart) throw Fail("digits expected after '.'");
                }
                if (!AtEnd && (_text[_pos] == 'e' || _text[_pos] == 'E'))
                {
                    isInteger = false;
                    _pos++;
                    if (!AtEnd && (_text[_pos] == '+' || _text[_pos] == '-')) _pos++;
                    int expStart = _pos;
                    while (!AtEnd && _text[_pos] >= '0' && _text[_pos] <= '9') _pos++;
                    if (_pos == expStart) throw Fail("digits expected in exponent");
                }
                string token = _text.Substring(start, _pos - start);
                if (isInteger && long.TryParse(token, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out long l))
                    return l;
                return double.Parse(token, NumberStyles.Float, CultureInfo.InvariantCulture);
            }
        }
    }
}
