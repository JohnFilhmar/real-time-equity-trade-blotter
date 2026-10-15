using Blotter.Contracts.Json;
using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;
using Xunit;

namespace Blotter.Contracts.Tests;

public sealed class WireNamesTests
{
    [Fact]
    public void Enums_travel_under_the_names_the_zod_schemas_declare()
    {
        Assert.Equal(new[] { "BUY", "SELL" }, WireNames.All<TradeSide>());
        Assert.Equal(new[] { "ACTIVE", "CANCELLED" }, WireNames.All<TradeStatus>());
        Assert.Equal(new[] { "USD", "GBX" }, WireNames.All<Currency>());
        Assert.Equal(new[] { "AMENDED", "CANCELLED" }, WireNames.All<TradeEventAction>());
        Assert.Equal(new[] { "API", "LIVE_FEED" }, WireNames.All<TradeEventSource>());
        Assert.Equal(new[] { "VIEWER", "TRADER", "ADMIN" }, WireNames.All<Role>());
    }

    [Theory]
    [InlineData("buy")]
    [InlineData("Buy")]
    [InlineData(" BUY")]
    [InlineData(null)]
    public void Parsing_is_case_sensitive_like_a_zod_enum(string? name)
    {
        Assert.False(WireNames.TryParse<TradeSide>(name, out _));
    }

    [Fact]
    public void Roles_expand_to_the_permissions_the_frontend_expects_in_order()
    {
        Assert.Equal(new[] { "trade.read" }, RolePermissions.For(Role.Viewer));
        Assert.Equal(new[] { "trade.read", "trade.create", "trade.amend", "trade.cancel" }, RolePermissions.For(Role.Trader));
        Assert.Equal(
            new[] { "trade.read", "trade.create", "trade.amend", "trade.amend.any", "trade.cancel", "trade.cancel.any" },
            RolePermissions.For(Role.Admin));
        Assert.False(RolePermissions.Has(Role.Trader, Permissions.TradeAmendAny));
    }

    [Fact]
    public void The_universe_matches_the_shared_instrument_list()
    {
        Assert.Equal(12, Instruments.All.Count);
        Assert.Equal(Currency.Gbx, Instruments.Find("HSBA.L")?.Currency);
        Assert.Null(Instruments.Find("hsba.l"));
    }
}
