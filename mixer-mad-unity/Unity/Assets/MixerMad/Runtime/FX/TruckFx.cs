using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Particle showcase on the truck: wheel snow spray, landing puffs, exhaust puffs and the gold finish sparkle.
    /// Reads SimDriver.Render / Curr and sim events only (never writes to the sim). All systems emit by hand at
    /// explicit positions, and Teleported clears every particle and carry-over, so a respawn is a clean cut.
    /// Budgets: FxBudget from the preset's particleBudget. Calm motion: fewer, slower particles and no burst.
    /// </summary>
    [DefaultExecutionOrder(20)]   // after TruckView (10) has placed the rig for this frame
    public sealed class TruckFx : MonoBehaviour
    {
        const float SprayLife = 0.6f, PuffLife = 0.9f, ExhaustLife = 0.6f, SparkleLife = 1.3f;
        const float SprayMinSpeed = 1.5f, SprayFullSpeed = 13.5f;
        const float LandingMinImpact = 1.5f;
        const float SparkleSeconds = 4f;
        const float WheelRadius = 0.5f;
        static readonly Vector3 SparkleLocal = new Vector3(-0.6f, 2.3f, -0.9f);

        public Transform truck;
        TruckRig _rig;
        SimDriver _sim;
        ParticleSystem _spray, _puff, _exhaust, _sparkle;
        ParticleSystem[] _all = new ParticleSystem[0];
        readonly EmitMeter _sprayMeter = new EmitMeter(), _exhaustMeter = new EmitMeter(), _sparkleMeter = new EmitMeter();
        FxBudget _budget;
        int _budgetKey = -1;
        float _sparkleT;
        uint _seed = 12345u;

        public int LiveParticles =>
            (_spray ? _spray.particleCount : 0) + (_puff ? _puff.particleCount : 0) +
            (_exhaust ? _exhaust.particleCount : 0) + (_sparkle ? _sparkle.particleCount : 0);

        public FxBudget Budget => _budget;

        public void Init(Transform truckRoot, SimDriver sim)
        {
            truck = truckRoot;
            _rig = TruckRig.Find(truckRoot);
            Bind(sim);
            Build();
        }

        void Bind(SimDriver sim)
        {
            if (_sim != null) { _sim.Teleported -= OnTeleported; _sim.SimEventRaised -= OnSimEvent; }
            _sim = sim;
            if (_sim != null) { _sim.Teleported += OnTeleported; _sim.SimEventRaised += OnSimEvent; }
        }

        void Build()
        {
            var snow = new Color(0.84f, 0.89f, 0.98f, 0.95f);   // cool shadow tint so white spray still reads on white snow
            _spray = FxParticles.Make(transform, "FX_WheelSpray",
                new FxParticles.Look { life = SprayLife, sizeMin = 0.15f, sizeMax = 0.32f, gravity = 0.7f, drag = 0.15f, grow = 1.2f, color = snow, material = MMMaterials.Particle(false) }, 64);
            _puff = FxParticles.Make(transform, "FX_LandingPuff",
                new FxParticles.Look { life = PuffLife, sizeMin = 0.4f, sizeMax = 0.8f, gravity = 0.05f, drag = 0.35f, grow = 2.2f, color = snow, material = MMMaterials.Particle(false) }, 32);
            _exhaust = FxParticles.Make(transform, "FX_Exhaust",
                new FxParticles.Look { life = ExhaustLife, sizeMin = 0.3f, sizeMax = 0.45f, gravity = -0.08f, drag = 0f, grow = 2.4f, color = new Color(0.78f, 0.80f, 0.86f, 0.4f), material = MMMaterials.Particle(false) }, 24);
            _sparkle = FxParticles.Make(transform, "FX_GoldSparkle",
                new FxParticles.Look { life = SparkleLife, sizeMin = 0.08f, sizeMax = 0.2f, gravity = 0.35f, drag = 0.1f, grow = 0f, color = Color.white, material = MMMaterials.ParticleTinted("FX_SparkleGold", new Color(2.6f, 1.5f, 0.25f, 1f), true) }, 32);
            _all = new[] { _spray, _puff, _exhaust, _sparkle };
            RefreshBudget();
        }

        void OnDestroy() { Bind(null); }

        // ------------------------------------------------------------------ teleport: the clean cut
        internal void OnTeleported()
        {
            foreach (var ps in _all) if (ps) ps.Clear(true);
            _sprayMeter.Reset(); _exhaustMeter.Reset(); _sparkleMeter.Reset();
            _sparkleT = 0f;
        }

        void OnSimEvent(SimEvent e)
        {
            if (e.kind == SimEventKind.Landing) LandingPuff(e.magnitude);
            else if (e.kind == SimEventKind.Finish) StartSparkle();
        }

        // ------------------------------------------------------------------ frame
        void LateUpdate() { Tick(); }

        /// <summary>One frame (tests call it directly).</summary>
        internal void Tick()
        {
            if (_sim == null) return;
            RefreshBudget();
            float speedScale = _sim.SpeedScale;
            foreach (var ps in _all) FxParticles.SetSpeed(ps, speedScale);
            float dt = _sim.PresentationDelta;
            var s = _sim.Render;
            if (dt <= 0f || s.crashed) return;   // paused, or in the crash freeze: emit nothing
            Spray(s, dt);
            Exhaust(s, dt);
            Sparkle(dt);
        }

        void RefreshBudget()
        {
            bool calm = MMSettings.CalmMotion;
            int key = QualityPresets.Current.particleBudget * 2 + (calm ? 1 : 0);
            if (key == _budgetKey) return;
            _budgetKey = key;
            _budget = FxBudget.For(QualityPresets.Current.particleBudget, calm);
            FxParticles.SetCap(_spray, _budget.spray); FxParticles.SetCap(_puff, _budget.puff);
            FxParticles.SetCap(_exhaust, _budget.exhaust); FxParticles.SetCap(_sparkle, _budget.sparkle);
        }

        float Calm => MMSettings.CalmMotion ? 0.5f : 1f;

        Vector3 Contact(SimSnapshot s, int i, float z)
        {
            float a = s.chassisAngle;
            var up = new Vector2(-Mathf.Sin(a), Mathf.Cos(a));
            var p = s.wheelPos[i] - up * WheelRadius;
            return new Vector3(p.x, p.y + 0.05f, z);
        }

        void Spray(SimSnapshot s, float dt)
        {
            if (!FxToggles.Spray) { if (_spray.particleCount > 0) _spray.Clear(); _sprayMeter.Reset(); return; }
            float f = s.grounded ? Mathf.Clamp01((s.speed - SprayMinSpeed) / (SprayFullSpeed - SprayMinSpeed)) : 0f;
            float rate = _budget.spray / SprayLife * 0.85f * f;   // sustained count stays under the cap
            int n = _sprayMeter.Take(rate, dt);
            if (n == 0 || s.wheelCount == 0) return;
            var vel = s.velocity;
            for (int k = 0; k < n; k++)
            {
                int wi = (int)(Rand() * s.wheelCount) % s.wheelCount;
                float z = _rig.wheelZ[(int)(Rand() * _rig.wheelZ.Count) % _rig.wheelZ.Count];
                var pos = Contact(s, wi, z) + new Vector3(Rand() * 0.3f - 0.15f, 0f, Rand() * 0.3f - 0.15f);
                var v = new Vector3(-vel.x * (0.15f + 0.2f * Rand()), (1.2f + 2.2f * Rand()) * (0.6f + 0.4f * f), (Rand() - 0.5f) * 1.6f) * Calm;
                FxParticles.Emit(_spray, pos, v, 0.15f + 0.18f * Rand(), SprayLife * (0.7f + 0.5f * Rand()), new Color(0.84f, 0.89f, 0.98f, 0.95f));
            }
        }

        void LandingPuff(float impact)
        {
            if (!FxToggles.LandingPuff || impact < LandingMinImpact || _sim == null) return;
            var s = _sim.Curr;
            int count = Mathf.Clamp(Mathf.RoundToInt(impact * 4f * Calm), 6, Mathf.Max(6, _budget.puff));
            float spread = (1.2f + impact * 0.25f) * Calm;
            float size = Mathf.Lerp(0.6f, 1.2f, Mathf.InverseLerp(2f, 10f, impact));
            for (int k = 0; k < count; k++)
            {
                int wi = k % Mathf.Max(1, s.wheelCount);
                float z = _rig.wheelZ[k % _rig.wheelZ.Count];
                float th = Rand() * Mathf.PI * 2f;
                var v = new Vector3(Mathf.Cos(th) * spread, 0.3f + Rand() * 0.9f, Mathf.Sin(th) * spread * 0.6f);
                FxParticles.Emit(_puff, Contact(s, wi, z), v, size * (0.7f + 0.6f * Rand()), PuffLife * (0.8f + 0.4f * Rand()), new Color(0.86f, 0.90f, 0.98f, 0.9f));
            }
        }

        void Exhaust(SimSnapshot s, float dt)
        {
            if (!FxToggles.Exhaust) { if (_exhaust.particleCount > 0) _exhaust.Clear(); _exhaustMeter.Reset(); return; }
            float rate = (2f + 6f * s.throttle) * Calm;
            rate = Mathf.Min(rate, _budget.exhaust / ExhaustLife);
            int n = _exhaustMeter.Take(rate, dt);
            if (n == 0) return;
            var stack = _rig.Exhaust();
            for (int k = 0; k < n; k++)
            {
                var jitter = new Vector3((Rand() - 0.5f) * 0.25f, (Rand() - 0.5f) * 0.15f, (Rand() - 0.5f) * 0.2f);
                var v = ExhaustVelocity(s.velocity, s.throttle, Rand(), Rand(), Rand());
                byte grey = (byte)(165 + Rand() * 30);
                float life = ExhaustLife * (0.75f + 0.5f * Rand());
                FxParticles.Emit(_exhaust, stack + jitter, v, 0.3f + 0.15f * Rand(), life, new Color32(grey, grey, (byte)(grey + 12), 105));
            }
        }

        /// <summary>
        /// Exhaust puff velocity (world). The puff keeps most of the truck's own motion, so it stays a short soft puff
        /// near the stack instead of being left behind as a long, evenly spaced dotted line; it drifts up and a little back.
        /// </summary>
        internal static Vector3 ExhaustVelocity(Vector2 truckVelocity, float throttle, float r1, float r2, float r3) =>
            new Vector3(truckVelocity.x * ExhaustCarry - 0.3f + (r1 - 0.5f) * 0.6f,
                        truckVelocity.y * ExhaustCarry + 0.6f + 0.5f * r2 + throttle * 0.3f,
                        (r3 - 0.5f) * 0.4f);

        /// <summary>Share of the truck's velocity a puff keeps.</summary>
        internal const float ExhaustCarry = 0.9f;
        /// <summary>Longest a puff lives (ExhaustLife plus its random spread).</summary>
        internal const float ExhaustLifeMax = ExhaustLife * 1.25f;

        void StartSparkle()
        {
            if (!FxToggles.Sparkle) return;
            _sparkleT = SparkleSeconds;
            if (MMSettings.CalmMotion) return;   // no burst in Calm motion, just the gentle drift below
            int count = Mathf.Min(_budget.sparkle, 28);
            var c = SparkleOrigin();
            for (int k = 0; k < count; k++)
            {
                float th = Rand() * Mathf.PI * 2f;
                var v = new Vector3(Mathf.Cos(th) * (1.5f + Rand() * 2f), 2.5f + Rand() * 2.5f, Mathf.Sin(th) * 1.2f);
                FxParticles.Emit(_sparkle, c, v, 0.16f + 0.14f * Rand(), SparkleLife, Color.white);
            }
        }

        void Sparkle(float dt)
        {
            if (_sparkleT <= 0f) return;
            if (!FxToggles.Sparkle) { _sparkleT = 0f; _sparkle.Clear(); return; }
            _sparkleT -= dt;
            int n = _sparkleMeter.Take(22f * Calm, dt);
            var c = SparkleOrigin();
            for (int k = 0; k < n; k++)
            {
                var p = c + new Vector3((Rand() - 0.5f) * 3.2f, Rand() * 1.6f, (Rand() - 0.5f) * 1.6f);
                var v = new Vector3(0f, 0.4f + Rand() * 0.6f, 0f) * Calm;
                FxParticles.Emit(_sparkle, p, v, 0.12f + 0.12f * Rand(), SparkleLife, Color.white);
            }
        }

        /// <summary>Above the drum, camera side, so the sparkle reads over the truck and the pour.</summary>
        Vector3 SparkleOrigin()
        {
            if (_rig.body != null) return _rig.body.TransformPoint(SparkleLocal);
            return truck != null ? truck.position + new Vector3(-0.6f, 2.3f, -0.9f) : Vector3.zero;
        }

        /// <summary>Cheap deterministic 0..1 noise (no UnityEngine.Random so runs stay reproducible).</summary>
        float Rand()
        {
            _seed ^= _seed << 13; _seed ^= _seed >> 17; _seed ^= _seed << 5;
            return (_seed & 0xFFFFFF) / 16777216f;
        }
    }
}
