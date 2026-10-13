using Blotter.Contracts.Wire;

namespace Blotter.Trades.Data;

/// <summary>A row of the <c>trade</c> table. Converted to the wire record by <see cref="RowMapping"/>.</summary>
internal sealed class TradeRow
{
    /// <summary>Row uuid, an RFC 9562 version 7 value so the frontend's strict uuid check accepts it.</summary>
    public Guid Id { get; set; }

    /// <summary>Business identifier from <c>trade_id_seq</c>, such as <c>TRD-100001</c>.</summary>
    public string TradeId { get; set; } = string.Empty;

    /// <summary>Ticker from the instrument universe.</summary>
    public string Symbol { get; set; } = string.Empty;

    /// <summary>Buy or sell, stored as its wire name.</summary>
    public TradeSide Side { get; set; }

    /// <summary>Share count.</summary>
    public int Quantity { get; set; }

    /// <summary>Exact price, <c>decimal(18,6)</c>.</summary>
    public decimal Price { get; set; }

    /// <summary>The instrument's quote currency.</summary>
    public Currency Currency { get; set; }

    /// <summary>Desk code of whoever booked the trade.</summary>
    public string Trader { get; set; } = string.Empty;

    /// <summary>Desk book.</summary>
    public string Book { get; set; } = string.Empty;

    /// <summary>Who the desk traded with.</summary>
    public string Counterparty { get; set; } = string.Empty;

    /// <summary>When the trade executed, to the millisecond.</summary>
    public DateTimeOffset TradeTimestamp { get; set; }

    /// <summary>Active or cancelled.</summary>
    public TradeStatus Status { get; set; }

    /// <summary>Optimistic concurrency counter. Every write is conditional on it.</summary>
    public int Version { get; set; }

    /// <summary>When the row was written.</summary>
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>When the row last changed.</summary>
    public DateTimeOffset UpdatedAt { get; set; }
}
