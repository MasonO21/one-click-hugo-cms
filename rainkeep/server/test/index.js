/*
 * Lets `node --test server/test/` work on Node 22, where --test takes files and globs but not a folder: Node loads
 * this file as the folder's module, and it loads every *.test.js beside it into one run. (`npm test` globs them.)
 */
'use strict';

const fs = require('node:fs');

for (const f of fs.readdirSync(__dirname).filter((n) => n.endsWith('.test.js')).sort()) require('./' + f);
