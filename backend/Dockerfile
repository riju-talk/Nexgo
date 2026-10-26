# syntax=docker/dockerfile:1
# NEXGO API + worker. One image, two commands: `node dist/local.js` (API) and `node dist/worker.js` (job runner).
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && cp -r src/db/migrations dist/db/migrations && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 4010
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4010)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/local.js"]
