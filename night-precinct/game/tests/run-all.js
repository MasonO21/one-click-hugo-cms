// Runs the whole QA suite.  node run-all.js [--quick]
const { spawnSync } = require('child_process');
const quick = process.argv.includes('--quick');
require('./lib').build();
const steps = [
  ['static (release build)', ['static.js']],
  ['saves', ['saves.js']],
  ['native bridge mock', ['native-mock.js']],
  ['layout', ['layout.js']],
  ['monkey 400x820', ['monkey.js', '1', quick ? '600' : '3000', '400x820']],
  ['monkey 320x568', ['monkey.js', '2', quick ? '600' : '3000', '320x568']],
  ['monkey 1024x768', ['monkey.js', '3', quick ? '600' : '3000', '1024x768']],
  ['perf', ['perf.js']],
].concat(quick ? [] : [['soak', ['soak.js']]]);
let failed = 0;
for (const [name, args] of steps) {
  console.log('\n===== ' + name + ' =====');
  const r = spawnSync('node', args, { stdio: 'inherit', cwd: __dirname, env: process.env });
  if (r.status !== 0) { failed++; console.log('>>> ' + name + ' FAILED'); }
}
console.log(failed ? `\n${failed} STEP(S) FAILED` : '\nALL STEPS PASSED');
process.exit(failed ? 1 : 0);
