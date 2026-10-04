using System;
using System.Collections;
using System.Collections.Generic;

namespace Conquest.Core
{
    /// <summary>
    /// Immutable array wrapper. The private array is never exposed; every change returns a new value.
    /// Entity tables are kept sorted by integer id by their owners (no Dictionary/HashSet iteration in Core).
    /// </summary>
    public readonly struct ImmArray<T> : IReadOnlyList<T>, IEquatable<ImmArray<T>>
    {
        private readonly T[]? _items;

        private ImmArray(T[] items)
        {
            _items = items;
        }

        public static ImmArray<T> Empty => default;

        public static ImmArray<T> From(IEnumerable<T> items)
        {
            var list = new List<T>(items);
            return list.Count == 0 ? default : new ImmArray<T>(list.ToArray());
        }

        public static ImmArray<T> Of(params T[] items)
        {
            return items.Length == 0 ? default : new ImmArray<T>((T[])items.Clone());
        }

        public int Count => _items == null ? 0 : _items.Length;

        public int Length => Count;

        public T this[int index]
        {
            get
            {
                if (_items == null || index < 0 || index >= _items.Length)
                {
                    throw new ArgumentOutOfRangeException(nameof(index));
                }

                return _items[index];
            }
        }

        public ImmArray<T> Add(T item)
        {
            int n = Count;
            var copy = new T[n + 1];
            if (n > 0)
            {
                Array.Copy(_items!, copy, n);
            }

            copy[n] = item;
            return new ImmArray<T>(copy);
        }

        public ImmArray<T> SetItem(int index, T item)
        {
            if (index < 0 || index >= Count)
            {
                throw new ArgumentOutOfRangeException(nameof(index));
            }

            var copy = (T[])_items!.Clone();
            copy[index] = item;
            return new ImmArray<T>(copy);
        }

        public ImmArray<T> Insert(int index, T item)
        {
            int n = Count;
            if (index < 0 || index > n)
            {
                throw new ArgumentOutOfRangeException(nameof(index));
            }

            var copy = new T[n + 1];
            for (int i = 0; i < index; i++)
            {
                copy[i] = _items![i];
            }

            copy[index] = item;
            for (int i = index; i < n; i++)
            {
                copy[i + 1] = _items![i];
            }

            return new ImmArray<T>(copy);
        }

        public ImmArray<T> RemoveAt(int index)
        {
            int n = Count;
            if (index < 0 || index >= n)
            {
                throw new ArgumentOutOfRangeException(nameof(index));
            }

            if (n == 1)
            {
                return default;
            }

            var copy = new T[n - 1];
            for (int i = 0; i < index; i++)
            {
                copy[i] = _items![i];
            }

            for (int i = index + 1; i < n; i++)
            {
                copy[i - 1] = _items![i];
            }

            return new ImmArray<T>(copy);
        }

        public ImmArray<T> AddRange(ImmArray<T> other)
        {
            if (other.Count == 0)
            {
                return this;
            }

            var copy = new T[Count + other.Count];
            for (int i = 0; i < Count; i++)
            {
                copy[i] = _items![i];
            }

            for (int i = 0; i < other.Count; i++)
            {
                copy[Count + i] = other._items![i];
            }

            return new ImmArray<T>(copy);
        }

        public bool Equals(ImmArray<T> other)
        {
            if (Count != other.Count)
            {
                return false;
            }

            var comparer = EqualityComparer<T>.Default;
            for (int i = 0; i < Count; i++)
            {
                if (!comparer.Equals(_items![i], other._items![i]))
                {
                    return false;
                }
            }

            return true;
        }

        public override bool Equals(object? obj) => obj is ImmArray<T> other && Equals(other);

        public override int GetHashCode()
        {
            // Deterministic and order sensitive; never used for persisted hashes (see StateHasher).
            unchecked
            {
                int h = 17 + Count;
                for (int i = 0; i < Count; i++)
                {
                    h = h * 31 + (_items![i]?.GetHashCode() ?? 0);
                }

                return h;
            }
        }

        public IEnumerator<T> GetEnumerator()
        {
            for (int i = 0; i < Count; i++)
            {
                yield return _items![i];
            }
        }

        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }
}
