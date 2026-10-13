using Blotter.Contracts.Wire;
using Blotter.Trades.Domain;
using Blotter.Trades.Simulation;
using Xunit;

namespace Blotter.Trades.Tests;

/// <summary>
/// The small pure rules, ported from <c>build_change_set.test.ts</c>, <c>cursor.test.ts</c>,
/// <c>choose_action.test.ts</c>, <c>choose_amend_scope.test.ts</c> and <c>lean_side.test.ts</c>.
/// </summary>
public sealed class RulesTests
{
    private static readonly Trade Before = new(
        Guid.Parse("018f0000-0000-7000-8000-000000000001"),
        "TRD-100001",
        "AAPL",
        TradeSide.Buy,
        5000,
        227.45m,
        Currency.Usd,
        "JSMITH",
        "EQUITIES_US",
        "Goldman Sachs",
        DateTimeOffset.UnixEpoch,
        TradeStatus.Active,
        1,
        DateTimeOffset.UnixEpoch,
        DateTimeOffset.UnixEpoch);

    [Fact]
    public void Change_set_records_both_sides_of_a_changed_field()
    {
        var changes = ChangeSets.ForAmendment(Before, new TradeChanges(7500, null, null));

        Assert.Equal(new FieldChange(ChangeValue.Of(5000m), ChangeValue.Of(7500m)), Assert.Single(changes).Value);
    }

    [Fact]
    public void Change_set_records_every_field_that_moved_in_a_fixed_order()
    {
        var changes = ChangeSets.ForAmendment(Before, new TradeChanges(7500, 230m, "TECH_GROWTH"));

        Assert.Equal(new[] { "quantity", "price", "book" }, changes.Keys);
    }

    [Fact]
    public void Change_set_ignores_a_field_resent_at_the_value_it_already_held()
    {
        var changes = ChangeSets.ForAmendment(Before, new TradeChanges(5000, 227.450000m, "EQUITIES_US"));

        Assert.Empty(changes);
    }

    [Fact]
    public void Cancellation_is_recorded_as_a_status_transition()
    {
        var change = Assert.Single(ChangeSets.ForCancellation());

        Assert.Equal("status", change.Key);
        Assert.Equal(new FieldChange(ChangeValue.Of("ACTIVE"), ChangeValue.Of("CANCELLED")), change.Value);
    }

    [Fact]
    public void Cursor_round_trips_a_row_id_and_is_url_safe_and_opaque()
    {
        var id = Guid.Parse("0b8f6f1e-5d2a-4c1b-9a43-1f6f2a9b7c10");
        var cursor = PageCursor.Encode(id);

        Assert.Equal(id, PageCursor.Decode(cursor));
        Assert.DoesNotContain(id.ToString(), cursor, StringComparison.Ordinal);
        Assert.Matches("^[A-Za-z0-9_-]+$", cursor);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not-a-cursor")]
    [InlineData("bm90LWEtdXVpZA")]
    [InlineData("%%%")]
    public void Cursor_that_is_absent_stale_or_hand_edited_means_the_first_page(string? cursor)
    {
        Assert.Null(PageCursor.Decode(cursor));
    }

    [Fact]
    public void Conversion_chance_is_zero_until_ninety_per_cent_then_rises_to_six_in_seven()
    {
        Assert.Equal(0, FeedRules.ConversionChance(0, 2000));
        Assert.Equal(0, FeedRules.ConversionChance(1800, 2000));
        Assert.Equal(3.0 / 7.0, FeedRules.ConversionChance(1900, 2000), 10);
        Assert.Equal(6.0 / 7.0, FeedRules.ConversionChance(2000, 2000), 10);
        Assert.Equal(6.0 / 7.0, FeedRules.ConversionChance(22_466, 2000), 10);
    }

    [Fact]
    public void Choose_action_only_ever_turns_a_booking_into_a_cancel()
    {
        Assert.Equal(FeedAction.Amend, FeedRules.ChooseAction(FeedAction.Amend, 50_000, 2000, 0));
        Assert.Equal(FeedAction.Cancel, FeedRules.ChooseAction(FeedAction.Cancel, 0, 2000, 0.99));
        Assert.Equal(FeedAction.Create, FeedRules.ChooseAction(FeedAction.Create, 1500, 2000, 0));
        Assert.Equal(FeedAction.Cancel, FeedRules.ChooseAction(FeedAction.Create, 2000, 2000, 0.8));
        Assert.Equal(FeedAction.Cancel, FeedRules.ChooseAction(FeedAction.Create, 1900, 2000, 0.4));
        Assert.Equal(FeedAction.Create, FeedRules.ChooseAction(FeedAction.Create, 22_466, 2000, 0.9));
        Assert.Equal(FeedAction.Create, FeedRules.ChooseAction(FeedAction.Create, 1900, 2000, 0.45));
    }

    [Fact]
    public void Amendments_split_evenly_between_the_first_screen_of_thirty_and_the_whole_book()
    {
        Assert.True(FeedRules.AmendsRecent(0));
        Assert.True(FeedRules.AmendsRecent(FeedRules.RecentAmendShare - 0.000_001));
        Assert.False(FeedRules.AmendsRecent(FeedRules.RecentAmendShare));
        Assert.False(FeedRules.AmendsRecent(0.999_999));
        Assert.Equal(0.5, FeedRules.RecentAmendShare);
        Assert.Equal(30, FeedRules.RecentAmendWindow);
    }

    [Fact]
    public void Side_leans_against_the_position_but_never_rules_a_side_out()
    {
        const long scale = 100_000;

        Assert.Equal(TradeSide.Sell, FeedRules.LeanSide(0, 0.49));
        Assert.Equal(TradeSide.Buy, FeedRules.LeanSide(0, 0.51));
        Assert.Equal(TradeSide.Sell, FeedRules.LeanSide(scale, 0.75));
        Assert.Equal(TradeSide.Buy, FeedRules.LeanSide(scale, 0.85));
        Assert.Equal(TradeSide.Buy, FeedRules.LeanSide(-scale, 0.25));
        Assert.Equal(TradeSide.Sell, FeedRules.LeanSide(-scale, 0.15));
        Assert.Equal(TradeSide.Buy, FeedRules.LeanSide(50 * scale, 0.95));
        Assert.Equal(TradeSide.Sell, FeedRules.LeanSide(-50 * scale, 0.05));
    }
}
