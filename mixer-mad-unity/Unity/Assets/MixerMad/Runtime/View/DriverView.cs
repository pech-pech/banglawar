using System;
using UnityEngine;

namespace MixerMad.Game
{
    public enum DriverEmotion { Idle = 0, GasGrin, AirWoo, Scared, CrashDaze, WinCheer, FailFacepalm }

    /// <summary>
    /// The cartoon builder. Reads sim state and sim events, never writes back.
    /// Priority (top wins): CrashDaze > WinCheer > FailFacepalm > Scared > AirWoo > GasGrin > Idle.
    /// Min hold 0.6 s, blend 0.12 s. Higher priority interrupts the hold.
    ///
    /// Hooks for the Blender rig: an optional Animator gets the int parameter "Emotion" and a trigger "Blink";
    /// an optional SkinnedMeshRenderer gets blend shapes by name (mouth_smile, mouth_open, mouth_O, mouth_frown,
    /// brow_up, brow_worry, brow_angry, eye_wide, eye_squint, cheek_puff). The primitive placeholder poses
    /// transforms by name instead (Head, Hat, Eye_L/R, Pupil_L/R, Brow_L/R, Mouth, Arm_L/R, Sweat, Stars).
    /// </summary>
    [DefaultExecutionOrder(20)]
    public sealed class DriverView : MonoBehaviour
    {
        // ---- design numbers
        public float minHold = 0.6f;
        public float blendTime = 0.12f;
        public float airWooAfter = 0.35f;
        public float scaredTiltDeg = 50f;
        public float edgeLookAhead = 3f;
        public float edgeDrop = 2.5f;
        public float crashDazeSeconds = 2f;
        public float winSeconds = 4f;
        public float failSeconds = 1.6f;

        // ---- optional art hooks
        public Animator animator;
        public SkinnedMeshRenderer face;

        // ---- placeholder transforms (auto-bound by name)
        public Transform head, hat, eyeL, eyeR, pupilL, pupilR, browL, browR, mouth, armL, armR, sweat, starsRoot, torso;
        public SquashStretch squash;

        public DriverEmotion Current { get; private set; } = DriverEmotion.Idle;
        public event Action<DriverEmotion> EmotionChanged;

        struct Pose
        {
            // armRaise: degrees, positive = up (0 = hands forward on the wheel). reach: 0 = in the cab, 1 = the near arm out of the window.
            public float eyeScale, browLift, browAngle, mouthW, mouthH, armRaise, headTilt, lean, sweat, stars, hat, bob, facepalm, reach;
            public static Pose Lerp(Pose a, Pose b, float t)
            {
                return new Pose
                {
                    eyeScale = Mathf.Lerp(a.eyeScale, b.eyeScale, t), browLift = Mathf.Lerp(a.browLift, b.browLift, t),
                    browAngle = Mathf.Lerp(a.browAngle, b.browAngle, t), mouthW = Mathf.Lerp(a.mouthW, b.mouthW, t),
                    mouthH = Mathf.Lerp(a.mouthH, b.mouthH, t), armRaise = Mathf.Lerp(a.armRaise, b.armRaise, t),
                    headTilt = Mathf.Lerp(a.headTilt, b.headTilt, t), lean = Mathf.Lerp(a.lean, b.lean, t),
                    sweat = Mathf.Lerp(a.sweat, b.sweat, t), stars = Mathf.Lerp(a.stars, b.stars, t),
                    hat = Mathf.Lerp(a.hat, b.hat, t), bob = Mathf.Lerp(a.bob, b.bob, t), facepalm = Mathf.Lerp(a.facepalm, b.facepalm, t),
                    reach = Mathf.Lerp(a.reach, b.reach, t)
                };
            }
        }

        static Pose PoseFor(DriverEmotion e)
        {
            var p = new Pose { eyeScale = 1f, mouthW = 1f, mouthH = 0.25f, browLift = 0f };
            switch (e)
            {
                case DriverEmotion.Idle: p.bob = 1f; break;
                case DriverEmotion.GasGrin: p.mouthW = 1.7f; p.mouthH = 0.5f; p.browLift = 0.06f; p.lean = 8f; p.eyeScale = 1.05f; break;
                case DriverEmotion.AirWoo: p.mouthW = 0.7f; p.mouthH = 1.5f; p.armRaise = 120f; p.reach = 1f; p.hat = 0.06f; p.browLift = 0.10f; p.eyeScale = 1.25f; break;
                case DriverEmotion.Scared: p.eyeScale = 1.55f; p.browLift = 0.08f; p.browAngle = -18f; p.mouthW = 0.9f; p.mouthH = 0.9f; p.sweat = 1f; p.armRaise = 25f; p.lean = -6f; break;
                case DriverEmotion.CrashDaze: p.eyeScale = 1.3f; p.mouthW = 1.1f; p.mouthH = 0.5f; p.stars = 1f; p.headTilt = 14f; p.browAngle = -10f; break;
                case DriverEmotion.WinCheer: p.mouthW = 1.9f; p.mouthH = 0.85f; p.armRaise = 110f; p.browLift = 0.10f; p.bob = 2f; p.hat = 0.06f; break;
                case DriverEmotion.FailFacepalm: p.facepalm = 1f; p.headTilt = -10f; p.mouthW = 0.8f; p.mouthH = 0.12f; p.browAngle = -22f; p.eyeScale = 0.6f; break;
            }
            return p;
        }

        SimDriver _sim;
        float _hold, _blend = 1f, _t;
        Pose _from, _to, _shown;
        float _crashT = -1f, _winT = -1f, _failT = -1f;
        Vector3 _headBase, _hatBase, _mouthBase, _eyeLBase, _eyeRBase, _browLBase, _browRBase, _sweatBase, _starsBase, _torsoBase, _pupilLBase, _pupilRBase;
        Quaternion _armLRest, _armRRest, _torsoRest;
        bool _bound;
        float _blinkT = 2f, _prevBrake, _decel;

        void Start()
        {
            _sim = SimDriver.Instance;
            if (_sim != null) { _sim.SimEventRaised += OnSimEvent; _sim.Teleported += OnRestart; }
            Bind();
            _from = _to = _shown = PoseFor(DriverEmotion.Idle);
        }

        void OnDestroy()
        {
            if (_sim != null) { _sim.SimEventRaised -= OnSimEvent; _sim.Teleported -= OnRestart; }
        }

        T Find<T>(string n) where T : Component { var t = FindDeep(transform, n); return t ? t.GetComponent<T>() : null; }
        static Transform FindDeep(Transform root, string n)
        {
            if (root.name == n) return root;
            for (int i = 0; i < root.childCount; i++) { var r = FindDeep(root.GetChild(i), n); if (r) return r; }
            return null;
        }

        public void Bind()
        {
            if (head == null) head = FindDeep(transform, "Head");
            if (hat == null) hat = FindDeep(transform, "Hat");
            if (eyeL == null) eyeL = FindDeep(transform, "Eye_L");
            if (eyeR == null) eyeR = FindDeep(transform, "Eye_R");
            if (pupilL == null) pupilL = FindDeep(transform, "Pupil_L");
            if (pupilR == null) pupilR = FindDeep(transform, "Pupil_R");
            if (browL == null) browL = FindDeep(transform, "Brow_L");
            if (browR == null) browR = FindDeep(transform, "Brow_R");
            if (mouth == null) mouth = FindDeep(transform, "Mouth");
            if (armL == null) armL = FindDeep(transform, "Arm_L");
            if (armR == null) armR = FindDeep(transform, "Arm_R");
            if (sweat == null) sweat = FindDeep(transform, "Sweat");
            if (starsRoot == null) starsRoot = FindDeep(transform, "Stars");
            if (torso == null) torso = FindDeep(transform, "Torso");
            if (squash == null) squash = GetComponent<SquashStretch>();
            if (animator == null) animator = GetComponentInChildren<Animator>();
            if (head) _headBase = head.localPosition;
            if (hat) _hatBase = hat.localPosition;
            if (mouth) _mouthBase = mouth.localScale;
            if (eyeL) _eyeLBase = eyeL.localScale;
            if (eyeR) _eyeRBase = eyeR.localScale;
            if (pupilL) _pupilLBase = pupilL.localPosition;
            if (pupilR) _pupilRBase = pupilR.localPosition;
            if (browL) _browLBase = browL.localPosition;
            if (browR) _browRBase = browR.localPosition;
            if (sweat) _sweatBase = sweat.localScale;
            if (armL) _armLRest = armL.localRotation;
            if (armR) _armRRest = armR.localRotation;
            if (torso) _torsoRest = torso.localRotation;
            _bound = true;
        }

        void OnRestart() { _crashT = _winT = _failT = -1f; SetEmotion(DriverEmotion.Idle, true); if (squash) squash.ResetSprings(); }

        void OnSimEvent(SimEvent e)
        {
            switch (e.kind)
            {
                case SimEventKind.Crash: _crashT = crashDazeSeconds; if (squash) squash.Crash(); break;
                case SimEventKind.Finish: _winT = winSeconds; break;
                case SimEventKind.Landing: if (squash) squash.Landing(e.magnitude); break;
                case SimEventKind.Takeoff: if (squash) squash.Takeoff(); break;
            }
        }

        /// <summary>Hook for game rules the sim does not know about (crate dropped, over-pour, retry).</summary>
        public void TriggerFail() { _failT = failSeconds; }

        static int Priority(DriverEmotion e)
        {
            switch (e)
            {
                case DriverEmotion.CrashDaze: return 6;
                case DriverEmotion.WinCheer: return 5;
                case DriverEmotion.FailFacepalm: return 4;
                case DriverEmotion.Scared: return 3;
                case DriverEmotion.AirWoo: return 2;
                case DriverEmotion.GasGrin: return 1;
                default: return 0;
            }
        }

        DriverEmotion Decide(SimSnapshot s)
        {
            if (_crashT > 0f || s.crashed) return DriverEmotion.CrashDaze;
            if (_winT > 0f || s.finished) return DriverEmotion.WinCheer;
            if (_failT > 0f) return DriverEmotion.FailFacepalm;
            bool hardBrake = s.brake > 0.5f && s.speed > 6f && _decel > 5f;
            bool tilt = Mathf.Abs(Mathf.DeltaAngle(0f, s.chassisAngle * Mathf.Rad2Deg)) > scaredTiltDeg;
            bool edge = false;
            if (_sim != null && _sim.Backend.RoadLine != null && s.grounded)
            {
                var line = _sim.Backend.RoadLine;
                float here = SnowyPassData.HeightAt(line, s.chassisPos.x);
                float ahead = SnowyPassData.HeightAt(line, s.chassisPos.x + edgeLookAhead);
                edge = s.speed > 3f && ahead < here - edgeDrop;
            }
            if (hardBrake || tilt || edge) return DriverEmotion.Scared;
            if (s.airTime > airWooAfter) return DriverEmotion.AirWoo;
            if (s.throttle > 0.7f && s.grounded) return DriverEmotion.GasGrin;
            return DriverEmotion.Idle;
        }

        void SetEmotion(DriverEmotion e, bool instant = false)
        {
            if (e == Current && !instant) return;
            _from = _shown;
            _to = PoseFor(e);
            Current = e;
            _hold = 0f;
            _blend = (instant || MMSettings.CalmMotion) ? 1f : 0f;     // calm motion: static pose swap, no bounce
            if (animator) animator.SetInteger("Emotion", (int)e);
            EmotionChanged?.Invoke(e);
        }

        void Update()
        {
            if (_sim == null) return;
            if (!_bound) Bind();
            float dt = _sim.PresentationDelta;
            var s = _sim.Render;

            if (dt > 0f)
            {
                _decel = Mathf.Lerp(_decel, Mathf.Max(0f, (_prevBrake - s.speed) / dt), 0.2f);
                _prevBrake = s.speed;
                _hold += dt; _t += dt;
                if (_crashT > 0f) _crashT -= dt;
                if (_winT > 0f) _winT -= dt;
                if (_failT > 0f) _failT -= dt;
                _blinkT -= dt;
            }

            var want = Decide(s);
            if (want != Current && (_hold >= minHold || Priority(want) > Priority(Current))) SetEmotion(want);

            _blend = Mathf.Min(1f, _blend + (blendTime <= 0f ? 1f : dt / blendTime));
            _shown = Pose.Lerp(_from, _to, MMMath.SmoothStep01(_blend));
            Apply(_shown, dt, s);
            if (squash) squash.Tick(dt);     // same presentation clock as the truck, so slow-mo slows the wobble too
        }

        void Apply(Pose p, float dt, SimSnapshot s)
        {
            float calm = MMSettings.CalmMotion ? 0f : 1f;
            float bob = Mathf.Sin(_t * (p.bob > 1.5f ? 14f : 4.5f)) * 0.02f * p.bob * calm;

            if (head) { head.localPosition = _headBase + new Vector3(0, bob, 0); head.localRotation = Quaternion.Euler(0, 0, p.headTilt); }
            if (hat) hat.localPosition = _hatBase + new Vector3(0, bob + p.hat * calm + (p.hat > 0.01f ? Mathf.Sin(_t * 10f) * 0.015f * calm : 0f), 0);
            if (torso) torso.localRotation = _torsoRest * Quaternion.Euler(0, 0, -p.lean);

            float blink = (_blinkT < 0.12f && _blinkT > 0f) ? 0.1f : 1f;
            if (_blinkT <= 0f) _blinkT = UnityEngine.Random.Range(1.8f, 4.5f);    // visual-only randomness, never touches the sim
            if (eyeL) eyeL.localScale = new Vector3(_eyeLBase.x * p.eyeScale, _eyeLBase.y * p.eyeScale * blink, _eyeLBase.z * p.eyeScale);
            if (eyeR) eyeR.localScale = new Vector3(_eyeRBase.x * p.eyeScale, _eyeRBase.y * p.eyeScale * blink, _eyeRBase.z * p.eyeScale);

            // eyes look ahead (dizzy wobble when dazed). Offsets are added to the built position: the old code set
            // z = -0.05, which sank the pupils inside the eye spheres, so the eyes read as blank white blobs.
            if (pupilL && pupilR)
            {
                Vector3 look = new Vector3(0.35f, p.stars > 0.5f ? Mathf.Sin(_t * 12f) * 0.3f * calm : 0f, 0f) * 0.1f;
                pupilL.localPosition = _pupilLBase + look;
                pupilR.localPosition = _pupilRBase + look;
            }

            if (browL) { browL.localPosition = _browLBase + new Vector3(0, p.browLift, 0); browL.localRotation = Quaternion.Euler(0, 0, p.browAngle); }
            if (browR) { browR.localPosition = _browRBase + new Vector3(0, p.browLift, 0); browR.localRotation = Quaternion.Euler(0, 0, -p.browAngle); }
            if (mouth) mouth.localScale = new Vector3(_mouthBase.x * p.mouthW, _mouthBase.y * (p.mouthH / 0.25f), _mouthBase.z);

            if (sweat) { sweat.localScale = _sweatBase * Mathf.Clamp01(p.sweat); if (p.sweat > 0.01f && calm > 0f) sweat.localPosition += Vector3.zero; }
            if (starsRoot)
            {
                starsRoot.gameObject.SetActive(p.stars > 0.05f);
                starsRoot.localRotation = Quaternion.Euler(0, _t * 220f * calm, 0);
                starsRoot.localScale = Vector3.one * Mathf.Clamp01(p.stars);
            }
            float raise = p.facepalm > 0.5f ? FacepalmDeg : p.armRaise;
            if (armR) armR.localRotation = _armRRest * Quaternion.Euler(0, 0, raise);
            if (armL) PoseNearArm(raise, p.reach, calm);

            // art hooks
            if (face)
            {
                SetShape("mouth_smile", Mathf.Clamp01((p.mouthW - 1f)) * 100f);
                SetShape("mouth_open", Mathf.Clamp01(p.mouthH - 0.3f) * 100f);
                SetShape("mouth_O", Mathf.Clamp01((p.mouthH - 0.6f) * (1.2f - p.mouthW)) * 100f);
                SetShape("mouth_frown", p.sweat * 60f + p.facepalm * 60f);
                SetShape("brow_up", Mathf.Clamp01(p.browLift * 8f) * 100f);
                SetShape("brow_worry", Mathf.Clamp01(-p.browAngle / 20f) * 100f);
                SetShape("eye_wide", Mathf.Clamp01(p.eyeScale - 1f) * 160f);
                SetShape("eye_squint", Mathf.Clamp01(1f - p.eyeScale) * 100f);
            }
            if (animator && _blinkT < 0.12f && _blinkT > 0f) animator.SetTrigger("Blink");
        }

        // The near arm (camera side, -Z) waves out of the side window for "woo": it swings from its in-cab pose to
        // pointing out sideways and up, and stretches so the mitten clears the cab side.
        void PoseNearArm(float raise, float reach, float calm)
        {
            float wave = reach > 0.5f ? Mathf.Sin(_t * 10f) * WaveDeg * calm : 0f;
            var inCab = _armLRest * Quaternion.Euler(0, 0, raise);
            var outOfWindow = _armLRest * Quaternion.Euler(0, 90f, OutOfWindowUpDeg + wave);   // +X turned to -Z, then tipped up
            armL.localRotation = Quaternion.Slerp(inCab, outOfWindow, reach);
            SetArmLength(armL, Mathf.Lerp(ArmLength, ReachArmLength, reach));
        }

        static void SetArmLength(Transform arm, float length)
        {
            var mesh = arm.Find("Mesh"); var mitten = arm.Find("Mitten");
            if (mesh) { mesh.localPosition = new Vector3(length * 0.5f, 0, 0); mesh.localScale = new Vector3(length, ArmThickness, ArmThickness); }
            if (mitten) mitten.localPosition = new Vector3(length + 0.02f, 0, 0);
        }

        /// <summary>Test hook: jump straight to an emotion's pose (no blend, no sim) and apply it.</summary>
        internal void PoseForTests(DriverEmotion e, float time = 0f)
        {
            if (!_bound) Bind();
            _t = time;
            SetEmotion(e, true);
            _shown = _to;
            Apply(_shown, 0f, null);
        }

        void SetShape(string n, float w)
        {
            int i = face.sharedMesh ? face.sharedMesh.GetBlendShapeIndex(n) : -1;
            if (i >= 0) face.SetBlendShapeWeight(i, w);
        }

        // =====================================================================================
        //  Primitive placeholder driver (kid-sized builder with a yellow hard hat). Original character.
        //  Sized for the drive camera (GAMEUP-REVIEW P2, fix 7): head 1.3x (0.73 m), sitting 0.10 m higher so the
        //  whole face is above the window sill, hat brim raised clear of the eyes, big eyes with pupils that read at
        //  8+ px at 1080p. The face looks 3/4 toward the camera (-Z); the driver faces +X like the truck.
        // =====================================================================================
        public const float HeadSize = 0.56f * 1.3f;
        public const float SeatLift = 0.10f;
        public const float HeadHeight = 0.44f;          // head centre above the seat point (before the lift)
        const float ArmLength = 0.5f, ReachArmLength = 1.0f, ArmThickness = 0.15f;
        const float OutOfWindowUpDeg = 30f, WaveDeg = 14f, FacepalmDeg = 45f;

        public static GameObject BuildPlaceholder(Transform seat)
        {
            var root = new GameObject("Driver");
            root.transform.SetParent(seat, false);
            root.transform.localPosition = new Vector3(0, SeatLift, 0);

            Mesh sph = Smooth(ProcMesh.Sphere(0.5f, 14, 22));
            Mesh box = Smooth(ProcMesh.RoundedBox(Vector3.one, 0.18f, 4));

            Part(root.transform, "Torso", box, "Toy_Orange", new Vector3(0, -0.05f, 0), new Vector3(0.5f, 0.55f, 0.6f));
            var head = Part(root.transform, "Head", sph, "Toy_Skin", new Vector3(0, HeadHeight, 0), Vector3.one * HeadSize);
            BuildFace(head.transform, sph, box);
            BuildArm(root.transform, "Arm_L", -0.34f, sph, box);
            BuildArm(root.transform, "Arm_R", 0.34f, sph, box);
            // crash stars orbit
            var stars = new GameObject("Stars"); stars.transform.SetParent(head.transform, false); stars.transform.localPosition = new Vector3(0, 0.75f, 0);
            for (int i = 0; i < 3; i++)
            {
                float a = i / 3f * Mathf.PI * 2f;
                Part(stars.transform, "Star_" + i, sph, "Toy_Hat", new Vector3(Mathf.Cos(a) * 0.45f, 0, Mathf.Sin(a) * 0.45f), Vector3.one * 0.14f);
            }
            stars.SetActive(false);

            var dv = root.AddComponent<DriverView>();
            root.AddComponent<SquashStretch>().gain = 1.5f;
            dv.squash = root.GetComponent<SquashStretch>();
            // sweat starts hidden by scale 0 in the pose
            return root;
        }

        /// <summary>Hat, brim, eyes, pupils, brows, mouth and sweat drop, in head space (head radius 0.5).</summary>
        static void BuildFace(Transform head, Mesh sph, Mesh box)
        {
            // hat dome sits high; the brim rides at the hat base, above the brows, so it never covers the eyes
            Part(head, "Hat", sph, "Toy_Hat", new Vector3(0, 0.42f, 0), new Vector3(1.08f, 0.50f, 1.08f));
            Part(head, "Brim", box, "Toy_Hat", new Vector3(0.34f, 0.34f, 0), new Vector3(0.42f, 0.07f, 0.88f));
            var eL = Part(head, "Eye_L", sph, "Toy_White", new Vector3(0.24f, 0.04f, -0.40f), new Vector3(0.38f, 0.44f, 0.20f));
            var eR = Part(head, "Eye_R", sph, "Toy_White", new Vector3(-0.10f, 0.04f, -0.43f), new Vector3(0.36f, 0.42f, 0.20f));
            // pupils: 70% of the eye (about 9 px wide at 1080p in the 3/4 view), pushed out past the eye's front so they always show
            Part(eL.transform, "Pupil_L", sph, "Toy_Navy", new Vector3(0.06f, -0.02f, -0.36f), new Vector3(0.70f, 0.70f, 0.4f));
            Part(eR.transform, "Pupil_R", sph, "Toy_Navy", new Vector3(0.06f, -0.02f, -0.36f), new Vector3(0.70f, 0.70f, 0.4f));
            Part(head, "Brow_L", box, "Toy_Navy", new Vector3(0.24f, 0.27f, -0.40f), new Vector3(0.26f, 0.06f, 0.08f));
            Part(head, "Brow_R", box, "Toy_Navy", new Vector3(-0.10f, 0.27f, -0.42f), new Vector3(0.24f, 0.06f, 0.08f));
            Part(head, "Mouth", box, "Toy_Red", new Vector3(0.10f, -0.22f, -0.44f), new Vector3(0.24f, 0.08f, 0.06f));
            Part(head, "Sweat", sph, "Toy_Glass", new Vector3(0.36f, 0.16f, -0.40f), new Vector3(0.12f, 0.2f, 0.1f));
        }

        /// <summary>Arm with its pivot at the shoulder; the sleeve runs along +X (hands forward on the wheel).</summary>
        static void BuildArm(Transform root, string name, float z, Mesh sph, Mesh box)
        {
            var arm = new GameObject(name); arm.transform.SetParent(root, false); arm.transform.localPosition = new Vector3(0.05f, 0.15f, z);
            Part(arm.transform, "Mesh", box, "Toy_Orange", new Vector3(ArmLength * 0.5f, 0, 0), new Vector3(ArmLength, ArmThickness, ArmThickness));
            Part(arm.transform, "Mitten", sph, "Toy_White", new Vector3(ArmLength + 0.02f, 0, 0), Vector3.one * 0.2f);
        }

        static Mesh Smooth(Mesh m) { MeshSmoothNormals.Bake(m); return m; }

        static GameObject Part(Transform parent, string name, Mesh mesh, string mat, Vector3 pos, Vector3 scale)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos; go.transform.localScale = scale;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = MMMaterials.Get(mat);
            return go;
        }
    }
}
