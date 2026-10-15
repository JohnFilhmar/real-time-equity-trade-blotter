using System.Text.Json;
using System.Text.Json.Serialization;

namespace Blotter.Contracts.Json;

/// <summary>
/// The one set of JSON rules every service uses for the wire: REST responses, hub payloads and
/// broker messages. Property names come from explicit <see cref="JsonPropertyNameAttribute"/>s,
/// never from a naming policy, so a C# rename can never rename a field on the wire.
/// </summary>
public static class BlotterJson
{
    /// <summary>A ready-made, read-only instance for code that serialises directly.</summary>
    public static JsonSerializerOptions Options { get; } = CreateReadOnly();

    /// <summary>
    /// Applies the wire rules to an options instance a framework owns, such as ASP.NET Core's HTTP
    /// JSON options or SignalR's payload options.
    /// </summary>
    /// <param name="options">The instance to configure. It must still be mutable.</param>
    public static void Configure(JsonSerializerOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        // ASP.NET Core's web defaults read "5" as a number and match names case-insensitively.
        // The Zod schemas do neither, so neither does anything reading this contract.
        options.NumberHandling = JsonNumberHandling.Strict;
        options.PropertyNameCaseInsensitive = false;
        options.PropertyNamingPolicy = null;
        options.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
        options.Converters.Add(new DecimalJsonConverter());
        options.Converters.Add(new UtcMillisecondsJsonConverter());
    }

    private static JsonSerializerOptions CreateReadOnly()
    {
        var options = new JsonSerializerOptions();
        Configure(options);
        options.MakeReadOnly(populateMissingResolver: true);
        return options;
    }
}
