using System.Text;
using System.Text.RegularExpressions;

namespace Conquest.Tests.Core;

/// <summary>One banned construct found in a source file.</summary>
internal sealed record ScanHit(string Rule, int Line, string Text)
{
    public override string ToString() => Rule + " line " + Line + ": " + Text.Trim();
}

/// <summary>
/// Source-level checks for the determinism bans (13 section 10.4): no floating point, no hash-code based logic, no clocks or
/// random numbers, no signed <c>%</c> or shifts outside the integer helpers, and no iteration over a dictionary or hash set.
/// Comments and string or character literals are blanked first, so words in them never count.
/// </summary>
internal static class SourceScanner
{
    private static readonly Regex Floats = new Regex(
        @"\b(float|double|decimal)\b|\bSystem\.(Single|Double|Decimal)\b|\bConvert\.To(Single|Double|Decimal)\b|\bMath\.(Sin|Cos|Tan|Atan2?|Sqrt|Pow|Exp|Log\d*|Floor|Ceiling|Round|Truncate|Cbrt)\b|(?<![\w.])\d+\.\d+([eE][+-]?\d+)?[fFdDmM]?\b|\b\d+[fFdDmM]\b",
        RegexOptions.Compiled);

    private static readonly Regex Clocks = new Regex(
        @"\bMath\.Random\b|\bnew\s+Random\b|\bRandom\.(Shared|Next)|\bGuid\.NewGuid\b|\bDateTime(Offset)?\b|\bStopwatch\b|\bEnvironment\.TickCount\b|\bTimeSpan\b|\bThread\.Sleep\b|\bTask\.Delay\b|\bUnityEngine\b|\bTime\.(time|deltaTime|unscaledTime|realtimeSinceStartup)\b|\bTimeZoneInfo\b",
        RegexOptions.Compiled);

    private static readonly Regex Operators = new Regex(@"\s%\s|%=|\s(>>|<<)=?\s", RegexOptions.Compiled);

    private static readonly Regex HashCodeCall = new Regex(@"\bGetHashCode\s*\(", RegexOptions.Compiled);

    private static readonly Regex HashCodeOverride = new Regex(@"override\s+int\s+GetHashCode", RegexOptions.Compiled);

    private static readonly Regex HashedCollection = new Regex(
        @"\b(Dictionary|HashSet|ConcurrentDictionary)\s*<[\w\s,.?]*(<[\w\s,.?]*>[\w\s,.?]*)?>\s+(?<name>\w+)\s*[;=,)]|\b(?<name2>\w+)\s*=\s*new\s+(Dictionary|HashSet)\s*<",
        RegexOptions.Compiled);

    public static string Strip(string source)
    {
        var sb = new StringBuilder(source.Length);
        int i = 0;
        while (i < source.Length)
        {
            char c = source[i];
            char next = i + 1 < source.Length ? source[i + 1] : '\0';
            if (c == '/' && next == '/')
            {
                while (i < source.Length && source[i] != '\n')
                {
                    sb.Append(' ');
                    i++;
                }
            }
            else if (c == '/' && next == '*')
            {
                i = Blank(source, sb, i, "*/");
            }
            else if (c == '"' || (c == '@' && next == '"') || (c == '$' && (next == '"' || next == '@')))
            {
                i = SkipString(source, sb, i);
            }
            else if (c == '\'' && i + 2 < source.Length)
            {
                i = SkipChar(source, sb, i);
            }
            else
            {
                sb.Append(c);
                i++;
            }
        }

        return sb.ToString();
    }

    private static int Blank(string s, StringBuilder sb, int start, string end)
    {
        int stop = s.IndexOf(end, start + 2, StringComparison.Ordinal);
        int to = stop < 0 ? s.Length : stop + end.Length;
        for (int k = start; k < to; k++)
        {
            sb.Append(s[k] == '\n' ? '\n' : ' ');
        }

        return to;
    }

    private static int SkipString(string s, StringBuilder sb, int start)
    {
        int i = start;
        bool verbatim = false;
        while (i < s.Length && s[i] != '"')
        {
            verbatim |= s[i] == '@';
            sb.Append(' ');
            i++;
        }

        sb.Append(' ');
        i++;
        while (i < s.Length)
        {
            if (!verbatim && s[i] == '\\')
            {
                sb.Append("  ");
                i += 2;
                continue;
            }

            if (s[i] == '"')
            {
                if (verbatim && i + 1 < s.Length && s[i + 1] == '"')
                {
                    sb.Append("  ");
                    i += 2;
                    continue;
                }

                sb.Append(' ');
                return i + 1;
            }

            sb.Append(s[i] == '\n' ? '\n' : ' ');
            i++;
        }

        return i;
    }

    private static int SkipChar(string s, StringBuilder sb, int start)
    {
        int end = s[start + 1] == '\\' ? s.IndexOf('\'', start + 3) : start + 2;
        if (end < 0 || end >= s.Length || s[end] != '\'' || end - start > 8)
        {
            sb.Append(s[start]);
            return start + 1;
        }

        for (int k = start; k <= end; k++)
        {
            sb.Append(' ');
        }

        return end + 1;
    }

    public static List<ScanHit> Scan(string source, bool allowUnsignedBitOps = false, bool allowHashCodeCalls = false)
    {
        string code = Strip(source);
        string[] lines = code.Split('\n');
        var hits = new List<ScanHit>();
        for (int n = 0; n < lines.Length; n++)
        {
            string line = lines[n];
            Add(hits, "float", Floats, line, n);
            Add(hits, "clock-or-random", Clocks, line, n);
            if (!allowUnsignedBitOps)
            {
                Add(hits, "raw-operator", Operators, line, n);
            }

            if (!allowHashCodeCalls && HashCodeCall.IsMatch(line) && !HashCodeOverride.IsMatch(line))
            {
                hits.Add(new ScanHit("get-hash-code", n + 1, line));
            }
        }

        hits.AddRange(Enumerations(code, lines));
        return hits;
    }

    private static void Add(List<ScanHit> hits, string rule, Regex pattern, string line, int index)
    {
        if (pattern.IsMatch(line))
        {
            hits.Add(new ScanHit(rule, index + 1, line));
        }
    }

    private static IEnumerable<ScanHit> Enumerations(string code, string[] lines)
    {
        var names = new List<string>();
        foreach (Match m in HashedCollection.Matches(code))
        {
            string name = m.Groups["name"].Success ? m.Groups["name"].Value : m.Groups["name2"].Value;
            if (name.Length > 0 && !names.Contains(name))
            {
                names.Add(name);
            }
        }

        foreach (string name in names)
        {
            string n = Regex.Escape(name);
            var use = new Regex(
                @"\bforeach\s*\([^)]*\bin\s+" + n + @"\b|\b" + n + @"\.(Keys|Values|Select|SelectMany|Where|ToList|ToArray|OrderBy|OrderByDescending|First|FirstOrDefault|Last|Skip|Take|Aggregate|ElementAt|GetEnumerator|Zip|Cast|Concat)\b|\b(AddRange|UnionWith|ExceptWith|CopyTo)\s*\(\s*" + n + @"\b",
                RegexOptions.Compiled);
            for (int i = 0; i < lines.Length; i++)
            {
                if (use.IsMatch(lines[i]))
                {
                    yield return new ScanHit("hashed-enumeration", i + 1, lines[i]);
                }
            }
        }
    }
}
