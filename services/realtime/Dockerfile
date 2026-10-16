# syntax=docker/dockerfile:1
# Build context is the repository root: the service builds against the shared libraries and the
# repository-wide build settings. docker build -f services/realtime/Dockerfile .

FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:0d99ebf1ccad15037b5c98c9fe8979d6b8dbac23812feae2277a0b277b5c5ffa AS build
WORKDIR /src

# Restore from the project files alone, so a source change reuses the package layer.
COPY global.json Directory.Build.props Directory.Packages.props .editorconfig ./
COPY libs/Blotter.Contracts/Blotter.Contracts.csproj libs/Blotter.Contracts/
COPY libs/Blotter.ServiceDefaults/Blotter.ServiceDefaults.csproj libs/Blotter.ServiceDefaults/
COPY services/realtime/src/Blotter.Realtime/Blotter.Realtime.csproj services/realtime/src/Blotter.Realtime/
RUN dotnet restore services/realtime/src/Blotter.Realtime/Blotter.Realtime.csproj

COPY libs/Blotter.Contracts/ libs/Blotter.Contracts/
COPY libs/Blotter.ServiceDefaults/ libs/Blotter.ServiceDefaults/
COPY services/realtime/src/ services/realtime/src/
RUN dotnet publish services/realtime/src/Blotter.Realtime/Blotter.Realtime.csproj \
    --configuration Release --no-restore --output /app /p:UseAppHost=false

# Chiseled: no shell, no package manager, a non-root user. No ICU either: this service runs with
# invariant globalization, since it never talks to SQL Server.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled@sha256:84def277556c2843a44fdeefbd3145d0a2e32d8f736d0c1a7b0a96b2880b0187 AS runtime
WORKDIR /app
COPY --from=build /app ./

# The service binds its own port from HTTP_PORT, so the image's default URL binding is cleared.
ENV ASPNETCORE_HTTP_PORTS= \
    HTTP_PORT=8080 \
    DOTNET_EnableDiagnostics=0
EXPOSE 8080
USER $APP_UID

# There is no shell to run curl from, so the probe is the service itself, which asks its own /ready.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD ["dotnet", "Blotter.Realtime.dll", "healthcheck"]

ENTRYPOINT ["dotnet", "Blotter.Realtime.dll"]
