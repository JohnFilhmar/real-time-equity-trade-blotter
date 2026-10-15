using System.Net;
using System.Net.Sockets;
using Blotter.ServiceDefaults.Auth;

namespace Blotter.Gateway.Http;

/// <summary>
/// Who a rate limit counts against. A signed-in caller is counted by user, so people behind one
/// office address do not share a budget and an attacker rotating addresses gets no fresh one. An
/// anonymous caller is counted by address, with IPv6 grouped by its /56, as express-rate-limit did,
/// so a client cannot step to a new budget inside its own allocation.
/// </summary>
internal static class ClientKeys
{
    /// <summary>The key for a request: the user id when signed in, the address otherwise.</summary>
    /// <param name="context">The request, after authentication.</param>
    /// <returns>The key.</returns>
    public static string ForCaller(HttpContext context) =>
        AccessClaims.From(context.User)?.UserId.ToString() ?? ForAddress(context.Connection.RemoteIpAddress);

    /// <summary>The key for an address.</summary>
    /// <param name="address">The client address, after forwarded headers. Null reads as unknown.</param>
    /// <returns>The IPv4 address, or the IPv6 /56 network.</returns>
    public static string ForAddress(IPAddress? address)
    {
        if (address is null)
        {
            return "unknown";
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (address.AddressFamily != AddressFamily.InterNetworkV6)
        {
            return address.ToString();
        }

        var bytes = address.GetAddressBytes();
        Array.Clear(bytes, 7, bytes.Length - 7);
        return $"{new IPAddress(bytes)}/56";
    }
}
