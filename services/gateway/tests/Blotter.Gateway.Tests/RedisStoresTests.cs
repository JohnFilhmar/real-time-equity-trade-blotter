using Blotter.Gateway.Auth;
using Blotter.Gateway.Settings;
using Blotter.Gateway.Tests.Fixtures;
using StackExchange.Redis;
using Xunit;

namespace Blotter.Gateway.Tests;

/// <summary>
/// The refresh store and the login-attempt counter against real Redis, ported from the Node API's
/// <c>refresh_store.integration.test.ts</c>. Each test leases an empty Redis database of its own.
/// </summary>
/// <param name="redis">The shared Redis.</param>
public sealed class RedisStoresTests(RedisFixture redis) : IAsyncLifetime
{
    private static readonly GatewaySettings Settings = new();

    private RedisLease? lease;
    private ConnectionMultiplexer? connection;

    private RefreshStore Refresh => new(connection!, Settings);

    private LoginAttempts Attempts => new(connection!, Settings);

    [Fact]
    public async Task A_family_rotates_to_its_next_token()
    {
        var (family, first) = (Guid.NewGuid(), Guid.NewGuid());
        await Refresh.StartAsync(family, first);

        Assert.Equal(RefreshOutcome.Rotated, await Refresh.RotateAsync(family, first, Guid.NewGuid()));
    }

    [Fact]
    public async Task After_a_rotation_the_new_token_is_accepted_and_the_old_one_is_not()
    {
        var (family, first, second) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        await Refresh.StartAsync(family, first);
        await Refresh.RotateAsync(family, first, second);

        Assert.Equal(RefreshOutcome.Rotated, await Refresh.RotateAsync(family, second, Guid.NewGuid()));
    }

    [Fact]
    public async Task A_replayed_token_is_detected_and_destroys_the_family()
    {
        var (family, first, second) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        await Refresh.StartAsync(family, first);
        await Refresh.RotateAsync(family, first, second);

        Assert.Equal(RefreshOutcome.Reused, await Refresh.RotateAsync(family, first, Guid.NewGuid()));
        Assert.Equal(RefreshOutcome.Unknown, await Refresh.RotateAsync(family, second, Guid.NewGuid()));
    }

    [Fact]
    public async Task An_unknown_family_is_reported_rather_than_invented() =>
        Assert.Equal(RefreshOutcome.Unknown, await Refresh.RotateAsync(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()));

    [Fact]
    public async Task Revoking_ends_a_family()
    {
        var (family, token) = (Guid.NewGuid(), Guid.NewGuid());
        await Refresh.StartAsync(family, token);
        await Refresh.RevokeAsync(family);

        Assert.Equal(RefreshOutcome.Unknown, await Refresh.RotateAsync(family, token, Guid.NewGuid()));
    }

    [Fact]
    public async Task Rotation_is_atomic_so_two_requests_with_the_same_token_cannot_both_succeed()
    {
        var (family, first) = (Guid.NewGuid(), Guid.NewGuid());
        await Refresh.StartAsync(family, first);

        var outcomes = await Task.WhenAll(Refresh.RotateAsync(family, first, Guid.NewGuid()), Refresh.RotateAsync(family, first, Guid.NewGuid()));

        Assert.Equal([RefreshOutcome.Rotated, RefreshOutcome.Reused], outcomes.Order());
    }

    [Fact]
    public async Task An_account_that_has_not_failed_is_not_locked() =>
        Assert.Equal(0, await Attempts.SecondsLockedAsync($"user_{Guid.NewGuid()}"));

    [Fact]
    public async Task An_account_locks_once_its_failures_reach_the_limit()
    {
        var username = $"user_{Guid.NewGuid()}";
        for (var failure = 0; failure < 5; failure++)
        {
            await Attempts.RecordFailureAsync(username);
        }

        Assert.InRange(await Attempts.SecondsLockedAsync(username), 899, 900);
    }

    [Fact]
    public async Task The_same_account_is_counted_whatever_case_it_is_typed_in()
    {
        var username = $"User_{Guid.NewGuid()}";
        for (var failure = 0; failure < 5; failure++)
        {
            await Attempts.RecordFailureAsync(username.ToLowerInvariant());
        }

        Assert.True(await Attempts.SecondsLockedAsync(username.ToUpperInvariant()) > 0);
    }

    [Fact]
    public async Task A_successful_login_clears_the_count()
    {
        var username = $"user_{Guid.NewGuid()}";
        for (var failure = 0; failure < 5; failure++)
        {
            await Attempts.RecordFailureAsync(username);
        }

        await Attempts.ClearAsync(username);

        Assert.Equal(0, await Attempts.SecondsLockedAsync(username));
    }

    /// <inheritdoc />
    public async ValueTask InitializeAsync()
    {
        lease = await redis.LeaseAsync();
        connection = await ConnectionMultiplexer.ConnectAsync(lease.ConnectionString);
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (connection is not null)
        {
            await connection.DisposeAsync();
        }

        lease?.Dispose();
    }
}
