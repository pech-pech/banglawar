namespace Conquest.Tests.Content;

/// <summary>
/// Pinned hashes of the shipped content (FNV-1a 64 over the canonical form: sorted keys, no notes, no
/// whitespace). Both values were first computed by an independent Python implementation and matched the C# result.
/// </summary>
internal static class GoldenHashes
{
    public const string Scenario = "b5f9e462a5ed113f";
    public const int ScenarioCanonicalLength = 6456;
    public const string Theme = "008cf239232673af";
    public const int ThemeCanonicalLength = 4108;
}
