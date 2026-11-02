using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Builds the Shuriken systems the truck FX use. Every system here is driven by Emit() with explicit world
    /// positions (emission module off), so Unity never interpolates an emitter across a teleport.
    /// Materials come from MMMaterials (shared SoftParticle materials, no instancing).
    /// </summary>
    public static class FxParticles
    {
        public struct Look
        {
            public float life, sizeMin, sizeMax, gravity, drag, grow;
            public Color color;
            public Material material;
        }

        public static ParticleSystem Make(Transform parent, string name, Look look, int maxParticles)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);

            var main = ps.main;
            main.loop = true; main.playOnAwake = false;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.startLifetime = look.life;
            main.startSpeed = 0f;
            main.startSize = new ParticleSystem.MinMaxCurve(look.sizeMin, look.sizeMax);
            main.startColor = look.color;
            main.gravityModifier = look.gravity;
            main.maxParticles = Mathf.Max(1, maxParticles);
            main.startRotation = new ParticleSystem.MinMaxCurve(0f, 6.28f);

            var em = ps.emission; em.enabled = false;
            var shape = ps.shape; shape.enabled = false;

            if (look.drag > 0f)
            {
                var lim = ps.limitVelocityOverLifetime;
                lim.enabled = true; lim.limit = 0f; lim.dampen = look.drag; lim.drag = 0f;
            }

            var col = ps.colorOverLifetime;
            col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                      new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(1f, 0.1f), new GradientAlphaKey(0.7f, 0.6f), new GradientAlphaKey(0f, 1f) });
            col.color = g;

            if (look.grow > 0f)
            {
                var sz = ps.sizeOverLifetime;
                sz.enabled = true;
                sz.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0f, 1f, 1f, 1f + look.grow));
            }

            var r = go.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Billboard;
            r.sharedMaterial = look.material;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            ps.Play();
            return ps;
        }

        public static void SetCap(ParticleSystem ps, int max) { if (ps == null) return; var m = ps.main; m.maxParticles = Mathf.Max(1, max); }

        /// <summary>Slow-mo and pause: particles age with the world, not with the wall clock.</summary>
        public static void SetSpeed(ParticleSystem ps, float scale) { if (ps == null) return; var m = ps.main; m.simulationSpeed = Mathf.Max(0f, scale); }

        public static void Emit(ParticleSystem ps, Vector3 pos, Vector3 vel, float size, float life, Color32 col)
        {
            var p = new ParticleSystem.EmitParams
            {
                position = pos, velocity = vel, startSize = size, startLifetime = life, startColor = col,
                applyShapeToPosition = false,
            };
            ps.Emit(p, 1);
        }

        /// <summary>A flat camera-facing quad (XY plane, uv 0..1) for glow sprites drawn with the SoftParticle shader.</summary>
        public static Mesh GlowQuad()
        {
            var m = new Mesh { name = "FX_GlowQuad" };
            m.SetVertices(new[] { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0) });
            m.SetUVs(0, new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) });
            m.SetColors(new[] { Color.white, Color.white, Color.white, Color.white });
            m.SetTriangles(new[] { 0, 2, 1, 0, 3, 2 }, 0);
            m.RecalculateBounds();
            return m;
        }
    }
}
