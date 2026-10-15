using System.Net;
using Blotter.Gateway.Tests.Fixtures;
using Blotter.Gateway.Validation;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>The blotter's list route, ported from <c>GET /api/v1/trades</c> in the Node route tests. A fresh system per test.</summary>
/// <param name="sql">The shared SQL Server.</param>
/// <param name="redis">The shared Redis.</param>
public sealed class TradeListTests(SqlServerFixture sql, RedisFixture redis) : GatewayEnvironment(sql, redis)
{
    private static readonly string Jsmith = TestTokens.For("JSMITH");

    /// <summary>Every column the grid sorts on.</summary>
    /// <returns>The columns.</returns>
    public static TheoryData<string> SortColumns() => [.. TradeQueryValidator.SortColumns];

    [Fact]
    public async Task It_returns_an_envelope_carrying_the_page_the_total_and_the_next_cursor()
    {
        await BookAsync(Jsmith);
        await BookAsync(Jsmith);

        using var response = await SendAsync(HttpMethod.Get, "/api/v1/trades", Jsmith);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await response.ReadAsync();
        Assert.Equal(2, page.GetProperty("data").GetArrayLength());
        Assert.Equal(2, page.GetProperty("total").GetInt32());
        Assert.Equal(100, page.GetProperty("limit").GetInt32());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, page.GetProperty("next_cursor").ValueKind);
    }

    [Fact]
    public async Task It_hands_back_a_cursor_that_fetches_the_rest_without_overlap()
    {
        for (var trade = 0; trade < 3; trade++)
        {
            await BookAsync(Jsmith);
        }

        using var first = await SendAsync(HttpMethod.Get, "/api/v1/trades?limit=2", Jsmith);
        var firstPage = await first.ReadAsync();
        using var second = await SendAsync(HttpMethod.Get, $"/api/v1/trades?limit=2&cursor={firstPage.Text("next_cursor")}", Jsmith);
        var secondPage = await second.ReadAsync();

        var firstIds = TradeIds(firstPage);
        var secondIds = TradeIds(secondPage);
        Assert.Equal(2, firstIds.Count);
        Assert.Single(secondIds);
        Assert.Empty(secondIds.Intersect(firstIds));
    }

    [Theory]
    [MemberData(nameof(SortColumns))]
    public async Task It_accepts_every_sort_column_the_grid_offers(string column)
    {
        await BookAsync(Jsmith);

        using var response = await SendAsync(HttpMethod.Get, $"/api/v1/trades?sort_by={column}", Jsmith);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task It_rejects_a_query_parameter_outside_its_allowed_range()
    {
        using var response = await SendAsync(HttpMethod.Get, "/api/v1/trades?limit=5000", Jsmith);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await response.ReadAsync();
        Assert.Equal("validation_failed", problem.Text("code"));
        Assert.Equal("One or more fields failed validation.", problem.Text("detail"));
        Assert.Equal([("limit", "Page size must be a whole number from 1 to 1,000")], problem.FieldErrors());
    }

    [Fact]
    public async Task It_refuses_a_date_range_whose_from_falls_after_its_to_naming_the_from_field()
    {
        using var response = await SendAsync(HttpMethod.Get, "/api/v1/trades?date_from=2026-08-18T12:00:00.000Z&date_to=2026-08-18T09:00:00.000Z", Jsmith);

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        var problem = await response.ReadAsync();
        Assert.Equal("validation_failed", problem.Text("code"));
        Assert.Equal([("date_from", "From must be on or before To")], problem.FieldErrors());
    }

    [Fact]
    public async Task It_accepts_a_date_range_whose_ends_are_the_same_instant()
    {
        using var response = await SendAsync(HttpMethod.Get, "/api/v1/trades?date_from=2026-08-18T09:15:23.000Z&date_to=2026-08-18T09:15:23.000Z", Jsmith);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static List<string> TradeIds(System.Text.Json.JsonElement page) =>
        [.. page.GetProperty("data").EnumerateArray().Select(trade => trade.Text("tradeId"))];
}
