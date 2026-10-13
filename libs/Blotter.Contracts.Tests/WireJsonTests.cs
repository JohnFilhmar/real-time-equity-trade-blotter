using System.Text.Json;
using Blotter.Contracts.Json;
using Blotter.Contracts.Messages;
using Blotter.Contracts.Wire;
using Xunit;

namespace Blotter.Contracts.Tests;

/// <summary>
/// Pins the exact JSON the frontend parses. A failure here means a field name, a number format or a
/// timestamp format drifted from the shared Zod schemas.
/// </summary>
public sealed class WireJsonTests
{
    internal static readonly Trade SampleTrade = new(
        Guid.Parse("0b8f6f1e-5d2a-4c1b-9a43-1f6f2a9b7c10"),
        "TRD-100042",
        "VOD.L",
        TradeSide.Sell,
        2500,
        78.120000m,
        Currency.Gbx,
        "JSMITH",
        "EQUITIES_UK",
        "Barclays",
        new DateTimeOffset(2026, 10, 12, 8, 15, 30, 7, TimeSpan.Zero),
        TradeStatus.Active,
        3,
        new DateTimeOffset(2026, 10, 12, 8, 15, 31, 0, TimeSpan.Zero),
        new DateTimeOffset(2026, 10, 12, 9, 0, 0, 120, TimeSpan.Zero));

    internal static readonly TradeEvent SampleEvent = new(
        Guid.Parse("6e1d2c3b-4a59-4e8f-8d7c-6b5a49382716"),
        "TRD-100042",
        3,
        TradeEventAction.Amended,
        TradeEventSource.LiveFeed,
        new Dictionary<string, FieldChange>
        {
            ["quantity"] = new(ChangeValue.Of(2000m), ChangeValue.Of(2500m)),
            ["price"] = new(ChangeValue.Of(78.5m), ChangeValue.Of(78.120000m)),
            ["book"] = new(ChangeValue.Of("EQUITIES_US"), ChangeValue.Of("EQUITIES_UK")),
        },
        "MJONES",
        new DateTimeOffset(2026, 10, 12, 9, 0, 0, 120, TimeSpan.Zero));

    internal static readonly Position SamplePosition = new(
        "VOD.L", Currency.Gbx, -2500, 1000, 3500, 351_920.000000m, 2, 78.12m, -12.5m);

    [Fact]
    public void Trade_serialises_with_the_field_names_and_formats_of_trade_schema()
    {
        var json = JsonSerializer.Serialize(SampleTrade, BlotterJson.Options);

        Assert.Equal(
            """{"id":"0b8f6f1e-5d2a-4c1b-9a43-1f6f2a9b7c10","tradeId":"TRD-100042","symbol":"VOD.L","side":"SELL","quantity":2500,"price":78.12,"currency":"GBX","trader":"JSMITH","book":"EQUITIES_UK","counterparty":"Barclays","tradeTimestamp":"2026-10-12T08:15:30.007Z","status":"ACTIVE","version":3,"createdAt":"2026-10-12T08:15:31.000Z","updatedAt":"2026-10-12T09:00:00.120Z"}""",
            json);
    }

    [Fact]
    public void Trade_event_keeps_its_change_order_and_writes_values_as_bare_strings_or_numbers()
    {
        var json = JsonSerializer.Serialize(SampleEvent, BlotterJson.Options);

        Assert.Equal(
            """{"id":"6e1d2c3b-4a59-4e8f-8d7c-6b5a49382716","tradeId":"TRD-100042","version":3,"action":"AMENDED","source":"LIVE_FEED","changes":{"quantity":{"from":2000,"to":2500},"price":{"from":78.5,"to":78.12},"book":{"from":"EQUITIES_US","to":"EQUITIES_UK"}},"actor":"MJONES","occurredAt":"2026-10-12T09:00:00.120Z"}""",
            json);
    }

    [Fact]
    public void Position_serialises_with_the_field_names_of_position_schema()
    {
        var json = JsonSerializer.Serialize(SamplePosition, BlotterJson.Options);

        Assert.Equal(
            """{"symbol":"VOD.L","currency":"GBX","netQuantity":-2500,"buyQuantity":1000,"sellQuantity":3500,"grossNotional":351920,"tradeCount":2,"averagePrice":78.12,"realisedPnl":-12.5}""",
            json);
    }

    [Fact]
    public void Trade_changed_message_round_trips_through_json()
    {
        var message = new TradeChanged(TradeChangeKind.Amended, SampleTrade, SampleEvent, SamplePosition);

        var json = JsonSerializer.Serialize(message, BlotterJson.Options);
        var parsed = JsonSerializer.Deserialize<TradeChanged>(json, BlotterJson.Options);

        Assert.NotNull(parsed);
        Assert.StartsWith("""{"kind":"amended","trade":{""", json, StringComparison.Ordinal);
        Assert.Equal(SampleTrade, parsed.Trade);
        Assert.Equal(SamplePosition, parsed.Position);
        Assert.Equal(json, JsonSerializer.Serialize(parsed, BlotterJson.Options));
    }

    [Fact]
    public void A_booking_message_carries_a_null_event()
    {
        var json = JsonSerializer.Serialize(
            new TradeChanged(TradeChangeKind.Created, SampleTrade, null, SamplePosition),
            BlotterJson.Options);

        Assert.Contains("\"event\":null", json, StringComparison.Ordinal);
    }

    [Fact]
    public void A_quoted_price_is_refused_rather_than_coerced()
    {
        var json = JsonSerializer.Serialize(SampleTrade, BlotterJson.Options).Replace("\"price\":78.12", "\"price\":\"78.12\"", StringComparison.Ordinal);

        Assert.ThrowsAny<JsonException>(() => JsonSerializer.Deserialize<Trade>(json, BlotterJson.Options));
    }
}
