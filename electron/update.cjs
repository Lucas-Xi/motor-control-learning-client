/**
 * electron-updater 集成层。
 *
 * 设计原则：
 *   - 所有"接 autoUpdater 事件 → 派发结构化 payload"的逻辑都拆成可测纯函数
 *     `buildUpdateEvent`，方便在 Node 单测里直接 import 验证。
 *   - 主进程只暴露 4 个 IPC handler：checkForUpdate / startDownload /
 *     quitAndInstall / （事件流通过 desktop:update-event 推送）。
 *   - 没有窗口时拒绝推事件，避免在 dev/headless 下抛 contents-destroyed。
 *   - 离线友好：网络错误统一映射成 `error` 事件，UI 优雅降级。
 *
 * 真实接 GitHub Release：package.json 的 build.publish.provider = 'github'，
 * 把 <OWNER>/<REPO> 替换成你的仓库后即生效。
 */
const path = require('node:path');
const { ipcMain, BrowserWindow, app } = require('electron');

const CHANNEL = 'desktop:update-event';

// 延迟加载 autoUpdater：保留 require 失败兜底，避免 electron-updater 未装时
// 直接拖垮主进程启动。
let autoUpdater = null;
let loadError = null;
try {
  // eslint-disable-next-line global-require
  autoUpdater = require('electron-updater').autoUpdater;
} catch (err) {
  loadError = err;
}

/**
 * 纯函数：把 autoUpdater 的不同事件归一成统一 payload。
 * 单测里直接 import 验证：不同事件名 + 不同入参 → 期望的 payload 形状。
 *
 * payload.status 枚举：
 *   - 'checking'     正在向源询问
 *   - 'available'    有新版本，等待用户决定是否下载
 *   - 'not-available' 当前已是最新
 *   - 'downloading'  正在下载（带 percent 0-100）
 *   - 'downloaded'   已下载完成，等待重启安装
 *   - 'error'        出错（带 message）
 *   - 'disabled'     更新模块不可用（如 electron-updater 未装 / dev 模式）
 */
function buildUpdateEvent(eventName, info, currentVersion) {
  const base = { status: 'error', currentVersion: currentVersion ?? '0.0.0' };
  switch (eventName) {
    case 'checking-for-update':
      return { ...base, status: 'checking' };
    case 'update-available':
      return {
        ...base,
        status: 'available',
        latest: (info && info.version) || null,
        releaseNotes: (info && info.releaseNotes) || null,
        releaseDate: (info && info.releaseDate) || null,
      };
    case 'update-not-available':
      return {
        ...base,
        status: 'not-available',
        latest: (info && info.version) || currentVersion,
      };
    case 'download-progress': {
      const percent = info && typeof info.percent === 'number' ? info.percent : 0;
      return {
        ...base,
        status: 'downloading',
        percent: Math.max(0, Math.min(100, percent)),
        bytesPerSecond: info && info.bytesPerSecond,
        transferred: info && info.transferred,
        total: info && info.total,
      };
    }
    case 'update-downloaded':
      return {
        ...base,
        status: 'downloaded',
        latest: (info && info.version) || null,
      };
    case 'error':
      return {
        ...base,
        status: 'error',
        message: (info && (info.message || String(info))) || '未知错误',
      };
    case 'disabled':
      return {
        ...base,
        status: 'disabled',
        message: (info && info.message) || 'electron-updater 不可用',
      };
    default:
      return { ...base, status: 'error', message: `未识别的更新事件：${eventName}` };
  }
}

function broadcast(payload) {
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (win && !win.isDestroyed()) {
      try {
        win.webContents.send(CHANNEL, payload);
      } catch {
        /* contents 已销毁 */
      }
    }
  }
}

function isUpdaterUsable() {
  // dev 模式下 electron-updater 默认不工作（没有 app-update.yml）；
  // packaged + autoUpdater 存在才认为可用。
  if (!autoUpdater) return false;
  if (!app.isPackaged) return false;
  return true;
}

function wireAutoUpdaterEvents() {
  if (!autoUpdater) return;
  const currentVersion = app.getVersion();

  // 默认不自动下载：把"下载"动作让给用户主动点击，避免离线/弱网无声占带宽。
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  const events = [
    'checking-for-update',
    'update-available',
    'update-not-available',
    'download-progress',
    'update-downloaded',
    'error',
  ];

  for (const name of events) {
    autoUpdater.on(name, (info) => {
      broadcast(buildUpdateEvent(name, info, currentVersion));
    });
  }
}

function registerUpdateIpc() {
  ipcMain.handle('desktop:update-check', async () => {
    const current = app.getVersion();
    if (!isUpdaterUsable()) {
      const payload = buildUpdateEvent(
        'disabled',
        { message: loadError ? `electron-updater 加载失败：${loadError.message}` : '当前为开发模式，自动更新仅在打包后启用。' },
        current,
      );
      broadcast(payload);
      return { status: 'disabled', current, message: payload.message };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      const latest = result && result.updateInfo ? result.updateInfo.version : current;
      return { status: 'checked', current, latest };
    } catch (err) {
      const message = (err && err.message) || String(err);
      broadcast(buildUpdateEvent('error', { message }, current));
      return { status: 'error', current, error: message };
    }
  });

  ipcMain.handle('desktop:update-download', async () => {
    if (!isUpdaterUsable()) return { status: 'disabled' };
    try {
      await autoUpdater.downloadUpdate();
      return { status: 'ok' };
    } catch (err) {
      const message = (err && err.message) || String(err);
      broadcast(buildUpdateEvent('error', { message }, app.getVersion()));
      return { status: 'error', error: message };
    }
  });

  ipcMain.handle('desktop:update-quit-install', async () => {
    if (!isUpdaterUsable()) return { status: 'disabled' };
    try {
      // 第二个参数 isForceRunAfter=true → 重启后自动拉起应用
      autoUpdater.quitAndInstall(false, true);
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', error: (err && err.message) || String(err) };
    }
  });
}

/**
 * 应用启动后调用：注册 IPC + 事件桥 + 30s 后自动跑一次检查。
 *
 * `app.isPackaged` 为 false 时仅注册 IPC handler（让 UI 能问到一个明确的
 * "disabled" 状态），不会真打更新源——避免 dev/CI 跑出网络副作用。
 */
function initAutoUpdater({ delayMs = 30_000 } = {}) {
  registerUpdateIpc();
  if (!isUpdaterUsable()) {
    // 立即广播一次 disabled，让 UI 在首屏就知道处于"自动更新不可用"
    const current = app.getVersion();
    setTimeout(() => {
      broadcast(
        buildUpdateEvent(
          'disabled',
          {
            message: loadError
              ? `electron-updater 加载失败：${loadError.message}`
              : '当前为开发模式，自动更新仅在打包后启用。',
          },
          current,
        ),
      );
    }, 500);
    return;
  }

  wireAutoUpdaterEvents();

  // 把 app-update.yml 的路径锁到 resources/app/ 下，避免 electron-updater
  // 在某些打包形态下找不到。打包脚本会把 latest.yml 落到 win-unpacked 根，
  // 但 electron-updater 默认从 resources 找 app-update.yml；缺失时会自己创建。
  try {
    const resources = process.resourcesPath;
    if (resources) {
      const cfg = path.join(resources, 'app-update.yml');
      // 仅设置路径；文件由 electron-builder publish 流程生成
      autoUpdater.updateConfigPath = cfg;
    }
  } catch {
    /* ignore */
  }

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      const message = (err && err.message) || String(err);
      broadcast(buildUpdateEvent('error', { message }, app.getVersion()));
    });
  }, Math.max(0, delayMs));
}

module.exports = {
  CHANNEL,
  buildUpdateEvent,
  initAutoUpdater,
  // 导出仅供测试 / 主进程内复用
  _internals: { broadcast, isUpdaterUsable },
};
