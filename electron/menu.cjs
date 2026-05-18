/**
 * 原生菜单：File / View / Help。
 *
 * 设计原则：菜单只发 IPC 事件给渲染进程；不在主进程"按"渲染层按钮，
 * 也不直接操作 store。所有业务动作都由渲染进程订阅 `desktop:menu` 频道执行。
 *
 * IPC 频道：
 *   desktop:menu  —— 主进程 → 渲染进程；payload = { action: <id>, ...extra }
 *   desktop:open-snapshot —— 主进程 → 渲染进程；payload = { json, source }
 */
const { Menu, app, dialog, BrowserWindow, shell } = require('electron');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

function send(action, extra = {}) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  win.webContents.send('desktop:menu', { action, ...extra });
}

async function pickAndReadSnapshot() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win || undefined, {
    title: '打开 .compbench 工况',
    filters: [
      { name: '压缩机工况快照', extensions: ['compbench', 'json'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const json = await readFile(filePath, 'utf8');
  return { json, source: filePath };
}

async function pickAndWriteSnapshot(defaultJson) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showSaveDialog(win || undefined, {
    title: '保存为 .compbench 工况',
    defaultPath: `snapshot-${Date.now()}.compbench`,
    filters: [{ name: '压缩机工况快照', extensions: ['compbench'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, defaultJson ?? '{}', 'utf8');
  return result.filePath;
}

function buildTemplate() {
  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const template = [
    {
      label: '文件(&F)',
      submenu: [
        {
          label: '新建快照',
          accelerator: 'CmdOrCtrl+N',
          click: () => send('file:new-snapshot'),
        },
        {
          label: '打开 .compbench…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            try {
              const payload = await pickAndReadSnapshot();
              if (payload) {
                const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
                if (win && !win.isDestroyed()) {
                  win.webContents.send('desktop:open-snapshot', payload);
                }
              }
            } catch (err) {
              dialog.showErrorBox('打开失败', String(err && err.message ? err.message : err));
            }
          },
        },
        {
          label: '保存为 .compbench…',
          accelerator: 'CmdOrCtrl+S',
          click: () => send('file:save-snapshot'),
        },
        {
          label: '导出 STM32 工程…',
          accelerator: 'CmdOrCtrl+E',
          click: () => send('file:export-stm32'),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '视图(&V)',
      submenu: [
        {
          label: '切换全屏',
          accelerator: 'F11',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) win.setFullScreen(!win.isFullScreen());
          },
        },
        { role: 'resetZoom', label: '缩放重置', accelerator: 'CmdOrCtrl+0' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        {
          label: '切换主题（暗/亮）',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => send('view:toggle-theme'),
        },
        {
          label: '打开课程主线',
          accelerator: 'CmdOrCtrl+L',
          click: () => send('view:open-curriculum'),
        },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
    {
      label: '帮助(&H)',
      submenu: [
        {
          label: '键盘快捷键',
          accelerator: 'F1',
          click: () => send('help:keybindings'),
        },
        {
          label: '关于',
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            const versions = process.versions;
            dialog
              .showMessageBox(win || undefined, {
                type: 'info',
                title: '关于',
                message: '电机控制学习客户端',
                detail: `版本 ${app.getVersion()}\nElectron ${versions.electron}\nChromium ${versions.chrome}\nNode ${versions.node}\n\n面向 BLDC/PMSM/FOC/SVPWM 学习的交互式客户端。`,
                buttons: ['知道了'],
              })
              .catch(() => {});
          },
        },
        {
          label: '检查更新…',
          click: () => send('help:check-update'),
        },
        { type: 'separator' },
        {
          label: '项目主页',
          click: () => shell.openExternal('https://github.com/').catch(() => {}),
        },
      ],
    },
  ];
  return template;
}

function installMenu() {
  const menu = Menu.buildFromTemplate(buildTemplate());
  Menu.setApplicationMenu(menu);
}

module.exports = {
  installMenu,
  pickAndReadSnapshot,
  pickAndWriteSnapshot,
};
