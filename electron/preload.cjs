/**
 * Renderer ↔ Main 桥。
 *
 * 安全原则：
 *   - 不暴露 fs / shell / require；只暴露最小必要 method。
 *   - subscribe 拒绝任意频道：白名单内的事件名才能订阅。
 */
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_CHANNELS = new Set(['desktop:menu', 'desktop:open-snapshot']);

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
  checkForUpdate: () => ipcRenderer.invoke('desktop:check-update'),
  setTheme: (theme) => ipcRenderer.invoke('desktop:set-theme', theme),
  getWindowState: () => ipcRenderer.invoke('desktop:get-window-state'),
  setWindowState: (state) => ipcRenderer.invoke('desktop:set-window-state', state),
  subscribe,
  unsubscribe,
});
