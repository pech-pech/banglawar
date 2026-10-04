using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>
    /// Pipeline step 2: upgrades whose turn has come take effect, completed orders are reported, and the turn's recruits
    /// appear at their base. A new building is reported the turn before it works (<c>ReadyTurn == Turn + 1</c>); an upgrade is
    /// reported when its new level is applied.
    /// </summary>
    internal static class DeferredStep
    {
        public static GameState Run(GameState state, List<GameEvent> events)
        {
            GameState s = state;
            for (int i = 0; i < s.BaseTable.Count; i++)
            {
                s = s.WithBase(Complete(s.BaseTable[i], s.Turn, events));
            }

            return SpawnRecruits(s, events);
        }

        private static Base Complete(Base source, int turn, List<GameEvent> events)
        {
            Base b = source;
            if (b.PendingCoreLevel > 0 && b.CoreReadyTurn <= turn)
            {
                b = b with { CoreLevel = b.PendingCoreLevel, PendingCoreLevel = 0 };
                events.Add(new CoreUpgradeCompleted(b.Id, b.CoreLevel, b.Owner));
            }

            ImmArray<Building> list = b.Buildings;
            for (int k = 0; k < list.Count; k++)
            {
                Building x = list[k];
                if (x.PendingLevel > 0 && x.ReadyTurn <= turn)
                {
                    list = list.SetItem(k, x with { Level = x.PendingLevel, PendingLevel = 0 });
                    events.Add(new BuildingCompleted(b.Id, x.Role, x.PendingLevel, b.Owner));
                }
                else if (x.PendingLevel == 0 && x.ReadyTurn == turn + 1)
                {
                    events.Add(new BuildingCompleted(b.Id, x.Role, x.Level, b.Owner));
                }
            }

            return b with { Buildings = list };
        }

        private static GameState SpawnRecruits(GameState state, List<GameEvent> events)
        {
            GameState s = state with { Recruits = ImmArray<RecruitOrder>.Empty };
            for (int i = 0; i < state.Recruits.Count; i++)
            {
                RecruitOrder r = state.Recruits[i];
                int bi = s.FindBaseIndex(r.BaseId);
                if (bi < 0)
                {
                    continue;
                }

                Base b = s.BaseTable[bi];
                int housed = r.Role == UnitRole.Founder ? 0 : b.Id;
                s = GameFactory.AddUnit(s, b.Owner, r.Role, r.Level, b.Pos, housed, 0, out int id);
                events.Add(new UnitSpawned(id, b.Owner, r.Role, r.Level, b.Pos, UnitSpawned.CauseRecruit));
            }

            return s;
        }
    }
}
