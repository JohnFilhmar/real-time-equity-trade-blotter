using Blotter.Contracts.Wire;
using Blotter.Trades.Domain;
using Xunit;

namespace Blotter.Trades.Tests;

/// <summary>The desk-limit wording, case for case from the Node service tests, now computed exactly.</summary>
public sealed class NotionalLimitsTests
{
    private static readonly NotionalLimits Limits = new(50_000_000m, 4_000_000_000m);

    [Theory]
    [InlineData(250_000, "250", Currency.Usd, "This trade is worth $62,500,000, over the $50,000,000 limit for US names.")]
    [InlineData(1_000_000, "4100", Currency.Gbx, "This trade is worth £41,000,000, over the £40,000,000 limit for London names.")]
    [InlineData(1_000_003, "51.37", Currency.Usd, "This trade is worth $51,370,155, over the $50,000,000 limit for US names.")]
    [InlineData(7, "7142857.143", Currency.Usd, "This trade is worth $50,000,001, over the $50,000,000 limit for US names.")]
    [InlineData(5_242_900, "10.05", Currency.Usd, "This trade is worth $52,691,145, over the $50,000,000 limit for US names.")]
    public void Refuses_a_ticket_over_the_limit_in_dollars_or_pounds(int quantity, string price, Currency currency, string expected)
    {
        var violation = Assert.Throws<TradeRuleViolation>(() =>
            Limits.Enforce(quantity, decimal.Parse(price, System.Globalization.CultureInfo.InvariantCulture), currency));

        Assert.Equal(TradeRuleKind.Invalid, violation.Kind);
        Assert.Equal(expected, violation.Message);
        Assert.Equal(new FieldError("quantity", "This trade is over the desk limit. Lower the quantity or price."), Assert.Single(violation.FieldErrors));
    }

    [Fact]
    public void Applies_the_limit_in_the_instrument_currency_not_one_global_figure()
    {
        Limits.Enforce(1_000_000, 2814m, Currency.Gbx);
        Limits.Enforce(200_000, 250m, Currency.Usd);

        Assert.Throws<TradeRuleViolation>(() => Limits.Enforce(1_000_000, 2814m, Currency.Usd));
    }

    [Fact]
    public void A_ticket_exactly_at_the_limit_is_allowed()
    {
        Limits.Enforce(200_000, 250m, Currency.Usd);
    }
}
