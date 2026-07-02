ARG NODE_VERSION=22.18.0

#---------------------------------------------- Base -------------------------------------
FROM node:${NODE_VERSION}-slim AS base

WORKDIR /usr/src/app

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive DEBCONF_NOWARNINGS=yes apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

#--------------------------------------- Fase de construcción-----------------------------
FROM base AS builder

COPY package*.json ./

RUN npm ci --legacy-peer-deps --no-audit --no-fund --no-update-notifier

COPY . .

RUN npm run build

#------------------------------------------ Fase de producción-----------------------------
FROM base AS production

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/schema.bin ./schema.bin
COPY package*.json ./

ENV NODE_ENV=production

RUN npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund --no-update-notifier

EXPOSE 3003

CMD ["node", "dist/src/main.js"]
