using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>Recruit and detach orders. The recruit is paid now and the unit appears when the turn resolves.</summary>
    internal static class RecruitOrders
    {
        public static CommandResult Recruit(GameState s, RecruitCommand cmd)
        {
            int bi = s.FindBaseIndex(cmd.BaseId);
            if (bi < 0)
            {
                return CommandResult.Failure(s, Err.UnknownBase);
            }

            Base b = s.BaseTable[bi];
            if (b.Owner != cmd.Slot)
            {
                return CommandResult.Failure(s, Err.NotOwner);
            }

            string? error = RecruitRules.Check(s, b, cmd.Role, cmd.Level);
            if (error != null)
            {
                return CommandResult.Failure(s, error);
            }

            GameState next = s.WithBase(b with { Stock = b.Stock.Subtract(RecruitRules.Cost(cmd.Role, cmd.Level)) });
            next = next with { Recruits = next.Recruits.Add(new RecruitOrder(b.Id, cmd.Role, cmd.Level)) };
            return CommandResult.Success(next, ImmArray<GameEvent>.Of(new RecruitOrdered(b.Id, cmd.Role, cmd.Level, cmd.Slot)));
        }

        public static CommandResult Detach(GameState s, DetachCommand cmd)
        {
            int ui = s.FindUnitIndex(cmd.UnitId);
            if (ui < 0)
            {
                return CommandResult.Failure(s, Err.UnknownUnit);
            }

            Unit u = s.UnitTable[ui];
            if (u.Owner != cmd.Slot)
            {
                return CommandResult.Failure(s, Err.NotOwner);
            }

            return CommandResult.Success(s.WithUnit(u with { AttachedBase = 0, Leader = 0 }), ImmArray<GameEvent>.Empty);
        }
    }
}
