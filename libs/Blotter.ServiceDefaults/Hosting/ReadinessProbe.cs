namespace Blotter.ServiceDefaults.Hosting;

/// <summary>One dependency the <c>/ready</c> endpoint checks.</summary>
/// <param name="Name">The key it reports under, such as <c>database</c>.</param>
/// <param name="Check">
/// Completes when the dependency answered and throws when it did not. Any exception counts as
/// down, and its message is logged rather than returned, because it can carry connection details.
/// </param>
public sealed record ReadinessProbe(string Name, Func<IServiceProvider, CancellationToken, Task> Check);
