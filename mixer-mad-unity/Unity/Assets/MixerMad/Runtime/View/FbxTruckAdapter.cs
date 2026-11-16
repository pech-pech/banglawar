using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Prepares a Blender-made truck (Art/Models/Truck_Mixer.fbx, node names per README) before TruckView binds it:
    /// swaps the imported MM_* materials for the shared Toy_* materials (outline shader, SRP Batcher, garage skins),
    /// turns the Headlight_L/R empties into spot lights, and seats the placeholder driver.
    /// Runs on a fresh instance only; the imported FBX asset is never changed.
    /// </summary>
    public static class FbxTruckAdapter
    {
        /// <summary>Blender material name (prefix match, so "MM_Truck_Body.001" also maps) -> shared material.</summary>
        static readonly KeyValuePair<string, string>[] Remap =
        {
            new KeyValuePair<string, string>("MM_Truck_DrumStripe", "Toy_Cream"),
            new KeyValuePair<string, string>("MM_Truck_Drum",       "Toy_Orange"),
            new KeyValuePair<string, string>("MM_Truck_Body",       "Toy_Yellow"),
            new KeyValuePair<string, string>("MM_Truck_Accent",     "Toy_Orange"),
            new KeyValuePair<string, string>("MM_Truck_Chute",      "Toy_Orange"),
            new KeyValuePair<string, string>("MM_Truck_Hub",        "Toy_Yellow"),
            new KeyValuePair<string, string>("MM_Truck_Interior",   "Toy_Navy"),
            new KeyValuePair<string, string>("MM_Truck_Trim",       "Toy_Navy"),
            new KeyValuePair<string, string>("MM_Rubber",           "Toy_Rubber"),
            new KeyValuePair<string, string>("MM_Chrome",           "Toy_White"),
            new KeyValuePair<string, string>("MM_Glass",            MMMaterials.GlassClearName),
            new KeyValuePair<string, string>("MM_Light_Head",       "Toy_Cream"),
            new KeyValuePair<string, string>("MM_Light_Tail",       "Toy_Red"),
        };

        public static void Prepare(GameObject truck)
        {
            if (truck == null) return;
            RemapMaterials(truck);
            AddHeadlights(truck.transform);
            SeatDriver(truck.transform);
        }

        public static string SharedNameFor(string imported)
        {
            if (string.IsNullOrEmpty(imported)) return null;
            foreach (var kv in Remap) if (imported.StartsWith(kv.Key)) return kv.Value;
            return null;
        }

        static void RemapMaterials(GameObject truck)
        {
            foreach (var r in truck.GetComponentsInChildren<Renderer>(true))
            {
                var mats = r.sharedMaterials;
                var next = new Material[mats.Length];
                for (int i = 0; i < mats.Length; i++)
                {
                    string shared = mats[i] != null ? SharedNameFor(mats[i].name) : null;
                    if (shared == null && mats[i] != null) Debug.LogWarning("[MixerMad] truck material without a Toy_* mapping: " + mats[i].name);
                    next[i] = shared == MMMaterials.GlassClearName ? MMMaterials.GlassClear() : shared != null ? MMMaterials.Get(shared) : mats[i];
                }
                r.sharedMaterials = next;
            }
        }

        static void AddHeadlights(Transform root)
        {
            foreach (var name in new[] { "Headlight_L", "Headlight_R" })
            {
                var t = Find(root, name);
                if (t == null || t.GetComponent<Light>() != null) continue;
                t.localRotation = Quaternion.Euler(8f, 90f, 0f);   // forward (+X), slightly down
                var l = t.gameObject.AddComponent<Light>();
                l.type = LightType.Spot; l.range = 18f; l.spotAngle = 55f; l.innerSpotAngle = 20f;
                l.intensity = 14f; l.color = new Color(1f, 0.94f, 0.78f);
                l.shadows = LightShadows.None;
                l.enabled = false;
            }
        }

        static void SeatDriver(Transform root)
        {
            var seat = Find(root, "Driver_Seat");
            if (seat == null || seat.GetComponentInChildren<DriverView>(true) != null) return;
            DriverView.BuildPlaceholder(seat);
        }

        static Transform Find(Transform r, string n)
        {
            if (r.name == n) return r;
            for (int i = 0; i < r.childCount; i++) { var f = Find(r.GetChild(i), n); if (f) return f; }
            return null;
        }
    }
}
