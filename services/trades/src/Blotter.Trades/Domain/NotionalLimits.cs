using System.Globalization;
using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;

namespace Blotter.Trades.Domain;

/// <summary>
/// The fat-finger control: a ticket whose quantity times price breaches the desk limit for its
/// currency is refused. One limit per currency, because 78 pence and 78 dollars cannot share a ceiling.
/// </summary>
/// <param name="usdLimit">The ceiling for USD tickets, in dollars.</param>
/// <param name="gbxLimit">The ceiling for GBX tickets, in pence.</param>
internal sealed class NotionalLimits(decimal usdLimit, decimal gbxLimit)
{
    /// <summary>Refuses a ticket over the limit for its currency.</summary>
    /// <param name="quantity">Share count.</param>
    /// <param name="price">Exact price in the quote currency.</param>
    /// <param name="currency">The quote currency.</param>
    /// <exception cref="TradeRuleViolation">
    /// When over the limit. The message gives the trade's worth and the limit in whole dollars or
    /// pounds, and the field error on <c>quantity</c> asks for a lower quantity or price.
    /// </exception>
    public void Enforce(int quantity, decimal price, Currency currency)
    {
        var notional = quantity * price;
        var limit = currency == Currency.Gbx ? gbxLimit : usdLimit;

        if (notional > limit)
        {
            throw TradeRuleViolation.Invalid(
                DescribeBreach(notional, limit, currency),
                new FieldError("quantity", TradeRules.Messages.OverDeskLimit));
        }
    }

    /// <summary>
    /// Words a breach the way a trader reads it. GBX figures are divided by 100 and shown as pounds.
    /// The limit rounds down, the worth rounds to the cent and then up, and the worth never shows
    /// below one unit over the limit, so a trade over it cannot read as equal to it.
    /// </summary>
    /// <param name="notional">Quantity times price, known to be over <paramref name="limit"/>.</param>
    /// <param name="limit">The ceiling in the quote currency.</param>
    /// <param name="currency">The quote currency.</param>
    /// <returns>A sentence such as <c>This trade is worth $62,500,000, over the $50,000,000 limit for US names.</c></returns>
    public static string DescribeBreach(decimal notional, decimal limit, Currency currency)
    {
        var (symbol, divisor, names) = currency == Currency.Gbx ? ("£", 100m, "London names") : ("$", 1m, "US names");
        var shownLimit = decimal.Floor(limit / divisor);
        var worthToTheCent = decimal.Round(notional / divisor, 2, MidpointRounding.AwayFromZero);
        var shownWorth = Math.Max(decimal.Ceiling(worthToTheCent), shownLimit + 1);

        return $"This trade is worth {Whole(symbol, shownWorth)}, over the {Whole(symbol, shownLimit)} limit for {names}.";
    }

    private static string Whole(string symbol, decimal units) =>
        symbol + units.ToString("#,0", CultureInfo.InvariantCulture);
}
