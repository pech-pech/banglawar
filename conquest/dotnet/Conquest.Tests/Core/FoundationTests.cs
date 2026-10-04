using Conquest.Core;
using Conquest.Core.Contracts;

namespace Conquest.Tests.Core;

public class FoundationTests
{
    [Test]
    public void SplitMix64_sequence_matches_the_published_vectors()
    {
        var s = RngState.FromSeed(0);
        s = s.Next(out ulong a);
        s = s.Next(out ulong b);
        s.Next(out ulong c);
        Assert.That(a, Is.EqualTo(0xE220A8397B1DCDAFUL));
        Assert.That(b, Is.EqualTo(0x6E789E6AA1B965F4UL));
        Assert.That(c, Is.EqualTo(0x06C45D188009454FUL));
    }

    [Test]
    public void RngState_is_immutable_and_equatable()
    {
        var s = RngState.FromSeed(7);
        s.Next(out ulong first);
        s.Next(out ulong again);
        Assert.That(again, Is.EqualTo(first));
        Assert.That(s.Equals((object)RngState.FromSeed(7)), Is.True);
        Assert.That(s.GetHashCode(), Is.EqualTo(RngState.FromSeed(7).GetHashCode()));
        Assert.That(s.Equals(RngState.FromSeed(8)), Is.False);
    }

    [Test]
    public void Draw_is_pure_and_depends_on_every_input()
    {
        ulong baseline = Rng.Draw(1, 2, 3, 4);
        Assert.That(Rng.Draw(1, 2, 3, 4), Is.EqualTo(baseline));
        Assert.That(Rng.Draw(9, 2, 3, 4), Is.Not.EqualTo(baseline));
        Assert.That(Rng.Draw(1, 9, 3, 4), Is.Not.EqualTo(baseline));
        Assert.That(Rng.Draw(1, 2, 9, 4), Is.Not.EqualTo(baseline));
        Assert.That(Rng.Draw(1, 2, 3, 9), Is.Not.EqualTo(baseline));
    }

    [Test]
    public void Range_stays_inside_the_bounds_and_covers_them()
    {
        var seen = new bool[6];
        for (ulong k = 0; k < 400; k++)
        {
            int v = Rng.Range(5, RngStreams.Combat, 1, k, -2, 4);
            Assert.That(v, Is.InRange(-2, 3));
            seen[v + 2] = true;
        }

        Assert.That(seen, Is.All.True);
    }

    [Test]
    public void Range_rejects_an_empty_range()
    {
        Assert.Throws<ArgumentException>(() => Rng.Range(1, 1, 1, 1, 3, 3));
    }

    [Test]
    public void Streams_have_stable_distinct_codes()
    {
        Assert.That(RngStreams.Combat, Is.EqualTo(Fnv1a64.Hash("combat")));
        Assert.That(RngStreams.Combat, Is.Not.EqualTo(RngStreams.Economy));
        Assert.That(RngStreams.Worldgen, Is.Not.EqualTo(RngStreams.Economy));
        Assert.That(RngStreams.Named("combat", 12), Is.EqualTo(Fnv1a64.Hash("combat:12")));
    }

    [TestCase("", "cbf29ce484222325")]
    [TestCase("a", "af63dc4c8601ec8c")]
    [TestCase("foobar", "85944171f73967e8")]
    public void Fnv1a64_matches_the_reference_vectors(string text, string hex)
    {
        Assert.That(Fnv1a64.ToHex(Fnv1a64.Hash(text)), Is.EqualTo(hex));
    }

    [Test]
    public void CanonicalWriter_formats_integers_invariantly_under_any_culture()
    {
        var old = System.Globalization.CultureInfo.CurrentCulture;
        try
        {
            System.Globalization.CultureInfo.CurrentCulture = new System.Globalization.CultureInfo("bn-BD");
            var w = new CanonicalWriter().Open("a").Int("n", -1234567).UInt("u", 5).Str("s", "x").Close();
            Assert.That(w.Text, Is.EqualTo("a{n=-1234567;u=5;s=1:x;}"));
            Assert.That(w.Hash(), Is.EqualTo(Fnv1a64.Hash(w.Text)));
        }
        finally
        {
            System.Globalization.CultureInfo.CurrentCulture = old;
        }
    }

    [Test]
    public void ImmArray_changes_return_new_arrays_and_leave_the_original()
    {
        var a = ImmArray<int>.Of(1, 2, 3);
        var b = a.Add(4).SetItem(0, 9).Insert(1, 7).RemoveAt(2);
        Assert.That(a, Is.EqualTo(new[] { 1, 2, 3 }));
        Assert.That(b, Is.EqualTo(new[] { 9, 7, 3, 4 }));
        Assert.That(a.AddRange(ImmArray<int>.Of(8, 9)), Is.EqualTo(new[] { 1, 2, 3, 8, 9 }));
        Assert.That(a.AddRange(ImmArray<int>.Empty), Is.EqualTo(a));
    }

    [Test]
    public void ImmArray_default_is_empty_and_equality_is_by_content()
    {
        ImmArray<string> empty = default;
        Assert.That(empty.Count, Is.EqualTo(0));
        Assert.That(empty.Length, Is.EqualTo(0));
        Assert.That(ImmArray<int>.Of(1, 2).Equals(ImmArray<int>.From(new[] { 1, 2 })), Is.True);
        Assert.That(ImmArray<int>.Of(1, 2).Equals((object)ImmArray<int>.Of(1, 3)), Is.False);
        Assert.That(ImmArray<int>.Of(1, 2).Equals(ImmArray<int>.Of(1)), Is.False);
        Assert.That(ImmArray<int>.Of(1, 2).GetHashCode(), Is.EqualTo(ImmArray<int>.Of(1, 2).GetHashCode()));
        Assert.That(ImmArray<int>.From(new int[0]).Count, Is.EqualTo(0));
        Assert.That(ImmArray<int>.Of().Count, Is.EqualTo(0));
        Assert.That(ImmArray<int>.Of(1).RemoveAt(0).Count, Is.EqualTo(0));
    }

    [Test]
    public void ImmArray_rejects_bad_indices()
    {
        var a = ImmArray<int>.Of(1);
        Assert.Throws<ArgumentOutOfRangeException>(() => _ = a[1]);
        Assert.Throws<ArgumentOutOfRangeException>(() => _ = a[-1]);
        Assert.Throws<ArgumentOutOfRangeException>(() => a.SetItem(2, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => a.Insert(3, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => a.RemoveAt(1));
    }

    [Test]
    public void ImmArray_copies_its_input()
    {
        var source = new[] { 1, 2 };
        var a = ImmArray<int>.Of(source);
        source[0] = 99;
        Assert.That(a[0], Is.EqualTo(1));
    }

    [Test]
    public void TileCoord_orders_by_y_then_x_and_measures_chebyshev_distance()
    {
        var a = new TileCoord(5, 1);
        var b = new TileCoord(2, 2);
        Assert.That(a.CompareTo(b), Is.LessThan(0));
        Assert.That(new TileCoord(1, 2).CompareTo(b), Is.LessThan(0));
        Assert.That(b.CompareTo(b), Is.EqualTo(0));
        Assert.That(a.DistanceTo(b), Is.EqualTo(3));
        Assert.That(new TileCoord(0, 0).DistanceTo(new TileCoord(1, 4)), Is.EqualTo(4));
        Assert.That(a == new TileCoord(5, 1), Is.True);
        Assert.That(a != b, Is.True);
        Assert.That(a.Equals((object)new TileCoord(5, 1)), Is.True);
        Assert.That(a.GetHashCode(), Is.EqualTo(new TileCoord(5, 1).GetHashCode()));
        Assert.That(a.ToString(), Is.EqualTo("(5,1)"));
    }

    [Test]
    public void ResourceVector_arithmetic_is_per_component()
    {
        var a = new ResourceVector(1, 2, 3, 4, 5, 6);
        var b = new ResourceVector(1, 1, 1, 1, 1, 1);
        Assert.That(a.Add(b), Is.EqualTo(new ResourceVector(2, 3, 4, 5, 6, 7)));
        Assert.That(a.Subtract(b), Is.EqualTo(new ResourceVector(0, 1, 2, 3, 4, 5)));
        Assert.That(a.Covers(b), Is.True);
        Assert.That(b.Covers(a), Is.False);
        Assert.That(a.Equals((object)a), Is.True);
        Assert.That(a.GetHashCode(), Is.EqualTo(new ResourceVector(1, 2, 3, 4, 5, 6).GetHashCode()));
        Assert.That(a.ToString(), Is.EqualTo("[1,2,3,4,5,6]"));
        foreach (Resource r in Enum.GetValues(typeof(Resource)))
        {
            Assert.That(ResourceVector.Zero.With(r, 9).Get(r), Is.EqualTo(9));
            Assert.That(ResourceVector.Zero.With(r, 9).Subtract(ResourceVector.Zero.With(r, 9)), Is.EqualTo(ResourceVector.Zero));
        }
    }

    [Test]
    public void ResourceVector_overflow_throws_instead_of_wrapping()
    {
        var big = new ResourceVector(int.MaxValue, 0, 0, 0, 0, 0);
        Assert.Throws<OverflowException>(() => big.Add(new ResourceVector(1, 0, 0, 0, 0, 0)));
    }

    [Test]
    public void RoleIds_round_trip_every_role_and_reject_unknown_ids()
    {
        foreach (Terrain t in Enum.GetValues(typeof(Terrain)))
        {
            Assert.That(RoleIds.TryParse(RoleIds.Of(t), out Terrain back) && back == t, Is.True);
        }

        foreach (Resource r in Enum.GetValues(typeof(Resource)))
        {
            Assert.That(RoleIds.TryParse(RoleIds.Of(r), out Resource back) && back == r, Is.True);
        }

        foreach (BuildingRole r in Enum.GetValues(typeof(BuildingRole)))
        {
            Assert.That(RoleIds.TryParse(RoleIds.Of(r), out BuildingRole back) && back == r, Is.True);
        }

        foreach (UnitRole r in Enum.GetValues(typeof(UnitRole)))
        {
            Assert.That(RoleIds.TryParse(RoleIds.Of(r), out UnitRole back) && back == r, Is.True);
        }

        Assert.That(RoleIds.TryParse("t.nope", out Terrain _), Is.False);
        Assert.That(RoleIds.TryParse("nope", out Resource _), Is.False);
        Assert.That(RoleIds.TryParse("bld.nope", out BuildingRole _), Is.False);
        Assert.That(RoleIds.TryParse("U.LINE", out UnitRole _), Is.False);
        Assert.That(RoleIds.Of(Terrain.WoodA), Is.EqualTo("t.wood_a"));
        Assert.That(RoleIds.Of(BuildingRole.Garrison), Is.EqualTo("bld.garrison"));
        Assert.That(RoleIds.MoveClassOf(UnitRole.Transport), Is.EqualTo(MoveClass.Water));
        Assert.That(RoleIds.MoveClassOf(UnitRole.Line), Is.EqualTo(MoveClass.Land));
    }

    [Test]
    public void Events_carry_the_ids_and_payloads_of_the_variant_spec()
    {
        GameEvent[] all =
        {
            new ArrivalDeferred(1, "g", 0), new ArrivalCancelled(1, 0, "patron_link_cut"), new SiteTaken("site.capital", 1, 0, "raid"),
            new SeasonStarted("season.wet"), new FactionEliminated(1, "homeless_limit", 15), new FactionSurrendered(1, 40),
            new MatchWon(0, "surrender"), new MatchDrawn("deadline"), new TimedEffectStarted("te.link_cut", 1),
            new UnitHealed(3, 1, "bld.garrison", 0), new PopLost(2, 5, "shortage", 0), new FoodShortage(2, 0),
        };
        string[] ids =
        {
            "ev.arrival_deferred", "ev.arrival_cancelled", "ev.site_taken", "ev.season_started", "ev.faction_eliminated",
            "ev.faction_surrendered", "ev.match_won", "ev.match_drawn", "ev.timed_effect_started", "ev.unit_healed",
            "ev.pop_lost", "warn.food_shortage",
        };
        for (int i = 0; i < all.Length; i++)
        {
            Assert.That(all[i].Id, Is.EqualTo(ids[i]));
        }

        Assert.That(new PopLost(2, 5, "shortage", 3).Visibility, Is.EqualTo(EventVisibility.Owner));
        Assert.That(new PopLost(2, 5, "shortage", 3).OwnerSlot, Is.EqualTo(3));
        Assert.That(new SiteTaken("s", 1, 0, "raid").OwnerSlot, Is.EqualTo(-1));
        Assert.That(new MatchWon(0, "x").Visibility, Is.EqualTo(EventVisibility.All));
        Assert.That(new ArrivalDeferred(2, "g", 1).OwnerSlot, Is.EqualTo(2));
        Assert.That(new ArrivalCancelled(2, 1, "r").OwnerSlot, Is.EqualTo(2));
        Assert.That(new UnitHealed(1, 1, "b", 4).OwnerSlot, Is.EqualTo(4));
        Assert.That(new FoodShortage(1, 5).OwnerSlot, Is.EqualTo(5));
    }

    [Test]
    public void No_event_id_or_field_name_contains_a_forbidden_token()
    {
        string[] banned = { "civilian", "villag", "refugee", "starv", "famine", "massacre", "loot", "plunder", "hostage", "prisoner", "tribute", "death", "kill" };
        var types = typeof(GameEvent).Assembly.GetTypes().Where(t => typeof(GameEvent).IsAssignableFrom(t) && !t.IsAbstract);
        foreach (Type t in types)
        {
            var ctorArgs = t.GetConstructors()[0].GetParameters().Select(p => p.Name!.ToLowerInvariant());
            foreach (string name in ctorArgs.Append(t.Name.ToLowerInvariant()))
            {
                foreach (string token in banned)
                {
                    Assert.That(name, Does.Not.Contain(token), t.Name);
                }
            }
        }
    }
}
