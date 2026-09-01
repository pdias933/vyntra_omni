# syntax=docker/dockerfile:1.7.1@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG IMAGEM_NODE=docker.io/library/node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e
ARG IMAGEM_CADDY=docker.io/library/caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648

FROM ${IMAGEM_NODE} AS construtor

ENV CI=true \
    NPM_CONFIG_REGISTRY=https://registry.npmjs.org/

WORKDIR /codigo

ADD --checksum=sha256:d1eab2433172661cc36a18ec85fce93f771db1962717329cc01ec9c2824ca24f \
    https://registry.npmjs.org/pnpm/-/pnpm-11.24.0.tgz /tmp/pnpm.tgz

RUN npm install --global --ignore-scripts --no-audit --no-fund /tmp/pnpm.tgz \
    && rm /tmp/pnpm.tgz \
    && test "$(pnpm --version)" = "11.24.0"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN pnpm --filter '@vyntra/web...' install --frozen-lockfile

COPY tsconfig.json ./
COPY apps/web/index.html apps/web/tsconfig.app.json apps/web/tsconfig.json apps/web/tsconfig.node.json apps/web/vite.config.ts apps/web/
COPY apps/web/src apps/web/src
COPY packages/api-client/tsconfig.json packages/api-client/
COPY packages/api-client/src packages/api-client/src
COPY packages/typescript-config/*.json packages/typescript-config/

RUN pnpm --filter @vyntra/api-client build \
    && pnpm --filter @vyntra/web build

FROM ${IMAGEM_CADDY} AS conteudo

COPY infra/staging/Caddyfile.web /etc/caddy/Caddyfile
COPY --from=construtor --chown=1000:1000 /codigo/apps/web/dist /srv

RUN cp /usr/bin/caddy /usr/local/bin/caddy-sem-capacidade \
    && chown -R 1000:1000 /config /data /etc/caddy /srv \
    && chown 1000:1000 /usr/local/bin/caddy-sem-capacidade

USER 1000:1000

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/caddy-sem-capacidade"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

FROM ${IMAGEM_CADDY} AS borda

COPY infra/staging/Caddyfile.borda /etc/caddy/Caddyfile

RUN cp /usr/bin/caddy /usr/local/bin/caddy-sem-capacidade \
    && chown -R 1000:1000 /config /data /etc/caddy \
    && chown 1000:1000 /usr/local/bin/caddy-sem-capacidade

USER 1000:1000

EXPOSE 80 443 443/udp

ENTRYPOINT ["/usr/local/bin/caddy-sem-capacidade"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
