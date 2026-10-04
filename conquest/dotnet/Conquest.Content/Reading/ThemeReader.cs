using System;
using System.Collections.Generic;
using Conquest.Content.Json;
using Conquest.Content.Model;

namespace Conquest.Content.Reading
{
    /// <summary>Maps a parsed theme document onto <see cref="ThemeData"/> and an allow-list document onto <see cref="AllowListData"/>.</summary>
    public static class ThemeReader
    {
        public static ThemeData? Read(JsonNode root, ErrorSink errors)
        {
            ObjectReader? r = ObjectReader.Open(root, "$", errors);
            if (r == null)
            {
                return null;
            }

            string schema = r.Str("schema");
            string id = r.Str("id", ObjectReader.Slug);
            string version = r.Str("version", ObjectReader.SemVer);
            ObjectReader? req = r.Obj("requires_ruleset");
            string reqId = req?.Str("id", ObjectReader.Slug) ?? string.Empty;
            int reqMajor = req?.Int("major", 0, 99) ?? 0;
            req?.Finish();
            string locale = r.Str("default_locale");
            string displayName = r.Str("display_name");
            var factions = r.Members("factions", (key, n, p) => ReadFaction(key, n, p, errors));
            var labels = Names(r, "labels", true, errors);
            var terrain = Names(r, "terrain_assets", true, errors);
            var buildings = r.Members("building_assets", (key, n, p) => ReadRoleAsset(key, n, p, errors));
            var units = r.Members("unit_assets", (key, n, p) => ReadRoleAsset(key, n, p, errors));
            var planned = r.Strings("planned_assets");
            ObjectReader? cal = r.Obj("calendar");
            var seasonLabels = cal == null ? new List<NamedEntry>() : Names(cal, "season_labels", true, errors);
            cal?.Finish();
            ObjectReader? names = r.Obj("names");
            var sites = names == null ? new List<NamedEntry>() : Names(names, "sites", true, errors);
            var entries = names == null ? new List<NamedEntry>() : Names(names, "entries", true, errors);
            var regions = names == null ? new List<NamedEntry>() : Names(names, "regions", true, errors);
            names?.Finish();
            r.Finish();
            return new ThemeData(schema, id, version, reqId, reqMajor, locale, displayName, factions, labels, terrain, buildings,
                units, planned, seasonLabels, sites, entries, regions);
        }

        private static List<NamedEntry> Names(ObjectReader o, string key, bool required, ErrorSink errors)
        {
            return o.Members(key, (k, node, path) =>
            {
                if (node is JsonString s)
                {
                    return new NamedEntry(k, s.Value);
                }

                errors.Add(path, "schema.type", "expected a string", node);
                return null;
            }, required);
        }

        private static FactionStyle? ReadFaction(string key, JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            var f = new FactionStyle(key, o.Str("name"), o.Str("adjective"), o.Str("color"));
            o.Finish();
            return f;
        }

        private static RoleAsset? ReadRoleAsset(string key, JsonNode node, string path, ErrorSink errors)
        {
            ObjectReader? o = ObjectReader.Open(node, path, errors);
            if (o == null)
            {
                return null;
            }

            var a = new RoleAsset(key, o.Str("asset"), o.Str("glyph", ObjectReader.Slug));
            o.Finish();
            return a;
        }

        public static AllowListData? ReadAllowList(JsonNode root, ErrorSink errors)
        {
            ObjectReader? r = ObjectReader.Open(root, "$", errors);
            if (r == null)
            {
                return null;
            }

            string schema = r.Str("schema");
            if (schema != "allowlist/1")
            {
                errors.Add("$.schema", "schema.value", "expected 'allowlist/1'", root);
            }

            var entries = r.List("entries", (n, p) =>
            {
                ObjectReader? o = ObjectReader.Open(n, p, errors);
                if (o == null)
                {
                    return null;
                }

                var e = new AllowListEntry(o.Str("scope", ObjectReader.Slug), o.Str("path"), o.Str("word"), o.Str("reviewer"), o.Str("reason"));
                o.Finish();
                return e;
            });
            r.Finish();
            return new AllowListData(entries);
        }
    }
}
