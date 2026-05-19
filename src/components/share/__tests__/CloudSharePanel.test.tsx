/**
 * CloudSharePanel 单元测试。
 *
 * 同样在 node 环境用"轻量化逻辑/静态断言"：
 *   - 验证 CloudSharePanel / SnapshotPickerDialog / SnapshotReviewPanel / SnapshotTimeline
 *     都是合法 function component
 *   - 通过读取源码字符串校验：tab 列表多了 'review'、tabpanel 用 role + aria-selected
 *   - 校验 SnapshotPickerDialog 的两种入口（我的快照 + 粘贴 URL）都存在
 *   - 真正的 tab 切换交互交给 Playwright e2e
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CloudSharePanel } from '../CloudSharePanel';
import { SnapshotPickerDialog } from '../SnapshotPickerDialog';
import { SnapshotReviewPanel } from '../SnapshotReviewPanel';
import { SnapshotTimeline } from '../SnapshotTimeline';

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('CloudSharePanel · 组件导出', () => {
  it('CloudSharePanel 是 function component', () => {
    expect(typeof CloudSharePanel).toBe('function');
    expect(CloudSharePanel.name).toBe('CloudSharePanel');
  });

  it('SnapshotPickerDialog / SnapshotReviewPanel / SnapshotTimeline 都是 function component', () => {
    expect(typeof SnapshotPickerDialog).toBe('function');
    expect(typeof SnapshotReviewPanel).toBe('function');
    expect(typeof SnapshotTimeline).toBe('function');
  });
});

describe('CloudSharePanel · V3 PR Review tab 集成', () => {
  const src = readSrc('src/components/share/CloudSharePanel.tsx');

  it('新增 review 这个 Tab id', () => {
    // Tab 联合类型必须包含 'review'
    expect(src).toMatch(/type Tab = 'mine' \| 'import' \| 'team' \| 'review'/);
  });

  it('tab 列表里加了 PR Review 入口', () => {
    expect(src).toContain("id: 'review'");
    expect(src).toContain('PR Review');
  });

  it('review tab 渲染 SnapshotReviewPanel + SnapshotTimeline 组合视图', () => {
    expect(src).toContain('<SnapshotReviewPanel');
    expect(src).toContain('<SnapshotTimeline');
  });

  it('SnapshotPickerDialog 被挂载在 CloudSharePanel 内', () => {
    expect(src).toContain('<SnapshotPickerDialog');
  });

  it('review tabpanel 有 role=tabpanel + aria-labelledby 完整 a11y', () => {
    expect(src).toMatch(/id="cloud-tab-review"[\s\S]{0,80}role="tabpanel"/);
    expect(src).toMatch(/aria-labelledby="cloud-tab-review"/);
  });

  it('tab 按钮带 aria-selected', () => {
    expect(src).toContain('aria-selected={active}');
  });

  it('不破坏 V1 / V2 入口：ShareSnapshotPanel + CloudSharePanel 仍然导出', () => {
    const shareSrc = readSrc('src/components/share/ShareSnapshotPanel.tsx');
    expect(shareSrc).toContain('export function ShareSnapshotPanel');
    expect(src).toContain('export function CloudSharePanel');
  });

  it('既有「我的快照 / 导入分享 / 团队时间线」三 tab 保留', () => {
    expect(src).toContain("id: 'mine'");
    expect(src).toContain("id: 'import'");
    expect(src).toContain("id: 'team'");
  });
});

describe('SnapshotPickerDialog · 选择入口', () => {
  const src = readSrc('src/components/share/SnapshotPickerDialog.tsx');

  it('入口 1：粘贴 gist URL / ID 输入框存在', () => {
    expect(src).toContain('粘贴 gist URL 或 ID');
    expect(src).toContain('extractGistId');
  });

  it('入口 2：我的快照列表（listMine）存在', () => {
    expect(src).toContain('我的快照');
    expect(src).toContain('listMine');
  });

  it('onPick 回调向上抛 gistId', () => {
    expect(src).toMatch(/onPick:\s*\(gistId: string\) => void/);
  });

  it('完整 a11y：role=dialog / aria-modal / 关闭 aria-label', () => {
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain('aria-label="关闭选择窗口"');
  });

  it('Esc 关闭 + 点击外层遮罩关闭', () => {
    expect(src).toContain("e.key === 'Escape'");
  });
});

describe('SnapshotTimeline · 时间线视觉与 a11y', () => {
  const src = readSrc('src/components/share/SnapshotTimeline.tsx');

  it('revision 用 article + aria-current="step" 标当前 active', () => {
    expect(src).toContain('<article');
    expect(src).toMatch(/aria-current=\{isActive \? 'step' : undefined\}/);
  });

  it('左侧细线 + 圆点：用 ol + border-l + 圆点 span', () => {
    expect(src).toContain('border-l border-line-subtle');
    expect(src).toContain('rounded-full border-2');
  });

  it('提供「刷新」按钮（不主动轮询）', () => {
    expect(src).toContain('aria-label="刷新时间线"');
    expect(src).toContain('void refresh()');
  });

  it('「查看这个版本」「对比上一版」两个按钮俱在', () => {
    expect(src).toContain('查看这个版本');
    expect(src).toContain('对比上一版');
  });

  it('错误状态用 role=alert + aria-live=assertive', () => {
    expect(src).toContain('role="alert"');
    expect(src).toContain('aria-live="assertive"');
  });

  it('加载状态用 role=status + aria-live=polite', () => {
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-live="polite"');
  });
});
