using Blotter.ServiceDefaults.Auth;
using FluentValidation;

namespace Blotter.ServiceDefaults.Configuration;

/// <summary>Validation rules more than one service's settings share.</summary>
public static class SettingRules
{
    /// <summary>
    /// A JWT signing secret of at least <see cref="AccessTokens.MinimumSecretLength"/> characters.
    /// A token signed with a guessable secret is not signed, so a short one stops the boot.
    /// </summary>
    /// <typeparam name="T">The settings type.</typeparam>
    /// <param name="rule">The rule being built.</param>
    /// <returns>The rule, for chaining.</returns>
    public static IRuleBuilderOptions<T, string> SigningSecret<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty()
            .MinimumLength(AccessTokens.MinimumSecretLength)
            .WithMessage($"must be at least {AccessTokens.MinimumSecretLength} characters");

    /// <summary>A comma-separated list of absolute http or https origins, such as <c>http://localhost:3000</c>.</summary>
    /// <typeparam name="T">The settings type.</typeparam>
    /// <param name="rule">The rule being built.</param>
    /// <returns>The rule, for chaining.</returns>
    public static IRuleBuilderOptions<T, string> OriginList<T>(this IRuleBuilder<T, string> rule) =>
        rule.Must(value => ParseOrigins(value).All(IsOrigin))
            .WithMessage("must be a comma-separated list of http or https origins");

    /// <summary>Splits a comma-separated origin list, trimming each entry and dropping empty ones.</summary>
    /// <param name="value">The raw setting.</param>
    /// <returns>The origins, in order.</returns>
    public static string[] ParseOrigins(string value) =>
        [.. (value ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)];

    private static bool IsOrigin(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
        && uri.AbsolutePath == "/"
        && !value.EndsWith('/');
}
