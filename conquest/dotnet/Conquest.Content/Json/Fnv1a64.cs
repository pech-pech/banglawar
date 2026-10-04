using System.Text;

namespace Conquest.Content.Json
{
    /// <summary>FNV-1a, 64 bit, over the UTF-8 bytes of a string. Never <c>string.GetHashCode()</c>.</summary>
    public static class Fnv1a64
    {
        public const ulong OffsetBasis = 14695981039346656037UL;
        public const ulong Prime = 1099511628211UL;

        public static ulong Hash(string text)
        {
            ulong hash = OffsetBasis;
            foreach (byte b in Encoding.UTF8.GetBytes(text))
            {
                hash ^= b;
                unchecked
                {
                    hash *= Prime;
                }
            }

            return hash;
        }

        /// <summary>Sixteen lower-case hex digits.</summary>
        public static string Hex(ulong hash)
        {
            return hash.ToString("x16", System.Globalization.CultureInfo.InvariantCulture);
        }
    }
}
