using Blotter.Contracts.Reference;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;

namespace Blotter.ServiceDefaults.Auth;

/// <summary>Registers access-token authentication and permission-based authorization the same way in every service.</summary>
public static class AuthExtensions
{
    /// <summary>
    /// Adds JWT bearer authentication for access tokens. Inbound claim mapping is off so claims keep
    /// the names the gateway wrote, and a token whose claims fail <see cref="AccessClaims.From"/> is
    /// rejected even when its signature is good.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <param name="accessSecret">The access-token signing secret.</param>
    /// <param name="configure">
    /// Optional extra configuration, run last. Set individual handlers on <c>options.Events</c> rather
    /// than replacing the object, or the claims check is lost.
    /// </param>
    /// <returns>The authentication builder.</returns>
    public static AuthenticationBuilder AddAccessTokenAuthentication(
        this IServiceCollection services,
        string accessSecret,
        Action<JwtBearerOptions>? configure = null)
    {
        return services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;
                options.TokenValidationParameters = AccessTokens.ValidationParameters(accessSecret);
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = context =>
                    {
                        if (AccessClaims.From(context.Principal) is null)
                        {
                            context.Fail("The access token's claims are malformed");
                        }

                        return Task.CompletedTask;
                    },
                };
                configure?.Invoke(options);
            });
    }

    /// <summary>
    /// Makes authentication the default for every endpoint, so an endpoint is public only when it says
    /// <c>AllowAnonymous</c>, and registers one policy per permission, named after it, such as
    /// <c>trade.read</c>.
    /// </summary>
    /// <param name="services">The service collection.</param>
    /// <returns>The service collection.</returns>
    public static IServiceCollection AddPermissionAuthorization(this IServiceCollection services)
    {
        var builder = services
            .AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

        foreach (var permission in Permissions.All)
        {
            builder.AddPolicy(permission, policy => policy
                .RequireAuthenticatedUser()
                .RequireAssertion(context => AccessClaims.From(context.User)?.Can(permission) == true));
        }

        return services;
    }
}
