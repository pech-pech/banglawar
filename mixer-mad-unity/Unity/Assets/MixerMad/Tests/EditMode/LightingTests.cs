using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using MixerMad.Game;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace MixerMad.Tests
{
    /// <summary>
    /// P2 polish, lighting workstream (GAMEUP-REVIEW D2, D3, D5; lessons L-MM-29, L-MM-30, L-MM-32).
    /// Budgets come from the camera rig through LightingBudget, so a rig change re-checks the lighting.
    /// </summary>
    public class LightingTests
    {
        const float TimeStep = 0.01f;

        static (float clear, float snow, float blizzard) FogDefaults()
        {
            // AddComponent in edit mode does not run Awake, so this reads the shipped field defaults only.
            var go = new GameObject("WeatherProbe");
            try
            {
                var w = go.AddComponent<Weather>();
                return (w.clearFog, w.snowFog, w.blizzardFog);
            }
            finally { Object.DestroyImmediate(go); }
        }

        [Test]
        public void LaneDistance_MatchesTheRigMaths()
        {
            Assert.That(LightingBudget.LaneDistance, Is.EqualTo(31.7f).Within(0.1f));
        }

        [Test]
        public void Fog_AtTheLane_IsAtMostTenPercent_ForClearAndSnow()
        {
            var fog = FogDefaults();
            float d = LightingBudget.LaneDistance;
            float keep = 1f - LightingBudget.LaneHazeCap;
            Assert.That(LightingBudget.Exp2Transmittance(fog.clear, d), Is.GreaterThanOrEqualTo(keep), "Clear fog over the lane");
            Assert.That(LightingBudget.Exp2Transmittance(fog.snow, d), Is.GreaterThanOrEqualTo(keep), "Snow fog over the lane");
        }

        [Test]
        public void Fog_Blizzard_IsTheDocumentedException_AndStillThickerThanSnow()
        {
            var fog = FogDefaults();
            Assert.That(fog.blizzard, Is.GreaterThan(fog.snow), "blizzard must read as thicker than snowfall");
        }

        [Test]
        public void ShadowDistance_ReachesFifteenMetresPastTheLane_OnEveryPresetWithShadows()
        {
            foreach (var p in QualityPresets.Table)
            {
                if (p.shadowCascades == 0) continue;   // Low: contact blobs only
                Assert.That(p.shadowDistance, Is.GreaterThanOrEqualTo(LightingBudget.MinShadowDistance), p.name);
            }
        }

        [Test]
        public void Sun_IsBehindTheScene_SoShadowsFallTowardTheCamera_AllDay()
        {
            // The camera looks along +z. A sun with toSun.z > 0 throws shadows toward -z: onto the road top and
            // the front lip the camera sees, instead of hiding them behind the props.
            for (float t = 0f; t < 1f; t += TimeStep)
            {
                Vector3 toSun = DayNight.SunDirection(t);
                Assert.That(toSun.z, Is.GreaterThan(0.1f), $"t={t:F2}");
                Assert.That(toSun.y, Is.GreaterThan(0.05f), $"t={t:F2}: the key must stay above the horizon");
            }
        }

        [Test]
        public void Sun_ComesFromTheSide_NotStraightBehind()
        {
            // Mostly a side light: shadows also stretch along the road so they read in a side-on view.
            for (float t = 0f; t < 1f; t += TimeStep)
            {
                Vector3 s = DayNight.SunDirection(t);
                float side = Mathf.Abs(s.x), back = s.z;
                Assert.That(side + back, Is.GreaterThan(0.3f), $"t={t:F2}");
            }
        }

        [Test]
        public void Shade_ReadsAgainstLitSnow_AtEveryTimeWithASun()
        {
            for (float t = 0f; t < 1f; t += TimeStep)
            {
                if (DayNight.NightAt(t) >= 0.5f) continue;   // moonlight is allowed to be soft
                Assert.That(DayNight.GroundShadeContrast(t), Is.GreaterThanOrEqualTo(1.3f), $"t={t:F2}");
            }
        }

        [Test]
        public void ContactBlob_IsDarkestOnTheGround_AndGoneHighInTheAir()
        {
            Assert.That(ContactShadows.BlobAlpha(0f), Is.EqualTo(ContactShadows.MaxAlpha).Within(1e-4f));
            Assert.That(ContactShadows.BlobAlpha(0.5f), Is.LessThan(ContactShadows.MaxAlpha));
            Assert.That(ContactShadows.BlobAlpha(ContactShadows.FadeHeight + 0.01f), Is.EqualTo(0f));
            Assert.That(ContactShadows.BlobAlpha(-0.2f), Is.EqualTo(ContactShadows.MaxAlpha).Within(1e-4f), "a wheel sunk into the snow still gets its blob");
        }

        [Test]
        public void MmOff_SwitchesOnlyTheNamedLightingFeatures()
        {
            try
            {
                FeatureToggles.ApplyCommandLine(new[] { "app", "-mmOff", "ssao,shafts" });
                Assert.That(FeatureToggles.Ssao, Is.False);
                Assert.That(FeatureToggles.LightShafts, Is.False);
                Assert.That(FeatureToggles.ContactShadows, Is.True);
                Assert.That(FeatureToggles.Shadows, Is.True);
            }
            finally { FeatureToggles.Ssao = FeatureToggles.LightShafts = FeatureToggles.ContactShadows = FeatureToggles.Shadows = true; }
        }

        [Test]
        public void EveryUrpRenderer_HasPostProcessData_SoPostRunsInThePlayer()
        {
            // A UniversalRendererData without postProcessData switches ALL post-processing off (bloom, tonemap,
            // grade, DoF), whatever the camera and Volume say. That is what made the P2 post on/off stills identical.
            var assets = new System.Collections.Generic.List<UniversalRenderPipelineAsset>();
            if (GraphicsSettings.defaultRenderPipeline is UniversalRenderPipelineAsset d) assets.Add(d);
            for (int i = 0; i < QualitySettings.names.Length; i++)
                if (QualitySettings.GetRenderPipelineAssetAt(i) is UniversalRenderPipelineAsset q) assets.Add(q);
            Assert.That(assets, Is.Not.Empty, "no URP asset in Graphics or Quality settings");
            foreach (var a in assets.Distinct())
                foreach (var rd in a.rendererDataList)
                {
                    var urd = rd as UniversalRendererData;
                    Assert.That(urd, Is.Not.Null, a.name + ": renderer is not a UniversalRendererData");
                    Assert.That(urd.postProcessData, Is.Not.Null, a.name + "/" + urd.name + ": post-processing is off on the renderer");
                }
        }

        [Test]
        public void PostVolume_IsGlobal_AndOnALayerTheMainCameraReads()
        {
            var sys = new GameObject("QualityProbe");
            var cam = new GameObject("CamProbe").AddComponent<Camera>();
            try
            {
                var q = sys.AddComponent<QualityPresets>();
                typeof(QualityPresets).GetMethod("EnsureVolumes", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(q, null);
                var data = cam.GetUniversalAdditionalCameraData();
                foreach (var v in new[] { q.postVolume, q.dofVolume })
                {
                    Assert.That(v, Is.Not.Null);
                    Assert.That(v.isGlobal, Is.True, v.name);
                    Assert.That((data.volumeLayerMask.value & (1 << v.gameObject.layer)) != 0, Is.True, v.name + " is on a layer the camera ignores");
                }
                Assert.That(q.postVolume.sharedProfile.Has<ColorAdjustments>(), Is.True);
                Assert.That(q.postVolume.sharedProfile.Has<Tonemapping>(), Is.True);
            }
            finally { Object.DestroyImmediate(sys); Object.DestroyImmediate(cam.gameObject); }
        }

        [Test]
        public void EveryPresetField_IsReadByCode()
        {
            string runtime = Path.Combine(Application.dataPath, "MixerMad", "Runtime");
            string code = string.Join("\n", Directory.GetFiles(runtime, "*.cs", SearchOption.AllDirectories).Select(File.ReadAllText));
            var unread = typeof(Preset).GetFields(BindingFlags.Public | BindingFlags.Instance)
                .Select(f => f.Name)
                .Where(n => !Regex.IsMatch(code, @"\b(p|preset|Current|QualityPresets\.Current)\s*\.\s*" + n + @"\b(?!\s*=[^=])"))
                .ToList();
            Assert.That(unread, Is.Empty, "Preset fields nothing reads (L-MM-32): " + string.Join(", ", unread));
        }
    }
}
