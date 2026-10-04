using System.Collections.Generic;
using Conquest.Core.Contracts;

namespace Conquest.Core.Turn
{
    /// <summary>The state hash at the start of one turn (turn 0 is the opening state).</summary>
    public sealed class TurnHash
    {
        public TurnHash(int turn, string hashHex)
        {
            Turn = turn;
            HashHex = hashHex;
        }

        public int Turn { get; }

        public string HashHex { get; }
    }

    /// <summary>
    /// What a replay produced. <c>FailedLine</c> is the 0-based index of the first line that was not a valid, accepted command
    /// (-1 when every line was applied); <c>Error</c> says why.
    /// </summary>
    public sealed class ReplayResult
    {
        public ReplayResult(GameState finalState, IReadOnlyList<TurnHash> trail, IReadOnlyList<GameEvent> events, int applied, int failedLine, string? error)
        {
            FinalState = finalState;
            Trail = trail;
            Events = events;
            Applied = applied;
            FailedLine = failedLine;
            Error = error;
        }

        public GameState FinalState { get; }

        /// <summary>One entry for the opening state and one for the start of every turn the commands completed.</summary>
        public IReadOnlyList<TurnHash> Trail { get; }

        public IReadOnlyList<GameEvent> Events { get; }

        public int Applied { get; }

        public int FailedLine { get; }

        public string? Error { get; }

        public bool Ok => FailedLine < 0;
    }

    /// <summary>
    /// Plays a recorded command list (text lines from <see cref="CommandCodec"/>) through <see cref="CommandEngine"/> from a start
    /// state. The same start state, services and lines always give the same trail (13 section 3.5). Blank lines and lines
    /// starting with <c>#</c> are skipped.
    /// </summary>
    public static class GameReplay
    {
        public static ReplayResult Run(GameState start, TurnServices services, IReadOnlyList<string> lines)
        {
            GameState state = start;
            var trail = new List<TurnHash> { new TurnHash(state.Turn, StateHasher.HashHex(state)) };
            var events = new List<GameEvent>();
            int applied = 0;
            for (int i = 0; i < lines.Count; i++)
            {
                string line = lines[i].Trim();
                if (line.Length == 0 || line[0] == '#')
                {
                    continue;
                }

                CommandDecode decoded = CommandCodec.Decode(line);
                if (!decoded.Ok)
                {
                    return new ReplayResult(state, trail, events, applied, i, decoded.Error);
                }

                CommandResult result = CommandEngine.Apply(state, decoded.Command!, services);
                if (!result.Ok)
                {
                    return new ReplayResult(state, trail, events, applied, i, result.Error);
                }

                applied++;
                for (int e = 0; e < result.Events.Count; e++)
                {
                    events.Add(result.Events[e]);
                }

                if (result.State.Turn != state.Turn)
                {
                    trail.Add(new TurnHash(result.State.Turn, StateHasher.HashHex(result.State)));
                }

                state = result.State;
            }

            return new ReplayResult(state, trail, events, applied, -1, null);
        }
    }
}
