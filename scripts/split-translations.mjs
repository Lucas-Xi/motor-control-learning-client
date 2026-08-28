// 一次性脚本：把 src/i18n/translations.ts 按命名空间拆成 src/i18n/translations/<ns>.ts。
// 用后即删（或留作回归对照）。Run: node scripts/split-translations.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = readFileSync(join(root, 'src/i18n/translations.ts'), 'utf8');
const lines = src.split('\n');

// 命名空间块起止：`  ns: {` 与对应的 `  },`
const nsStarts = [];
for (let i = 0; i < lines.length; i += 1) {
  const m = lines[i].match(/^  ([a-zA-Z]+): \{$/);
  if (m) nsStarts.push({ name: m[1], start: i });
}

const outDir = join(root, 'src/i18n/translations');
mkdirSync(outDir, { recursive: true });

for (let k = 0; k < nsStarts.length; k += 1) {
  const { name, start } = nsStarts[k];
  // 找到本块的闭合 `  },`（下一个命名空间起始之前最后一个）
  const nextStart = k + 1 < nsStarts.length ? nsStarts[k + 1].start : lines.length;
  let end = -1;
  for (let i = nextStart - 1; i > start; i -= 1) {
    if (/^  \},?$/.test(lines[i])) { end = i; break; }
  }
  if (end < 0) throw new Error(`no closing brace for ${name}`);
  const body = lines.slice(start + 1, end)
    .map((l) => (l.startsWith('    ') ? l.slice(2) : l))
    .join('\n')
    .replace(/\s+$/, '');
  const file = `import { e } from '../entries';\n\n/** ${name} 命名空间（由 translations.ts 机械拆分，语义未变）。 */\nexport const ${name} = {\n${body}\n};\n`;
  writeFileSync(join(outDir, `${name}.ts`), file);
  console.log(`[split] ${name}.ts  (${end - start - 1} lines)`);
}

// entries.ts：公共 helper
writeFileSync(join(root, 'src/i18n/entries.ts'), `import type { TranslationEntry } from './types';\n\n/**\n * 翻译条目构造器：强制同时提供 zh-CN 与 en-US。\n * 各命名空间文件共享，避免循环依赖。\n */\nexport function e(zh: string, en: string): TranslationEntry {\n  return { 'zh-CN': zh, 'en-US': en };\n}\n`);
console.log('[split] entries.ts');
console.log(`[split] namespaces: ${nsStarts.map((n) => n.name).join(', ')}`);
