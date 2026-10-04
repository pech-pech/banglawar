using Conquest.Assets.Lookup;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    public sealed class ClipCatalogTests
    {
        private const string Sheet = @"{
  ""schema"": ""sprite-sheet/1"", ""theme"": ""t"", ""variant"": ""snapped"", ""tile_px"": 256, ""pixels_per_unit"": 256,
  ""projection"": {""kind"": ""iso_2_1"", ""tile_w"": 256, ""tile_h"": 128}, ""max_page"": 4096, ""padding"": 2,
  ""layers"": [{""id"": ""unit"", ""order"": 30, ""sorting"": ""depth"", ""tiebreak"": 3}],
  ""pages"": [{""file"": ""a.png"", ""group"": ""units"", ""sha256"": ""x"", ""size"": [64, 64]}],
  ""entries"": [
    {""key"": ""u.scout.move_se@f1"", ""kind"": ""u"", ""role"": ""scout"", ""state"": ""move_se"", ""slot"": ""f1"", ""atlas_group"": ""units"", ""layer"": ""unit"",
     ""sort"": {""rule"": ""custom_axis_y"", ""bias"": 0, ""point_offset_px"": [0, -64]}, ""footprint"": [1, 1], ""fps"": 12, ""loop"": false, ""events"": [], ""tags"": [],
     ""review"": {""status"": ""prototype""}, ""size"": [8, 8], ""pivot_px"": [4, 0], ""source_size"": [8, 8], ""source_anchor_px"": [4, 8], ""trim_offset"": [0, 0],
     ""frame_count"": 2, ""frames"": [{""page"": 0, ""rect"": [0, 0, 8, 8]}, {""page"": 0, ""rect"": [8, 0, 8, 8]}], ""pixel_sha256"": ""y"", ""dir"": null, ""level"": null, ""variant"": null},
    {""key"": ""u.scout.idle@f1"", ""kind"": ""u"", ""role"": ""scout"", ""state"": ""idle"", ""slot"": ""f1"", ""atlas_group"": ""units"", ""layer"": ""unit"",
     ""sort"": {""rule"": ""custom_axis_y"", ""bias"": 0, ""point_offset_px"": [0, -64]}, ""footprint"": [1, 1], ""fps"": 8, ""loop"": true, ""events"": [], ""tags"": [],
     ""review"": {""status"": ""prototype""}, ""size"": [8, 8], ""pivot_px"": [4, 0], ""source_size"": [8, 8], ""source_anchor_px"": [4, 8], ""trim_offset"": [0, 0],
     ""frame_count"": 1, ""frames"": [{""page"": 0, ""rect"": [16, 0, 8, 8]}], ""pixel_sha256"": ""z"", ""dir"": null, ""level"": null, ""variant"": null}
  ]
}";

        private static ClipCatalogAdapter Adapter() => new ClipCatalogAdapter(AssetCatalog.FromJson(Sheet));

        [TestCase(Facing.NE, "move_ne")]
        [TestCase(Facing.N, "move_ne")]
        [TestCase(Facing.SE, "move_se")]
        [TestCase(Facing.E, "move_se")]
        [TestCase(Facing.SW, "move_sw")]
        [TestCase(Facing.S, "move_sw")]
        [TestCase(Facing.NW, "move_nw")]
        [TestCase(Facing.W, "move_nw")]
        public void WalkStateUsesTheFourWayManifestNames(Facing facing, string expected)
        {
            Assert.AreEqual(expected, ClipCatalogAdapter.WalkState(facing));
        }

        [Test]
        public void WalkRequestFindsTheMoveClipAndReportsTheRequestedState()
        {
            ClipInfo? clip = Adapter().Find("u", "scout", AnimationDirector.StateWalk, "f1", Facing.SE);

            Assert.NotNull(clip);
            Assert.AreEqual("u.scout.move_se@f1", clip!.Key);
            Assert.AreEqual(AnimationDirector.StateWalk, clip.State);
            Assert.AreEqual(2, clip.Frames);
        }

        [Test]
        public void MissingDirectionGivesNullAndTheDirectorFallsBackToTheIdleClip()
        {
            Assert.IsNull(Adapter().Find("u", "scout", AnimationDirector.StateWalk, "f1", Facing.NE));
            var director = new AnimationDirector(Adapter());
            var move = new PresentationEvent(PresentationEventKind.UnitMoved, 1, "scout", "f1", new GridPos(0, -1),
                new[] { new GridPos(0, 0), new GridPos(0, -1) });

            AnimationCue cue = director.Direct(move)[0];

            Assert.AreEqual("u.scout.idle@f1", cue.Clip!.Key, "no move_ne art: the idle loop plays while the banner glides");
        }

        [Test]
        public void UnknownRoleGivesNull()
        {
            Assert.IsNull(Adapter().Find("u", "nobody", "idle", "f1", Facing.SE));
        }

        [Test]
        public void DirectorPlaysTheWalkClipThroughTheAdapter()
        {
            var director = new AnimationDirector(Adapter());
            var move = new PresentationEvent(PresentationEventKind.UnitMoved, 1, "scout", "f1", new GridPos(2, 0),
                new[] { new GridPos(0, 0), new GridPos(1, 0), new GridPos(2, 0) });

            var cues = director.Direct(move);

            Assert.AreEqual(1, cues.Count);
            Assert.AreEqual(CueKind.MoveAlong, cues[0].Kind);
            Assert.AreEqual("u.scout.move_se@f1", cues[0].Clip!.Key);
            Assert.AreEqual(2 * AnimationDirector.MsPerTile, cues[0].DurationMs);
        }
    }
}
