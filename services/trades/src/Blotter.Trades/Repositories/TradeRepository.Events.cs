using Blotter.Contracts.Wire;
using Blotter.Trades.Data;
using Blotter.Trades.Domain;
using Microsoft.EntityFrameworkCore;

namespace Blotter.Trades.Repositories;

/// <summary>Reads of the audit trail: one trade's history, and the global feed of every change.</summary>
internal sealed partial class TradeRepository
{
    /// <summary>Reads one trade's history, oldest first.</summary>
    /// <param name="tradeId">The trade's business id.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>The events. Empty when the trade has never changed, or does not exist.</returns>
    public async Task<IReadOnlyList<TradeEvent>> FindEventsAsync(string tradeId, CancellationToken cancellationToken)
    {
        var rows = await db.TradeEvents
            .AsNoTracking()
            .Where(tradeEvent => tradeEvent.Trade!.TradeId == tradeId)
            .OrderBy(tradeEvent => tradeEvent.Version)
            .ToListAsync(cancellationToken);

        return [.. rows.Select(row => RowMapping.ToWire(row, tradeId))];
    }

    /// <summary>
    /// Reads a keyset-paged window of every trade's history, newest first, ordered on
    /// (<c>occurred_at</c>, <c>id</c>) so two events in the same millisecond keep one order and a cursor
    /// always means the same place.
    /// </summary>
    /// <param name="limit">Page size, 1 to 500.</param>
    /// <param name="cursor">The last event of the previous page, or null for the first page.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>The window, the count of every event, and the next cursor.</returns>
    public async Task<Page<TradeEvent>> ListEventsAsync(int limit, Guid? cursor, CancellationToken cancellationToken)
    {
        var total = await db.TradeEvents.CountAsync(cancellationToken);

        var source = cursor is { } after
            ? db.TradeEvents.FromSqlRaw(
                """
                SELECT e.* FROM [trade_event] AS e
                WHERE EXISTS (
                    SELECT 1 FROM [trade_event] AS c
                    WHERE c.[id] = @cursor
                      AND (e.[occurred_at] < c.[occurred_at]
                           OR (e.[occurred_at] = c.[occurred_at] AND e.[id] < c.[id])))
                """,
                IdParameter(after))
            : db.TradeEvents;

        var rows = await source
            .AsNoTracking()
            .OrderByDescending(tradeEvent => tradeEvent.OccurredAt)
            .ThenByDescending(tradeEvent => tradeEvent.Id)
            .Take(limit)
            .Select(tradeEvent => new { Row = tradeEvent, tradeEvent.Trade!.TradeId })
            .ToListAsync(cancellationToken);

        var next = rows.Count == limit ? PageCursor.Encode(rows[^1].Row.Id) : null;
        return new Page<TradeEvent>([.. rows.Select(item => RowMapping.ToWire(item.Row, item.TradeId))], total, next);
    }
}
