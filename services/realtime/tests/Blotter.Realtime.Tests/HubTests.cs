using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Blotter.Contracts.Messages;
using Blotter.Contracts.Wire;
using Blotter.Realtime.Broadcasting;
using Blotter.Realtime.Marks;
using Blotter.Realtime.Settings;
using Blotter.Realtime.Tests.Fixtures;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using StackExchange.Redis;
using Xunit;

namespace Blotter.Realtime.Tests;

/// <summary>
/// The hub contract the frontend depends on, ported from <c>socket_broadcast.test.ts</c>: who may
/// connect, what arrives on connect, and the order, numbering and shape of every broadcast.
/// </summary>
public sealed partial class HubTests(RealtimeInfrastructure infrastructure) : IClassFixture<RealtimeInfrastructure>, IAsyncLifetime
{
    private readonly RealtimeFactory factory = new(infrastructure);

    [Fact]
    public async Task Refuses_a_connection_without_a_valid_token()
    {
        var anonymous = await Assert.ThrowsAsync<HttpRequestException>(() => factory.ConnectAsync(null));
        var forged = await Assert.ThrowsAsync<HttpRequestException>(() =>
            factory.ConnectAsync(RealtimeFactory.Token(secret: "forged-secret-0123456789abcdefghijklmnop")));

        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, forged.StatusCode);
    }

    [Fact]
    public async Task Refuses_a_browser_on_another_origin_and_accepts_one_on_the_allowed_origin()
    {
        using var client = factory.CreateClient();

        var foreign = await Negotiate(client, "https://evil.example", RealtimeFactory.Token());
        var allowed = await Negotiate(client, RealtimeFactory.AllowedOrigin, RealtimeFactory.Token());

        Assert.Equal(HttpStatusCode.Forbidden, foreign.StatusCode);
        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
    }

    [Fact]
    public async Task Reads_the_token_from_the_access_token_query_value_on_the_hub_path()
    {
        using var client = factory.CreateClient();

        var response = await client.PostAsync(
            new Uri($"/hubs/blotter/negotiate?negotiateVersion=1&access_token={RealtimeFactory.Token()}", UriKind.Relative),
            null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Sends_the_current_marks_the_moment_a_client_connects()
    {
        var (connection, received) = await factory.ConnectAsync(RealtimeFactory.Token());
        await using var _ = connection;

        var (name, marks) = await NextAsync(received);

        Assert.Equal("mark.updated", name);
        Assert.Equal(12, marks.EnumerateObject().Count());
        Assert.All(marks.EnumerateObject(), mark => Assert.True(mark.Value.GetDecimal() > 0));
    }

    [Fact]
    public async Task Broadcasts_an_amendment_as_trade_then_audit_row_then_position_with_consecutive_sequence()
    {
        await factory.WaitForConsumerAsync();
        var (connection, received) = await factory.ConnectAsync(RealtimeFactory.Token());
        await using var _ = connection;
        await NextAsync(received);

        await infrastructure.PublishAsync(new TradeChanged(TradeChangeKind.Amended, SampleTrade, SampleEvent, SamplePosition));

        var trade = await NextAsync(received);
        var audit = await NextAsync(received);
        var position = await NextAsync(received);

        Assert.Equal(new[] { "trade.amended", "trade_event.recorded", "position.updated" }, new[] { trade.Name, audit.Name, position.Name });
        var first = trade.Payload.GetProperty("seq").GetInt64();
        Assert.Equal(first + 1, audit.Payload.GetProperty("seq").GetInt64());
        Assert.Equal(first + 2, position.Payload.GetProperty("seq").GetInt64());
        Assert.Matches(IsoMilliseconds(), trade.Payload.GetProperty("emitted_at").GetString()!);
        Assert.Equal("TRD-100042", trade.Payload.GetProperty("trade").GetProperty("tradeId").GetString());
        Assert.Equal(78.12m, trade.Payload.GetProperty("trade").GetProperty("price").GetDecimal());
        Assert.Equal("LIVE_FEED", audit.Payload.GetProperty("event").GetProperty("source").GetString());
        Assert.Equal(-2500, position.Payload.GetProperty("position").GetProperty("netQuantity").GetInt64());
    }

    [Fact]
    public async Task A_booking_carries_no_audit_row_and_a_foreign_message_is_dropped_without_stopping_the_stream()
    {
        await factory.WaitForConsumerAsync();
        var (connection, received) = await factory.ConnectAsync(RealtimeFactory.Token());
        await using var _ = connection;
        await NextAsync(received);

        await infrastructure.PublishAsync(new TradeChanged(TradeChangeKind.Created, SampleTrade, null, SamplePosition), type: "something.else.v1");
        await infrastructure.PublishAsync(new TradeChanged(TradeChangeKind.Created, SampleTrade, null, SamplePosition));

        var trade = await NextAsync(received);
        var position = await NextAsync(received);

        Assert.Equal("trade.created", trade.Name);
        Assert.Equal("position.updated", position.Name);
        Assert.Equal(trade.Payload.GetProperty("seq").GetInt64() + 1, position.Payload.GetProperty("seq").GetInt64());
    }

    [Fact]
    public async Task Only_the_replica_holding_the_lease_moves_and_broadcasts_the_marks()
    {
        var (connection, received) = await factory.ConnectAsync(RealtimeFactory.Token());
        await using var _ = connection;
        var (_, before) = await NextAsync(received);

        var holder = NewMarkFeed();
        var other = NewMarkFeed();
        Assert.True(await holder.TickAsync(default));
        Assert.False(await other.TickAsync(default));

        var (name, after) = await NextAsync(received);
        Assert.Equal("mark.updated", name);
        foreach (var mark in after.EnumerateObject())
        {
            var previous = before.GetProperty(mark.Name).GetDecimal();
            var bound = previous >= 20m ? 0.0011m : 0.0018m;
            Assert.InRange(mark.Value.GetDecimal(), (previous * (1 - bound)) - 0.01m, (previous * (1 + bound)) + 0.01m);
        }

        await factory.Services.GetRequiredService<IConnectionMultiplexer>().GetDatabase().KeyDeleteAsync(MarkFeed.LeaseKey);
    }

    [Fact]
    public async Task Stopping_the_consumer_twice_while_broadcasts_are_in_flight_is_harmless()
    {
        // The test host and Program's own RunAsync both stop the host, so a hosted service can be
        // stopped twice at once. With a broadcast in flight the channel close is slow, which is when
        // a second stop used to dispose the connection underneath the first.
        await factory.WaitForConsumerAsync();
        var (connection, received) = await factory.ConnectAsync(RealtimeFactory.Token());
        await using var _ = connection;
        await NextAsync(received);
        await infrastructure.PublishAsync(new TradeChanged(TradeChangeKind.Amended, SampleTrade, SampleEvent, SamplePosition), copies: 40);
        await NextAsync(received);

        var consumer = factory.Services.GetRequiredService<Messaging.TradeChangeConsumer>();
        await Task.WhenAll(consumer.StopAsync(default), consumer.StopAsync(default));

        Assert.False(consumer.IsConnected);
    }

    [Fact]
    public async Task Readiness_reports_redis_and_the_broker()
    {
        await factory.WaitForConsumerAsync();
        using var client = factory.CreateClient();

        var ready = await client.GetStringAsync(new Uri("/ready", UriKind.Relative));

        Assert.Equal("{\"status\":\"ready\",\"redis\":\"up\",\"broker\":\"up\"}", ready);
    }

    /// <inheritdoc />
    public async ValueTask InitializeAsync() => await infrastructure.ResetConsumerQueueAsync();

    /// <inheritdoc />
    public async ValueTask DisposeAsync() => await factory.DisposeAsync();

    private static readonly Trade SampleTrade = new(
        Guid.Parse("0b8f6f1e-5d2a-7c1b-9a43-1f6f2a9b7c10"), "TRD-100042", "VOD.L", TradeSide.Sell, 2500, 78.12m, Currency.Gbx,
        "JSMITH", "EQUITIES_UK", "Barclays", DateTimeOffset.UtcNow, TradeStatus.Active, 3, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);

    private static readonly TradeEvent SampleEvent = new(
        Guid.Parse("6e1d2c3b-4a59-7e8f-8d7c-6b5a49382716"), "TRD-100042", 3, TradeEventAction.Amended, TradeEventSource.LiveFeed,
        new Dictionary<string, FieldChange> { ["quantity"] = new(ChangeValue.Of(2000m), ChangeValue.Of(2500m)) },
        "MJONES", DateTimeOffset.UtcNow);

    private static readonly Position SamplePosition = new("VOD.L", Currency.Gbx, -2500, 0, 2500, 195_300m, 1, 78.12m, 0m);

    private static async Task<(string Name, JsonElement Payload)> NextAsync(ChannelReader<(string Name, JsonElement Payload)> received)
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        return await received.ReadAsync(timeout.Token);
    }

    private static Task<HttpResponseMessage> Negotiate(HttpClient client, string origin, string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri("/hubs/blotter/negotiate?negotiateVersion=1", UriKind.Relative));
        request.Headers.Add("Origin", origin);
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        return client.SendAsync(request);
    }

    private MarkFeed NewMarkFeed() => new(
        factory.Services.GetRequiredService<MarkStore>(),
        factory.Services.GetRequiredService<TradeBroadcaster>(),
        factory.Services.GetRequiredService<IConnectionMultiplexer>(),
        factory.Services.GetRequiredService<RealtimeSettings>(),
        TimeProvider.System,
        NullLogger<MarkFeed>.Instance);

    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")]
    private static partial Regex IsoMilliseconds();
}
