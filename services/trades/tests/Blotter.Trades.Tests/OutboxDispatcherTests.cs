using Blotter.Contracts.Messages;
using Blotter.Contracts.Wire;
using Blotter.Trades.Domain;
using Blotter.Trades.Outbox;
using Blotter.Trades.Settings;
using Blotter.Trades.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Blotter.Trades.Tests;

/// <summary>
/// Committed writes reach the broker, in commit order, each carrying the symbol's position, and a
/// broker outage loses nothing. Runs against real SQL Server and real RabbitMQ.
/// </summary>
public sealed class OutboxDispatcherTests(SqlServerFixture server, RabbitMqFixture broker)
    : TradesDatabase(server), IClassFixture<RabbitMqFixture>
{
    [Fact]
    public async Task Publishes_every_committed_change_in_order_with_the_position_and_stamps_it()
    {
        var (messages, connection) = await broker.ListenAsync();
        await using var _ = connection;
        var created = await Service.CreateAsync(ATicket(quantity: 5000), Trader, default);
        await Service.AmendAsync(created.TradeId, 1, new TradeChanges(7500, null, null), Trader, default);
        await Service.CreateAsync(ATicket(symbol: "VOD.L", price: 78m), Trader, default);

        using var services = BuildServices();
        await using var publisher = new RabbitPublisher(new TradesSettings { RabbitMqUrl = broker.Url });
        var dispatcher = Dispatcher(services, publisher);

        Assert.Equal(3, await dispatcher.DispatchPendingAsync(default));
        Assert.Equal(0, await dispatcher.DispatchPendingAsync(default));

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var received = new List<(TradeChanged Message, RabbitMQ.Client.IReadOnlyBasicProperties Properties)>();
        for (var index = 0; index < 3; index++)
        {
            received.Add(await messages.ReadAsync(timeout.Token));
        }

        Assert.Equal(
            new[] { TradeChangeKind.Created, TradeChangeKind.Amended, TradeChangeKind.Created },
            received.Select(item => item.Message.Kind));
        Assert.Null(received[0].Message.Event);
        Assert.Equal(2, received[1].Message.Event?.Version);
        Assert.Equal(7500, received[1].Message.Position.NetQuantity);
        Assert.Equal(Currency.Gbx, received[2].Message.Position.Currency);
        Assert.All(received, item => Assert.Equal(TradeTopology.MessageType, item.Properties.Type));
        Assert.All(received, item => Assert.Equal(RabbitMQ.Client.DeliveryModes.Persistent, item.Properties.DeliveryMode));
        Assert.Empty(await Context().Outbox.Where(row => row.PublishedAt == null).ToListAsync());
    }

    [Fact]
    public async Task A_broker_outage_leaves_the_changes_waiting_rather_than_losing_them()
    {
        await Service.CreateAsync(ATicket(), Trader, default);
        using var services = BuildServices();
        await using var publisher = new RabbitPublisher(new TradesSettings { RabbitMqUrl = "amqp://guest:guest@127.0.0.1:1/" });

        await Assert.ThrowsAnyAsync<Exception>(() => Dispatcher(services, publisher).DispatchPendingAsync(default));

        Assert.Single(await Context().Outbox.Where(row => row.PublishedAt == null).ToListAsync());
    }

    private OutboxDispatcher Dispatcher(ServiceProvider services, RabbitPublisher publisher) => new(
        services.GetRequiredService<IServiceScopeFactory>(),
        publisher,
        new OutboxSignal(),
        Clock,
        new ListLogger<OutboxDispatcher>());
}
