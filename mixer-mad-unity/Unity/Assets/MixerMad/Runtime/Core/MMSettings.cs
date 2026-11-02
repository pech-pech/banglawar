using System;
using System.IO;
using UnityEngine;

namespace MixerMad.Game
{
    public enum QualityLevel { Low = 0, Medium = 1, High = 2, Ultra = 3 }

    [Serializable]
    public sealed class SettingsData
    {
        public int quality = (int)QualityLevel.High;   // High = 60 fps default
        public bool calmMotion = false;                // reduced motion (L-MM-4)
        public bool pedalsSwapped = false;             // false: brake left, gas right
        public float music = 0.8f;
        public float sound = 0.9f;
        public float dayLengthMinutes = 12f;
        public bool osReducedMotionChecked = false;
    }

    /// <summary>Local JSON settings, no accounts, no network. Static so any system can read it.</summary>
    public static class MMSettings
    {
        static SettingsData _data;
        static string Path => System.IO.Path.Combine(Application.persistentDataPath, "mixermad-settings.json");

        public static event Action Changed;

        public static SettingsData Data
        {
            get { if (_data == null) Load(); return _data; }
        }

        public static QualityLevel Quality
        {
            get => (QualityLevel)Mathf.Clamp(Data.quality, 0, 3);
            set { Data.quality = (int)value; Save(); }
        }

        public static bool CalmMotion
        {
            get => Data.calmMotion;
            set { Data.calmMotion = value; Save(); }
        }

        public static bool PedalsSwapped
        {
            get => Data.pedalsSwapped;
            set { Data.pedalsSwapped = value; Save(); }
        }

        public static void Load()
        {
            _data = new SettingsData();
            try
            {
                if (File.Exists(Path)) JsonUtility.FromJsonOverwrite(File.ReadAllText(Path), _data);
            }
            catch (Exception e) { Debug.LogWarning("[MixerMad] settings load failed: " + e.Message); }
        }

        public static void Save()
        {
            try { File.WriteAllText(Path, JsonUtility.ToJson(_data ?? new SettingsData(), true)); }
            catch (Exception e) { Debug.LogWarning("[MixerMad] settings save failed: " + e.Message); }
            Changed?.Invoke();
        }

        /// <summary>Test hook: use in-memory settings only.</summary>
        public static void ResetForTests() { _data = new SettingsData(); }
    }
}
