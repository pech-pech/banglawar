using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Conquest.Content;
using Conquest.Content.Json;
using Conquest.Content.Model;
using Conquest.Content.Validation;
using Conquest.Core.Turn;
using Conquest.Glue;
using Conquest.Presentation;
using NUnit.Framework;

namespace Conquest.UnityView.Tests
{
    public sealed class StringsAndStorageTests
    {
        private static Dictionary<string, Dictionary<string, string>> Tables()
        {
            object? root = Conquest.Assets.Json.MiniJson.Parse(ContentFiles.Read(GameApp.StringsFile));
            var tables = new Dictionary<string, Dictionary<string, string>>();
            foreach (KeyValuePair<string, object?> pair in (Dictionary<string, object?>)root!)
            {
                if (!(pair.Value is Dictionary<string, object?> entries)) continue;
                tables[pair.Key] = entries.Where(e => e.Value is string).ToDictionary(e => e.Key, e => (string)e.Value!);
            }

            return tables;
        }

        [Test]
        public void EveryCoreErrorCodeHasAnEnglishAndABengaliText()
        {
            var tables = Tables();
            IEnumerable<string> codes = typeof(Err).GetFields(BindingFlags.Public | BindingFlags.Static).Where(f => f.IsLiteral).Select(f => (string)f.GetRawConstantValue()!);
            codes = codes.Concat(new[]
            {
                GameSaveService.ErrSaveFailed, GameSaveService.ErrLoadFailed, GameSaveService.ErrNoSave, GameSaveService.ErrDamaged,
                GameSaveService.ErrNewer, GameSaveService.ErrOtherScenario,
            });

            foreach (string code in codes)
            {
                Assert.IsTrue(tables["en"].ContainsKey(code), "en " + code);
                Assert.IsTrue(tables["bn"].ContainsKey(code), "bn " + code);
                Assert.IsTrue(tables["bn"][code].Any(c => c >= 'ঀ' && c <= '৿'), "bn " + code + " is Bengali script");
            }
        }

        [Test]
        public void EveryUiKeyExistsInBothLanguagesWithTheSamePlaceholders()
        {
            var tables = Tables();
            foreach (KeyValuePair<string, string> pair in tables["en"].Where(p => p.Key.StartsWith("ui.") || p.Key.StartsWith("err.")))
            {
                Assert.IsTrue(tables["bn"].ContainsKey(pair.Key), "bn is missing " + pair.Key);
                for (int i = 0; i < 3; i++)
                {
                    Assert.AreEqual(pair.Value.Contains("{" + i + "}"), tables["bn"][pair.Key].Contains("{" + i + "}"), pair.Key + " placeholder {" + i + "}");
                }
            }
        }

        [Test]
        public void EveryBuildingRoleHasABengaliLabel()
        {
            var tables = Tables();
            foreach (Conquest.Core.Contracts.BuildingRole role in System.Enum.GetValues(typeof(Conquest.Core.Contracts.BuildingRole)))
            {
                string id = Conquest.Core.Contracts.RoleIds.Of(role);
                Assert.IsTrue(tables["bn"].ContainsKey("label." + id), id);
            }
        }

        [Test]
        public void TheContentWordScannerFindsNothingInTheUiStrings()
        {
            var sink = new ErrorSink();
            ContentWordScanner.Scan(StrictJsonParser.Parse(ContentFiles.Read(GameApp.StringsFile)), "theme", AllowListData.Empty, sink);

            Assert.IsEmpty(sink.Errors.Select(e => e.ToString()).ToList());
        }

        [Test]
        public void TheStorageFactoryChainSavesToTheFirstUsableFolderElseMemory()
        {
            string good = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "conquest-factory-" + System.Guid.NewGuid().ToString("N"));
            string blocker = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "conquest-factory-file-" + System.Guid.NewGuid().ToString("N"));
            System.IO.File.WriteAllText(blocker, "x");
            try
            {
                ISaveStorage primaryOk = SaveStorageFactory.Chain(good, blocker);
                ISaveStorage primaryBroken = SaveStorageFactory.Chain(blocker, good);
                ISaveStorage allBroken = SaveStorageFactory.Chain(blocker, blocker);

                Assert.IsTrue(primaryOk.TryWrite("a.json", "{}", out _));
                Assert.IsTrue(System.IO.File.Exists(System.IO.Path.Combine(good, SaveStorageFactory.FolderName, "a.json")));
                Assert.IsTrue(primaryBroken.TryWrite("a.json", "{}", out _));
                Assert.IsTrue(allBroken.TryWrite("a.json", "{}", out _), "memory is the last link");
                Assert.IsTrue(allBroken.TryRead("a.json", out string? text, out _));
                Assert.AreEqual("{}", text);
            }
            finally
            {
                System.IO.File.Delete(blocker);
                if (System.IO.Directory.Exists(good)) System.IO.Directory.Delete(good, true);
            }
        }

        [Test]
        public void TheFactoryOverrideWinsAndABatchRunDefaultsToMemory()
        {
            var forced = new MemorySaveStorage();
            SaveStorageFactory.Override = forced;
            try
            {
                Assert.AreSame(forced, SaveStorageFactory.Create());
            }
            finally
            {
                SaveStorageFactory.Override = null;
            }

            Assert.IsInstanceOf<MemorySaveStorage>(SaveStorageFactory.Create(), "batch mode never touches a real player's folder");
        }
    }
}
