using System.Collections.Generic;
using System.Globalization;
using Conquest.Core.Json;

namespace Conquest.Core.Save
{
    /// <summary>
    /// Typed, error-collecting access to a JSON object. Every read records a <see cref="SaveError"/> and returns a neutral value
    /// when the member is missing or of the wrong type; <see cref="Finish"/> rejects members nobody asked for (typos).
    /// </summary>
    internal sealed class ObjectView
    {
        private readonly JsonObject _object;
        private readonly List<SaveError> _errors;
        private readonly List<string> _read = new List<string>();

        public ObjectView(JsonObject o, List<SaveError> errors)
        {
            _object = o;
            _errors = errors;
        }

        public string Pointer => _object.Pointer;

        public static ObjectView? Of(JsonValue? value, List<SaveError> errors)
        {
            if (value is JsonObject o)
            {
                return new ObjectView(o, errors);
            }

            errors.Add(new SaveError(value?.Pointer ?? string.Empty, SaveFormat.BadShape, "expected an object"));
            return null;
        }

        public int Int(string key, int min, int max)
        {
            if (Find(key) is JsonInt i)
            {
                if (i.Value >= min && i.Value <= max)
                {
                    return (int)i.Value;
                }

                Fail(i, SaveFormat.BadValue, "must be " + min.ToString(CultureInfo.InvariantCulture) + " to " + max.ToString(CultureInfo.InvariantCulture));
                return min;
            }

            Missing(key, "an integer");
            return min;
        }

        public long Long(string key)
        {
            if (Find(key) is JsonInt i)
            {
                return i.Value;
            }

            Missing(key, "an integer");
            return 0;
        }

        public bool Bool(string key)
        {
            if (Find(key) is JsonBool b)
            {
                return b.Value;
            }

            Missing(key, "a boolean");
            return false;
        }

        public string Str(string key)
        {
            if (Find(key) is JsonString s)
            {
                return s.Value;
            }

            Missing(key, "a string");
            return string.Empty;
        }

        public string? NullableStr(string key)
        {
            JsonValue? v = Find(key);
            if (v is JsonNull)
            {
                return null;
            }

            if (v is JsonString s)
            {
                return s.Value;
            }

            Missing(key, "a string or null");
            return null;
        }

        public ulong ULong(string key)
        {
            string text = Str(key);
            if (ulong.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out ulong value))
            {
                return value;
            }

            _errors.Add(new SaveError(JsonPointer.Child(Pointer, key), SaveFormat.BadValue, "expected an unsigned decimal string"));
            return 0;
        }

        public JsonArray? Array(string key)
        {
            if (Find(key) is JsonArray a)
            {
                return a;
            }

            Missing(key, "an array");
            return null;
        }

        public ObjectView? Child(string key)
        {
            JsonValue? v = Find(key);
            if (v == null)
            {
                Missing(key, "an object");
                return null;
            }

            return Of(v, _errors);
        }

        public void Fail(JsonValue at, string code, string message) => _errors.Add(new SaveError(at.Pointer, code, message));

        public void Fail(string key, string code, string message) => _errors.Add(new SaveError(JsonPointer.Child(Pointer, key), code, message));

        /// <summary>Reports every member that was never read.</summary>
        public void Finish()
        {
            for (int i = 0; i < _object.Count; i++)
            {
                if (!_read.Contains(_object.KeyAt(i)))
                {
                    _errors.Add(new SaveError(JsonPointer.Child(Pointer, _object.KeyAt(i)), SaveFormat.UnknownKey, "unknown member"));
                }
            }
        }

        private JsonValue? Find(string key)
        {
            _read.Add(key);
            return _object.TryGet(key, out JsonValue value) ? value : null;
        }

        private void Missing(string key, string expected)
        {
            _errors.Add(new SaveError(JsonPointer.Child(Pointer, key), SaveFormat.BadShape, "expected " + expected));
        }
    }
}
