# Build from the shardfall/ directory so the server can load the game rules in web/js:
#   docker build -f server/Dockerfile -t shardfall-server .
#   docker run -p 8787:8787 -v shardfall-data:/data shardfall-server
FROM node:22-slim
WORKDIR /app
COPY web/js ./web/js
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/src ./server/src
ENV PORT=8787 DATA_DIR=/data NODE_ENV=production
EXPOSE 8787
VOLUME ["/data"]
WORKDIR /app/server
CMD ["node", "src/index.js"]
