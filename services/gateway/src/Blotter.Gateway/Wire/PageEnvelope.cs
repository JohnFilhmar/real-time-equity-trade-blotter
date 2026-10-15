using System.Text.Json.Serialization;

namespace Blotter.Gateway.Wire;

/// <summary>
/// A page of the blotter or of the event feed, matching <c>trade_list_schema</c> and
/// <c>trade_event_list_schema</c>. <c>next_cursor</c> is always present and null on the last page,
/// because the client reads its absence as a broken contract.
/// </summary>
/// <typeparam name="T">The row type.</typeparam>
/// <param name="Data">The rows.</param>
/// <param name="Total">Everything matching the same filters, ignoring the page.</param>
/// <param name="Limit">The page size that produced this page.</param>
/// <param name="NextCursor">Where the next page starts, or null.</param>
internal sealed record PageEnvelope<T>(
    [property: JsonPropertyName("data")] IReadOnlyList<T> Data,
    [property: JsonPropertyName("total")] int Total,
    [property: JsonPropertyName("limit")] int Limit,
    [property: JsonPropertyName("next_cursor")] string? NextCursor);
