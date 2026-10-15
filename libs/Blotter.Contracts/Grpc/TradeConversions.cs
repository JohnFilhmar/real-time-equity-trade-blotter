using Blotter.Contracts.Json;
using Google.Protobuf.WellKnownTypes;
using Wire = Blotter.Contracts.Wire;

namespace Blotter.Contracts.Grpc;

/// <summary>
/// Converts trades between the gRPC message and the JSON wire record. The trades service converts
/// wire to proto and the gateway proto to wire, so this is the one place a trade's decimal price
/// and timestamps cross the service boundary. Both directions are lossless.
/// </summary>
public static class TradeConversions
{
    /// <summary>Converts a wire trade to its gRPC message.</summary>
    /// <param name="trade">The trade.</param>
    /// <returns>The message.</returns>
    public static Trade ToProto(this Wire.Trade trade)
    {
        ArgumentNullException.ThrowIfNull(trade);

        return new Trade
        {
            Id = trade.Id.ToString(),
            TradeId = trade.TradeId,
            Symbol = trade.Symbol,
            Side = trade.Side.ToProto(),
            Quantity = trade.Quantity,
            Price = ExactDecimal.Format(trade.Price),
            Currency = trade.Currency.ToProto(),
            Trader = trade.Trader,
            Book = trade.Book,
            Counterparty = trade.Counterparty,
            TradeTimestamp = Timestamp.FromDateTimeOffset(trade.TradeTimestamp),
            Status = trade.Status.ToProto(),
            Version = trade.Version,
            CreatedAt = Timestamp.FromDateTimeOffset(trade.CreatedAt),
            UpdatedAt = Timestamp.FromDateTimeOffset(trade.UpdatedAt),
        };
    }

    /// <summary>Converts a gRPC trade back to its wire record.</summary>
    /// <param name="trade">The message.</param>
    /// <returns>The trade.</returns>
    /// <exception cref="ArgumentOutOfRangeException">When an enum is unspecified, which a well-formed message never sends.</exception>
    public static Wire.Trade ToWire(this Trade trade)
    {
        ArgumentNullException.ThrowIfNull(trade);

        return new Wire.Trade(
            Guid.Parse(trade.Id),
            trade.TradeId,
            trade.Symbol,
            trade.Side.ToWire(),
            trade.Quantity,
            ExactDecimal.Parse(trade.Price),
            trade.Currency.ToWire(),
            trade.Trader,
            trade.Book,
            trade.Counterparty,
            trade.TradeTimestamp.ToDateTimeOffset(),
            trade.Status.ToWire(),
            trade.Version,
            trade.CreatedAt.ToDateTimeOffset(),
            trade.UpdatedAt.ToDateTimeOffset());
    }
}
