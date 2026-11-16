using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Tyre tracks as a ring of straight segments (max 64 per buffer), each with a birth time so it can fade.
    /// Plain class (no Unity objects) so the teleport rule is unit tested:
    ///  - Clear() forgets everything, including the last point, so the next point never joins the crash spot.
    ///  - A point further than MaxJoin from the last one starts a new strip instead of drawing a long segment.
    ///  - Lifting a wheel (Lift) also ends the strip, so a jump leaves a gap.
    /// </summary>
    public sealed class TrackBuffer
    {
        public const int MaxSegments = 64;
        public const float MaxJoin = 2.5f;   // metres; a real wheel never moves this far between two track points

        public struct Segment { public Vector3 a, b; public float born; }

        readonly Segment[] _ring = new Segment[MaxSegments];
        int _head, _count;
        Vector3 _last; bool _hasLast;

        public readonly float spacing, life;
        public int Count => _count;
        public bool HasLast => _hasLast;

        public TrackBuffer(float spacing = 0.6f, float life = 6f) { this.spacing = spacing; this.life = life; }

        /// <summary>i = 0 is the oldest live segment.</summary>
        public Segment this[int i] => _ring[(_head - _count + i + MaxSegments * 2) % MaxSegments];

        public void Clear() { _count = 0; _head = 0; _hasLast = false; }

        /// <summary>The wheel left the ground: the next point starts a new strip.</summary>
        public void Lift() { _hasLast = false; }

        /// <summary>A grounded wheel contact point at time t. Returns true when a segment was added.</summary>
        public bool Add(Vector3 p, float t)
        {
            if (!_hasLast) { _last = p; _hasLast = true; return false; }
            float d = Vector3.Distance(p, _last);
            if (d > MaxJoin) { _last = p; return false; }          // teleport or glitch: new strip, no long line
            if (d < spacing) return false;
            _ring[_head] = new Segment { a = _last, b = p, born = t };
            _head = (_head + 1) % MaxSegments;
            if (_count < MaxSegments) _count++;
            _last = p;
            return true;
        }

        /// <summary>Drops segments older than life.</summary>
        public void Expire(float t)
        {
            while (_count > 0 && t - this[0].born > life) _count--;
        }

        /// <summary>0..1 opacity of a segment of the given age (holds, then fades over the last 60 %).</summary>
        public float Fade(float age) => Mathf.Clamp01((life - age) / (life * 0.6f));

        /// <summary>Longest live segment (tests and the FX probe: a streak shows up here).</summary>
        public float LongestSegment()
        {
            float m = 0f;
            for (int i = 0; i < _count; i++) { var s = this[i]; m = Mathf.Max(m, Vector3.Distance(s.a, s.b)); }
            return m;
        }
    }
}
