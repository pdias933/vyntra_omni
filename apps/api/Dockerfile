# syntax=docker/dockerfile:1.7.1@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG IMAGEM_NODE=docker.io/library/node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e

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
COPY apps/api/package.json apps/api/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN pnpm --filter '@vyntra/api...' install --frozen-lockfile

COPY tsconfig.json ./
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/
COPY apps/api/src apps/api/src
COPY packages/typescript-config/*.json packages/typescript-config/

RUN pnpm --filter @vyntra/api build \
    && pnpm --filter @vyntra/api deploy --prod --legacy /saida/api

FROM ${IMAGEM_NODE} AS execucao

ENV NODE_ENV=production \
    ENDERECO_HTTP=127.0.0.1 \
    PORTA_HTTP=3000

WORKDIR /aplicacao

COPY --from=construtor --chown=node:node /saida/api/ ./

USER 1000:1000

EXPOSE 3000

CMD ["node", "dist/main.js"]
