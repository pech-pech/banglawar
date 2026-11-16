using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace MixerMad.Game
{
    /// <summary>
    /// Finds every switch in <see cref="FeatureToggles"/> and <see cref="FxToggles"/> by reflection (public static bool or float fields), so a
    /// flag another workstream adds later is included in the on/off stills and the benchmark without editing them.
    /// A bool flag is on when true; a float flag (a budget multiplier) is on at 1 and off at 0.
    /// </summary>
    public static class FeatureToggleFields
    {
        /// <summary>All flags, sorted by name so every run uses the same order.</summary>
        public static IReadOnlyList<FieldInfo> All()
        {
            return typeof(FeatureToggles).GetFields(BindingFlags.Public | BindingFlags.Static)
                .Concat(typeof(FxToggles).GetFields(BindingFlags.Public | BindingFlags.Static))
                .Where(f => !f.IsInitOnly && !f.IsLiteral && (f.FieldType == typeof(bool) || f.FieldType == typeof(float)))
                .OrderBy(f => f.Name, StringComparer.Ordinal)
                .ToArray();
        }

        public static IReadOnlyList<string> Names() => All().Select(f => f.Name).ToArray();

        public static FieldInfo Find(string name) => All().FirstOrDefault(f => f.Name == name);

        public static bool IsOn(FieldInfo f)
        {
            object v = f.GetValue(null);
            return v is bool b ? b : (float)v > 0.5f;
        }

        /// <summary>Sets one flag without telling anyone; call <see cref="FeatureToggles.Notify"/> after a batch.</summary>
        public static void Set(FieldInfo f, bool on)
        {
            if (f.FieldType == typeof(bool)) f.SetValue(null, on);
            else f.SetValue(null, on ? 1f : 0f);
        }

        /// <summary>The current value of every flag, to put back after a run that switched some of them.</summary>
        public static Dictionary<string, object> Snapshot() => All().ToDictionary(f => f.Name, f => f.GetValue(null));

        public static void Restore(Dictionary<string, object> snapshot)
        {
            if (snapshot == null) return;
            foreach (var f in All())
                if (snapshot.TryGetValue(f.Name, out var v)) f.SetValue(null, v);
            FeatureToggles.Notify();
        }

        /// <summary>Flags whose values are multipliers ramp in over a particle lifetime, so stills wait longer for them.</summary>
        public static bool IsRamped(FieldInfo f) => f.FieldType == typeof(float);
    }
}
