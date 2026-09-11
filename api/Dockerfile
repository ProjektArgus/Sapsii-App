FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY db/package.json db/package.json
COPY ui/package.json ui/package.json
RUN npm ci

FROM dependencies AS build
COPY api api
COPY db db
RUN npm run build --workspace @sapsii/db \
 && npm run build --workspace @sapsii/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY db/package.json db/package.json
COPY ui/package.json ui/package.json
RUN npm ci --omit=dev --workspace @sapsii/api --workspace @sapsii/db --include-workspace-root=false \
 && npm cache clean --force
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/db/dist db/dist
COPY db/migrations db/migrations
USER node
EXPOSE 3001
CMD ["node", "api/dist/server.js"]
