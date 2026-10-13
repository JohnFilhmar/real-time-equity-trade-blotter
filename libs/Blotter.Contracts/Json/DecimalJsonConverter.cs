using System.Text.Json;
using System.Text.Json.Serialization;

namespace Blotter.Contracts.Json;

/// <summary>
/// Writes decimals as JSON numbers with trailing zeros removed and reads only genuine JSON
/// numbers, never strings, so a quoted price is a type error as it is in the Zod schemas.
/// </summary>
public sealed class DecimalJsonConverter : JsonConverter<decimal>
{
    /// <inheritdoc />
    public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.Number
            ? reader.GetDecimal()
            : throw new JsonException($"Expected a JSON number, got {reader.TokenType}");

    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        writer.WriteNumberValue(ExactDecimal.Normalize(value));
    }
}
