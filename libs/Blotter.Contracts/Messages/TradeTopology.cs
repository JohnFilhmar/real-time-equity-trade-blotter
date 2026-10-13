namespace Blotter.Contracts.Messages;

/// <summary>
/// The broker names the publisher and the consumer must agree on. Queues are not here: each
/// consumer declares and owns its own.
/// </summary>
public static class TradeTopology
{
    /// <summary>Durable fanout exchange carrying <see cref="TradeChanged"/> messages as JSON.</summary>
    public const string Exchange = "blotter.trades";

    /// <summary>Content type set on every published message.</summary>
    public const string ContentType = "application/json";

    /// <summary>The AMQP <c>type</c> property, so a consumer can refuse a message it does not understand.</summary>
    public const string MessageType = "trade.changed.v1";
}
