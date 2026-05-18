# Electron 自动更新（electron-updater + GitHub Release）

本客户端的 Windows 桌面版（NSIS 安装器 / portable）通过 [`electron-updater`](https://www.electron.build/auto-update) + GitHub Release 完成"发现新版本 → 一键下载 → 重启安装"的闭环。本文给开发者 / 发布者 / 终端用户都列一份操作要点。

---

## 1. 仓库一次性配置（开发者）

发布前必须把 `package.json` 的 `build.publish` 占位换成真实仓库：

```jsonc
"publish": [
  {
    "provider": "github",
    "owner": "<OWNER>",   // 例如 "vincent-xi"
    "repo": "<REPO>",     // 例如 "motor-control-learning-client"
    "releaseType": "release"
  }
]
```

GitHub 上对应仓库必须存在；不需要预先建 Release——CI 会用 tag 同名 Release。`releaseType: release` 表示直接发正式版（要发预发就改成 `prerelease`）。

> 不替换占位 `<OWNER>/<REPO>` 也能跑 `npm run desktop:pack` 和单测，但 CI 的 publish 步骤会 404。

可选：如果有代码签名证书，在 GitHub Settings → Secrets 配置：

- `CSC_LINK`：base64 之后的 `.pfx` 证书内容
- `CSC_KEY_PASSWORD`：证书密码

未配置时 Windows SmartScreen 首次安装会弹"未识别的发布者"——用户点 **更多信息 → 仍要运行** 即可继续。

## 2. 发布流程

```bash
# 1) 改 package.json 的 version，例如 0.1.0 → 0.2.0
npm version 0.2.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "release: v0.2.0"

# 2) 打 tag 并推送，触发 .github/workflows/release.yml
git tag v0.2.0
git push origin master
git push origin v0.2.0
```

`release.yml` 会在 `windows-latest` 上跑：

1. `npm ci`
2. `npx tsc -b --noEmit` + `npx vitest run`
3. `npm run build`（vite 出 `dist/`）
4. `npx electron-builder --win nsis portable --publish always`
5. 上传 `.exe`、`latest.yml`、`.blockmap` 到名为 `v0.2.0` 的 Release

CI 把产物同时备份到 workflow artifacts，14 天保留，方便回滚。

## 3. 用户体验（终端用户视角）

桌面客户端启动 30 秒后会静默向 GitHub Release 查询一次最新版本。结果通过顶部 banner 呈现，6 个状态：

| 状态 | banner 显示 | 用户动作 |
|------|------------|---------|
| 检查中 | "正在检查更新…"（cyan 跳动点） | 等待 |
| 发现新版本 | "发现新版本 v0.2.0（当前 v0.1.0）" | **立即下载** / **暂不更新** |
| 下载中 | 进度条 + "下载更新中 47%" | 自动 |
| 下载完成 | "v0.2.0 已下载完成，重启后生效"（mint 点） | **重启并安装** / **稍后重启** |
| 已是最新 | "已是最新版本"（mint 点，5 秒自动收起） | 可关闭 |
| 错误 | "更新失败：<message>"（rose 点） | **重试** / 关闭 |

「暂不更新」会把该版本号写到 `sessionStorage`，**本次启动**内不再弹；下次开应用又会出现。

「重启并安装」会调用 `autoUpdater.quitAndInstall(false, true)`，安装完成后自动重新拉起客户端。

## 4. 离线 / 弱网怎么办

- 没网时 `autoUpdater.checkForUpdates()` 会抛网络异常，UI 显示「更新失败」并提供"重试"按钮——不影响应用主体功能。
- 30 秒延迟检查给了用户充足的离线学习窗口；想再延后可在 `electron/main.cjs` 把 `initAutoUpdater({ delayMs: 30_000 })` 的延迟调大。
- 完全禁用：把 `electron/main.cjs` 里 `initAutoUpdater(...)` 那一行注释掉即可。Banner 也会跟着永不渲染（subscribe 没人推事件）。
- 内网部署：把 `build.publish.provider` 改成 `generic`，给一个内网 URL，再把 NSIS 产物 + `latest.yml` 镜像上去。

## 5. 强制更新策略

当前默认策略是 **温和**：发现更新弹 banner，下载与安装都需要用户点按钮。

要做"强制更新"（如安全补丁），可以在 `electron/update.cjs` 改：

```js
autoUpdater.autoDownload = true;          // 自动下载，不再等用户点"立即下载"
autoUpdater.autoInstallOnAppQuit = true;  // 默认已是 true，下次退出时静默装
```

更激进：在 `update-downloaded` 事件里直接 `autoUpdater.quitAndInstall()` 立即重启——但学习场景里这会丢失未保存的快照，**不推荐**。

## 6. NSIS vs Portable 的选择

`electron-builder` 现在同时产出两个 target：

| Target | 适用场景 | 自动更新 |
|--------|---------|---------|
| `nsis` | 一般用户：需要"开始菜单 / 桌面快捷方式 / 卸载入口" | 可用（推荐） |
| `portable` | 实验室 / 教学机：单 exe 拷走就跑，不写注册表 | **不支持原地替换**（portable 模式下 `autoUpdater.quitAndInstall()` 只下载、不替换） |

我们让两种产物都进 Release：默认推荐 NSIS（自动更新闭环完整），portable 留给「不允许装软件」的场景，但走 portable 的人必须接受手动下载新版本。

## 7. 安全约束

- preload 的 `ALLOWED_CHANNELS` 白名单显式列出 `desktop:update-event`，其它频道 `subscribe` 会被拒绝。
- 主进程只暴露 4 个更新相关 IPC：`desktop:update-check` / `desktop:update-download` / `desktop:update-quit-install` / 事件流频道。**没有暴露 fs / shell / 任意命令执行。**
- `autoUpdater.autoDownload = false` 默认不自动下载，避免在弱网/计量网络上无声占带宽。

## 8. 本地验证（不真发 GitHub）

```bash
npm run desktop:pack           # 产出 release/win-unpacked/电机控制学习客户端.exe
./release/win-unpacked/电机控制学习客户端.exe
```

打开后 30 秒内你会在顶部看到 banner 自动隐藏（dev/unpacked 模式下 `app.isPackaged === false`，`update.cjs` 广播 `disabled` 事件 → UI 静默）。要看到 banner 出现，先打 NSIS 安装器：

```bash
npx electron-builder --win nsis --publish never
# 装到本机，然后改 latest.yml 把 version 调高到比 package.json 大的值再上传到 publish URL
```

`subscribeUpdateEvents` 的事件流也可以在 DevTools 里手动伪造测试：

```js
// 在 Electron DevTools console 里：
window.motorControlDesktop.subscribeUpdateEvents = (h) => {
  setTimeout(() => h({ status: 'available', currentVersion: '0.1.0', latest: '9.9.9' }), 500);
  return () => {};
};
location.reload();
```

## 9. 相关文件

- `electron/update.cjs` — autoUpdater 集成 + 纯函数 `buildUpdateEvent`
- `electron/main.cjs` — `initAutoUpdater({ delayMs: 30_000 })` 在 `app.whenReady` 后调
- `electron/preload.cjs` — `checkForUpdateNow / startUpdateDownload / quitAndInstallUpdate / subscribeUpdateEvents` 暴露
- `src/utils/desktopBridge.ts` — renderer 侧空安全封装
- `src/components/desktop/UpdateBanner.tsx` — 顶部 banner，6 个状态
- `src/utils/__tests__/desktopBridge.test.ts` — 21 个单测覆盖纯函数和 IPC 封装
- `.github/workflows/release.yml` — 推 `v*.*.*` tag 自动构建并发布
- `package.json` — `build.publish` / `build.win.target` 配置
