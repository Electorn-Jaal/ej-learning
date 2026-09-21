# Current workspace native dependency overrides support Linux amd64.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN --mount=type=cache,id=ej-pnpm,target=/pnpm/store corepack pnpm install --store-dir /pnpm/store --frozen-lockfile
RUN corepack pnpm run typecheck:libs \
 && corepack pnpm --filter @workspace/api-server run typecheck \
 && corepack pnpm --filter @workspace/ej-learning run typecheck \
 && corepack pnpm --filter @workspace/api-server run build \
 && NODE_ENV=production BASE_PATH=/ej/ corepack pnpm --filter @workspace/ej-learning run build

FROM build AS tools
ENV NODE_ENV=production
USER node
CMD ["node", "lib/db/scripts/migrate.mjs"]

FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 API_PORT=5000 EJ_STORAGE_DIR=/app/storage
COPY --from=build --chown=node:node /app/artifacts/api-server/dist ./dist
USER node
EXPOSE 5000
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

FROM nginx:stable-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/artifacts/ej-learning/dist/public /usr/share/nginx/html/ej
EXPOSE 80
