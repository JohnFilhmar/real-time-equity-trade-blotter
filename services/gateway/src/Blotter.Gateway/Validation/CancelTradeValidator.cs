namespace Blotter.Gateway.Validation;

/// <summary><c>cancel_trade_schema</c>: an optional version guard. A request with no body is an empty object.</summary>
internal sealed class CancelTradeValidator : BodyValidator
{
    /// <summary>Declares the rules.</summary>
    public CancelTradeValidator() =>
        Field("version", body => body.Has("version") ? BodyChecks.Version(body["version"]) : Check.Pass);
}
