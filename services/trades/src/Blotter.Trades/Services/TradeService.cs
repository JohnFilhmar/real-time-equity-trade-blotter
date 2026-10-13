using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;
using Blotter.Trades.Domain;
using Blotter.Trades.Outbox;
using Blotter.Trades.Repositories;

namespace Blotter.Trades.Services;

/// <summary>
/// The trade rules: what a trade may become, who may change it, and the desk limit. Every write goes
/// through here, the gRPC API and the simulated desk alike, so the rules exist in one place. Reads are
/// in <c>TradeService.Reads.cs</c>.
/// </summary>
/// <param name="repository">Persistence.</param>
/// <param name="limits">The per-currency desk limits.</param>
/// <param name="outbox">Wakes the dispatcher after a commit.</param>
internal sealed partial class TradeService(TradeRepository repository, NotionalLimits limits, OutboxSignal outbox)
{
    /// <summary>Books a trade under the actor's desk code, in the instrument's currency.</summary>
    /// <param name="ticket">The validated ticket.</param>
    /// <param name="actor">Who is booking.</param>
    /// <param name="cancellationToken">Cancels the write.</param>
    /// <returns>The stored trade, ACTIVE at version 1.</returns>
    /// <exception cref="TradeRuleViolation">Invalid when the notional is over the desk limit.</exception>
    public async Task<Trade> CreateAsync(TradeTicket ticket, TradeActor actor, CancellationToken cancellationToken)
    {
        // The symbol was validated against this same list, so a miss is a programming error.
        var instrument = Instruments.Find(ticket.Symbol)
            ?? throw new InvalidOperationException($"symbol {ticket.Symbol} is not in the instrument universe");

        limits.Enforce(ticket.Quantity, ticket.Price, instrument.Currency);

        var trade = await repository.CreateAsync(
            new NewTrade(
                ticket.Symbol,
                ticket.Side,
                ticket.Quantity,
                ticket.Price,
                instrument.Currency,
                actor.TraderCode,
                ticket.Book,
                ticket.Counterparty,
                ticket.TradeTimestamp),
            cancellationToken);

        outbox.Notify();
        return trade;
    }

    /// <summary>Amends an active trade, provided the caller's version is still current.</summary>
    /// <param name="tradeId">The trade to amend.</param>
    /// <param name="expectedVersion">The version the caller last saw.</param>
    /// <param name="changes">The fields to change. At least one must be given.</param>
    /// <param name="actor">Who is amending.</param>
    /// <param name="cancellationToken">Cancels the write.</param>
    /// <returns>The amended trade, one version higher.</returns>
    /// <exception cref="TradeRuleViolation">
    /// Invalid when no field was given or the new notional breaches the limit, Forbidden on someone
    /// else's trade without <c>trade.amend.any</c>, NotFound, or Conflict when cancelled or moved on.
    /// </exception>
    public async Task<Trade> AmendAsync(
        string tradeId,
        int expectedVersion,
        TradeChanges changes,
        TradeActor actor,
        CancellationToken cancellationToken)
    {
        if (changes.IsEmpty)
        {
            throw TradeRuleViolation.Invalid(TradeRules.Messages.AmendmentEmpty);
        }

        var current = await GetAsync(tradeId, cancellationToken);
        EnforceOwnership(current, actor, Permissions.TradeAmendAny, "amend");
        limits.Enforce(changes.Quantity ?? current.Quantity, changes.Price ?? current.Price, current.Currency);

        var written = await repository.AmendAsync(tradeId, expectedVersion, changes, actor, cancellationToken)
            ?? throw await ExplainFailedWriteAsync(tradeId, "amended", cancellationToken);

        outbox.Notify();
        return written.Trade;
    }

    /// <summary>Cancels an active trade.</summary>
    /// <param name="tradeId">The trade to cancel.</param>
    /// <param name="expectedVersion">Optional version guard from the caller.</param>
    /// <param name="actor">Who is cancelling.</param>
    /// <param name="cancellationToken">Cancels the write.</param>
    /// <returns>The cancelled trade.</returns>
    /// <exception cref="TradeRuleViolation">
    /// Forbidden on someone else's trade without <c>trade.cancel.any</c>, NotFound, or Conflict when
    /// already cancelled or moved past the guard.
    /// </exception>
    public async Task<Trade> CancelAsync(
        string tradeId,
        int? expectedVersion,
        TradeActor actor,
        CancellationToken cancellationToken)
    {
        var current = await GetAsync(tradeId, cancellationToken);
        EnforceOwnership(current, actor, Permissions.TradeCancelAny, "cancel");

        var written = await repository.CancelAsync(tradeId, expectedVersion, actor, cancellationToken)
            ?? throw await ExplainFailedWriteAsync(tradeId, "cancelled", cancellationToken);

        outbox.Notify();
        return written.Trade;
    }

    /// <summary>
    /// Refuses to let one trader act on another's trade without the elevated permission. This is the
    /// check a route cannot make, because it depends on the row rather than the request.
    /// </summary>
    private static void EnforceOwnership(Trade trade, TradeActor actor, string elevated, string verb)
    {
        if (trade.Trader == actor.TraderCode || RolePermissions.Has(actor.Role, elevated))
        {
            return;
        }

        throw TradeRuleViolation.Forbidden($"Only {trade.Trader} or an administrator can {verb} this trade");
    }

    /// <summary>Works out why a conditional write matched nothing: gone, cancelled, or moved on.</summary>
    private async Task<TradeRuleViolation> ExplainFailedWriteAsync(string tradeId, string action, CancellationToken cancellationToken)
    {
        var current = await repository.FindAsync(tradeId, cancellationToken);

        if (current is null)
        {
            return TradeRuleViolation.NotFound(tradeId);
        }

        return current.Status == TradeStatus.Cancelled
            ? TradeRuleViolation.Conflict($"Trade {tradeId} is cancelled and can no longer be {action}")
            : TradeRuleViolation.Conflict(
                $"Trade {tradeId} has changed since you loaded it. It is now at version {current.Version}. Reload and try again.");
    }
}
