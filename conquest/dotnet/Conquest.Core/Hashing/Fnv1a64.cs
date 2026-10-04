using System.Text;

namespace Conquest.Core
{
    /// <summary>FNV-1a 64-bit hash (offset 0xcbf29ce484222325, prime 0x100000001b3). Own implementation, platform independent.</summary>
    public static class Fnv1a64
    {
        public const ulong OffsetBasis = 0xcbf29ce484222325UL;
        public const ulong Prime = 0x100000001b3UL;

        public static ulong Hash(byte[] bytes)
        {
            ulong h = OffsetBasis;
            unchecked
            {
                for (int i = 0; i < bytes.Length; i++)
                {
                    h ^= bytes[i];
                    h *= Prime;
                }
            }

            return h;
        }

        /// <summary>Hashes the UTF-8 bytes of the text.</summary>
        public static ulong Hash(string text) => Hash(Encoding.UTF8.GetBytes(text));

        public static string ToHex(ulong hash)
        {
            const string digits = "0123456789abcdef";
            var chars = new char[16];
            for (int i = 15; i >= 0; i--)
            {
                chars[i] = digits[(int)(hash & 0xF)];
                hash >>= 4;
            }

            return new string(chars);
        }
    }
}
