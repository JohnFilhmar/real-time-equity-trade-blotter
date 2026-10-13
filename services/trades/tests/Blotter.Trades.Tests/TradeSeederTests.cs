using Blotter.Contracts.Wire;
using Blotter.Trades.Simulation;
using Blotter.Trades.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Blotter.Trades.Tests;

/// <summary>The startup seed fills an empty database once and never touches a populated one.</summary>
public sealed class TradeSeederTests(SqlServerFixture server) : TradesDatabase(server)
{
    [Fact]
    public async Task Seeds_an_empty_database_once_numbering_from_the_sequence_in_execution_order()
    {
        var first = await new TradeSeeder(Context(), Clock).SeedIfEmptyAsync(60, default);
        var second = await new TradeSeeder(Context(), Clock).SeedIfEmptyAsync(60, default);

        var trades = await Context().Trades.OrderBy(trade => trade.TradeId).ToListAsync();
        Assert.Equal(60, first);
        Assert.Equal(0, second);
        Assert.Equal("TRD-100001", trades[0].TradeId);
        Assert.Equal(trades.OrderBy(trade => trade.TradeTimestamp).Select(trade => trade.TradeId), trades.Select(trade => trade.TradeId));
        Assert.Empty(await Context().TradeEvents.ToListAsync());
    }

    [Fact]
    public async Task Leaves_a_populated_database_alone_and_seeds_nothing_for_a_zero_count()
    {
        await Service.CreateAsync(ATicket(), Trader, default);

        Assert.Equal(0, await new TradeSeeder(Context(), Clock).SeedIfEmptyAsync(60, default));
        Assert.Equal(0, await new TradeSeeder(Context(), Clock).SeedIfEmptyAsync(0, default));
        Assert.Equal(1, await Context().Trades.CountAsync());
    }
}
