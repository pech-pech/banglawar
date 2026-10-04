using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;

namespace Conquest.Core.Rules
{
    /// <summary>Copies a sequence into a read-only list so callers cannot change the data behind an immutable object.</summary>
    internal static class Frozen
    {
        public static IReadOnlyList<T> List<T>(IEnumerable<T>? items)
        {
            return items == null ? new ReadOnlyCollection<T>(new T[0]) : new ReadOnlyCollection<T>(items.ToArray());
        }
    }
}
