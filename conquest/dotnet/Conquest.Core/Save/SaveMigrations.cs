namespace Conquest.Core.Save
{
    /// <summary>
    /// The place for version steps. Version 1 is the first format, so there is nothing to migrate yet. When the format changes:
    /// bump <see cref="SaveFormat.CurrentVersion"/>, add a step here that turns version N JSON into version N+1 JSON (before
    /// reading), add a round-trip test of the old document, and never edit an old golden file.
    /// </summary>
    public static class SaveMigrations
    {
        /// <summary>The oldest version this build can still read.</summary>
        public const int OldestReadable = 1;
    }
}
