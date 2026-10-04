using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>The outcome of decoding one command line: a command, or an error text.</summary>
    public sealed class CommandDecode
    {
        private CommandDecode(Command? command, string? error)
        {
            Command = command;
            Error = error;
        }

        public bool Ok => Command != null;

        public Command? Command { get; }

        public string? Error { get; }

        public static CommandDecode Success(Command command) => new CommandDecode(command, null);

        public static CommandDecode Failure(string error) => new CommandDecode(null, error);
    }

    /// <summary>
    /// A one-line, invariant text form of every command, used to record and replay games (13 section 9: a replay is the scenario,
    /// the seed and the accepted commands). Fields are separated by one space; ids and tiles are plain integers; roles use their
    /// ids ("u.line"); unit lists are comma separated. <c>Decode(Encode(c))</c> equals <c>c</c> for every command.
    /// </summary>
    public static class CommandCodec
    {
        public static string Encode(Command command)
        {
            switch (command)
            {
                case MoveCommand m: return Join("move", m.Slot, m.UnitId, m.Target.X, m.Target.Y);
                case FoundBaseCommand f: return Join("found", f.Slot, f.UnitId);
                case BuildCommand b: return Join("build", b.Slot, b.BaseId, RoleIds.Of(b.Role), b.At.X, b.At.Y);
                case UpgradeCommand u: return Join("upgrade", u.Slot, u.BaseId, u.BuildingIndex);
                case AttackCommand a: return Join("attack", a.Slot, a.Kind == AttackKind.Raid ? "raid" : "capture", a.Target.X, a.Target.Y, Ids(a.UnitIds));
                case RecruitCommand r: return Join("recruit", r.Slot, r.BaseId, RoleIds.Of(r.Role), r.Level);
                case PatronTradeCommand p: return Join("patron", p.Slot, p.BaseId, RoleIds.Of(p.Resource), p.Amount, p.Buy ? "buy" : "sell");
                case DetachCommand d: return Join("detach", d.Slot, d.UnitId);
                case EndTurnCommand e: return Join("end", e.Slot);
                default: throw new System.ArgumentException("Unknown command type " + command.GetType().Name, nameof(command));
            }
        }

        public static CommandDecode Decode(string line)
        {
            string[] f = line.Split(' ');
            switch (f[0])
            {
                case "move": return Ints(f, 5, v => new MoveCommand(v[1], v[2], new TileCoord(v[3], v[4])));
                case "found": return Ints(f, 3, v => new FoundBaseCommand(v[1], v[2]));
                case "build": return DecodeBuild(f);
                case "upgrade": return Ints(f, 4, v => new UpgradeCommand(v[1], v[2], v[3]));
                case "attack": return DecodeAttack(f);
                case "recruit": return DecodeRecruit(f);
                case "patron": return DecodePatron(f);
                case "detach": return Ints(f, 3, v => new DetachCommand(v[1], v[2]));
                case "end": return Ints(f, 2, v => new EndTurnCommand(v[1]));
                default: return CommandDecode.Failure("unknown command '" + f[0] + "'");
            }
        }

        private static CommandDecode DecodeBuild(string[] f)
        {
            if (f.Length != 6 || !RoleIds.TryParse(f[3], out BuildingRole role) || !TryInt(f[1], out int slot) || !TryInt(f[2], out int baseId)
                || !TryInt(f[4], out int x) || !TryInt(f[5], out int y))
            {
                return CommandDecode.Failure("bad build line");
            }

            return CommandDecode.Success(new BuildCommand(slot, baseId, role, new TileCoord(x, y)));
        }

        private static CommandDecode DecodeAttack(string[] f)
        {
            if (f.Length != 6 || (f[2] != "capture" && f[2] != "raid") || !TryInt(f[1], out int slot) || !TryInt(f[3], out int x) || !TryInt(f[4], out int y))
            {
                return CommandDecode.Failure("bad attack line");
            }

            var ids = new List<int>();
            foreach (string part in f[5].Split(','))
            {
                if (!TryInt(part, out int id))
                {
                    return CommandDecode.Failure("bad unit list");
                }

                ids.Add(id);
            }

            AttackKind kind = f[2] == "raid" ? AttackKind.Raid : AttackKind.Capture;
            return CommandDecode.Success(new AttackCommand(slot, ImmArray<int>.From(ids), new TileCoord(x, y), kind));
        }

        private static CommandDecode DecodeRecruit(string[] f)
        {
            if (f.Length != 5 || !RoleIds.TryParse(f[3], out UnitRole role) || !TryInt(f[1], out int slot) || !TryInt(f[2], out int baseId) || !TryInt(f[4], out int level))
            {
                return CommandDecode.Failure("bad recruit line");
            }

            return CommandDecode.Success(new RecruitCommand(slot, baseId, role, level));
        }

        private static CommandDecode DecodePatron(string[] f)
        {
            bool sideOk = f.Length == 6 && (f[5] == "buy" || f[5] == "sell");
            if (!sideOk || !RoleIds.TryParse(f[3], out Resource resource) || !TryInt(f[1], out int slot) || !TryInt(f[2], out int baseId) || !TryInt(f[4], out int amount))
            {
                return CommandDecode.Failure("bad patron line");
            }

            return CommandDecode.Success(new PatronTradeCommand(slot, baseId, resource, amount, f[5] == "buy"));
        }

        private static CommandDecode Ints(string[] f, int count, System.Func<int[], Command> make)
        {
            if (f.Length != count)
            {
                return CommandDecode.Failure("'" + f[0] + "' takes " + (count - 1) + " numbers");
            }

            var v = new int[count];
            for (int i = 1; i < count; i++)
            {
                if (!TryInt(f[i], out v[i]))
                {
                    return CommandDecode.Failure("not a number: '" + f[i] + "'");
                }
            }

            return CommandDecode.Success(make(v));
        }

        private static bool TryInt(string text, out int value) =>
            int.TryParse(text, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out value);

        private static string Ids(ImmArray<int> ids)
        {
            var sb = new StringBuilder();
            for (int i = 0; i < ids.Count; i++)
            {
                sb.Append(i == 0 ? string.Empty : ",").Append(ids[i].ToString(CultureInfo.InvariantCulture));
            }

            return sb.ToString();
        }

        private static string Join(string name, params object[] parts)
        {
            var sb = new StringBuilder(name);
            foreach (object part in parts)
            {
                sb.Append(' ').Append(System.Convert.ToString(part, CultureInfo.InvariantCulture));
            }

            return sb.ToString();
        }
    }
}
