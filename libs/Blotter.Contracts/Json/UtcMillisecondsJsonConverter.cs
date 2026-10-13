using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Blotter.Contracts.Json;

/// <summary>
/// Writes timestamps the way JavaScript's <c>Date.toISOString()</c> does, UTC with exactly three
/// fractional digits and a <c>Z</c>, such as <c>2026-10-13T00:08:00.000Z</c>. That is the form the
/// Node API sent and the form the frontend's <c>z.iso.datetime()</c> accepts.
/// </summary>
public sealed class UtcMillisecondsJsonConverter : JsonConverter<DateTimeOffset>
{
    /// <summary>The exact output format.</summary>
    public const string Format = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";

    /// <inheritdoc />
    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var text = reader.GetString() ?? throw new JsonException("Expected an ISO 8601 timestamp, got null");
        return DateTimeOffset.Parse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);
    }

    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteStringValue(value.ToUniversalTime().ToString(Format, CultureInfo.InvariantCulture));
    }
}
