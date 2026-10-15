namespace Blotter.Gateway.Validation;

/// <summary>
/// What one field's rules said about one value, in Zod's terms. Zod stops an object-level refine,
/// such as "trade time cannot be in the future", when any field failed at the type level: missing,
/// the wrong JSON type, not one of an enum's values, or not a whole number. A range or length failure
/// does not stop it. <see cref="Aborted"/> records which kind of failure this was.
/// </summary>
/// <param name="Messages">The field's messages, in the order Zod reports them. Empty when it passed.</param>
/// <param name="Aborted">True when the failure was type-level, which suppresses object-level refines.</param>
internal readonly record struct Check(IReadOnlyList<string> Messages, bool Aborted)
{
    /// <summary>The value passed.</summary>
    public static Check Pass { get; } = new([], false);

    /// <summary>Whether the value passed.</summary>
    public bool Ok => Messages.Count == 0;

    /// <summary>A type-level failure.</summary>
    /// <param name="message">The single message Zod reports for it.</param>
    /// <returns>The failed check.</returns>
    public static Check Abort(string message) => new([message], true);

    /// <summary>A failure of one or more checks on a value of the right type.</summary>
    /// <param name="messages">Every failing check's message, in order. None means the value passed.</param>
    /// <returns>The check.</returns>
    public static Check Fail(params string[] messages) => messages.Length == 0 ? Pass : new(messages, false);
}
