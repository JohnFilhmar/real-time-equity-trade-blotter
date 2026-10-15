using System.Text.Json;
using Blotter.Gateway.Validation;
using Microsoft.Extensions.Primitives;

namespace Blotter.Gateway.Tests.Fixtures;

/// <summary>One field error a Zod schema reported.</summary>
/// <param name="Field">The issue path joined with dots, empty for the body as a whole.</param>
/// <param name="Message">The message, verbatim.</param>
public sealed record ZodError(string Field, string Message);

/// <summary>
/// One input from <c>zod_cases.json</c> and what the Node API's schema said about it, written by
/// <c>scripts/export_zod_cases.mjs</c>.
/// </summary>
/// <param name="Schema">Which schema ran: login, create_trade, amend_trade, cancel_trade, trade_query, event_query or trade_params.</param>
/// <param name="Body">A body case's raw JSON text, or null when no body was sent.</param>
/// <param name="Query">A query case's values: a string, or an array when the key repeated.</param>
/// <param name="Ok">Whether the schema accepted the input.</param>
/// <param name="Output">What the schema produced when it accepted the input.</param>
/// <param name="Errors">What it reported when it refused the input, in order.</param>
public sealed record ZodCase(
    string Schema,
    string? Body,
    Dictionary<string, JsonElement>? Query,
    bool Ok,
    JsonElement? Output,
    List<ZodError>? Errors)
{
    private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

    private static readonly Lazy<IReadOnlyList<ZodCase>> Loaded = new(() =>
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Fixtures", "zod_cases.json");
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        return document.RootElement.GetProperty("cases").Deserialize<List<ZodCase>>(Options)!;
    });

    /// <summary>Every case in the fixture, in file order.</summary>
    public static IReadOnlyList<ZodCase> All => Loaded.Value;

    /// <summary>The body as the gateway's validators receive it. The cancel route reads a missing body as an empty object.</summary>
    internal JsonBody JsonBody => Body is null
        ? Schema == "cancel_trade" ? JsonBody.EmptyObject : JsonBody.None
        : new JsonBody(JsonDocument.Parse(Body).RootElement.Clone());

    /// <summary>The query as the gateway's validators receive it.</summary>
    internal QueryInput QueryInput => QueryInput.From((Query ?? []).Select(pair => KeyValuePair.Create(
        pair.Key,
        pair.Value.ValueKind == JsonValueKind.Array
            ? new StringValues([.. pair.Value.EnumerateArray().Select(item => item.GetString())])
            : new StringValues(pair.Value.GetString()))));

    /// <summary>A one-line label naming the schema and the input, for failure messages.</summary>
    public string Label => $"{Schema} {Body ?? (Query is null ? "(no body)" : JsonSerializer.Serialize(Query))}";
}
