using Conquest.Core.Contracts;
using Conquest.Core.Rules;

namespace Conquest.Core.Combat
{
    /// <summary>
    /// Settings a <see cref="CombatResolver"/> needs beyond the battle context. The attack kind, the protected-site flag, capture
    /// legality and the timed panic modifier now travel in <see cref="ICombatContext"/>; what remains is the battle rule set and
    /// the site-capture service.
    /// </summary>
    public sealed class CombatResolverOptions
    {
        public CombatResolverOptions(CombatRules? rules = null, ISiteCapture? siteCapture = null)
        {
            Rules = rules ?? CombatRules.Default;
            SiteCapture = siteCapture ?? SiteCaptureService.Instance;
        }

        public CombatRules Rules { get; }

        public ISiteCapture SiteCapture { get; }
    }
}
