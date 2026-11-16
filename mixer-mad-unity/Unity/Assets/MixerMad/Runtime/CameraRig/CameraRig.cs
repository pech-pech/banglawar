using UnityEngine;
using Unity.Cinemachine;

namespace MixerMad.Game
{
    /// <summary>
    /// Side-on camera. Perspective, vertical FOV 30 (near-ortho feel, still parallax), looking along +Z.
    /// Visible height at the truck plane = 17 m at rest, 14-21 m zoom band (speed lead-out up to 21 m at top
    /// speed, never tighter than 14). Distance d = (H / 2) / tan(15 deg) = 31.7 m for 17 m.
    /// Vertical-fit: Unity's FOV is vertical, so a Fold's narrow aspect shows less width, same height.
    ///
    /// Cinemachine 3 (namespace Unity.Cinemachine):
    ///   CM_Main (PositionComposer: damping 0.35 s, vertical dead zone 1.5 m; the truck sits a little below centre
    ///            so the road reads at about 68% of the screen height and the cut face takes about a third, as in v7h)
    ///   CM_Jump / CM_Crash (tighter, take priority during the slow-mo moments)
    ///   CM_Finish_Mixer (script-driven: a framing that always holds the wheels and the pour, a short arc and a slow
    ///            push-in, depth of field starting just behind the truck; Calm motion cuts to a still framing instead)
    ///   CM_Garage (orbit, driven by GarageStub)
    ///   CinemachineBrain blend 0.5 s EaseInOut. Impulse on landings (off in Calm motion).
    /// The camera only READS the sim; it moves its own proxy transform, never the truck.
    /// </summary>
    [DefaultExecutionOrder(40)]
    [DisallowMultipleComponent]
    public sealed class CameraRig : MonoBehaviour
    {
        public const float Fov = 30f;
        public const float HeightRest = 17f, HeightMin = 14f, HeightMax = 21f;
        /// <summary>Where the follow target sits on screen (Cinemachine 3: 0 = centre, +y is DOWN, 0.5 = edge).</summary>
        public const float TargetScreenY = 0.03f;
        public const float FinishFov = 34f;

        public Camera cam;
        public Transform proxy;
        public CinemachineCamera cmMain, cmJump, cmCrash, cmFinish, cmGarage;
        public CinemachineBrain brain;
        public CinemachineImpulseSource impulse;

        [Header("Feel")]
        public float lookAheadFraction = 0.20f;
        public float lookAheadMax = 4f;
        public float verticalDeadZone = 1.5f;
        public float dampingSeconds = 0.35f;
        public float topSpeed = 15f;
        public float finishDelay = 0.6f;
        public float finishDuration = 3.2f;
        public float finishPushSeconds = 7f;

        public float VisibleHeight { get; private set; } = HeightRest;

        SimDriver _sim;
        float _height = HeightRest, _lead;
        Spring _y;
        bool _finishing, _finishCalm, _finishLive, _garage;
        float _finishT, _finishWait;
        Vector3 _finishP;
        Vector3 _garageTarget; float _garageYaw = -20f, _garagePitch = 10f, _garageDist = 11f;

        internal static float DistanceFor(float visibleHeight) => visibleHeight * 0.5f / Mathf.Tan(Fov * 0.5f * Mathf.Deg2Rad);

        // ----------------------------------------------------------------------------- build
        public static CameraRig Build(Camera camera, Transform parent)
        {
            var rigGo = new GameObject("CameraRig");
            rigGo.transform.SetParent(parent, false);
            var rig = rigGo.AddComponent<CameraRig>();
            rig.cam = camera;
            camera.fieldOfView = Fov; camera.nearClipPlane = 1f; camera.farClipPlane = 700f;
            camera.transform.rotation = Quaternion.identity;

            rig.brain = camera.TryGetComponent<CinemachineBrain>(out var brain) ? brain : camera.gameObject.AddComponent<CinemachineBrain>();
            rig.brain.DefaultBlend = new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.EaseInOut, 0.5f);
            rig.brain.UpdateMethod = CinemachineBrain.UpdateMethods.LateUpdate;

            var proxyGo = new GameObject("CameraTarget");
            proxyGo.transform.SetParent(rigGo.transform, false);
            rig.proxy = proxyGo.transform;

            rig.cmMain = MakeFollowCam(rigGo.transform, "CM_Main", rig.proxy, HeightRest, 10, true);
            rig.cmJump = MakeFollowCam(rigGo.transform, "CM_Jump", rig.proxy, 15f, 0, false);
            rig.cmCrash = MakeFollowCam(rigGo.transform, "CM_Crash", rig.proxy, 14.2f, 0, false);

            rig.cmFinish = MakeFreeCam(rigGo.transform, "CM_Finish_Mixer", FinishFov);
            rig.cmGarage = MakeFreeCam(rigGo.transform, "CM_Garage", 30f);

            rig.impulse = rigGo.AddComponent<CinemachineImpulseSource>();
            return rig;
        }

        static void SetPriority(CinemachineCamera c, int v)
        {
            c.Priority.Enabled = true;
            c.Priority.Value = v;
        }

        static CinemachineCamera MakeFollowCam(Transform parent, string name, Transform target, float visibleHeight, int priority, bool listener)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.rotation = Quaternion.identity;
            var c = go.AddComponent<CinemachineCamera>();
            c.Follow = target;
            c.Lens.FieldOfView = Fov;
            c.Lens.NearClipPlane = 1f; c.Lens.FarClipPlane = 700f;
            SetPriority(c, priority);
            var pc = go.AddComponent<CinemachinePositionComposer>();
            pc.CameraDistance = DistanceFor(visibleHeight);
            pc.Damping = new Vector3(0.35f, 0.35f, 0f);
            pc.Composition.ScreenPosition = new Vector2(0f, TargetScreenY);
            pc.Composition.DeadZone.Enabled = true;
            pc.Composition.DeadZone.Size = new Vector2(0f, 1.5f / visibleHeight);
            pc.Lookahead.Enabled = false;                       // we lead the proxy ourselves (20% of speed)
            if (listener) go.AddComponent<CinemachineImpulseListener>();
            return c;
        }

        static CinemachineCamera MakeFreeCam(Transform parent, string name, float fov)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            var c = go.AddComponent<CinemachineCamera>();      // no Body/Aim: it uses its own transform
            c.Lens.FieldOfView = fov; c.Lens.NearClipPlane = 0.5f; c.Lens.FarClipPlane = 700f;
            SetPriority(c, -1);
            return c;
        }

        // ----------------------------------------------------------------------------- lifecycle
        void Start()
        {
            _sim = SimDriver.Instance;
            if (_sim != null)
            {
                _sim.SimEventRaised += OnSimEvent;
                _sim.Restarted += OnRestart;
                _sim.Teleported += SnapProxy;
                if (_sim.slowMo != null) _sim.slowMo.ModeChanged += OnSlowMoMode;
                SnapProxy();
            }
            CinemachineCore.GetBlendOverride = BlendOverride;
        }

        void OnDestroy()
        {
            if (CinemachineCore.GetBlendOverride == BlendOverride) CinemachineCore.GetBlendOverride = null;
            if (_sim != null)
            {
                _sim.SimEventRaised -= OnSimEvent; _sim.Restarted -= OnRestart; _sim.Teleported -= SnapProxy;
                if (_sim.slowMo != null) _sim.slowMo.ModeChanged -= OnSlowMoMode;
            }
        }

        /// <summary>
        /// Restart or respawn: a hard cut to the truck. Reads Curr (the post-teleport state), drops the crash/jump
        /// cameras, kills any impulse and blend, and tells every Cinemachine camera its previous state is invalid,
        /// so nothing damps, blends or shakes across the jump.
        /// </summary>
        internal void SnapProxy() => SnapTo(_sim.Curr);

        /// <summary>
        /// The cut itself: zoom band, look-ahead, vertical spring and Composer settings jump straight to the framing the
        /// follow would settle on for this pose, so nothing eases in after the cut (a restart from fast mid-air used to
        /// leave the zoom wide and drift it back in over the first second).
        /// </summary>
        internal void SnapTo(SimSnapshot s)
        {
            _height = SettledHeight(s.speed, topSpeed);
            _lead = SettledLead(s.velocity.x, lookAheadFraction, lookAheadMax);
            _y = new Spring(s.chassisPos.y + 1.2f);
            ApplyFraming();
            proxy.position = new Vector3(s.chassisPos.x + _lead, _y.value, 0f);
            if (!_finishing) { SetPriority(cmJump, 0); SetPriority(cmCrash, 0); }
            foreach (var c in new[] { cmMain, cmJump, cmCrash, cmFinish })
                if (c != null) c.PreviousStateIsValid = false;
            if (CinemachineImpulseManager.Instance != null) CinemachineImpulseManager.Instance.Clear();
            if (brain != null) brain.ResetState();
            CutUntilFrame = Time.frameCount + CutFrames;   // the priority changes above take effect in the brain's next update
        }

        // ----------------------------------------------------------------------------- hard cuts
        const int CutFrames = 2;
        /// <summary>Until this frame every camera change is a cut: no blend from the crash/finish camera across a teleport.</summary>
        internal static int CutUntilFrame = -1;

        internal static CinemachineBlendDefinition BlendOverride(ICinemachineCamera from, ICinemachineCamera to, CinemachineBlendDefinition defaultBlend, Object owner)
        {
            if (Time.frameCount <= CutUntilFrame) return new CinemachineBlendDefinition(CinemachineBlendDefinition.Styles.Cut, 0f);
            return defaultBlend;
        }

        void OnRestart()
        {
            _finishing = false; _finishLive = false; _finishWait = 0f; _finishT = 0f;
            SetPriority(cmFinish, -1); SetPriority(cmJump, 0); SetPriority(cmCrash, 0);
            var q = QualityPresets.Instance; if (q) q.SetFinishDof(0f);
            SnapProxy();
        }

        void OnSimEvent(SimEvent e)
        {
            if (e.kind == SimEventKind.Landing && impulse != null && !MMSettings.CalmMotion)
                impulse.GenerateImpulseWithForce(Mathf.Clamp01(e.magnitude / 15f) * 0.5f);
            else if (e.kind == SimEventKind.Crash && impulse != null && !MMSettings.CalmMotion)
                impulse.GenerateImpulseWithForce(0.9f);
            else if (e.kind == SimEventKind.Finish)
            {
                // Calm motion still gets the finish framing, but as a cut to a still shot: no swoop, no push-in, no blur
                _finishWait = finishDelay; _finishCalm = MMSettings.CalmMotion; _finishLive = false;
                _finishP = TruckPos();
                _finishing = true; _finishT = -finishDelay;
            }
        }

        void OnSlowMoMode(SlowMo.Mode m)
        {
            if (MMSettings.CalmMotion || _finishing) { SetPriority(cmJump, 0); SetPriority(cmCrash, 0); return; }
            SetPriority(cmJump, m == SlowMo.Mode.Jump ? 20 : 0);
            SetPriority(cmCrash, m == SlowMo.Mode.Crash ? 25 : 0);
        }

        // ----------------------------------------------------------------------------- per frame
        void Update()
        {
            if (_sim == null) return;
            float dt = Time.unscaledDeltaTime;
            Follow(_sim.Render, dt);
            UpdateFinish(dt);
            UpdateGarage();
        }

        /// <summary>One follow step: zoom band and look-ahead ease toward their settled values, the proxy tracks the truck.</summary>
        internal void Follow(SimSnapshot s, float dt)
        {
            // zoom band: 17 m at rest, up to 21 m at top speed, never inside 14
            _height = MMMath.Damp(_height, SettledHeight(s.speed, topSpeed), 0.6f, dt);
            ApplyFraming();

            // proxy: truck + 20% look-ahead (max 4 m); vertical follow is spring-smoothed, Composer adds the dead zone
            _lead = MMMath.Damp(_lead, SettledLead(s.velocity.x, lookAheadFraction, lookAheadMax), 0.35f, dt);
            _y.Step(s.chassisPos.y + 1.2f, 40f, 12f, dt);
            proxy.position = new Vector3(s.chassisPos.x + _lead, _y.value, 0f);
        }

        /// <summary>The visible height the follow settles on at this speed.</summary>
        internal static float SettledHeight(float speed, float topSpeed) =>
            Mathf.Clamp(Mathf.Lerp(HeightRest, HeightMax, Mathf.Clamp01(speed / topSpeed)), HeightMin, HeightMax);

        /// <summary>The look-ahead the follow settles on at this forward speed (a little lead backwards, more forwards).</summary>
        internal static float SettledLead(float velocityX, float fraction, float max) =>
            Mathf.Clamp(velocityX * fraction, -max * 0.25f, max);

        /// <summary>Pushes the current zoom into CM_Main's Composer (distance, dead zone, damping).</summary>
        void ApplyFraming()
        {
            VisibleHeight = _height;
            var pc = cmMain.GetComponent<CinemachinePositionComposer>();
            pc.CameraDistance = DistanceFor(_height);
            pc.Composition.DeadZone.Size = new Vector2(0f, verticalDeadZone / _height);
            pc.Damping = new Vector3(dampingSeconds, dampingSeconds, 0f);
        }

        Vector3 TruckPos() { var c = _sim.Render.chassisPos; return new Vector3(c.x, c.y, 0f); }

        void UpdateFinish(float dt)
        {
            if (!_finishing) return;
            _finishT += dt;
            if (_finishT < 0f) { _finishP = TruckPos(); return; }             // the truck settles on the flag; then the shot locks
            if (!_finishLive)
            {
                _finishLive = true;
                if (_finishCalm) CutUntilFrame = Time.frameCount + CutFrames;   // Calm motion: no blend swoop into the shot
            }
            SetPriority(cmFinish, 30);

            float aspect = cam != null && cam.aspect > 0f ? cam.aspect : 16f / 9f;
            var pose = FinishPose(_finishP, _finishT, aspect, _finishCalm, finishDuration, finishPushSeconds);
            cmFinish.transform.SetPositionAndRotation(pose.pos, Quaternion.LookRotation(pose.look - pose.pos, Vector3.up));

            var q = QualityPresets.Instance;
            if (q != null) q.SetFinishDof(Mathf.Clamp01(_finishT / 0.3f), pose.focus, FinishDofStart(pose.focus));
        }

        // ----------------------------------------------------------------------------- finish framing (pure, tested)

        /// <summary>The box the finish shot must hold, relative to the sim chassis position (the wheels touch the ground
        /// about 1.1 m below it): the pour behind the chute on the left, the cab on the right, the wheels and a strip of
        /// ground at the bottom, and about a metre of headroom over the drum for the result card.</summary>
        public static readonly Rect FinishFrame = Rect.MinMaxRect(-4.7f, -1.9f, 3.1f, 4.1f);
        public const float FinishDepth = 1.3f;          // half the truck's depth (z), so the near wheels count too
        public const float FinishSafe = 0.92f;          // the box may use 92% of the frame: a little air round the shot
        public const float FinishPushFrom = 1.15f;
        public const float YawFrom = -24f, YawTo = 10f, PitchFrom = 5f, PitchTo = 12f, CalmYaw = -10f, CalmPitch = 8f;

        public struct Pose { public Vector3 pos, look; public float focus; }

        /// <summary>Smallest distance from the look point (along the given yaw/pitch) at which the whole finish box,
        /// with the truck's depth, fits inside FinishSafe of the frame. Binary search; the box is tiny, so it is cheap.</summary>
        public static float FitDistance(float yaw, float pitch, float aspect)
        {
            float lo = 1f, hi = 80f;
            for (int i = 0; i < 24; i++)
            {
                float mid = 0.5f * (lo + hi);
                if (BoxInFrame(mid, yaw, pitch, aspect, FinishSafe)) hi = mid; else lo = mid;
            }
            return hi;
        }

        /// <summary>True when every corner of the finish box (truck at the origin) is inside `safe` of the view.</summary>
        public static bool BoxInFrame(float dist, float yaw, float pitch, float aspect, float safe)
        {
            var rot = Quaternion.Euler(pitch, yaw, 0f);
            Vector3 look = new Vector3(FinishFrame.center.x, FinishFrame.center.y, 0f);
            Vector3 pos = look + rot * new Vector3(0f, 0f, -dist);
            return BoxInView(Vector3.zero, pos, rot, aspect, safe);
        }

        /// <summary>Projects the 8 corners of the finish box around `truck` through a camera at pos/rot (FinishFov).</summary>
        public static bool BoxInView(Vector3 truck, Vector3 pos, Quaternion rot, float aspect, float safe)
        {
            float tanV = Mathf.Tan(FinishFov * 0.5f * Mathf.Deg2Rad);
            var inv = Quaternion.Inverse(rot);
            for (int i = 0; i < 8; i++)
            {
                var c = new Vector3((i & 1) == 0 ? FinishFrame.xMin : FinishFrame.xMax, (i & 2) == 0 ? FinishFrame.yMin : FinishFrame.yMax, (i & 4) == 0 ? -FinishDepth : FinishDepth);
                Vector3 l = inv * (truck + c - pos);
                if (l.z <= 0.1f) return false;
                if (Mathf.Abs(l.y) > safe * l.z * tanV || Mathf.Abs(l.x) > safe * l.z * tanV * aspect) return false;
            }
            return true;
        }

        /// <summary>Finish camera at time t after it takes over: a short arc across the truck and a slow push-in that
        /// ends exactly at the fit distance, so the wheels and the pour never leave the frame. Calm = one still pose.</summary>
        public static Pose FinishPose(Vector3 truck, float t, float aspect, bool calm, float arcSeconds, float pushSeconds)
        {
            Vector3 look = truck + new Vector3(FinishFrame.center.x, FinishFrame.center.y, 0f);
            float yaw, pitch, dist;
            if (calm) { yaw = CalmYaw; pitch = CalmPitch; dist = FitDistance(yaw, pitch, aspect); }
            else
            {
                float e = MMMath.EaseInOut(Mathf.Clamp01(t / Mathf.Max(0.01f, arcSeconds)));
                float push = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(t / Mathf.Max(0.01f, pushSeconds)));
                yaw = Mathf.Lerp(YawFrom, YawTo, e); pitch = Mathf.Lerp(PitchFrom, PitchTo, e);
                // fit at the current angle, eased in from further back; never closer than the fit
                dist = FitDistance(yaw, pitch, aspect) * Mathf.Lerp(FinishPushFrom, 1f, push);
            }
            Vector3 pos = look + Quaternion.Euler(pitch, yaw, 0f) * new Vector3(0f, 0f, -dist);
            return new Pose { pos = pos, look = look, focus = dist };
        }

        /// <summary>Depth of field starts this far behind the focus point (the truck is about 2.6 m deep, so it stays sharp).</summary>
        public const float DofBehindFocus = 3.5f;
        public static float FinishDofStart(float focusMetres) => focusMetres + DofBehindFocus;

        // ----------------------------------------------------------------------------- garage
        public void SetGarage(bool on, Vector3 target)
        {
            _garage = on; _garageTarget = target;
            SetPriority(cmGarage, on ? 40 : -1);
        }

        public void OrbitGarage(float dYaw, float dPitch, float dZoom)
        {
            _garageYaw += dYaw; _garagePitch = Mathf.Clamp(_garagePitch + dPitch, -5f, 55f);
            _garageDist = Mathf.Clamp(_garageDist + dZoom, 6f, 18f);
        }

        void UpdateGarage()
        {
            if (!_garage) return;
            Quaternion r = Quaternion.Euler(_garagePitch, _garageYaw, 0f);
            Vector3 pos = _garageTarget + r * new Vector3(0f, 0f, -_garageDist);
            cmGarage.transform.SetPositionAndRotation(pos, Quaternion.LookRotation(_garageTarget - pos, Vector3.up));
        }
    }
}
