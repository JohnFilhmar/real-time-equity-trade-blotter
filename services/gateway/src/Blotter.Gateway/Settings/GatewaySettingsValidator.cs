using Blotter.ServiceDefaults.Configuration;
using FluentValidation;

namespace Blotter.Gateway.Settings;

/// <summary>The rules <see cref="GatewaySettings"/> must pass before the gateway will start.</summary>
internal sealed class GatewaySettingsValidator : AbstractValidator<GatewaySettings>
{
    /// <summary>Declares the rules.</summary>
    public GatewaySettingsValidator()
    {
        RuleFor(settings => settings.DatabaseConnection).NotEmpty().WithMessage("is required");
        RuleFor(settings => settings.RedisConnection).NotEmpty().WithMessage("is required");
        RuleFor(settings => settings.TradesGrpcUrl)
            .Must(url => Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https")
            .WithMessage("must be an absolute http or https URL");
        RuleFor(settings => settings.JwtAccessSecret).SigningSecret();
        RuleFor(settings => settings.JwtRefreshSecret)
            .SigningSecret()
            .NotEqual(settings => settings.JwtAccessSecret)
            .WithMessage("must differ from JWT_ACCESS_SECRET, or a refresh token would pass as an access token");
        RuleFor(settings => settings.AccessTokenTtlSeconds).InclusiveBetween(1, 3_600);
        RuleFor(settings => settings.RefreshTokenTtlSeconds).GreaterThan(0);
        RuleFor(settings => settings.BcryptRounds).InclusiveBetween(10, 15);
        RuleFor(settings => settings.CorsOrigins).OriginList();
        RuleFor(settings => settings.AuthRateLimit).GreaterThan(0);
        RuleFor(settings => settings.ReadRateLimit).GreaterThan(0);
        RuleFor(settings => settings.WriteRateLimit).GreaterThan(0);
        RuleFor(settings => settings.LoginMaxAttempts).InclusiveBetween(1, 100);
        RuleFor(settings => settings.LoginLockoutSeconds).GreaterThan(0);
        RuleFor(settings => settings.SeedUserPassword).MinimumLength(8);
        RuleFor(settings => settings.HttpPort).InclusiveBetween(1, 65_535);
    }
}
