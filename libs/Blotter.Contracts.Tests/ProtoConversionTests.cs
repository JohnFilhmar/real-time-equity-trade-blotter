using Blotter.Contracts.Grpc;
using Blotter.Contracts.Wire;
using Google.Protobuf;
using Xunit;

namespace Blotter.Contracts.Tests;

/// <summary>
/// Contract tests for the gRPC boundary: whatever the trades service sends, the gateway must read
/// back as the same value, digit for digit.
/// </summary>
public sealed class ProtoConversionTests
{
    [Fact]
    public void A_trade_survives_the_trip_through_protobuf_unchanged()
    {
        var bytes = WireJsonTests.SampleTrade.ToProto().ToByteArray();
        var back = Grpc.Trade.Parser.ParseFrom(bytes).ToWire();

        Assert.Equal(WireJsonTests.SampleTrade, back);
    }

    [Fact]
    public void An_event_survives_the_trip_with_its_changes_in_order()
    {
        var bytes = WireJsonTests.SampleEvent.ToProto().ToByteArray();
        var back = Grpc.TradeEvent.Parser.ParseFrom(bytes).ToWire();

        Assert.Equal(WireJsonTests.SampleEvent with { Changes = back.Changes }, back);
        Assert.Equal(new[] { "quantity", "price", "book" }, back.Changes.Keys);
        Assert.Equal(WireJsonTests.SampleEvent.Changes["price"], back.Changes["price"]);
        Assert.Equal(WireJsonTests.SampleEvent.Changes["book"], back.Changes["book"]);
    }

    [Fact]
    public void A_position_survives_the_trip_through_protobuf_unchanged()
    {
        var bytes = WireJsonTests.SamplePosition.ToProto().ToByteArray();
        var back = Grpc.Position.Parser.ParseFrom(bytes).ToWire();

        Assert.Equal(WireJsonTests.SamplePosition, back);
    }

    [Fact]
    public void Prices_cross_as_exact_decimal_text_never_as_floats()
    {
        var trade = WireJsonTests.SampleTrade with { Price = 0.1m + 0.2m };

        Assert.Equal("0.3", trade.ToProto().Price);
    }

    [Fact]
    public void An_unspecified_enum_is_a_contract_violation()
    {
        var message = WireJsonTests.SampleTrade.ToProto();
        message.Side = Side.Unspecified;

        Assert.Throws<ArgumentOutOfRangeException>(() => message.ToWire());
    }
}

