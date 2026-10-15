using Blotter.Contracts.Reference;
using Blotter.Contracts.Wire;
using Blotter.Trades.Domain;
using Blotter.Trades.Repositories;
using Blotter.Trades.Services;
using Blotter.Trades.Settings;

namespace Blotter.Trades.Simulation;

/// <summary>
/// Simulates a trading desk so the blotter moves without anyone clicking. It writes through
/// <see cref="TradeService"/> as an ADMIN actor with source LIVE_FEED, so its trades take the same
/// validation, transitions and broadcasts as a person's. It books, amends and cancels at a 70/20/10
/// mix on a jittered 3 to 8 second interval, keeps its book near a cap, and leans each new ticket's
/// side against the symbol's position. Conflicts from racing a real user are expected and ignored;
/// any other failure is logged and the next tick runs anyway.
/// </summary>
/// <param name="scopes">Creates a database scope per tick.</param>
/// <param name="settings">Pacing and the book cap.</param>
/// <param name="clock">The clock ticks are scheduled on and tickets are stamped with.</param>
/// <param name="random">The desk's random source. Seeded in tests.</param>
/// <param name="logger">Where failures are reported.</param>
internal sealed partial class LiveFeed(
    IServiceScopeFactory scopes,
    TradesSettings settings,
    TimeProvider clock,
    Random random,
    ILogger<LiveFeed> logger) : BackgroundService
{
    /// <summary>
    /// Runs one action. Exposed so tests can drive the desk tick by tick without waiting on a timer.
    /// </summary>
    /// <param name="cancellationToken">Stops the action.</param>
    /// <returns>A task that completes when the action did, or failed.</returns>
    internal async Task TickAsync(CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var trades = scope.ServiceProvider.GetRequiredService<TradeService>();
        var repository = scope.ServiceProvider.GetRequiredService<TradeRepository>();
        var drawn = Draw();

        try
        {
            var active = drawn == FeedAction.Create ? await repository.CountActiveAsync(cancellationToken) : 0;
            var action = FeedRules.ChooseAction(drawn, active, settings.LiveFeedMaxActiveTrades, random.NextDouble());

            switch (action)
            {
                case FeedAction.Create:
                    await BookAsync(trades, cancellationToken);
                    break;
                case FeedAction.Amend:
                    await AmendAsync(trades, repository, cancellationToken);
                    break;
                default:
                    await CancelAsync(trades, repository, cancellationToken);
                    break;
            }
        }
        catch (TradeRuleViolation violation) when (violation.Kind is TradeRuleKind.Conflict or TradeRuleKind.NotFound)
        {
            // A real user moved the same trade first. That is the race this desk is meant to survive.
        }
#pragma warning disable CA1031 // A simulated desk must never take the service down with it.
        catch (Exception error) when (error is not OperationCanceledException)
#pragma warning restore CA1031
        {
            LogActionFailed(logger, error);
        }
    }

    /// <inheritdoc />
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var shortest = Math.Min(settings.LiveFeedMinIntervalMs, settings.LiveFeedMaxIntervalMs);
        var longest = Math.Max(settings.LiveFeedMinIntervalMs, settings.LiveFeedMaxIntervalMs);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(random.Next(shortest, longest + 1)), clock, stoppingToken);
                await TickAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down.
        }
    }

    private static TradeActor ActorFor(string traderCode) => new(traderCode, Role.Admin, TradeEventSource.LiveFeed);

    private FeedAction Draw()
    {
        var roll = random.Next(100);
        return roll < 70 ? FeedAction.Create : roll < 90 ? FeedAction.Amend : FeedAction.Cancel;
    }

    private async Task BookAsync(TradeService trades, CancellationToken cancellationToken)
    {
        var instrument = Instruments.All[random.Next(Instruments.All.Count)];
        var position = await trades.PositionForAsync(instrument.Symbol, cancellationToken);
        var side = FeedRules.LeanSide(position.NetQuantity, random.NextDouble());
        var (ticket, trader) = TradeGenerator.LiveTrade(random, instrument, side, Timestamps.Now(clock));

        await trades.CreateAsync(ticket, ActorFor(trader), cancellationToken);
    }

    private async Task AmendAsync(TradeService trades, TradeRepository repository, CancellationToken cancellationToken)
    {
        var target = FeedRules.AmendsRecent(random.NextDouble())
            ? PickOne(await repository.FindNewestActiveAsync(FeedRules.RecentAmendWindow, cancellationToken))
            : await PickAnyActiveAsync(repository, cancellationToken);

        if (target is null)
        {
            await BookAsync(trades, cancellationToken);
            return;
        }

        await trades.AmendAsync(
            target.TradeId,
            target.Version,
            TradeGenerator.LiveAmendment(random, target.Price),
            ActorFor(target.Trader),
            cancellationToken);
    }

    private async Task CancelAsync(TradeService trades, TradeRepository repository, CancellationToken cancellationToken)
    {
        var target = await PickAnyActiveAsync(repository, cancellationToken);

        if (target is null)
        {
            await BookAsync(trades, cancellationToken);
            return;
        }

        await trades.CancelAsync(target.TradeId, target.Version, ActorFor(target.Trader), cancellationToken);
    }

    private async Task<Trade?> PickAnyActiveAsync(TradeRepository repository, CancellationToken cancellationToken)
    {
        var count = await repository.CountActiveAsync(cancellationToken);
        return count == 0 ? null : await repository.FindActiveByAgeAsync(random.Next(count), cancellationToken);
    }

    private Trade? PickOne(IReadOnlyList<Trade> candidates) =>
        candidates.Count == 0 ? null : candidates[random.Next(candidates.Count)];

    [LoggerMessage(Level = LogLevel.Warning, Message = "Simulated desk action failed")]
    private static partial void LogActionFailed(ILogger logger, Exception error);
}
