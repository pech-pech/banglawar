using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace MixerMad.Sim
{
    /// <summary>Tiny JSON reader (object = Dictionary&lt;string,object&gt;, array = List&lt;object&gt;, number = double, bool, string, null).
    /// Used only at load time so the library needs no Json package inside Unity.</summary>
    public static class MiniJson
    {
        public static object Parse(string s)
        {
            int i = 0; var v = Val(s, ref i); Ws(s, ref i);
            if (i != s.Length) throw new FormatException("JSON: trailing data at " + i);
            return v;
        }
        static void Ws(string s, ref int i) { while (i < s.Length && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) i++; }
        static object Val(string s, ref int i)
        {
            Ws(s, ref i);
            if (i >= s.Length) throw new FormatException("JSON: unexpected end");
            char c = s[i];
            if (c == '{')
            {
                i++; var d = new Dictionary<string, object>(); Ws(s, ref i);
                if (s[i] == '}') { i++; return d; }
                for (; ; )
                {
                    Ws(s, ref i); string k = Str(s, ref i); Ws(s, ref i);
                    if (s[i++] != ':') throw new FormatException("JSON: ':' expected at " + i);
                    d[k] = Val(s, ref i); Ws(s, ref i);
                    char n = s[i++]; if (n == '}') return d; if (n != ',') throw new FormatException("JSON: ',' expected at " + i);
                }
            }
            if (c == '[')
            {
                i++; var l = new List<object>(); Ws(s, ref i);
                if (s[i] == ']') { i++; return l; }
                for (; ; )
                {
                    l.Add(Val(s, ref i)); Ws(s, ref i);
                    char n = s[i++]; if (n == ']') return l; if (n != ',') throw new FormatException("JSON: ',' expected at " + i);
                }
            }
            if (c == '"') return Str(s, ref i);
            if (string.CompareOrdinal(s, i, "true", 0, 4) == 0) { i += 4; return true; }
            if (string.CompareOrdinal(s, i, "false", 0, 5) == 0) { i += 5; return false; }
            if (string.CompareOrdinal(s, i, "null", 0, 4) == 0) { i += 4; return null; }
            int st = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            if (st == i) throw new FormatException("JSON: bad token at " + i);
            return double.Parse(s.Substring(st, i - st), NumberStyles.Float, CultureInfo.InvariantCulture);
        }
        static string Str(string s, ref int i)
        {
            if (s[i] != '"') throw new FormatException("JSON: string expected at " + i);
            i++; var sb = new StringBuilder();
            while (s[i] != '"')
            {
                char c = s[i++];
                if (c != '\\') { sb.Append(c); continue; }
                c = s[i++];
                switch (c)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u': sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16)); i += 4; break;
                    default: sb.Append(c); break;
                }
            }
            i++; return sb.ToString();
        }
        public static double Num(object o) { return (double)o; }
        public static List<object> Arr(object o) { return (List<object>)o; }
        public static Dictionary<string, object> Obj(object o) { return (Dictionary<string, object>)o; }
    }
}
