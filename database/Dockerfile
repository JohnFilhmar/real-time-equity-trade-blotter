# Build context is the repository root, because npm ci needs every workspace manifest to resolve
# the shared lockfile, even though only @blotter/database is installed here.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY database/package.json database/package.json
# The Prisma packages are large. Default npm timeouts drop the install on a slow link, so retries
# are widened rather than leaving the build dependent on a good connection.
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 600000 \
  && npm ci --omit=dev --workspace @blotter/database --include-workspace-root

FROM node:22-alpine AS prod
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node database ./database

USER node
WORKDIR /app/database

# One shot: apply the migrations the database has not seen yet, then exit. Compose starts the API
# only after this exits 0, so a failed migration stops the rollout instead of crash-looping the API.
CMD ["npx", "prisma", "migrate", "deploy"]
