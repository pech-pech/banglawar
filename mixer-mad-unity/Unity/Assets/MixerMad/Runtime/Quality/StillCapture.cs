using System;
using System.Collections;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>Grabs the finished frame (after UI) and writes it as a PNG. Shared by the stills runners.</summary>
    public static class StillCapture
    {
        /// <summary>Coroutine: waits for the end of the frame, reads the back buffer, writes <paramref name="path"/>.
        /// Reports success through <paramref name="done"/>; never throws.</summary>
        public static IEnumerator Capture(string path, Action<bool> done)
        {
            yield return new WaitForEndOfFrame();
            int w = Screen.width, h = Screen.height;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            bool ok = false;
            try
            {
                tex.ReadPixels(new Rect(0, 0, w, h), 0, 0, false);
                tex.Apply(false);
                PngWriter.Write(path, tex.GetPixels32(), w, h);
                ok = true;
            }
            catch (Exception e) { Debug.LogError("[MixerMad] still failed " + path + ": " + e.Message); }
            finally { UnityEngine.Object.Destroy(tex); }
            done?.Invoke(ok);
        }
    }
}
