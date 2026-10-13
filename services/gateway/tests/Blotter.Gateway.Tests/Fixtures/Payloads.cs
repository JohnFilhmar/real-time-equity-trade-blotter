using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Blotter.Gateway.Tests.Fixtures;

/// <summary>Request bodies and response reading shared by the route tests.</summary>
public static class Payloads
{
    /// <summary>
    /// A valid ticket, the C# twin of the Node route tests' <c>a_trade_body</c>, with any fields
    /// changed. Setting a field to null removes it.
    /// </summary>
    /// <param name="changes">Field values to replace or add.</param>
    /// <returns>The JSON text.</returns>
    public static string Ticket(params (string Field, JsonNode? Value)[] changes)
    {
        var ticket = new JsonObject
        {
            ["symbol"] = "AAPL",
            ["side"] = "BUY",
            ["quantity"] = 5000,
            ["price"] = 227.45m,
            ["book"] = "EQUITIES_UK",
            ["counterparty"] = "Goldman Sachs",
            ["tradeTimestamp"] = "2026-08-18T09:15:23.000Z",
        };

        foreach (var (field, value) in changes)
        {
            if (value is null)
            {
                ticket.Remove(field);
            }
            else
            {
                ticket[field] = value;
            }
        }

        return ticket.ToJsonString();
    }

    /// <summary>Any object as JSON text.</summary>
    /// <param name="body">The fields.</param>
    /// <returns>The JSON text.</returns>
    public static string Json(object body) => JsonSerializer.Serialize(body);

    /// <summary>Reads a response body as JSON.</summary>
    /// <param name="response">The response.</param>
    /// <returns>The root element.</returns>
    public static async Task<JsonElement> ReadAsync(this HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();

    /// <summary>The field errors of a 422, as field and message pairs in order.</summary>
    /// <param name="problem">The problem document.</param>
    /// <returns>The pairs, empty when there are none.</returns>
    public static List<(string Field, string Message)> FieldErrors(this JsonElement problem) =>
        problem.TryGetProperty("errors", out var errors)
            ? [.. errors.EnumerateArray().Select(error => (error.GetProperty("field").GetString()!, error.GetProperty("message").GetString()!))]
            : [];

    /// <summary>One string property.</summary>
    /// <param name="element">The object.</param>
    /// <param name="name">The property name.</param>
    /// <returns>Its value.</returns>
    public static string Text(this JsonElement element, string name) => element.GetProperty(name).GetString()!;
}
