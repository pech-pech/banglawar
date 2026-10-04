using System.Globalization;
using System.Text;

namespace Conquest.Core
{
    /// <summary>
    /// Builds a canonical text form: fixed field order chosen by the caller, integers in invariant decimal, strings with
    /// explicit length prefix, no whitespace. The state hash is FNV-1a-64 over its UTF-8 bytes (13 section 3.4).
    /// </summary>
    public sealed class CanonicalWriter
    {
        private readonly StringBuilder _text = new StringBuilder();

        public CanonicalWriter Open(string name)
        {
            _text.Append(name).Append('{');
            return this;
        }

        public CanonicalWriter Close()
        {
            _text.Append('}');
            return this;
        }

        public CanonicalWriter Int(string name, long value)
        {
            _text.Append(name).Append('=').Append(value.ToString(CultureInfo.InvariantCulture)).Append(';');
            return this;
        }

        public CanonicalWriter UInt(string name, ulong value)
        {
            _text.Append(name).Append('=').Append(value.ToString(CultureInfo.InvariantCulture)).Append(';');
            return this;
        }

        public CanonicalWriter Str(string name, string value)
        {
            _text.Append(name).Append('=').Append(value.Length.ToString(CultureInfo.InvariantCulture)).Append(':').Append(value).Append(';');
            return this;
        }

        public string Text => _text.ToString();

        public ulong Hash() => Fnv1a64.Hash(Text);
    }
}
