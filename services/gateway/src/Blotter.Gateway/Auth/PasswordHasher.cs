using System.Security.Cryptography;
using System.Text;
using Blotter.Gateway.Settings;

namespace Blotter.Gateway.Auth;

/// <summary>
/// bcrypt hashing at the configured cost. bcrypt reads only the first 72 bytes of a password, so a
/// longer one is refused rather than silently truncated, which would let two long passwords
/// authenticate each other.
/// </summary>
/// <param name="settings">The bcrypt cost.</param>
internal sealed class PasswordHasher(GatewaySettings settings)
{
    private const int MaxPasswordBytes = 72;

    private readonly Lazy<string> dummyHash = new(() =>
        BCrypt.Net.BCrypt.HashPassword(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)), settings.BcryptRounds));

    /// <summary>
    /// A hash of a random value nobody holds, made at the configured cost. A login for a username
    /// that does not exist is checked against it, so it costs the same bcrypt work as a wrong password.
    /// </summary>
    public string DummyHash => dummyHash.Value;

    /// <summary>Hashes a password for storage, salt included.</summary>
    /// <param name="password">The plaintext.</param>
    /// <returns>The bcrypt hash.</returns>
    /// <exception cref="ArgumentException">When the password is longer than bcrypt can read.</exception>
    public string Hash(string password)
    {
        if (Encoding.UTF8.GetByteCount(password) > MaxPasswordBytes)
        {
            throw new ArgumentException($"password exceeds the {MaxPasswordBytes} byte bcrypt limit", nameof(password));
        }

        return BCrypt.Net.BCrypt.HashPassword(password, settings.BcryptRounds);
    }

    /// <summary>
    /// Checks a password against a stored hash. Never throws, because on the login path every failure
    /// has to look identical from outside.
    /// </summary>
    /// <param name="password">The plaintext supplied.</param>
    /// <param name="hash">The stored hash.</param>
    /// <returns>True when they match. False for a password bcrypt would truncate, and for an unreadable hash.</returns>
    public static bool Verify(string password, string hash)
    {
        if (Encoding.UTF8.GetByteCount(password) > MaxPasswordBytes)
        {
            return false;
        }

        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }

    /// <summary>
    /// Whether a stored hash was made at another cost. Such a hash still verifies, but its timing no
    /// longer matches the dummy hash that unknown usernames are checked against.
    /// </summary>
    /// <param name="hash">A stored hash.</param>
    /// <returns>True when its cost differs from the setting. False for one bcrypt cannot read.</returns>
    public bool NeedsRehash(string hash)
    {
        try
        {
            return BCrypt.Net.BCrypt.PasswordNeedsRehash(hash, settings.BcryptRounds);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }
}
