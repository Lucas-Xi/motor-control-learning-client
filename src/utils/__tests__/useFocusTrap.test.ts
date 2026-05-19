import { describe, it, expect } from 'vitest';
import { getFocusableElements, nextFocusInTrap } from '../useFocusTrap';

/**
 * useFocusTrap 单测（node 环境，无 jsdom）：
 *   - 直接测两个纯函数 `getFocusableElements` + `nextFocusInTrap`，
 *     它们承载了 hook 的全部决策逻辑（Tab 循环 / Shift+Tab 反向 / 单节点保持 / 焦点不在容器内）
 *   - hook 副作用（addEventListener / setTimeout / focus()）走 Playwright e2e 验证
 *
 * 测试用例靠手搓 mock 节点，无需真实 DOM。
 */

/**
 * 极简 HTMLElement 桩。
 *
 * `getFocusableElements` 内部调 `container.querySelectorAll(SELECTORS)`：
 * 我们直接 stub `querySelectorAll` 让它返回一个准备好的子节点数组，绕过真实选择器解析。
 * 同时实现 `hasAttribute / getAttribute` 让过滤逻辑（disabled / aria-hidden）能工作。
 */
function makeNode(opts: { tag?: string; disabled?: boolean; ariaHidden?: boolean; tabindex?: string } = {}): HTMLElement {
  const attrs: Record<string, string> = {};
  if (opts.disabled) attrs['disabled'] = '';
  if (opts.ariaHidden) attrs['aria-hidden'] = 'true';
  if (opts.tabindex) attrs['tabindex'] = opts.tabindex;
  const node = {
    tagName: (opts.tag ?? 'BUTTON').toUpperCase(),
    hasAttribute(name: string) {
      return name in attrs;
    },
    getAttribute(name: string) {
      return attrs[name] ?? null;
    },
    // 让 getFocusableElements 的 offsetParent 检查跳过（node 环境下 offsetParent 是 undefined，
    // 进入 typeof === 'undefined' 分支 → 不过滤）
    // 故意不实现 offsetParent。
  } as unknown as HTMLElement;
  return node;
}

function makeContainer(children: HTMLElement[]): HTMLElement {
  return {
    querySelectorAll() {
      return children as unknown as NodeListOf<HTMLElement>;
    },
  } as unknown as HTMLElement;
}

describe('getFocusableElements', () => {
  it('返回容器内所有候选节点', () => {
    const a = makeNode();
    const b = makeNode();
    const list = getFocusableElements(makeContainer([a, b]));
    expect(list).toHaveLength(2);
    expect(list[0]).toBe(a);
    expect(list[1]).toBe(b);
  });

  it('过滤 disabled 节点', () => {
    const a = makeNode();
    const b = makeNode({ disabled: true });
    const list = getFocusableElements(makeContainer([a, b]));
    expect(list).toEqual([a]);
  });

  it('过滤 aria-hidden=true 节点', () => {
    const a = makeNode();
    const b = makeNode({ ariaHidden: true });
    const list = getFocusableElements(makeContainer([a, b]));
    expect(list).toEqual([a]);
  });

  it('container=null 返回空数组', () => {
    expect(getFocusableElements(null)).toEqual([]);
  });
});

describe('nextFocusInTrap', () => {
  const a = makeNode();
  const b = makeNode();
  const c = makeNode();
  const focusables = [a, b, c];

  it('空数组：返回 null（让浏览器自己处理 Tab）', () => {
    expect(nextFocusInTrap([], null, false)).toBeNull();
    expect(nextFocusInTrap([], a, true)).toBeNull();
  });

  it('单节点：始终回到该节点（不让 Tab 跑出 modal）', () => {
    expect(nextFocusInTrap([a], a, false)).toBe(a);
    expect(nextFocusInTrap([a], a, true)).toBe(a);
    expect(nextFocusInTrap([a], null, false)).toBe(a);
  });

  it('焦点不在容器内：Tab → first，Shift+Tab → last', () => {
    expect(nextFocusInTrap(focusables, null, false)).toBe(a);
    expect(nextFocusInTrap(focusables, null, true)).toBe(c);
    const stranger = makeNode();
    expect(nextFocusInTrap(focusables, stranger, false)).toBe(a);
    expect(nextFocusInTrap(focusables, stranger, true)).toBe(c);
  });

  it('Tab 正向：a → b → c → a（循环）', () => {
    expect(nextFocusInTrap(focusables, a, false)).toBe(b);
    expect(nextFocusInTrap(focusables, b, false)).toBe(c);
    expect(nextFocusInTrap(focusables, c, false)).toBe(a); // wrap
  });

  it('Shift+Tab 反向：c → b → a → c（循环）', () => {
    expect(nextFocusInTrap(focusables, c, true)).toBe(b);
    expect(nextFocusInTrap(focusables, b, true)).toBe(a);
    expect(nextFocusInTrap(focusables, a, true)).toBe(c); // wrap
  });

  it('open=false 等价于"不应启用 trap"——hook 层不调本函数；本函数只看 focusables 数组本身。', () => {
    // 验证：清空 focusables（模拟 close 后容器空）→ 返回 null，外层 hook 不动焦点
    expect(nextFocusInTrap([], a, false)).toBeNull();
  });
});
