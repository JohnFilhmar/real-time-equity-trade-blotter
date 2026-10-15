using System.Globalization;
using Blotter.Contracts.Messages;
using Blotter.Contracts.Wire;
using Blotter.Trades.Data;
using Blotter.Trades.Domain;
using Blotter.Trades.Outbox;
using Microsoft.EntityFrameworkCore;

namespace Blotter.Trades.Repositories;

/// <summary>
/// The write side. Every write runs in one transaction with its audit row and its outbox row, so the
/// trade, its history and what the broker will be told can never disagree. Amendments and
/// cancellations are a conditional update on the version, so two writers cannot both win; a write
/// that matches nothing returns null and the service decides whether that was a 404 or a 409.
/// </summary>
internal sealed partial class TradeRepository
{
    /// <summary>Stores a new trade at version 1, numbering it from the database sequence.</summary>
    /// <param name="ticket">The validated ticket.</param>
    /// <param name="cancellationToken">Cancels the write.</param>
    /// <returns>The stored trade.</returns>
    public async Task<Trade> CreateAsync(NewTrade ticket, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var number = (await db.Database
            .SqlQuery<long>($"SELECT NEXT VALUE FOR [trade_id_seq] AS [Value]")
            .ToListAsync(cancellationToken)).Single();
        var now = Timestamps.Now(clock);

        var row = new TradeRow
        {
            Id = Guid.CreateVersion7(now),
            TradeId = FormatTradeId(number),
            Symbol = ticket.Symbol,
            Side = ticket.Side,
            Quantity = ticket.Quantity,
            Price = ticket.Price,
            Currency = ticket.Currency,
            Trader = ticket.Trader,
            Book = ticket.Book,
            Counterparty = ticket.Counterparty,
            TradeTimestamp = Timestamps.ToMilliseconds(ticket.TradeTimestamp),
            Status = TradeStatus.Active,
            Version = 1,
            CreatedAt = now,
            UpdatedAt = now,
        };

        var trade = RowMapping.ToWire(row);
        db.Trades.Add(row);
        db.Outbox.Add(Pending(new OutboxPayload(TradeChangeKind.Created, trade, null), now));

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return trade;
    }

    /// <summary>Amends an active trade whose version still matches, recording what moved.</summary>
    /// <param name="tradeId">The trade to amend.</param>
    /// <param name="expectedVersion">The version the client last saw.</param>
    /// <param name="changes">The fields to overwrite.</param>
    /// <param name="actor">Who is amending, recorded on the audit row.</param>
    /// <param name="cancellationToken">Cancels the write.</param>
    /// <returns>The amended trade and its audit row, or null when no active trade at that version matched.</returns>
    public async Task<RecordedWrite?> AmendAsync(
        string tradeId,
        int expectedVersion,
        TradeChanges changes,
        TradeActor actor,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var existing = await db.Trades.AsNoTracking().SingleOrDefaultAsync(trade => trade.TradeId == tradeId, cancellationToken);
        if (existing is null || existing.Status != TradeStatus.Active || existing.Version != expectedVersion)
        {
            return null;
        }

        var now = Timestamps.Now(clock);
        var updated = await db.Trades
            .Where(trade => trade.TradeId == tradeId && trade.Version == expectedVersion && trade.Status == TradeStatus.Active)
            .ExecuteUpdateAsync(
                set => set
                    .SetProperty(trade => trade.Quantity, trade => changes.Quantity ?? trade.Quantity)
                    .SetProperty(trade => trade.Price, trade => changes.Price ?? trade.Price)
                    .SetProperty(trade => trade.Book, trade => changes.Book ?? trade.Book)
                    .SetProperty(trade => trade.Version, trade => trade.Version + 1)
                    .SetProperty(trade => trade.UpdatedAt, now),
                cancellationToken);

        // Another writer moved the trade between the read above and this update. The conditional
        // WHERE is what makes that a lost race rather than a lost update.
        if (updated == 0)
        {
            return null;
        }

        var before = RowMapping.ToWire(existing);
        var write = await RecordAsync(
            existing.Id,
            tradeId,
            TradeEventAction.Amended,
            ChangeSets.ForAmendment(before, changes),
            actor,
            now,
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return write;
    }

    /// <summary>Moves an active trade to CANCELLED, recording the transition.</summary>
    /// <param name="tradeId">The trade to cancel.</param>
    /// <param name="expectedVersion">Optional version guard. Null cancels whatever version is current.</param>
    /// <param name="actor">Who is cancelling, recorded on the audit row.</param>
    /// <param name="cancellationToken">Cancels the write.</param>
    /// <returns>The cancelled trade and its audit row, or null when nothing matched.</returns>
    public async Task<RecordedWrite?> CancelAsync(
        string tradeId,
        int? expectedVersion,
        TradeActor actor,
        CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var existing = await db.Trades.AsNoTracking().SingleOrDefaultAsync(trade => trade.TradeId == tradeId, cancellationToken);
        if (existing is null
            || existing.Status != TradeStatus.Active
            || (expectedVersion is { } guard && existing.Version != guard))
        {
            return null;
        }

        var target = db.Trades.Where(trade => trade.TradeId == tradeId && trade.Status == TradeStatus.Active);
        if (expectedVersion is { } version)
        {
            target = target.Where(trade => trade.Version == version);
        }

        var now = Timestamps.Now(clock);
        var updated = await target
            .ExecuteUpdateAsync(
                set => set
                    .SetProperty(trade => trade.Status, TradeStatus.Cancelled)
                    .SetProperty(trade => trade.Version, trade => trade.Version + 1)
                    .SetProperty(trade => trade.UpdatedAt, now),
                cancellationToken);

        if (updated == 0)
        {
            return null;
        }

        var write = await RecordAsync(
            existing.Id,
            tradeId,
            TradeEventAction.Cancelled,
            ChangeSets.ForCancellation(),
            actor,
            now,
            cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        return write;
    }

    /// <summary>Formats a sequence value as a business id, padded to six digits and never truncated.</summary>
    /// <param name="number">The sequence value.</param>
    /// <returns>An id such as <c>TRD-100001</c>.</returns>
    internal static string FormatTradeId(long number) => string.Create(CultureInfo.InvariantCulture, $"TRD-{number:D6}");

    private async Task<RecordedWrite> RecordAsync(
        Guid tradeUuid,
        string tradeId,
        TradeEventAction action,
        Dictionary<string, FieldChange> changes,
        TradeActor actor,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var after = await db.Trades.AsNoTracking().SingleAsync(trade => trade.Id == tradeUuid, cancellationToken);
        var eventRow = new TradeEventRow
        {
            Id = Guid.CreateVersion7(now),
            TradeUuid = tradeUuid,
            Version = after.Version,
            Action = action,
            Source = actor.Source,
            Changes = RowMapping.WriteChanges(changes),
            Actor = actor.TraderCode,
            OccurredAt = now,
        };

        var trade = RowMapping.ToWire(after);
        var tradeEvent = RowMapping.ToWire(eventRow, tradeId);
        var kind = action == TradeEventAction.Cancelled ? TradeChangeKind.Cancelled : TradeChangeKind.Amended;

        db.TradeEvents.Add(eventRow);
        db.Outbox.Add(Pending(new OutboxPayload(kind, trade, tradeEvent), now));
        await db.SaveChangesAsync(cancellationToken);

        return new RecordedWrite(trade, tradeEvent);
    }

    private static OutboxRow Pending(OutboxPayload payload, DateTimeOffset now) =>
        new() { Payload = payload.ToJson(), CreatedAt = now };
}
