using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Conquest.Content.Model;

namespace Conquest.Content.Validation
{
    /// <summary>
    /// Meaning checks for a theme pack: coverage of every role, the pinned faction names, asset references
    /// that resolve against the asset manifest (or are declared as planned), and, when a scenario is given,
    /// a display name for every opaque id the scenario uses. Words are checked by <see cref="ContentWordScanner"/>.
    /// </summary>
    public static class ThemeValidator
    {
        public const string OpposingSideNamePin = "Pakistan Army, Eastern Command";

        private static readonly Regex Color = new Regex("^#[0-9a-f]{6}$", RegexOptions.CultureInvariant);
        private static readonly Regex AssetKey = new Regex("^(tile|bld|u)\\.[a-z][a-z0-9_]*$", RegexOptions.CultureInvariant);

        public const int MaxLabelLength = 60;

        /// <param name="manifestKeys">Role-level keys the asset manifest holds, or null to skip that check.</param>
        public static void Validate(ThemeData t, ScenarioData? scenario, IReadOnlyCollection<string>? manifestKeys, ErrorSink errors)
        {
            CheckHeader(t, errors);
            CheckFactions(t, errors);
            CheckLabels(t, errors);
            CheckAssets(t, scenario, manifestKeys, errors);
            if (scenario != null)
            {
                CheckScenarioNames(t, scenario, errors);
            }
        }

        private static void CheckHeader(ThemeData t, ErrorSink errors)
        {
            if (t.Schema != "theme/1")
            {
                errors.Add("$.schema", "theme.schema", "expected 'theme/1'");
            }

            if (t.RequiresRuleset != "conquest-core" || t.RequiresMajor != 1)
            {
                errors.Add("$.requires_ruleset", "theme.requires", "only conquest-core major 1 is supported");
            }

            if (t.DefaultLocale != "en")
            {
                errors.Add("$.default_locale", "theme.locale", "the only shipped locale is 'en'");
            }

            if (string.IsNullOrWhiteSpace(t.DisplayName))
            {
                errors.Add("$.display_name", "theme.display_name", "the theme needs a display name");
            }
        }

        private static void CheckFactions(ThemeData t, ErrorSink errors)
        {
            FactionStyle? f1 = null;
            FactionStyle? f2 = null;
            foreach (FactionStyle f in t.Factions)
            {
                if (f.Slot == "f1")
                {
                    f1 = f;
                }
                else if (f.Slot == "f2")
                {
                    f2 = f;
                }

                if (!Color.IsMatch(f.Color))
                {
                    errors.Add("$.factions." + f.Slot + ".color", "theme.color", "expected a lower-case #rrggbb colour");
                }

                if (string.IsNullOrWhiteSpace(f.Name) || string.IsNullOrWhiteSpace(f.Adjective))
                {
                    errors.Add("$.factions." + f.Slot, "theme.faction_name", "a faction needs a name and an adjective");
                }
            }

            if (f1 == null || f2 == null)
            {
                errors.Add("$.factions", "theme.faction_missing", "factions f1 and f2 are both required");
                return;
            }

            if (f2.Name != OpposingSideNamePin)
            {
                errors.Add("$.factions.f2.name", "theme.f2_name_pin", "the opposing side's name is pinned to '" + OpposingSideNamePin + "'");
            }

            if (f1.Color == f2.Color)
            {
                errors.Add("$.factions.f2.color", "theme.color", "the two sides need different colours");
            }
        }

        private static void CheckLabels(ThemeData t, ErrorSink errors)
        {
            var bases = new HashSet<string>();
            foreach (NamedEntry label in t.Labels)
            {
                string path = "$.labels." + label.Key;
                string role = label.Key;
                int at = label.Key.IndexOf('@');
                if (at >= 0)
                {
                    role = label.Key.Substring(0, at);
                    string slot = label.Key.Substring(at + 1);
                    if (slot != "f2")
                    {
                        errors.Add(path, "theme.label_key", "only the @f2 wording override exists");
                    }
                }
                else
                {
                    bases.Add(role);
                }

                if (!Vocabulary.AllRoles().Contains(role))
                {
                    errors.Add(path, "theme.label_key", "'" + role + "' is not a role id");
                }

                if (string.IsNullOrWhiteSpace(label.Value) || label.Value.Length > MaxLabelLength)
                {
                    errors.Add(path, "theme.label_text", "a label is 1.." + MaxLabelLength + " characters");
                }
            }

            foreach (string role in Vocabulary.AllRoles())
            {
                if (!bases.Contains(role))
                {
                    errors.Add("$.labels", "theme.label_missing", "no label for role " + role);
                }
            }
        }

        private static void CheckAssets(ThemeData t, ScenarioData? scenario, IReadOnlyCollection<string>? manifest, ErrorSink errors)
        {
            var planned = new HashSet<string>(t.PlannedAssets);
            var referenced = new SortedSet<string>(System.StringComparer.Ordinal);
            foreach (NamedEntry a in t.TerrainAssets)
            {
                if (!Vocabulary.IsKnownLook(a.Key))
                {
                    errors.Add("$.terrain_assets." + a.Key, "theme.look", "unknown look '" + a.Key + "'");
                }

                CheckKey(a.Value, "tile", "$.terrain_assets." + a.Key, referenced, errors);
            }

            if (scenario != null)
            {
                foreach (LegendEntry l in scenario.Map.Legend)
                {
                    if (t.FindName(t.TerrainAssets, l.Look) == null)
                    {
                        errors.Add("$.terrain_assets", "theme.asset_coverage", "no tile asset for look '" + l.Look + "' used by the map");
                    }
                }
            }

            CheckRoleAssets(t.BuildingAssets, Vocabulary.Buildings, "bld", "$.building_assets", referenced, errors);
            CheckRoleAssets(t.UnitAssets, Vocabulary.Units, "u", "$.unit_assets", referenced, errors);
            CheckPlanned(t, planned, referenced, manifest, errors);
        }

        private static void CheckRoleAssets(IReadOnlyList<RoleAsset> assets, string[] roles, string kind, string path, SortedSet<string> referenced, ErrorSink errors)
        {
            var seen = new HashSet<string>();
            foreach (RoleAsset a in assets)
            {
                seen.Add(a.Role);
                if (!Vocabulary.Contains(roles, a.Role))
                {
                    errors.Add(path + "." + a.Role, "theme.asset_role", "'" + a.Role + "' is not a " + kind + " role");
                }

                CheckKey(a.Asset, kind, path + "." + a.Role + ".asset", referenced, errors);
            }

            foreach (string role in roles)
            {
                if (!seen.Contains(role))
                {
                    errors.Add(path, "theme.asset_coverage", "no asset binding for " + role);
                }
            }
        }

        private static void CheckKey(string key, string kind, string path, SortedSet<string> referenced, ErrorSink errors)
        {
            if (!AssetKey.IsMatch(key) || !key.StartsWith(kind + ".", System.StringComparison.Ordinal))
            {
                errors.Add(path, "theme.asset_key", "'" + key + "' is not a " + kind + ".<role> asset key");
                return;
            }

            referenced.Add(key);
        }

        private static void CheckPlanned(ThemeData t, HashSet<string> planned, SortedSet<string> referenced, IReadOnlyCollection<string>? manifest, ErrorSink errors)
        {
            for (int i = 0; i < t.PlannedAssets.Count; i++)
            {
                string key = t.PlannedAssets[i];
                string p = "$.planned_assets[" + i + "]";
                if (!referenced.Contains(key))
                {
                    errors.Add(p, "theme.planned_unknown", "'" + key + "' is planned but no binding uses it");
                }

                if (manifest != null && ContainsKey(manifest, key))
                {
                    errors.Add(p, "theme.planned_stale", "'" + key + "' is already in the manifest; remove it from planned_assets");
                }
            }

            if (manifest == null)
            {
                return;
            }

            foreach (string key in referenced)
            {
                if (!ContainsKey(manifest, key) && !planned.Contains(key))
                {
                    errors.Add("$", "theme.asset_missing", "asset '" + key + "' is not in the manifest and not listed in planned_assets");
                }
            }
        }

        private static bool ContainsKey(IReadOnlyCollection<string> manifest, string key)
        {
            foreach (string k in manifest)
            {
                if (k == key)
                {
                    return true;
                }
            }

            return false;
        }

        private static void CheckScenarioNames(ThemeData t, ScenarioData s, ErrorSink errors)
        {
            var siteIds = new List<string>();
            foreach (PrePlacedBase b in s.PrePlacedBases)
            {
                siteIds.Add(b.SiteId);
            }

            var entryIds = new List<string>();
            foreach (EntryGroupData g in s.EntryGroups)
            {
                entryIds.Add(g.Id);
            }

            var regionIds = new List<string>();
            foreach (RegionData r in s.Regions)
            {
                regionIds.Add(r.Id);
            }

            var seasonIds = new List<string>();
            foreach (SeasonDefinition d in s.SeasonTable)
            {
                seasonIds.Add(d.Id);
            }

            CheckNames(t.SiteNames, siteIds, "$.names.sites", true, errors);
            CheckNames(t.EntryNames, entryIds, "$.names.entries", false, errors);
            CheckNames(t.RegionNames, regionIds, "$.names.regions", false, errors);
            CheckNames(t.SeasonLabels, seasonIds, "$.calendar.season_labels", false, errors);
            if (s.ThemeHint != t.Id)
            {
                errors.Add("$.id", "theme.hint", "scenario hints theme '" + s.ThemeHint + "' but this is '" + t.Id + "'");
            }
        }

        private static void CheckNames(IReadOnlyList<NamedEntry> names, List<string> ids, string path, bool unique, ErrorSink errors)
        {
            var values = new HashSet<string>();
            foreach (NamedEntry n in names)
            {
                if (!ids.Contains(n.Key))
                {
                    errors.Add(path + "." + n.Key, "theme.name_unknown", "'" + n.Key + "' is not an id the scenario uses");
                }

                if (string.IsNullOrWhiteSpace(n.Value))
                {
                    errors.Add(path + "." + n.Key, "theme.name_empty", "a display name cannot be empty");
                }
                else if (unique && !values.Add(n.Value))
                {
                    errors.Add(path + "." + n.Key, "theme.name_duplicate", "display name '" + n.Value + "' is used twice");
                }
            }

            foreach (string id in ids)
            {
                if (!ContainsName(names, id))
                {
                    errors.Add(path, "theme.name_missing", "no display name for " + id);
                }
            }
        }

        private static bool ContainsName(IReadOnlyList<NamedEntry> names, string id)
        {
            foreach (NamedEntry n in names)
            {
                if (n.Key == id)
                {
                    return true;
                }
            }

            return false;
        }
    }
}
