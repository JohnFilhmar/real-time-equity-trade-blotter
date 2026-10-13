using System.Text.Json.Serialization;

namespace Blotter.Contracts.Wire;

/// <summary>The currencies the blotter quotes in. Serialised as <c>USD</c> or <c>GBX</c>.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<Currency>))]
public enum Currency
{
    /// <summary>US dollars.</summary>
    [JsonStringEnumMemberName("USD")]
    Usd,

    /// <summary>Pence sterling, the unit the London Stock Exchange quotes in, so 78 means 78p.</summary>
    [JsonStringEnumMemberName("GBX")]
    Gbx,
}
