using System.Text.Json;
using Blotter.Gateway.Validation;

namespace Blotter.Gateway.Http;

/// <summary>
/// Reads a request body the way <c>express.json()</c> did: only a JSON content type is parsed, a
/// request without one has no body, the top level must be an object or an array, and nothing over
/// 100 kB is read.
/// </summary>
internal static class JsonBodies
{
    /// <summary>The largest body any endpoint accepts.</summary>
    public const long MaxBytes = 100 * 1024;

    /// <summary>Reads and parses the body.</summary>
    /// <param name="request">The request.</param>
    /// <returns>The body, or <see cref="JsonBody.None"/> when there is no JSON body.</returns>
    /// <exception cref="ApiProblem">A 413 over the limit, a 400 for anything that is not a JSON object or array.</exception>
    public static async Task<JsonBody> ReadAsync(HttpRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        var hasBody = request.ContentLength > 0 || (request.ContentLength is null && request.Headers.TransferEncoding.Count > 0);
        if (!request.HasJsonContentType() || !hasBody)
        {
            return JsonBody.None;
        }

        if (request.ContentLength > MaxBytes)
        {
            throw ApiProblem.BodyTooLarge();
        }

        try
        {
            using var document = await JsonDocument.ParseAsync(request.Body, default, request.HttpContext.RequestAborted);
            var root = document.RootElement;
            return root.ValueKind is JsonValueKind.Object or JsonValueKind.Array
                ? new JsonBody(root.Clone())
                : throw ApiProblem.MalformedBody();
        }
        catch (JsonException)
        {
            throw ApiProblem.MalformedBody();
        }
    }
}
