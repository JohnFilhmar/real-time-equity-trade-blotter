namespace Blotter.ServiceDefaults.Hosting;

/// <summary>
/// One-shot commands a container runs against its own image. The runtime images have no shell and
/// no curl, so the healthcheck is the service binary asking itself whether it is ready.
/// </summary>
public static class ContainerCommands
{
    /// <summary>Requests <c>/ready</c> on the loopback address and turns the answer into an exit code.</summary>
    /// <param name="port">The service's HTTP port, from <c>HTTP_PORT</c>. Null or empty means 8080.</param>
    /// <returns>0 when the service answered 200, 1 for anything else, including no answer within four seconds.</returns>
    public static async Task<int> CheckReadyAsync(string? port)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
        var target = new Uri($"http://127.0.0.1:{(string.IsNullOrEmpty(port) ? "8080" : port)}/ready");

        try
        {
            using var response = await client.GetAsync(target);
            return response.IsSuccessStatusCode ? 0 : 1;
        }
        catch (HttpRequestException)
        {
            return 1;
        }
        catch (TaskCanceledException)
        {
            return 1;
        }
    }
}
