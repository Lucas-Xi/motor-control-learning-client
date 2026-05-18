/**
 * 托盘图标。
 *
 * Windows 上建议提供 16×16 / 32×32 多尺寸 .ico；这里复用 public/favicon.ico
 * （已包含多分辨率），Electron 会按 DPI 选择最小 16 px 的子图。
 *
 * 左键单击：聚焦主窗口（隐藏则恢复）。
 * 右键菜单：显示/隐藏、退出。
 */
const { Tray, Menu, BrowserWindow, app, nativeImage } = require('electron');
const { existsSync } = require('node:fs');

let trayInstance = null;

function showMainWindow() {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

function hideMainWindow() {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  win.hide();
}

function buildContextMenu() {
  return Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: showMainWindow,
    },
    {
      label: '隐藏主窗口',
      click: hideMainWindow,
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
}

function installTray(iconPath) {
  if (trayInstance) return trayInstance;
  let image = null;
  if (iconPath && existsSync(iconPath)) {
    image = nativeImage.createFromPath(iconPath);
  }
  if (!image || image.isEmpty()) {
    // Electron 在 Windows 上没图标时会拒绝创建 Tray；退而求其次造一个空白
    image = nativeImage.createEmpty();
  }
  try {
    trayInstance = new Tray(image);
  } catch (err) {
    // 某些精简 Windows 镜像没有 shell tray API，安全降级
    console.warn('Tray init failed:', err && err.message ? err.message : err);
    return null;
  }
  trayInstance.setToolTip('电机控制学习客户端');
  trayInstance.setContextMenu(buildContextMenu());
  trayInstance.on('click', showMainWindow);
  return trayInstance;
}

function disposeTray() {
  if (trayInstance && !trayInstance.isDestroyed()) {
    trayInstance.destroy();
  }
  trayInstance = null;
}

module.exports = { installTray, disposeTray };
