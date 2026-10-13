namespace Blotter.Trades.Domain;

/// <summary>
/// The fields an amendment may move: quantity, price and book. Symbol, side, counterparty and the
/// execution time are fixed, because changing any of them is a rebooking, not a correction.
/// </summary>
/// <param name="Quantity">New share count, or null to leave it.</param>
/// <param name="Price">New exact price, or null to leave it.</param>
/// <param name="Book">New book, or null to leave it.</param>
internal sealed record TradeChanges(int? Quantity, decimal? Price, string? Book)
{
    /// <summary>True when the amendment names no field at all.</summary>
    public bool IsEmpty => Quantity is null && Price is null && Book is null;
}
