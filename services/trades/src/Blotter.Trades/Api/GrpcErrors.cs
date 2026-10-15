using Blotter.Contracts.Reference;
using Blotter.Trades.Domain;
using FluentValidation;
using Google.Protobuf.WellKnownTypes;
using Google.Rpc;
using Grpc.Core;

namespace Blotter.Trades.Api;

/// <summary>
/// Turns a refused request into a gRPC status the gateway can turn back into the same problem
/// document the Node API sent: the message becomes the detail and field errors travel as a
/// <c>google.rpc.BadRequest</c>.
/// </summary>
internal static class GrpcErrors
{
    /// <summary>Converts a rule violation. NotFound, Aborted, PermissionDenied and InvalidArgument map to 404, 409, 403 and 422.</summary>
    /// <param name="violation">The violation.</param>
    /// <returns>The exception to throw from the handler.</returns>
    public static RpcException From(TradeRuleViolation violation)
    {
        var code = violation.Kind switch
        {
            TradeRuleKind.NotFound => Code.NotFound,
            TradeRuleKind.Conflict => Code.Aborted,
            TradeRuleKind.Forbidden => Code.PermissionDenied,
            _ => Code.InvalidArgument,
        };

        return Build(code, violation.Message, violation.FieldErrors);
    }

    /// <summary>Converts a request validation failure into InvalidArgument with every field error.</summary>
    /// <param name="failure">The FluentValidation failure.</param>
    /// <returns>The exception to throw from the handler.</returns>
    public static RpcException From(ValidationException failure) =>
        Build(
            Code.InvalidArgument,
            TradeRules.Messages.FieldsFailed,
            [.. failure.Errors.Select(error => new FieldError(error.PropertyName, error.ErrorMessage))]);

    private static RpcException Build(Code code, string message, IReadOnlyList<FieldError> fieldErrors)
    {
        var status = new Google.Rpc.Status { Code = (int)code, Message = message };

        if (fieldErrors.Count > 0)
        {
            var details = new BadRequest();
            details.FieldViolations.AddRange(fieldErrors.Select(error =>
                new BadRequest.Types.FieldViolation { Field = error.Field, Description = error.Message }));
            status.Details.Add(Any.Pack(details));
        }

        return status.ToRpcException();
    }
}
