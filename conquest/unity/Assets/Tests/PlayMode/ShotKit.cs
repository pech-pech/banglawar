using System.Collections;
using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.UIElements;

namespace Conquest.UnityView.Tests
{
    /// <summary>
    /// Captures the running map at a chosen size in batch mode: the world camera and the UI Toolkit panel each render
    /// into a RenderTexture (cleared every frame), are read back and composited on the CPU. Also builds text-free
    /// contact sheets by area-averaging captures into a grid.
    /// </summary>
    public static class ShotKit
    {
        public static string Folder(string sub = "") => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Screenshots", sub));

        private static Texture2D Read(RenderTexture rt)
        {
            RenderTexture previous = RenderTexture.active;
            RenderTexture.active = rt;
            var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGBA32, false);
            tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
            tex.Apply();
            RenderTexture.active = previous;
            return tex;
        }

        /// <summary>Points the camera and the panel at RenderTextures of the given size and lets the map re-fit to it.</summary>
        public sealed class Target
        {
            public RenderTexture World = null!;
            public RenderTexture Ui = null!;
            public RenderTexture? OldCamera;
            public RenderTexture? OldPanel;
            public bool OldClear;
            public Color OldClearValue;
        }

        public static Target Begin(MapController map, int width, int height)
        {
            var t = new Target
            {
                World = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32),
                Ui = new RenderTexture(width, height, 24, RenderTextureFormat.ARGB32),
            };
            Camera cam = map.Rig.Camera;
            PanelSettings panel = map.Hud.Document.panelSettings;
            t.OldCamera = cam.targetTexture;
            t.OldPanel = panel.targetTexture;
            t.OldClear = panel.clearColor;
            t.OldClearValue = panel.colorClearValue;
            cam.targetTexture = t.World;
            panel.targetTexture = t.Ui;
            panel.clearColor = true;
            panel.colorClearValue = new Color(0f, 0f, 0f, 0f);
            return t;
        }

        /// <summary>Renders the current frame of both targets, composites them, and returns the picture (caller destroys it).</summary>
        public static Texture2D Grab(MapController map, Target t)
        {
            map.Rig.Camera.Render();
            Texture2D world = Read(t.World);
            Texture2D ui = Read(t.Ui);
            Color32[] w = world.GetPixels32();
            Color32[] u = ui.GetPixels32();
            for (int i = 0; i < w.Length; i++)
            {
                float a = u[i].a / 255f;
                w[i] = new Color32(
                    (byte)(u[i].r * a + w[i].r * (1f - a)),
                    (byte)(u[i].g * a + w[i].g * (1f - a)),
                    (byte)(u[i].b * a + w[i].b * (1f - a)), 255);
            }

            var result = new Texture2D(world.width, world.height, TextureFormat.RGBA32, false);
            result.SetPixels32(w);
            result.Apply();
            Object.Destroy(world);
            Object.Destroy(ui);
            return result;
        }

        public static void End(MapController map, Target t)
        {
            Camera cam = map.Rig.Camera;
            PanelSettings panel = map.Hud.Document.panelSettings;
            cam.targetTexture = t.OldCamera;
            panel.targetTexture = t.OldPanel;
            panel.clearColor = t.OldClear;
            panel.colorClearValue = t.OldClearValue;
            t.World.Release();
            t.Ui.Release();
        }

        public static IEnumerator Frames(int count)
        {
            for (int i = 0; i < count; i++) yield return null;
        }

        public static void Save(Texture2D picture, string relativePath)
        {
            string path = Path.Combine(Folder(), relativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllBytes(path, picture.EncodeToPNG());
            bool varied = false;
            Color32[] px = picture.GetPixels32();
            for (int i = 1; i < px.Length && !varied; i += 97) varied = px[i].r != px[0].r || px[i].g != px[0].g || px[i].b != px[0].b;
            Assert.IsTrue(varied, relativePath + " is one flat colour");
        }

        /// <summary>
        /// A grid with no text: rows are candidates, columns are sizes. Every cell is <paramref name="cellHeight"/>
        /// tall and as wide as its picture's aspect needs; pictures are area-averaged down. Background dark grey.
        /// </summary>
        public static Texture2D Sheet(IReadOnlyList<IReadOnlyList<Texture2D>> rows, int cellHeight, int gap = 12)
        {
            int columns = rows[0].Count;
            var widths = new int[columns];
            for (int c = 0; c < columns; c++)
            {
                Texture2D first = rows[0][c];
                widths[c] = Mathf.RoundToInt(first.width * (float)cellHeight / first.height);
            }

            int total = gap;
            foreach (int w in widths) total += w + gap;
            int height = gap + rows.Count * (cellHeight + gap);
            var sheet = new Texture2D(total, height, TextureFormat.RGBA32, false);
            var fill = new Color32[total * height];
            for (int i = 0; i < fill.Length; i++) fill[i] = new Color32(24, 26, 26, 255);
            for (int r = 0; r < rows.Count; r++)
            {
                int x0 = gap;
                // row 0 at the top: Unity rows run bottom-up
                int y0 = height - gap - (r + 1) * cellHeight - r * gap;
                for (int c = 0; c < columns; c++)
                {
                    Blit(rows[r][c], fill, total, x0, y0, widths[c], cellHeight);
                    x0 += widths[c] + gap;
                }
            }

            sheet.SetPixels32(fill);
            sheet.Apply();
            return sheet;
        }

        private static void Blit(Texture2D src, Color32[] dst, int dstWidth, int x0, int y0, int w, int h)
        {
            Color32[] s = src.GetPixels32();
            int sw = src.width;
            int sh = src.height;
            for (int y = 0; y < h; y++)
            {
                int sy0 = y * sh / h;
                int sy1 = Mathf.Max(sy0 + 1, (y + 1) * sh / h);
                for (int x = 0; x < w; x++)
                {
                    int sx0 = x * sw / w;
                    int sx1 = Mathf.Max(sx0 + 1, (x + 1) * sw / w);
                    int r = 0, g = 0, b = 0, n = 0;
                    for (int yy = sy0; yy < sy1; yy++)
                    {
                        int row = yy * sw;
                        for (int xx = sx0; xx < sx1; xx++)
                        {
                            Color32 p = s[row + xx];
                            r += p.r;
                            g += p.g;
                            b += p.b;
                            n++;
                        }
                    }

                    dst[(y0 + y) * dstWidth + x0 + x] = new Color32((byte)(r / n), (byte)(g / n), (byte)(b / n), 255);
                }
            }
        }
    }
}
