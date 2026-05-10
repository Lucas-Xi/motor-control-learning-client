import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const productName = '电机控制学习客户端';
const outDir = resolve(root, 'release', 'win-unpacked');
const electronDist = resolve(root, 'node_modules', 'electron', 'dist');
const electronExe = join(outDir, 'electron.exe');
const appExe = join(outDir, `${productName}.exe`);
const resourcesApp = join(outDir, 'resources', 'app');

function assertInsideRoot(pathname) {
  const resolved = resolve(pathname);
  if (!resolved.startsWith(resolve(root))) {
    throw new Error(`Refusing to write outside project root: ${resolved}`);
  }
}

for (const required of [join(root, 'dist', 'index.html'), join(root, 'electron', 'main.cjs'), join(root, 'electron', 'preload.cjs'), electronDist]) {
  if (!existsSync(required)) {
    throw new Error(`Missing required build input: ${required}`);
  }
}

assertInsideRoot(outDir);
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await cp(electronDist, outDir, { recursive: true });
await rm(appExe, { force: true });
await cp(electronExe, appExe);
await rm(electronExe, { force: true });

await mkdir(resourcesApp, { recursive: true });
await cp(join(root, 'dist'), join(resourcesApp, 'dist'), { recursive: true });
await cp(join(root, 'electron'), join(resourcesApp, 'electron'), { recursive: true });

const runtimePackage = {
  name: 'motor-control-learning-client-desktop',
  version: '0.1.0',
  type: 'commonjs',
  main: 'electron/main.cjs',
  productName,
};
await writeFile(join(resourcesApp, 'package.json'), `${JSON.stringify(runtimePackage, null, 2)}\n`, 'utf8');

console.log(`Windows client packaged: ${appExe}`);
console.log('Run the exe from release/win-unpacked; keep the sibling resources folder next to it.');
