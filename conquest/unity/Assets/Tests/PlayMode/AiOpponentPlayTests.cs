using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Conquest.Ai;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.TestTools;

namespace Conquest.UnityView.Tests
{
    /// <summary>The scripted opponent in the running game: real clicks on End turn, compared with the headless driver.</summary>
    public sealed class AiOpponentPlayTests : UiPlayHarness
    {
        private static readonly int[] AiSlots = { 1 };

        private static GameState Headless(GameState state, TurnServices services) =>
            OpponentDriver.EndTurnWithOpponents(state, services, 0, AiSlots, OpponentFactory.Seed).State;

        private IEnumerator EndTurnByClick()
        {
            yield return ClickElement("end-turn");
            yield return WaitIdle();
        }

        [UnityTest]
        public IEnumerator EndingTheTurnByClickPlaysTheOpponentAndMatchesTheHeadlessDriver()
        {
            SaveStorageFactory.Override = new MemorySaveStorage();
            yield return Boot();
            GameState headless = map.Session.State;
            TurnServices services = map.Session.Services;
            Assert.IsNotInstanceOf<NoOpponentTurn>(map.Session.Opponent, "the scenario's ai slot is wired in at boot");

            for (int i = 0; i < 6; i++)
            {
                yield return EndTurnByClick();
                headless = Headless(headless, services);
                Assert.AreEqual(i + 1, map.Session.State.Turn);
                Assert.AreEqual(StateHasher.HashHex(headless), StateHasher.HashHex(map.Session.State), "turn " + i);
            }

            Assert.AreEqual(0, map.Session.OpponentRefusals, map.Session.OpponentProblem);
            Assert.IsNull(map.Session.OpponentProblem);
            Assert.AreNotEqual(StateHasher.HashHex(GameApp.Content!.Boot.State), StateHasher.HashHex(map.Session.State));
            Assert.AreEqual(map.Session.State.UnitTable.Count(u => map.Fog.CanSeeUnit(u)), map.Banners.Count, "banners follow the state the opponent changed");
        }

        [UnityTest]
        public IEnumerator QuickSaveAndLoadMidGameContinueIdenticallyWithTheOpponent()
        {
            SaveStorageFactory.Override = new MemorySaveStorage();
            yield return Boot();
            GameState headless = map.Session.State;
            TurnServices services = map.Session.Services;
            for (int i = 0; i < 3; i++)
            {
                yield return EndTurnByClick();
                headless = Headless(headless, services);
            }

            yield return PressKey(Key.F5);
            string savedHash = StateHasher.HashHex(map.Session.State);
            Assert.AreEqual(StateHasher.HashHex(headless), savedHash);
            yield return EndTurnByClick();
            Assert.AreNotEqual(savedHash, StateHasher.HashHex(map.Session.State));

            yield return PressKey(Key.F9);
            yield return Frames(3);
            Assert.AreEqual(savedHash, StateHasher.HashHex(map.Session.State), "load restores the saved state");

            for (int i = 0; i < 3; i++)
            {
                yield return EndTurnByClick();
                headless = Headless(headless, services);
                Assert.AreEqual(StateHasher.HashHex(headless), StateHasher.HashHex(map.Session.State), "after load, turn " + i);
            }

            Assert.AreEqual(0, map.Session.OpponentRefusals);
        }

        [UnityTest]
        public IEnumerator TheTurnBannerSaysWhatTheOpponentDidOnceItActedInView()
        {
            SaveStorageFactory.Override = new MemorySaveStorage();
            yield return Boot();
            for (int i = 0; i < 10 && map.LastOpponentText == null; i++) yield return EndTurnByClick(); // under fog the first action in view comes later (turn 8 in the play log)

            Assert.IsNotNull(map.LastOpponentText, "the opponent's visible actions are summarised");
            StringAssert.StartsWith("Opponent:", map.LastOpponentText);
        }

        /// <summary>A ten-turn play log with pictures (Screenshots/ai/). Run: run_tests.sh PlayMode AiOpponentPlayTests.</summary>
        [UnityTest, Explicit("Writes Screenshots/ai/log.txt and pictures")]
        public IEnumerator TenTurnPlayLog()
        {
            SaveStorageFactory.Override = new MemorySaveStorage();
            yield return Boot();
            var log = new StringBuilder();
            var commands = new List<string>();
            map.Session.Applied += step =>
            {
                if (step.Ok && step.Command.Slot != map.Session.LocalSlot && !(step.Command is EndTurnCommand)) commands.Add(step.Command.GetType().Name.Replace("Command", string.Empty));
            };
            for (int turn = 0; turn <= 10; turn++)
            {
                GameState s = map.Session.State;
                int mine = s.UnitTable.Count(u => u.Owner == 0), theirs = s.UnitTable.Count(u => u.Owner == 1);
                int myBases = s.BaseTable.Count(b => b.Owner == 0), theirBases = s.BaseTable.Count(b => b.Owner == 1);
                var known = Knowledge.Of(s, 0);
                int shown = 0;
                foreach (Unit u in s.UnitTable)
                {
                    if (u.Owner == 1 && map.Banners.TryGet(u.Id, out BannerView v) && v != null) shown++;
                }

                string grouped = string.Join(", ", commands.GroupBy(c => c).Select(g => g.Key + "x" + g.Count()));
                log.AppendLine("turn " + turn + ": units mine " + mine + " opp " + theirs + " | bases mine " + myBases + " opp " + theirBases
                    + " | opp units in my sight " + known.EnemyUnits.Count + ", opp banners drawn " + shown + " | opp orders last turn: " + (grouped.Length == 0 ? "-" : grouped)
                    + " | banner: " + (map.Hud.CurrentMessage.Length == 0 ? "-" : map.Hud.CurrentMessage));
                commands.Clear();
                yield return Picture("turn-" + turn.ToString("00"), s);
                if (turn == 10 || s.MatchOver) break;
                yield return EndTurnByClick();
            }

            string path = Path.Combine(ShotKit.Folder("ai"), "log.txt");
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            File.WriteAllText(path, log.ToString());
            Debug.Log("[ai-log]\n" + log);
        }

        private IEnumerator Picture(string name, GameState s)
        {
            Unit? target = null;
            foreach (Unit u in s.UnitTable)
            {
                if (u.Owner == 1) { target = u; break; }
            }

            ShotKit.Target t = ShotKit.Begin(map, 1280, 720);
            map.Rig.Refit();
            if (target != null) map.Rig.CenterOnTile(new GridPos(target.Pos.X, target.Pos.Y));
            yield return ShotKit.Frames(8);
            Texture2D picture = ShotKit.Grab(map, t);
            ShotKit.Save(picture, "ai/" + name + ".png");
            Object.Destroy(picture);
            ShotKit.End(map, t);
            map.Rig.Refit();
            yield return ShotKit.Frames(3);
        }
    }
}
