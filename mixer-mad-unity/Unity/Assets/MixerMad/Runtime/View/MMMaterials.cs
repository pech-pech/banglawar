using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Single lookup for the project's materials. The Editor scene builder creates the real .mat assets in
    /// Assets/MixerMad/Resources/MixerMad/ (so shaders survive stripping in a player build). At runtime we load
    /// them by name; if one is missing (editor quick tests) we fall back to creating it from the shader.
    /// Materials are shared (never instanced, never MaterialPropertyBlock) so the SRP Batcher stays happy.
    /// </summary>
    public static class MMMaterials
    {
        public struct Def
        {
            public string name, shader; public Color color; public float smooth, clearCoat, rim, outlineWidth, streak; public Color emission;
            public Def(string n, string sh, Color c, float s = 0.55f, float cc = 1f, float rim = 0.45f, float ow = 0.06f, float streak = 0f)
            { name = n; shader = sh; color = c; smooth = s; clearCoat = cc; this.rim = rim; outlineWidth = ow; this.streak = streak; emission = Color.black; }
        }

        public static Color Hex(string h) { ColorUtility.TryParseHtmlString(h, out var c); return c; }

        public static readonly Def[] Toys =
        {
            new Def("Toy_Yellow",  "MixerMad/ToyPlastic", Hex("#ffc21a")),
            new Def("Toy_Orange",  "MixerMad/ToyPlastic", Hex("#ff7a1a")),
            new Def("Toy_Cream",   "MixerMad/ToyPlastic", Hex("#f4ecd8")),
            new Def("Toy_Navy",    "MixerMad/ToyPlastic", Hex("#2a3550"), 0.5f, 0.8f),
            new Def("Toy_Rubber",  "MixerMad/ToyPlastic", Hex("#3a3d45"), 0.25f, 0f, 0.25f),
            new Def("Toy_Glass",   "MixerMad/ToyPlastic", Hex("#46698c"), 0.92f, 1f, 0.5f, 0.06f, 1f),
            new Def("Toy_Skin",    "MixerMad/ToyPlastic", Hex("#f2b48a"), 0.4f, 0.4f, 0.3f, 0.03f),
            new Def("Toy_White",   "MixerMad/ToyPlastic", Hex("#ffffff"), 0.6f, 0.6f, 0.2f, 0.02f),
            new Def("Toy_Hat",     "MixerMad/ToyPlastic", Hex("#ffd21f"), 0.6f, 1f, 0.45f, 0.03f),
            new Def("Toy_Red",     "MixerMad/ToyPlastic", Hex("#d42a2a"), 0.5f, 0.8f),
            new Def("Toy_Teal",    "MixerMad/ToyPlastic", Hex("#20c0b0"), 0.55f, 1f),
            // skins for the mixer garage swatches
            new Def("Skin_Sky",    "MixerMad/ToyPlastic", Hex("#3fa7e8")),
            new Def("Skin_Lime",   "MixerMad/ToyPlastic", Hex("#8bd23a")),
            new Def("Skin_Pink",   "MixerMad/ToyPlastic", Hex("#ff7fb5")),
            // set dressing: no outline (background rule), matte
            new Def("Dress_Pine",  "MixerMad/ToyPlastic", Hex("#2f6b52"), 0.2f, 0f, 0.15f, 0f),
            new Def("Dress_Trunk", "MixerMad/ToyPlastic", Hex("#6b4a30"), 0.2f, 0f, 0.1f, 0f),
            new Def("Dress_Cabin", "MixerMad/ToyPlastic", Hex("#b5693a"), 0.3f, 0.3f, 0.25f, 0.04f),
            new Def("Dress_Roof",  "MixerMad/ToyPlastic", Hex("#e9eef5"), 0.25f, 0f, 0.2f, 0.04f),
            new Def("Dress_Pole",  "MixerMad/ToyPlastic", Hex("#ff7a1a"), 0.5f, 0.6f, 0.3f, 0.03f),
            // FX emitters (HDR emission above the bloom threshold of 1.0, L-MM-33); swapped, never instanced
            new Def("FX_Beacon_On",  "MixerMad/ToyPlastic", Hex("#ffb21a"), 0.7f, 1f, 0.3f, 0f) { emission = new Color(6f, 3.2f, 0.4f) },
            new Def("FX_Beacon_Off", "MixerMad/ToyPlastic", Hex("#d08a1c"), 0.7f, 1f, 0.3f, 0f) { emission = new Color(0.35f, 0.18f, 0.02f) },
            new Def("FX_Headlamp",   "MixerMad/ToyPlastic", Hex("#fff3d8"), 0.8f, 1f, 0.2f, 0f) { emission = new Color(5f, 4.6f, 3.6f) },
            // living world (background rule: no outline, matte)
            new Def("World_Navy",   "MixerMad/ToyPlastic", Hex("#2a3550"), 0.3f, 0f, 0.15f, 0f),
            new Def("World_Red",    "MixerMad/ToyPlastic", Hex("#d42a2a"), 0.35f, 0.2f, 0.2f, 0f),
            new Def("World_Orange", "MixerMad/ToyPlastic", Hex("#ff7a1a"), 0.35f, 0.2f, 0.2f, 0f),
            new Def("World_Snow",   "MixerMad/ToyPlastic", Hex("#f6f9ff"), 0.25f, 0f, 0.2f, 0f),
            new Def("FX_Gold",       "MixerMad/ToyPlastic", Hex("#ffcf3a"), 0.85f, 1f, 0.5f, 0.02f) { emission = new Color(1.6f, 1.1f, 0.2f) },
        };

        static readonly Dictionary<string, Material> Cache = new Dictionary<string, Material>();

        public static Material Get(string name)
        {
            if (Cache.TryGetValue(name, out var m) && m != null) return m;
            m = Resources.Load<Material>("MixerMad/" + name);
            if (m == null) m = CreateFallback(name);
            Cache[name] = m;
            return m;
        }

        public static Material Particle(bool additive)
        {
            string n = additive ? "FX_ParticleAdd" : "FX_ParticleAlpha";
            if (Cache.TryGetValue(n, out var m) && m != null) return m;
            m = Resources.Load<Material>("MixerMad/" + n);
            if (m == null) m = ConfigureParticle(new Material(Shader.Find("MixerMad/SoftParticle")) { name = n }, additive);
            Cache[n] = m;
            return m;
        }

        /// <summary>Soft round additive/alpha particle with an HDR tint (glow sprites, gold sparkle), one shared material per name.</summary>
        public static Material ParticleTinted(string name, Color hdrTint, bool additive)
        {
            if (Cache.TryGetValue(name, out var m) && m != null) return m;
            m = ConfigureParticle(new Material(Shader.Find("MixerMad/SoftParticle")) { name = name }, additive);
            m.SetColor("_Color", hdrTint);
            Cache[name] = m;
            return m;
        }

        public static Material Sky()
        {
            if (Cache.TryGetValue("FX_Sky", out var m) && m != null) return m;
            m = Resources.Load<Material>("MixerMad/FX_Sky");
            if (m == null) m = new Material(Shader.Find("MixerMad/SkyGradient")) { name = "FX_Sky" };
            Cache["FX_Sky"] = m;
            return m;
        }

        public static Material Snow()
        {
            if (Cache.TryGetValue("Snow_Road", out var m) && m != null) return m;
            m = Resources.Load<Material>("MixerMad/Snow_Road");
            if (m == null) m = new Material(Shader.Find("MixerMad/SnowIce")) { name = "Snow_Road" };
            Cache["Snow_Road"] = m;
            return m;
        }

        public const string GlassClearName = "Glass_Clear";
        const string LitShader = "Universal Render Pipeline/Lit";

        /// <summary>See-through cab glass (URP Lit, transparent) so the driver shows through the windows.</summary>
        public static Material GlassClear()
        {
            if (Cache.TryGetValue(GlassClearName, out var m) && m != null) return m;
            m = Resources.Load<Material>("MixerMad/" + GlassClearName);
            if (m == null)
            {
                var lit = Shader.Find(LitShader);
                if (lit != null) m = ConfigureGlassClear(new Material(lit) { name = GlassClearName });
                else { Debug.LogError("[MixerMad] " + GlassClearName + " missing and URP Lit not in the build; using Toy_Glass."); m = Get("Toy_Glass"); }
            }
            Cache[GlassClearName] = m;
            return m;
        }

        public static Material ConfigureGlassClear(Material m)
        {
            // Clear enough to read the driver's face at drive zoom: light tint, no sky reflection (it washed the face
            // out over snow); the sun glint stays.
            m.SetColor("_BaseColor", new Color(0.70f, 0.86f, 0.97f, 0.12f));
            m.SetFloat("_Smoothness", 0.85f);
            m.SetFloat("_EnvironmentReflections", 0f);
            m.EnableKeyword("_ENVIRONMENTREFLECTIONS_OFF");
            m.SetFloat("_Metallic", 0f);
            m.SetFloat("_Surface", 1f);                                   // transparent
            m.SetFloat("_Blend", 0f);                                     // alpha
            m.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_SrcBlendAlpha", (float)UnityEngine.Rendering.BlendMode.One);
            m.SetFloat("_DstBlendAlpha", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0f);
            m.SetOverrideTag("RenderType", "Transparent");
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
            return m;
        }

        /// <summary>Used by the editor builder and the fallback path alike.</summary>
        public static Material ConfigureToy(Material m, Def d)
        {
            m.SetColor("_BaseColor", d.color);
            m.SetFloat("_Smoothness", d.smooth);
            m.SetFloat("_ClearCoat", d.clearCoat);
            m.SetFloat("_RimStrength", d.rim);
            m.SetFloat("_OutlineWidth", d.outlineWidth);
            m.SetFloat("_StreakStrength", d.streak);
            m.SetColor("_EmissionColor", d.emission);
            return m;
        }

        public static Material ConfigureParticle(Material m, bool additive)
        {
            m.SetFloat("_BlendMode", additive ? 1f : 0f);
            m.SetFloat("_SrcBlend", 5f);                      // SrcAlpha
            m.SetFloat("_DstBlend", additive ? 1f : 10f);     // One / OneMinusSrcAlpha
            m.renderQueue = 3000;
            return m;
        }

        static Material CreateFallback(string name)
        {
            foreach (var d in Toys)
                if (d.name == name)
                    return ConfigureToy(new Material(Shader.Find(d.shader)) { name = name }, d);
            Debug.LogWarning("[MixerMad] material not found: " + name);
            return new Material(Shader.Find("MixerMad/ToyPlastic")) { name = name };
        }
    }
}
