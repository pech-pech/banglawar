using System;
using System.Collections.Generic;
using System.Globalization;
using Conquest.Assets.Json;
using Conquest.Content.Model;

namespace Conquest.Glue
{
    /// <summary>
    /// UI text in English ("en") and Bengali ("bn"). Chrome strings come from ui-strings.json (a table per locale);
    /// role labels come from the theme (English, with the "@f2" wording for the opposing side) and may be overridden
    /// per locale by a "label.&lt;id&gt;" entry. Numbers are always written with Western digits (design decision O-6):
    /// use <see cref="Number"/>, never a culture-dependent ToString.
    /// </summary>
    public sealed class Localizer
    {
        public const string English = "en";
        public const string Bengali = "bn";

        private readonly Dictionary<string, Dictionary<string, string>> tables;
        private readonly Dictionary<string, string> themeLabels;
        private string locale = English;

        public Localizer(Dictionary<string, Dictionary<string, string>> tables, ThemeData? theme)
        {
            this.tables = tables ?? throw new ArgumentNullException(nameof(tables));
            themeLabels = new Dictionary<string, string>(StringComparer.Ordinal);
            if (theme != null)
            {
                foreach (NamedEntry label in theme.Labels) themeLabels[label.Key] = label.Value;
            }
        }

        public event Action<string>? LocaleChanged;

        public string Locale => locale;

        public IEnumerable<string> Locales => tables.Keys;

        public static Localizer FromJson(string json, ThemeData? theme)
        {
            object? root = MiniJson.Parse(json);
            if (!(root is Dictionary<string, object?> top)) throw new FormatException("ui-strings.json must be an object");
            var tables = new Dictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
            foreach (KeyValuePair<string, object?> pair in top)
            {
                if (!(pair.Value is Dictionary<string, object?> entries)) continue;
                var table = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (KeyValuePair<string, object?> e in entries)
                {
                    if (e.Value is string text) table[e.Key] = text;
                }

                tables[pair.Key] = table;
            }

            if (!tables.ContainsKey(English)) throw new FormatException("ui-strings.json needs an 'en' table");
            return new Localizer(tables, theme);
        }

        public void SetLocale(string value)
        {
            if (!tables.ContainsKey(value) || string.Equals(value, locale, StringComparison.Ordinal)) return;
            locale = value;
            LocaleChanged?.Invoke(value);
        }

        /// <summary>Switches between the two locales and returns the new one.</summary>
        public string Toggle()
        {
            SetLocale(locale == English ? Bengali : English);
            return locale;
        }

        public bool Has(string key) => tables[English].ContainsKey(key);

        /// <summary>The string for a key in the current locale, falling back to English and then to the key itself.</summary>
        public string Get(string key)
        {
            if (tables.TryGetValue(locale, out Dictionary<string, string>? table) && table.TryGetValue(key, out string? text)) return text;
            return tables[English].TryGetValue(key, out string? fallback) ? fallback : key;
        }

        /// <summary>Replaces {0}, {1} ... in the string with the arguments (Western digits for numbers).</summary>
        public string Format(string key, params object[] args)
        {
            string text = Get(key);
            for (int i = 0; i < args.Length; i++)
            {
                text = text.Replace("{" + i + "}", args[i] is int n ? Number(n) : Convert.ToString(args[i], CultureInfo.InvariantCulture) ?? string.Empty);
            }

            return text;
        }

        public static string Number(int value) => value.ToString(CultureInfo.InvariantCulture);

        /// <summary>The label of a role or terrain id such as "u.scout" for a slot ("f1", "f2"; null for the neutral wording).</summary>
        public string Label(string id, string? slot = null)
        {
            string? text;
            if (slot != null && TryLabel(id + "@" + slot, out text)) return text!;
            return TryLabel(id, out text) ? text! : id;
        }

        private bool TryLabel(string key, out string? text)
        {
            if (locale != English && tables.TryGetValue(locale, out Dictionary<string, string>? table) && table.TryGetValue("label." + key, out text)) return true;
            return themeLabels.TryGetValue(key, out text);
        }

        public string ErrorText(string? code)
        {
            if (string.IsNullOrEmpty(code)) return string.Empty;
            return Has(code!) ? Get(code!) : Get("err.unknown");
        }
    }
}
