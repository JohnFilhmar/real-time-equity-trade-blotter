using System.Text.Json.Serialization;

namespace Blotter.Contracts.Wire;

/// <summary>
/// What happened to a trade. Booking is not here: the trade row itself records its creation.
/// Serialised as <c>AMENDED</c> or <c>CANCELLED</c>.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<TradeEventAction>))]
public enum TradeEventAction
{
    /// <summary>Quantity, price or book moved.</summary>
    [JsonStringEnumMemberName("AMENDED")]
    Amended,

    /// <summary>The trade moved from ACTIVE to CANCELLED.</summary>
    [JsonStringEnumMemberName("CANCELLED")]
    Cancelled,
}
