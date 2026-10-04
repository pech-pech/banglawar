namespace Conquest.Presentation
{
    /// <summary>One playable clip found in the asset manifest.</summary>
    public sealed class ClipInfo
    {
        /// <summary>The manifest key that was actually found (after the fallback chain).</summary>
        public string Key { get; }

        /// <summary>The state of the key that was found; differs from the requested state on a fallback hit.</summary>
        public string? State { get; }
        public int Frames { get; }
        public int Fps { get; }
        public bool Loop { get; }

        public ClipInfo(string key, string? state, int frames, int fps, bool loop)
        {
            Key = key;
            State = state;
            Frames = frames;
            Fps = fps;
            Loop = loop;
        }

        public int DurationMs => Frames <= 1 || Fps <= 0 ? 0 : Frames * 1000 / Fps;
    }

    /// <summary>
    /// Looks up a clip in the asset manifest, applying the key fallback chain (variant, state, level, slot
    /// dropped in that order of cost). The real implementation lives with the asset importer
    /// (Conquest.Assets); tests use a fake. Returns null when nothing in the chain exists.
    /// </summary>
    public interface IClipCatalog
    {
        ClipInfo? Find(string kind, string role, string? state, string? slot, Facing renderDirection);
    }
}
