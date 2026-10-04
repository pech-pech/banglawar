using System.Globalization;

namespace Conquest.Bootstrap
{
    /// <summary>The scenario writes slots as "f1", "f2" ...; the core uses indices 0, 1 ...</summary>
    public static class SlotNames
    {
        public static bool TryParse(string? name, out int slot)
        {
            slot = -1;
            if (name == null || name.Length < 2 || name[0] != 'f')
            {
                return false;
            }

            if (!int.TryParse(name.Substring(1), NumberStyles.None, CultureInfo.InvariantCulture, out int number) || number < 1)
            {
                return false;
            }

            slot = number - 1;
            return true;
        }
    }
}
