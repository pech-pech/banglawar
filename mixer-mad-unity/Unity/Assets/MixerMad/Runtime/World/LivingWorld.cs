using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// S1 snowy-pass life, all in the background (z >= 15, never in the play lane) and all behind FxToggles.LivingWorld:
    /// chimney smoke on the cabin, roof snow, a few birds crossing now and then, a snow plough crawling along the
    /// back hill, and ski-lift chairs on a cable. Props that leave the view are moved ahead while off-screen, so
    /// they are always near the camera without popping. Calm motion: smoke and birds halved, slower flaps.
    /// Pure view code: reads the camera and SimDriver.SpeedScale only.
    /// </summary>
    [DefaultExecutionOrder(70)]
    public sealed class LivingWorld : MonoBehaviour
    {
        // placement (metres)
        public const float PloughZ = 16.5f, LiftZ = 33f, BirdZMin = 22f, BirdZMax = 30f;
        const float PloughSpeed = 2.2f, PloughRecycle = 52f;
        const float LiftLength = 88f, LiftPeriod = 230f, PylonStep = 22f, LiftSpeed = 2.4f, ChairStep = 8f;
        const float BirdEdge = 34f, BirdSpeed = 5.5f;

        Camera _cam; RoadBuilder _road;
        Transform _root, _plough, _lift, _birdsRoot;
        ParticleSystem _smoke;
        Transform[] _pylons, _posts, _arms; float[] _pylonTop;
        Transform[] _chairs;
        int _liftCell = int.MinValue;
        float _liftPhase;

        // birds
        Transform[] _birds; Transform[] _wingL, _wingR;
        float _birdRel, _birdDir, _birdY, _birdZ, _nextFlock = 4f, _flap;
        bool _flying;
        uint _seed = 0x9E3779B9u;

        public bool Active => _root != null && _root.gameObject.activeSelf;
        public Transform Plough => _plough;

        public void Init(Transform world, RoadBuilder road, Camera cam)
        {
            _cam = cam; _road = road;
            _root = new GameObject("LivingWorld").transform;
            _root.SetParent(transform, false);
            var cabin = FindDeep(world, "Cabin");
            BuildSmoke(cabin);
            LivingWorldParts.RoofSnow(cabin, _root);
            _plough = LivingWorldParts.Plough(_root);
            _plough.localScale = Vector3.one * 0.8f;
            _plough.position = new Vector3(CamX() + 12f, 0f, PloughZ);
            BuildLift();
            BuildBirds();
            Apply();
        }

        static Transform FindDeep(Transform t, string n)
        {
            if (t == null) return null;
            if (t.name == n) return t;
            for (int i = 0; i < t.childCount; i++) { var f = FindDeep(t.GetChild(i), n); if (f) return f; }
            return null;
        }

        float CamX() => _cam ? _cam.transform.position.x : 0f;
        float CamY() => _cam ? _cam.transform.position.y : 0f;

        void Apply() { if (_root && _root.gameObject.activeSelf != FxToggles.LivingWorld) _root.gameObject.SetActive(FxToggles.LivingWorld); }

        void Update() { Tick(Time.unscaledDeltaTime); }

        internal void Tick(float realDt)
        {
            Apply();
            if (!FxToggles.LivingWorld || _cam == null) return;
            var sim = SimDriver.Instance;
            float scale = sim ? sim.SpeedScale : 1f;
            float dt = realDt * scale;         // the world slows with slow-mo and stops on pause
            bool calm = MMSettings.CalmMotion;
            if (_smoke) { var m = _smoke.main; m.simulationSpeed = scale; var em = _smoke.emission; em.rateOverTime = calm ? 1.5f : 3f; }
            UpdatePlough(dt);
            UpdateLift(dt);
            UpdateBirds(dt, calm);
        }

        // ------------------------------------------------------------------ chimney smoke
        void BuildSmoke(Transform cabin)
        {
            var chim = FindDeep(cabin, "Chimney");
            if (chim == null) return;
            int cap = FxBudget.For(QualityPresets.Current.particleBudget, false).smoke;
            var look = new FxParticles.Look { life = 5f, sizeMin = 0.6f, sizeMax = 1.0f, gravity = -0.03f, drag = 0f, grow = 3.5f, color = new Color(0.86f, 0.88f, 0.94f, 0.45f), material = MMMaterials.Particle(false) };
            _smoke = FxParticles.Make(_root, "Chimney_Smoke", look, Mathf.Max(cap, 16));
            _smoke.transform.position = chim.position + Vector3.up * 0.9f;
            var em = _smoke.emission; em.enabled = true; em.rateOverTime = 3f;      // static emitter: Unity's own emission is safe
            var vel = _smoke.velocityOverLifetime; vel.enabled = true; vel.space = ParticleSystemSimulationSpace.World;
            vel.x = new ParticleSystem.MinMaxCurve(0.25f, 0.6f); vel.y = new ParticleSystem.MinMaxCurve(0.6f, 0.9f); vel.z = new ParticleSystem.MinMaxCurve(0f, 0.1f);
            var noise = _smoke.noise; noise.enabled = true; noise.strength = 0.25f; noise.frequency = 0.3f;
        }

        // ------------------------------------------------------------------ plough on the far hill
        /// <summary>Ground under the plough's track on the back hill (RoadBuilder's own height field), so it never floats.</summary>
        float GroundY(float x) => _road != null ? _road.HeightAt(x, PloughZ) : 0f;

        void UpdatePlough(float dt)
        {
            float x = _plough.position.x + PloughSpeed * dt;
            float cx = CamX();
            if (x < cx - PloughRecycle || x > cx + PloughRecycle + 15f) x = cx + (x < cx ? PloughRecycle : -PloughRecycle * 0.8f);
            float y = GroundY(x), y2 = GroundY(x + 2f);
            _plough.SetPositionAndRotation(new Vector3(x, y, PloughZ), Quaternion.Euler(0f, 0f, Mathf.Atan2(y2 - y, 2f) * Mathf.Rad2Deg));
        }

        // ------------------------------------------------------------------ ski lift
        void BuildLift()
        {
            _lift = new GameObject("Ski_Lift").transform;
            _lift.SetParent(_root, false);
            int nP = Mathf.RoundToInt(LiftLength / PylonStep) + 1;
            _pylons = new Transform[nP]; _posts = new Transform[nP]; _arms = new Transform[nP]; _pylonTop = new float[nP];
            for (int i = 0; i < nP; i++) _pylons[i] = LivingWorldParts.Pylon(_lift, out _posts[i], out _arms[i]);
            int nC = Mathf.RoundToInt(LiftLength * 2f / ChairStep);
            _chairs = new Transform[nC];
            var chair = LivingWorldParts.ChairMesh();
            for (int i = 0; i < nC; i++) _chairs[i] = LivingWorldParts.Renderer(_lift, "Chair_" + i, chair, i % 3 == 0 ? "World_Orange" : "World_Red").transform;
            var cable = LivingWorldParts.Renderer(_lift, "Cable", ProcMesh.RoundedBox(new Vector3(1f, 0.05f, 0.05f), 0.02f, 1), "World_Navy");
            cable.name = "Cable_Up";
            var down = LivingWorldParts.Renderer(_lift, "Cable_Down", cable.GetComponent<MeshFilter>().sharedMesh, "World_Navy");
            down.transform.SetParent(_lift, false);
        }

        /// <summary>The lift sits in the period cell nearest the camera; it is moved only while the camera is far from it.</summary>
        void PlaceLift(int cell)
        {
            _liftCell = cell;
            float x0 = cell * LiftPeriod;
            for (int i = 0; i < _pylons.Length; i++)
            {
                float x = x0 + i * PylonStep;
                float ground = _road != null ? _road.HeightAt(x, LiftZ) : 0f;
                float top = ground + 4f + i * 0.6f;                     // the cable climbs the hill
                _pylonTop[i] = top;
                _pylons[i].position = new Vector3(x, ground, LiftZ);
                LivingWorldParts.SetPylonHeight(_posts[i], _arms[i], top - ground);
            }
            SetCable(_lift.Find("Cable_Up"), x0, -0.7f);
            SetCable(_lift.Find("Cable_Down"), x0, 0.7f);
        }

        void SetCable(Transform c, float x0, float dz)
        {
            if (c == null) return;
            float x1 = x0 + (_pylons.Length - 1) * PylonStep;
            var a = new Vector3(x0, _pylonTop[0], LiftZ + dz); var b = new Vector3(x1, _pylonTop[_pylonTop.Length - 1], LiftZ + dz);
            c.position = (a + b) * 0.5f;
            c.rotation = Quaternion.Euler(0f, 0f, Mathf.Atan2(b.y - a.y, b.x - a.x) * Mathf.Rad2Deg);
            c.localScale = new Vector3(Vector3.Distance(a, b), 1f, 1f);
        }

        float CableY(float x)
        {
            float f = (x - _liftCell * LiftPeriod) / PylonStep;
            int i = Mathf.Clamp(Mathf.FloorToInt(f), 0, _pylonTop.Length - 2);
            return Mathf.Lerp(_pylonTop[i], _pylonTop[i + 1], Mathf.Clamp01(f - i));
        }

        void UpdateLift(float dt)
        {
            int cell = Mathf.RoundToInt((CamX() - LiftLength * 0.5f) / LiftPeriod);
            if (cell != _liftCell) PlaceLift(cell);
            _liftPhase = Mathf.Repeat(_liftPhase + LiftSpeed * dt, LiftLength * 2f);
            float x0 = _liftCell * LiftPeriod;
            for (int i = 0; i < _chairs.Length; i++)
            {
                float d = Mathf.Repeat(_liftPhase + i * ChairStep, LiftLength * 2f);
                bool up = d < LiftLength;
                float x = up ? x0 + d : x0 + LiftLength * 2f - d;
                float sway = Mathf.Sin((_liftPhase + i * 3.1f) * 0.9f) * 3f;
                _chairs[i].SetPositionAndRotation(new Vector3(x, CableY(x), LiftZ + (up ? -0.7f : 0.7f)), Quaternion.Euler(0f, up ? 0f : 180f, sway));
            }
        }

        // ------------------------------------------------------------------ birds
        void BuildBirds()
        {
            const int n = 5;
            _birdsRoot = new GameObject("Birds").transform; _birdsRoot.SetParent(_root, false);
            _birds = new Transform[n]; _wingL = new Transform[n]; _wingR = new Transform[n];
            for (int i = 0; i < n; i++) _birds[i] = LivingWorldParts.Bird(_birdsRoot, out _wingL[i], out _wingR[i]);
            _birdsRoot.gameObject.SetActive(false);
        }

        void UpdateBirds(float dt, bool calm)
        {
            if (!_flying)
            {
                _nextFlock -= dt;
                if (_nextFlock > 0f) return;
                _flying = true;
                _birdDir = Rand() < 0.5f ? 1f : -1f;
                _birdRel = -_birdDir * BirdEdge;
                _birdY = 7f + Rand() * 4f; _birdZ = Mathf.Lerp(BirdZMin, BirdZMax, Rand());
                _birdsRoot.gameObject.SetActive(true);
            }
            _birdRel += _birdDir * BirdSpeed * (calm ? 0.7f : 1f) * dt;
            _flap += dt * (calm ? 5f : 9f);
            for (int i = 0; i < _birds.Length; i++)
            {
                // a loose V: the leader in front, the others behind on alternate sides
                float back = ((i + 1) / 2) * 1.6f, side = (i % 2 == 0 ? 1f : -1f) * ((i + 1) / 2) * 0.9f;
                var p = new Vector3(CamX() + _birdRel - _birdDir * back, CamY() + _birdY + side * 0.5f + Mathf.Sin(_flap * 0.15f + i) * 0.25f, _birdZ + side);
                _birds[i].SetPositionAndRotation(p, Quaternion.Euler(0f, _birdDir > 0f ? 0f : 180f, 0f));
                float a = Mathf.Sin(_flap + i * 0.7f) * 35f;
                _wingL[i].localRotation = Quaternion.Euler(a, 0f, 0f);
                _wingR[i].localRotation = Quaternion.Euler(-a, 0f, 0f);
            }
            if (Mathf.Abs(_birdRel) > BirdEdge + 6f)
            {
                _flying = false;
                _birdsRoot.gameObject.SetActive(false);
                _nextFlock = (calm ? 18f : 9f) + Rand() * 8f;
            }
        }

        float Rand()
        {
            _seed ^= _seed << 13; _seed ^= _seed >> 17; _seed ^= _seed << 5;
            return (_seed & 0xFFFFFF) / 16777216f;
        }
    }
}
