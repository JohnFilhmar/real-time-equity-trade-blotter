using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Blotter.Gateway.Data;

/// <summary>Lets <c>dotnet ef migrations add</c> build the model without booting the gateway. It never connects.</summary>
internal sealed class IdentityDbContextFactory : IDesignTimeDbContextFactory<IdentityDbContext>
{
    /// <summary>Creates a context for the design-time tools.</summary>
    /// <param name="args">Arguments from the tool, unused.</param>
    /// <returns>A context bound to a placeholder SQL Server connection.</returns>
    public IdentityDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<IdentityDbContext>()
            .UseSqlServer("Server=design-time;Database=identity;Integrated Security=false")
            .Options);
}
