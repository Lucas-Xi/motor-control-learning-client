import { spawnSync } from 'node:child_process';

const shellCommand = process.platform === 'win32' ? 'cmd.exe' : 'sh';
const steps = [
  ['verify', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run verify'] : ['-lc', 'npm run verify']],
  ['fault-waves', process.platform === 'win32' ? ['/d', '/s', '/c', 'node scripts/verify-fault-waves.mjs'] : ['-lc', 'node scripts/verify-fault-waves.mjs']],
  ['build', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run build'] : ['-lc', 'npm run build']],
  ['e2e', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run e2e'] : ['-lc', 'npm run e2e']],
  ['screenshots', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run qa:screenshots'] : ['-lc', 'npm run qa:screenshots']],
];

for (const [label, args] of steps) {
  console.log(`\n=== release audit: ${label} ===`);
  const result = spawnSync(shellCommand, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    console.error(`Release audit failed at step: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nRelease audit passed: verify, fault-waves, build, e2e, and screenshot capture completed.');
