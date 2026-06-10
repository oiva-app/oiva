FROM node:24-bookworm-slim AS base

WORKDIR /app

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

COPY . .
RUN npm run build:prod

FROM base AS runtime

ENV NODE_ENV=production
ENV COLLECTOR_ENDPOINT=http://localhost:4318/v1/traces

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl \
  && curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    -o /etc/ssl/certs/rds-global-bundle.pem \
  && apt-get purge -y --auto-remove curl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=builder --chown=node:node /app/.mastra/output ./.mastra/output
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/src/mastra/db/migrations ./src/mastra/db/migrations
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
  && rm -f ./.mastra/output/mastra.db* ./.mastra/output/mastra.duckdb* \
  && mkdir -p /tmp/workspaces /tmp/mastra \
  && chown -R node:node /tmp/workspaces /tmp/mastra

USER node

EXPOSE 4111

ENTRYPOINT ["./docker-entrypoint.sh"]
