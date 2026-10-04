using Conquest.Core;
using Conquest.Core.Contracts;
using Conquest.Core.Turn;
using static Conquest.Tests.Turn.TurnTestKit;

namespace Conquest.Tests.Turn;

public class StateHasherTests
{
    private static GameState Rich3()
    {
        GameState s = Unit(New(), 0, UnitRole.Line, 4, 4, out _);
        s = Unit(s, 1, UnitRole.Scout, 8, 2, out _);
        s = Base(s, 0, 2, 5, out int b, core: 2, stock: Rich, site: "site.capital");
        return GameFactory.AddBuilding(s, b, BuildingRole.Food, 2, new TileCoord(3, 5));
    }

    [Test]
    public void Equal_states_hash_alike_and_the_hash_is_pinned()
    {
        GameState a = Rich3();
        GameState b = Rich3();
        Assert.That(StateHasher.Hash(a), Is.EqualTo(StateHasher.Hash(b)));
        Assert.That(StateHasher.HashHex(a), Has.Length.EqualTo(16));
        Assert.That(StateHasher.Canonical(a).Text, Does.StartWith("game{turn=0;seed=42;rng=42;slots=2;"));
    }

    [Test]
    public void Every_hashed_field_moves_the_hash()
    {
        GameState s = Rich3();
        ulong h = StateHasher.Hash(s);
        var variants = new Dictionary<string, GameState>
        {
            ["turn"] = s with { Turn = 1 },
            ["seed"] = s with { Seed = 1 },
            ["rng"] = s with { Rng = new RngState(1) },
            ["nextunit"] = s with { NextUnitId = 99 },
            ["nextbase"] = s with { NextBaseId = 99 },
            ["over"] = s with { MatchOver = true, WinnerSlot = 0 },
            ["winner"] = (s with { MatchOver = true, WinnerSlot = 0 }) with { WinnerSlot = 1 },
            ["elim"] = s with { Factions = s.Factions.SetItem(1, s.Factions[1] with { Eliminated = true }) },
            ["ended"] = s with { Factions = s.Factions.SetItem(1, s.Factions[1] with { EndedTurn = true }) },
            ["unitpos"] = s.WithUnit(s.UnitTable[0] with { Pos = new TileCoord(1, 1) }),
            ["unitstr"] = s.WithUnit(s.UnitTable[0] with { Strength = 4 }),
            ["unitmoves"] = s.WithUnit(s.UnitTable[0] with { MovesLeft = 1 }),
            ["unitlevel"] = s.WithUnit(s.UnitTable[0] with { Level = 2 }),
            ["unitrole"] = s.WithUnit(s.UnitTable[0] with { Role = UnitRole.Shock }),
            ["unitowner"] = s.WithUnit(s.UnitTable[0] with { Owner = 1 }),
            ["site"] = s.WithBase(s.BaseTable[0] with { SiteId = "site.other" }),
            ["nosite"] = s.WithBase(s.BaseTable[0] with { SiteId = null }),
            ["stock"] = s.WithBase(s.BaseTable[0] with { Stock = Rich.With(Resource.Food, 1) }),
            ["core"] = s.WithBase(s.BaseTable[0] with { CoreLevel = 3 }),
            ["pcore"] = s.WithBase(s.BaseTable[0] with { PendingCoreLevel = 3, CoreReadyTurn = 2 }),
            ["bldlevel"] = s.WithBase(s.BaseTable[0] with { Buildings = s.BaseTable[0].Buildings.SetItem(0, s.BaseTable[0].Buildings[0] with { Level = 3 }) }),
            ["bldpending"] = s.WithBase(s.BaseTable[0] with { Buildings = s.BaseTable[0].Buildings.SetItem(0, s.BaseTable[0].Buildings[0] with { PendingLevel = 3 }) }),
            ["attack"] = s with { Attacks = ImmArray<AttackOrder>.Of(new AttackOrder(0, ImmArray<int>.Of(1), new TileCoord(1, 1))) },
            ["ext"] = s.WithExt("k", 1),
        };
        foreach (var pair in variants)
        {
            Assert.That(StateHasher.Hash(pair.Value), Is.Not.EqualTo(h), pair.Key);
        }
    }

    [Test]
    public void Different_worlds_hash_differently()
    {
        GameState a = New();
        var tiles = new Terrain[96];
        for (int i = 0; i < tiles.Length; i++)
        {
            tiles[i] = Terrain.Open;
        }

        GameState b = GameFactory.NewGame(Conquest.Core.Map.GameMap.Create(12, 8, tiles), 42, 2);
        Assert.That(StateHasher.Hash(a), Is.Not.EqualTo(StateHasher.Hash(b)));
    }

    [Test]
    public void The_hash_is_the_same_under_other_cultures()
    {
        var old = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            ulong baseline = StateHasher.Hash(Rich3());
            foreach (string name in new[] { "tr-TR", "bn-BD", "en-US", "ar-SA" })
            {
                System.Globalization.CultureInfo.CurrentCulture = new System.Globalization.CultureInfo(name);
                Assert.That(StateHasher.Hash(Rich3()), Is.EqualTo(baseline), name);
            }
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = old;
        }
    }

    [Test]
    public void Ext_counters_stay_sorted_and_a_zero_value_is_elided()
    {
        GameState s = New().WithExt("b", 2).WithExt("a", 1).WithExt("c", 3);
        Assert.That(s.Ext.Select(e => e.Key), Is.EqualTo(new[] { "a", "b", "c" }));
        Assert.That(s.GetExt("b"), Is.EqualTo(2));
        Assert.That(s.GetExt("zzz"), Is.EqualTo(0));
        GameState t = s.WithExt("b", 0);
        Assert.That(t.Ext.Select(e => e.Key), Is.EqualTo(new[] { "a", "c" }));
        Assert.That(StateHasher.Hash(New().WithExt("x", 0)), Is.EqualTo(StateHasher.Hash(New())));
        Assert.That(s.WithExt("a", 5).GetExt("a"), Is.EqualTo(5));
        Assert.That(s.WithExt("zz", 9).Ext.Last().Key, Is.EqualTo("zz"));
    }

    [Test]
    public void A_scripted_game_reproduces_the_same_hash_trail()
    {
        static List<ulong> Play()
        {
            var trail = new List<ulong>();
            GameState s = Unit(New(seed: 7), 0, UnitRole.Founder, 3, 3, out int f);
            s = Unit(s, 1, UnitRole.Scout, 9, 3, out int sc);
            s = Ok(Do(s, new FoundBaseCommand(0, f)));
            int b = s.BaseTable[0].Id;
            s = Ok(Do(s, new BuildCommand(0, b, BuildingRole.Food, new TileCoord(4, 3))));
            s = Ok(Do(s, new MoveCommand(1, sc, new TileCoord(6, 3))));
            trail.Add(StateHasher.Hash(s));
            for (int i = 0; i < 6; i++)
            {
                s = EndAll(s);
                trail.Add(StateHasher.Hash(s));
            }

            return trail;
        }

        List<ulong> a = Play();
        List<ulong> b = Play();
        Assert.That(a, Is.EqualTo(b));
        Assert.That(a.Distinct().Count(), Is.EqualTo(a.Count), "every turn changes the state");
    }
}
