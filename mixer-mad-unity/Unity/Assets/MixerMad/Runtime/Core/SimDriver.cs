using System;
using System.Diagnostics;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Owns the sim clock. Runs its OWN fixed 120 Hz accumulator (never FixedUpdate, never Time.timeScale),
    /// calls Backend.Step(input), keeps the previous and current snapshots and exposes an interpolated one
    /// for drawing. Slow-mo only changes how fast time is ADDED to the accumulator; the step size and the
    /// per-step inputs are untouched, so graphics can never change gameplay.
    ///
    /// Execution order -100: runs before every view script in the same frame.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    [DisallowMultipleComponent]
    public sealed class SimDriver : MonoBehaviour
    {
        public static SimDriver Instance { get; private set; }

        [Tooltip("Force the built-in demo physics even if MixerMad.Sim is wired in (for graphics-only tests).")]
        public bool forceDemoBackend = false;
        [Tooltip("Ignore slow-mo (bots, tests, Daily seeds).")]
        public bool slowMoOff = false;

        public SlowMo slowMo;

        public ISimBackend Backend { get; private set; }
        public ISimInputSource InputSource { get; set; }

        public readonly SimSnapshot Prev = new SimSnapshot();
        public readonly SimSnapshot Curr = new SimSnapshot();
        /// <summary>Interpolated state for drawing. Read-only for everyone except this class.</summary>
        public readonly SimSnapshot Render = new SimSnapshot();

        public bool Paused { get; set; }
        public float Alpha { get; private set; }
        /// <summary>Real frame delta times the current slow-mo factor. Animation speed for slow-mo-aware views.</summary>
        public float PresentationDelta { get; private set; }
        public float RealDelta { get; private set; }
        public float SpeedScale { get; private set; } = 1f;
        public int StepsLastFrame { get; private set; }
        public double LastSimMs { get; private set; }
        public double AvgSimMsPerStep { get; private set; }
        public long TotalSteps { get; private set; }

        /// <summary>Fired for every sim event, in step order, right after the step that produced it.</summary>
        public event Action<SimEvent> SimEventRaised;
        /// <summary>Fired after a restart so views can snap instead of smoothing across a teleport.</summary>
        public event Action Restarted;
        /// <summary>Fired when the truck jumps (restart or crash respawn) so views and the camera snap.</summary>
        public event Action Teleported;

        FixedStepClock _clock;
        readonly Stopwatch _sw = new Stopwatch();

        void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(this); return; }
            Instance = this;
            Backend = BackendFactory.Create(forceDemoBackend);
            _clock = new FixedStepClock(Backend.StepSeconds);
            if (InputSource == null) InputSource = GetComponent<ISimInputSource>();
            if (slowMo == null) slowMo = GetComponent<SlowMo>();
            if (slowMo != null) slowMo.Bind(this);
            SnapAll();
        }

        void OnDestroy() { if (Instance == this) Instance = null; }

        public void Restart()
        {
            Backend.Reset();
            _clock = new FixedStepClock(Backend.StepSeconds);
            if (slowMo != null) slowMo.ResetRun();
            SnapAll();
            Restarted?.Invoke();
            Teleported?.Invoke();
        }

        void SnapAll()
        {
            Backend.Capture(Curr);
            Prev.CopyFrom(Curr);
            Render.CopyFrom(Curr);
            Alpha = 0f;
        }

        void Update() { Tick(Time.unscaledDeltaTime); }

        /// <summary>Tests: run the sim on a given backend without the factory (call before any Tick).</summary>
        internal void InitForTests(ISimBackend backend)
        {
            Instance = this;
            Backend = backend;
            _clock = new FixedStepClock(Backend.StepSeconds);
            SnapAll();
        }

        /// <summary>One frame of real time: steps the sim, raises events, interpolates Render.</summary>
        internal void Tick(float realDelta)
        {
            float dt = Mathf.Min(realDelta, 0.1f);
            RealDelta = dt;
            float scale = Paused ? 0f : (slowMo != null && !slowMoOff ? slowMo.Scale : 1f);
            SpeedScale = scale;
            PresentationDelta = dt * scale;

            int steps = 0;
            _sw.Restart();
            if (!Paused)
            {
                _clock.Add(dt * scale);
                while (_clock.TryConsume())
                {
                    SimInput input = InputSource != null ? InputSource.Sample() : SimInput.None;
                    Prev.CopyFrom(Curr);
                    Backend.Step(in input);       // <-- the one and only place the sim advances
                    Backend.Capture(Curr);
                    steps++;
                    while (Backend.TryDequeueEvent(out SimEvent e))
                    {
                        SimEventRaised?.Invoke(e);
                        if (e.kind == SimEventKind.Respawn)
                        {
                            // The truck jumped: drop the pre-crash state everywhere BEFORE the views snap, or they
                            // read the stale Render (the crash spot) and glide or pop to the respawn point a frame later.
                            Prev.CopyFrom(Curr); Render.CopyFrom(Curr);
                            Teleported?.Invoke();
                        }
                    }
                }
            }
            _sw.Stop();
            StepsLastFrame = steps;
            TotalSteps += steps;
            LastSimMs = _sw.Elapsed.TotalMilliseconds;
            if (steps > 0) AvgSimMsPerStep = Mathf.Lerp((float)AvgSimMsPerStep, (float)(LastSimMs / steps), 0.05f);

            Alpha = _clock.Alpha;
            SimSnapshot.Lerp(Prev, Curr, Alpha, Render);

            if (slowMo != null) slowMo.Tick(dt, this);
        }
    }

    /// <summary>The single place that decides which physics runs.</summary>
    public static class BackendFactory
    {
        public static ISimBackend Create(bool forceDemo)
        {
            if (!forceDemo)
            {
                var real = MixerSimBackend.TryCreate();
                if (real != null) return real;
            }
            return new DemoSimBackend();
        }
    }
}
