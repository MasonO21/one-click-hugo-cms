#!/bin/sh
# Hosts such as Fly.io and Render attach disks owned by root, and the server runs as the unprivileged
# node user. Hand the data folder to that user, then start the server as it rather than as root.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R node:node /app/data
  exec su-exec node "$@"
fi
exec "$@"
