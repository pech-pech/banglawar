using System.Collections.Generic;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;

namespace Conquest.Core.Save
{
    /// <summary>
    /// References inside a loaded state: a carried unit's commander, a housed unit's base, the units of a queued attack, and the
    /// bases named by recruit and patron orders must exist and belong to the right slot. Field ranges are checked by the readers.
    /// </summary>
    internal static class IntegrityCheck
    {
        public static void Run(GameState s, List<SaveError> errors)
        {
            Units(s, errors);
            for (int i = 0; i < s.Attacks.Count; i++)
            {
                AttackOrder a = s.Attacks[i];
                for (int k = 0; k < a.UnitIds.Count; k++)
                {
                    int u = s.FindUnitIndex(a.UnitIds[k]);
                    if (u < 0 || s.UnitTable[u].Owner != a.Slot)
                    {
                        Bad(errors, "/state/attacks/" + i + "/units/" + k, "an attacking unit must exist and belong to the ordering slot");
                    }
                }
            }

            for (int i = 0; i < s.Recruits.Count; i++)
            {
                RequireBase(s, errors, s.Recruits[i].BaseId, -1, "/state/recruits/" + i + "/base");
            }

            for (int i = 0; i < s.PatronOrders.Count; i++)
            {
                RequireBase(s, errors, s.PatronOrders[i].BaseId, s.PatronOrders[i].Slot, "/state/patron/" + i + "/base");
            }

            if (!s.MatchOver && s.WinnerSlot >= 0)
            {
                Bad(errors, "/state/winner", "a winner needs a finished match");
            }
        }

        private static void Units(GameState s, List<SaveError> errors)
        {
            for (int i = 0; i < s.UnitTable.Count; i++)
            {
                Unit u = s.UnitTable[i];
                if (u.Leader != 0)
                {
                    int l = s.FindUnitIndex(u.Leader);
                    if (l < 0 || s.UnitTable[l].Owner != u.Owner || s.UnitTable[l].Role != UnitRole.Commander || u.Leader == u.Id)
                    {
                        Bad(errors, "/state/units/" + i + "/leader", "a carrier must be a commander of the same slot");
                    }
                }

                if (u.AttachedBase != 0)
                {
                    RequireBase(s, errors, u.AttachedBase, u.Owner, "/state/units/" + i + "/base");
                }
            }
        }

        private static void RequireBase(GameState s, List<SaveError> errors, int baseId, int owner, string pointer)
        {
            int b = s.FindBaseIndex(baseId);
            if (b < 0 || (owner >= 0 && s.BaseTable[b].Owner != owner))
            {
                Bad(errors, pointer, "the base must exist" + (owner >= 0 ? " and belong to the same slot" : string.Empty));
            }
        }

        private static void Bad(List<SaveError> errors, string pointer, string message)
        {
            errors.Add(new SaveError(pointer, SaveFormat.BadReference, message));
        }
    }
}
