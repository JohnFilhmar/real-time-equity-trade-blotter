using Microsoft.AspNetCore.Http;
using Serilog.Context;

namespace Blotter.ServiceDefaults.Http;

/// <summary>
/// Assigns the request's correlation id, as <see cref="HttpContext.TraceIdentifier"/>, on the
/// response header, and on every log line written while the request runs.
/// </summary>
/// <param name="next">The rest of the pipeline.</param>
internal sealed class RequestIdMiddleware(RequestDelegate next)
{
    /// <summary>Runs the middleware.</summary>
    /// <param name="context">The request.</param>
    /// <returns>A task that completes with the request.</returns>
    public async Task InvokeAsync(HttpContext context)
    {
        var supplied = context.Request.Headers[RequestIds.HeaderName].ToString();
        var id = RequestIds.IsAcceptable(supplied) ? supplied : Guid.NewGuid().ToString();

        context.TraceIdentifier = id;
        context.Response.Headers[RequestIds.HeaderName] = id;

        using (LogContext.PushProperty("request_id", id))
        {
            await next(context);
        }
    }
}
