using System;
using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>Player input for ONE sim step. Digital 0/1 on touch and keys, analog on gamepad triggers.</summary>
    public struct SimInput
    {
        public float gas;
        public float brake;
        public static SimInput None => default;
    }

    public enum SimEventKind
    {
        None = 0,
        Takeoff,
        Landing,      // magnitude = impact speed (m/s)
        Crash,
        Finish,       // job done (world fact)
        Pickup,
        ZoneEnter,    // magnitude = zone id
        BigAir,       // fired once when air time passes the big-air threshold
        Respawn       // the truck was put back after a crash: views must snap, not smooth
    }

    public struct SimEvent
    {
        public SimEventKind kind;
        public float magnitude;
        public Vector2 pos;
        public double simTime;
    }

    /// <summary>
    /// A copy of everything the view layer may read from the sim. Pre-allocated, no GC.
    /// The view layer NEVER writes to the sim; it only reads two of these and blends them.
    /// Coordinates: metres, x forward, y up. Chassis origin = bottom centre of the truck
    /// (the point on the ground under the middle of the wheelbase when it stands still).
    /// Angles in radians, counter-clockwise positive.
    /// </summary>
    public sealed class SimSnapshot
    {
        public const int MaxWheels = 8;

        public double time;
        public Vector2 chassisPos;
        public float chassisAngle;
        public Vector2 velocity;
        public int wheelCount;
        public readonly Vector2[] wheelPos = new Vector2[MaxWheels];   // world centre of each sim wheel
        public float throttle, brake, load01;
        public float airTime;          // seconds since both wheels left the ground, 0 if grounded
        public bool grounded;
        public bool crashed;
        public bool finished;
        public float speed => velocity.magnitude;

        public void CopyFrom(SimSnapshot s)
        {
            time = s.time; chassisPos = s.chassisPos; chassisAngle = s.chassisAngle; velocity = s.velocity;
            wheelCount = s.wheelCount;
            for (int i = 0; i < MaxWheels; i++) wheelPos[i] = s.wheelPos[i];
            throttle = s.throttle; brake = s.brake; load01 = s.load01; airTime = s.airTime;
            grounded = s.grounded; crashed = s.crashed; finished = s.finished;
        }

        /// <summary>dst = a blended toward b by t (0..1). Flags and one-shot values come from b.</summary>
        public static void Lerp(SimSnapshot a, SimSnapshot b, float t, SimSnapshot dst)
        {
            dst.CopyFrom(b);
            dst.time = a.time + (b.time - a.time) * t;
            dst.chassisPos = Vector2.LerpUnclamped(a.chassisPos, b.chassisPos, t);
            dst.chassisAngle = Mathf.LerpUnclamped(a.chassisAngle, b.chassisAngle, t);
            dst.velocity = Vector2.LerpUnclamped(a.velocity, b.velocity, t);
            int n = Mathf.Min(a.wheelCount, b.wheelCount);
            for (int i = 0; i < n; i++) dst.wheelPos[i] = Vector2.LerpUnclamped(a.wheelPos[i], b.wheelPos[i], t);
            dst.throttle = Mathf.Lerp(a.throttle, b.throttle, t);
            dst.brake = Mathf.Lerp(a.brake, b.brake, t);
            dst.load01 = Mathf.Lerp(a.load01, b.load01, t);
        }
    }

    /// <summary>
    /// What the Unity side needs from a physics world. The ONLY file that knows the real
    /// MixerMad.Sim API is MixerSimBackend.cs; everything else talks to this interface.
    /// </summary>
    public interface ISimBackend
    {
        /// <summary>Fixed step length in seconds (1/120).</summary>
        double StepSeconds { get; }
        /// <summary>The physics road line (x forward, y up). Collision lives here, never on the 3D mesh.</summary>
        Vector2[] RoadLine { get; }
        /// <summary>Per road-line segment flags for visuals only (1 = ice). May be null.</summary>
        byte[] RoadSurface { get; }
        float FinishX { get; }
        void Reset();
        void Step(in SimInput input);
        void Capture(SimSnapshot dst);
        bool TryDequeueEvent(out SimEvent e);
    }

    /// <summary>Anything that can give the sim its input once per step.</summary>
    public interface ISimInputSource
    {
        SimInput Sample();
    }
}
