using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Conquest.Core.Save
{
    /// <summary>
    /// A tiny canonical JSON writer: no whitespace, keys in the order the caller writes them, integers in invariant decimal,
    /// strings escaped, unsigned 64-bit values written as decimal strings (a JSON number would lose them in other readers).
    /// </summary>
    internal sealed class JsonText
    {
        private readonly StringBuilder _text = new StringBuilder();
        private readonly Stack<bool> _first = new Stack<bool>();

        public JsonText BeginObject()
        {
            Separate();
            _text.Append('{');
            _first.Push(true);
            return this;
        }

        public JsonText EndObject()
        {
            _first.Pop();
            _text.Append('}');
            return this;
        }

        public JsonText BeginArray(string key)
        {
            Key(key);
            _text.Append('[');
            _first.Push(true);
            return this;
        }

        public JsonText BeginArrayItem()
        {
            Separate();
            _text.Append('[');
            _first.Push(true);
            return this;
        }

        public JsonText EndArray()
        {
            _first.Pop();
            _text.Append(']');
            return this;
        }

        public JsonText BeginObject(string key)
        {
            Key(key);
            _text.Append('{');
            _first.Push(true);
            return this;
        }

        public JsonText Int(string key, long value)
        {
            Key(key);
            _text.Append(value.ToString(CultureInfo.InvariantCulture));
            return this;
        }

        public JsonText Item(long value)
        {
            Separate();
            _text.Append(value.ToString(CultureInfo.InvariantCulture));
            return this;
        }

        public JsonText Bool(string key, bool value)
        {
            Key(key);
            _text.Append(value ? "true" : "false");
            return this;
        }

        public JsonText UInt(string key, ulong value)
        {
            return Str(key, value.ToString(CultureInfo.InvariantCulture));
        }

        public JsonText Str(string key, string value)
        {
            Key(key);
            Quote(value);
            return this;
        }

        public JsonText NullableStr(string key, string? value)
        {
            if (value == null)
            {
                Key(key);
                _text.Append("null");
                return this;
            }

            return Str(key, value);
        }

        public override string ToString() => _text.ToString();

        private void Key(string key)
        {
            Separate();
            Quote(key);
            _text.Append(':');
        }

        private void Separate()
        {
            if (_first.Count == 0)
            {
                return;
            }

            if (_first.Pop())
            {
                _first.Push(false);
            }
            else
            {
                _first.Push(false);
                _text.Append(',');
            }
        }

        private void Quote(string value)
        {
            _text.Append('"');
            foreach (char c in value)
            {
                if (c == '"' || c == '\\')
                {
                    _text.Append('\\').Append(c);
                }
                else if (c < ' ')
                {
                    _text.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                }
                else
                {
                    _text.Append(c);
                }
            }

            _text.Append('"');
        }
    }
}
