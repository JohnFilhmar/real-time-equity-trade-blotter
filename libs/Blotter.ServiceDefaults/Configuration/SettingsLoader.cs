using FluentValidation;
using Microsoft.Extensions.Configuration;

namespace Blotter.ServiceDefaults.Configuration;

/// <summary>
/// Reads a service's settings once, at boot, and refuses to start when any of them is missing or
/// malformed. This is the .NET form of the Node API's <c>env.ts</c>: one schema parsed up front, so
/// a bad variable never surfaces as a null deep inside a request.
/// </summary>
public static class SettingsLoader
{
    /// <summary>Binds and validates a settings type from configuration, usually environment variables.</summary>
    /// <typeparam name="TSettings">The settings type. Properties name their variables with <c>ConfigurationKeyName</c>.</typeparam>
    /// <typeparam name="TValidator">The FluentValidation rules for it.</typeparam>
    /// <param name="configuration">The application configuration.</param>
    /// <returns>The validated settings.</returns>
    /// <exception cref="InvalidOperationException">
    /// When validation fails. The message lists every problem at once and never echoes a value, so a
    /// weak signing secret or a connection string cannot leak into logs through the error that refused it.
    /// </exception>
    public static TSettings Load<TSettings, TValidator>(IConfiguration configuration)
        where TSettings : class, new()
        where TValidator : IValidator<TSettings>, new()
    {
        ArgumentNullException.ThrowIfNull(configuration);

        var settings = configuration.Get<TSettings>() ?? new TSettings();
        var result = new TValidator().Validate(settings);

        if (!result.IsValid)
        {
            var problems = string.Join(
                Environment.NewLine,
                result.Errors.Select(error => $"  {error.PropertyName}: {error.ErrorMessage}"));
            throw new InvalidOperationException($"Invalid environment configuration:{Environment.NewLine}{problems}");
        }

        return settings;
    }
}
