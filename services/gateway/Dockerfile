# syntax=docker/dockerfile:1
# Build context is the repository root: the service builds against the shared libraries and the
# repository-wide build settings. docker build -f services/gateway/Dockerfile .

FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:e70cdb7f80b0348f5cb85f19a8f670fca061f033d57eed12fa003d58b0e06317 AS build
WORKDIR /src

# Restore from the project files alone, so a source change reuses the package layer.
COPY global.json Directory.Build.props Directory.Packages.props .editorconfig ./
COPY libs/Blotter.Contracts/Blotter.Contracts.csproj libs/Blotter.Contracts/
COPY libs/Blotter.ServiceDefaults/Blotter.ServiceDefaults.csproj libs/Blotter.ServiceDefaults/
COPY services/gateway/src/Blotter.Gateway/Blotter.Gateway.csproj services/gateway/src/Blotter.Gateway/
RUN dotnet restore services/gateway/src/Blotter.Gateway/Blotter.Gateway.csproj

COPY libs/Blotter.Contracts/ libs/Blotter.Contracts/
COPY libs/Blotter.ServiceDefaults/ libs/Blotter.ServiceDefaults/
COPY services/gateway/src/ services/gateway/src/
RUN dotnet publish services/gateway/src/Blotter.Gateway/Blotter.Gateway.csproj \
    --configuration Release --no-restore --output /app /p:UseAppHost=false

# Chiseled: no shell, no package manager, a non-root user. The -extra variant carries ICU, which
# SqlClient needs for its collation handling.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra@sha256:00e0ad6a7ef8c0c1391b87f05c7ac757a15740455688f2bfcd146a3f4b987efd AS runtime
WORKDIR /app
COPY --from=build /app ./

# The service binds its own port from HTTP_PORT, so the image's default URL binding is cleared
# rather than left to be overridden with a warning.
ENV ASPNETCORE_HTTP_PORTS= \
    HTTP_PORT=8080 \
    DOTNET_EnableDiagnostics=0
EXPOSE 8080
USER $APP_UID

# There is no shell to run curl from, so the probe is the service itself, which asks its own /ready.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD ["dotnet", "Blotter.Gateway.dll", "healthcheck"]

ENTRYPOINT ["dotnet", "Blotter.Gateway.dll"]
