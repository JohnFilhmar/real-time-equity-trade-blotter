using Blotter.Contracts.Grpc;
using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;
using Blotter.ServiceDefaults.Auth;
using Blotter.Trades.Domain;
using Blotter.Trades.Services;
using FluentValidation;
using Google.Protobuf.WellKnownTypes;
using Grpc.Core;
using Proto = Blotter.Contracts.Grpc;

namespace Blotter.Trades.Api;

/// <summary>
/// The gRPC face of the trade rules. Each handler checks the caller's permission from their verified
/// token, validates the request, calls <see cref="TradeService"/>, and converts the result. Business
/// rules live in the service; refusals become statuses in <see cref="TradeRuleInterceptor"/>.
/// </summary>
/// <param name="trades">The trade rules.</param>
/// <param name="validators">Resolves the validator for each request type.</param>
internal sealed class TradesGrpcService(TradeService trades, IServiceProvider validators) : Proto.Trades.TradesBase
{
    /// <inheritdoc />
    public override async Task<TradePage> ListTrades(ListTradesRequest request, ServerCallContext context)
    {
        Authorize(context, Permissions.TradeRead);
        await ValidateAsync(request, context);

        var page = await trades.ListAsync(RequestMapping.ToQuery(request), context.CancellationToken);
        var reply = new TradePage { Total = page.Total, Limit = request.Limit, NextCursor = page.NextCursor ?? string.Empty };
        reply.Data.AddRange(page.Data.Select(trade => trade.ToProto()));
        return reply;
    }

    /// <inheritdoc />
    public override async Task<Proto.Trade> GetTrade(TradeRef request, ServerCallContext context)
    {
        Authorize(context, Permissions.TradeRead);
        await ValidateAsync(request, context);

        return (await trades.GetAsync(request.TradeId, context.CancellationToken)).ToProto();
    }

    /// <inheritdoc />
    public override async Task<Proto.Trade> CreateTrade(CreateTradeRequest request, ServerCallContext context)
    {
        var actor = Authorize(context, Permissions.TradeCreate);
        await ValidateAsync(request, context);

        return (await trades.CreateAsync(RequestMapping.ToTicket(request), actor, context.CancellationToken)).ToProto();
    }

    /// <inheritdoc />
    public override async Task<Proto.Trade> AmendTrade(AmendTradeRequest request, ServerCallContext context)
    {
        var actor = Authorize(context, Permissions.TradeAmend);
        await ValidateAsync(request, context);

        var amended = await trades.AmendAsync(
            request.TradeId,
            request.Version,
            RequestMapping.ToChanges(request),
            actor,
            context.CancellationToken);
        return amended.ToProto();
    }

    /// <inheritdoc />
    public override async Task<Proto.Trade> CancelTrade(CancelTradeRequest request, ServerCallContext context)
    {
        var actor = Authorize(context, Permissions.TradeCancel);
        await ValidateAsync(request, context);

        var cancelled = await trades.CancelAsync(
            request.TradeId,
            request.HasVersion ? request.Version : null,
            actor,
            context.CancellationToken);
        return cancelled.ToProto();
    }

    /// <inheritdoc />
    public override async Task<TradeEventList> ListTradeHistory(TradeRef request, ServerCallContext context)
    {
        Authorize(context, Permissions.TradeRead);
        await ValidateAsync(request, context);

        var reply = new TradeEventList();
        reply.Data.AddRange((await trades.ListHistoryAsync(request.TradeId, context.CancellationToken)).Select(tradeEvent => tradeEvent.ToProto()));
        return reply;
    }

    /// <inheritdoc />
    public override async Task<TradeEventPage> ListEvents(ListEventsRequest request, ServerCallContext context)
    {
        Authorize(context, Permissions.TradeRead);
        await ValidateAsync(request, context);

        var page = await trades.ListEventsAsync(request.Limit, PageCursor.Decode(request.Cursor), context.CancellationToken);
        var reply = new TradeEventPage { Total = page.Total, Limit = request.Limit, NextCursor = page.NextCursor ?? string.Empty };
        reply.Data.AddRange(page.Data.Select(tradeEvent => tradeEvent.ToProto()));
        return reply;
    }

    /// <inheritdoc />
    public override async Task<PositionList> ListPositions(Empty request, ServerCallContext context)
    {
        Authorize(context, Permissions.TradeRead);

        var reply = new PositionList();
        reply.Data.AddRange((await trades.ListPositionsAsync(context.CancellationToken)).Select(position => position.ToProto()));
        return reply;
    }

    /// <summary>
    /// Reads the caller from their verified access token and checks one permission. The gateway made
    /// the same check; this one holds for any other caller that reaches the internal port.
    /// </summary>
    private static TradeActor Authorize(ServerCallContext context, string permission)
    {
        var claims = AccessClaims.From(context.GetHttpContext().User)
            ?? throw new RpcException(new Grpc.Core.Status(StatusCode.Unauthenticated, "Authentication is required"));

        if (!claims.Can(permission))
        {
            throw TradeRuleViolation.Forbidden($"This action requires the {permission} permission");
        }

        return new TradeActor(claims.TraderCode, claims.Role, TradeEventSource.Api);
    }

    private Task ValidateAsync<TRequest>(TRequest request, ServerCallContext context) =>
        validators.GetRequiredService<IValidator<TRequest>>().ValidateAndThrowAsync(request, context.CancellationToken);
}
