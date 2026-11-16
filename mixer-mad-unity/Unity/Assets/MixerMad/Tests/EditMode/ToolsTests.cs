using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using NUnit.Framework;
using MixerMad.Game;

namespace MixerMad.Tests
{
    /// <summary>
    /// The evidence tools (P2 polish, GAMEUP fixes 10-11, D10, L-MM-33/34/35): the full still set covers what the
    /// phase promises, the feature flags come from reflection, and the benchmark plan is warm, shuffled and repeatable.
    /// </summary>
    public class ToolsTests
    {
        // ---- still set (L-MM-34): every time of day, the blizzard, the ice, the crash, the finish and Calm motion
        [Test]
        public void StillSetCoversEveryPromisedScenario()
        {
            string[] required = { "start", "mid_drive", "jump", "crash", "finish", "dawn", "dusk", "night", "blizzard", "frozen_lake", "calm" };
            foreach (var word in required)
                Assert.IsTrue(StillsSet.Scenarios.Any(s => s.Contains(word)), "no still for " + word);
        }

        [Test]
        public void StillNamesAreUniqueNumberedAndFileSafe()
        {
            Assert.AreEqual(StillsSet.Scenarios.Count, StillsSet.Scenarios.Distinct().Count());
            foreach (var s in StillsSet.Scenarios)
            {
                StringAssert.IsMatch(@"^\d\d_[a-z_]+$", s);
            }
        }

        [Test]
        public void TimesOfDayAreDistinctAndInRange()
        {
            float[] t = { StillsSet.Dawn, StillsSet.Day, StillsSet.Dusk, StillsSet.Night };
            Assert.AreEqual(4, t.Distinct().Count());
            foreach (var v in t) Assert.That(v, Is.InRange(0f, 1f));
            Assert.Less(StillsSet.Dawn, StillsSet.Day);
            Assert.Less(StillsSet.Day, StillsSet.Dusk);
            Assert.Less(StillsSet.Dusk, StillsSet.Night);
        }

        // ---- on/off pairs (L-MM-33): one pair per flag, found by reflection
        [Test]
        public void FeatureFlagsComeFromReflection()
        {
            var expected = typeof(FeatureToggles).GetFields(BindingFlags.Public | BindingFlags.Static)
                .Concat(typeof(FxToggles).GetFields(BindingFlags.Public | BindingFlags.Static))
                .Where(f => f.FieldType == typeof(bool) || f.FieldType == typeof(float))
                .Select(f => f.Name).OrderBy(n => n, System.StringComparer.Ordinal).ToArray();
            CollectionAssert.AreEqual(expected, FeatureToggleFields.Names().ToArray());
            CollectionAssert.IsSubsetOf(new[] { "Shadows", "Bloom", "Dof", "Planar", "Outline", "PostProcess", "WeatherParticles", "FogSheets" },
                FeatureToggleFields.Names().ToArray());
            CollectionAssert.IsSubsetOf(new[] { "Spray", "Exhaust", "Tracks", "Beacon", "Headlights", "Sparkle", "LivingWorld" },
                FeatureToggleFields.Names().ToArray());
        }

        [Test]
        public void SwitchingAFlagNotifiesTheFxListeners()
        {
            int fx = 0;
            System.Action onFx = () => fx++;
            FxToggles.Changed += onFx;
            try { FeatureToggles.Notify(); }
            finally { FxToggles.Changed -= onFx; }
            Assert.AreEqual(1, fx);
        }

        [Test]
        public void FinishOnlyEffectsArePairedAtTheFinish()
        {
            Assert.AreEqual(StillSpot.Finish, StillsSet.SpotFor("Sparkle"));
            Assert.AreEqual(StillSpot.Drive, StillsSet.SpotFor("Spray"), "spray only shows while driving on snow");
        }

        [Test]
        public void ExpectedFilesHaveAnOnAndOffStillForEveryFlag()
        {
            var flags = FeatureToggleFields.Names();
            var files = StillsSet.ExpectedFiles(flags);
            foreach (var f in flags)
            {
                CollectionAssert.Contains(files, "fx_" + f.ToLowerInvariant() + "_on");
                CollectionAssert.Contains(files, "fx_" + f.ToLowerInvariant() + "_off");
            }
            CollectionAssert.Contains(files, StillsSet.BaselineA);
            CollectionAssert.Contains(files, StillsSet.BaselineB);
            CollectionAssert.Contains(files, StillsSet.BaselineLiveA);
            CollectionAssert.Contains(files, StillsSet.BaselineLiveB);
            Assert.AreEqual(files.Count, files.Distinct().Count(), "two stills would overwrite each other");
        }

        [Test]
        public void EffectsAreShotWhereTheyShow()
        {
            Assert.AreEqual(StillSpot.Ice, StillsSet.SpotFor("Planar"));
            Assert.AreEqual(StillSpot.Finish, StillsSet.SpotFor("Dof"));
            Assert.AreEqual(StillSpot.Mid, StillsSet.SpotFor("Shadows"));
            Assert.AreEqual(StillSpot.Mid, StillsSet.SpotFor("SomeFlagAddedLater"));
            Assert.AreEqual(StillSpot.Mid, StillsSet.SpotFor("PriceTag"), "'ice' inside a word is not the lake");
        }

        [Test]
        public void SetAndRestoreFlagsLeavesThemAsTheyWere()
        {
            var before = FeatureToggleFields.Snapshot();
            try
            {
                foreach (var f in FeatureToggleFields.All())
                {
                    FeatureToggleFields.Set(f, false);
                    Assert.IsFalse(FeatureToggleFields.IsOn(f), f.Name);
                    FeatureToggleFields.Set(f, true);
                    Assert.IsTrue(FeatureToggleFields.IsOn(f), f.Name);
                    FeatureToggleFields.Set(f, false);
                }
                FeatureToggleFields.Restore(before);
                foreach (var f in FeatureToggleFields.All()) Assert.AreEqual(before[f.Name], f.GetValue(null), f.Name);
            }
            finally { FeatureToggleFields.Restore(before); }
        }

        [Test]
        public void FullModeIsReadFromTheCommandLine()
        {
            Assert.IsTrue(StillsSet.IsFull(new[] { "app", "-mmStills", "/tmp/x", "-mmStillsSet", "full" }));
            Assert.IsTrue(StillsSet.IsFull(new[] { "-mmStillsSet", " FULL " }));
            Assert.IsFalse(StillsSet.IsFull(new[] { "-mmStills", "/tmp/x" }));
            Assert.IsFalse(StillsSet.IsFull(new[] { "-mmStillsSet" }));
            Assert.IsFalse(StillsSet.IsFull(null));
        }

        // ---- benchmark (D10, L-MM-35)
        [Test]
        public void ShuffleIsDeterministicAndAPermutation()
        {
            var a = BenchmarkRunner.Shuffled(4, BenchmarkRunner.ShuffleSeed);
            var b = BenchmarkRunner.Shuffled(4, BenchmarkRunner.ShuffleSeed);
            CollectionAssert.AreEqual(a, b);
            CollectionAssert.AreEquivalent(new[] { 0, 1, 2, 3 }, a);
            CollectionAssert.AreNotEqual(new[] { 0, 1, 2, 3 }, a, "the fixed seed should not leave Low first");
            bool anyDiffers = Enumerable.Range(1, 20).Any(s => !BenchmarkRunner.Shuffled(4, s).SequenceEqual(a));
            Assert.IsTrue(anyDiffers, "the seed should matter");
        }

        [Test]
        public void PlanWarmsUpFirstThenEveryPresetOnceThenEveryFlagOffAndOn()
        {
            var flags = FeatureToggleFields.Names();
            var plan = BenchmarkRunner.Plan(flags, 40f, 15f, 10f, BenchmarkRunner.ShuffleSeed);
            Assert.AreEqual(BenchmarkRunner.RunKind.Warmup, plan[0].kind);
            var presets = plan.Where(r => r.kind == BenchmarkRunner.RunKind.Preset).Select(r => r.preset).ToArray();
            CollectionAssert.AreEquivalent(new[] { 0, 1, 2, 3 }, presets);
            CollectionAssert.AreEqual(BenchmarkRunner.Shuffled(4, BenchmarkRunner.ShuffleSeed), presets);
            foreach (var f in flags)
            {
                Assert.AreEqual(1, plan.Count(r => r.flag == f && r.kind == BenchmarkRunner.RunKind.FeatureOff), f);
                Assert.AreEqual(1, plan.Count(r => r.flag == f && r.kind == BenchmarkRunner.RunKind.FeatureOn), f);
            }
            Assert.IsTrue(plan.Where(r => r.flag != null).All(r => r.preset == (int)QualityLevel.High), "features are measured on High");
            Assert.AreEqual(1 + 4 + 2 * flags.Count, plan.Count);
        }

        [Test]
        public void PlanWithoutWarmupOrFeatureTimeSkipsThem()
        {
            var plan = BenchmarkRunner.Plan(FeatureToggleFields.Names(), 40f, 0f, 0f, 1);
            Assert.AreEqual(4, plan.Count);
            Assert.IsTrue(plan.All(r => r.kind == BenchmarkRunner.RunKind.Preset));
        }

        [Test]
        public void FeatureCsvReportsOnMinusOff()
        {
            var off = new BenchmarkRunner.Result { run = new BenchmarkRunner.Run(BenchmarkRunner.RunKind.FeatureOff, 2, "Bloom", 1f), frames = 10, avgMs = 1f, gpuMs = 0.5f, cpuMs = 0.4f };
            var on = new BenchmarkRunner.Result { run = new BenchmarkRunner.Run(BenchmarkRunner.RunKind.FeatureOn, 2, "Bloom", 1f), frames = 10, avgMs = 1.25f, gpuMs = 0.75f, cpuMs = 0.4f };
            var csv = BenchmarkRunner.FeaturesCsv(new List<BenchmarkRunner.Result> { on, off });
            var lines = csv.Trim().Split('\n');
            Assert.AreEqual(2, lines.Length);
            StringAssert.StartsWith("flag,preset,", lines[0]);
            StringAssert.StartsWith("Bloom,High,10,10,1.000,1.250,0.250,0.500,0.750,0.250,0.400,0.400,0.000", lines[1]);
        }
        // ---- on/off pairs where the effect shows (L-MM-33): night lamps, a landing, a snowy drive
        [Test]
        public void ConditionalEffectsArePairedWhereTheyShow()
        {
            Assert.AreEqual(StillSpot.Night, StillsSet.SpotFor("Headlights"));
            Assert.AreEqual(StillSpot.Night, StillsSet.SpotFor("Beacon"));
            Assert.AreEqual(StillSpot.Landing, StillsSet.SpotFor("LandingPuff"));
            Assert.AreEqual(StillSpot.Drive, StillsSet.SpotFor("Spray"));
            Assert.AreEqual(StillSpot.Mid, StillsSet.SpotFor("Exhaust"));
            Assert.AreEqual(StillSpot.Mid, StillsSet.SpotFor("Shadows"));
        }

        [Test]
        public void EveryFlagHasASpotTheRunnerVisits()
        {
            var visited = new[] { StillSpot.Mid, StillSpot.Night, StillSpot.Drive, StillSpot.Landing, StillSpot.Ice, StillSpot.Finish };
            foreach (var f in FeatureToggleFields.Names()) CollectionAssert.Contains(visited, StillsSet.SpotFor(f), f);
        }

        [Test]
        public void EmitterFlagsNameTheParticlesTheirOffStateClears()
        {
            // a paused frame keeps particles that were already emitted; TruckFx clears them when the flag goes off
            Assert.AreEqual("FX_WheelSpray", StillsSet.EmitterFor("Spray"));
            Assert.AreEqual("FX_LandingPuff", StillsSet.EmitterFor("LandingPuff"));
            Assert.AreEqual("FX_Exhaust", StillsSet.EmitterFor("Exhaust"));
            Assert.AreEqual("FX_GoldSparkle", StillsSet.EmitterFor("Sparkle"));
            Assert.IsNull(StillsSet.EmitterFor("Shadows"));
            Assert.IsNull(StillsSet.EmitterFor("Headlights"));
        }

        [Test]
        public void ReviewClockStandsStillWhileFrozenAndNeverJumpsAfter()
        {
            Assert.AreEqual(0f, ReviewClock.DeltaFor(true, 0.016f));
            Assert.AreEqual(0.016f, ReviewClock.DeltaFor(false, 0.016f));
            // frozen at 10 s for 4 s: shows 10 the whole time, and 10.5 half a second after unfreezing (not 14.5)
            Assert.AreEqual(10f, ReviewClock.NowFor(12f, true, 10f, 0f));
            Assert.AreEqual(10f, ReviewClock.NowFor(13.9f, true, 10f, 0f));
            Assert.AreEqual(10.5f, ReviewClock.NowFor(14.5f, false, 10f, 4f), 1e-5f);
        }

        // ---- benchmark GPU time: a run without a single GPU sample says n/a, never 0
        static UnityEngine.FrameTiming Timing(ulong start, double gpu, double cpu) =>
            new UnityEngine.FrameTiming { frameStartTimestamp = start, gpuFrameTime = gpu, cpuFrameTime = cpu };

        [Test]
        public void FrameTimingAccumulatorCountsEachFrameOnceAndSkipsMissingGpu()
        {
            var acc = new FrameTimingAccumulator();
            Assert.IsTrue(float.IsNaN(acc.GpuMs), "no samples yet is no data, not 0");
            // newest first, as GetLatestTimings returns them; the newest frame's GPU time is not in yet
            acc.Add(new[] { Timing(30, 0, 1.0), Timing(20, 2.0, 1.0), Timing(10, 4.0, 1.0) }, 3);
            Assert.AreEqual(2, acc.GpuSamples);
            Assert.AreEqual(3.0f, acc.GpuMs, 1e-5f);
            // the next call sees frame 30 again, now with its GPU time, plus a new frame: each counted once
            acc.Add(new[] { Timing(40, 0, 1.0), Timing(30, 6.0, 1.0), Timing(20, 2.0, 1.0) }, 3);
            Assert.AreEqual(3, acc.GpuSamples);
            Assert.AreEqual(4.0f, acc.GpuMs, 1e-5f);
            Assert.AreEqual(4, acc.CpuSamples);
            acc.Reset();
            Assert.IsTrue(float.IsNaN(acc.GpuMs) && float.IsNaN(acc.CpuMs));
        }

        [Test]
        public void FrameTimingAccumulatorWithOnlyZeroGpuTimesReportsNoData()
        {
            var acc = new FrameTimingAccumulator();
            for (ulong f = 1; f <= 50; f++) acc.Add(new[] { Timing(f, 0, 0.8) }, 1);
            Assert.AreEqual(0, acc.GpuSamples);
            Assert.IsTrue(float.IsNaN(acc.GpuMs));
            Assert.AreEqual(0.8f, acc.CpuMs, 1e-5f);
        }

        [Test]
        public void BenchmarkCsvWritesNaForAMissingGpuReading()
        {
            var high = new BenchmarkRunner.Result { run = new BenchmarkRunner.Run(BenchmarkRunner.RunKind.Preset, 2, null, 1f), frames = 10, avgMs = 0.77f, gpuMs = float.NaN, cpuMs = 0.77f };
            var line = BenchmarkRunner.SummaryCsv(new List<BenchmarkRunner.Result> { high }).Trim().Split('\n')[1].Split(',');
            Assert.AreEqual("n/a", line[7], "gpu_ms");
            Assert.AreEqual("0.77", line[8], "cpu_ms");
            var off = new BenchmarkRunner.Result { run = new BenchmarkRunner.Run(BenchmarkRunner.RunKind.FeatureOff, 2, "Bloom", 1f), frames = 10, avgMs = 1f, gpuMs = float.NaN, cpuMs = 0.4f };
            var on = new BenchmarkRunner.Result { run = new BenchmarkRunner.Run(BenchmarkRunner.RunKind.FeatureOn, 2, "Bloom", 1f), frames = 10, avgMs = 1f, gpuMs = 0.75f, cpuMs = 0.4f };
            var row = BenchmarkRunner.FeaturesCsv(new List<BenchmarkRunner.Result> { on, off }).Trim().Split('\n')[1].Split(',');
            Assert.AreEqual(new[] { "n/a", "0.750", "n/a" }, new[] { row[7], row[8], row[9] }, "gpu off, on, cost");
            var runs = BenchmarkRunner.RunsCsv(new List<BenchmarkRunner.Result> { high }).Trim().Split('\n');
            StringAssert.EndsWith(",gpu_samples", runs[0]);
            StringAssert.Contains(",n/a,", runs[1]);
            StringAssert.EndsWith(",0", runs[1], "no GPU samples");
        }
    }
}
