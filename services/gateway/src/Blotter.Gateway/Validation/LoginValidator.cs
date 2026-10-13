using System.Text.Json;
using System.Text.RegularExpressions;
using Blotter.Gateway.Validation.JavaScript;

namespace Blotter.Gateway.Validation;

/// <summary>
/// <c>login_request_schema</c>: a trimmed username of letters, digits, dots, underscores and dashes,
/// up to 64 characters, and a password up to 200. An empty username breaks two rules and reports both.
/// </summary>
internal sealed partial class LoginValidator : BodyValidator
{
    /// <summary>Username missing, not text, or empty.</summary>
    public const string EnterUsername = "Enter your username";

    /// <summary>Password missing, not text, or empty.</summary>
    public const string EnterPassword = "Enter your password";

    /// <summary>Declares the rules.</summary>
    public LoginValidator()
    {
        Field("username", body => Username(body["username"]));
        Field("password", body => Password(body["password"]));
    }

    private static Check Username(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.String)
        {
            return Check.Abort(EnterUsername);
        }

        var username = JsText.Trim(value.GetString()!);
        var messages = new List<string>();
        if (username.Length < 1)
        {
            messages.Add(EnterUsername);
        }

        if (username.Length > 64)
        {
            messages.Add("Username cannot be longer than 64 characters");
        }

        if (!UsernameCharacters().IsMatch(username))
        {
            messages.Add("Username can only use letters, numbers, dots, underscores and dashes");
        }

        return Check.Fail([.. messages]);
    }

    private static Check Password(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.String)
        {
            return Check.Abort(EnterPassword);
        }

        var password = value.GetString()!;
        return password.Length < 1 ? Check.Fail(EnterPassword)
            : password.Length > 200 ? Check.Fail("Password cannot be longer than 200 characters")
            : Check.Pass;
    }

    [GeneratedRegex(@"^[A-Za-z0-9._-]+\z", RegexOptions.CultureInvariant)]
    private static partial Regex UsernameCharacters();
}
