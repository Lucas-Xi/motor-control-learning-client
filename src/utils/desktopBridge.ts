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

/** 自动更新事件 payload（来自主进程 update.cjs::buildUpdateEvent）。 */
export type UpdateEventStatus =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'disabled';

export interface UpdateEvent {
  status: UpdateEventStatus;
  currentVersion: string;
  latest?: string | null;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  releaseNotes?: string | null;
  releaseDate?: string | null;
  message?: string;
}

export interface UpdateActionResult {
  status: 'ok' | 'disabled' | 'error' | 'checked';
  current?: string;
  latest?: string;
  error?: string;
  message?: string;
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
  // 自动更新（electron-updater）
  checkForUpdateNow?: () => Promise<UpdateActionResult>;
  startUpdateDownload?: () => Promise<UpdateActionResult>;
  quitAndInstallUpdate?: () => Promise<UpdateActionResult>;
  subscribeUpdateEvents?: (handler: (event: UpdateEvent) => void) => () => void;
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

/* ===== 自动更新 helpers（renderer 侧） =====
 * 所有 API 都做"桥不存在 → 安全降级"处理。订阅函数返回的 unsubscribe 在
 * Web 浏览器里是 no-op，可以无脑放到 useEffect 的 cleanup。
 */

const UPDATE_BANNER_SESSION_KEY = 'compbench:update-banner-dismissed';

/** 订阅自动更新事件流；非 Electron 环境返回 no-op 解绑。 */
export function subscribeUpdateEvents(handler: (event: UpdateEvent) => void): () => void {
  const bridge = getDesktopBridge();
  if (!bridge || !bridge.subscribeUpdateEvents) return () => {};
  return bridge.subscribeUpdateEvents(handler);
}

/** 主动触发一次后台检查（返回结果不含事件细节，需配合订阅使用）。 */
export async function checkForUpdateNow(): Promise<UpdateActionResult | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.checkForUpdateNow) return null;
  try {
    return await bridge.checkForUpdateNow();
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/** 触发"立即下载"——用户在 UpdateBanner 上点击。 */
export async function startUpdateDownload(): Promise<UpdateActionResult | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.startUpdateDownload) return null;
  try {
    return await bridge.startUpdateDownload();
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/** 触发"重启并安装"——下载完成后用户点击。 */
export async function quitAndInstallUpdate(): Promise<UpdateActionResult | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.quitAndInstallUpdate) return null;
  try {
    return await bridge.quitAndInstallUpdate();
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 「暂不更新」：把当前提示版本号写入 sessionStorage，本会话内不再弹。
 * 下次启动应用（开新进程）时 sessionStorage 自动失效，banner 会重新出现。
 */
export function dismissUpdateBannerThisSession(version: string | null | undefined): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(UPDATE_BANNER_SESSION_KEY, version ?? '*');
  } catch {
    /* 隐私模式 / 配额满 → 静默 */
  }
}

/** 读取本会话已暂忽略的版本号；返回 null 表示没有暂忽略。 */
export function readDismissedBannerVersion(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(UPDATE_BANNER_SESSION_KEY);
  } catch {
    return null;
  }
}
