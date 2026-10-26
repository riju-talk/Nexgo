# syntax=docker/dockerfile:1
# NEXGO web app (Next.js standalone server).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Build-time routing of /v1/* (see next.config.mjs). These are the only values baked into the image, and none is a secret.
ARG BACKEND_URL=http://backend:4010
ARG NEXT_PUBLIC_API_BASE
ENV BACKEND_URL=$BACKEND_URL
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3021 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3021
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
