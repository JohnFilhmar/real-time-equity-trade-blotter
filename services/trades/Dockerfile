# syntax=docker/dockerfile:1
# Build context is the repository root: the service builds against the shared libraries and the
# repository-wide build settings. docker build -f services/trades/Dockerfile .

FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:0d99ebf1ccad15037b5c98c9fe8979d6b8dbac23812feae2277a0b277b5c5ffa AS build
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
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra@sha256:3ed6558056b54d5c9dfefb7ff473728e022ff2bf1d976cbf8ee07b05ec594374 AS runtime
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
