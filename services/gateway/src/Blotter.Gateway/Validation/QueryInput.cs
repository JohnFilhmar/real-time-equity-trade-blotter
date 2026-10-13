using Microsoft.Extensions.Primitives;

namespace Blotter.Gateway.Validation;

/// <summary>
/// A query string as Express's simple parser handed it to Zod: each key absent, one string, or an
/// array when the key repeated. Unknown keys are ignored, as Zod's object stripped them.
/// </summary>
/// <param name="Values">The parsed query, key to every value it was given.</param>
internal sealed record QueryInput(IReadOnlyDictionary<string, StringValues> Values)
{
    /// <summary>Reads a query collection, or a dictionary built by a test.</summary>
    /// <param name="query">The values by key.</param>
    /// <returns>The input.</returns>
    public static QueryInput From(IEnumerable<KeyValuePair<string, StringValues>> query) =>
        new(query.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal));

    /// <summary>Reads one key.</summary>
    /// <param name="name">The exact key.</param>
    /// <returns>Its values: none when absent, one, or several when the key repeated.</returns>
    public StringValues this[string name] => Values.TryGetValue(name, out var values) ? values : StringValues.Empty;
}
