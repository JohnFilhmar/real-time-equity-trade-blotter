using System.Text.Json;

namespace Blotter.Gateway.Validation;

/// <summary>
/// A request body as Express handed it to Zod: absent, or the parsed JSON. Fields are looked up by
/// exact, case-sensitive name, and a missing field reads as <see cref="JsonValueKind.Undefined"/>,
/// which is how the checks tell "not sent" from <c>null</c>.
/// </summary>
/// <param name="Root">The parsed body, or null when no JSON body was sent.</param>
internal sealed record JsonBody(JsonElement? Root)
{
    /// <summary>A request that carried no JSON body.</summary>
    public static JsonBody None { get; } = new((JsonElement?)null);

    /// <summary>An empty object, which the cancel route used in place of a missing body.</summary>
    public static JsonBody EmptyObject { get; } = new(JsonDocument.Parse("{}").RootElement.Clone());

    /// <summary>Whether the body is a JSON object, the only shape any schema accepts.</summary>
    public bool IsObject => Root is { ValueKind: JsonValueKind.Object };

    /// <summary>The name Zod gives the body's type when it is not an object.</summary>
    public string TypeName => Root?.ValueKind switch
    {
        null => "undefined",
        JsonValueKind.Array => "array",
        JsonValueKind.Null => "null",
        JsonValueKind.String => "string",
        JsonValueKind.Number => "number",
        JsonValueKind.True or JsonValueKind.False => "boolean",
        _ => "object",
    };

    /// <summary>Reads one field. The last occurrence wins when a name repeats, as in <c>JSON.parse</c>.</summary>
    /// <param name="name">The exact field name.</param>
    /// <returns>The value, or an undefined element when the field is absent.</returns>
    public JsonElement this[string name]
    {
        get
        {
            var found = default(JsonElement);
            if (IsObject)
            {
                foreach (var property in Root!.Value.EnumerateObject())
                {
                    if (property.NameEquals(name))
                    {
                        found = property.Value;
                    }
                }
            }

            return found;
        }
    }

    /// <summary>Whether a field was sent at all, whatever its value.</summary>
    /// <param name="name">The exact field name.</param>
    /// <returns>True when present, null included.</returns>
    public bool Has(string name) => this[name].ValueKind != JsonValueKind.Undefined;
}
