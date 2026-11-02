using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Maps the sim snapshot onto the rigged 3D truck. READ ONLY: this script never writes to the sim.
    ///
    /// Root transform = chassis origin (bottom centre) from the interpolated snapshot.
    ///  - Wheels: suspension = the sim wheel-to-body gap (delta from the rest pose, second-order filtered,
    ///    clamped so a wheel never visibly leaves the body); spin comes from travel distance / radius.
    ///  - Drum: rpm from speed and load; Chute: opens in the finish; Squash/stretch on the Visual child.
    ///  - Lean: small body pitch from acceleration. Headlights switch on at night.
    ///
    /// Names the Blender rig must use (also what the placeholder uses):
    ///   Visual > Body > Drum (spin on local X) , Chute , Driver_Seat , Headlight_L/R
    ///   Susp_F_n / Susp_R_n (slide on Y) > Wheel_F_n / Wheel_R_n (spin on Z).  n = 0,1,... ; F = front axle, R = rear axle.
    /// </summary>
    [DefaultExecutionOrder(10)]
    public sealed class TruckView : MonoBehaviour
    {
        [System.Serializable]
        public class WheelBind
        {
            public Transform susp, spin;
            public int simIndex;
            public float radius = 0.5f;
            [System.NonSerialized] public Vector3 restPos;
            [System.NonSerialized] public Spring offset;
            [System.NonSerialized] public Vector2 prevWorld;
            [System.NonSerialized] public Vector2 simRestLocal;
            [System.NonSerialized] public bool restSet, hasPrev;
            [System.NonSerialized] public float spinDeg;
        }

        [Header("Rig (auto-bound by name when empty)")]
        public Transform visual, body, drum, chute, driverSeat;
        public List<WheelBind> wheels = new List<WheelBind>();
        public Light[] headlights;
        public SquashStretch squash;
        public DriverView driver;

        [Header("Tuning")]
        public float suspTravel = 0.2f;          // sim travel + 10 %
        public float suspK = 420f, suspD = 34f;
        public float wheelRadius = 0.5f;         // physics value, exact
        public float drumIdleRpm = 3f, drumMaxRpm = 14f, topSpeed = 15f;
        public float chuteClosedDeg = -14f, chuteOpenDeg = 40f;
        public float leanMaxDeg = 2.5f;
        [Tooltip("Place the wheel nodes at the sim's wheel positions (S3: wheel positions come from the sim, never the reverse).")]
        public bool snapWheelsToSim = true;
        [Tooltip("The sim has rigid wheels, so the visual spring-damper is driven by the chassis vertical acceleration.")]
        public float bounceGain = 0.012f;

        SimDriver _sim;
        Quaternion _drumRest, _chuteRest, _bodyRest;
        float _drumDeg;
        Spring _chute, _lean;
        float _chuteTarget;
        float _prevVx, _prevVy, _bounce;
        bool _skipAccel;
        Vector2 _prevVel;
        bool _first = true;

        void Awake() { AutoBind(); }

        void Start()
        {
            _sim = SimDriver.Instance;
            if (_sim != null) { _sim.SimEventRaised += OnSimEvent; _sim.Teleported += OnRestart; }
        }

        void OnDestroy()
        {
            if (_sim != null) { _sim.SimEventRaised -= OnSimEvent; _sim.Teleported -= OnRestart; }
        }

        static Transform FindDeep(Transform root, string n)
        {
            if (root.name == n) return root;
            for (int i = 0; i < root.childCount; i++) { var r = FindDeep(root.GetChild(i), n); if (r) return r; }
            return null;
        }

        public void AutoBind()
        {
            if (visual == null) visual = FindDeep(transform, "Visual") ?? transform;
            if (body == null) body = FindDeep(transform, "Body") ?? visual;
            if (drum == null) drum = FindDeep(transform, "Drum");
            if (chute == null) chute = FindDeep(transform, "Chute");
            if (driverSeat == null) driverSeat = FindDeep(transform, "Driver_Seat");
            if (squash == null) squash = visual.GetComponent<SquashStretch>() ?? (visual != transform ? visual.gameObject.AddComponent<SquashStretch>() : null);
            if (driver == null) driver = GetComponentInChildren<DriverView>();
            if (driver == null && driverSeat != null && driverSeat.childCount > 0) driver = driverSeat.GetChild(0).gameObject.AddComponent<DriverView>();
            if (headlights == null || headlights.Length == 0) headlights = GetComponentsInChildren<Light>(true);

            if (wheels.Count == 0)
            {
                foreach (var t in GetComponentsInChildren<Transform>(true))
                {
                    if (!t.name.StartsWith("Wheel_")) continue;
                    // Wheel_F_0 / Wheel_R_1 ...
                    bool front = t.name.StartsWith("Wheel_F");
                    var susp = t.parent != null && t.parent.name.StartsWith("Susp_") ? t.parent : null;
                    wheels.Add(new WheelBind { spin = t, susp = susp != null ? susp : t, simIndex = front ? 1 : 0, radius = wheelRadius });
                }
            }
            foreach (var w in wheels) if (w.susp) w.restPos = w.susp.localPosition;
            if (drum) _drumRest = drum.localRotation;
            if (chute) _chuteRest = chute.localRotation;
            if (body) _bodyRest = body.localRotation;
        }

        float _poke; bool _pokeDrum;

        /// <summary>Garage: tap a part to wiggle it (works while the sim is paused).</summary>
        public void Poke(bool drumPart) { _poke = 1.6f; _pokeDrum = drumPart; }

        void OnRestart()
        {
            foreach (var w in wheels) { w.restSet = false; w.hasPrev = false; w.offset = default; }
            _first = true; _chuteTarget = 0f; _bounce = 0f; _skipAccel = true;
        }

        void OnSimEvent(SimEvent e)
        {
            switch (e.kind)
            {
                case SimEventKind.Landing: if (squash) squash.Landing(e.magnitude); break;
                case SimEventKind.Takeoff: if (squash) squash.Takeoff(); break;
                case SimEventKind.Crash: if (squash) squash.Crash(); break;
                case SimEventKind.Finish: _chuteTarget = 1f; break;
            }
        }

        void Update()
        {
            if (_sim == null) return;
            var s = _sim.Render;
            float dt = _sim.PresentationDelta;

            if (_poke > 0f)
            {
                _poke -= Time.unscaledDeltaTime;
                if (_pokeDrum) _drumDeg = Mathf.Repeat(_drumDeg + 432f * Time.unscaledDeltaTime, 360f);
                else { _chute.value = 0.5f + 0.5f * Mathf.Sin(_poke * 8f); _chute.velocity = 0f; }
            }

            // --- root: straight from the interpolated sim state
            transform.position = new Vector3(s.chassisPos.x, s.chassisPos.y, 0f);
            transform.rotation = Quaternion.Euler(0f, 0f, s.chassisAngle * Mathf.Rad2Deg);

            float c = Mathf.Cos(s.chassisAngle), sn = Mathf.Sin(s.chassisAngle);
            Vector2 fwd = new Vector2(c, sn);

            if (_skipAccel) { _prevVel = s.velocity; _prevVx = s.velocity.x; _skipAccel = false; }

            // chassis-frame vertical acceleration -> visual suspension travel (wheels droop in the air, compress on landings)
            if (dt > 0f)
            {
                Vector2 acc = (s.velocity - _prevVel) / dt;
                float ayLocal = -acc.x * sn + acc.y * c;
                _bounce = Mathf.Lerp(_bounce, Mathf.Clamp(ayLocal * bounceGain, -suspTravel, suspTravel), 0.35f);
                _prevVel = s.velocity;
            }

            // --- wheels
            foreach (var w in wheels)
            {
                if (w.susp == null || w.simIndex >= s.wheelCount) continue;
                Vector2 wp = s.wheelPos[w.simIndex];
                Vector2 d = wp - s.chassisPos;
                Vector2 local = new Vector2(d.x * c + d.y * sn, -d.x * sn + d.y * c);
                if (!w.restSet)
                {
                    w.simRestLocal = local; w.restSet = true;
                    if (snapWheelsToSim) w.restPos = new Vector3(local.x, local.y, w.restPos.z);
                }
                float target = Mathf.Clamp(local.y - w.simRestLocal.y + _bounce, -suspTravel, suspTravel);
                if (dt > 0f) w.offset.Step(target, suspK, suspD, dt); else if (_first) w.offset.value = target;
                w.offset.value = Mathf.Clamp(w.offset.value, -suspTravel, suspTravel);
                w.susp.localPosition = w.restPos + new Vector3(0f, w.offset.value, 0f);

                if (w.hasPrev)
                {
                    float travel = Vector2.Dot(wp - w.prevWorld, fwd);
                    if (Mathf.Abs(travel) < 4f) w.spinDeg -= travel / Mathf.Max(0.05f, w.radius) * Mathf.Rad2Deg;
                }
                w.prevWorld = wp; w.hasPrev = true;
                if (w.spin) w.spin.localRotation = Quaternion.Euler(0f, 0f, w.spinDeg);
            }

            // --- drum: rpm = f(speed, load, throttle); pours faster during the finish
            if (drum)
            {
                float sp01 = Mathf.Clamp01(s.speed / topSpeed);
                float rpm = Mathf.Lerp(drumIdleRpm, drumMaxRpm, sp01) * (0.6f + 0.6f * s.load01) + s.throttle * 1.5f;
                if (s.finished) rpm = drumMaxRpm * 0.8f;
                _drumDeg = Mathf.Repeat(_drumDeg + rpm * 6f * dt, 360f);
                drum.localRotation = _drumRest * Quaternion.Euler(_drumDeg, 0f, 0f);
            }

            // --- chute opens in the finish
            if (chute)
            {
                if (dt > 0f) _chute.Step(_chuteTarget, 90f, 12f, dt);
                float ang = Mathf.Lerp(chuteClosedDeg, chuteOpenDeg, Mathf.Clamp01(_chute.value));
                chute.localRotation = _chuteRest * Quaternion.Euler(0f, 0f, ang - chuteClosedDeg);
            }

            // --- lean from acceleration (pitch the body a hair), stretch along travel
            if (dt > 0f)
            {
                float ax = (s.velocity.x - _prevVx) / dt;
                _prevVx = s.velocity.x;
                float leanTarget = Mathf.Clamp(-ax * 0.25f, -leanMaxDeg, leanMaxDeg) * (MMSettings.CalmMotion ? 0.5f : 1f);
                _lean.Step(leanTarget, 70f, 11f, dt);
                if (body) body.localRotation = _bodyRest * Quaternion.Euler(0f, 0f, _lean.value);
                if (squash) { squash.SetAccelStretch(ax * 0.004f); squash.Tick(dt); }
            }

            // --- headlights follow the day-night cycle
            if (headlights != null && DayNight.Instance != null)
            {
                bool on = DayNight.Instance.Night01 > 0.45f;
                for (int i = 0; i < headlights.Length; i++) if (headlights[i] && headlights[i].enabled != on) headlights[i].enabled = on;
            }
            _first = false;
        }
    }
}
