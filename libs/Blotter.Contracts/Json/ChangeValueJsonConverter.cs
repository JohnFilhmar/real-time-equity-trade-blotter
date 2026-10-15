using System.Text.Json;
using System.Text.Json.Serialization;
using Blotter.Contracts.Wire;

namespace Blotter.Contracts.Json;

/// <summary>Writes a <see cref="ChangeValue"/> as a bare JSON string or number, and reads one back.</summary>
public sealed class ChangeValueJsonConverter : JsonConverter<ChangeValue>
{
    /// <inheritdoc />
    public override ChangeValue Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType switch
        {
            JsonTokenType.String => ChangeValue.Of(reader.GetString()!),
            JsonTokenType.Number => ChangeValue.Of(reader.GetDecimal()),
            _ => throw new JsonException($"A change value must be a string or a number, got {reader.TokenType}"),
        };

    /// <inheritdoc />
    public override void Write(Utf8JsonWriter writer, ChangeValue value, JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(writer);
        ArgumentNullException.ThrowIfNull(value);

        if (value.Number is { } number)
        {
            writer.WriteNumberValue(ExactDecimal.Normalize(number));
            return;
        }

        writer.WriteStringValue(value.Text);
    }
}
