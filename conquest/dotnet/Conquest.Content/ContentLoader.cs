using System.Collections.Generic;
using Conquest.Content.Json;
using Conquest.Content.Model;
using Conquest.Content.Reading;
using Conquest.Content.Validation;

namespace Conquest.Content
{
    /// <summary>The outcome of loading one content file. <see cref="Data"/> is set only when <see cref="Ok"/>.</summary>
    public sealed class LoadResult<T>
        where T : class
    {
        public LoadResult(T? data, IReadOnlyList<ContentError> errors, string canonical, ulong hash)
        {
            Data = data;
            Errors = errors;
            Canonical = canonical;
            Hash = hash;
        }

        public bool Ok => Errors.Count == 0 && Data != null;

        public T? Data { get; }

        public IReadOnlyList<ContentError> Errors { get; }

        /// <summary>Canonical text of the document (sorted keys, no notes); empty unless the load succeeded.</summary>
        public string Canonical { get; }

        /// <summary>FNV-1a 64 over the UTF-8 bytes of <see cref="Canonical"/>; 0 unless the load succeeded.</summary>
        public ulong Hash { get; }

        public string HashHex => Fnv1a64.Hex(Hash);
    }

    /// <summary>
    /// Strict loaders: parse, map onto DTOs, validate meaning, scan words, and hash. None of them throws on bad
    /// content; every problem comes back as a <see cref="ContentError"/> with a JSON path.
    /// </summary>
    public static class ContentLoader
    {
        public static LoadResult<ScenarioData> LoadScenario(string text, AllowListData? allow = null)
        {
            return Load(text, allow ?? AllowListData.Empty, "scenario",
                (root, errors) => ScenarioReader.Read(root, errors),
                (data, errors) => ScenarioValidator.Validate(data, errors));
        }

        /// <param name="scenario">The scenario the theme is paired with; null skips the cross-checks.</param>
        /// <param name="manifestKeys">Role-level asset keys the manifest holds; null skips the asset-existence check.</param>
        public static LoadResult<ThemeData> LoadTheme(string text, ScenarioData? scenario, IReadOnlyCollection<string>? manifestKeys, AllowListData? allow = null)
        {
            return Load(text, allow ?? AllowListData.Empty, "theme",
                (root, errors) => ThemeReader.Read(root, errors),
                (data, errors) => ThemeValidator.Validate(data, scenario, manifestKeys, errors));
        }

        public static LoadResult<AllowListData> LoadAllowList(string text)
        {
            if (!StrictJsonParser.TryParse(text, out JsonNode? root, out ContentError? parseError))
            {
                return new LoadResult<AllowListData>(null, new List<ContentError> { parseError! }, string.Empty, 0);
            }

            var sink = new ErrorSink();
            AllowListData? data = ThemeReader.ReadAllowList(root!, sink);
            return Finish(data, root!, sink);
        }

        private static LoadResult<T> Load<T>(
            string text,
            AllowListData allow,
            string scope,
            System.Func<JsonNode, ErrorSink, T?> read,
            System.Action<T, ErrorSink> validate)
            where T : class
        {
            if (!StrictJsonParser.TryParse(text, out JsonNode? root, out ContentError? parseError))
            {
                return new LoadResult<T>(null, new List<ContentError> { parseError! }, string.Empty, 0);
            }

            var sink = new ErrorSink();
            T? data = read(root!, sink);
            if (data != null && sink.Count == 0)
            {
                validate(data, sink);
                ContentWordScanner.Scan(root!, scope, allow, sink);
            }

            return Finish(data, root!, sink);
        }

        private static LoadResult<T> Finish<T>(T? data, JsonNode root, ErrorSink sink)
            where T : class
        {
            if (sink.Count > 0 || data == null)
            {
                return new LoadResult<T>(null, sink.Errors, string.Empty, 0);
            }

            string canonical = CanonicalJson.Write(root);
            return new LoadResult<T>(data, sink.Errors, canonical, Fnv1a64.Hash(canonical));
        }
    }
}
