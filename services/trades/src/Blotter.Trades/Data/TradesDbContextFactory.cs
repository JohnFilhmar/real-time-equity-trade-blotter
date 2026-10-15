using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Blotter.Trades.Data;

/// <summary>
/// Lets <c>dotnet ef migrations add</c> build the model without booting the service, which would
/// demand every environment variable. Generating a migration never opens this connection.
/// </summary>
internal sealed class TradesDbContextFactory : IDesignTimeDbContextFactory<TradesDbContext>
{
    /// <summary>Creates a context for the design-time tools.</summary>
    /// <param name="args">Arguments from the tool, unused.</param>
    /// <returns>A context bound to a placeholder SQL Server connection.</returns>
    public TradesDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<TradesDbContext>()
            .UseSqlServer("Server=design-time;Database=trades;Integrated Security=false")
            .Options);
}
