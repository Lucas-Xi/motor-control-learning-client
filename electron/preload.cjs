/**
 * Renderer ↔ Main 桥。
 *
 * 安全原则：
 *   - 不暴露 fs / shell / require；只暴露最小必要 method。
 *   - subscribe 拒绝任意频道：白名单内的事件名才能订阅。
 */
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_CHANNELS = new Set([
  'desktop:menu',
  'desktop:open-snapshot',
  'desktop:update-event',
]);

function subscribe(channel, handler) {
  if (!ALLOWED_CHANNELS.has(channel)) {
    console.warn(`[preload] refuse subscribe to ${channel}`);
    return () => {};
  }
  if (typeof handler !== 'function') return () => {};
  const wrapped = (_event, payload) => {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[preload] subscriber for ${channel} threw:`, err);
    }
  };
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.off(channel, wrapped);
}

function unsubscribe(channel, handler) {
  if (!ALLOWED_CHANNELS.has(channel)) return;
  if (typeof handler === 'function') ipcRenderer.off(channel, handler);
}

contextBridge.exposeInMainWorld('motorControlDesktop', {
  getMetadata: () => ipcRenderer.invoke('desktop:get-metadata'),
  openSnapshotFile: () => ipcRenderer.invoke('desktop:open-snapshot-dialog'),
  saveSnapshotFile: (json) => ipcRenderer.invoke('desktop:save-snapshot-dialog', json),
  // 兼容老版"帮助→检查更新"菜单调用
  checkForUpdate: () => ipcRenderer.invoke('desktop:check-update'),
  setTheme: (theme) => ipcRenderer.invoke('desktop:set-theme', theme),
  getWindowState: () => ipcRenderer.invoke('desktop:get-window-state'),
  setWindowState: (state) => ipcRenderer.invoke('desktop:set-window-state', state),
  subscribe,
  unsubscribe,
  // ---- 自动更新（electron-updater）----
  // 主动触发一次后台检查（返回 { status, current, latest?, error? }）；
  // 事件流详情通过 subscribeUpdateEvents 订阅 desktop:update-event。
  checkForUpdateNow: () => ipcRenderer.invoke('desktop:update-check'),
  // 用户在 UpdateBanner 上点"立即下载"
  startUpdateDownload: () => ipcRenderer.invoke('desktop:update-download'),
  // 用户在 UpdateBanner 上点"重启并安装"
  quitAndInstallUpdate: () => ipcRenderer.invoke('desktop:update-quit-install'),
  // 订阅 update 事件流；handler 接收 { status, latest?, percent?, message? }
  subscribeUpdateEvents: (handler) => subscribe('desktop:update-event', handler),
});
