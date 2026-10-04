using System.Collections.Generic;
using Conquest.Core.Json;
using Conquest.Core.Turn;

namespace Conquest.Core.Save
{
    /// <summary>
    /// The save format (13 section 9). <see cref="Serialize"/> writes a canonical, versioned JSON document (fixed key order, no
    /// whitespace, integers only, 64-bit unsigned values as decimal strings) that includes the state hash;
    /// <see cref="Deserialize"/> reads it back, never throws, and refuses a save whose hash does not match its content. Saving
    /// is only done in the orders phase by the caller; selection, camera and hover are not part of a save.
    /// </summary>
    public static class GameSerializer
    {
        public static string Serialize(GameState state, string scenarioId = "")
        {
            var w = new JsonText();
            w.BeginObject().Str("format", SaveFormat.Magic).Int("version", SaveFormat.CurrentVersion);
            w.Str("scenario", scenarioId).Str("state_hash", StateHasher.HashHex(state));
            GameStateWriter.Write(w, state);
            return w.EndObject().ToString();
        }

        public static SaveLoadResult Deserialize(string text)
        {
            var errors = new List<SaveError>();
            JsonParseResult parsed = StrictJson.Parse(text);
            if (!parsed.Ok)
            {
                JsonError e = parsed.Error!;
                errors.Add(new SaveError(e.Pointer, SaveFormat.BadJson, e.Message + " (line " + e.Line + ", column " + e.Column + ")"));
                return new SaveLoadResult(null, string.Empty, 0, errors);
            }

            ObjectView? root = ObjectView.Of(parsed.Root, errors);
            return root == null ? new SaveLoadResult(null, string.Empty, 0, errors) : ReadEnvelope(root, errors);
        }

        private static SaveLoadResult ReadEnvelope(ObjectView root, List<SaveError> errors)
        {
            string magic = root.Str("format");
            int version = root.Int("version", int.MinValue, int.MaxValue);
            if (magic != SaveFormat.Magic)
            {
                root.Fail("format", SaveFormat.BadMagic, "not a game save");
                return new SaveLoadResult(null, string.Empty, version, errors);
            }

            if (version > SaveFormat.CurrentVersion)
            {
                root.Fail("version", SaveFormat.NewerVersion, "saved by a newer version (" + version + "); this build reads up to " + SaveFormat.CurrentVersion);
                return new SaveLoadResult(null, string.Empty, version, errors);
            }

            if (version < 1)
            {
                root.Fail("version", SaveFormat.OldVersion, "unsupported save version " + version);
                return new SaveLoadResult(null, string.Empty, version, errors);
            }

            string scenario = root.Str("scenario");
            string hash = root.Str("state_hash");
            ObjectView? stateView = root.Child("state");
            GameState? state = stateView == null ? null : GameStateReader.Read(stateView, errors);
            root.Finish();
            if (state != null && errors.Count == 0 && !string.Equals(StateHasher.HashHex(state), hash, System.StringComparison.Ordinal))
            {
                root.Fail("state_hash", SaveFormat.HashMismatch, "the saved state does not match its hash");
                state = null;
            }

            return new SaveLoadResult(errors.Count == 0 ? state : null, scenario, version, errors);
        }
    }
}
