using Blotter.Contracts.Messages;
using Blotter.Contracts.Wire;
using Blotter.Trades.Domain;
using Blotter.Trades.Outbox;
using Blotter.Trades.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Blotter.Trades.Tests;

/// <summary>
/// Ported from <c>backend/src/services/trade_service/trade_service.test.ts</c>, run against a real
/// SQL Server. Where the Node tests asserted what was broadcast, these assert what the write left in
/// the outbox, which is what the broadcast is built from.
/// </summary>
public sealed class TradeServiceTests(SqlServerFixture server) : TradesDatabase(server)
{
    private static readonly System.Text.RegularExpressions.Regex Rfc9562Uuid = new(
        "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");

    [Fact]
    public async Task Create_stores_the_trade_as_active_at_version_one_with_a_sequence_id()
    {
        var trade = await Service.CreateAsync(ATicket(), Trader, default);

        Assert.Equal(TradeStatus.Active, trade.Status);
        Assert.Equal(1, trade.Version);
        Assert.Matches("^TRD-[0-9]{6,}$", trade.TradeId);
        Assert.Equal("JSMITH", trade.Trader);
        Assert.Matches(Rfc9562Uuid, trade.Id.ToString());
    }

    [Fact]
    public async Task Create_resolves_the_currency_from_the_instrument_rather_than_the_ticket()
    {
        var us = await Service.CreateAsync(ATicket(symbol: "AAPL"), Trader, default);
        var london = await Service.CreateAsync(ATicket(symbol: "VOD.L", price: 78m), Trader, default);

        Assert.Equal(Currency.Usd, us.Currency);
        Assert.Equal(Currency.Gbx, london.Currency);
    }

    [Fact]
    public async Task Create_leaves_a_created_message_with_no_audit_event_in_the_outbox()
    {
        var trade = await Service.CreateAsync(ATicket(), Trader, default);

        var payload = Assert.Single(await Outbox());
        Assert.Equal(TradeChangeKind.Created, payload.Kind);
        Assert.Equal(trade, payload.Trade);
        Assert.Null(payload.Event);
    }

    [Fact]
    public async Task Create_refuses_a_ticket_over_the_desk_limit_and_leaves_nothing_behind()
    {
        var violation = await Assert.ThrowsAsync<TradeRuleViolation>(() =>
            Service.CreateAsync(ATicket(quantity: 250_000, price: 250m), Trader, default));

        Assert.Equal("This trade is worth $62,500,000, over the $50,000,000 limit for US names.", violation.Message);
        Assert.Empty(await Context().Trades.ToListAsync());
        Assert.Empty(await Outbox());
    }

    [Fact]
    public async Task Get_returns_the_trade_and_reports_a_missing_one_as_not_found()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);

        Assert.Equal(created, await Service.GetAsync(created.TradeId, default));
        var missing = await Assert.ThrowsAsync<TradeRuleViolation>(() => Service.GetAsync("TRD-999999", default));
        Assert.Equal(TradeRuleKind.NotFound, missing.Kind);
        Assert.Equal("trade TRD-999999 was not found", missing.Message);
    }

    [Fact]
    public async Task List_returns_the_window_alongside_the_unpaged_total()
    {
        await Service.CreateAsync(ATicket(symbol: "AAPL"), Trader, default);
        await Service.CreateAsync(ATicket(symbol: "MSFT"), Trader, default);
        await Service.CreateAsync(ATicket(symbol: "TSLA"), Trader, default);

        var page = await Service.ListAsync(Query(limit: 2), default);

        Assert.Equal(2, page.Data.Count);
        Assert.Equal(3, page.Total);
        Assert.NotNull(page.NextCursor);
    }

    [Fact]
    public async Task List_filters_case_insensitively_on_a_substring()
    {
        await Service.CreateAsync(ATicket(book: "EQUITIES_UK"), Trader, default);
        await Service.CreateAsync(ATicket(book: "TECH_GROWTH"), Trader, default);
        await Service.CreateAsync(ATicket(counterparty: "JP Morgan"), Trader, default);

        var byBook = await Service.ListAsync(Query() with { Book = "equities" }, default);
        var byCounterparty = await Service.ListAsync(Query() with { Counterparty = "morgan" }, default);

        Assert.Equal(new[] { "EQUITIES_UK", "EQUITIES_US" }, byBook.Data.Select(trade => trade.Book).Order());
        Assert.Equal("JP Morgan", Assert.Single(byCounterparty.Data).Counterparty);
    }

    [Fact]
    public async Task List_filters_on_side_status_and_an_inclusive_trade_date_range()
    {
        await Service.CreateAsync(ATicket(tradeTimestamp: "2026-08-18T09:00:00.000Z"), Trader, default);
        await Service.CreateAsync(ATicket(side: TradeSide.Sell, tradeTimestamp: "2026-08-20T09:00:00.000Z"), Trader, default);
        var doomed = await Service.CreateAsync(ATicket(tradeTimestamp: "2026-08-18T23:59:59.000Z"), Trader, default);
        await Service.CancelAsync(doomed.TradeId, null, Trader, default);

        var day = await Service.ListAsync(
            Query() with { DateFrom = At("2026-08-18T00:00:00.000Z"), DateTo = At("2026-08-18T23:59:59.000Z") },
            default);
        var sells = await Service.ListAsync(Query() with { Side = TradeSide.Sell }, default);
        var cancelled = await Service.ListAsync(Query() with { Status = TradeStatus.Cancelled }, default);

        Assert.Equal(2, day.Total);
        Assert.Equal("2026-08-20T09:00:00.000Z", Iso(Assert.Single(sells.Data).TradeTimestamp));
        Assert.Equal(doomed.TradeId, Assert.Single(cancelled.Data).TradeId);
    }

    [Fact]
    public async Task List_sorts_on_the_requested_column_and_direction()
    {
        await Service.CreateAsync(ATicket(quantity: 300), Trader, default);
        await Service.CreateAsync(ATicket(quantity: 100), Trader, default);
        await Service.CreateAsync(ATicket(quantity: 200), Trader, default);

        var page = await Service.ListAsync(Query() with { SortBy = TradeSortColumn.Quantity, Descending = false }, default);

        Assert.Equal(new[] { 100, 200, 300 }, page.Data.Select(trade => trade.Quantity));
    }

    [Fact]
    public async Task Every_sort_column_walks_the_whole_set_by_cursor_without_repeating_or_skipping()
    {
        foreach (var (symbol, index) in new[] { "MSFT", "AAPL", "TSLA", "AAPL", "NVDA", "MSFT", "JPM" }.Select((symbol, index) => (symbol, index)))
        {
            await Service.CreateAsync(ATicket(symbol: symbol, quantity: (index % 3 + 1) * 100, price: 100m + index % 2), Trader, default);
        }

        foreach (var column in Enum.GetValues<TradeSortColumn>())
        {
            foreach (var descending in new[] { true, false })
            {
                var seen = new List<string>();
                string? cursor = null;
                do
                {
                    var page = await Service.ListAsync(
                        Query(limit: 3) with { SortBy = column, Descending = descending, Cursor = PageCursor.Decode(cursor) },
                        default);
                    seen.AddRange(page.Data.Select(trade => trade.TradeId));
                    cursor = page.NextCursor;
                }
                while (cursor is not null);

                Assert.Equal(7, seen.Count);
                Assert.Equal(7, seen.Distinct().Count());
            }
        }
    }

    [Fact]
    public async Task Paging_does_not_re_serve_a_row_when_trades_are_inserted_between_pages()
    {
        for (var index = 0; index < 6; index++)
        {
            await Service.CreateAsync(ATicket(quantity: (index + 1) * 100), Trader, default);
        }

        var first = await Service.ListAsync(Query(limit: 3), default);

        // The blotter inserts all day. This is exactly what breaks offset paging.
        await Service.CreateAsync(ATicket(quantity: 9999, tradeTimestamp: "2026-08-18T09:30:00.000Z"), Trader, default);
        await Service.CreateAsync(ATicket(quantity: 8888, tradeTimestamp: "2026-08-18T09:30:00.000Z"), Trader, default);

        var second = await Service.ListAsync(Query(limit: 3) with { Cursor = PageCursor.Decode(first.NextCursor) }, default);

        Assert.Empty(second.Data.Select(trade => trade.TradeId).Intersect(first.Data.Select(trade => trade.TradeId)));
    }

    [Fact]
    public async Task A_cursor_naming_a_row_that_no_longer_exists_yields_an_empty_page_with_the_total()
    {
        await Service.CreateAsync(ATicket(), Trader, default);

        var page = await Service.ListAsync(Query() with { Cursor = Guid.NewGuid() }, default);

        Assert.Empty(page.Data);
        Assert.Equal(1, page.Total);
        Assert.Null(page.NextCursor);
    }

    [Fact]
    public async Task Amend_applies_the_change_bumps_the_version_and_leaves_the_trade_and_its_audit_row()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);

        var amended = await Service.AmendAsync(created.TradeId, created.Version, new TradeChanges(7500, null, null), Trader, default);

        Assert.Equal(7500, amended.Quantity);
        Assert.Equal(2, amended.Version);
        var message = (await Outbox()).Last();
        Assert.Equal(TradeChangeKind.Amended, message.Kind);
        Assert.Equal(amended, message.Trade);
        Assert.Equal(Assert.Single(await Service.ListHistoryAsync(created.TradeId, default)).Id, message.Event?.Id);
    }

    [Fact]
    public async Task Amend_rejects_an_amendment_that_names_nothing()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);

        var violation = await Assert.ThrowsAsync<TradeRuleViolation>(() =>
            Service.AmendAsync(created.TradeId, created.Version, new TradeChanges(null, null, null), Trader, default));

        Assert.Equal(TradeRuleKind.Invalid, violation.Kind);
        Assert.Equal("An amendment must change at least one field", violation.Message);
    }

    [Fact]
    public async Task Amend_still_corrects_the_book_and_records_the_move()
    {
        var created = await Service.CreateAsync(ATicket(book: "EQUITIES_US"), Trader, default);

        var amended = await Service.AmendAsync(created.TradeId, 1, new TradeChanges(null, null, "TECH_GROWTH"), Trader, default);
        var change = Assert.Single(Assert.Single(await Service.ListHistoryAsync(created.TradeId, default)).Changes);

        Assert.Equal("TECH_GROWTH", amended.Book);
        Assert.Equal("Goldman Sachs", amended.Counterparty);
        Assert.Equal("book", change.Key);
        Assert.Equal(new FieldChange(ChangeValue.Of("EQUITIES_US"), ChangeValue.Of("TECH_GROWTH")), change.Value);
    }

    [Fact]
    public async Task Amend_refuses_a_change_that_would_breach_the_limit()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);

        var violation = await Assert.ThrowsAsync<TradeRuleViolation>(() =>
            Service.AmendAsync(created.TradeId, 1, new TradeChanges(1_000_000, 100m, null), Trader, default));

        Assert.Equal(TradeRuleKind.Invalid, violation.Kind);
    }

    [Fact]
    public async Task Amend_reports_not_found_a_stale_version_and_a_cancelled_trade_and_writes_nothing()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);
        await Service.AmendAsync(created.TradeId, 1, new TradeChanges(200, null, null), Trader, default);

        var missing = await Assert.ThrowsAsync<TradeRuleViolation>(() =>
            Service.AmendAsync("TRD-999999", 1, new TradeChanges(100, null, null), Trader, default));
        var stale = await Assert.ThrowsAsync<TradeRuleViolation>(() =>
            Service.AmendAsync(created.TradeId, 1, new TradeChanges(300, null, null), Trader, default));

        Assert.Equal(TradeRuleKind.NotFound, missing.Kind);
        Assert.Equal(TradeRuleKind.Conflict, stale.Kind);
        Assert.Equal(
            $"Trade {created.TradeId} has changed since you loaded it. It is now at version 2. Reload and try again.",
            stale.Message);
        Assert.Single(await Service.ListHistoryAsync(created.TradeId, default));

        await Service.CancelAsync(created.TradeId, null, Trader, default);
        var cancelled = await Assert.ThrowsAsync<TradeRuleViolation>(() =>
            Service.AmendAsync(created.TradeId, 3, new TradeChanges(300, null, null), Trader, default));

        Assert.Equal(TradeRuleKind.Conflict, cancelled.Kind);
        Assert.Equal($"Trade {created.TradeId} is cancelled and can no longer be amended", cancelled.Message);
    }

    [Fact]
    public async Task A_trader_cannot_touch_another_desks_trade_but_an_administrator_can()
    {
        var theirs = await Service.CreateAsync(ATicket(), ActorFor("ABROWN"), default);

        var amend = await Assert.ThrowsAsync<TradeRuleViolation>(() =>
            Service.AmendAsync(theirs.TradeId, 1, new TradeChanges(100, null, null), Trader, default));
        var cancel = await Assert.ThrowsAsync<TradeRuleViolation>(() =>
            Service.CancelAsync(theirs.TradeId, null, Trader, default));

        Assert.Equal(TradeRuleKind.Forbidden, amend.Kind);
        Assert.Equal("Only ABROWN or an administrator can amend this trade", amend.Message);
        Assert.Equal("Only ABROWN or an administrator can cancel this trade", cancel.Message);

        var admin = ActorFor("MJONES", Role.Admin);
        var amended = await Service.AmendAsync(theirs.TradeId, 1, new TradeChanges(100, null, null), admin, default);
        Assert.Equal("MJONES", Assert.Single(await Service.ListHistoryAsync(theirs.TradeId, default)).Actor);
        Assert.Equal("ABROWN", amended.Trader);
    }

    [Fact]
    public async Task Cancel_moves_the_trade_to_cancelled_once_and_only_once()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);

        var cancelled = await Service.CancelAsync(created.TradeId, null, Trader, default);
        var again = await Assert.ThrowsAsync<TradeRuleViolation>(() => Service.CancelAsync(created.TradeId, null, Trader, default));

        Assert.Equal(TradeStatus.Cancelled, cancelled.Status);
        Assert.Equal(2, cancelled.Version);
        Assert.Equal(TradeRuleKind.Conflict, again.Kind);
        Assert.Equal(TradeChangeKind.Cancelled, (await Outbox()).Last().Kind);
    }

    [Fact]
    public async Task Cancel_honours_the_version_guard_and_reports_a_missing_trade()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);

        var stale = await Assert.ThrowsAsync<TradeRuleViolation>(() => Service.CancelAsync(created.TradeId, 99, Trader, default));
        var missing = await Assert.ThrowsAsync<TradeRuleViolation>(() => Service.CancelAsync("TRD-999999", null, Trader, default));

        Assert.Equal(TradeRuleKind.Conflict, stale.Kind);
        Assert.Equal(TradeRuleKind.NotFound, missing.Kind);
    }

    [Fact]
    public async Task History_is_empty_for_an_unchanged_trade_and_not_found_for_a_missing_one()
    {
        var created = await Service.CreateAsync(ATicket(), Trader, default);

        Assert.Empty(await Service.ListHistoryAsync(created.TradeId, default));
        var missing = await Assert.ThrowsAsync<TradeRuleViolation>(() => Service.ListHistoryAsync("TRD-999999", default));
        Assert.Equal(TradeRuleKind.NotFound, missing.Kind);
    }

    [Fact]
    public async Task History_accumulates_one_row_per_change_oldest_first_with_its_source_and_actor()
    {
        var created = await Service.CreateAsync(ATicket(quantity: 5000), ActorFor("MJONES"), default);
        await Service.AmendAsync(created.TradeId, 1, new TradeChanges(7500, null, null), ActorFor("MJONES"), default);
        await Service.AmendAsync(created.TradeId, 2, new TradeChanges(200, null, null), ActorFor("MJONES"), default);
        await Service.CancelAsync(created.TradeId, null, ActorFor("MJONES", source: TradeEventSource.LiveFeed), default);

        var history = await Service.ListHistoryAsync(created.TradeId, default);

        Assert.Equal(new[] { 2, 3, 4 }, history.Select(entry => entry.Version));
        Assert.Equal(new[] { TradeEventAction.Amended, TradeEventAction.Amended, TradeEventAction.Cancelled }, history.Select(entry => entry.Action));
        Assert.Equal(new[] { TradeEventSource.Api, TradeEventSource.Api, TradeEventSource.LiveFeed }, history.Select(entry => entry.Source));
        Assert.All(history, entry => Assert.Equal("MJONES", entry.Actor));
        Assert.Equal(new FieldChange(ChangeValue.Of(5000m), ChangeValue.Of(7500m)), history[0].Changes["quantity"]);
        Assert.Equal(new FieldChange(ChangeValue.Of("ACTIVE"), ChangeValue.Of("CANCELLED")), history[2].Changes["status"]);
    }

    [Fact]
    public async Task Positions_walk_the_active_trades_so_the_average_and_realised_pnl_are_right()
    {
        await Service.CreateAsync(ATicket(symbol: "MSFT", quantity: 100, price: 100m, tradeTimestamp: "2026-08-18T09:00:00.000Z"), Trader, default);
        await Service.CreateAsync(ATicket(symbol: "MSFT", side: TradeSide.Sell, quantity: 40, price: 110m, tradeTimestamp: "2026-08-18T10:00:00.000Z"), Trader, default);
        await Service.CreateAsync(ATicket(symbol: "AAPL"), Trader, default);
        var doomed = await Service.CreateAsync(ATicket(symbol: "AAPL", quantity: 1), Trader, default);
        await Service.CancelAsync(doomed.TradeId, null, Trader, default);

        var positions = await Service.ListPositionsAsync(default);

        Assert.Equal(new[] { "AAPL", "MSFT" }, positions.Select(position => position.Symbol));
        Assert.Equal(5000, positions[0].NetQuantity);
        Assert.Equal(60, positions[1].NetQuantity);
        Assert.Equal(100m, positions[1].AveragePrice);
        Assert.Equal(400m, positions[1].RealisedPnl);
    }

    [Fact]
    public async Task One_symbol_reads_alone_and_a_symbol_with_no_trades_is_flat_in_its_own_currency()
    {
        await Service.CreateAsync(ATicket(symbol: "MSFT"), Trader, default);
        await Service.CreateAsync(ATicket(symbol: "AAPL"), Trader, default);

        var microsoft = await Service.PositionForAsync("MSFT", default);
        var vodafone = await Service.PositionForAsync("VOD.L", default);

        Assert.Equal(1, microsoft.TradeCount);
        Assert.Equal(new Position("VOD.L", Currency.Gbx, 0, 0, 0, 0m, 0, 0m, 0m), vodafone);
    }

    [Fact]
    public async Task A_price_survives_decimal_18_6_exactly()
    {
        var created = await Service.CreateAsync(ATicket(price: 227.123456m), Trader, default);

        Assert.Equal(227.123456m, (await Service.GetAsync(created.TradeId, default)).Price);
    }

    private static TradeQuery Query(int limit = 100) =>
        new(null, null, null, null, null, null, null, null, TradeSortColumn.TradeTimestamp, true, limit, null);

    private static DateTimeOffset At(string iso) => DateTimeOffset.Parse(iso, System.Globalization.CultureInfo.InvariantCulture);

    private static string Iso(DateTimeOffset value) =>
        value.ToUniversalTime().ToString(Contracts.Json.UtcMillisecondsJsonConverter.Format, System.Globalization.CultureInfo.InvariantCulture);

    private async Task<List<OutboxPayload>> Outbox() =>
        [.. (await Context().Outbox.OrderBy(row => row.Id).ToListAsync()).Select(row => OutboxPayload.FromJson(row.Payload))];
}
