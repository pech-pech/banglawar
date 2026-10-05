using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Conquest.Presentation
{
    /// <summary>Files in one folder. A write goes to a temporary file first and is then moved over the target.</summary>
    public sealed class DirectorySaveStorage : ISaveStorage
    {
        private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);
        private readonly string directory;

        public DirectorySaveStorage(string directory)
        {
            this.directory = directory ?? throw new ArgumentNullException(nameof(directory));
        }

        public string Describe => directory;

        public bool Exists(string name)
        {
            try
            {
                return File.Exists(PathOf(name));
            }
            catch (Exception e) when (IsFileProblem(e))
            {
                return false;
            }
        }

        public bool TryRead(string name, out string? text, out string? error)
        {
            text = null;
            error = null;
            try
            {
                text = File.ReadAllText(PathOf(name), Utf8);
                return true;
            }
            catch (Exception e) when (IsFileProblem(e))
            {
                error = e.GetType().Name + ": " + e.Message;
                return false;
            }
        }

        public bool TryWrite(string name, string text, out string? error)
        {
            error = null;
            string target = PathOf(name, out string temp);
            try
            {
                Directory.CreateDirectory(directory);
                File.WriteAllText(temp, text, Utf8);
                if (File.Exists(target)) File.Delete(target);
                File.Move(temp, target);
                return true;
            }
            catch (Exception e) when (IsFileProblem(e))
            {
                error = e.GetType().Name + ": " + e.Message;
                TryDelete(temp);
                return false;
            }
        }

        private string PathOf(string name) => PathOf(name, out _);

        private string PathOf(string name, out string temp)
        {
            if (!SaveNames.IsValid(name)) throw new ArgumentException("bad file name", nameof(name));
            temp = Path.Combine(directory, name + ".tmp");
            return Path.Combine(directory, name);
        }

        private static void TryDelete(string path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch (Exception e) when (IsFileProblem(e))
            {
                // a leftover temporary file is harmless; the next write replaces it
            }
        }

        private static bool IsFileProblem(Exception e) =>
            e is IOException || e is UnauthorizedAccessException || e is System.Security.SecurityException || e is NotSupportedException || e is ArgumentException;
    }

    /// <summary>Files kept in memory: the last resort when no folder can be written, and the test double.</summary>
    public sealed class MemorySaveStorage : ISaveStorage
    {
        private readonly Dictionary<string, string> files = new Dictionary<string, string>(StringComparer.Ordinal);

        public string Describe => "memory";

        public int Count => files.Count;

        public bool Exists(string name) => files.ContainsKey(name);

        public bool TryRead(string name, out string? text, out string? error)
        {
            error = null;
            if (files.TryGetValue(name, out string? value))
            {
                text = value;
                return true;
            }

            text = null;
            error = "missing";
            return false;
        }

        public bool TryWrite(string name, string text, out string? error)
        {
            error = null;
            files[name] = text;
            return true;
        }

        /// <summary>Test helper: replaces a file's text directly (to damage a save).</summary>
        public void Overwrite(string name, string text) => files[name] = text;
    }

    /// <summary>
    /// Tries storages in order. A write goes to the first one that accepts it and that storage is then read first, so a
    /// player whose primary folder is unwritable still saves and loads in the same session. Never throws.
    /// </summary>
    public sealed class FallbackSaveStorage : ISaveStorage
    {
        private readonly ISaveStorage[] chain;
        private int active;

        public FallbackSaveStorage(params ISaveStorage[] chain)
        {
            if (chain == null || chain.Length == 0) throw new ArgumentException("at least one storage is needed", nameof(chain));
            this.chain = chain;
        }

        public string Describe => chain[active].Describe;

        /// <summary>Index of the storage that took the last write (0 until a write has to fall back).</summary>
        public int ActiveIndex => active;

        public bool Exists(string name)
        {
            foreach (ISaveStorage s in Ordered())
            {
                if (s.Exists(name)) return true;
            }

            return false;
        }

        public bool TryRead(string name, out string? text, out string? error)
        {
            error = null;
            foreach (ISaveStorage s in Ordered())
            {
                if (!s.Exists(name)) continue;
                if (s.TryRead(name, out text, out string? e)) return true;
                error = e;
            }

            text = null;
            error = error ?? "missing";
            return false;
        }

        public bool TryWrite(string name, string text, out string? error)
        {
            error = null;
            string? last = null;
            foreach (ISaveStorage s in Ordered())
            {
                if (s.TryWrite(name, text, out string? e))
                {
                    active = Array.IndexOf(chain, s);
                    return true;
                }

                last = e;
            }

            error = last ?? "no storage accepted the write";
            return false;
        }

        private IEnumerable<ISaveStorage> Ordered()
        {
            yield return chain[active];
            for (int i = 0; i < chain.Length; i++)
            {
                if (i != active) yield return chain[i];
            }
        }
    }

    /// <summary>File names the save code accepts: lower-case letters, digits, dash, underscore and dot, no folders.</summary>
    public static class SaveNames
    {
        public const int MaxLength = 64;

        public static bool IsValid(string? name)
        {
            if (string.IsNullOrEmpty(name) || name!.Length > MaxLength || name[0] == '.') return false;
            foreach (char c in name)
            {
                bool ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.';
                if (!ok) return false;
            }

            return !name.Contains("..");
        }
    }
}
