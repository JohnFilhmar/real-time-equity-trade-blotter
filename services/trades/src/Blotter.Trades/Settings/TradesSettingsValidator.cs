using Blotter.ServiceDefaults.Configuration;
using FluentValidation;

namespace Blotter.Trades.Settings;

/// <summary>The rules <see cref="TradesSettings"/> must pass before the service will start.</summary>
internal sealed class TradesSettingsValidator : AbstractValidator<TradesSettings>
{
    /// <summary>Declares the rules.</summary>
    public TradesSettingsValidator()
    {
        RuleFor(settings => settings.DatabaseConnection).NotEmpty().WithMessage("is required");
        RuleFor(settings => settings.JwtAccessSecret).SigningSecret();
        RuleFor(settings => settings.RabbitMqUrl)
            .Must(url => Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "amqp" or "amqps")
            .When(settings => settings.OutboxDispatchEnabled)
            .WithMessage("must be an amqp:// or amqps:// URL when OUTBOX_DISPATCH_ENABLED is true");
        RuleFor(settings => settings.HttpPort).InclusiveBetween(1, 65_535);
        RuleFor(settings => settings.GrpcPort).InclusiveBetween(1, 65_535).NotEqual(settings => settings.HttpPort);
        RuleFor(settings => settings.SeedTradeCount).InclusiveBetween(0, 5_000);
        RuleFor(settings => settings.LiveFeedMinIntervalMs).InclusiveBetween(250, 600_000);
        RuleFor(settings => settings.LiveFeedMaxIntervalMs).InclusiveBetween(250, 600_000);
        RuleFor(settings => settings.LiveFeedMaxActiveTrades).InclusiveBetween(1, 100_000);
        RuleFor(settings => settings.MaxNotionalUsd).GreaterThan(0);
        RuleFor(settings => settings.MaxNotionalGbx).GreaterThan(0);
    }
}
