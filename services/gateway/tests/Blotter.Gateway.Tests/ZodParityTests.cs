using System.Globalization;
using System.Text.Json;
using Blotter.Contracts.Json;
using Blotter.Gateway.Tests.Fixtures;
using Blotter.Gateway.Validation;
using FluentValidation.Results;
using Google.Protobuf.WellKnownTypes;
using Xunit;
using Proto = Blotter.Contracts.Grpc;

namespace Blotter.Gateway.Tests;

/// <summary>
/// Replays every input the Node API's Zod schemas were run over, from <c>zod_cases.json</c>, through
/// the gateway's validators and request mapping. A refused input must produce the same field errors
/// in the same order with the same wording; an accepted one must reach the trades service with the
/// values Zod parsed. The fixture is regenerated from the shared package, and CI fails when it drifts.
/// </summary>
public sealed class ZodParityTests
{
    private static readonly CreateTradeValidator Create = new(TimeProvider.System);
    private static readonly AmendTradeValidator Amend = new();
    private static readonly CancelTradeValidator Cancel = new();
    private static readonly LoginValidator Login = new();
    private static readonly TradeQueryValidator TradeQuery = new();
    private static readonly EventQueryValidator EventQuery = new();
    private static readonly TradeIdValidator TradeId = new();

    /// <summary>The index of every case in the fixture.</summary>
    /// <returns>The indexes.</returns>
    public static TheoryData<int> Cases() => [.. Enumerable.Range(0, ZodCase.All.Count)];

    /// <summary>The fixture covers every schema the Node routes validated with, so none can silently drop out.</summary>
    [Fact]
    public void The_fixture_covers_every_schema() =>
        Assert.Equal(
            ["amend_trade", "cancel_trade", "create_trade", "event_query", "login", "trade_params", "trade_query"],
            ZodCase.All.Select(@case => @case.Schema).Distinct().Order(StringComparer.Ordinal));

    /// <summary>One fixture case.</summary>
    /// <param name="index">Its position in the fixture.</param>
    [Theory]
    [MemberData(nameof(Cases))]
    public void The_gateway_answers_each_input_as_the_zod_schema_did(int index)
    {
        var @case = ZodCase.All[index];
        var result = Validate(@case);

        // Both sides start with the case's label, so a failure shows the input next to the difference.
        var expected = @case.Ok ? "ok" : string.Join('\n', @case.Errors!.Select(error => $"{error.Field}: {error.Message}"));
        var actual = result.IsValid ? "ok" : string.Join('\n', result.Errors.Select(error => $"{error.PropertyName}: {error.ErrorMessage}"));
        Assert.Equal($"{@case.Label}\n{expected}", $"{@case.Label}\n{actual}");

        if (@case.Ok)
        {
            Assert.Equal($"{@case.Label}\n{ExpectedOutput(@case)}", $"{@case.Label}\n{MappedOutput(@case)}");
        }
    }

    private static ValidationResult Validate(ZodCase @case) => @case.Schema switch
    {
        "login" => Login.Validate(@case.JsonBody),
        "create_trade" => Create.Validate(@case.JsonBody),
        "amend_trade" => Amend.Validate(@case.JsonBody),
        "cancel_trade" => Cancel.Validate(@case.JsonBody),
        "trade_query" => TradeQuery.Validate(@case.QueryInput),
        "event_query" => EventQuery.Validate(@case.QueryInput),
        "trade_params" => TradeId.Validate(@case.Query!["trade_id"].GetString()!),
        _ => throw new InvalidOperationException($"unknown schema {@case.Schema}"),
    };

    /// <summary>What Zod parsed, as one line of name=value pairs in a fixed order.</summary>
    private static string ExpectedOutput(ZodCase @case)
    {
        var output = @case.Output!.Value;
        string Text(string name) => output.TryGetProperty(name, out var value) ? value.GetString()! : string.Empty;
        string Number(string name) => output.TryGetProperty(name, out var value) ? value.GetRawText() : string.Empty;
        string Price() => output.TryGetProperty("price", out var value) ? Rounded(value.GetDecimal()) : string.Empty;
        string Instant(string name) => output.TryGetProperty(name, out var value) ? IsoMillis(value.GetString()!) : string.Empty;

        return @case.Schema switch
        {
            "login" => $"username={Text("username")} password={Text("password")}",
            "create_trade" => $"symbol={Text("symbol")} side={Text("side")} quantity={Number("quantity")} price={Price()} " +
                $"book={Text("book")} counterparty={Text("counterparty")} tradeTimestamp={Instant("tradeTimestamp")}",
            "amend_trade" => $"version={Number("version")} quantity={Number("quantity")} price={Price()} book={Text("book")}",
            "cancel_trade" => $"version={Number("version")}",
            "trade_query" => $"symbol={Text("symbol")} side={Text("side")} status={Text("status")} trader={Text("trader")} " +
                $"book={Text("book")} counterparty={Text("counterparty")} date_from={Instant("date_from")} date_to={Instant("date_to")} " +
                $"sort_by={Text("sort_by")} sort_dir={Text("sort_dir")} limit={Number("limit")} cursor={Text("cursor")}",
            "event_query" => $"limit={Number("limit")} cursor={Text("cursor")}",
            "trade_params" => $"trade_id={Text("trade_id")}",
            _ => throw new InvalidOperationException($"unknown schema {@case.Schema}"),
        };
    }

    /// <summary>What the gateway sends the trades service for the same input, in the same line format.</summary>
    private static string MappedOutput(ZodCase @case)
    {
        switch (@case.Schema)
        {
            case "login":
                var (username, password) = RequestMapping.ToLogin(@case.JsonBody);
                return $"username={username} password={password}";
            case "create_trade":
                var create = RequestMapping.ToCreate(@case.JsonBody);
                return $"symbol={create.Symbol} side={SideName(create.Side)} quantity={create.Quantity} price={Rounded(ExactDecimal.Parse(create.Price))} " +
                    $"book={create.Book} counterparty={create.Counterparty} tradeTimestamp={Format(create.TradeTimestamp)}";
            case "amend_trade":
                var amend = RequestMapping.ToAmend("TRD-100001", @case.JsonBody);
                return $"version={amend.Version} quantity={(amend.HasQuantity ? amend.Quantity.ToString(CultureInfo.InvariantCulture) : string.Empty)} " +
                    $"price={(amend.HasPrice ? Rounded(ExactDecimal.Parse(amend.Price)) : string.Empty)} book={(amend.HasBook ? amend.Book : string.Empty)}";
            case "cancel_trade":
                var cancel = RequestMapping.ToCancel("TRD-100001", @case.JsonBody);
                return $"version={(cancel.HasVersion ? cancel.Version.ToString(CultureInfo.InvariantCulture) : string.Empty)}";
            case "trade_query":
                var list = RequestMapping.ToList(@case.QueryInput);
                return $"symbol={list.Symbol} side={SideName(list.Side)} status={StatusName(list.Status)} trader={list.Trader} " +
                    $"book={list.Book} counterparty={list.Counterparty} date_from={Format(list.DateFrom)} date_to={Format(list.DateTo)} " +
                    $"sort_by={list.SortBy} sort_dir={(list.SortDir == Proto.SortDirection.Asc ? "asc" : "desc")} limit={list.Limit} cursor={list.Cursor}";
            case "event_query":
                var events = RequestMapping.ToEvents(@case.QueryInput);
                return $"limit={events.Limit} cursor={events.Cursor}";
            case "trade_params":
                return $"trade_id={@case.Query!["trade_id"].GetString()}";
            default:
                throw new InvalidOperationException($"unknown schema {@case.Schema}");
        }
    }

    /// <summary>A price as the price column stores it: six places, rounded half away from zero.</summary>
    private static string Rounded(decimal price) =>
        ExactDecimal.Format(decimal.Round(price, 6, MidpointRounding.AwayFromZero));

    /// <summary>
    /// Reads a timestamp that passed Zod's datetime check the way <c>Date.parse</c> does: to the
    /// millisecond, with any further digits dropped rather than rounded.
    /// </summary>
    private static string IsoMillis(string text)
    {
        var seconds = DateTimeOffset.ParseExact(text[..19], "yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal);
        var fraction = text.Length > 20 && text[19] == '.' ? text[20..^1].PadRight(3, '0')[..3] : "000";
        return Format(seconds.AddMilliseconds(int.Parse(fraction, CultureInfo.InvariantCulture)));
    }

    private static string Format(Timestamp? timestamp) => timestamp is null ? string.Empty : Format(timestamp.ToDateTimeOffset());

    private static string Format(DateTimeOffset instant) =>
        instant.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    private static string SideName(Proto.Side side) => side switch
    {
        Proto.Side.Buy => "BUY",
        Proto.Side.Sell => "SELL",
        _ => string.Empty,
    };

    private static string StatusName(Proto.TradeStatus status) => status switch
    {
        Proto.TradeStatus.Active => "ACTIVE",
        Proto.TradeStatus.Cancelled => "CANCELLED",
        _ => string.Empty,
    };
}
