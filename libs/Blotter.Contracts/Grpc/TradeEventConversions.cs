using Blotter.Contracts.Json;
using Google.Protobuf.WellKnownTypes;
using Wire = Blotter.Contracts.Wire;

namespace Blotter.Contracts.Grpc;

/// <summary>
/// Converts audit events between the gRPC message and the JSON wire record, keeping the order of
/// the changes in both directions.
/// </summary>
public static class TradeEventConversions
{
    /// <summary>Converts a wire audit event to its gRPC message.</summary>
    /// <param name="tradeEvent">The event.</param>
    /// <returns>The message.</returns>
    public static TradeEvent ToProto(this Wire.TradeEvent tradeEvent)
    {
        ArgumentNullException.ThrowIfNull(tradeEvent);

        var message = new TradeEvent
        {
            Id = tradeEvent.Id.ToString(),
            TradeId = tradeEvent.TradeId,
            Version = tradeEvent.Version,
            Action = tradeEvent.Action.ToProto(),
            Source = tradeEvent.Source.ToProto(),
            Actor = tradeEvent.Actor,
            OccurredAt = Timestamp.FromDateTimeOffset(tradeEvent.OccurredAt),
        };

        foreach (var (field, change) in tradeEvent.Changes)
        {
            message.Changes.Add(field, new FieldChange { From = ToProto(change.From), To = ToProto(change.To) });
        }

        return message;
    }

    /// <summary>Converts a gRPC audit event back to its wire record.</summary>
    /// <param name="tradeEvent">The message.</param>
    /// <returns>The event.</returns>
    /// <exception cref="ArgumentOutOfRangeException">When an enum is unspecified or a change value is empty.</exception>
    public static Wire.TradeEvent ToWire(this TradeEvent tradeEvent)
    {
        ArgumentNullException.ThrowIfNull(tradeEvent);

        var changes = new Dictionary<string, Wire.FieldChange>(StringComparer.Ordinal);
        foreach (var (field, change) in tradeEvent.Changes)
        {
            changes.Add(field, new Wire.FieldChange(ToWire(change.From), ToWire(change.To)));
        }

        return new Wire.TradeEvent(
            Guid.Parse(tradeEvent.Id),
            tradeEvent.TradeId,
            tradeEvent.Version,
            tradeEvent.Action.ToWire(),
            tradeEvent.Source.ToWire(),
            changes,
            tradeEvent.Actor,
            tradeEvent.OccurredAt.ToDateTimeOffset());
    }

    private static ChangeValue ToProto(Wire.ChangeValue value) =>
        value.Number is { } number
            ? new ChangeValue { Number = ExactDecimal.Format(number) }
            : new ChangeValue { Text = value.Text };

    private static Wire.ChangeValue ToWire(ChangeValue value) => value.ValueCase switch
    {
        ChangeValue.ValueOneofCase.Number => Wire.ChangeValue.Of(ExactDecimal.Parse(value.Number)),
        ChangeValue.ValueOneofCase.Text => Wire.ChangeValue.Of(value.Text),
        _ => throw new ArgumentOutOfRangeException(nameof(value), value.ValueCase, "A change value carries neither text nor a number"),
    };
}
