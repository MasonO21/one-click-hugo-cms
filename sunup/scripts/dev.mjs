// Runs the API server and the Vite dev server together; Ctrl-C stops both.
import { spawn } from 'node:child_process';

const procs = [
  ['server', 'npx', ['tsx', 'watch', 'server/index.ts']],
  ['web', 'npx', ['vite']],
].map(([name, cmd, args]) => {
  // Development shows sign-in codes on screen when Twilio isn't set up.
  const child = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'development' } });
  const prefix = (chunk) => chunk.toString().replace(/^(?=.)/gm, `[${name}] `);
  child.stdout.on('data', (c) => process.stdout.write(prefix(c)));
  child.stderr.on('data', (c) => process.stderr.write(prefix(c)));
  child.on('exit', (code) => {
    console.log(`[${name}] exited (${code})`);
    stop();
  });
  return child;
});

function stop() {
  for (const p of procs) if (p.exitCode === null) p.kill('SIGTERM');
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
