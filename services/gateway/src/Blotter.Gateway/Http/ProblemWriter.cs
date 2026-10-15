using System.Globalization;
using System.Text.Json;
using Blotter.Contracts.Json;
using Microsoft.AspNetCore.Http.Extensions;

namespace Blotter.Gateway.Http;

/// <summary>Writes one problem document, so every error response in the gateway has the one shape.</summary>
internal static class ProblemWriter
{
    /// <summary>Writes a problem as the response.</summary>
    /// <param name="context">The request.</param>
    /// <param name="problem">The problem to send.</param>
    /// <returns>A task that completes once the body is written.</returns>
    public static Task WriteAsync(HttpContext context, ApiProblem problem) =>
        WriteAsync(context, problem.Status, problem.Code, problem.Message, problem.Errors, problem.RetryAfterSeconds);

    /// <summary>Writes a problem as the response, with <c>Retry-After</c> when a wait is known.</summary>
    /// <param name="context">The request.</param>
    /// <param name="status">The HTTP status.</param>
    /// <param name="code">The machine-readable code.</param>
    /// <param name="detail">The detail.</param>
    /// <param name="errors">Field errors, if any.</param>
    /// <param name="retryAfterSeconds">Whole seconds to wait, if known.</param>
    /// <returns>A task that completes once the body is written.</returns>
    public static async Task WriteAsync(
        HttpContext context,
        int status,
        string code,
        string detail,
        IReadOnlyList<ProblemFieldError>? errors = null,
        int? retryAfterSeconds = null)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (retryAfterSeconds is { } seconds)
        {
            context.Response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
        }

        var problem = new ProblemDocument(
            ProblemCodes.TypeFor(code),
            ProblemCodes.TitleFor(code),
            status,
            detail,
            context.Request.GetEncodedPathAndQuery(),
            code,
            errors is { Count: > 0 } ? errors : null,
            context.TraceIdentifier);

        context.Response.StatusCode = status;
        context.Response.ContentType = ProblemCodes.ContentType;
        await JsonSerializer.SerializeAsync(context.Response.Body, problem, BlotterJson.Options, context.RequestAborted);
    }
}
