using System.Text.Json.Serialization;

namespace Blotter.Contracts.Wire;

/// <summary>The side a trade was executed on. Serialised as <c>BUY</c> or <c>SELL</c>.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<TradeSide>))]
public enum TradeSide
{
    /// <summary>The desk bought, adding to a long position.</summary>
    [JsonStringEnumMemberName("BUY")]
    Buy,

    /// <summary>The desk sold, adding to a short position.</summary>
    [JsonStringEnumMemberName("SELL")]
    Sell,
}
