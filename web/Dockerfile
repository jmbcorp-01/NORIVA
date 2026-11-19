# NORIVA 웹 (독자 + 스튜디오). ECS Fargate(ARM64)에서 실행해요.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS migrator
WORKDIR /m
RUN npm init -y >/dev/null && npm i --omit=dev drizzle-orm@0.45.4 pg@8 >/dev/null

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=migrator /m/node_modules ./scripts/node_modules
COPY scripts/migrate.mjs ./scripts/migrate.mjs
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
