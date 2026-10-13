namespace Blotter.Trades.Domain;

/// <summary>Millisecond timestamps, the precision of every <c>datetimeoffset(3)</c> column.</summary>
internal static class Timestamps
{
    /// <summary>
    /// Drops everything below the millisecond. SQL Server would round instead, so truncating before
    /// the write keeps the value returned from a write identical to the value read back later.
    /// </summary>
    /// <param name="value">Any instant.</param>
    /// <returns>The same instant in UTC, truncated to the millisecond.</returns>
    public static DateTimeOffset ToMilliseconds(DateTimeOffset value)
    {
        var utc = value.UtcTicks;
        return new DateTimeOffset(utc - (utc % TimeSpan.TicksPerMillisecond), TimeSpan.Zero);
    }

    /// <summary>The current instant, truncated to the millisecond.</summary>
    /// <param name="clock">The clock to read.</param>
    /// <returns>Now, in UTC.</returns>
    public static DateTimeOffset Now(TimeProvider clock) => ToMilliseconds(clock.GetUtcNow());
}
