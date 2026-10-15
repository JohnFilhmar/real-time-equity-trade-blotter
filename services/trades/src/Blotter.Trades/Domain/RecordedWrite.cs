using Blotter.Contracts.Wire;

namespace Blotter.Trades.Domain;

/// <summary>An amendment or cancellation as committed: the trade after it and the audit row written with it.</summary>
/// <param name="Trade">The trade after the write.</param>
/// <param name="Event">The audit row, committed in the same transaction.</param>
internal sealed record RecordedWrite(Trade Trade, TradeEvent Event);
