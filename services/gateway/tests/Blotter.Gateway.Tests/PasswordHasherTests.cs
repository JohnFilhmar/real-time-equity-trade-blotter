using Blotter.Gateway.Auth;
using Blotter.Gateway.Settings;
using Xunit;
using Bcrypt = BCrypt.Net.BCrypt;

namespace Blotter.Gateway.Tests;

/// <summary>bcrypt hashing, ported from the Node API's <c>password.test.ts</c>, at the test cost of 10.</summary>
public sealed class PasswordHasherTests
{
    private static readonly GatewaySettings Settings = new() { BcryptRounds = 10 };
    private static readonly PasswordHasher Hasher = new(Settings);

    [Fact]
    public void It_accepts_the_password_it_hashed() =>
        Assert.True(PasswordHasher.Verify("correct horse battery staple", Hasher.Hash("correct horse battery staple")));

    [Fact]
    public void It_rejects_a_different_password() =>
        Assert.False(PasswordHasher.Verify("Correct horse battery staple", Hasher.Hash("correct horse battery staple")));

    [Fact]
    public void It_never_stores_the_password() =>
        Assert.DoesNotContain("correct horse battery staple", Hasher.Hash("correct horse battery staple"), StringComparison.Ordinal);

    [Fact]
    public void It_salts_so_the_same_password_hashes_differently_every_time()
    {
        var first = Hasher.Hash("the same password");
        var second = Hasher.Hash("the same password");

        Assert.NotEqual(first, second);
        Assert.True(PasswordHasher.Verify("the same password", second));
    }

    [Fact]
    public void It_refuses_to_hash_a_password_bcrypt_would_silently_truncate()
    {
        var error = Assert.Throws<ArgumentException>(() => Hasher.Hash(new string('a', 73)));
        Assert.Contains("72 byte", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void It_fails_a_too_long_password_at_verification_rather_than_truncating_it() =>
        Assert.False(PasswordHasher.Verify(new string('a', 73), Hasher.Hash(new string('a', 72))));

    [Fact]
    public void It_does_not_throw_on_a_hash_it_cannot_read() =>
        Assert.False(PasswordHasher.Verify("anything", "not-a-bcrypt-hash"));

    [Fact]
    public void The_dummy_hash_is_made_at_the_configured_cost_so_a_missing_account_costs_what_a_real_one_does() =>
        Assert.Equal("10", Bcrypt.InterrogateHash(Hasher.DummyHash).WorkFactor);

    [Fact]
    public void The_dummy_hash_matches_none_of_the_passwords_a_guesser_would_try_first()
    {
        Assert.False(PasswordHasher.Verify(string.Empty, Hasher.DummyHash));
        Assert.False(PasswordHasher.Verify("password", Hasher.DummyHash));
    }

    [Fact]
    public void The_dummy_hash_is_different_every_time_so_there_is_no_fixed_value_to_learn() =>
        Assert.NotEqual(new PasswordHasher(Settings).DummyHash, new PasswordHasher(Settings).DummyHash);

    [Fact]
    public void A_hash_made_at_the_configured_cost_needs_no_rehash() =>
        Assert.False(Hasher.NeedsRehash(Hasher.Hash("the same password")));

    [Fact]
    public void A_hash_made_at_a_different_cost_needs_a_rehash() =>
        Assert.True(Hasher.NeedsRehash(Bcrypt.HashPassword("the same password", 4)));

    [Fact]
    public void Checking_a_hash_it_cannot_read_for_a_rehash_does_not_throw() =>
        Assert.False(Hasher.NeedsRehash("not-a-bcrypt-hash"));
}
