using System;
using System.Collections.Generic;
using UnityEngine;
using MixerMad.Sim;

namespace MixerMad.Game
{
    /// <summary>
    /// THE ONLY FILE that knows the real MixerMad.Sim API (World, InputFrame, Pt, SimEvent...).
    /// Maps the sim onto ISimBackend so every view stays decoupled. The Unity side never reaches into World.
    ///
    /// Sim facts used (see Sim/PORT-NOTES.md):
    ///   World.Create(Tuning, GameData, WorldConfig)   World.Step(InputFrame) once per 1/120 s   World.Events + ClearEvents()
    ///   World.TruckPose() = chassis origin at the bottom centre, angle from P0->P1     World.Points[4], [5] = wheel centres
    ///   World.AirTime, World.State (Phase), World.Load (percent), World.Level (ground polyline X[], Y[], flagX, zones)
    /// Data (tuning.json, levels.json, vehicles.json) are TextAssets in Resources/MixerMadSim/.
    /// </summary>
    public sealed class MixerSimBackend : ISimBackend
    {
        // The snowy pass uses a v7 level whose weather is snow (level index 2 = L3, 7 = L8). Weather forced to "snow".
        public static int SnowLevelIndex = 2;

        readonly Tuning _tuning;
        readonly GameData _data;
        readonly WorldConfig _cfg;
        World _w;
        readonly Queue<global::MixerMad.Game.SimEvent> _events = new Queue<global::MixerMad.Game.SimEvent>(32);
        Vector2[] _line; byte[] _surface;
        bool _prevAir, _bigSent;
        float _gas, _brake;
        double _lastVx, _lastVy;

        public double StepSeconds => _tuning.dt;
        public Vector2[] RoadLine => _line;
        public byte[] RoadSurface => _surface;
        public float FinishX => (float)_w.Level.flagX;

        public static MixerSimBackend TryCreate()
        {
            try
            {
                var t = Resources.Load<TextAsset>("MixerMadSim/tuning");
                var l = Resources.Load<TextAsset>("MixerMadSim/levels");
                var v = Resources.Load<TextAsset>("MixerMadSim/vehicles");
                if (t == null || l == null || v == null)
                {
                    Debug.LogWarning("[MixerMad] Sim data not found in Resources/MixerMadSim (tuning, levels, vehicles). Using the demo physics.");
                    return null;
                }
                return new MixerSimBackend(Tuning.FromJson(t.text), GameData.FromJson(l.text, v.text));
            }
            catch (Exception e)
            {
                Debug.LogError("[MixerMad] Could not start the real sim, falling back to demo physics: " + e);
                return null;
            }
        }

        MixerSimBackend(Tuning t, GameData d)
        {
            _tuning = t; _data = d;
            int level = SnowLevelIndex;
            // prefer the first level whose own weather is snow if the configured index is out of range
            if (level < 0 || level >= d.levels.Count) level = 0;
            _cfg = new WorldConfig { Mode = GameMode.Classic, LevelIndex = level, Vehicle = "mixer", MixerSkin = 0, Weather = "snow" };
            Reset();
        }

        public void Reset()
        {
            _w = World.Create(_tuning, _data, _cfg);
            _events.Clear();
            _prevAir = false; _bigSent = false;
            BuildRoad();
        }

        void BuildRoad()
        {
            var L = _w.Level;
            _line = new Vector2[L.N];
            for (int i = 0; i < L.N; i++) _line[i] = new Vector2((float)L.X[i], (float)L.Y[i]);
            _surface = new byte[Math.Max(0, L.N - 1)];
            for (int i = 0; i < _surface.Length; i++)
            {
                double mx = 0.5 * (L.X[i] + L.X[i + 1]);
                foreach (var z in L.zones)
                    if (mx >= z.x0 && mx <= z.x1 && (z.kind == ZoneKind.Puddle || z.kind == ZoneKind.Slush)) { _surface[i] = SnowyPassData.Ice; break; }
            }
        }

        public void Step(in SimInput input)
        {
            _gas = input.gas; _brake = input.brake;
            _w.Step(new InputFrame(input.gas > 0.5f, input.brake > 0.5f));

            var src = _w.Events;
            for (int i = 0; i < src.Count; i++)
            {
                var e = src[i];
                var o = new global::MixerMad.Game.SimEvent { pos = new Vector2((float)e.X, (float)e.Y), simTime = _w.SimTime };
                switch (e.Type)
                {
                    case SimEventType.Land: o.kind = SimEventKind.Landing; o.magnitude = (float)(e.Value * 15.0); break;   // sim: 0..1, 1 = 14 m/s
                    case SimEventType.Crash: o.kind = SimEventKind.Crash; o.magnitude = (float)e.Value; break;
                    case SimEventType.Reset: o.kind = SimEventKind.Respawn; break;
                    case SimEventType.Parked: o.kind = SimEventKind.Finish; o.magnitude = (float)e.Value; break;           // truck stopped on the flag
                    case SimEventType.RockHit: o.kind = SimEventKind.Landing; o.magnitude = 3f; break;
                    case SimEventType.Checkpoint: o.kind = SimEventKind.ZoneEnter; o.magnitude = 1f; break;
                    default: continue;
                }
                _events.Enqueue(o);
            }
            if (src.Count > 0) _w.ClearEvents();

            // take-off and big-air are derived from AirTime (the sim has no such events)
            double air = _w.AirTime;
            bool inAir = air > 0.10;
            if (inAir && !_prevAir) _events.Enqueue(new global::MixerMad.Game.SimEvent { kind = SimEventKind.Takeoff, pos = new Vector2((float)_w.TruckX(), (float)_w.Points[0].y), simTime = _w.SimTime });
            _prevAir = inAir;
            if (air <= 0.0) _bigSent = false;
            if (air > 0.8 && !_bigSent)
            {
                _bigSent = true;
                _events.Enqueue(new global::MixerMad.Game.SimEvent { kind = SimEventKind.BigAir, magnitude = (float)air, pos = new Vector2((float)_w.TruckX(), (float)_w.Points[0].y), simTime = _w.SimTime });
            }
        }

        public void Capture(SimSnapshot s)
        {
            var P = _w.Points;
            var pose = _w.TruckPose();
            s.time = _w.SimTime;
            s.chassisPos = new Vector2((float)pose.x, (float)pose.y);
            s.chassisAngle = (float)pose.ang;
            double dt = _tuning.dt;
            s.velocity = new Vector2((float)(((P[0].x - P[0].px) + (P[1].x - P[1].px)) * 0.5 / dt), (float)(((P[0].y - P[0].py) + (P[1].y - P[1].py)) * 0.5 / dt));
            s.wheelCount = 2;
            s.wheelPos[0] = new Vector2((float)P[4].x, (float)P[4].y);    // rear wheel
            s.wheelPos[1] = new Vector2((float)P[5].x, (float)P[5].y);    // front wheel
            s.throttle = _gas; s.brake = _brake;
            s.load01 = Mathf.Clamp01((float)(_w.Load / 100.0));
            s.airTime = (float)_w.AirTime;
            s.grounded = _w.AirTime < 0.05;
            var st = _w.State;
            s.crashed = st == Phase.Crashed;
            s.finished = st == Phase.Parked || st == Phase.Done;
        }

        public bool TryDequeueEvent(out global::MixerMad.Game.SimEvent e)
        {
            if (_events.Count > 0) { e = _events.Dequeue(); return true; }
            e = default; return false;
        }
    }
}
