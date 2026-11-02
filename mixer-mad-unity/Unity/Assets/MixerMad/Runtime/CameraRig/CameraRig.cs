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
    ///   CM_Main (PositionComposer: damping 0.35 s, vertical dead zone 1.5 m)
    ///   CM_Jump / CM_Crash (tighter, take priority during the slow-mo moments)
    ///   CM_Finish_Mixer (script-driven 3 s swoop with three keys, depth of field pull-focus)
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

        public float VisibleHeight { get; private set; } = HeightRest;

        SimDriver _sim;
        float _height = HeightRest, _lead;
        Spring _y;
        bool _finishing, _garage;
        float _finishT, _finishWait;
        Vector3 _finishP;
        Vector3 _garageTarget; float _garageYaw = -20f, _garagePitch = 10f, _garageDist = 11f;

        static float DistanceFor(float visibleHeight) => visibleHeight * 0.5f / Mathf.Tan(Fov * 0.5f * Mathf.Deg2Rad);

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

            rig.cmFinish = MakeFreeCam(rigGo.transform, "CM_Finish_Mixer", 34f);
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
            pc.Composition.ScreenPosition = new Vector2(0f, -0.10f);
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
        }

        void OnDestroy()
        {
            if (_sim != null)
            {
                _sim.SimEventRaised -= OnSimEvent; _sim.Restarted -= OnRestart; _sim.Teleported -= SnapProxy;
                if (_sim.slowMo != null) _sim.slowMo.ModeChanged -= OnSlowMoMode;
            }
        }

        void SnapProxy()
        {
            var s = _sim.Render;
            _y = new Spring(s.chassisPos.y + 1.2f);
            _lead = 0f;
            proxy.position = new Vector3(s.chassisPos.x, _y.value, 0f);
            if (cmMain != null) cmMain.PreviousStateIsValid = false;
        }

        void OnRestart()
        {
            _finishing = false; _finishWait = 0f; _finishT = 0f;
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
            else if (e.kind == SimEventKind.Finish && !MMSettings.CalmMotion)
            {
                _finishWait = finishDelay; _finishP = new Vector3(e.pos.x, e.pos.y, 0f);
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
            var s = _sim.Render;
            float dt = Time.unscaledDeltaTime;

            // zoom band: 17 m at rest, up to 21 m at top speed, never inside 14
            float target = Mathf.Lerp(HeightRest, HeightMax, Mathf.Clamp01(s.speed / topSpeed));
            _height = MMMath.Damp(_height, Mathf.Clamp(target, HeightMin, HeightMax), 0.6f, dt);
            VisibleHeight = _height;
            var pc = cmMain.GetComponent<CinemachinePositionComposer>();
            pc.CameraDistance = DistanceFor(_height);
            pc.Composition.DeadZone.Size = new Vector2(0f, verticalDeadZone / _height);
            pc.Damping = new Vector3(dampingSeconds, dampingSeconds, 0f);

            // proxy: truck + 20% look-ahead (max 4 m); vertical follow is spring-smoothed, Composer adds the dead zone
            float leadTarget = Mathf.Clamp(s.velocity.x * lookAheadFraction, -lookAheadMax * 0.25f, lookAheadMax);
            _lead = MMMath.Damp(_lead, leadTarget, 0.35f, dt);
            _y.Step(s.chassisPos.y + 1.2f, 40f, 12f, dt);
            proxy.position = new Vector3(s.chassisPos.x + _lead, _y.value, 0f);

            UpdateFinish(dt);
            UpdateGarage();
        }

        void UpdateFinish(float dt)
        {
            if (!_finishing) return;
            _finishT += dt;
            if (_finishT < 0f) return;
            float u = Mathf.Clamp01(_finishT / finishDuration);
            SetPriority(cmFinish, 30);

            // three keys: low arc front-left -> profile of the filled gap -> rise and look down on the surface glint
            Vector3 P = _finishP;
            Vector3 k0 = P + new Vector3(7.5f, 1.2f, -10f);
            Vector3 k1 = P + new Vector3(0.5f, 1.8f, -12.5f);
            Vector3 k2 = P + new Vector3(-7.5f, 4.2f, -12f);
            Vector3 look0 = P + new Vector3(-0.5f, 1.6f, 0f);
            Vector3 look2 = P + new Vector3(-4.5f, 0.2f, 0f);
            float e = MMMath.EaseInOut(u);
            Vector3 a = Vector3.Lerp(k0, k1, e), b = Vector3.Lerp(k1, k2, e);
            Vector3 pos = Vector3.Lerp(a, b, e);                               // quadratic Bezier through the keys' hull
            Vector3 look = Vector3.Lerp(look0, look2, e);
            cmFinish.transform.position = pos;
            cmFinish.transform.rotation = Quaternion.LookRotation((look - pos).normalized, Vector3.up);

            var q = QualityPresets.Instance;
            if (q != null) { q.SetFinishDof(Mathf.Clamp01(_finishT / 0.3f)); q.SetFocusDistance(Vector3.Distance(pos, P + Vector3.up)); }
        }

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
