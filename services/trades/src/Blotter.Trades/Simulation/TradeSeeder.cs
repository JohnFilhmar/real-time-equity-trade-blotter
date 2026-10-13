using Blotter.Trades.Data;
using Blotter.Trades.Domain;
using Blotter.Trades.Repositories;
using Microsoft.EntityFrameworkCore;

namespace Blotter.Trades.Simulation;

/// <summary>
/// Seeds an empty database with the startup dataset. Guarded on an empty table, so a populated
/// database is never touched. Seeded trades are not broadcast: nobody is connected yet.
/// </summary>
/// <param name="db">The database.</param>
/// <param name="clock">The clock the run date is read from.</param>
internal sealed class TradeSeeder(TradesDbContext db, TimeProvider clock)
{
    /// <summary>Seeds the trades, if and only if there are none.</summary>
    /// <param name="count">How many to book. Zero or less seeds nothing.</param>
    /// <param name="cancellationToken">Cancels the seed.</param>
    /// <returns>How many trades were inserted, zero when data already existed.</returns>
    public async Task<int> SeedIfEmptyAsync(int count, CancellationToken cancellationToken)
    {
        if (count <= 0 || await db.Trades.AnyAsync(cancellationToken))
        {
            return 0;
        }

        var now = Timestamps.Now(clock);
        var generated = TradeGenerator.Generate(count, TradeGenerator.DefaultSeed, now);

        // Ids come from the same sequence live bookings use, so they stay unique across processes.
        var numbers = (await db.Database
            .SqlQuery<long>($"SELECT NEXT VALUE FOR [trade_id_seq] AS [Value] FROM GENERATE_SERIES(1, {count})")
            .ToListAsync(cancellationToken)).Order().ToList();

        db.Trades.AddRange(generated.Select((seed, index) => new TradeRow
        {
            Id = Guid.CreateVersion7(now),
            TradeId = TradeRepository.FormatTradeId(numbers[index]),
            Symbol = seed.Trade.Symbol,
            Side = seed.Trade.Side,
            Quantity = seed.Trade.Quantity,
            Price = seed.Trade.Price,
            Currency = seed.Trade.Currency,
            Trader = seed.Trade.Trader,
            Book = seed.Trade.Book,
            Counterparty = seed.Trade.Counterparty,
            TradeTimestamp = seed.Trade.TradeTimestamp,
            Status = seed.Status,
            Version = 1,
            CreatedAt = now,
            UpdatedAt = now,
        }));

        return await db.SaveChangesAsync(cancellationToken);
    }
}
