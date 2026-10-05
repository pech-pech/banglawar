using System.Runtime.CompilerServices;

namespace Conquest.Tests.Core;

/// <summary>The determinism bans, enforced on the real source (13 section 10.4), and the scanner's own self-tests.</summary>
public class SourceScanTests
{
    private static string DotnetDir([CallerFilePath] string here = "") =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(here)!, "..", ".."));

    private static IEnumerable<string> Files(params string[] projects)
    {
        foreach (string project in projects)
        {
            string root = Path.Combine(DotnetDir(), project);
            Assert.That(Directory.Exists(root), Is.True, root);
            foreach (string file in Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories).OrderBy(f => f, StringComparer.Ordinal))
            {
                string rel = Path.GetRelativePath(DotnetDir(), file).Replace('\\', '/');
                if (!rel.Contains("/obj/") && !rel.Contains("/bin/"))
                {
                    yield return rel;
                }
            }
        }
    }

    /// <summary>Unsigned bit mixing is how the generators and the hash work; signed game maths never uses these files' operators.</summary>
    private static readonly string[] BitOpFiles =
    {
        "Conquest.Core/Rng/Rng.cs",
        "Conquest.Core/Combat/SplitMix64.cs",
        "Conquest.Core/Hashing/Fnv1a64.cs",
        "Conquest.Content/Json/Fnv1a64.cs",
    };

    /// <summary>Equality overrides of value types and the immutable array; nothing in the rules hashes with them.</summary>
    private static readonly string[] HashCodeFiles = { "Conquest.Core/Collections/ImmArray.cs" };

    private static string Report(string file, List<ScanHit> hits) => file + "\n  " + string.Join("\n  ", hits);

    [Test]
    public void The_simulation_projects_have_no_floats_clocks_random_or_hash_code_logic()
    {
        var failures = new List<string>();
        foreach (string file in Files("Conquest.Core", "Conquest.Bootstrap", "Conquest.Presentation", "Conquest.Ai"))
        {
            var hits = SourceScanner.Scan(File.ReadAllText(Path.Combine(DotnetDir(), file)), allowUnsignedBitOps: true, allowHashCodeCalls: HashCodeFiles.Contains(file))
                .Where(h => h.Rule != "raw-operator").ToList();
            if (hits.Count > 0)
            {
                failures.Add(Report(file, hits));
            }
        }

        Assert.That(failures, Is.Empty, string.Join("\n", failures));
    }

    [Test]
    public void Signed_remainders_and_shifts_go_through_IntMath()
    {
        var failures = new List<string>();
        foreach (string file in Files("Conquest.Core", "Conquest.Bootstrap", "Conquest.Presentation", "Conquest.Ai"))
        {
            if (BitOpFiles.Contains(file) || file == "Conquest.Core/IntMath.cs")
            {
                continue;
            }

            var hits = SourceScanner.Scan(File.ReadAllText(Path.Combine(DotnetDir(), file)), allowHashCodeCalls: true).Where(h => h.Rule == "raw-operator").ToList();
            if (hits.Count > 0)
            {
                failures.Add(Report(file, hits));
            }
        }

        Assert.That(failures, Is.Empty, string.Join("\n", failures));
    }

    [Test]
    public void No_dictionary_or_hash_set_is_ever_enumerated()
    {
        var failures = new List<string>();
        foreach (string file in Files("Conquest.Core", "Conquest.Bootstrap", "Conquest.Presentation", "Conquest.Content", "Conquest.Ai"))
        {
            var hits = SourceScanner.Scan(File.ReadAllText(Path.Combine(DotnetDir(), file)), allowUnsignedBitOps: true, allowHashCodeCalls: true)
                .Where(h => h.Rule == "hashed-enumeration").ToList();
            if (hits.Count > 0)
            {
                failures.Add(Report(file, hits));
            }
        }

        Assert.That(failures, Is.Empty, string.Join("\n", failures));
    }

    [Test]
    public void The_scan_sees_the_real_source_folders()
    {
        Assert.That(Files("Conquest.Core").Count(), Is.GreaterThan(60));
        Assert.That(Files("Conquest.Core"), Does.Contain("Conquest.Core/IntMath.cs"));
        Assert.That(Files("Conquest.Bootstrap"), Does.Contain("Conquest.Bootstrap/ScenarioBootstrapper.cs"));
        foreach (string allowed in BitOpFiles.Where(f => f.StartsWith("Conquest.Core", StringComparison.Ordinal)).Concat(HashCodeFiles))
        {
            Assert.That(File.Exists(Path.Combine(DotnetDir(), allowed)), Is.True, "allow-list entry " + allowed + " must exist");
        }
    }

    // ----- the scanner itself: it must catch what it claims to catch, and ignore what it should -----

    [TestCase("float x = 1;")]
    [TestCase("double y;")]
    [TestCase("var z = 1.5;")]
    [TestCase("var z = 2f;")]
    [TestCase("int a = (int)Math.Floor(q);")]
    [TestCase("var r = new Random(4);")]
    [TestCase("var t = DateTime.Now;")]
    [TestCase("var g = Guid.NewGuid();")]
    [TestCase("var w = Stopwatch.StartNew();")]
    [TestCase("int h = key.GetHashCode();")]
    [TestCase("int r = a % b;")]
    [TestCase("int r = a >> 1;")]
    [TestCase("int r = a << 3;")]
    [TestCase("a %= 3;")]
    [TestCase("using UnityEngine;")]
    public void The_scanner_flags_a_banned_construct(string line)
    {
        Assert.That(SourceScanner.Scan(line), Is.Not.Empty, line);
    }

    [TestCase("// float x = 1.5; DateTime a % b")]
    [TestCase("/* double y; */ int k = 1;")]
    [TestCase("string s = \"1.5 float DateTime % >> GetHashCode()\";")]
    [TestCase("string s = @\"a \"\"float\"\" \\ 2.5\";")]
    [TestCase("string s = $\"{x} % 2.5 double\";")]
    [TestCase("char c = '%';")]
    [TestCase("List<List<int>> x = null;")]
    [TestCase("ImmArray<Foo<Bar>> y;")]
    [TestCase("public override int GetHashCode() => 3;")]
    [TestCase("var v = a.Division / b;")]
    [TestCase("int x = 100;")]
    [TestCase("var s = version.Substring(1);")]
    public void The_scanner_ignores_comments_strings_generics_and_plain_integers(string line)
    {
        Assert.That(SourceScanner.Scan(line), Is.Empty, line);
    }

    [Test]
    public void Enumerating_a_dictionary_or_hash_set_is_flagged_but_looking_things_up_is_not()
    {
        string bad = "var d = new Dictionary<string, int>();\nforeach (var k in d) { }\n";
        string badKeys = "private readonly HashSet<int> seen = new HashSet<int>();\nvar list = seen.ToList();\n";
        string badValues = "Dictionary<int, int> map;\nvar v = map.Values;\n";
        string good = "var d = new Dictionary<string, int>();\nd[\"a\"] = 1;\nbool has = d.ContainsKey(\"a\");\nint n = d.Count;\nvar seen = new HashSet<int>();\nseen.Add(3);\nbool c = seen.Contains(3);\n";
        string otherNames = "var list = new List<int>();\nforeach (var x in list) { }\nvar y = list.ToArray();\n";

        Assert.That(SourceScanner.Scan(bad).Select(h => h.Rule), Does.Contain("hashed-enumeration"));
        Assert.That(SourceScanner.Scan(badKeys).Select(h => h.Rule), Does.Contain("hashed-enumeration"));
        Assert.That(SourceScanner.Scan(badValues).Select(h => h.Rule), Does.Contain("hashed-enumeration"));
        Assert.That(SourceScanner.Scan(good), Is.Empty);
        Assert.That(SourceScanner.Scan(otherNames), Is.Empty);
    }

    [Test]
    public void Stripping_keeps_line_numbers()
    {
        string source = "int a;\n/* two\nlines */\nfloat b;\n";

        ScanHit hit = SourceScanner.Scan(source).Single();

        Assert.That(hit.Line, Is.EqualTo(4));
    }

    [Test]
    public void Allow_flags_switch_off_only_their_own_rule()
    {
        Assert.That(SourceScanner.Scan("int r = a % b;", allowUnsignedBitOps: true), Is.Empty);
        Assert.That(SourceScanner.Scan("int h = k.GetHashCode();", allowHashCodeCalls: true), Is.Empty);
        Assert.That(SourceScanner.Scan("float f; int r = a % b;", allowUnsignedBitOps: true).Single().Rule, Is.EqualTo("float"));
    }
}
