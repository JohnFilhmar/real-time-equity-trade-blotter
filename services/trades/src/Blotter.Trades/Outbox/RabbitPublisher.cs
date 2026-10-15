using System.Globalization;
using System.Text.Json;
using Blotter.Contracts.Json;
using Blotter.Contracts.Messages;
using Blotter.Trades.Settings;
using RabbitMQ.Client;

namespace Blotter.Trades.Outbox;

/// <summary>
/// Publishes <see cref="TradeChanged"/> messages to the durable fanout exchange with publisher
/// confirms, so a publish only completes once the broker has taken responsibility for the message.
/// The connection opens on first use and reopens after a failure.
/// </summary>
/// <param name="settings">Where the broker is.</param>
internal sealed class RabbitPublisher(TradesSettings settings) : IAsyncDisposable
{
    private readonly SemaphoreSlim gate = new(1, 1);
    private IConnection? connection;
    private IChannel? channel;

    /// <summary>Publishes one message and waits for the broker's confirm.</summary>
    /// <param name="outboxId">The outbox row id, sent as the message id so a consumer can spot a redelivery.</param>
    /// <param name="message">The change to publish.</param>
    /// <param name="cancellationToken">Cancels the publish.</param>
    /// <returns>A task that completes once the broker confirmed.</returns>
    /// <exception cref="RabbitMQ.Client.Exceptions.PublishException">When the broker refused the message.</exception>
    public async Task PublishAsync(long outboxId, TradeChanged message, CancellationToken cancellationToken)
    {
        var target = await ChannelAsync(cancellationToken);
        var properties = new BasicProperties
        {
            ContentType = TradeTopology.ContentType,
            Type = TradeTopology.MessageType,
            DeliveryMode = DeliveryModes.Persistent,
            MessageId = outboxId.ToString(CultureInfo.InvariantCulture),
        };

        await target.BasicPublishAsync(
            TradeTopology.Exchange,
            routingKey: string.Empty,
            mandatory: false,
            basicProperties: properties,
            body: JsonSerializer.SerializeToUtf8Bytes(message, BlotterJson.Options),
            cancellationToken: cancellationToken);
    }

    /// <summary>Closes the channel and the connection.</summary>
    /// <returns>A task that completes once both are closed.</returns>
    public async ValueTask DisposeAsync()
    {
        if (channel is not null)
        {
            await channel.DisposeAsync();
        }

        if (connection is not null)
        {
            await connection.DisposeAsync();
        }

        gate.Dispose();
    }

    private async Task<IChannel> ChannelAsync(CancellationToken cancellationToken)
    {
        if (channel is { IsOpen: true } open)
        {
            return open;
        }

        await gate.WaitAsync(cancellationToken);
        try
        {
            if (channel is { IsOpen: true } reopened)
            {
                return reopened;
            }

            if (connection is not { IsOpen: true })
            {
                var factory = new ConnectionFactory
                {
                    Uri = new Uri(settings.RabbitMqUrl),
                    ClientProvidedName = "blotter-trades",
                };
                connection = await factory.CreateConnectionAsync(cancellationToken);
            }

            channel = await connection.CreateChannelAsync(
                new CreateChannelOptions(publisherConfirmationsEnabled: true, publisherConfirmationTrackingEnabled: true),
                cancellationToken);
            await channel.ExchangeDeclareAsync(
                TradeTopology.Exchange,
                ExchangeType.Fanout,
                durable: true,
                autoDelete: false,
                cancellationToken: cancellationToken);

            return channel;
        }
        finally
        {
            gate.Release();
        }
    }
}
