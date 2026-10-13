using System.Linq.Expressions;
using Blotter.Contracts.Wire;
using Blotter.Trades.Data;
using Blotter.Trades.Domain;
using Microsoft.EntityFrameworkCore;

namespace Blotter.Trades.Repositories;

/// <summary>
/// Persistence for trades, split by concern across partial files: reads of the blotter here, writes
/// in <c>TradeRepository.Writes.cs</c>, the audit trail in <c>TradeRepository.Events.cs</c>, and the
/// active-book reads positions and the simulated desk need in <c>TradeRepository.Active.cs</c>.
/// </summary>
/// <param name="db">The scoped database context.</param>
/// <param name="clock">The clock row timestamps are read from.</param>
internal sealed partial class TradeRepository(TradesDbContext db, TimeProvider clock)
{
    /// <summary>Column names the keyset predicate may use. A fixed map, so nothing from a request reaches the SQL text.</summary>
    private static readonly Dictionary<TradeSortColumn, string> SortColumns = new()
    {
        [TradeSortColumn.TradeId] = "trade_id",
        [TradeSortColumn.Symbol] = "symbol",
        [TradeSortColumn.Side] = "side",
        [TradeSortColumn.Quantity] = "quantity",
        [TradeSortColumn.Price] = "price",
        [TradeSortColumn.Trader] = "trader",
        [TradeSortColumn.Book] = "book",
        [TradeSortColumn.Counterparty] = "counterparty",
        [TradeSortColumn.TradeTimestamp] = "trade_timestamp",
        [TradeSortColumn.Status] = "status",
    };

    /// <summary>
    /// Reads a filtered, sorted, keyset-paged window of the blotter. The cursor names a row, and the
    /// next page is everything after it in (sort column, id) order, so trades inserted above the
    /// cursor between requests never shift what page two means. A cursor whose row has gone yields an
    /// empty page, as Prisma's cursor did.
    /// </summary>
    /// <param name="query">The validated query.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>The window, the unpaged total, and the next cursor.</returns>
    public async Task<Page<Trade>> ListAsync(TradeQuery query, CancellationToken cancellationToken)
    {
        var total = await Filter(db.Trades.AsNoTracking(), query).CountAsync(cancellationToken);

        var source = query.Cursor is { } cursor ? After(cursor, query.SortBy, query.Descending) : db.Trades;
        var rows = await Order(Filter(source.AsNoTracking(), query), query.SortBy, query.Descending)
            .Take(query.Limit)
            .ToListAsync(cancellationToken);

        var next = rows.Count == query.Limit ? PageCursor.Encode(rows[^1].Id) : null;
        return new Page<Trade>([.. rows.Select(RowMapping.ToWire)], total, next);
    }

    /// <summary>Reads one trade by its business id.</summary>
    /// <param name="tradeId">The <c>TRD-100001</c> form.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>The trade, or null when there is no such trade.</returns>
    public async Task<Trade?> FindAsync(string tradeId, CancellationToken cancellationToken)
    {
        var row = await db.Trades.AsNoTracking().SingleOrDefaultAsync(trade => trade.TradeId == tradeId, cancellationToken);
        return row is null ? null : RowMapping.ToWire(row);
    }

    private IQueryable<TradeRow> After(Guid cursor, TradeSortColumn sortBy, bool descending)
    {
        var column = SortColumns[sortBy];
        var comparison = descending ? "<" : ">";

#pragma warning disable EF1002 // The column and operator come from fixed maps above; the cursor is a parameter.
        return db.Trades.FromSqlRaw(
            $$"""
            SELECT t.* FROM [trade] AS t
            WHERE EXISTS (
                SELECT 1 FROM [trade] AS c
                WHERE c.[id] = {0}
                  AND (t.[{{column}}] {{comparison}} c.[{{column}}]
                       OR (t.[{{column}}] = c.[{{column}}] AND t.[id] {{comparison}} c.[id])))
            """,
            cursor);
#pragma warning restore EF1002
    }

    private static IQueryable<TradeRow> Filter(IQueryable<TradeRow> rows, TradeQuery query)
    {
        if (query.Symbol is { Length: > 0 } symbol)
        {
            rows = rows.Where(trade => trade.Symbol.Contains(symbol));
        }

        if (query.Trader is { Length: > 0 } trader)
        {
            rows = rows.Where(trade => trade.Trader.Contains(trader));
        }

        if (query.Book is { Length: > 0 } book)
        {
            rows = rows.Where(trade => trade.Book.Contains(book));
        }

        if (query.Counterparty is { Length: > 0 } counterparty)
        {
            rows = rows.Where(trade => trade.Counterparty.Contains(counterparty));
        }

        if (query.Side is { } side)
        {
            rows = rows.Where(trade => trade.Side == side);
        }

        if (query.Status is { } status)
        {
            rows = rows.Where(trade => trade.Status == status);
        }

        if (query.DateFrom is { } from)
        {
            rows = rows.Where(trade => trade.TradeTimestamp >= from);
        }

        if (query.DateTo is { } to)
        {
            rows = rows.Where(trade => trade.TradeTimestamp <= to);
        }

        return rows;
    }

    private static IQueryable<TradeRow> Order(IQueryable<TradeRow> rows, TradeSortColumn sortBy, bool descending) => sortBy switch
    {
        TradeSortColumn.TradeId => By(rows, trade => trade.TradeId, descending),
        TradeSortColumn.Symbol => By(rows, trade => trade.Symbol, descending),
        TradeSortColumn.Side => By(rows, trade => trade.Side, descending),
        TradeSortColumn.Quantity => By(rows, trade => trade.Quantity, descending),
        TradeSortColumn.Price => By(rows, trade => trade.Price, descending),
        TradeSortColumn.Trader => By(rows, trade => trade.Trader, descending),
        TradeSortColumn.Book => By(rows, trade => trade.Book, descending),
        TradeSortColumn.Counterparty => By(rows, trade => trade.Counterparty, descending),
        TradeSortColumn.Status => By(rows, trade => trade.Status, descending),
        _ => By(rows, trade => trade.TradeTimestamp, descending),
    };

    private static IOrderedQueryable<TradeRow> By<TKey>(IQueryable<TradeRow> rows, Expression<Func<TradeRow, TKey>> key, bool descending) =>
        descending
            ? rows.OrderByDescending(key).ThenByDescending(trade => trade.Id)
            : rows.OrderBy(key).ThenBy(trade => trade.Id);
}
