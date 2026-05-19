# 隐私声明 / Privacy Notice

*最后更新 / Last updated: 2026-05-19*

本应用是一个交互式 BLDC / PMSM / FOC 教学客户端，绝大部分数据处理都在你本地浏览器或桌面进程内完成。下面把"存了什么"、"传了什么"、"传到哪里"逐条说清楚。

This application is an interactive BLDC / PMSM / FOC learning client. The vast majority of data processing happens locally in your browser or desktop process. Below we enumerate, line by line, what is stored, what is transmitted, and to whom.

---

## 一、本地存储（localStorage / sessionStorage）

以下数据**仅写在你的浏览器**，永不离开你的设备，关闭浏览器或卸载应用时随之消失：

The following data is **stored only in your browser** and never leaves your device. It is cleared when you close the browser or uninstall the app:

| store | localStorage key | 内容 / Content | 用途 / Purpose |
|---|---|---|---|
| useSimulationStore | （未 persist） | 17 模块运行时仿真参数 | 仿真状态 |
| useProgressStore | `compressor-bench-progress` | 每模块的 walkthrough 步骤位置 | 教学进度 |
| useChallengeStore | `compressor-bench-challenges` | 实验挑战通关 / 尝试次数 / 最佳值 | 进度跟踪 |
| useCurriculumStore | `compressor-bench-curriculum` | 4 条课程主线 checkpoint 完成度 | 学习路径 |
| useInsightsStore | `compressor-bench-insights` | 错题本 / 步骤复看次数 / 挑战尝试历史 | 学习洞察 |
| useReplayStore | `compressor-bench-replay` | 解题路径时间线（最近 30 步/题） | 复盘回放 |
| useSnapshotsStore | `compressor-bench-snapshots` | 本地参数快照 + 远端 snapshot 缓存 | 参数对比 |
| useReviewersStore | `compressor-bench-reviewers` | 团队评审者名称 + 着色（不含 PAT） | PR Review 标识 |
| useThemeStore | `compressor-bench-theme` | 主题选择 (dark/light/high-contrast/projector/colorblind) | 视觉偏好 |
| useI18nStore | `compressor-bench-locale` | 界面语言 (zh-CN / en-US / 等) | 国际化 |
| useAssistantStore | `compressor-bench-assistant` | AI 助手对话历史（最近 50 条） | 教学问答 |
| useAssemblyProgressStore | `compressor-bench-assembly` | 17 号搭积木 6 槽位选型 + 节点位置 | 整机搭建 |

**清除方式 / How to clear**: 浏览器开发者工具 → Application/Storage → Local Storage → 选 origin → Clear，或在系统设置里清缓存。

---

## 二、Session-only（仅当前标签页）

以下数据写在 **sessionStorage**，关闭标签页立即销毁，**永远不写 localStorage**：

The following data is held in **sessionStorage only**, destroyed the moment you close the tab, **never written to localStorage**:

| store | sessionStorage key | 内容 | 为什么这么严格 |
|---|---|---|---|
| useCloudShareStore | `compbench:gist:pat` | 你提供的 GitHub Personal Access Token | PAT 等同于 GitHub 账号密码部分权限，绝不持久化 |
| useLlmStore | `compbench:llm:keys` | OpenAI / Anthropic / Gemini API key | API key 持久化 = 信用卡持久化，禁止 |

---

## 三、对外发送的数据

以下数据**只在你明确点击触发时**才会离开本机，发送目的地见对应章节：

The following is transmitted to external services **only when you explicitly click an action**:

### 3.1 URL token 分享（本地数字孪生 V1）

- **触发**：你点击"生成分享链接" → 复制
- **内容**：snapshotCodec 紧凑编码的当前 17 模块参数 + 挑战通关摘要（仅可读 best value，不含尝试次数 / 时间戳）
- **目的地**：由你决定。可复制到聊天工具、邮件、社交平台
- **token 长度**：< 1200 字符；可被任何能解码 base64 的人读懂

### 3.2 GitHub Gist 云协作（V2 / V3）

- **触发**：你输入 GitHub PAT + 点击 "上传到 Gist"
- **内容**：同上 URL token，外加你可选填写的 description
- **目的地**：`https://api.github.com/gists`（GitHub Inc.）
- **GitHub 隐私政策**：<https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement>
- **可见性**：你选"公共 gist" → 任何人可读；选"私密 gist" → 仅你和被你授权的人可读
- **删除**：在 GitHub 网页上手动删除 gist；本地缓存可通过 "断开" 按钮清空

### 3.3 LLM 教学助手（BYOK）

- **触发**：你在 LLMSettingsModal 选择 provider + 填写 API key + 发起对话
- **内容**：你的问题 + 助手从内置教学资料中检索到的相关片段（top-5 chunk）+ 历史对话
- **目的地**：根据 provider 选择
  - OpenAI: `https://api.openai.com/v1/chat/completions` (OpenAI LLC, USA)
  - Anthropic: `https://api.anthropic.com/v1/messages` (Anthropic PBC, USA)
  - Google: `https://generativelanguage.googleapis.com/...` (Google LLC, USA)
- **三家隐私政策**：
  - OpenAI: <https://openai.com/policies/privacy-policy>
  - Anthropic: <https://www.anthropic.com/legal/privacy>
  - Google: <https://policies.google.com/privacy>
- **本应用不存储**任何 LLM 请求 / 响应日志到服务器（应用没有服务器）
- **API 提供方可能存储**你的请求，详见各自隐私政策

### 3.4 自动更新检查（仅 Electron 桌面端）

- **触发**：应用启动 30 秒后自动 / 你点击 "检查更新"
- **内容**：当前版本号 + User-Agent
- **目的地**：`https://api.github.com/repos/<OWNER>/<REPO>/releases/latest`
- **不发送**：你的设备 ID / 用户名 / 学习数据 / 任何参数

---

## 四、绝对不上传

以下数据 **在任何情况下都不会离开你的设备**：

The following is **never transmitted under any circumstances**:

- 你的浏览历史 / IP 地址 / Cookie / 设备指纹
- 17 模块的运行时仿真状态 / 拖拽轨迹 / 滑块调节频率
- 错题本 / revisit 热力图 / 尝试历史
- 本地参数快照（除非你主动选择上传到 Gist）
- a11y 设置 / 主题 / 语言偏好
- AI 助手历史（除非你主动选择 BYOK provider 把请求发给它）

---

## 五、第三方依赖

应用静态资源由 Vite 打包，发布时不包含任何分析 / 广告 / 追踪 SDK。完整第三方运行时依赖：

The application is statically bundled by Vite. No analytics / advertising / tracking SDKs are included. Full runtime dependencies:

- React, React-DOM (Meta Platforms, MIT)
- Zustand (Daishi Kato, MIT)
- Recharts (Recharts Group, MIT)
- Framer Motion (Framer, MIT)
- Three.js, @react-three/fiber, @react-three/drei (MIT)
- Lucide Icons (ISC)
- Electron (OpenJS Foundation, MIT) — 仅桌面端
- electron-updater (MIT) — 仅桌面端

---

## 六、GDPR / CCPA / PIPL 合规

- **GDPR (EU)**: 本应用不做任何"个人数据处理"（你的所有学习数据都在本地），无需 controller / processor 关系。
- **CCPA (California)**: 本应用不"出售或共享个人信息"，因此不触发 CCPA 通知要求。
- **PIPL (中国)**: 本应用不收集中国境内"个人信息"到自有服务器（无服务器）；当你主动上传到 GitHub Gist 或调 LLM API 时，数据出境由你按 PIPL 第 38-40 条自行判断。

如果你是法务合规岗，需要正式数据处理协议（DPA）或本地化部署方案，请联系 **xzw0828@yeah.net**。

---

## 七、修改本声明

本声明可能随版本更新调整。每次实质性修改会在顶部"最后更新"日期 + 简短 changelog 记录。重大修改（新增上传场景 / 新增第三方服务）会在应用内 About → 隐私 一栏显眼提示。

This notice may change with releases. Any material change is logged at the top with a "Last updated" date + brief changelog. Major changes (new upload scenarios / new third-party services) are surfaced in the in-app About → Privacy panel.

---

## 八、问题与反馈

- 邮件 / Email: **xzw0828@yeah.net**
- GitHub Issues: `<OWNER>/<REPO>/issues` (待你填占位)
