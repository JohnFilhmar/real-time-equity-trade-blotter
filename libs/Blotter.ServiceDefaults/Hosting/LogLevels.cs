using Serilog.Events;

namespace Blotter.ServiceDefaults.Hosting;

/// <summary>
/// Reads <c>LOG_LEVEL</c> using the pino level names the Node API accepted, so an existing compose
/// file or runbook keeps working.
/// </summary>
public static class LogLevels
{
    /// <summary>Above <see cref="LogEventLevel.Fatal"/>, so nothing is ever written.</summary>
    public const LogEventLevel Silent = LogEventLevel.Fatal + 1;

    /// <summary>Maps a pino level name to a Serilog level.</summary>
    /// <param name="name">One of fatal, error, warn, info, debug, trace or silent. Null or empty means info.</param>
    /// <returns>The Serilog minimum level.</returns>
    /// <exception cref="InvalidOperationException">When the name is not one of the seven.</exception>
    public static LogEventLevel Parse(string? name) => name switch
    {
        null or "" or "info" => LogEventLevel.Information,
        "fatal" => LogEventLevel.Fatal,
        "error" => LogEventLevel.Error,
        "warn" => LogEventLevel.Warning,
        "debug" => LogEventLevel.Debug,
        "trace" => LogEventLevel.Verbose,
        "silent" => Silent,
        _ => throw new InvalidOperationException(
            "Invalid environment configuration: LOG_LEVEL must be one of fatal, error, warn, info, debug, trace, silent"),
    };
}
