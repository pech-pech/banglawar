using System.Collections.Generic;
using Conquest.Content.Json;

namespace Conquest.Content
{
    /// <summary>Collects <see cref="ContentError"/>s in the order they are found.</summary>
    public sealed class ErrorSink
    {
        private readonly List<ContentError> _errors = new List<ContentError>();

        public IReadOnlyList<ContentError> Errors => _errors;

        public int Count => _errors.Count;

        public void Add(string path, string code, string message, JsonNode? at = null)
        {
            _errors.Add(new ContentError(path, code, message, at?.Line ?? 0, at?.Column ?? 0));
        }

        public void Add(ContentError error)
        {
            _errors.Add(error);
        }
    }
}
