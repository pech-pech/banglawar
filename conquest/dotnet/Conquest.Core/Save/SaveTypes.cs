using System.Collections.Generic;
using Conquest.Core.Turn;

namespace Conquest.Core.Save
{
    /// <summary>A problem found while reading a save: the JSON Pointer, a stable <c>save.*</c> code and a message.</summary>
    public sealed class SaveError
    {
        public SaveError(string pointer, string code, string message)
        {
            Pointer = pointer;
            Code = code;
            Message = message;
        }

        public string Pointer { get; }

        public string Code { get; }

        public string Message { get; }

        public override string ToString() => Code + " at " + (Pointer.Length == 0 ? "/" : Pointer) + ": " + Message;
    }

    /// <summary>The result of reading a save. <c>State</c> is null when <c>Errors</c> is not empty. Never thrown, always returned.</summary>
    public sealed class SaveLoadResult
    {
        public SaveLoadResult(GameState? state, string scenarioId, int version, IReadOnlyList<SaveError> errors)
        {
            State = state;
            ScenarioId = scenarioId;
            Version = version;
            Errors = errors;
        }

        public bool Ok => State != null && Errors.Count == 0;

        public GameState? State { get; }

        /// <summary>The scenario id the save was made from (informational; the caller reloads the scenario's services from it).</summary>
        public string ScenarioId { get; }

        public int Version { get; }

        public IReadOnlyList<SaveError> Errors { get; }
    }

    /// <summary>Codes and constants of the save format (13 section 9).</summary>
    public static class SaveFormat
    {
        /// <summary>The version this build writes and reads. Bump it and add a step to <see cref="SaveMigrations"/> on every format change.</summary>
        public const int CurrentVersion = 1;

        public const string Magic = "conquest.save";

        public const string BadJson = "save.bad_json";
        public const string BadShape = "save.bad_shape";
        public const string BadMagic = "save.bad_magic";
        public const string NewerVersion = "save.newer_version";
        public const string OldVersion = "save.unsupported_version";
        public const string BadValue = "save.bad_value";
        public const string BadOrder = "save.bad_order";
        public const string BadReference = "save.bad_reference";
        public const string UnknownKey = "save.unknown_key";
        public const string HashMismatch = "save.hash_mismatch";
    }
}
