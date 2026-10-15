using Blotter.Contracts.Wire;

namespace Blotter.Trades.Domain;

/// <summary>
/// The average-cost walk from <c>shared/src/positions/position_book.ts</c>, in exact decimals. A
/// trade on a flat book opens it at the trade price, a trade on the same side moves the average,
/// and a trade against the book realises against the average and opens any remainder at its price.
/// </summary>
internal static class PositionBook
{
    /// <summary>A flat position, every figure zero.</summary>
    /// <param name="symbol">The instrument.</param>
    /// <param name="currency">Its quote currency.</param>
    /// <returns>The empty position.</returns>
    public static Position Empty(string symbol, Currency currency) => new(symbol, currency, 0, 0, 0, 0m, 0, 0m, 0m);

    /// <summary>
    /// Applies one active trade. Trades must arrive in execution order, which is why callers use
    /// <see cref="Build"/> rather than applying broadcasts one by one.
    /// </summary>
    /// <param name="position">The book before the trade.</param>
    /// <param name="trade">An active trade in the same instrument.</param>
    /// <returns>The book after the trade. The input is unchanged.</returns>
    public static Position Apply(Position position, Trade trade)
    {
        long signed = trade.Side == TradeSide.Buy ? trade.Quantity : -trade.Quantity;
        var net = position.NetQuantity;
        var average = position.AveragePrice;
        var realised = position.RealisedPnl;

        if (net == 0)
        {
            average = trade.Price;
            net = signed;
        }
        else if (Math.Sign(net) == Math.Sign(signed))
        {
            var open = Math.Abs(net);
            average = ((open * average) + (trade.Quantity * trade.Price)) / (open + trade.Quantity);
            net += signed;
        }
        else
        {
            var closing = Math.Min(trade.Quantity, Math.Abs(net));
            realised += (trade.Price - average) * closing * Math.Sign(net);
            var before = net;
            net += signed;

            if (net == 0)
            {
                average = 0m;
            }
            else if (Math.Sign(net) != Math.Sign(before))
            {
                average = trade.Price;
            }
        }

        return position with
        {
            NetQuantity = net,
            BuyQuantity = position.BuyQuantity + (trade.Side == TradeSide.Buy ? trade.Quantity : 0),
            SellQuantity = position.SellQuantity + (trade.Side == TradeSide.Sell ? trade.Quantity : 0),
            GrossNotional = position.GrossNotional + (trade.Quantity * trade.Price),
            TradeCount = position.TradeCount + 1,
            AveragePrice = average,
            RealisedPnl = realised,
        };
    }

    /// <summary>
    /// Builds every instrument's position. Cancelled trades are ignored, which is what makes cancel a
    /// status rather than a delete. Trades are walked by execution time, ties broken by id as text.
    /// </summary>
    /// <param name="trades">Trades in any order. Only active ones count.</param>
    /// <returns>One position per symbol with an active trade, sorted by symbol.</returns>
    public static IReadOnlyList<Position> Build(IEnumerable<Trade> trades)
    {
        var books = new Dictionary<string, Position>(StringComparer.Ordinal);

        var ordered = trades
            .Where(trade => trade.Status == TradeStatus.Active)
            .OrderBy(trade => trade.TradeTimestamp)
            .ThenBy(trade => trade.Id.ToString(), StringComparer.Ordinal);

        foreach (var trade in ordered)
        {
            var current = books.TryGetValue(trade.Symbol, out var book) ? book : Empty(trade.Symbol, trade.Currency);
            books[trade.Symbol] = Apply(current, trade);
        }

        return [.. books.Values.OrderBy(position => position.Symbol, StringComparer.Ordinal)];
    }
}
