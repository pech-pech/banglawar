using System.Linq;
using Conquest.Glue;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    public sealed class LocalizerTests
    {
        private static Localizer Make() => TestContent.Load().Text;

        [Test]
        public void EveryEnglishKeyHasABengaliTranslationForTheChrome()
        {
            string json = ContentFiles.Read(GameApp.StringsFile);
            Localizer text = Localizer.FromJson(json, null);
            string[] chromeKeys = { "ui.end_turn", "ui.turn", "ui.level", "ui.strength", "ui.moves", "ui.found_base", "ui.language", "ui.hint_move", "ui.hint_confirm", "ui.hint_confirm_click", "ui.no_moves_left", "ui.hint_touch", "err.unreachable", "err.unknown", "label.season.wet" };

            text.SetLocale(Localizer.Bengali);

            foreach (string key in chromeKeys)
            {
                Assert.AreNotEqual(string.Empty, text.Get(key));
                Assert.IsTrue(text.Get(key).Any(c => c >= 'ঀ' && c <= '৿'), key + " should be Bengali script");
            }
        }

        [Test]
        public void NoStringContainsBengaliDigits()
        {
            string json = ContentFiles.Read(GameApp.StringsFile);
            Assert.IsFalse(json.Any(c => c >= '০' && c <= '৯'), "decision O-6: Western digits everywhere");
        }

        [Test]
        public void NumbersAreWesternDigitsInBothLocales()
        {
            Localizer text = Make();
            text.SetLocale(Localizer.Bengali);

            Assert.AreEqual("1971", Localizer.Number(1971));
            Assert.AreEqual("-3", Localizer.Number(-3));
            Assert.AreEqual("পালা 12", text.Get("ui.turn") + " " + Localizer.Number(12));
        }

        [Test]
        public void SwitchingLocaleRaisesTheEventAndChangesRoleLabels()
        {
            Localizer text = Make();
            string? raised = null;
            text.LocaleChanged += l => raised = l;
            string english = text.Label("u.scout", "f1");

            text.SetLocale(Localizer.Bengali);

            Assert.AreEqual(Localizer.Bengali, raised);
            Assert.AreEqual("Guide team", english);
            Assert.AreNotEqual(english, text.Label("u.scout", "f1"));
            Assert.AreNotEqual(text.Label("u.scout", "f1"), text.Label("u.scout", "f2"), "the two sides keep their own wording");
        }

        [Test]
        public void MissingBengaliKeyFallsBackToEnglishThenToTheKey()
        {
            Localizer text = Make();
            text.SetLocale(Localizer.Bengali);

            Assert.AreEqual("unknown.key", text.Get("unknown.key"));
            Assert.AreEqual("Conquest map slice", Localizer.FromJson("{\"en\":{\"ui.title\":\"Conquest map slice\"},\"bn\":{}}", null).Get("ui.title"));
        }

        [Test]
        public void SeasonIndicatorFollowsTheScheduleInBothLocales()
        {
            ContentBundle c = TestContent.Load();

            Assert.AreEqual("Before the rains", c.Seasons.Label(c.Text, 0));
            Assert.AreEqual("Monsoon", c.Seasons.Label(c.Text, 30));
            Assert.AreEqual("Dry season", c.Seasons.Label(c.Text, 70));
            c.Text.SetLocale(Localizer.Bengali);
            Assert.AreEqual("বর্ষাকাল", c.Seasons.Label(c.Text, 30));
        }
    }
}
