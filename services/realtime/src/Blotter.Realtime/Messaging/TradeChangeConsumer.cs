using System.Text.Json;
using Blotter.Contracts.Json;
using Blotter.Contracts.Messages;
using Blotter.Realtime.Broadcasting;
using Blotter.Realtime.Settings;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using RabbitMQ.Client.Exceptions;

namespace Blotter.Realtime.Messaging;

/// <summary>
/// Consumes <see cref="TradeChanged"/> messages from the service's own durable queue and broadcasts
/// each one. Prefetch is one, so messages are broadcast strictly in the order the trades service
/// published them, and a message is acknowledged only after its envelopes were handed to the hub.
/// Broadcasts are perishable: the queue drops messages older than a minute, because a client that
/// reconnects after that resyncs over REST anyway.
/// </summary>
/// <param name="settings">Where the broker is.</param>
/// <param name="broadcaster">Turns a message into hub events.</param>
/// <param name="clock">The clock retries wait on.</param>
/// <param name="logger">Where failures are reported.</param>
internal sealed partial class TradeChangeConsumer(
    RealtimeSettings settings,
    TradeBroadcaster broadcaster,
    TimeProvider clock,
    ILogger<TradeChangeConsumer> logger) : BackgroundService
{
    /// <summary>The queue this service owns and binds to the trade exchange.</summary>
    public const string QueueName = "realtime.trade-changes";

    private readonly Lock stopGate = new();
    private IConnection? connection;
    private IChannel? channel;
    private Task? stopping;

    /// <summary>Whether the consumer holds an open channel to the broker, which readiness reports.</summary>
    public bool IsConnected => channel is { IsOpen: true };

    /// <summary>
    /// Stops consuming and closes the broker connection. A host can stop a hosted service twice at
    /// once, so every caller awaits the one shutdown: a second caller that disposed the connection
    /// while the first was still closing its channel is the race this prevents.
    /// </summary>
    /// <param name="cancellationToken">Bounds how long the stop may take.</param>
    /// <returns>The single shutdown, shared by every caller.</returns>
    public override Task StopAsync(CancellationToken cancellationToken)
    {
        lock (stopGate)
        {
            return stopping ??= StopOnceAsync(cancellationToken);
        }
    }

    private async Task StopOnceAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken);

        if (channel is not null)
        {
            await channel.DisposeAsync();
        }

        if (connection is not null)
        {
            await connection.DisposeAsync();
        }
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var attempt = 0;

        while (!stoppingToken.IsCancellationRequested && channel is null)
        {
            try
            {
                await ConnectAsync(stoppingToken);
            }
            catch (BrokerUnreachableException error)
            {
                // The broker may still be starting. The client library recovers a dropped connection
                // on its own once there is one; only the first connection needs this loop.
                attempt++;
                LogBrokerUnreachable(logger, error, attempt);
                await Task.Delay(TimeSpan.FromSeconds(Math.Min(30, attempt * 2)), clock, stoppingToken);
            }
        }
    }

    private async Task ConnectAsync(CancellationToken cancellationToken)
    {
        var factory = new ConnectionFactory { Uri = new Uri(settings.RabbitMqUrl), ClientProvidedName = "blotter-realtime" };
        connection = await factory.CreateConnectionAsync(cancellationToken);
        var opened = await connection.CreateChannelAsync(cancellationToken: cancellationToken);

        await opened.ExchangeDeclareAsync(TradeTopology.Exchange, ExchangeType.Fanout, durable: true, autoDelete: false, cancellationToken: cancellationToken);
        await opened.QueueDeclareAsync(
            QueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: new Dictionary<string, object?> { ["x-message-ttl"] = 60_000, ["x-max-length"] = 10_000 },
            cancellationToken: cancellationToken);
        await opened.QueueBindAsync(QueueName, TradeTopology.Exchange, string.Empty, cancellationToken: cancellationToken);
        await opened.BasicQosAsync(prefetchSize: 0, prefetchCount: 1, global: false, cancellationToken);

        var consumer = new AsyncEventingBasicConsumer(opened);
        consumer.ReceivedAsync += (_, delivery) => HandleAsync(opened, delivery, cancellationToken);
        await opened.BasicConsumeAsync(QueueName, autoAck: false, consumer, cancellationToken);

        channel = opened;
    }

    private async Task HandleAsync(IChannel target, BasicDeliverEventArgs delivery, CancellationToken cancellationToken)
    {
        if (delivery.BasicProperties.Type != TradeTopology.MessageType)
        {
            LogUnknownType(logger, delivery.BasicProperties.Type);
            await target.BasicAckAsync(delivery.DeliveryTag, multiple: false, cancellationToken);
            return;
        }

        TradeChanged message;
        try
        {
            message = JsonSerializer.Deserialize<TradeChanged>(delivery.Body.Span, BlotterJson.Options)
                ?? throw new JsonException("The message body was null");
        }
        catch (JsonException error)
        {
            // A body that cannot be read now never will be; requeueing it would stall the queue.
            LogUnreadable(logger, error);
            await target.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false, cancellationToken);
            return;
        }

        try
        {
            await broadcaster.BroadcastAsync(message, cancellationToken);
            await target.BasicAckAsync(delivery.DeliveryTag, multiple: false, cancellationToken);
        }
#pragma warning disable CA1031 // A failed broadcast is retried by redelivery; the consumer must keep running.
        catch (Exception error) when (!cancellationToken.IsCancellationRequested)
#pragma warning restore CA1031
        {
            LogBroadcastFailed(logger, error);
            await Task.Delay(TimeSpan.FromSeconds(1), clock, cancellationToken);
            await target.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: true, cancellationToken);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Broker unreachable, attempt {Attempt}; retrying")]
    private static partial void LogBrokerUnreachable(ILogger logger, Exception error, int attempt);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Dropped a message of unknown type {Type}")]
    private static partial void LogUnknownType(ILogger logger, string? type);

    [LoggerMessage(Level = LogLevel.Error, Message = "Dropped a trade change whose body could not be read")]
    private static partial void LogUnreadable(ILogger logger, Exception error);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Broadcast failed; the message will be redelivered")]
    private static partial void LogBroadcastFailed(ILogger logger, Exception error);
}
