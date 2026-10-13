using System.Globalization;
using System.Threading.RateLimiting;
using Blotter.Gateway.Settings;
using Microsoft.AspNetCore.Authorization;
using RedisRateLimiting;
using StackExchange.Redis;

namespace Blotter.Gateway.Http;

/// <summary>The extra limit an endpoint is subject to, on top of the read limit every guarded route has.</summary>
internal enum RateLimitTier
{
    /// <summary>The credential endpoints: strict, per client address.</summary>
    Auth,

    /// <summary>Writes, which touch the database and broadcast to everyone: moderate, per user.</summary>
    Write,
}

/// <summary>Marks an endpoint with its extra rate-limit tier.</summary>
/// <param name="tier">The tier.</param>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
internal sealed class RateLimitTierAttribute(RateLimitTier tier) : Attribute
{
    /// <summary>The tier.</summary>
    public RateLimitTier Tier { get; } = tier;
}

/// <summary>
/// The gateway's three Redis-backed fixed-window limits, run by ASP.NET Core's own rate-limiting
/// middleware as its global limiter. Reads are limited per user on every guarded route, writes per
/// user on top of that, and the credential endpoints per address. Redis rather than memory, so the
/// limits hold across replicas. Every answer carries the draft-7 <c>RateLimit</c> and
/// <c>RateLimit-Policy</c> headers the Node API sent, which the frontend's end-to-end suite reads to
/// pace itself, describing the endpoint's strictest tier.
/// </summary>
internal sealed class TieredRateLimiter : PartitionedRateLimiter<HttpContext>
{
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    private readonly (PartitionedRateLimiter<HttpContext> Limiter, int Limit)[] tiers;

    /// <summary>Builds the three tiers over one Redis connection.</summary>
    /// <param name="redis">Holds the counters.</param>
    /// <param name="settings">The per-minute limits.</param>
    public TieredRateLimiter(IConnectionMultiplexer redis, GatewaySettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);

        // Order matters for the headers: the last tier that applies is the one they describe.
        tiers =
        [
            (Tier(redis, "read", settings.ReadRateLimit, context => IsGuardedApi(context) ? ClientKeys.ForCaller(context) : null), settings.ReadRateLimit),
            (Tier(redis, "write", settings.WriteRateLimit, context => Has(context, RateLimitTier.Write) ? ClientKeys.ForCaller(context) : null), settings.WriteRateLimit),
            (Tier(redis, "auth", settings.AuthRateLimit, context => Has(context, RateLimitTier.Auth) ? ClientKeys.ForAddress(context.Connection.RemoteIpAddress) : null), settings.AuthRateLimit),
        ];
    }

    /// <inheritdoc />
    public override RateLimiterStatistics? GetStatistics(HttpContext resource) => null;

    /// <summary>Always defers to <see cref="AcquireAsyncCore"/>: the Redis limiters cannot answer synchronously.</summary>
    /// <param name="resource">The request.</param>
    /// <param name="permitCount">Permits requested.</param>
    /// <returns>A lease that was not acquired, which makes the middleware call the asynchronous path.</returns>
    protected override RateLimitLease AttemptAcquireCore(HttpContext resource, int permitCount) => Deferred.Instance;

    /// <summary>Acquires from every tier that applies, stopping at the first refusal, and writes the headers.</summary>
    /// <param name="resource">The request.</param>
    /// <param name="permitCount">Permits requested.</param>
    /// <param name="cancellationToken">Cancels the wait.</param>
    /// <returns>The refusing lease, or the strictest tier's lease when every tier allowed the request.</returns>
    protected override async ValueTask<RateLimitLease> AcquireAsyncCore(HttpContext resource, int permitCount, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(resource);

        var acquired = new List<(RateLimitLease Lease, int Limit)>(tiers.Length);
        try
        {
            foreach (var (limiter, limit) in tiers)
            {
                var lease = await limiter.AcquireAsync(resource, permitCount, cancellationToken);
                if (!lease.IsAcquired)
                {
                    WriteHeaders(resource, lease, limit);
                    return lease;
                }

                acquired.Add((lease, limit));
            }

            // Only the Redis tiers carry metadata; the no-limit partitions of tiers that do not apply do not.
            if (acquired.FindLast(entry => entry.Lease.MetadataNames.Any()) is { Lease: not null } headline)
            {
                WriteHeaders(resource, headline.Lease, headline.Limit);
                acquired.Remove(headline);
                return headline.Lease;
            }

            return Allowed.Instance;
        }
        finally
        {
            foreach (var (lease, _) in acquired)
            {
                lease.Dispose();
            }
        }
    }

    /// <summary>Whole seconds until the lease's window ends, as <c>Retry-After</c> and <c>reset</c> report it.</summary>
    /// <param name="lease">A Redis fixed-window lease.</param>
    /// <returns>The seconds, at least 1, or null when the lease does not know.</returns>
    public static int? SecondsUntilReset(RateLimitLease lease) =>
        lease.TryGetMetadata(RateLimitMetadataName.RetryAfter, out var retryAfter)
            ? Math.Max(1, retryAfter)
            : null;

    /// <inheritdoc />
    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            foreach (var (limiter, _) in tiers)
            {
                limiter.Dispose();
            }
        }

        base.Dispose(disposing);
    }

    private static PartitionedRateLimiter<HttpContext> Tier(IConnectionMultiplexer redis, string name, int limit, Func<HttpContext, string?> key) =>
        PartitionedRateLimiter.Create<HttpContext, string>(context => key(context) is { } partition
            ? RedisRateLimitPartition.GetFixedWindowRateLimiter($"{name}:{partition}", _ => new RedisFixedWindowRateLimiterOptions
            {
                ConnectionMultiplexerFactory = () => redis,
                PermitLimit = limit,
                Window = Window,
            })
            : RateLimitPartition.GetNoLimiter(string.Empty));

    private static bool IsGuardedApi(HttpContext context) =>
        context.Request.Path.StartsWithSegments("/api/v1", StringComparison.OrdinalIgnoreCase)
        && context.User.Identity?.IsAuthenticated == true
        && context.GetEndpoint()?.Metadata.GetMetadata<IAllowAnonymous>() is null;

    private static bool Has(HttpContext context, RateLimitTier tier) =>
        context.GetEndpoint()?.Metadata.GetMetadata<RateLimitTierAttribute>()?.Tier == tier;

    private static void WriteHeaders(HttpContext context, RateLimitLease lease, int limit)
    {
        var remaining = lease.TryGetMetadata(RateLimitMetadataName.Remaining, out var left) ? Math.Max(0, left) : 0;
        var reset = SecondsUntilReset(lease) ?? (int)Window.TotalSeconds;
        var window = ((int)Window.TotalSeconds).ToString(CultureInfo.InvariantCulture);

        context.Response.Headers["RateLimit-Policy"] = $"{limit.ToString(CultureInfo.InvariantCulture)};w={window}";
        context.Response.Headers["RateLimit"] = string.Create(
            CultureInfo.InvariantCulture,
            $"limit={limit}, remaining={remaining}, reset={reset}");
    }

    /// <summary>A lease that is not acquired, returned by the synchronous path so the asynchronous one runs.</summary>
    private sealed class Deferred : RateLimitLease
    {
        public static readonly Deferred Instance = new();

        public override bool IsAcquired => false;

        public override IEnumerable<string> MetadataNames => [];

        public override bool TryGetMetadata(string metadataName, out object? metadata)
        {
            metadata = null;
            return false;
        }
    }

    /// <summary>A lease for a request no tier applies to, such as a health probe.</summary>
    private sealed class Allowed : RateLimitLease
    {
        public static readonly Allowed Instance = new();

        public override bool IsAcquired => true;

        public override IEnumerable<string> MetadataNames => [];

        public override bool TryGetMetadata(string metadataName, out object? metadata)
        {
            metadata = null;
            return false;
        }
    }
}
