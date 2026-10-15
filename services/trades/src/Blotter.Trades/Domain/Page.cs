namespace Blotter.Trades.Domain;

/// <summary>A window of rows, the count of everything matching the same filters, and where the next window starts.</summary>
/// <typeparam name="T">The row type.</typeparam>
/// <param name="Data">The rows in the window, already in wire shape.</param>
/// <param name="Total">How many rows match, ignoring the window.</param>
/// <param name="NextCursor">Cursor for the next page, or null when this window came back short.</param>
internal sealed record Page<T>(IReadOnlyList<T> Data, int Total, string? NextCursor);
