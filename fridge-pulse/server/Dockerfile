FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# su-exec lets the entrypoint drop from root to the node user once the data folder is writable.
RUN apk add --no-cache su-exec
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY fp-entrypoint.sh /usr/local/bin/fp-entrypoint.sh
RUN chmod 755 /usr/local/bin/fp-entrypoint.sh
# Shared households live in a SQLite file here (HOUSEHOLD_DB must stay inside /app/data): mount a
# volume so they survive a redeploy. The entrypoint makes a root-owned volume writable for node.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
EXPOSE 8787
ENTRYPOINT ["fp-entrypoint.sh"]
CMD ["node", "dist/index.js"]
