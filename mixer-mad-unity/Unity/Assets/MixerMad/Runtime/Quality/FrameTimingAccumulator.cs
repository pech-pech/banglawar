using UnityEngine;

namespace MixerMad.Game
{
    /// <summary>
    /// Averages GPU and CPU frame times from FrameTimingManager (D10 benchmark). The newest frame's GPU time is often
    /// not in yet when it is read (Metal reports it a frame or more later), so reading only the latest frame can
    /// return 0 every time and a run then showed "0.00 ms GPU". This reads a few recent frames, counts each frame at
    /// most once per measure (by its start timestamp), skips readings that are not in yet, and reports NaN, not 0,
    /// when there was no reading at all. Pure: tests feed it FrameTiming values.
    /// </summary>
    public sealed class FrameTimingAccumulator
    {
        /// <summary>How many recent frames to ask FrameTimingManager for each frame.</summary>
        public const int Window = 4;

        ulong _lastGpu, _lastCpu;
        double _gpuSum, _cpuSum;

        public int GpuSamples { get; private set; }
        public int CpuSamples { get; private set; }

        /// <summary>Mean GPU ms, NaN when no frame had a GPU reading.</summary>
        public float GpuMs => GpuSamples > 0 ? (float)(_gpuSum / GpuSamples) : float.NaN;
        /// <summary>Mean CPU ms, NaN when no frame had a CPU reading.</summary>
        public float CpuMs => CpuSamples > 0 ? (float)(_cpuSum / CpuSamples) : float.NaN;

        /// <summary>Starts a new average. Keeps which frames were already seen, so none is counted in two runs.</summary>
        public void Reset()
        {
            _gpuSum = _cpuSum = 0; GpuSamples = CpuSamples = 0;
        }

        /// <summary>Adds the first <paramref name="count"/> timings, newest first (the order GetLatestTimings uses).</summary>
        public void Add(FrameTiming[] timings, int count)
        {
            if (timings == null) return;
            count = Mathf.Min(count, timings.Length);
            ulong newestGpu = _lastGpu, newestCpu = _lastCpu;
            for (int i = 0; i < count; i++)
            {
                var t = timings[i];
                if (t.frameStartTimestamp > _lastGpu && t.gpuFrameTime > 0)
                {
                    _gpuSum += t.gpuFrameTime; GpuSamples++;
                    if (t.frameStartTimestamp > newestGpu) newestGpu = t.frameStartTimestamp;
                }
                if (t.frameStartTimestamp > _lastCpu && t.cpuFrameTime > 0)
                {
                    _cpuSum += t.cpuFrameTime; CpuSamples++;
                    if (t.frameStartTimestamp > newestCpu) newestCpu = t.frameStartTimestamp;
                }
            }
            _lastGpu = newestGpu; _lastCpu = newestCpu;
        }

        /// <summary>Captures this frame's timings and adds them (call once per frame).</summary>
        public void Capture(FrameTiming[] buffer)
        {
            FrameTimingManager.CaptureFrameTimings();
            Add(buffer, (int)FrameTimingManager.GetLatestTimings((uint)buffer.Length, buffer));
        }
    }
}
