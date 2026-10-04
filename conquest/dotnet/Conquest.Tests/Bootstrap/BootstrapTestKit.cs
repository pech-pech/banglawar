using Conquest.Bootstrap;
using Conquest.Content.Model;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Tests.Content;

namespace Conquest.Tests.Bootstrap;

internal static class BootstrapTestKit
{
    public const ulong Seed = 1971;

    public static BootResult Boot(ulong seed = Seed)
    {
        BootResult r = ScenarioBootstrapper.Boot(ContentTestData.Scenario(), seed);
        Assert.That(r.Errors, Is.Empty, string.Join("\n", r.Errors));
        return r;
    }

    public static BootResult BootMutated(Action<System.Text.Json.Nodes.JsonNode> edit, ulong seed = Seed)
    {
        var loaded = ContentTestData.LoadScenarioMutated(edit);
        Assert.That(loaded.Ok, Is.True, string.Join("\n", loaded.Errors.Select(e => e.ToString())));
        return ScenarioBootstrapper.Boot(loaded.Data!, seed);
    }

    public static IEnumerable<Unit> UnitsOf(GameState s, int owner) => s.UnitTable.Where(u => u.Owner == owner);
}
