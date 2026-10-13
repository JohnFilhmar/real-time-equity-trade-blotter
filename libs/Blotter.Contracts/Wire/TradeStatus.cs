using System.Text.Json.Serialization;

namespace Blotter.Contracts.Wire;

/// <summary>
/// The two states a trade can hold. An amendment is not a status: it bumps the version and writes
/// an audit row instead. Serialised as <c>ACTIVE</c> or <c>CANCELLED</c>.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<TradeStatus>))]
public enum TradeStatus
{
    /// <summary>Live, and counted in positions.</summary>
    [JsonStringEnumMemberName("ACTIVE")]
    Active,

    /// <summary>Cancelled. Kept for the audit trail, never counted in positions.</summary>
    [JsonStringEnumMemberName("CANCELLED")]
    Cancelled,
}
