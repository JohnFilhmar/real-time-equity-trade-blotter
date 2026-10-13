namespace Blotter.Trades.Domain;

/// <summary>Which rule a request broke, which decides the gRPC status and, at the gateway, the HTTP status.</summary>
internal enum TradeRuleKind
{
    /// <summary>The input breaks a business rule. 422 at the gateway.</summary>
    Invalid,

    /// <summary>The caller may not act on this trade. 403 at the gateway.</summary>
    Forbidden,

    /// <summary>The trade does not exist. 404 at the gateway.</summary>
    NotFound,

    /// <summary>The trade moved on or is cancelled. 409 at the gateway.</summary>
    Conflict,
}

/// <summary>One field-level problem, carried to the client as <c>{field, message}</c>.</summary>
/// <param name="Field">The wire name of the field, such as <c>quantity</c>.</param>
/// <param name="Message">The sentence a trader reads under that field.</param>
internal sealed record FieldError(string Field, string Message);

/// <summary>
/// A request the trade rules refused. The message is always safe to show a client. Anything else
/// thrown inside the service is unexpected and never reaches a client in detail.
/// </summary>
internal sealed class TradeRuleViolation : Exception
{
    private TradeRuleViolation(TradeRuleKind kind, string message, IReadOnlyList<FieldError> fieldErrors)
        : base(message)
    {
        Kind = kind;
        FieldErrors = fieldErrors;
    }

    /// <summary>Which rule was broken.</summary>
    public TradeRuleKind Kind { get; }

    /// <summary>Field-level detail. Empty when the problem is not about one field.</summary>
    public IReadOnlyList<FieldError> FieldErrors { get; }

    /// <summary>A trade that does not exist.</summary>
    /// <param name="tradeId">The business id that missed.</param>
    /// <returns>The violation, worded as the Node API worded it.</returns>
    public static TradeRuleViolation NotFound(string tradeId) => new(TradeRuleKind.NotFound, $"trade {tradeId} was not found", []);

    /// <summary>A write that lost a race or targeted a cancelled trade.</summary>
    /// <param name="message">What conflicted, in terms the client can act on.</param>
    /// <returns>The violation.</returns>
    public static TradeRuleViolation Conflict(string message) => new(TradeRuleKind.Conflict, message, []);

    /// <summary>A caller acting on a trade they may not touch.</summary>
    /// <param name="message">What was refused.</param>
    /// <returns>The violation.</returns>
    public static TradeRuleViolation Forbidden(string message) => new(TradeRuleKind.Forbidden, message, []);

    /// <summary>Input that breaks a rule a schema cannot express, such as the desk limit.</summary>
    /// <param name="message">What was rejected.</param>
    /// <param name="fieldErrors">Field-level detail, if any.</param>
    /// <returns>The violation.</returns>
    public static TradeRuleViolation Invalid(string message, params FieldError[] fieldErrors) =>
        new(TradeRuleKind.Invalid, message, fieldErrors);
}
