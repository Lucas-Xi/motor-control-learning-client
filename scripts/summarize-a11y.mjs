import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const data = JSON.parse(readFileSync(resolve(root, 'tmp', 'a11y-results.json'), 'utf-8'));
const lines = [];
const aggregate = { critical: 0, serious: 0, moderate: 0, minor: 0 };
const violationDetail = {};
for (const [moduleKey, payload] of Object.entries(data)) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const idsByImpact = {};
  for (const v of payload.violations) {
    const n = v.nodes.length;
    counts[v.impact] = (counts[v.impact] ?? 0) + n;
    aggregate[v.impact] = (aggregate[v.impact] ?? 0) + n;
    idsByImpact[v.impact] = idsByImpact[v.impact] || new Set();
    idsByImpact[v.impact].add(v.id);
    violationDetail[v.id] = violationDetail[v.id] || { impact: v.impact, count: 0, sample: v };
    violationDetail[v.id].count += n;
  }
  const summarize = (key) => {
    const list = idsByImpact[key] ? [...idsByImpact[key]].join(',') : '-';
    return `${counts[key] || 0} (${list})`;
  };
  lines.push(`${moduleKey}: critical=${summarize('critical')}, serious=${summarize('serious')}, moderate=${summarize('moderate')}, minor=${summarize('minor')}`);
}
lines.push('');
lines.push('AGGREGATE: ' + JSON.stringify(aggregate));
lines.push('');
lines.push('UNIQUE VIOLATIONS:');
for (const [id, info] of Object.entries(violationDetail)) {
  lines.push(`  ${id} [${info.impact}] x${info.count} -- ${info.sample.description}`);
  for (const node of info.sample.nodes.slice(0, 2)) {
    lines.push(`     html: ${node.html}`);
  }
}

writeFileSync(resolve(root, 'tmp', 'a11y-summary.txt'), lines.join('\n'), 'utf-8');
console.log(lines.join('\n'));
