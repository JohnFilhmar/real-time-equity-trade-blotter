using System.Text.Json.Serialization;

namespace Blotter.Contracts.Wire;

/// <summary>Where a change came in from. Serialised as <c>API</c> or <c>LIVE_FEED</c>.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<TradeEventSource>))]
public enum TradeEventSource
{
    /// <summary>A person, through the REST API.</summary>
    [JsonStringEnumMemberName("API")]
    Api,

    /// <summary>The simulated desk inside the trades service.</summary>
    [JsonStringEnumMemberName("LIVE_FEED")]
    LiveFeed,
}
