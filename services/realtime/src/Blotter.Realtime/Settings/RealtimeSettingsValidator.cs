using Blotter.ServiceDefaults.Configuration;
using FluentValidation;

namespace Blotter.Realtime.Settings;

/// <summary>The rules <see cref="RealtimeSettings"/> must pass before the service will start.</summary>
internal sealed class RealtimeSettingsValidator : AbstractValidator<RealtimeSettings>
{
    /// <summary>Declares the rules.</summary>
    public RealtimeSettingsValidator()
    {
        RuleFor(settings => settings.RabbitMqUrl)
            .Must(url => Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "amqp" or "amqps")
            .WithMessage("must be an amqp:// or amqps:// URL");
        RuleFor(settings => settings.RedisConnection).NotEmpty().WithMessage("is required");
        RuleFor(settings => settings.JwtAccessSecret).SigningSecret();
        RuleFor(settings => settings.CorsOrigins).OriginList();
        RuleFor(settings => settings.HttpPort).InclusiveBetween(1, 65_535);
        RuleFor(settings => settings.MarkIntervalMs).InclusiveBetween(50, 60_000);
    }
}
