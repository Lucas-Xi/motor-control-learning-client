/**
 * 桌面端桥（renderer 侧）。
 *
 * 在 Electron 里，preload.cjs 通过 `contextBridge.exposeInMainWorld('motorControlDesktop', ...)`
 * 暴露一个 IPC 表面。本模块给 web 代码提供一个统一、可空安全的访问点：
 *   - Web 浏览器模式下 `motorControlDesktop` 是 undefined → 所有 helper 安全空运行。
 *   - Electron 模式下转发到对应 IPC handler。
 *
 * 设计约束：
 *   - 不在这里写业务逻辑；只做"有没有桌面 API、调一下"这一层。
 *   - 订阅通道有白名单（与 preload 内一致），传别的会被 preload 拒绝。
 */

export type DesktopMenuAction =
  | 'file:new-snapshot'
  | 'file:save-snapshot'
  | 'file:export-stm32'
  | 'view:toggle-theme'
  | 'view:open-curriculum'
  | 'help:keybindings'
  | 'help:check-update';

export interface DesktopMenuEvent {
  action: DesktopMenuAction | string;
  [extra: string]: unknown;
}

export interface OpenSnapshotPayload {
  json: string;
  source?: string;
}

export interface DesktopMetadata {
  name: string;
  version: string;
  platform: string;
  isPackaged: boolean;
}

export interface UpdateCheckResult {
  ok: boolean;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  message: string;
  feedUrl?: string;
}

interface DesktopBridge {
  getMetadata: () => Promise<DesktopMetadata>;
  openSnapshotFile: () => Promise<OpenSnapshotPayload | null>;
  saveSnapshotFile: (json: string) => Promise<string | null>;
  checkForUpdate: () => Promise<UpdateCheckResult>;
  setTheme: (theme: 'dark' | 'light') => Promise<string>;
  getWindowState: () => Promise<unknown>;
  setWindowState: (state: unknown) => Promise<boolean>;
  subscribe: <T = unknown>(channel: string, handler: (payload: T) => void) => () => void;
  unsubscribe: (channel: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    motorControlDesktop?: DesktopBridge;
  }
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  return window.motorControlDesktop ?? null;
}

export function isDesktopRuntime(): boolean {
  return getDesktopBridge() !== null;
}

/** 订阅原生菜单事件；非 Electron 环境返回 no-op 解绑 */
export function subscribeMenu(handler: (event: DesktopMenuEvent) => void): () => void {
  const bridge = getDesktopBridge();
  if (!bridge) return () => {};
  return bridge.subscribe<DesktopMenuEvent>('desktop:menu', handler);
}

/** 订阅"打开 .compbench"事件 */
export function subscribeOpenSnapshot(handler: (event: OpenSnapshotPayload) => void): () => void {
  const bridge = getDesktopBridge();
  if (!bridge) return () => {};
  return bridge.subscribe<OpenSnapshotPayload>('desktop:open-snapshot', handler);
}

/** 把当前窗口的 bounds 镜像写到 localStorage（"双轨"持久化的渲染侧） */
const LS_KEY = 'compbench:window-state';

export function persistWindowStateToLocalStorage(state: unknown): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_KEY, JSON.stringify(state ?? null));
  } catch {
    /* 隐私模式 / 配额满 → 静默 */
  }
}

export function readWindowStateFromLocalStorage(): unknown {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 启动后调用一次：从主进程拉 windowState 镜像进 localStorage，让 web 侧 dev 也能看见 */
export async function syncWindowStateOnce(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge) return;
  try {
    const state = await bridge.getWindowState();
    if (state) persistWindowStateToLocalStorage(state);
  } catch {
    /* 桥不可用 */
  }
}
