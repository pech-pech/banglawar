using System;
using System.IO;
using System.IO.Compression;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Minimal RGB PNG encoder for review stills. Keeps the project off the ScreenCapture and
    /// ImageConversion modules (not in the approved package list).
    /// </summary>
    public static class PngWriter
    {
        static readonly uint[] CrcTable = BuildCrcTable();

        /// <summary>Writes rows bottom-up as Unity returns them (row 0 = bottom), flipped to PNG order.</summary>
        public static void Write(string path, Color32[] pixels, int width, int height)
        {
            if (pixels == null || pixels.Length != width * height) throw new ArgumentException("pixel count does not match size");
            byte[] raw = new byte[(width * 3 + 1) * height];
            int o = 0;
            for (int y = height - 1; y >= 0; y--)
            {
                raw[o++] = 0;   // filter: none
                int row = y * width;
                for (int x = 0; x < width; x++) { var c = pixels[row + x]; raw[o++] = c.r; raw[o++] = c.g; raw[o++] = c.b; }
            }
            using (var fs = File.Create(path))
            {
                fs.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }, 0, 8);
                var ihdr = new byte[13];
                PutBE(ihdr, 0, (uint)width); PutBE(ihdr, 4, (uint)height);
                ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGB
                Chunk(fs, "IHDR", ihdr);
                Chunk(fs, "IDAT", Zlib(raw));
                Chunk(fs, "IEND", new byte[0]);
            }
        }

        static byte[] Zlib(byte[] data)
        {
            using (var ms = new MemoryStream())
            {
                ms.WriteByte(0x78); ms.WriteByte(0x9C);
                using (var ds = new DeflateStream(ms, System.IO.Compression.CompressionLevel.Fastest, true)) ds.Write(data, 0, data.Length);
                uint a = 1, b = 0;
                foreach (var d in data) { a = (a + d) % 65521; b = (b + a) % 65521; }
                var adler = new byte[4]; PutBE(adler, 0, (b << 16) | a);
                ms.Write(adler, 0, 4);
                return ms.ToArray();
            }
        }

        static void Chunk(Stream s, string type, byte[] data)
        {
            var len = new byte[4]; PutBE(len, 0, (uint)data.Length); s.Write(len, 0, 4);
            var t = System.Text.Encoding.ASCII.GetBytes(type); s.Write(t, 0, 4); s.Write(data, 0, data.Length);
            uint crc = 0xFFFFFFFFu;
            crc = Crc(crc, t); crc = Crc(crc, data);
            var c = new byte[4]; PutBE(c, 0, crc ^ 0xFFFFFFFFu); s.Write(c, 0, 4);
        }

        static uint Crc(uint crc, byte[] buf) { foreach (var b in buf) crc = CrcTable[(crc ^ b) & 0xFF] ^ (crc >> 8); return crc; }

        static uint[] BuildCrcTable()
        {
            var t = new uint[256];
            for (uint n = 0; n < 256; n++) { uint c = n; for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1; t[n] = c; }
            return t;
        }

        static void PutBE(byte[] b, int i, uint v) { b[i] = (byte)(v >> 24); b[i + 1] = (byte)(v >> 16); b[i + 2] = (byte)(v >> 8); b[i + 3] = (byte)v; }
    }
}
