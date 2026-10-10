# Rainkeep server image: Node 22 on Alpine, no npm install (the server has no dependencies), run as the image's
# non-root `node` user, with the SQLite file on the /data volume.
#   docker build -t rainkeep-server rainkeep/server
#   docker run -p 8080:8080 -v rainkeep-data:/data -e ADMIN_TOKEN="$(openssl rand -hex 32)" rainkeep-server
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/rainkeep.db

WORKDIR /app
# only the server's own files: a local data/ folder (a dev database) never ends up in the image
COPY package.json index.js ./
COPY src ./src

# a new named volume copies this folder's owner, so the node user can write the database
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- "http://127.0.0.1:${PORT}/v1/health" || exit 1

# node:sqlite is still flagged experimental on Node 22: silence its start-up warning
CMD ["node", "--disable-warning=ExperimentalWarning", "index.js"]
