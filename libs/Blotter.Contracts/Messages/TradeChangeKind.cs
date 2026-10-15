using System.Text.Json.Serialization;

namespace Blotter.Contracts.Messages;

/// <summary>Which lifecycle step a <see cref="TradeChanged"/> message reports.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<TradeChangeKind>))]
public enum TradeChangeKind
{
    /// <summary>A trade was booked. Broadcast as <c>trade.created</c>.</summary>
    [JsonStringEnumMemberName("created")]
    Created,

    /// <summary>A trade was amended. Broadcast as <c>trade.amended</c>.</summary>
    [JsonStringEnumMemberName("amended")]
    Amended,

    /// <summary>A trade was cancelled. Broadcast as <c>trade.cancelled</c>.</summary>
    [JsonStringEnumMemberName("cancelled")]
    Cancelled,
}
