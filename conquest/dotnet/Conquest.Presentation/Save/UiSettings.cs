using System;
using System.Text;
using Conquest.Core.Json;

namespace Conquest.Presentation
{
    /// <summary>
    /// The few settings the player keeps between runs. Stored as a small strict-JSON file; a missing, damaged or newer
    /// file gives the defaults (never an error). Autosave on end turn is off by default.
    /// </summary>
    public sealed class UiSettings
    {
        public const string FileName = "settings.json";
        public const int CurrentVersion = 1;

        public UiSettings(bool autosaveOnEndTurn, string locale)
        {
            AutosaveOnEndTurn = autosaveOnEndTurn;
            Locale = locale;
        }

        public static UiSettings Default { get; } = new UiSettings(false, "en");

        public bool AutosaveOnEndTurn { get; }

        public string Locale { get; }

        public UiSettings WithAutosave(bool value) => new UiSettings(value, Locale);

        public UiSettings WithLocale(string value) => new UiSettings(AutosaveOnEndTurn, value);

        public string ToJson()
        {
            var sb = new StringBuilder();
            sb.Append("{\"version\":").Append(CurrentVersion);
            sb.Append(",\"autosave_on_end_turn\":").Append(AutosaveOnEndTurn ? "true" : "false");
            sb.Append(",\"locale\":\"").Append(Locale == "bn" ? "bn" : "en").Append("\"}");
            return sb.ToString();
        }

        public static UiSettings FromJson(string? text)
        {
            if (string.IsNullOrWhiteSpace(text)) return Default;
            JsonParseResult parsed = StrictJson.Parse(text!);
            if (!parsed.Ok || !(parsed.Root is JsonObject root)) return Default;
            if (!root.TryGet("version", out JsonValue version) || !(version is JsonInt v) || v.Value != CurrentVersion) return Default;
            bool autosave = root.TryGet("autosave_on_end_turn", out JsonValue a) && a is JsonBool b && b.Value;
            string locale = root.TryGet("locale", out JsonValue l) && l is JsonString s && s.Value == "bn" ? "bn" : "en";
            return new UiSettings(autosave, locale);
        }

        public static UiSettings Load(ISaveStorage storage) =>
            storage.TryRead(FileName, out string? text, out _) ? FromJson(text) : Default;

        /// <summary>Writes the settings; false when the storage refused (the caller keeps playing with them in memory).</summary>
        public bool Save(ISaveStorage storage) => storage.TryWrite(FileName, ToJson(), out _);
    }
}
