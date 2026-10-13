using Blotter.Contracts.Wire;

namespace Blotter.Trades.Domain;

/// <summary>A validated booking request. The trader and currency are added by the service, never sent.</summary>
/// <param name="Symbol">Ticker from the universe.</param>
/// <param name="Side">Buy or sell.</param>
/// <param name="Quantity">Share count, 1 to 10,000,000.</param>
/// <param name="Price">Exact price, above zero, at most 10,000,000 and six decimal places.</param>
/// <param name="Book">Book, trimmed, 1 to 64 characters.</param>
/// <param name="Counterparty">Counterparty, trimmed, 1 to 128 characters.</param>
/// <param name="TradeTimestamp">Execution time, no more than a minute ahead of the server clock.</param>
internal sealed record TradeTicket(
    string Symbol,
    TradeSide Side,
    int Quantity,
    decimal Price,
    string Book,
    string Counterparty,
    DateTimeOffset TradeTimestamp);
