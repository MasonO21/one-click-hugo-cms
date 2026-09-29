// node sim/report.js  -> runs every archetype and prints a table of days to beat each world (cumulative) and all three.
const { execFileSync } = require('child_process'); const path = require('path');
const names = ['casual_mobile', 'regular_mobile', 'dedicated_mobile', 'desktop_open', 'always_on'];
require('../lib').build();
for (const n of names) {
  const raw = execFileSync('node', [path.join(__dirname, 'f2p.js'), n, '1500'], { env: { ...process.env, NO_BUILD: '1' } }).toString().trim().split('\n').pop();
  const { out } = JSON.parse(raw), c = out.cleared;
  console.log(n.padEnd(17), 'total', out.days.toFixed(1).padStart(6), 'days | police', (c.police || -1).toFixed(1).padStart(5), 'fire', (c.fire || -1).toFixed(1).padStart(5), 'ems', (c.ems || -1).toFixed(1).padStart(5), '| active', out.activeHours.toFixed(0).padStart(4) + 'h', out.bad.length ? 'BAD ' + out.bad : '');
}
