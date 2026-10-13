using Grpc.Core;

namespace Blotter.Gateway.Http;

/// <summary>
/// Converts anything thrown while handling a request into one problem document. A refusal becomes
/// its own problem; a gRPC refusal is translated; anything else is logged in full and answered with
/// a 500 that says nothing about it in Production, so an internal message never reaches a client.
/// </summary>
/// <param name="next">The rest of the pipeline.</param>
/// <param name="environment">Decides whether a 500 may carry its message.</param>
/// <param name="logger">Where unexpected failures are recorded.</param>
internal sealed partial class ProblemMiddleware(RequestDelegate next, IHostEnvironment environment, ILogger<ProblemMiddleware> logger)
{
    /// <summary>Runs the middleware.</summary>
    /// <param name="context">The request.</param>
    /// <returns>A task that completes with the request.</returns>
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception error) when (!context.Response.HasStarted && !context.RequestAborted.IsCancellationRequested)
        {
            // Nothing has been written, and the headers already set must stay: the correlation id
            // and the rate-limit headers belong on an error as much as on a success.
            await ProblemWriter.WriteAsync(context, Translate(error));
        }
    }

    private ApiProblem Translate(Exception error)
    {
        switch (error)
        {
            case ApiProblem problem:
                return problem;
            case RpcException failure when GrpcProblems.From(failure) is { } translated:
                return translated;
            case BadHttpRequestException { StatusCode: StatusCodes.Status413PayloadTooLarge }:
                return ApiProblem.BodyTooLarge();
            case BadHttpRequestException:
                return ApiProblem.MalformedBody();
            default:
                LogUnhandled(logger, error);
                return ApiProblem.Internal(environment.IsProduction()
                    ? "An unexpected error occurred."
                    : $"An unexpected error occurred: {error.Message}");
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Unhandled error")]
    private static partial void LogUnhandled(ILogger logger, Exception error);
}
