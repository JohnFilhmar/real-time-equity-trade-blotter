# Build context is the repository root, because the API depends on the @blotter/shared workspace.
FROM node:22-alpine AS deps
WORKDIR /app
# bcrypt is a native module, so the install compiles it. Alpine ships without a toolchain, and
# these three packages are what node-gyp needs. They stay in the builder stages only: the runtime
# image below copies the compiled node_modules and never sees a compiler.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY database/package.json database/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# The Prisma packages are large. Default npm timeouts drop the install on a slow link, so retries
# are widened rather than leaving the build dependent on a good connection. The database workspace
# is installed here because the API build generates the Prisma client from it.
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 600000 \
  && npm ci --workspace @blotter/shared --workspace @blotter/database --workspace backend --include-workspace-root

FROM deps AS build
# prisma.config.ts resolves DATABASE_URL eagerly, and `prisma generate` reads the config even
# though it never connects. This value is never used at runtime; compose supplies the real one.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
COPY shared shared
COPY database database
COPY backend backend
RUN npm run build --workspace @blotter/shared
RUN npm run build --workspace backend

FROM node:22-alpine AS prod-deps
WORKDIR /app
# bcrypt is a native module, so the install compiles it. Alpine ships without a toolchain, and
# these three packages are what node-gyp needs. They stay in the builder stages only: the runtime
# image below copies the compiled node_modules and never sees a compiler.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY database/package.json database/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 600000 \
  && npm ci --omit=dev --workspace @blotter/shared --workspace backend --include-workspace-root

FROM node:22-alpine AS prod
WORKDIR /app

ENV NODE_ENV=production PORT=5000

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./package.json

COPY --from=build --chown=node:node /app/shared/dist ./shared/dist
COPY --chown=node:node shared/package.json ./shared/package.json

COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --chown=node:node backend/package.json ./backend/package.json

USER node
WORKDIR /app/backend

EXPOSE 5000

# Readiness, not liveness: a container that cannot reach Postgres must not report healthy, or
# compose will start the frontend against a dead API.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# node is the entrypoint rather than `npm run start`, so it is PID 1 and receives the SIGTERM
# docker sends on stop. npm does not forward signals to its child, which left the graceful shutdown
# in src/index.ts dead in the container: sockets and the Prisma pool were never closed. Migrations
# run as their own compose service, so they are not this process's job.
CMD ["node", "dist/index.js"]
