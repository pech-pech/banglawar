namespace Conquest.Content
{
    /// <summary>
    /// One problem found while reading or checking content. <see cref="Path"/> is a JSON path such as
    /// <c>$.pre_placed_bases[2].buildings[0].at</c>; <see cref="Code"/> is a stable dotted id (tests pin it).
    /// </summary>
    public sealed class ContentError
    {
        public ContentError(string path, string code, string message, int line = 0, int column = 0)
        {
            Path = path;
            Code = code;
            Message = message;
            Line = line;
            Column = column;
        }

        public string Path { get; }

        public string Code { get; }

        public string Message { get; }

        /// <summary>1-based source line, or 0 when the error has no single source position.</summary>
        public int Line { get; }

        public int Column { get; }

        public override string ToString()
        {
            string where = Line > 0 ? " (line " + Line + ", column " + Column + ")" : string.Empty;
            return Code + " at " + Path + where + ": " + Message;
        }
    }
}
