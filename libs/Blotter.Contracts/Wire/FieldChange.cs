using System.Text.Json.Serialization;

namespace Blotter.Contracts.Wire;

/// <summary>
/// One field's movement in an audit event. Both sides are recorded so reading the history never
/// means walking versions backwards.
/// </summary>
/// <param name="From">The value before the change.</param>
/// <param name="To">The value after the change.</param>
public sealed record FieldChange(
    [property: JsonPropertyName("from")] ChangeValue From,
    [property: JsonPropertyName("to")] ChangeValue To);
