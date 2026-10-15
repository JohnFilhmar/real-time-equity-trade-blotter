using Google.Rpc;
using Grpc.Core;

namespace Blotter.Gateway.Http;

/// <summary>
/// Turns a refusal from the trades service back into the problem the Node API sent for the same
/// case: InvalidArgument is 422 with its field errors, NotFound 404, Aborted 409, PermissionDenied
/// 403. An unreachable trades service is a 503. Anything else is unexpected.
/// </summary>
internal static class GrpcProblems
{
    /// <summary>Maps a gRPC failure to a problem.</summary>
    /// <param name="failure">The failure.</param>
    /// <returns>The problem, or null when the failure is unexpected and must be a bare 500.</returns>
    public static ApiProblem? From(RpcException failure)
    {
        ArgumentNullException.ThrowIfNull(failure);
        var detail = failure.Status.Detail;

        return failure.StatusCode switch
        {
            StatusCode.InvalidArgument => ApiProblem.Validation(detail, FieldErrors(failure)),
            StatusCode.NotFound => ApiProblem.NotFound(detail),
            StatusCode.Aborted or StatusCode.FailedPrecondition => ApiProblem.Conflict(detail),
            StatusCode.PermissionDenied => ApiProblem.Forbidden(detail),
            StatusCode.Unauthenticated => ApiProblem.Unauthenticated("The access token is not valid"),
            StatusCode.Unavailable or StatusCode.DeadlineExceeded => ApiProblem.Unavailable(),
            _ => null,
        };
    }

    private static List<ProblemFieldError> FieldErrors(RpcException failure) =>
        failure.GetRpcStatus()?.GetDetail<BadRequest>()?.FieldViolations
            .Select(violation => new ProblemFieldError(violation.Field, violation.Description))
            .ToList()
        ?? [];
}
