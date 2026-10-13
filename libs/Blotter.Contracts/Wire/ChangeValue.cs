using System.Text.Json.Serialization;
using Blotter.Contracts.Json;

namespace Blotter.Contracts.Wire;

/// <summary>
/// One side of a field's movement in the audit trail: a string such as a book or a status, or a
/// number such as a quantity or a price. Serialised as a bare JSON string or number, matching the
/// <c>z.union([z.string(), z.number()])</c> the frontend parses.
/// </summary>
[JsonConverter(typeof(ChangeValueJsonConverter))]
public sealed record ChangeValue
{
    private ChangeValue(string? text, decimal? number)
    {
        Text = text;
        Number = number;
    }

    /// <summary>The value when it is a string, otherwise null.</summary>
    public string? Text { get; }

    /// <summary>The value when it is a number, otherwise null.</summary>
    public decimal? Number { get; }

    /// <summary>Wraps a string value.</summary>
    /// <param name="text">The value. Never null.</param>
    /// <returns>A text change value.</returns>
    public static ChangeValue Of(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        return new ChangeValue(text, null);
    }

    /// <summary>Wraps a numeric value.</summary>
    /// <param name="number">The value, kept exact.</param>
    /// <returns>A numeric change value.</returns>
    public static ChangeValue Of(decimal number) => new(null, number);
}
