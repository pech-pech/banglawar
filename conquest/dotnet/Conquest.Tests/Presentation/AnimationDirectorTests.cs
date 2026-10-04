using System.Collections.Generic;
using System.Linq;
using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class AnimationDirectorTests
    {
        /// <summary>A manifest stand-in: maps "kind.role.state" to a clip; falls back to idle like the real chain.</summary>
        private sealed class FakeCatalog : IClipCatalog
        {
            private readonly Dictionary<string, ClipInfo> clips = new Dictionary<string, ClipInfo>();
            public List<(string Kind, string Role, string? State, string? Slot, Facing Dir)> Asked { get; } =
                new List<(string, string, string?, string?, Facing)>();

            public FakeCatalog Add(string kind, string role, string state, int frames = 6, int fps = 12, bool loop = true)
            {
                clips[kind + "." + role + "." + state] = new ClipInfo(kind + "." + role + "." + state, state, frames, fps, loop);
                return this;
            }

            public ClipInfo? Find(string kind, string role, string? state, string? slot, Facing renderDirection)
            {
                Asked.Add((kind, role, state, slot, renderDirection));
                if (state != null && clips.TryGetValue(kind + "." + role + "." + state, out ClipInfo? exact))
                {
                    return exact;
                }

                return clips.TryGetValue(kind + "." + role + ".idle", out ClipInfo? idle) ? idle : null;
            }
        }

        private static PresentationEvent Moved(params GridPos[] path) =>
            new PresentationEvent(PresentationEventKind.UnitMoved, 7, "scout", "f1", path[0], path);

        [Test]
        public void MoveUsesTheWalkClip_FacingTheFirstStep_AndLastsOneStepPerTile()
        {
            var catalog = new FakeCatalog().Add("u", "scout", "walk", 8, 12).Add("u", "scout", "idle");
            var director = new AnimationDirector(catalog);

            IReadOnlyList<AnimationCue> cues = director.Direct(Moved(new GridPos(1, 1), new GridPos(2, 1), new GridPos(3, 1)));

            AnimationCue cue = cues.Single();
            Assert.That(cue.Kind, Is.EqualTo(CueKind.MoveAlong));
            Assert.That(cue.Clip!.Key, Is.EqualTo("u.scout.walk"));
            Assert.That(cue.Facing, Is.EqualTo(Facing.SE));
            Assert.That(cue.DurationMs, Is.EqualTo(2 * AnimationDirector.MsPerTile));
            Assert.That(cue.Blocking, Is.True);
            Assert.That(cue.Path.Count, Is.EqualTo(3));
            Assert.That(cue.SoundId, Is.EqualTo(AnimationDirector.SoundMove));
            Assert.That(cue.UnitId, Is.EqualTo(7));
            Assert.That(catalog.Asked[0].Slot, Is.EqualTo("f1"));
        }

        [Test]
        public void WestwardMovesAskForTheMirroredDirection()
        {
            var catalog = new FakeCatalog().Add("u", "scout", "walk");
            new AnimationDirector(catalog).Direct(Moved(new GridPos(5, 5), new GridPos(4, 5)));
            Assert.That(catalog.Asked[0].Dir, Is.EqualTo(Facing.NE));
        }

        [Test]
        public void MoveWithoutAWalkClipFallsBackToIdle_AndWithoutAnyClipStillGlides()
        {
            var withIdle = new FakeCatalog().Add("u", "scout", "idle");
            AnimationCue idleCue = new AnimationDirector(withIdle).Direct(Moved(new GridPos(0, 0), new GridPos(0, 1))).Single();
            Assert.That(idleCue.Clip!.State, Is.EqualTo("idle"));
            Assert.That(idleCue.Facing, Is.EqualTo(Facing.SW));

            AnimationCue bare = new AnimationDirector(new FakeCatalog()).Direct(Moved(new GridPos(0, 0), new GridPos(0, 1))).Single();
            Assert.That(bare.Clip, Is.Null);
            Assert.That(bare.Kind, Is.EqualTo(CueKind.MoveAlong));
        }

        [Test]
        public void MoveWithAPathShorterThanTwoMakesNoCues()
        {
            var director = new AnimationDirector(new FakeCatalog());
            Assert.That(director.Direct(Moved(new GridPos(0, 0))), Is.Empty);
        }

        [Test]
        public void SpawnFadesInOnTheIdleClip()
        {
            var catalog = new FakeCatalog().Add("u", "line", "idle");
            var e = new PresentationEvent(PresentationEventKind.UnitSpawned, 3, "line", "f2", new GridPos(4, 4));
            AnimationCue cue = new AnimationDirector(catalog).Direct(e).Single();
            Assert.That(cue.Kind, Is.EqualTo(CueKind.SpawnIn));
            Assert.That(cue.Clip!.Key, Is.EqualTo("u.line.idle"));
            Assert.That(cue.Blocking, Is.False);
            Assert.That(cue.SoundId, Is.EqualTo(AnimationDirector.SoundSpawn));
            Assert.That(cue.Tile, Is.EqualTo(new GridPos(4, 4)));
        }

        [Test]
        public void DestroyedWithADownClipPlaysItThenFades()
        {
            var catalog = new FakeCatalog().Add("u", "line", "down", 5, 10, false).Add("u", "line", "idle");
            var e = new PresentationEvent(PresentationEventKind.UnitDestroyed, 3, "line", "f1", new GridPos(2, 2));
            IReadOnlyList<AnimationCue> cues = new AnimationDirector(catalog).Direct(e);
            Assert.That(cues.Select(c => c.Kind), Is.EqualTo(new[] { CueKind.PlayClip, CueKind.FadeOut }));
            Assert.That(cues[0].DurationMs, Is.EqualTo(500));
            Assert.That(cues[0].Blocking, Is.True);
            Assert.That(cues[1].Blocking, Is.False);
        }

        [Test]
        public void DestroyedWithoutADownClipJustFades_NeverPlayingIdleAsDeath()
        {
            var catalog = new FakeCatalog().Add("u", "line", "idle");
            var e = new PresentationEvent(PresentationEventKind.UnitDestroyed, 3, "line", "f1", new GridPos(2, 2));
            IReadOnlyList<AnimationCue> cues = new AnimationDirector(catalog).Direct(e);
            Assert.That(cues.Single().Kind, Is.EqualTo(CueKind.FadeOut));
            Assert.That(cues.Single().Blocking, Is.True);
            Assert.That(cues.Single().SoundId, Is.EqualTo(AnimationDirector.SoundDown));
        }

        [Test]
        public void AttackUsesTheClipWhenItExists_OtherwiseANudgeTowardTheTarget()
        {
            var target = new[] { new GridPos(6, 5) };
            var e = new PresentationEvent(PresentationEventKind.UnitAttacked, 1, "line", "f1", new GridPos(5, 5), target);

            var withClip = new FakeCatalog().Add("u", "line", "attack", 4, 8, false);
            AnimationCue clip = new AnimationDirector(withClip).Direct(e).Single();
            Assert.That(clip.Kind, Is.EqualTo(CueKind.PlayClip));
            Assert.That(clip.Facing, Is.EqualTo(Facing.SE));
            Assert.That(clip.DurationMs, Is.EqualTo(500));

            var withoutClip = new FakeCatalog().Add("u", "line", "idle");
            AnimationCue nudge = new AnimationDirector(withoutClip).Direct(e).Single();
            Assert.That(nudge.Kind, Is.EqualTo(CueKind.Nudge));
            Assert.That(nudge.Clip, Is.Null);
            Assert.That(nudge.DurationMs, Is.EqualTo(AnimationDirector.NudgeMs));
        }

        [Test]
        public void AttackWithNoTargetPathFacesTheDefault()
        {
            var e = new PresentationEvent(PresentationEventKind.UnitAttacked, 1, "line", "f1", new GridPos(5, 5));
            AnimationCue cue = new AnimationDirector(new FakeCatalog()).Direct(e).Single();
            Assert.That(cue.Facing, Is.EqualTo(Facing.SE));
        }

        [Test]
        public void BuildingEventsUseConstructAndBuiltClips()
        {
            var catalog = new FakeCatalog().Add("bld", "core", "construct", 6, 6, false).Add("bld", "core", "built", 1, 1, false);
            var director = new AnimationDirector(catalog);

            var started = new PresentationEvent(PresentationEventKind.BuildingStarted, -1, "core", "f1", new GridPos(8, 8));
            AnimationCue construct = director.Direct(started).Single();
            Assert.That(construct.Clip!.Key, Is.EqualTo("bld.core.construct"));
            Assert.That(construct.DurationMs, Is.EqualTo(1000));
            Assert.That(construct.SoundId, Is.EqualTo(AnimationDirector.SoundConstruct));

            var done = new PresentationEvent(PresentationEventKind.BuildingCompleted, -1, "core", "f1", new GridPos(8, 8));
            AnimationCue built = director.Direct(done).Single();
            Assert.That(built.Clip!.Key, Is.EqualTo("bld.core.built"));
            Assert.That(built.DurationMs, Is.EqualTo(0));
            Assert.That(built.SoundId, Is.EqualTo(AnimationDirector.SoundBuilt));
        }

        [Test]
        public void BuildingWithNoRoleOrNoClipStillMakesASoundCue()
        {
            var director = new AnimationDirector(new FakeCatalog());
            var noRole = new PresentationEvent(PresentationEventKind.BuildingCompleted, -1, null, null, new GridPos(1, 1));
            Assert.That(director.Direct(noRole).Single().Clip, Is.Null);
            var noClip = new PresentationEvent(PresentationEventKind.BuildingStarted, -1, "core", "f1", new GridPos(1, 1));
            Assert.That(director.Direct(noClip).Single().Clip, Is.Null);
        }

        [Test]
        public void TurnAndSeasonEventsBecomeBannerCues()
        {
            var director = new AnimationDirector(new FakeCatalog());
            var turn = new PresentationEvent(PresentationEventKind.TurnStarted, -1, null, null, new GridPos(0, 0), null, null, 12);
            AnimationCue turnCue = director.Direct(turn).Single();
            Assert.That(turnCue.Kind, Is.EqualTo(CueKind.ShowTurn));
            Assert.That(turnCue.Blocking, Is.False);

            var season = new PresentationEvent(PresentationEventKind.SeasonChanged, -1, null, null, new GridPos(0, 0), null, "season.wet");
            AnimationCue seasonCue = director.Direct(season).Single();
            Assert.That(seasonCue.Kind, Is.EqualTo(CueKind.ShowSeason));
            Assert.That(seasonCue.SeasonId, Is.EqualTo("season.wet"));
            Assert.That(turn.Turn, Is.EqualTo(12));
        }

        [Test]
        public void UnitEventWithoutARoleStillProducesCuesWithoutClips()
        {
            var e = new PresentationEvent(PresentationEventKind.UnitSpawned, 3, null, null, new GridPos(1, 1));
            AnimationCue cue = new AnimationDirector(new FakeCatalog()).Direct(e).Single();
            Assert.That(cue.Clip, Is.Null);
        }

        [Test]
        public void DirectAllKeepsEventOrder_AndIsDeterministic()
        {
            var catalog = new FakeCatalog().Add("u", "scout", "walk").Add("u", "scout", "idle");
            var events = new List<PresentationEvent>
            {
                new PresentationEvent(PresentationEventKind.TurnStarted, -1, null, null, new GridPos(0, 0), null, null, 1),
                Moved(new GridPos(0, 0), new GridPos(1, 0)),
                new PresentationEvent(PresentationEventKind.UnitSpawned, 9, "scout", "f1", new GridPos(2, 2)),
            };
            var director = new AnimationDirector(catalog);
            var first = director.DirectAll(events).Select(c => c.Kind + ":" + c.UnitId + ":" + c.DurationMs).ToList();
            var second = director.DirectAll(events).Select(c => c.Kind + ":" + c.UnitId + ":" + c.DurationMs).ToList();
            Assert.That(first, Is.EqualTo(new[] { "ShowTurn:-1:900", "MoveAlong:7:320", "SpawnIn:9:250" }));
            Assert.That(second, Is.EqualTo(first));
        }

        [Test]
        public void NullArgumentsThrow()
        {
            Assert.Throws<System.ArgumentNullException>(() => new AnimationDirector(null!));
            var director = new AnimationDirector(new FakeCatalog());
            Assert.Throws<System.ArgumentNullException>(() => director.Direct(null!));
            Assert.Throws<System.ArgumentNullException>(() => director.DirectAll(null!));
        }

        [Test]
        public void ClipInfoDurationIsFramesOverFps()
        {
            Assert.That(new ClipInfo("k", "s", 12, 8, true).DurationMs, Is.EqualTo(1500));
            Assert.That(new ClipInfo("k", "s", 1, 8, false).DurationMs, Is.EqualTo(0));
            Assert.That(new ClipInfo("k", null, 6, 0, false).DurationMs, Is.EqualTo(0));
        }
    }
}
