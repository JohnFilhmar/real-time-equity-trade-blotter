# Build context is the repository root, because the web app depends on the @blotter/shared workspace.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace @blotter/shared --workspace frontend --include-workspace-root

FROM deps AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# The browser talks only to this server's origin. Where the server forwards the API's paths and the
# hub is compiled into the rewrites at build time; compose passes the service names, and a
# deployment with a service elsewhere overrides its address.
ARG API_INTERNAL_URL=http://gateway:8080
ARG REALTIME_INTERNAL_URL=http://realtime:8080
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    REALTIME_INTERNAL_URL=$REALTIME_INTERNAL_URL
COPY shared shared
COPY frontend frontend
RUN npm run build --workspace @blotter/shared
RUN npm run build --workspace frontend

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1

# Next traces from the workspace root, so the standalone bundle already carries the layout below.
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
# Static files are not part of the standalone bundle; the sign-in backdrops live here.
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "frontend/server.js"]
