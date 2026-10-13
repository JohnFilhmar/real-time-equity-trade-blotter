using Blotter.Contracts.Wire;

namespace Blotter.Trades.Domain;

/// <summary>
/// Who is making a change and through which path. A gRPC call builds one from the verified token;
/// the simulated desk builds one for itself, so it is an ordinary caller rather than a special case.
/// </summary>
/// <param name="TraderCode">The desk code the change is attributed to and ownership is judged against.</param>
/// <param name="Role">The role, for the checks that depend on whose trade it is.</param>
/// <param name="Source">The API or the simulated desk, recorded on the audit row.</param>
internal sealed record TradeActor(string TraderCode, Role Role, TradeEventSource Source);
