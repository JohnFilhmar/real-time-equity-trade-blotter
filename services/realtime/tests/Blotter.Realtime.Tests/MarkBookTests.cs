using Blotter.Contracts.Reference;
using Blotter.Realtime.Marks;
using Xunit;

namespace Blotter.Realtime.Tests;

/// <summary>Ported from <c>backend/src/lib/marks/mark_feed.test.ts</c> and <c>mark_store.test.ts</c>.</summary>
public sealed class MarkBookTests
{
    [Fact]
    public void Seeds_one_mark_per_instrument_at_its_reference_price()
    {
        var marks = MarkBook.Initial();

        Assert.Equal(Instruments.All.Select(instrument => instrument.Symbol), marks.Keys);
        Assert.All(Instruments.All, instrument => Assert.Equal(instrument.BasePrice, marks[instrument.Symbol]));
    }

    [Theory]
    [InlineData("227.45", "0.0011")]
    [InlineData("2814", "0.0011")]
    [InlineData("19.99", "0.0018")]
    [InlineData("0.50", "0.0018")]
    public void Moves_a_mark_by_no_more_than_its_drift_bound_to_two_decimals(string start, string bound)
    {
        var random = new Random(42);
        var mark = decimal.Parse(start, System.Globalization.CultureInfo.InvariantCulture);
        var limit = decimal.Parse(bound, System.Globalization.CultureInfo.InvariantCulture);

        for (var tick = 0; tick < 500; tick++)
        {
            var next = MarkBook.Step(mark, random);
            Assert.Equal(next, decimal.Round(next, 2));
            Assert.InRange(next, Math.Max(0.01m, (mark * (1 - limit)) - 0.005m), (mark * (1 + limit)) + 0.005m);
        }
    }

    [Fact]
    public void Never_lets_a_mark_fall_below_one_cent_even_one_that_would_round_to_nothing()
    {
        var random = new Random(7);

        for (var tick = 0; tick < 500; tick++)
        {
            Assert.True(MarkBook.Step(0.01m, random) >= 0.01m);
            Assert.True(MarkBook.Step(0.004m, random) >= 0.01m);
        }
    }
}
