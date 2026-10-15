using Blotter.ServiceDefaults.Auth;

namespace Blotter.Gateway.Http;

/// <summary>Endpoint permissions, checked on the permission rather than on the role, with the Node API's 403 wording.</summary>
internal static class PermissionFilter
{
    /// <summary>Refuses anyone whose role lacks the permission, before the handler runs.</summary>
    /// <param name="endpoint">The endpoint.</param>
    /// <param name="permission">A value from <c>Permissions</c>.</param>
    /// <returns>The endpoint.</returns>
    public static RouteHandlerBuilder RequirePermission(this RouteHandlerBuilder endpoint, string permission) =>
        endpoint.AddEndpointFilter(async (context, next) =>
        {
            var claims = AccessClaims.From(context.HttpContext.User) ?? throw ApiProblem.Unauthenticated();
            if (!claims.Can(permission))
            {
                throw ApiProblem.Forbidden($"This action requires the {permission} permission");
            }

            return await next(context);
        });
}
