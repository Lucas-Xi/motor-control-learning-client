const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require('electron');
const { existsSync } = require('node:fs');
const path = require('node:path');

const APP_TITLE = '电机控制学习客户端';

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

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1180,
    minHeight: 720,
    title: APP_TITLE,
    backgroundColor: '#030712',
    autoHideMenuBar: true,
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const renderer = resolveRendererUrl();
  if (renderer.type === 'url') {
    mainWindow.loadURL(renderer.value);
  } else {
    mainWindow.loadFile(renderer.value);
  }
}

app.setAppUserModelId('com.ciii.motor-control-learning-client');

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';

  ipcMain.handle('desktop:get-metadata', () => ({
    name: APP_TITLE,
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
  }));

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
