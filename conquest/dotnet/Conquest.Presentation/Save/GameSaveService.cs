using System;
using System.Collections.Generic;
using Conquest.Core.Save;
using Conquest.Core.Turn;

namespace Conquest.Presentation
{
    /// <summary>The answer to a save request. <see cref="ErrorCode"/> is an <c>err.*</c> key the UI turns into text.</summary>
    public sealed class SaveOutcome
    {
        public SaveOutcome(bool ok, string? errorCode, string detail, string hash)
        {
            Ok = ok;
            ErrorCode = errorCode;
            Detail = detail;
            Hash = hash;
        }

        public bool Ok { get; }

        public string? ErrorCode { get; }

        /// <summary>For logs only: the storage's or the reader's own words.</summary>
        public string Detail { get; }

        /// <summary>The state hash written into the file (empty on failure).</summary>
        public string Hash { get; }
    }

    /// <summary>The answer to a load request; <see cref="State"/> is set only when <see cref="Ok"/>.</summary>
    public sealed class LoadOutcome
    {
        public LoadOutcome(GameState? state, string? errorCode, string detail)
        {
            State = state;
            ErrorCode = errorCode;
            Detail = detail;
        }

        public bool Ok => State != null && ErrorCode == null;

        public GameState? State { get; }

        public string? ErrorCode { get; }

        public string Detail { get; }
    }

    /// <summary>
    /// Saves and loads the game through the core's own save format (<see cref="GameSerializer"/>: strict canonical JSON,
    /// versioned, with the state hash inside). It adds file handling only: slot names, a read-back check after every
    /// write, and error codes. Nothing here throws to the caller.
    /// </summary>
    public sealed class GameSaveService
    {
        public const string Autosave = "autosave";
        public const string Quicksave = "slot-1";
        public const string Suffix = ".save.json";

        public const string ErrSaveFailed = "err.save_failed";
        public const string ErrLoadFailed = "err.load_failed";
        public const string ErrNoSave = "err.save_missing";
        public const string ErrDamaged = "err.save_damaged";
        public const string ErrNewer = "err.save_newer";
        public const string ErrOtherScenario = "err.save_other_scenario";

        private readonly ISaveStorage storage;
        private readonly string scenarioId;

        public GameSaveService(ISaveStorage storage, string scenarioId)
        {
            this.storage = storage ?? throw new ArgumentNullException(nameof(storage));
            this.scenarioId = scenarioId ?? string.Empty;
        }

        public static string FileName(string slot) => slot + Suffix;

        public bool HasSave(string slot) => SaveNames.IsValid(FileName(slot)) && storage.Exists(FileName(slot));

        public SaveOutcome Save(GameState state, string slot)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            string file = FileName(slot);
            if (!SaveNames.IsValid(file)) return new SaveOutcome(false, ErrSaveFailed, "bad slot name", string.Empty);
            string text;
            try
            {
                text = GameSerializer.Serialize(state, scenarioId);
            }
            catch (Exception e) when (e is InvalidOperationException || e is ArgumentException || e is IndexOutOfRangeException)
            {
                return new SaveOutcome(false, ErrSaveFailed, "serialise: " + e.Message, string.Empty);
            }

            SaveLoadResult check = GameSerializer.Deserialize(text);
            string hash = StateHasher.HashHex(state);
            if (!check.Ok || check.State == null || StateHasher.HashHex(check.State) != hash)
            {
                return new SaveOutcome(false, ErrSaveFailed, "the state did not read back identically", string.Empty);
            }

            if (!storage.TryWrite(file, text, out string? error)) return new SaveOutcome(false, ErrSaveFailed, error ?? "write failed", string.Empty);
            return new SaveOutcome(true, null, storage.Describe, hash);
        }

        public LoadOutcome Load(string slot)
        {
            string file = FileName(slot);
            if (!SaveNames.IsValid(file)) return new LoadOutcome(null, ErrLoadFailed, "bad slot name");
            if (!storage.Exists(file)) return new LoadOutcome(null, ErrNoSave, "no file " + file);
            if (!storage.TryRead(file, out string? text, out string? error) || text == null) return new LoadOutcome(null, ErrLoadFailed, error ?? "read failed");
            SaveLoadResult result = GameSerializer.Deserialize(text);
            if (!result.Ok || result.State == null) return new LoadOutcome(null, CodeFor(result.Errors), Describe(result.Errors));
            if (scenarioId.Length > 0 && !string.Equals(result.ScenarioId, scenarioId, StringComparison.Ordinal))
            {
                return new LoadOutcome(null, ErrOtherScenario, "saved for " + result.ScenarioId);
            }

            return new LoadOutcome(result.State, null, storage.Describe);
        }

        private static string CodeFor(IReadOnlyList<SaveError> errors)
        {
            foreach (SaveError e in errors)
            {
                if (e.Code == SaveFormat.NewerVersion) return ErrNewer;
            }

            return ErrDamaged;
        }

        private static string Describe(IReadOnlyList<SaveError> errors) => errors.Count == 0 ? "unreadable" : errors[0].ToString();
    }
}
