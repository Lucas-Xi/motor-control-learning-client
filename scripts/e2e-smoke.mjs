import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  require.resolve('@playwright/test');
} catch {
  console.log('Playwright is not installed; optional E2E skipped.');
  console.log('To enable it: npm install -D @playwright/test && npx playwright install chromium');
  process.exit(0);
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['playwright', 'test'], { stdio: 'inherit', shell: false });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
