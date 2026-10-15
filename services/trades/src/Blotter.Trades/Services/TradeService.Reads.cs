using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;
using Blotter.Trades.Domain;

namespace Blotter.Trades.Services;

/// <summary>The read side of the trade rules: the blotter, one trade, the audit trail and positions.</summary>
internal sealed partial class TradeService
{
    /// <summary>Reads a filtered, sorted, keyset-paged window of the blotter.</summary>
    /// <param name="query">The validated query.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>The window, the unpaged total and the next cursor.</returns>
    public Task<Page<Trade>> ListAsync(TradeQuery query, CancellationToken cancellationToken) =>
        repository.ListAsync(query, cancellationToken);

    /// <summary>Reads one trade.</summary>
    /// <param name="tradeId">The business id.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>The trade.</returns>
    /// <exception cref="TradeRuleViolation">NotFound when there is no such trade.</exception>
    public async Task<Trade> GetAsync(string tradeId, CancellationToken cancellationToken) =>
        await repository.FindAsync(tradeId, cancellationToken) ?? throw TradeRuleViolation.NotFound(tradeId);

    /// <summary>Reads one trade's history, oldest first.</summary>
    /// <param name="tradeId">The business id.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>The events. Empty means the trade exists and has never changed.</returns>
    /// <exception cref="TradeRuleViolation">NotFound when there is no such trade, so empty never means missing.</exception>
    public async Task<IReadOnlyList<TradeEvent>> ListHistoryAsync(string tradeId, CancellationToken cancellationToken)
    {
        await GetAsync(tradeId, cancellationToken);
        return await repository.FindEventsAsync(tradeId, cancellationToken);
    }

    /// <summary>Reads a page of every trade's history, newest first.</summary>
    /// <param name="limit">Page size, 1 to 500.</param>
    /// <param name="cursor">The last event of the previous page, or null.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>The window, the count of every event and the next cursor.</returns>
    public Task<Page<TradeEvent>> ListEventsAsync(int limit, Guid? cursor, CancellationToken cancellationToken) =>
        repository.ListEventsAsync(limit, cursor, cancellationToken);

    /// <summary>Reads the net position in every instrument with at least one active trade.</summary>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>Positions sorted by symbol.</returns>
    public async Task<IReadOnlyList<Position>> ListPositionsAsync(CancellationToken cancellationToken) =>
        PositionBook.Build(await repository.FindActiveTradesAsync(null, cancellationToken));

    /// <summary>Reads the net position in one instrument.</summary>
    /// <param name="symbol">The instrument.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>Its position, every figure zero when nothing active is booked in it.</returns>
    public async Task<Position> PositionForAsync(string symbol, CancellationToken cancellationToken)
    {
        var positions = PositionBook.Build(await repository.FindActiveTradesAsync(symbol, cancellationToken));
        return positions.Count > 0
            ? positions[0]
            : PositionBook.Empty(symbol, Instruments.Find(symbol)?.Currency ?? Currency.Usd);
    }
}
