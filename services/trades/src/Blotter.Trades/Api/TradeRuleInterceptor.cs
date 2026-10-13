using Blotter.Trades.Domain;
using FluentValidation;
using Grpc.Core;
using Grpc.Core.Interceptors;

namespace Blotter.Trades.Api;

/// <summary>
/// Translates rule violations and validation failures into gRPC statuses in one place, so no handler
/// needs a try/catch. Anything else stays an unexpected failure and reaches the caller as Internal
/// with no detail.
/// </summary>
internal sealed class TradeRuleInterceptor : Interceptor
{
    /// <inheritdoc />
    public override async Task<TResponse> UnaryServerHandler<TRequest, TResponse>(
        TRequest request,
        ServerCallContext context,
        UnaryServerMethod<TRequest, TResponse> continuation)
    {
        ArgumentNullException.ThrowIfNull(continuation);

        try
        {
            return await continuation(request, context);
        }
        catch (TradeRuleViolation violation)
        {
            throw GrpcErrors.From(violation);
        }
        catch (ValidationException failure)
        {
            throw GrpcErrors.From(failure);
        }
    }
}
