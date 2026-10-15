using System.Threading.Channels;
using StackExchange.Redis;
using Testcontainers.Redis;
using Xunit;

[assembly: AssemblyFixture(typeof(Blotter.Gateway.Tests.Fixtures.RedisFixture))]

namespace Blotter.Gateway.Tests.Fixtures;

/// <summary>A leased Redis logical database, returned to the pool on dispose.</summary>
/// <param name="connectionString">StackExchange.Redis configuration selecting the leased database.</param>
/// <param name="release">Returns the database to the pool.</param>
public sealed class RedisLease(string connectionString, Action release) : IDisposable
{
    /// <summary>StackExchange.Redis configuration selecting the leased database.</summary>
    public string ConnectionString => connectionString;

    /// <inheritdoc />
    public void Dispose() => release();
}

/// <summary>
/// One real Redis for the whole run. Each environment leases one of its sixteen logical databases,
/// flushed on the way out of the pool, so sessions, lockouts and rate-limit windows never leak
/// between test classes and no class pays for a container of its own.
/// </summary>
public sealed class RedisFixture : IAsyncLifetime
{
    /// <summary>The image the compose file runs.</summary>
    public const string Image = "redis:8.10.2-alpine";

    private const int Databases = 16;

    private readonly RedisContainer container = new RedisBuilder(Image).Build();
    private readonly Channel<int> free = Channel.CreateBounded<int>(Databases);
    private ConnectionMultiplexer? admin;

    /// <summary>The server with no database chosen, for tests that talk to Redis directly.</summary>
    public string ServerConnectionString => container.GetConnectionString();

    /// <summary>Waits for a free logical database and empties it.</summary>
    /// <returns>The lease. Dispose it when the environment stops.</returns>
    public async Task<RedisLease> LeaseAsync()
    {
        var index = await free.Reader.ReadAsync();
        await admin!.GetServer(admin.GetEndPoints()[0]).FlushDatabaseAsync(index);
        return new RedisLease($"{container.GetConnectionString()},defaultDatabase={index}", () => free.Writer.TryWrite(index));
    }

    /// <inheritdoc />
    public async ValueTask InitializeAsync()
    {
        await container.StartAsync();
        admin = await ConnectionMultiplexer.ConnectAsync($"{container.GetConnectionString()},allowAdmin=true");
        for (var index = 0; index < Databases; index++)
        {
            free.Writer.TryWrite(index);
        }
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        if (admin is not null)
        {
            await admin.DisposeAsync();
        }

        await container.DisposeAsync();
    }
}
