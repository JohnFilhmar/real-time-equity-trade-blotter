namespace Blotter.Trades.Data;

/// <summary>
/// A change waiting to be published, written in the same transaction as the trade it describes, so a
/// committed write is never lost between the database and the broker. The dispatcher publishes rows
/// in id order and stamps <see cref="PublishedAt"/>.
/// </summary>
internal sealed class OutboxRow
{
    /// <summary>Identity, which is also the publishing order.</summary>
    public long Id { get; set; }

    /// <summary>An <c>OutboxPayload</c> as JSON: the change's kind, the trade, and the event when there is one.</summary>
    public string Payload { get; set; } = "{}";

    /// <summary>When the change committed.</summary>
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>When the broker confirmed the message. Null until then.</summary>
    public DateTimeOffset? PublishedAt { get; set; }
}
