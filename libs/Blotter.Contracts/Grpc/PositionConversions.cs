using Blotter.Contracts.Json;
using Wire = Blotter.Contracts.Wire;

namespace Blotter.Contracts.Grpc;

/// <summary>Converts positions between the gRPC message and the JSON wire record, losslessly.</summary>
public static class PositionConversions
{
    /// <summary>Converts a wire position to its gRPC message.</summary>
    /// <param name="position">The position.</param>
    /// <returns>The message.</returns>
    public static Position ToProto(this Wire.Position position)
    {
        ArgumentNullException.ThrowIfNull(position);

        return new Position
        {
            Symbol = position.Symbol,
            Currency = position.Currency.ToProto(),
            NetQuantity = position.NetQuantity,
            BuyQuantity = position.BuyQuantity,
            SellQuantity = position.SellQuantity,
            GrossNotional = ExactDecimal.Format(position.GrossNotional),
            TradeCount = position.TradeCount,
            AveragePrice = ExactDecimal.Format(position.AveragePrice),
            RealisedPnl = ExactDecimal.Format(position.RealisedPnl),
        };
    }

    /// <summary>Converts a gRPC position back to its wire record.</summary>
    /// <param name="position">The message.</param>
    /// <returns>The position.</returns>
    public static Wire.Position ToWire(this Position position)
    {
        ArgumentNullException.ThrowIfNull(position);

        return new Wire.Position(
            position.Symbol,
            position.Currency.ToWire(),
            position.NetQuantity,
            position.BuyQuantity,
            position.SellQuantity,
            ExactDecimal.Parse(position.GrossNotional),
            position.TradeCount,
            ExactDecimal.Parse(position.AveragePrice),
            ExactDecimal.Parse(position.RealisedPnl));
    }
}
