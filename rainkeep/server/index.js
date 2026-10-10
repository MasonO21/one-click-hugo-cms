#!/usr/bin/env node
/*
 * Rainkeep server: entry point. Reads its settings from the environment and listens.
 *   PORT         port to listen on (default 8080)
 *   DB_PATH      the SQLite file (default server/data/rainkeep.db; its folder is created)
 *   ADMIN_TOKEN  bearer token for /v1/admin/* (playtest reports, chat reports, live config); unset disables them
 *   CORS_ORIGIN  allowed browser origin(s), comma separated (default *)
 * node:sqlite prints an ExperimentalWarning on Node 22; `npm start` passes --disable-warning=ExperimentalWarning.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createServer, VERSION } = require('./src/app');

const PORT = Number(process.env.PORT) || 8080;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'rainkeep.db');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });
// (the token itself is never printed)
if (!ADMIN_TOKEN) console.warn('ADMIN_TOKEN is not set: the /v1/admin routes are disabled.');
else if (ADMIN_TOKEN.length < 24) console.warn('ADMIN_TOKEN is short: use 24 or more random characters.');

const server = createServer({
  dbPath: DB_PATH,
  adminToken: ADMIN_TOKEN,
  corsOrigin: CORS_ORIGIN,
  log: (line) => console.log(`${new Date().toISOString()} ${line}`),
});
server.listen(PORT, () => console.log(`Rainkeep server ${VERSION} listening on :${PORT} (database ${DB_PATH})`));

// Docker and Render stop a service with SIGTERM: finish open requests, end the streams, close the database.
let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
