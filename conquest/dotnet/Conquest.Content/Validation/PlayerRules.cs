using System.Collections.Generic;
using Conquest.Content.Model;

namespace Conquest.Content.Validation
{
    internal static class PlayerRules
    {
        public static void Check(ScenarioData s, ErrorSink errors)
        {
            if (s.Players.Count < 2)
            {
                errors.Add("$.players", "players.count", "a scenario needs at least two players");
            }

            var seen = new HashSet<string>();
            int ai = 0;
            int human = 0;
            for (int i = 0; i < s.Players.Count; i++)
            {
                PlayerData p = s.Players[i];
                string path = "$.players[" + i + "]";
                if (!Vocabulary.Contains(Vocabulary.Slots, p.Slot))
                {
                    errors.Add(path + ".slot", "players.slot_unknown", "unknown slot '" + p.Slot + "'");
                }
                else if (!seen.Add(p.Slot))
                {
                    errors.Add(path + ".slot", "players.slot_duplicate", "slot '" + p.Slot + "' is listed twice");
                }

                if (!Vocabulary.Contains(Vocabulary.Controls, p.Control))
                {
                    errors.Add(path + ".control", "players.control", "control must be human or ai");
                }
                else if (p.Control == "ai")
                {
                    ai++;
                }
                else
                {
                    human++;
                }

                CheckStart(s, p, path, errors);
            }

            if (human == 0)
            {
                errors.Add("$.players", "players.no_human", "at least one player must be human");
            }

            if (ai != s.Settings.ComputerPlayers)
            {
                errors.Add("$.settings.computer_players", "settings.computer_players",
                    "settings say " + s.Settings.ComputerPlayers + " but " + ai + " players are ai");
            }
        }

        private static void CheckStart(ScenarioData s, PlayerData p, string path, ErrorSink errors)
        {
            if (!Vocabulary.Contains(Vocabulary.StartModes, p.StartMode))
            {
                errors.Add(path + ".start.mode", "players.start_mode", "start mode must be entry_tiles or pre_placed");
                return;
            }

            if (p.StartMode == "pre_placed")
            {
                if (!HasBase(s, p.Slot))
                {
                    errors.Add(path, "players.no_base", "slot '" + p.Slot + "' starts pre_placed but owns no pre-placed base");
                }

                if (p.StartKit != null)
                {
                    errors.Add(path + ".start_kit", "players.kit_unexpected", "a slot that starts with bases has no start kit");
                }

                return;
            }

            if (!HasGroup(s, p.Slot))
            {
                errors.Add(path, "players.no_entry_group", "slot '" + p.Slot + "' starts at entry tiles but has no entry group");
            }

            if (!HasOpeningFounder(s, p.Slot))
            {
                errors.Add(path, "players.no_founder", "slot '" + p.Slot + "' needs a turn-0 arrival with an organising team (u.founder)");
            }

            if (p.StartKit != null)
            {
                foreach (ResourceAmount a in p.StartKit.Amounts)
                {
                    CheckKit(a, path + ".start_kit." + a.Resource, errors);
                }
            }
        }

        private static void CheckKit(ResourceAmount a, string path, ErrorSink errors)
        {
            if (!Vocabulary.Contains(Vocabulary.Resources, a.Resource))
            {
                errors.Add(path, "players.kit_resource", "unknown resource '" + a.Resource + "'");
            }
            else if (a.Amount < 0 || a.Amount > Vocabulary.MaxStock * 10)
            {
                errors.Add(path, "players.kit_amount", "amount must be 0.." + (Vocabulary.MaxStock * 10));
            }
        }

        private static bool HasBase(ScenarioData s, string slot)
        {
            foreach (PrePlacedBase b in s.PrePlacedBases)
            {
                if (b.Owner == slot)
                {
                    return true;
                }
            }

            return false;
        }

        private static bool HasGroup(ScenarioData s, string slot)
        {
            foreach (EntryGroupData g in s.EntryGroups)
            {
                if (g.Slot == slot)
                {
                    return true;
                }
            }

            return false;
        }

        private static bool HasOpeningFounder(ScenarioData s, string slot)
        {
            foreach (ArrivalData a in s.Arrivals)
            {
                if (a.Slot != slot || a.Turn != 0)
                {
                    continue;
                }

                foreach (UnitGroup u in a.Units)
                {
                    if (u.Role == Vocabulary.Founder)
                    {
                        return true;
                    }
                }
            }

            return false;
        }
    }
}
