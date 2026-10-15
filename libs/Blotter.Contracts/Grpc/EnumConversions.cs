using Wire = Blotter.Contracts.Wire;

namespace Blotter.Contracts.Grpc;

/// <summary>
/// Converts each wire enum to its gRPC counterpart and back. A gRPC value of <c>UNSPECIFIED</c> is
/// refused, because a well-formed message never sends one where a value is required.
/// </summary>
public static class EnumConversions
{
    /// <summary>Converts a wire side to its gRPC enum.</summary>
    /// <param name="side">The side.</param>
    /// <returns>The gRPC value.</returns>
    public static Side ToProto(this Wire.TradeSide side) => side switch
    {
        Wire.TradeSide.Buy => Side.Buy,
        Wire.TradeSide.Sell => Side.Sell,
        _ => throw new ArgumentOutOfRangeException(nameof(side), side, null),
    };

    /// <summary>Converts a gRPC side to its wire enum.</summary>
    /// <param name="side">The gRPC value.</param>
    /// <returns>The side.</returns>
    public static Wire.TradeSide ToWire(this Side side) => side switch
    {
        Side.Buy => Wire.TradeSide.Buy,
        Side.Sell => Wire.TradeSide.Sell,
        _ => throw new ArgumentOutOfRangeException(nameof(side), side, null),
    };

    /// <summary>Converts a wire status to its gRPC enum.</summary>
    /// <param name="status">The status.</param>
    /// <returns>The gRPC value.</returns>
    public static TradeStatus ToProto(this Wire.TradeStatus status) => status switch
    {
        Wire.TradeStatus.Active => TradeStatus.Active,
        Wire.TradeStatus.Cancelled => TradeStatus.Cancelled,
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null),
    };

    /// <summary>Converts a gRPC status to its wire enum.</summary>
    /// <param name="status">The gRPC value.</param>
    /// <returns>The status.</returns>
    public static Wire.TradeStatus ToWire(this TradeStatus status) => status switch
    {
        TradeStatus.Active => Wire.TradeStatus.Active,
        TradeStatus.Cancelled => Wire.TradeStatus.Cancelled,
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, null),
    };

    /// <summary>Converts a wire currency to its gRPC enum.</summary>
    /// <param name="currency">The currency.</param>
    /// <returns>The gRPC value.</returns>
    public static Currency ToProto(this Wire.Currency currency) => currency switch
    {
        Wire.Currency.Usd => Currency.Usd,
        Wire.Currency.Gbx => Currency.Gbx,
        _ => throw new ArgumentOutOfRangeException(nameof(currency), currency, null),
    };

    /// <summary>Converts a gRPC currency to its wire enum.</summary>
    /// <param name="currency">The gRPC value.</param>
    /// <returns>The currency.</returns>
    public static Wire.Currency ToWire(this Currency currency) => currency switch
    {
        Currency.Usd => Wire.Currency.Usd,
        Currency.Gbx => Wire.Currency.Gbx,
        _ => throw new ArgumentOutOfRangeException(nameof(currency), currency, null),
    };

    /// <summary>Converts a wire event action to its gRPC enum.</summary>
    /// <param name="action">The action.</param>
    /// <returns>The gRPC value.</returns>
    public static EventAction ToProto(this Wire.TradeEventAction action) => action switch
    {
        Wire.TradeEventAction.Amended => EventAction.Amended,
        Wire.TradeEventAction.Cancelled => EventAction.Cancelled,
        _ => throw new ArgumentOutOfRangeException(nameof(action), action, null),
    };

    /// <summary>Converts a gRPC event action to its wire enum.</summary>
    /// <param name="action">The gRPC value.</param>
    /// <returns>The action.</returns>
    public static Wire.TradeEventAction ToWire(this EventAction action) => action switch
    {
        EventAction.Amended => Wire.TradeEventAction.Amended,
        EventAction.Cancelled => Wire.TradeEventAction.Cancelled,
        _ => throw new ArgumentOutOfRangeException(nameof(action), action, null),
    };

    /// <summary>Converts a wire event source to its gRPC enum.</summary>
    /// <param name="source">The source.</param>
    /// <returns>The gRPC value.</returns>
    public static EventSource ToProto(this Wire.TradeEventSource source) => source switch
    {
        Wire.TradeEventSource.Api => EventSource.Api,
        Wire.TradeEventSource.LiveFeed => EventSource.LiveFeed,
        _ => throw new ArgumentOutOfRangeException(nameof(source), source, null),
    };

    /// <summary>Converts a gRPC event source to its wire enum.</summary>
    /// <param name="source">The gRPC value.</param>
    /// <returns>The source.</returns>
    public static Wire.TradeEventSource ToWire(this EventSource source) => source switch
    {
        EventSource.Api => Wire.TradeEventSource.Api,
        EventSource.LiveFeed => Wire.TradeEventSource.LiveFeed,
        _ => throw new ArgumentOutOfRangeException(nameof(source), source, null),
    };
}
