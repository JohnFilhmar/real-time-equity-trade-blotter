using System.Reflection;
using System.Text.Json.Serialization;

namespace Blotter.Contracts.Json;

/// <summary>
/// Converts the wire enums to and from the names they travel as, such as <c>BUY</c> or
/// <c>LIVE_FEED</c>. The names come from each member's <see cref="JsonStringEnumMemberNameAttribute"/>,
/// so the JSON, the database columns and the token claims all read one declaration.
/// </summary>
public static class WireNames
{
    /// <summary>Returns the wire name of an enum member.</summary>
    /// <typeparam name="TEnum">A wire enum such as <c>TradeSide</c>.</typeparam>
    /// <param name="value">The member.</param>
    /// <returns>Its wire name, or the C# member name when it declares none.</returns>
    public static string Of<TEnum>(TEnum value)
        where TEnum : struct, Enum => Names<TEnum>.ToName[value];

    /// <summary>Parses a wire name, case-sensitively, as the Zod enums do.</summary>
    /// <typeparam name="TEnum">A wire enum such as <c>TradeSide</c>.</typeparam>
    /// <param name="name">The text to parse. Null never matches.</param>
    /// <param name="value">The member, when the name matched.</param>
    /// <returns>True when the name is one of the enum's wire names.</returns>
    public static bool TryParse<TEnum>(string? name, out TEnum value)
        where TEnum : struct, Enum
    {
        if (name is not null && Names<TEnum>.FromName.TryGetValue(name, out value))
        {
            return true;
        }

        value = default;
        return false;
    }

    /// <summary>Parses a wire name that is known to be valid, such as one read from a constrained column.</summary>
    /// <typeparam name="TEnum">A wire enum such as <c>TradeSide</c>.</typeparam>
    /// <param name="name">The wire name.</param>
    /// <returns>The member.</returns>
    /// <exception cref="ArgumentOutOfRangeException">When the name is not one of the enum's wire names.</exception>
    public static TEnum Parse<TEnum>(string name)
        where TEnum : struct, Enum =>
        TryParse<TEnum>(name, out var value)
            ? value
            : throw new ArgumentOutOfRangeException(nameof(name), name, $"Not a {typeof(TEnum).Name} wire name");

    /// <summary>Every wire name of an enum, in declaration order.</summary>
    /// <typeparam name="TEnum">A wire enum such as <c>TradeSide</c>.</typeparam>
    /// <returns>The names.</returns>
    public static IReadOnlyList<string> All<TEnum>()
        where TEnum : struct, Enum => Names<TEnum>.Ordered;

    private static class Names<TEnum>
        where TEnum : struct, Enum
    {
        public static readonly Dictionary<TEnum, string> ToName = Enum.GetValues<TEnum>().ToDictionary(
            value => value,
            value => typeof(TEnum).GetField(value.ToString())?.GetCustomAttribute<JsonStringEnumMemberNameAttribute>()?.Name
                ?? value.ToString());

        public static readonly Dictionary<string, TEnum> FromName =
            ToName.ToDictionary(pair => pair.Value, pair => pair.Key, StringComparer.Ordinal);

        public static readonly IReadOnlyList<string> Ordered = [.. Enum.GetValues<TEnum>().Select(value => ToName[value])];
    }
}
