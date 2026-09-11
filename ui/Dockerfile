FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY db/package.json db/package.json
COPY ui/package.json ui/package.json
RUN npm ci

FROM dependencies AS build
WORKDIR /app
ARG DEPLOYMENT_VERSION=development
ARG NEXT_PUBLIC_CARTO_API_KEY=
ENV DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION
ENV NEXT_PUBLIC_CARTO_API_KEY=$NEXT_PUBLIC_CARTO_API_KEY
COPY ui ui
RUN npm run build --workspace @sapsii/ui

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Links the GHCR package to the repository so its access control follows the repo.
LABEL org.opencontainers.image.source=https://github.com/ProjektArgus/Sapsii-App
LABEL org.opencontainers.image.title=sapsii-ui
LABEL org.opencontainers.image.description="Sapsii dashboard"
COPY --from=build --chown=node:node /app/ui/.next/standalone ./
COPY --from=build --chown=node:node /app/ui/.next/static ./ui/.next/static
COPY --from=build --chown=node:node /app/ui/public ./ui/public
# Never ship a build-time environment file inside a release image.
RUN rm -f ui/.env ui/.env.*
USER node
EXPOSE 3000
CMD ["node", "ui/server.js"]
