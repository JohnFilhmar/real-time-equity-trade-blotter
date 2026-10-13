using System.Text.Json;
using System.Threading.Channels;
using Blotter.Contracts.Json;
using Blotter.Contracts.Messages;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using Testcontainers.RabbitMq;
using Xunit;

namespace Blotter.Trades.Tests.Fixtures;

/// <summary>A real RabbitMQ broker for a test class.</summary>
public sealed class RabbitMqFixture : IAsyncLifetime
{
    /// <summary>The image the compose file runs.</summary>
    public const string Image = "rabbitmq:4.3.6-management-alpine";

    private readonly RabbitMqContainer container = new RabbitMqBuilder(Image).Build();

    /// <summary>The broker's AMQP URL.</summary>
    public string Url => container.GetConnectionString();

    /// <summary>
    /// Binds a fresh exclusive queue to the trade exchange, the way the realtime service does, and
    /// collects every message delivered to it.
    /// </summary>
    /// <returns>A reader of the delivered messages, and the connection to dispose with the test.</returns>
    public async Task<(ChannelReader<(TradeChanged Message, IReadOnlyBasicProperties Properties)> Messages, IConnection Connection)> ListenAsync()
    {
        var connection = await new ConnectionFactory { Uri = new Uri(Url) }.CreateConnectionAsync();
        var channel = await connection.CreateChannelAsync();
        await channel.ExchangeDeclareAsync(TradeTopology.Exchange, ExchangeType.Fanout, durable: true, autoDelete: false);
        var queue = await channel.QueueDeclareAsync(string.Empty, durable: false, exclusive: true, autoDelete: true);
        await channel.QueueBindAsync(queue.QueueName, TradeTopology.Exchange, string.Empty);

        var received = Channel.CreateUnbounded<(TradeChanged, IReadOnlyBasicProperties)>();
        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += (_, delivery) =>
        {
            var message = JsonSerializer.Deserialize<TradeChanged>(delivery.Body.Span, BlotterJson.Options)!;
            received.Writer.TryWrite((message, delivery.BasicProperties));
            return Task.CompletedTask;
        };
        await channel.BasicConsumeAsync(queue.QueueName, autoAck: true, consumer);

        return (received.Reader, connection);
    }

    /// <inheritdoc />
    public async ValueTask InitializeAsync() => await container.StartAsync();

    /// <inheritdoc />
    public async ValueTask DisposeAsync() => await container.DisposeAsync();
}
