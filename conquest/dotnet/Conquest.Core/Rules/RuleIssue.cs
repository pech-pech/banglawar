namespace Conquest.Core.Rules
{
    /// <summary>A load-time problem found while checking rules or scenario data (spec 06 H0.3: never a silent no-op).</summary>
    public sealed class RuleIssue
    {
        public RuleIssue(string code, string path)
        {
            Code = code;
            Path = path;
        }

        /// <summary>Stable id such as <c>err.season_overlap</c>.</summary>
        public string Code { get; }

        /// <summary>JSON Pointer (RFC 6901) of the offending value.</summary>
        public string Path { get; }

        public override string ToString() => Code + " at " + Path;
    }
}
