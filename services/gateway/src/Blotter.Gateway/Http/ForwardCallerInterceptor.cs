using Blotter.ServiceDefaults.Http;
using Grpc.Core;
using Grpc.Core.Interceptors;

namespace Blotter.Gateway.Http;

/// <summary>
/// Forwards the caller's own access token and correlation id on every call to the trades service.
/// The trades service verifies the token again rather than trusting the gateway, and the shared
/// request id ties both services' logs for one request together. Calls stop after ten seconds.
/// </summary>
/// <param name="accessor">The current HTTP request.</param>
internal sealed class ForwardCallerInterceptor(IHttpContextAccessor accessor) : Interceptor
{
    private static readonly TimeSpan Deadline = TimeSpan.FromSeconds(10);

    /// <inheritdoc />
    public override AsyncUnaryCall<TResponse> AsyncUnaryCall<TRequest, TResponse>(
        TRequest request,
        ClientInterceptorContext<TRequest, TResponse> context,
        AsyncUnaryCallContinuation<TRequest, TResponse> continuation)
    {
        ArgumentNullException.ThrowIfNull(continuation);

        var http = accessor.HttpContext;
        var headers = context.Options.Headers ?? [];

        if (http is not null)
        {
            var authorization = http.Request.Headers.Authorization.ToString();
            if (authorization.Length > 0)
            {
                headers.Add("authorization", authorization);
            }

            headers.Add(RequestIds.HeaderName, http.TraceIdentifier);
        }

        var options = context.Options
            .WithHeaders(headers)
            .WithDeadline(DateTime.UtcNow.Add(Deadline))
            .WithCancellationToken(http?.RequestAborted ?? context.Options.CancellationToken);

        return continuation(request, new ClientInterceptorContext<TRequest, TResponse>(context.Method, context.Host, options));
    }
}
