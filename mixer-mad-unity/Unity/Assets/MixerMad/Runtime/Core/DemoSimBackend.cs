using System.Collections.Generic;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// A tiny stand-in physics world so the whole slice (camera, slow-mo, weather, HUD, shaders) runs
    /// before the real MixerMad.Sim is wired in. It is NOT the game's physics and is not tuned like it:
    /// a two-wheel rider on the road line with a takeoff / landing / crash model.
    /// It is deterministic (no Time, no random) and implements the same ISimBackend as the real adapter.
    /// </summary>
    public sealed class DemoSimBackend : ISimBackend
    {
        const double Dt = 1.0 / 120.0;
        const float G = 9.81f;
        const float RearX = -1.2f, FrontX = 1.15f, WheelY = 0.5f;
        const float WheelBase = FrontX - RearX;

        readonly Vector2[] _line;
        readonly byte[] _surface;
        readonly float _finishX;
        readonly Queue<SimEvent> _events = new Queue<SimEvent>(32);

        double _t;
        float _x, _y, _v, _vx, _vy, _angle, _angVel, _airTime, _load, _crashTimer, _gas, _brake;
        bool _grounded, _crashed, _finished, _bigAirSent;
        float _spawnX;

        public double StepSeconds => Dt;
        public Vector2[] RoadLine => _line;
        public byte[] RoadSurface => _surface;
        public float FinishX => _finishX;

        public DemoSimBackend()
        {
            SnowyPassData.Build(out _line, out _surface, out _finishX);
            Reset();
        }

        float GroundAt(float x) => SnowyPassData.HeightAt(_line, x);
        float SlopeAngle(float x)
        {
            float hr = GroundAt(x + RearX), hf = GroundAt(x + FrontX);
            return Mathf.Atan2(hf - hr, WheelBase);
        }

        public void Reset()
        {
            _events.Clear();
            _t = 0; _spawnX = 0f; Respawn();
            _finished = false; _load = 0.6f;
        }

        void Respawn()
        {
            _x = _spawnX; _y = GroundAt(_x); _v = 0; _vx = 0; _vy = 0;
            _angle = SlopeAngle(_x); _angVel = 0; _airTime = 0; _grounded = true; _crashed = false; _bigAirSent = false;
            _crashTimer = 0;
        }

        void Emit(SimEventKind k, float mag)
        {
            _events.Enqueue(new SimEvent { kind = k, magnitude = mag, pos = new Vector2(_x, _y), simTime = _t });
        }

        public void Step(in SimInput input)
        {
            float dt = (float)Dt;
            _t += Dt;
            _gas = input.gas; _brake = input.brake;

            if (_crashed)
            {
                _crashTimer -= dt;
                _vx *= 0.96f; _vy = 0f;
                _x += _vx * dt;
                if (_crashTimer <= 0f) { if (_x > 100f) _spawnX = 96f; Respawn(); }
                return;
            }

            if (_finished) { _gas = 0f; _brake = 0.6f; _load = Mathf.Max(0f, _load - 0.3f * dt); }

            if (_grounded)
            {
                float th = SlopeAngle(_x);
                bool ice = _surface != null && IsIce(_x);
                float aGas = _gas * (ice ? 4.2f : 6.0f);
                float a = aGas - 0.32f * _v - G * Mathf.Sin(th) * 0.9f;
                if (_brake > 0.01f) a -= _brake * (ice ? 4.0f : 9.0f) * Mathf.Sign(_v == 0f ? 1f : _v);
                float vNew = _v + a * dt;
                if (_brake > 0.01f && Mathf.Sign(vNew) != Mathf.Sign(_v)) vNew = 0f;   // brake stops, no reverse
                _v = Mathf.Clamp(vNew, -3f, 15f);
                if (_gas < 0.01f && _brake < 0.01f && Mathf.Abs(_v) < 0.05f && Mathf.Abs(th) < 0.04f) _v = 0f;

                float vxPrev = _v * Mathf.Cos(th), vyPrev = _v * Mathf.Sin(th);
                float xNew = _x + vxPrev * dt;
                float gNew = GroundAt(xNew);
                float ballistic = _y + vyPrev * dt - 0.5f * G * dt * dt;
                if (gNew < ballistic - 0.012f && _v > 3f)
                {
                    _x = xNew; _y = ballistic; _vx = vxPrev; _vy = vyPrev - G * dt;
                    _grounded = false; _airTime = 0f; _bigAirSent = false;
                    _angVel = Mathf.Clamp((th - _angle) * 3f, -1.5f, 1.5f) - 0.35f;
                    Emit(SimEventKind.Takeoff, _v);
                }
                else
                {
                    _vy = (gNew - _y) / dt; _x = xNew; _y = gNew; _vx = vxPrev;
                    _angle += (th - _angle) * Mathf.Min(1f, 14f * dt);
                }
            }
            else
            {
                _vy -= G * dt;
                _x += _vx * dt; _y += _vy * dt;
                _angVel += (_gas - _brake) * 1.6f * dt;
                _angle += _angVel * dt;
                _airTime += dt;
                if (!_bigAirSent && _airTime > 0.8f) { _bigAirSent = true; Emit(SimEventKind.BigAir, _airTime); }
                float g = GroundAt(_x);
                if (_y <= g)
                {
                    float th = SlopeAngle(_x);
                    float nx = -Mathf.Sin(th), ny = Mathf.Cos(th);
                    float impact = Mathf.Max(0f, -(_vx * nx + _vy * ny));
                    float diff = Mathf.DeltaAngle(_angle * Mathf.Rad2Deg, th * Mathf.Rad2Deg) * Mathf.Deg2Rad;
                    _y = g;
                    if (Mathf.Abs(diff) > 0.85f || impact > 13f)
                    {
                        _crashed = true; _crashTimer = 2.2f; _grounded = true; _airTime = 0f;
                        Emit(SimEventKind.Crash, impact);
                    }
                    else
                    {
                        _v = _vx * Mathf.Cos(th) + _vy * Mathf.Sin(th);
                        _grounded = true; _airTime = 0f;
                        Emit(SimEventKind.Landing, impact);
                    }
                }
            }

            if (!_finished && _x >= _finishX)
            {
                _finished = true;
                Emit(SimEventKind.Finish, 1f);
            }
        }

        bool IsIce(float x)
        {
            if (_surface == null) return false;
            int lo = 0, hi = _line.Length - 1;
            while (hi - lo > 1) { int mid = (lo + hi) >> 1; if (_line[mid].x <= x) lo = mid; else hi = mid; }
            return lo < _surface.Length && _surface[lo] == SnowyPassData.Ice;
        }

        public void Capture(SimSnapshot s)
        {
            s.time = _t;
            s.chassisPos = new Vector2(_x, _y);
            s.chassisAngle = _angle;
            s.velocity = _grounded ? new Vector2(_v * Mathf.Cos(_angle), _v * Mathf.Sin(_angle)) : new Vector2(_vx, _vy);
            s.wheelCount = 2;
            float c = Mathf.Cos(_angle), sn = Mathf.Sin(_angle);
            s.wheelPos[0] = new Vector2(_x + RearX * c - WheelY * sn, _y + RearX * sn + WheelY * c);
            s.wheelPos[1] = new Vector2(_x + FrontX * c - WheelY * sn, _y + FrontX * sn + WheelY * c);
            s.throttle = _gas; s.brake = _brake; s.load01 = _load;
            s.airTime = _airTime; s.grounded = _grounded; s.crashed = _crashed; s.finished = _finished;
        }

        public bool TryDequeueEvent(out SimEvent e)
        {
            if (_events.Count > 0) { e = _events.Dequeue(); return true; }
            e = default; return false;
        }
    }
}
