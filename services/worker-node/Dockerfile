FROM node:22-bookworm-slim AS base
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./
COPY packages ./packages
COPY services/worker-node/package.json ./services/worker-node/
RUN pnpm install --frozen-lockfile --filter @template/worker-node...

FROM deps AS build
COPY packages ./packages
COPY services/worker-node ./services/worker-node
RUN pnpm --filter @template/worker-node build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages /app/packages
COPY --from=build /repo/services/worker-node /app/services/worker-node
EXPOSE 8081
CMD ["node", "/app/services/worker-node/dist/index.js"]
