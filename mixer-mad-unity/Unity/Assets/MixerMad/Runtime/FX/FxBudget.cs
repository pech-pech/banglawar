using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Splits the preset's live-particle budget (QualityPresets.Preset.particleBudget, shared with the snowfall)
    /// between the truck effects. Pure maths so the split is unit tested. Calm motion halves the counts.
    /// </summary>
    public readonly struct FxBudget
    {
        /// <summary>Share of the preset budget the truck FX may use (the weather keeps the rest).</summary>
        public const float Share = 0.12f;
        public const int Min = 40, Max = 1200;

        public readonly int total, spray, puff, exhaust, sparkle, smoke;

        FxBudget(int total)
        {
            this.total = total;
            spray = Mathf.Max(8, Mathf.RoundToInt(total * 0.40f));
            puff = Mathf.Max(6, Mathf.RoundToInt(total * 0.20f));
            exhaust = Mathf.Max(4, Mathf.RoundToInt(total * 0.12f));
            sparkle = Mathf.Max(6, Mathf.RoundToInt(total * 0.20f));
            smoke = Mathf.Max(4, Mathf.RoundToInt(total * 0.08f));
        }

        public static FxBudget For(int presetParticleBudget, bool calm)
        {
            int t = Mathf.Clamp(Mathf.RoundToInt(presetParticleBudget * Share), Min, Max);
            if (calm) t = Mathf.Max(Min / 2, t / 2);
            return new FxBudget(t);
        }

        public int Sum => spray + puff + exhaust + sparkle + smoke;
    }

    /// <summary>Turns a rate (per second) into whole particles per frame without losing the fractions. Reset on teleport.</summary>
    public sealed class EmitMeter
    {
        float _carry;
        public int Take(float perSecond, float dt)
        {
            if (perSecond <= 0f || dt <= 0f) { _carry = 0f; return 0; }
            _carry += perSecond * dt;
            int n = Mathf.FloorToInt(_carry);
            _carry -= n;
            return n;
        }
        public void Reset() { _carry = 0f; }
    }
}
