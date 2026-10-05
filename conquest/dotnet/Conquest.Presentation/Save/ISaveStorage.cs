namespace Conquest.Presentation
{
    /// <summary>
    /// Where save text lives. Every member answers with a flag and never throws: a full disk, a read-only folder or a
    /// file another program holds is an ordinary answer, not a crash in the player's face.
    /// </summary>
    public interface ISaveStorage
    {
        /// <summary>A short description for logs (a folder path or "memory").</summary>
        string Describe { get; }

        bool Exists(string name);

        /// <summary>Reads a whole file. On failure <paramref name="text"/> is null and <paramref name="error"/> says why.</summary>
        bool TryRead(string name, out string? text, out string? error);

        /// <summary>Writes a whole file so a reader never sees half of it. On failure the old file is left as it was.</summary>
        bool TryWrite(string name, string text, out string? error);
    }
}
