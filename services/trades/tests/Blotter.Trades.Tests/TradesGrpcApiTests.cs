using System.Net;
using Blotter.Contracts.Grpc;
using Blotter.Contracts.Wire;
using Blotter.Trades.Tests.Fixtures;
using Google.Protobuf.WellKnownTypes;
using Google.Rpc;
using Grpc.Core;
using Xunit;

namespace Blotter.Trades.Tests;

/// <summary>
/// The gRPC contract, through the real hosted pipeline: token verification, permission checks,
/// request validation, and the statuses the gateway turns back into HTTP problems.
/// </summary>
public sealed class TradesGrpcApiTests(SqlServerFixture server) : TradesDatabase(server)
{
    private TradesApiFactory? api;

    private TradesApiFactory Api => api ??= new TradesApiFactory(ConnectionString);

    [Fact]
    public async Task A_call_without_a_valid_token_is_unauthenticated()
    {
        var client = Api.Client();

        var anonymous = await Assert.ThrowsAsync<RpcException>(() => client.ListPositionsAsync(new Empty()).ResponseAsync);
        var forged = await Assert.ThrowsAsync<RpcException>(() =>
            client.ListPositionsAsync(new Empty(), TradesApiFactory.Bearer(TestTokens.Access(Role.Admin, secret: "forged-secret-0123456789abcdefghijklmnop"))).ResponseAsync);
        var expired = await Assert.ThrowsAsync<RpcException>(() =>
            client.ListPositionsAsync(new Empty(), TradesApiFactory.Bearer(TestTokens.Access(Role.Admin, lifetime: TimeSpan.FromSeconds(-5)))).ResponseAsync);

        Assert.All(new[] { anonymous, forged, expired }, failure => Assert.Equal(StatusCode.Unauthenticated, failure.StatusCode));
    }

    [Fact]
    public async Task A_viewer_reads_but_cannot_book()
    {
        var client = Api.Client();
        var viewer = TradesApiFactory.Bearer(TestTokens.Access(Role.Viewer, "VIEWER"));

        await client.ListPositionsAsync(new Empty(), viewer);
        var refused = await Assert.ThrowsAsync<RpcException>(() => client.CreateTradeAsync(ATicketRequest(), viewer).ResponseAsync);

        Assert.Equal(StatusCode.PermissionDenied, refused.StatusCode);
        Assert.Equal("This action requires the trade.create permission", refused.Status.Detail);
    }

    [Fact]
    public async Task Books_under_the_callers_desk_code_and_reads_it_back_exactly()
    {
        var client = Api.Client();
        var trader = TradesApiFactory.Bearer(TestTokens.Access(Role.Trader, "ABROWN"));

        var created = (await client.CreateTradeAsync(ATicketRequest(price: "227.123456"), trader)).ToWire();
        var read = (await client.GetTradeAsync(new TradeRef { TradeId = created.TradeId }, trader)).ToWire();

        Assert.Equal("ABROWN", created.Trader);
        Assert.Equal(Contracts.Wire.Currency.Usd, created.Currency);
        Assert.Equal(227.123456m, read.Price);
        Assert.Equal(created, read);
    }

    [Fact]
    public async Task Invalid_requests_come_back_as_invalid_argument_with_every_field_error()
    {
        var client = Api.Client();
        var trader = TradesApiFactory.Bearer(TestTokens.Access(Role.Trader));
        var request = ATicketRequest();
        request.Symbol = "NOPE";
        request.Quantity = 0;
        request.Book = "   ";

        var failure = await Assert.ThrowsAsync<RpcException>(() => client.CreateTradeAsync(request, trader).ResponseAsync);
        var fields = FieldViolations(failure);

        Assert.Equal(StatusCode.InvalidArgument, failure.StatusCode);
        Assert.Equal("One or more fields failed validation.", failure.Status.Detail);
        Assert.Equal("Choose a symbol from the list", fields["symbol"]);
        Assert.Equal("Quantity must be a whole number above zero", fields["quantity"]);
        Assert.Equal("Enter a book", fields["book"]);
    }

    [Fact]
    public async Task Rule_violations_map_to_not_found_aborted_and_invalid_argument()
    {
        var client = Api.Client();
        var trader = TradesApiFactory.Bearer(TestTokens.Access(Role.Trader));
        var created = await client.CreateTradeAsync(ATicketRequest(), trader);
        await client.AmendTradeAsync(new AmendTradeRequest { TradeId = created.TradeId, Version = 1, Quantity = 200 }, trader);

        var missing = await Assert.ThrowsAsync<RpcException>(() => client.GetTradeAsync(new TradeRef { TradeId = "TRD-999999" }, trader).ResponseAsync);
        var stale = await Assert.ThrowsAsync<RpcException>(() =>
            client.AmendTradeAsync(new AmendTradeRequest { TradeId = created.TradeId, Version = 1, Quantity = 300 }, trader).ResponseAsync);
        var limit = await Assert.ThrowsAsync<RpcException>(() =>
            client.CreateTradeAsync(ATicketRequest(quantity: 250_000, price: "250"), trader).ResponseAsync);

        Assert.Equal(StatusCode.NotFound, missing.StatusCode);
        Assert.Equal(StatusCode.Aborted, stale.StatusCode);
        Assert.Contains("now at version 2", stale.Status.Detail, StringComparison.Ordinal);
        Assert.Equal(StatusCode.InvalidArgument, limit.StatusCode);
        Assert.Equal("This trade is worth $62,500,000, over the $50,000,000 limit for US names.", limit.Status.Detail);
        Assert.Equal("This trade is over the desk limit. Lower the quantity or price.", FieldViolations(limit)["quantity"]);
    }

    [Fact]
    public async Task A_malformed_trade_id_is_refused_under_trade_id()
    {
        var client = Api.Client();
        var trader = TradesApiFactory.Bearer(TestTokens.Access(Role.Trader));

        var failure = await Assert.ThrowsAsync<RpcException>(() => client.GetTradeAsync(new TradeRef { TradeId = "trd-1" }, trader).ResponseAsync);

        Assert.Equal("trade id must look like TRD-100001", FieldViolations(failure)["trade_id"]);
    }

    [Fact]
    public async Task Lists_pages_history_events_and_positions_over_grpc()
    {
        var client = Api.Client();
        var admin = TradesApiFactory.Bearer(TestTokens.Access(Role.Admin, "MJONES"));
        var first = await client.CreateTradeAsync(ATicketRequest(), admin);
        await client.CreateTradeAsync(ATicketRequest(symbol: "MSFT"), admin);
        await client.CancelTradeAsync(new CancelTradeRequest { TradeId = first.TradeId }, admin);

        var page = await client.ListTradesAsync(new ListTradesRequest { Limit = 1, SortBy = "symbol", SortDir = SortDirection.Asc }, admin);
        var next = await client.ListTradesAsync(new ListTradesRequest { Limit = 1, SortBy = "symbol", SortDir = SortDirection.Asc, Cursor = page.NextCursor }, admin);
        var history = await client.ListTradeHistoryAsync(new TradeRef { TradeId = first.TradeId }, admin);
        var events = await client.ListEventsAsync(new ListEventsRequest { Limit = 10 }, admin);
        var positions = await client.ListPositionsAsync(new Empty(), admin);

        Assert.Equal(2, page.Total);
        Assert.Equal("AAPL", Assert.Single(page.Data).Symbol);
        Assert.Equal("MSFT", Assert.Single(next.Data).Symbol);
        Assert.Equal(EventAction.Cancelled, Assert.Single(history.Data).Action);
        Assert.Equal("CANCELLED", Assert.Single(history.Data).Changes["status"].To.Text);
        Assert.Equal(1, events.Total);
        Assert.Equal("MSFT", Assert.Single(positions.Data).Symbol);
    }

    [Fact]
    public async Task Health_and_readiness_answer_in_the_node_apis_shapes()
    {
        using var http = Api.CreateClient();

        var health = await http.GetAsync(new Uri("/health", UriKind.Relative));
        var ready = await http.GetStringAsync(new Uri("/ready", UriKind.Relative));

        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        Assert.StartsWith("{\"status\":\"ok\",\"uptime_seconds\":", await health.Content.ReadAsStringAsync(), StringComparison.Ordinal);
        Assert.Equal("{\"status\":\"ready\",\"database\":\"up\"}", ready);
        Assert.Equal("nosniff", health.Headers.GetValues("X-Content-Type-Options").Single());
    }

    /// <inheritdoc />
    public override async ValueTask DisposeAsync()
    {
        if (api is not null)
        {
            await api.DisposeAsync();
        }

        await base.DisposeAsync();
    }

    private static CreateTradeRequest ATicketRequest(string symbol = "AAPL", int quantity = 5000, string price = "227.45") => new()
    {
        Symbol = symbol,
        Side = Side.Buy,
        Quantity = quantity,
        Price = price,
        Book = "EQUITIES_US",
        Counterparty = "Goldman Sachs",
        TradeTimestamp = Timestamp.FromDateTimeOffset(new DateTimeOffset(2026, 8, 18, 9, 15, 23, TimeSpan.Zero)),
    };

    private static Dictionary<string, string> FieldViolations(RpcException failure) =>
        failure.GetRpcStatus()?.GetDetail<BadRequest>()?.FieldViolations.ToDictionary(violation => violation.Field, violation => violation.Description)
            ?? [];
}
