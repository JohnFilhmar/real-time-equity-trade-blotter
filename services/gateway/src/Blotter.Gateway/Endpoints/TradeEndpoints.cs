using Blotter.Contracts.Grpc;
using Blotter.Contracts.Reference;
using Blotter.Gateway.Http;
using Blotter.Gateway.Validation;
using Blotter.Gateway.Wire;
using Google.Protobuf.WellKnownTypes;
using Microsoft.AspNetCore.Mvc;
using Proto = Blotter.Contracts.Grpc;

namespace Blotter.Gateway.Endpoints;

/// <summary>
/// The trade and position routes, unchanged from the Node API. Each handler checks its permission,
/// parses its input with the shared rules, calls the trades service, and answers in the wire shape.
/// No business rule lives here: refusals from the trades service become problems in the middleware.
/// </summary>
internal static class TradeEndpoints
{
    /// <summary>Maps the trade and position routes.</summary>
    /// <param name="api">The <c>/api/v1</c> group.</param>
    /// <returns>The group.</returns>
    public static RouteGroupBuilder MapTradeEndpoints(this RouteGroupBuilder api)
    {
        var trades = api.MapGroup("/trades");
        var write = new RateLimitTierAttribute(RateLimitTier.Write);

        trades.MapGet("/", List).RequirePermission(Permissions.TradeRead);
        trades.MapGet("/events", Events).RequirePermission(Permissions.TradeRead);
        trades.MapGet("/{trade_id}", Get).RequirePermission(Permissions.TradeRead);
        trades.MapGet("/{trade_id}/events", History).RequirePermission(Permissions.TradeRead);
        trades.MapPost("/", Create).RequirePermission(Permissions.TradeCreate).WithMetadata(write);
        trades.MapPatch("/{trade_id}", Amend).RequirePermission(Permissions.TradeAmend).WithMetadata(write);
        trades.MapPost("/{trade_id}/cancel", Cancel).RequirePermission(Permissions.TradeCancel).WithMetadata(write);
        api.MapGet("/positions", Positions).RequirePermission(Permissions.TradeRead);

        return api;
    }

    private static async Task<IResult> List(HttpContext http, Proto.Trades.TradesClient trades, TradeQueryValidator validator)
    {
        var query = QueryInput.From(http.Request.Query);
        validator.Ensure(query);

        var request = RequestMapping.ToList(query);
        var page = await trades.ListTradesAsync(request);
        return Results.Json(new PageEnvelope<Contracts.Wire.Trade>(
            [.. page.Data.Select(trade => trade.ToWire())],
            page.Total,
            request.Limit,
            Blank(page.NextCursor)));
    }

    private static async Task<IResult> Events(HttpContext http, Proto.Trades.TradesClient trades, EventQueryValidator validator)
    {
        var query = QueryInput.From(http.Request.Query);
        validator.Ensure(query);

        var request = RequestMapping.ToEvents(query);
        var page = await trades.ListEventsAsync(request);
        return Results.Json(new PageEnvelope<Contracts.Wire.TradeEvent>(
            [.. page.Data.Select(tradeEvent => tradeEvent.ToWire())],
            page.Total,
            request.Limit,
            Blank(page.NextCursor)));
    }

    private static async Task<IResult> Get([FromRoute(Name = "trade_id")] string tradeId, Proto.Trades.TradesClient trades, TradeIdValidator validator)
    {
        validator.Ensure(tradeId);
        return Results.Json((await trades.GetTradeAsync(new TradeRef { TradeId = tradeId })).ToWire());
    }

    private static async Task<IResult> History([FromRoute(Name = "trade_id")] string tradeId, Proto.Trades.TradesClient trades, TradeIdValidator validator)
    {
        validator.Ensure(tradeId);
        var history = await trades.ListTradeHistoryAsync(new TradeRef { TradeId = tradeId });
        return Results.Json(history.Data.Select(tradeEvent => tradeEvent.ToWire()).ToList());
    }

    private static async Task<IResult> Create(HttpContext http, Proto.Trades.TradesClient trades, CreateTradeValidator validator)
    {
        var body = await JsonBodies.ReadAsync(http.Request);
        validator.Ensure(body);

        var created = await trades.CreateTradeAsync(RequestMapping.ToCreate(body));
        return Results.Json(created.ToWire(), statusCode: StatusCodes.Status201Created);
    }

    private static async Task<IResult> Amend(
        [FromRoute(Name = "trade_id")] string tradeId,
        HttpContext http,
        Proto.Trades.TradesClient trades,
        TradeIdValidator ids,
        AmendTradeValidator validator)
    {
        ids.Ensure(tradeId);
        var body = await JsonBodies.ReadAsync(http.Request);
        validator.Ensure(body);

        return Results.Json((await trades.AmendTradeAsync(RequestMapping.ToAmend(tradeId, body))).ToWire());
    }

    private static async Task<IResult> Cancel(
        [FromRoute(Name = "trade_id")] string tradeId,
        HttpContext http,
        Proto.Trades.TradesClient trades,
        TradeIdValidator ids,
        CancelTradeValidator validator)
    {
        ids.Ensure(tradeId);
        var body = await JsonBodies.ReadAsync(http.Request);
        if (body.Root is null)
        {
            body = JsonBody.EmptyObject;
        }

        validator.Ensure(body);
        return Results.Json((await trades.CancelTradeAsync(RequestMapping.ToCancel(tradeId, body))).ToWire());
    }

    private static async Task<IResult> Positions(Proto.Trades.TradesClient trades)
    {
        var positions = await trades.ListPositionsAsync(new Empty());
        return Results.Json(positions.Data.Select(position => position.ToWire()).ToList());
    }

    private static string? Blank(string cursor) => cursor.Length == 0 ? null : cursor;
}
