using System.Text.Json;
using Conquest.Presentation;

namespace Conquest.Tests.Presentation
{
    public class ShoreAutotileTests
    {
        private static JsonElement Golden() =>
            JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "golden", "shore-autotile.golden.json"))).RootElement;

        [Test]
        public void Every_raw_mask_matches_the_python_code_and_name()
        {
            JsonElement g = Golden();
            JsonElement codes = g.GetProperty("raw_codes");
            JsonElement names = g.GetProperty("raw_names");
            Assert.That(codes.GetArrayLength(), Is.EqualTo(256));
            for (int raw = 0; raw < 256; raw++)
            {
                int code = ShoreAutotile.CodeOf(raw);
                Assert.That(code, Is.EqualTo(codes[raw].GetInt32()), "code of raw " + raw);
                Assert.That(ShoreAutotile.NameOf(code), Is.EqualTo(names[raw].GetString()), "name of raw " + raw);
                Assert.That(ShoreAutotile.KeyForRawMask(raw), Is.EqualTo("tile." + names[raw].GetString()));
            }
        }

        [Test]
        public void The_canonical_set_is_the_same_47_codes_as_python()
        {
            JsonElement codes = Golden().GetProperty("codes");
            int[] ours = ShoreAutotile.AllCodes();

            Assert.That(ours.Length, Is.EqualTo(ShoreAutotile.CanonicalCount));
            var theirs = new List<int>();
            foreach (JsonProperty p in codes.EnumerateObject())
            {
                int code = int.Parse(p.Name);
                theirs.Add(code);
                Assert.That(ShoreAutotile.NameOf(code), Is.EqualTo(p.Value.GetString()), "code " + code);
            }

            Assert.That(ours, Is.EquivalentTo(theirs));
        }

        [Test]
        public void No_land_is_open_water()
        {
            Assert.That(ShoreAutotile.KeyAt(3, 3, (x, y) => false), Is.EqualTo(ShoreAutotile.OpenWaterKey));
        }

        [TestCase(0, 1, "tile.water_edge_sw", TestName = "Land one step down the +y axis lies on the screen's south-west side")]
        [TestCase(1, 0, "tile.water_edge_se", TestName = "Land one step along +x lies south-east")]
        [TestCase(0, -1, "tile.water_edge_ne", TestName = "Land one step along -y lies north-east")]
        [TestCase(-1, 0, "tile.water_edge_nw", TestName = "Land one step along -x lies north-west")]
        [TestCase(1, 1, "tile.water_inner_s", TestName = "Land on the +x +y diagonal is the south corner")]
        [TestCase(-1, -1, "tile.water_inner_n", TestName = "Land on the -x -y diagonal is the north corner")]
        [TestCase(1, -1, "tile.water_inner_e", TestName = "Land on the +x -y diagonal is the east corner")]
        [TestCase(-1, 1, "tile.water_inner_w", TestName = "Land on the -x +y diagonal is the west corner")]
        public void Game_grid_offsets_are_flipped_into_the_art_frame(int dx, int dy, string expected)
        {
            string key = ShoreAutotile.KeyAt(5, 5, (x, y) => x == 5 + dx && y == 5 + dy);

            Assert.That(key, Is.EqualTo(expected));
        }

        [Test]
        public void A_river_with_land_on_two_opposite_sides_is_a_channel()
        {
            // +x and -x land: the river runs along the y axis, which is the screen's NE to SW line.
            string key = ShoreAutotile.KeyAt(5, 5, (x, y) => y == 5 && x != 5);

            Assert.That(key, Is.EqualTo("tile.water_channel_nw_se"));
        }

        [Test]
        public void A_diagonal_cell_is_ignored_when_a_side_next_to_it_is_land()
        {
            // land south-east (+x) and its two diagonals: the diagonals add nothing.
            int withDiagonals = ShoreAutotile.RawMaskAt(5, 5, (x, y) => x == 6);
            string key = ShoreAutotile.KeyForRawMask(withDiagonals);

            Assert.That(key, Is.EqualTo("tile.water_edge_se"));
        }

        [Test]
        public void Raw_mask_reads_the_eight_neighbours_and_never_the_tile_itself()
        {
            var asked = new HashSet<(int, int)>();
            ShoreAutotile.RawMaskAt(2, 2, (x, y) => { asked.Add((x, y)); return false; });

            Assert.That(asked, Has.Count.EqualTo(8));
            Assert.That(asked, Does.Not.Contain((2, 2)));
            foreach ((int x, int y) in asked) Assert.That(Math.Max(Math.Abs(x - 2), Math.Abs(y - 2)), Is.EqualTo(1));
        }

        [Test]
        public void Unknown_codes_and_a_missing_predicate_are_rejected()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => ShoreAutotile.KeyOf(256));
            Assert.Throws<ArgumentOutOfRangeException>(() => ShoreAutotile.NameOf(-1));
            Assert.Throws<ArgumentOutOfRangeException>(() => ShoreAutotile.KeyOf(17 + 16));
            Assert.Throws<ArgumentNullException>(() => ShoreAutotile.RawMaskAt(0, 0, null!));
        }

        [Test]
        public void Every_shore_key_is_in_the_pipeline_catalogue()
        {
            string text = File.ReadAllText(FindCatalogue());
            foreach (int code in ShoreAutotile.AllCodes())
            {
                string name = ShoreAutotile.NameOf(code);
                Assert.That(text, Does.Contain("\"id\": \"" + name + "\""), name);
            }
        }

        private static string FindCatalogue()
        {
            for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir != null; dir = dir.Parent)
            {
                string candidate = Path.Combine(dir.FullName, "tools", "assets", "themes", "bd1971", "catalogue.json");
                if (File.Exists(candidate)) return candidate;
            }

            Assert.Ignore("catalogue not found");
            return "";
        }
    }
}
