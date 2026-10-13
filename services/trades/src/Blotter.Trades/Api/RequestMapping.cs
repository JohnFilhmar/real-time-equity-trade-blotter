using Blotter.Contracts.Grpc;
using Blotter.Contracts.Json;
using Blotter.Trades.Domain;
using Proto = Blotter.Contracts.Grpc;

namespace Blotter.Trades.Api;

/// <summary>Turns validated gRPC requests into the domain's inputs. Runs only after the request validators pass.</summary>
internal static class RequestMapping
{
    /// <summary>Builds a blotter query. Empty strings, unspecified enums and unset timestamps mean "any".</summary>
    /// <param name="request">The validated request.</param>
    /// <returns>The query, defaulting to newest execution first.</returns>
    public static TradeQuery ToQuery(Proto.ListTradesRequest request) => new(
        Blank(request.Symbol),
        request.Side == Side.Unspecified ? null : request.Side.ToWire(),
        request.Status == TradeStatus.Unspecified ? null : request.Status.ToWire(),
        Blank(request.Trader),
        Blank(request.Book),
        Blank(request.Counterparty),
        request.DateFrom?.ToDateTimeOffset(),
        request.DateTo?.ToDateTimeOffset(),
        request.SortBy.Length == 0 ? TradeSortColumn.TradeTimestamp : WireNames.Parse<TradeSortColumn>(request.SortBy),
        request.SortDir != SortDirection.Asc,
        request.Limit,
        PageCursor.Decode(request.Cursor));

    /// <summary>Builds a booking ticket, trimming the free-text fields.</summary>
    /// <param name="request">The validated request.</param>
    /// <returns>The ticket.</returns>
    public static TradeTicket ToTicket(Proto.CreateTradeRequest request) => new(
        request.Symbol,
        request.Side.ToWire(),
        request.Quantity,
        ExactDecimal.Parse(request.Price),
        request.Book.Trim(),
        request.Counterparty.Trim(),
        Timestamps.ToMilliseconds(request.TradeTimestamp.ToDateTimeOffset()));

    /// <summary>Builds the change set an amendment asks for. Absent fields stay null.</summary>
    /// <param name="request">The validated request.</param>
    /// <returns>The requested changes.</returns>
    public static TradeChanges ToChanges(Proto.AmendTradeRequest request) => new(
        request.HasQuantity ? request.Quantity : null,
        request.HasPrice ? ExactDecimal.Parse(request.Price) : null,
        request.HasBook ? request.Book.Trim() : null);

    private static string? Blank(string value) => value.Length == 0 ? null : value;
}
