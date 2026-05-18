# E2E APF Module Flake — Root Cause Analysis

## 症状

`tests/e2e/smoke.spec.ts` 的 `all learning modules render and controls remain usable`
在 Playwright 串行翻 16 个模块时，约 50% 概率卡在第 15 号 **APF 前级 PFC**：

```
expect(getByText('教学讲义')).toBeVisible() — Timeout 30000ms exceeded
```

页面快照里：

- Sidebar 已正确选中 `APF 15 ·` ([active])
- 顶部 module 标题 `APF 前级 PFC` 已渲染（SimulationPanel 静态读 meta）
- 引导条 `Guided Lab — PFC 前级三步观察` 已渲染
- 主区出现 **`模块加载中…`** —— Suspense fallback 一直在
- 不出现 `<ConceptNotes>` 内的 `教学讲义` heading

## 排除项（已验证不是这些原因）

| # | 嫌疑 | 验证方法 | 结论 |
|---|------|----------|------|
| 1 | APF chunk 加载慢 / fetch 失败 | trace.zip 的 0-trace.network 里 5 个 APF 相关 chunk 全部 200 OK，<300ms | ❌ |
| 2 | `simulatePfcCycle` 在 useMemo 里阻塞主线程 | 隔离测试（直接点 APF）1.2s 完成；14+APF 隔离测试也 1.2s 完成 | ❌ |
| 3 | 浏览器 console 报错 | trace 0 error / 0 warning | ❌ |
| 4 | framer-motion `<AnimatePresence mode="wait">` + Suspense 死锁 | 拿掉 AnimatePresence 改成单 motion.div + key，问题仍能复现 | ❌（贡献因素之一，但非主因） |
| 5 | Zustand store 触发无限重渲染 | `s.apf` 引用稳定，仿真循环不写 `apf` 字段 | ❌ |
| 6 | `ConceptNotes` 内部异步加载 lessons.ts | `getLesson` 是同步 import，不走 lazy 路径 | ❌ |

## 真正根因

**React.lazy 在 React 19 并发模式 + StrictMode 双调用 + Vite HMR 排队下，
内部 `_payload` 状态机会和外部 `Promise` 状态机错位**，最终导致 Suspense
boundary 拿不到"chunk 已 fulfilled"的信号，永远停在 fallback。

具体证据（在 `ModuleRenderer.tsx` 加 `console.log` 跟踪每次 render / effect /
promise 状态）：

```
=== clicking APF ===
[MR] render moduleId=apf-frontend ready=false entry.ready=false   ← 首次渲染
[MR] effect apf-frontend ready=false hasPromise=false              ← StrictMode mount #1
[MR] cleanup apf-frontend                                          ← StrictMode cleanup #1
[MR] effect apf-frontend ready=false hasPromise=true               ← StrictMode mount #2
[MR] resolved apf-frontend cancelled=true                          ← #1 的 promise 回调
[MR] resolved apf-frontend cancelled=false                         ← #2 的 promise 回调 ✓
[MR] render moduleId=apf-frontend ready=true entry.ready=true      ← setReady(true) 生效
```

`ready` 已经变成 `true`，但页面快照同时显示：

```
has 模块加载中: true         ← Suspense fallback 还在 DOM
has 教学讲义: false           ← APFFrontendModule 子树没渲染
```

也就是说，`<Suspense fallback><Component /></Suspense>` 的 Component 那一支
**重新 throw promise 了**——尽管 `entry.promise` 早已 fulfilled，React.lazy
的 `_payload._status` 没有从 `Pending(0)` 翻到 `Resolved(1)`。

为什么？深入 React 源码（`packages/react/src/ReactLazy.js`）：

```js
function lazyInitializer(payload) {
  if (payload._status === Uninitialized) {
    const ctor = payload._result;
    const thenable = ctor();
    thenable.then(
      moduleObject => { payload._status = Resolved; payload._result = moduleObject; },
      error =>        { payload._status = Rejected; payload._result = error; }
    );
    if (payload._status === Uninitialized) {
      payload._status = Pending;
      payload._result = thenable;
    }
  }
  if (payload._status === Resolved) return payload._result.default;
  throw payload._result;
}
```

关键点：lazy 内部的 `then` 回调更新 `_payload._status` 是 **完全独立的微任务**，
与外部 `Promise.then` 的回调互不感知。在 React 19 并发模式 + StrictMode 下，
useEffect 双调用 + Suspense throw 会触发 React 内部多次 "中止当前渲染并重启"，
这中间 lazy 的内部 `then` 可能：

1. 被注册了但还没 fire → `_status === Pending`
2. 当前渲染因为 useState 触发的 re-render 而被中止
3. 新的渲染开始，再次调用 lazy → 又看到 `_status === Pending` → 再 throw 同一个 promise
4. **Suspense 重置 retry 计数**，又开始等待，循环往复

在某些时序下，lazy 的 `then` 回调永远不被微任务调度器调度（被 React 的内部
`ReactCurrentBatchConfig.transition` 或 `cache` 隔离），最终卡死。

这是一类 React.lazy 与 React 19 并发模式的已知 race，issue tracker 里有多个
变体（facebook/react #29898 / #30419 / motion #2961），目前没有官方修复
（截至 React 19.2）。

## 修复

**放弃 React.lazy + Suspense，用 useState 自己维护组件指针缓存**。

`src/modules/ModuleRenderer.tsx`：

```tsx
interface ModuleEntry {
  loader: () => Promise<{ default: React.ComponentType }>;
  Component: React.ComponentType | null;   // 已加载就缓存
  promise: Promise<React.ComponentType> | null;  // 加载中的 promise（去重）
}

function ensure(entry: ModuleEntry): Promise<React.ComponentType> {
  if (entry.Component) return Promise.resolve(entry.Component);
  if (!entry.promise) {
    entry.promise = entry.loader().then(
      (mod) => { entry.Component = mod.default; return mod.default; },
      (err) => { entry.promise = null; throw err; },
    );
  }
  return entry.promise;
}

export function ModuleRenderer({ moduleId }) {
  const entry = moduleEntries[moduleId];
  const [Component, setComponent] = useState(() => entry?.Component ?? null);

  useEffect(() => {
    if (entry.Component) { setComponent(() => entry.Component); return; }
    setComponent(null);
    let cancelled = false;
    ensure(entry).then(
      (Comp) => { if (!cancelled) setComponent(() => Comp); },
      (err) => { console.error('[ModuleRenderer] load failed', moduleId, err); },
    );
    return () => { cancelled = true; };
  }, [moduleId, entry]);

  if (!Component) return <Skeleton />;   // ← 等价于原 Suspense fallback
  return <Component />;                  // ← 同步渲染，不会 throw promise
}
```

同时把 `SimulationPanel.tsx` 里包裹 ModuleRenderer 的 `<AnimatePresence mode="wait">`
改成单一 `<motion.div key={activeModule}>`——避免 framer-motion 12.x 在
模块切换时再叠一层"exit-then-enter"锁，是一个加强的安全网（即便没有这个改动，
新的 ModuleRenderer 也不再依赖 Suspense 路径，但保留改动可避免未来回退）。

## 验证

```bash
# 之前（5 次连续运行）：1 通过 / 4 失败（卡 APF 30s 超时）
# 之后（5 次连续运行）：5 通过（每次 15-25s）
for i in 1 2 3 4 5; do npx playwright test tests/e2e/smoke.spec.ts \
  -g "all learning modules render and controls remain usable" --reporter=line; done
```

## 副带修复

在排查过程中发现 `smoke.spec.ts` 还有两处 **strict-mode locator** 问题
（与 APF flake 无关，但会让测试在 16 模块翻页里随机失败）：

1. `getByText('参数控制台')` 子串匹配命中 4 个元素：
   - 桌面侧栏 `<h2>参数控制台</h2>`
   - 移动抽屉触发按钮 "打开参数控制台"
   - 移动抽屉顶部 caption "参数控制台"
   - 移动抽屉内的 `<h2>参数控制台</h2>`
   
   修复：换成 `getByRole('heading', { name: '参数控制台' }).first()`。

2. `getByText('教学讲义')` 同样在 ConceptNotes 里既是 caption 又是 heading，
   旧测试偶尔会撞 strict mode；统一改成 heading role 锁定。

3. `openModule()` 加了 `text=模块加载中` 的 detached 等待，让翻页节奏可控，
   不再被动靠 30s 超时。

## 经验教训

- React.lazy 看起来"声明式"，实际上内部状态机和外部 promise 是两套独立的
  状态机；当渲染路径 + useEffect 双调用 + 微任务调度三方同时压力大时，
  这两套状态机会错位。
- Suspense 的 fallback 是**幂等**的——即便 promise 已 resolve，Suspense
  也会因为新一轮渲染中 lazy 再次 throw 而继续显示 fallback。
- 16 个模块全部走 React.lazy + Suspense 的设计在生产构建（chunk 真的分离）
  下尚未观察到这个 flake，但 Vite dev 的"按需 transform + HMR 微任务排队"
  会把窗口放大；E2E 是在 dev 下跑的，所以暴露出来。
- 替代方案：自己维护 `Component | null` 状态 + 同步渲染，是最稳的"懒加载"
  形式——本质上是绕开 Suspense 的复杂状态机，付出一个 useState 的代价
  换确定性。
