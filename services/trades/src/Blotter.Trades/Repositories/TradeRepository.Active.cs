using Blotter.Contracts.Wire;
using Blotter.Trades.Data;
using Microsoft.EntityFrameworkCore;

namespace Blotter.Trades.Repositories;

/// <summary>
/// Reads of the active book, which is what positions are built from and what the simulated desk
/// picks from. Choosing at random is the caller's job, so these reads stay deterministic.
/// </summary>
internal sealed partial class TradeRepository
{
    /// <summary>Reads the active trades in execution order, the order the position walk needs.</summary>
    /// <param name="symbol">Only this instrument's trades, or null for every instrument.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>The trades, oldest execution first. Empty when nothing is active.</returns>
    public async Task<IReadOnlyList<Trade>> FindActiveTradesAsync(string? symbol, CancellationToken cancellationToken)
    {
        var rows = db.Trades.AsNoTracking().Where(trade => trade.Status == TradeStatus.Active);
        if (symbol is not null)
        {
            rows = rows.Where(trade => trade.Symbol == symbol);
        }

        var ordered = await rows
            .OrderBy(trade => trade.TradeTimestamp)
            .ThenBy(trade => trade.Id)
            .ToListAsync(cancellationToken);

        return [.. ordered.Select(RowMapping.ToWire)];
    }

    /// <summary>Counts the active trades, which the simulated desk keeps near its cap.</summary>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>How many trades are active.</returns>
    public Task<int> CountActiveAsync(CancellationToken cancellationToken) =>
        db.Trades.CountAsync(trade => trade.Status == TradeStatus.Active, cancellationToken);

    /// <summary>Reads the active trade at a position in booking order, oldest booking first.</summary>
    /// <param name="offset">Zero-based position. Past the end returns null.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>The trade, or null.</returns>
    public async Task<Trade?> FindActiveByAgeAsync(int offset, CancellationToken cancellationToken)
    {
        var row = await db.Trades
            .AsNoTracking()
            .Where(trade => trade.Status == TradeStatus.Active)
            .OrderBy(trade => trade.CreatedAt)
            .ThenBy(trade => trade.Id)
            .Skip(offset)
            .FirstOrDefaultAsync(cancellationToken);

        return row is null ? null : RowMapping.ToWire(row);
    }

    /// <summary>
    /// Reads the newest active trades by execution time, ties broken by the higher id, which is the
    /// order of the blotter's default view.
    /// </summary>
    /// <param name="count">How many to read. Below one reads nothing.</param>
    /// <param name="cancellationToken">Cancels the read.</param>
    /// <returns>At most <paramref name="count"/> trades, newest first.</returns>
    public async Task<IReadOnlyList<Trade>> FindNewestActiveAsync(int count, CancellationToken cancellationToken)
    {
        if (count < 1)
        {
            return [];
        }

        var rows = await db.Trades
            .AsNoTracking()
            .Where(trade => trade.Status == TradeStatus.Active)
            .OrderByDescending(trade => trade.TradeTimestamp)
            .ThenByDescending(trade => trade.Id)
            .Take(count)
            .ToListAsync(cancellationToken);

        return [.. rows.Select(RowMapping.ToWire)];
    }
}
