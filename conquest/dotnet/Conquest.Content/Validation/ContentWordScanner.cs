using System;
using System.Collections.Generic;
using System.Text;
using Conquest.Content.Json;
using Conquest.Content.Model;

namespace Conquest.Content.Validation
{
    /// <summary>
    /// Scans every key and string of a content document for words the content rules forbid (docs 05 section 9
    /// V-01..V-13 and 06 section 5 check 5), and lets a reviewed allow-list excuse exact (path, word) pairs.
    /// Keys are scanned for the civilian-state words only (keys are neutral ids); values for every category.
    /// </summary>
    public static class ContentWordScanner
    {
        private sealed class Rule
        {
            public Rule(string category, string[] exact, string[] prefixes, string[] phrases, bool keysToo = false, bool themeOnly = false)
            {
                Category = category;
                Exact = exact;
                Prefixes = prefixes;
                Phrases = phrases;
                KeysToo = keysToo;
                ThemeOnly = themeOnly;
            }

            public string Category { get; }

            public string[] Exact { get; }

            public string[] Prefixes { get; }

            public string[] Phrases { get; }

            public bool KeysToo { get; }

            public bool ThemeOnly { get; }
        }

        private static readonly string[] None = new string[0];

        /// <summary>Prefixes that only matter in keys (state and event names); "Village grove" is a fine label.</summary>
        private static readonly string[] KeyOnlyPrefixes = { "villag" };

        private static readonly Rule[] Rules =
        {
            new Rule("civilian_state",
                new[] { "civilian", "civilians", "refugee", "refugees", "resident", "residents", "inhabitant", "inhabitants",
                        "citizen", "citizens", "townsfolk", "famine", "massacre", "massacres", "reprisal", "reprisals",
                        "hostage", "hostages", "prisoner", "prisoners", "tribute", "plunder", "loot",
                        "villager", "villagers" },
                new[] { "starv", "atrocit", "execut" },
                new[] { "kill count", "body count", "death toll" }, keysToo: true),
            new Rule("colonial",
                new[] { "tax", "taxes", "taxed", "taxation" },
                new[] { "colon", "settl" }, None),
            new Rule("loaded_word",
                new[] { "enemy", "enemies", "invader", "invaders", "occupier", "occupiers", "oppressor", "oppressors",
                        "horde", "hordes", "vermin" },
                new[] { "terror", "barbar", "butcher", "savage", "slaughter" }, None),
            new Rule("religion",
                new[] { "mosque", "temple", "church", "prayer", "hindu", "muslim", "christian", "jihad", "crusade" }, None, None),
            new Rule("paramilitary_name",
                new[] { "razakar", "mujahid" }, None, new[] { "al badr", "al shams" }),
            new Rule("slogan", None, None, new[] { "joy bangla" }),
            new Rule("person_word",
                new[] { "people", "person", "persons", "population", "man", "men", "woman", "women", "child", "children", "crowd" },
                None, None),
            new Rule("depiction",
                new[] { "face", "faces", "portrait", "portraits", "photo", "photos", "flag", "flags", "banner", "banners",
                        "insignia", "emblem", "emblems", "crest", "crests", "crescent", "lettering" },
                new[] { "photograph" }, new[] { "red cross", "red crystal" }),
            new Rule("weapon",
                new[] { "weapon", "weapons", "gun", "guns", "gunboat", "gunboats", "rifle", "rifles", "tank", "tanks",
                        "cannon", "cannons", "bomb", "bombs", "grenade", "grenades", "missile", "missiles", "bayonet",
                        "sword", "swords", "pistol", "pistols", "ammunition", "mortar", "mortars", "artillery",
                        "armoured", "armored" },
                None, None),
            new Rule("town_wording", new[] { "town", "towns" }, None, None, themeOnly: true),
        };

        /// <summary>
        /// Scans <paramref name="root"/>. <paramref name="scope"/> selects the allow-list entries that apply
        /// ("scenario" or "theme"). Stale allow-list entries of that scope are reported too.
        /// </summary>
        public static void Scan(JsonNode root, string scope, AllowListData allow, ErrorSink errors)
        {
            var used = new HashSet<int>();
            Walk(root, "$", scope, allow, errors, used);
            for (int i = 0; i < allow.Entries.Count; i++)
            {
                AllowListEntry e = allow.Entries[i];
                if (e.Scope != scope)
                {
                    continue;
                }

                if (!used.Contains(i))
                {
                    errors.Add(e.Path, "allowlist.stale", "allow-list entry for '" + e.Word + "' matches nothing; remove it");
                }

                if (string.IsNullOrWhiteSpace(e.Reviewer) || string.IsNullOrWhiteSpace(e.Reason))
                {
                    errors.Add(e.Path, "allowlist.unreviewed", "allow-list entry needs a reviewer and a reason");
                }
            }
        }

        private static void Walk(JsonNode node, string path, string scope, AllowListData allow, ErrorSink errors, HashSet<int> used)
        {
            switch (node)
            {
                case JsonObject obj:
                    foreach (KeyValuePair<string, JsonNode> m in obj.Members)
                    {
                        string childPath = path + "." + m.Key;
                        Check(m.Key, childPath, true, scope, allow, errors, used, m.Value);
                        Walk(m.Value, childPath, scope, allow, errors, used);
                    }

                    break;
                case JsonArray arr:
                    for (int i = 0; i < arr.Items.Count; i++)
                    {
                        Walk(arr.Items[i], path + "[" + i + "]", scope, allow, errors, used);
                    }

                    break;
                case JsonString s:
                    Check(s.Value, path, false, scope, allow, errors, used, s);
                    break;
            }
        }

        private static void Check(string text, string path, bool isKey, string scope, AllowListData allow, ErrorSink errors, HashSet<int> used, JsonNode at)
        {
            List<string> tokens = Tokens(text);
            string phraseText = " " + string.Join(" ", tokens) + " ";
            foreach (Rule rule in Rules)
            {
                if ((isKey && !rule.KeysToo) || (rule.ThemeOnly && scope != "theme"))
                {
                    continue;
                }

                foreach (string word in Hits(rule, tokens, phraseText, isKey))
                {
                    int allowed = FindAllowed(allow, scope, path, word);
                    if (allowed >= 0)
                    {
                        used.Add(allowed);
                        continue;
                    }

                    errors.Add(path, "content.forbidden_word", "'" + word + "' (" + rule.Category + ") is not allowed here", at);
                }
            }
        }

        private static IEnumerable<string> Hits(Rule rule, List<string> tokens, string phraseText, bool isKey)
        {
            var found = new List<string>();
            foreach (string token in tokens)
            {
                if (isKey && rule.KeysToo && Array.Exists(KeyOnlyPrefixes, p => token.StartsWith(p, StringComparison.Ordinal)))
                {
                    found.Add(token);
                    continue;
                }

                if (Array.IndexOf(rule.Exact, token) >= 0)
                {
                    found.Add(token);
                    continue;
                }

                foreach (string prefix in rule.Prefixes)
                {
                    if (token.StartsWith(prefix, StringComparison.Ordinal))
                    {
                        found.Add(token);
                        break;
                    }
                }
            }

            foreach (string phrase in rule.Phrases)
            {
                if (phraseText.Contains(" " + phrase + " "))
                {
                    found.Add(phrase);
                }
            }

            return found;
        }

        private static int FindAllowed(AllowListData allow, string scope, string path, string word)
        {
            for (int i = 0; i < allow.Entries.Count; i++)
            {
                AllowListEntry e = allow.Entries[i];
                if (e.Scope == scope && e.Path == path && string.Equals(e.Word, word, StringComparison.OrdinalIgnoreCase))
                {
                    return i;
                }
            }

            return -1;
        }

        /// <summary>Lower-case letter and digit runs; every other character separates tokens.</summary>
        public static List<string> Tokens(string text)
        {
            var tokens = new List<string>();
            var sb = new StringBuilder();
            foreach (char c in text)
            {
                if (char.IsLetterOrDigit(c))
                {
                    sb.Append(char.ToLowerInvariant(c));
                }
                else if (sb.Length > 0)
                {
                    tokens.Add(sb.ToString());
                    sb.Clear();
                }
            }

            if (sb.Length > 0)
            {
                tokens.Add(sb.ToString());
            }

            return tokens;
        }
    }
}
