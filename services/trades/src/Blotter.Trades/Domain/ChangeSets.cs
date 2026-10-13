using Blotter.Contracts.Wire;

namespace Blotter.Trades.Domain;

/// <summary>Works out what an audit row records, from <c>backend/src/lib/audit/build_change_set.ts</c>.</summary>
internal static class ChangeSets
{
    /// <summary>
    /// Records only the fields that really moved. A client may resend a field at the value it already
    /// holds, so the request is not the change: an amendment that moved one field records one field.
    /// The keys come in the order Postgres JSONB kept them, shorter key first (book, price, quantity),
    /// because the history panel shows them in the order they arrive.
    /// </summary>
    /// <param name="before">The trade before the amendment.</param>
    /// <param name="changes">The fields the client asked to change.</param>
    /// <returns>Each moved field with both values, keyed by wire name. Empty when nothing moved.</returns>
    public static Dictionary<string, FieldChange> ForAmendment(Trade before, TradeChanges changes)
    {
        var moved = new Dictionary<string, FieldChange>(StringComparer.Ordinal);

        if (changes.Book is { } book && !string.Equals(book, before.Book, StringComparison.Ordinal))
        {
            moved["book"] = new FieldChange(ChangeValue.Of(before.Book), ChangeValue.Of(book));
        }

        if (changes.Price is { } price && price != before.Price)
        {
            moved["price"] = new FieldChange(ChangeValue.Of(before.Price), ChangeValue.Of(price));
        }

        if (changes.Quantity is { } quantity && quantity != before.Quantity)
        {
            moved["quantity"] = new FieldChange(ChangeValue.Of(before.Quantity), ChangeValue.Of(quantity));
        }

        return moved;
    }

    /// <summary>A cancellation, recorded as a status transition in the same shape as any other movement.</summary>
    /// <returns><c>{"status":{"from":"ACTIVE","to":"CANCELLED"}}</c>.</returns>
    public static Dictionary<string, FieldChange> ForCancellation() => new(StringComparer.Ordinal)
    {
        ["status"] = new FieldChange(ChangeValue.Of("ACTIVE"), ChangeValue.Of("CANCELLED")),
    };
}
