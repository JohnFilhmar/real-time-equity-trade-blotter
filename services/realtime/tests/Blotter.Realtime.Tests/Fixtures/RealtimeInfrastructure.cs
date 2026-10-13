using System.Text.Json;
using Blotter.Contracts.Json;
using Blotter.Contracts.Messages;
using RabbitMQ.Client;
using Testcontainers.RabbitMq;
using Testcontainers.Redis;
using Xunit;

namespace Blotter.Realtime.Tests.Fixtures;

/// <summary>A real Redis and a real RabbitMQ, shared by the hub tests in one class.</summary>
public sealed class RealtimeInfrastructure : IAsyncLifetime
{
    private readonly RedisContainer redis = new RedisBuilder("redis:8.10.2-alpine").Build();
    private readonly RabbitMqContainer broker = new RabbitMqBuilder("rabbitmq:4.3.6-management-alpine").Build();

    /// <summary>StackExchange.Redis configuration for the container.</summary>
    public string RedisConnection => redis.GetConnectionString();

    /// <summary>The broker's AMQP URL.</summary>
    public string RabbitMqUrl => broker.GetConnectionString();

    /// <summary>Publishes a message to the trade exchange exactly as the trades service does.</summary>
    /// <param name="message">The change.</param>
    /// <param name="type">The AMQP type property. Anything but the contract's type is a foreign message.</param>
    /// <param name="copies">How many times to publish it, over one connection.</param>
    /// <returns>A task that completes once the broker has every copy.</returns>
    public async Task PublishAsync(TradeChanged message, string type = TradeTopology.MessageType, int copies = 1)
    {
        await using var connection = await new ConnectionFactory { Uri = new Uri(RabbitMqUrl) }.CreateConnectionAsync();
        await using var channel = await connection.CreateChannelAsync(new CreateChannelOptions(true, true));
        await channel.ExchangeDeclareAsync(TradeTopology.Exchange, ExchangeType.Fanout, durable: true, autoDelete: false);

        for (var copy = 0; copy < copies; copy++)
        {
            await channel.BasicPublishAsync(
                TradeTopology.Exchange,
                string.Empty,
                mandatory: false,
                new BasicProperties { Type = type, ContentType = TradeTopology.ContentType, DeliveryMode = DeliveryModes.Persistent },
                JsonSerializer.SerializeToUtf8Bytes(message, BlotterJson.Options));
        }
    }

    /// <summary>
    /// Deletes the realtime service's queue, so a test never receives what an earlier test left
    /// behind. The service declares it again when its consumer connects.
    /// </summary>
    /// <returns>A task that completes once the queue is gone.</returns>
    public async Task ResetConsumerQueueAsync()
    {
        await using var connection = await new ConnectionFactory { Uri = new Uri(RabbitMqUrl) }.CreateConnectionAsync();
        await using var channel = await connection.CreateChannelAsync();
        await channel.QueueDeleteAsync(Messaging.TradeChangeConsumer.QueueName);
    }

    /// <inheritdoc />
    public async ValueTask InitializeAsync() => await Task.WhenAll(redis.StartAsync(), broker.StartAsync());

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        await redis.DisposeAsync();
        await broker.DisposeAsync();
    }
}
