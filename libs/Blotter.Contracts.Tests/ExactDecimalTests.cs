using Blotter.Contracts.Json;
using Xunit;

namespace Blotter.Contracts.Tests;

public sealed class ExactDecimalTests
{
    [Theory]
    [InlineData("227.450000", "227.45")]
    [InlineData("100.000000", "100")]
    [InlineData("0.000001", "0.000001")]
    [InlineData("-3.500", "-3.5")]
    [InlineData("0.000000", "0")]
    [InlineData("4000000000.000000", "4000000000")]
    [InlineData("123456789012.123456", "123456789012.123456")]
    public void Format_drops_trailing_zeros_without_changing_the_value(string stored, string expected)
    {
        var value = ExactDecimal.Parse(stored);

        Assert.Equal(expected, ExactDecimal.Format(value));
        Assert.Equal(value, ExactDecimal.Parse(ExactDecimal.Format(value)));
    }

    [Theory]
    [InlineData("1e5")]
    [InlineData("12,5")]
    [InlineData("")]
    [InlineData(" 1")]
    [InlineData("NaN")]
    public void Parse_refuses_anything_but_plain_invariant_decimals(string text)
    {
        Assert.Throws<FormatException>(() => ExactDecimal.Parse(text));
    }

    [Fact]
    public void Format_keeps_every_digit_of_a_long_quotient()
    {
        var average = (300m * 227.45m + 200m * 230.1m) / 500m;

        Assert.Equal("228.51", ExactDecimal.Format(average));
        Assert.Equal("0.3333333333333333333333333333", ExactDecimal.Format(1m / 3m));
    }
}
