/**
 * 启动屏。480×320 无边框 + 内嵌静态 HTML，避免 file:// 跨路径加载。
 * 主窗口 `ready-to-show` 时关闭；最多撑到 1 秒，避免感觉卡死。
 */
const { BrowserWindow } = require('electron');

let splashInstance = null;
let autoCloseTimer = null;

const SPLASH_HTML = `
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>启动中…</title>
    <style>
      :root { color-scheme: dark; }
      html, body { margin: 0; padding: 0; height: 100%; }
      body {
        background: linear-gradient(160deg, #050b18 0%, #0b1b2e 55%, #07111d 100%);
        color: #e6f6ff;
        font-family: "Microsoft YaHei", "PingFang SC", system-ui, -apple-system, sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 18px;
        -webkit-app-region: drag;
        overflow: hidden;
      }
      .logo {
        width: 88px;
        height: 88px;
        border-radius: 22px;
        background: radial-gradient(circle at 30% 30%, #34d6ff 0%, #1c7fb3 60%, #0b3550 100%);
        box-shadow: 0 12px 36px rgba(52, 214, 255, 0.18);
        display: grid;
        place-items: center;
        color: #06141f;
        font-weight: 700;
        font-size: 26px;
        letter-spacing: 1px;
      }
      .title {
        font-size: 18px;
        font-weight: 600;
        letter-spacing: 0.5px;
      }
      .subtitle {
        font-size: 12px;
        color: #8fb4ce;
        letter-spacing: 0.3px;
      }
      .progress {
        width: 220px;
        height: 3px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.08);
        overflow: hidden;
      }
      .progress::after {
        content: "";
        display: block;
        width: 40%;
        height: 100%;
        background: linear-gradient(90deg, #34d6ff, #43f7b5);
        animation: slide 1.1s ease-in-out infinite;
      }
      @keyframes slide {
        0%   { transform: translateX(-100%); }
        50%  { transform: translateX(100%); }
        100% { transform: translateX(260%); }
      }
    </style>
  </head>
  <body>
    <div class="logo">M C</div>
    <div class="title">压缩机变频器控制学习客户端</div>
    <div class="subtitle">正在初始化仿真引擎…</div>
    <div class="progress" aria-hidden="true"></div>
  </body>
</html>
`;

function createSplash() {
  if (splashInstance && !splashInstance.isDestroyed()) return splashInstance;
  splashInstance = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    show: true,
    skipTaskbar: true,
    backgroundColor: '#050b18',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  splashInstance
    .loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(SPLASH_HTML)}`)
    .catch(() => {});
  // 兜底 1 秒自动关闭：哪怕主窗口 ready-to-show 没触发，splash 也不该常驻
  autoCloseTimer = setTimeout(() => {
    closeSplash();
  }, 1000);
  return splashInstance;
}

function closeSplash() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
  if (splashInstance && !splashInstance.isDestroyed()) {
    splashInstance.close();
  }
  splashInstance = null;
}

module.exports = { createSplash, closeSplash };
