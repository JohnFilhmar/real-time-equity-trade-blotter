# syntax=docker/dockerfile:1
# Build context is the repository root: the service builds against the shared libraries and the
# repository-wide build settings. docker build -f services/trades/Dockerfile .

FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:e70cdb7f80b0348f5cb85f19a8f670fca061f033d57eed12fa003d58b0e06317 AS build
WORKDIR /src

# Restore from the project files alone, so a source change reuses the package layer.
COPY global.json Directory.Build.props Directory.Packages.props .editorconfig ./
COPY libs/Blotter.Contracts/Blotter.Contracts.csproj libs/Blotter.Contracts/
COPY libs/Blotter.ServiceDefaults/Blotter.ServiceDefaults.csproj libs/Blotter.ServiceDefaults/
COPY services/trades/src/Blotter.Trades/Blotter.Trades.csproj services/trades/src/Blotter.Trades/
RUN dotnet restore services/trades/src/Blotter.Trades/Blotter.Trades.csproj

COPY libs/Blotter.Contracts/ libs/Blotter.Contracts/
COPY libs/Blotter.ServiceDefaults/ libs/Blotter.ServiceDefaults/
COPY services/trades/src/ services/trades/src/
RUN dotnet publish services/trades/src/Blotter.Trades/Blotter.Trades.csproj \
    --configuration Release --no-restore --output /app /p:UseAppHost=false

# Chiseled: no shell, no package manager, a non-root user. The -extra variant carries ICU, which
# SqlClient needs for its collation handling.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra@sha256:00e0ad6a7ef8c0c1391b87f05c7ac757a15740455688f2bfcd146a3f4b987efd AS runtime
WORKDIR /app
COPY --from=build /app ./

# HTTP/1.1 for the probes and the scraper on HTTP_PORT, gRPC over HTTP/2 on GRPC_PORT. The service
# binds both itself, so the image's default URL binding is cleared.
ENV ASPNETCORE_HTTP_PORTS= \
    HTTP_PORT=8080 \
    GRPC_PORT=8081 \
    DOTNET_EnableDiagnostics=0
EXPOSE 8080 8081
USER $APP_UID

# There is no shell to run curl from, so the probe is the service itself, which asks its own /ready.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD ["dotnet", "Blotter.Trades.dll", "healthcheck"]

ENTRYPOINT ["dotnet", "Blotter.Trades.dll"]
