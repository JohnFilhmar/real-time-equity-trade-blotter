using Blotter.Contracts.Reference;

namespace Blotter.Gateway.Http;

/// <summary>
/// A refusal the client should see, with its status, code, detail and field errors. Anything thrown
/// that is not one of these is unexpected and reaches the client as a bare 500.
/// </summary>
internal sealed class ApiProblem : Exception
{
    private ApiProblem(int status, string code, string detail, IReadOnlyList<ProblemFieldError>? errors = null, int? retryAfterSeconds = null)
        : base(detail)
    {
        Status = status;
        Code = code;
        Errors = errors is { Count: > 0 } ? errors : null;
        RetryAfterSeconds = retryAfterSeconds;
    }

    /// <summary>The HTTP status.</summary>
    public int Status { get; }

    /// <summary>The machine-readable code, one of <see cref="ProblemCodes"/>.</summary>
    public string Code { get; }

    /// <summary>Field-level detail, or null when the problem is not about fields.</summary>
    public IReadOnlyList<ProblemFieldError>? Errors { get; }

    /// <summary>Whole seconds until a retry can succeed, sent as <c>Retry-After</c>.</summary>
    public int? RetryAfterSeconds { get; }

    /// <summary>A 422 whose field errors say everything, with the shared generic detail.</summary>
    /// <param name="errors">The field errors.</param>
    /// <returns>The problem.</returns>
    public static ApiProblem Validation(IReadOnlyList<ProblemFieldError> errors) =>
        new(StatusCodes.Status422UnprocessableEntity, ProblemCodes.ValidationFailed, TradeRules.Messages.FieldsFailed, errors);

    /// <summary>A 422 for a rule with its own sentence, such as the desk limit.</summary>
    /// <param name="detail">The sentence.</param>
    /// <param name="errors">Optional field errors.</param>
    /// <returns>The problem.</returns>
    public static ApiProblem Validation(string detail, IReadOnlyList<ProblemFieldError>? errors = null) =>
        new(StatusCodes.Status422UnprocessableEntity, ProblemCodes.ValidationFailed, detail, errors);

    /// <summary>A 400 for a body that is not JSON. The Node API answered these with a 500, which was a bug.</summary>
    /// <returns>The problem.</returns>
    public static ApiProblem MalformedBody() =>
        new(StatusCodes.Status400BadRequest, ProblemCodes.ValidationFailed, "The request body is not valid JSON.");

    /// <summary>A 413 for a body over the 100 kB limit. The Node API answered these with a 500 too.</summary>
    /// <returns>The problem.</returns>
    public static ApiProblem BodyTooLarge() =>
        new(StatusCodes.Status413PayloadTooLarge, ProblemCodes.ValidationFailed, "The request body is larger than 100 kB.");

    /// <summary>A 401, worded the same whichever way authentication failed.</summary>
    /// <param name="detail">What the client is told.</param>
    /// <returns>The problem.</returns>
    public static ApiProblem Unauthenticated(string detail = "Authentication is required") =>
        new(StatusCodes.Status401Unauthorized, ProblemCodes.Unauthenticated, detail);

    /// <summary>A 403.</summary>
    /// <param name="detail">What was refused.</param>
    /// <returns>The problem.</returns>
    public static ApiProblem Forbidden(string detail) => new(StatusCodes.Status403Forbidden, ProblemCodes.Forbidden, detail);

    /// <summary>A 404.</summary>
    /// <param name="detail">What was not found.</param>
    /// <returns>The problem.</returns>
    public static ApiProblem NotFound(string detail) => new(StatusCodes.Status404NotFound, ProblemCodes.NotFound, detail);

    /// <summary>A 409.</summary>
    /// <param name="detail">What conflicted.</param>
    /// <returns>The problem.</returns>
    public static ApiProblem Conflict(string detail) => new(StatusCodes.Status409Conflict, ProblemCodes.Conflict, detail);

    /// <summary>A 429 for a locked account, with the wait in the detail and in <c>Retry-After</c>.</summary>
    /// <param name="seconds">Seconds until the account unlocks.</param>
    /// <returns>The problem.</returns>
    public static ApiProblem LockedOut(int seconds) => new(
        StatusCodes.Status429TooManyRequests,
        ProblemCodes.LockedOut,
        $"Too many failed attempts. Try again in {seconds} seconds.",
        retryAfterSeconds: seconds);

    /// <summary>A 500 for anything unexpected.</summary>
    /// <param name="detail">The detail, which in Production says nothing about the cause.</param>
    /// <returns>The problem.</returns>
    public static ApiProblem Internal(string detail) =>
        new(StatusCodes.Status500InternalServerError, ProblemCodes.Internal, detail);

    /// <summary>A 503 when the trades service cannot be reached.</summary>
    /// <returns>The problem.</returns>
    public static ApiProblem Unavailable() =>
        new(StatusCodes.Status503ServiceUnavailable, ProblemCodes.Internal, "The trade service is unavailable. Try again shortly.");
}
