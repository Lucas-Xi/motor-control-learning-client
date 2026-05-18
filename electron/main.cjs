const { app, BrowserWindow, ipcMain, nativeTheme, shell, dialog } = require('electron');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

const { installMenu, pickAndReadSnapshot, pickAndWriteSnapshot } = require('./menu.cjs');
const { installTray, disposeTray } = require('./tray.cjs');
const { createSplash, closeSplash } = require('./splash.cjs');
const { initAutoUpdater } = require('./update.cjs');

const APP_TITLE = '电机控制学习客户端';

let mainWindow = null;
let pendingOpenFiles = [];

function resolveAppPath(...segments) {
  return path.join(app.getAppPath(), ...segments);
}

function resolveIconPath() {
  const distIcon = resolveAppPath('dist', 'favicon.ico');
  if (existsSync(distIcon)) return distIcon;
  const publicIcon = resolveAppPath('public', 'favicon.ico');
  return existsSync(publicIcon) ? publicIcon : undefined;
}

function resolveRendererUrl() {
  const devServerUrl = process.env.ELECTRON_START_URL || process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) return { type: 'url', value: devServerUrl };
  return { type: 'file', value: resolveAppPath('dist', 'index.html') };
}

/* ---------------- 窗口状态持久化 ----------------
 * 主进程在 userData 下落地一份 window-state.json，作为下次启动的恢复源（创建窗口
 * 时渲染层还没起，无法读 localStorage）。同时通过 preload bridge 暴露 get/set
 * 接口让渲染层也能把同一份状态写进 localStorage，做"双轨"对齐。
 */
function getWindowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  try {
    const raw = readFileSync(getWindowStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function writeWindowState(state) {
  try {
    writeFileSync(getWindowStatePath(), JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('writeWindowState failed:', err && err.message ? err.message : err);
  }
}

function snapshotBounds(win) {
  if (!win || win.isDestroyed()) return null;
  const bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: win.isMaximized(),
    isFullScreen: win.isFullScreen(),
  };
}

function createMainWindow() {
  const restored = readWindowState();
  const initial = {
    width: restored?.width ?? 1440,
    height: restored?.height ?? 940,
    x: restored?.x,
    y: restored?.y,
  };

  mainWindow = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    x: initial.x,
    y: initial.y,
    minWidth: 1180,
    minHeight: 720,
    title: APP_TITLE,
    backgroundColor: '#030712',
    autoHideMenuBar: false,
    icon: resolveIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  if (restored?.isMaximized) {
    mainWindow.maximize();
  }
  if (restored?.isFullScreen) {
    mainWindow.setFullScreen(true);
  }

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
    // 主窗口出现后，把启动期间累积的待打开文件一次性派发
    flushPendingOpenFiles();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 关闭前抓一份 bounds 落盘
  mainWindow.on('close', () => {
    const snap = snapshotBounds(mainWindow);
    if (snap) writeWindowState(snap);
  });

  // 托盘隐藏模式：用户点 X 时如果 tray 在，隐藏到托盘而不是退出（macOS 不开启）
  // 这里保持默认行为不强制托盘化，避免学员"找不到窗口"的困惑——只在显式选择
  // 托盘菜单"隐藏主窗口"时才隐藏。

  const renderer = resolveRendererUrl();
  if (renderer.type === 'url') {
    mainWindow.loadURL(renderer.value);
  } else {
    mainWindow.loadFile(renderer.value);
  }

  return mainWindow;
}

function flushPendingOpenFiles() {
  if (pendingOpenFiles.length === 0) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  for (const filePath of pendingOpenFiles) {
    deliverSnapshotFile(filePath).catch((err) => {
      console.warn('deliverSnapshotFile failed:', err && err.message ? err.message : err);
    });
  }
  pendingOpenFiles = [];
}

async function deliverSnapshotFile(filePath) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingOpenFiles.push(filePath);
    return;
  }
  try {
    const json = await readFile(filePath, 'utf8');
    mainWindow.webContents.send('desktop:open-snapshot', { json, source: filePath });
  } catch (err) {
    dialog.showErrorBox('打开 .compbench 失败', String(err && err.message ? err.message : err));
  }
}

/* ---------------- IPC ---------------- */
function registerIpc() {
  ipcMain.handle('desktop:get-metadata', () => ({
    name: APP_TITLE,
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle('desktop:get-window-state', () => readWindowState());
  ipcMain.handle('desktop:set-window-state', (_event, state) => {
    if (state && typeof state === 'object') writeWindowState(state);
    return true;
  });

  ipcMain.handle('desktop:set-theme', (_event, theme) => {
    if (theme === 'dark' || theme === 'light') {
      nativeTheme.themeSource = theme;
      return theme;
    }
    return nativeTheme.themeSource;
  });

  ipcMain.handle('desktop:open-snapshot-dialog', async () => {
    const result = await pickAndReadSnapshot();
    return result; // { json, source } 或 null
  });

  ipcMain.handle('desktop:save-snapshot-dialog', async (_event, json) => {
    const filePath = await pickAndWriteSnapshot(typeof json === 'string' ? json : JSON.stringify(json ?? {}, null, 2));
    return filePath; // 路径或 null
  });

  // 兼容旧版本"帮助 → 检查更新"菜单：转发到 update.cjs 注册的 desktop:update-check。
  // 仅返回当前版本信息；真正的事件流（available / progress / downloaded）走
  // desktop:update-event 推送。
  ipcMain.handle('desktop:check-update', async () => {
    return {
      ok: true,
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      updateAvailable: false,
      message: '更新检查已发起，详见顶部更新条。',
      feedUrl: 'github://<OWNER>/<REPO>',
    };
  });
}

app.setAppUserModelId('com.ciii.motor-control-learning-client');

// 单实例：第二次启动直接把焦点还给已开窗口，并把传入的文件转交
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Windows 关联打开会把文件路径作为最后一个 argv 传进来
    for (const arg of argv.slice(1)) {
      if (typeof arg === 'string' && /\.compbench$/i.test(arg) && existsSync(arg)) {
        deliverSnapshotFile(arg).catch(() => {});
      }
    }
  });
}

// macOS / 关联打开
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) {
    deliverSnapshotFile(filePath).catch(() => {});
  } else {
    pendingOpenFiles.push(filePath);
  }
});

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';

  registerIpc();
  createSplash();
  installMenu();
  createMainWindow();
  installTray(resolveIconPath());
  // 自动更新：注册 IPC + 30s 后跑一次后台检查（dev 模式会广播 disabled）
  initAutoUpdater({ delayMs: 30_000 });

  // Windows 上启动参数里若带了 .compbench 也补一次
  for (const arg of process.argv.slice(1)) {
    if (typeof arg === 'string' && /\.compbench$/i.test(arg) && existsSync(arg)) {
      pendingOpenFiles.push(arg);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  disposeTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
