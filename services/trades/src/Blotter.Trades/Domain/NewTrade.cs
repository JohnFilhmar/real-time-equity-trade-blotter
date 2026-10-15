using Blotter.Contracts.Wire;

namespace Blotter.Trades.Domain;

/// <summary>
/// A ticket ready to store. Neither the trader nor the currency comes from the client: the trader is
/// the caller's desk code and the currency belongs to the instrument.
/// </summary>
/// <param name="Symbol">Ticker from the universe.</param>
/// <param name="Side">Buy or sell.</param>
/// <param name="Quantity">Share count.</param>
/// <param name="Price">Exact price, at most six decimal places.</param>
/// <param name="Currency">The instrument's quote currency.</param>
/// <param name="Trader">The booking desk code.</param>
/// <param name="Book">Book, already trimmed.</param>
/// <param name="Counterparty">Counterparty, already trimmed.</param>
/// <param name="TradeTimestamp">Execution time, truncated to the millisecond.</param>
internal sealed record NewTrade(
    string Symbol,
    TradeSide Side,
    int Quantity,
    decimal Price,
    Currency Currency,
    string Trader,
    string Book,
    string Counterparty,
    DateTimeOffset TradeTimestamp);
