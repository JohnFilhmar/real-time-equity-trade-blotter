using Microsoft.Extensions.Logging;

namespace Blotter.Trades.Tests.Fixtures;

/// <summary>A logger that keeps what it was given, so a test can assert a failure was reported.</summary>
/// <typeparam name="T">The category.</typeparam>
public sealed class ListLogger<T> : ILogger<T>
{
    /// <summary>Every entry, as level and message.</summary>
    public List<(LogLevel Level, string Message)> Entries { get; } = [];

    /// <inheritdoc />
    public IDisposable? BeginScope<TState>(TState state)
        where TState : notnull => null;

    /// <inheritdoc />
    public bool IsEnabled(LogLevel logLevel) => true;

    /// <inheritdoc />
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        ArgumentNullException.ThrowIfNull(formatter);
        lock (Entries)
        {
            Entries.Add((logLevel, formatter(state, exception)));
        }
    }
}
