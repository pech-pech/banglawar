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
