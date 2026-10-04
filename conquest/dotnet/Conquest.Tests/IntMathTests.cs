using Conquest.Core;

namespace Conquest.Tests;

public class IntMathTests
{
    [TestCase(7, 2, 3)]
    [TestCase(-7, 2, -4)]
    [TestCase(7, -2, -4)]
    [TestCase(-7, -2, 3)]
    [TestCase(6, 3, 2)]
    [TestCase(-6, 3, -2)]
    [TestCase(0, 5, 0)]
    public void FloorDiv_rounds_toward_negative_infinity(int a, int b, int expected)
    {
        Assert.That(IntMath.FloorDiv(a, b), Is.EqualTo(expected));
    }

    [Test]
    public void FloorDiv_throws_when_dividing_by_zero()
    {
        Assert.Throws<DivideByZeroException>(() => IntMath.FloorDiv(1, 0));
    }

    [TestCase(1000, 5, 50)]
    [TestCase(999, 5, 49)]
    [TestCase(-999, 5, -50)]
    public void Percent_floors_the_result(int value, int percent, int expected)
    {
        Assert.That(IntMath.Percent(value, percent), Is.EqualTo(expected));
    }
}

public class IntMathExtraTests
{
    [TestCase(7, 2, 1)]
    [TestCase(-7, 2, 1)]
    [TestCase(7, -2, -1)]
    [TestCase(-8, 4, 0)]
    [TestCase(0, 5, 0)]
    public void FloorMod_has_the_sign_of_the_denominator(int n, int d, int expected)
    {
        Assert.That(Conquest.Core.IntMath.FloorMod(n, d), Is.EqualTo(expected));
    }

    [Test]
    public void FloorMod_matches_FloorDiv_for_a_grid_of_values()
    {
        for (int n = -20; n <= 20; n++)
        {
            foreach (int d in new[] { -7, -3, -1, 1, 2, 5, 9 })
            {
                Assert.That((Conquest.Core.IntMath.FloorDiv(n, d) * d) + Conquest.Core.IntMath.FloorMod(n, d), Is.EqualTo(n));
            }
        }
    }

    [TestCase(0, 0, 0)]
    [TestCase(0, 1, 0)]
    [TestCase(0, 9, 4)]
    [TestCase(3, 4, 3)]
    [TestCase(10, 20, 15)]
    public void Midpoint_rounds_down_like_a_shift(int lo, int hi, int expected)
    {
        Assert.That(Conquest.Core.IntMath.Midpoint(lo, hi), Is.EqualTo(expected));
    }

    [Test]
    public void The_64_bit_FloorDiv_floors_and_refuses_zero()
    {
        Assert.That(Conquest.Core.IntMath.FloorDiv(-1L, 10000L), Is.EqualTo(-1L));
        Assert.That(Conquest.Core.IntMath.FloorDiv(9999999999L, 10000L), Is.EqualTo(999999L));
        Assert.That(Conquest.Core.IntMath.FloorDiv(-7L, -2L), Is.EqualTo(3L));
        Assert.Throws<DivideByZeroException>(() => Conquest.Core.IntMath.FloorDiv(1L, 0L));
    }

    [Test]
    public void MulDiv_does_not_overflow_the_intermediate_product()
    {
        Assert.That(Conquest.Core.IntMath.MulDiv(2_000_000_000, 3, 4), Is.EqualTo(1_500_000_000));
        Assert.That(Conquest.Core.IntMath.MulDiv(-5, 1, 2), Is.EqualTo(-3));
        Assert.Throws<OverflowException>(() => Conquest.Core.IntMath.MulDiv(2_000_000_000, 3, 1));
    }

    [TestCase(5, 0, 10, 5)]
    [TestCase(-5, 0, 10, 0)]
    [TestCase(15, 0, 10, 10)]
    public void Clamp_keeps_a_value_in_range(int v, int lo, int hi, int expected)
    {
        Assert.That(Conquest.Core.IntMath.Clamp(v, lo, hi), Is.EqualTo(expected));
    }
}
