<!--
中文 + English 双语 PR 模板。请按章节填写；空 PR 也请保留各节标题，便于 Reviewer 快速定位。
-->

## 变更概览 / Summary

<!-- 一句话说清楚做了什么，以及为什么要做。 -->

## 影响范围 / Scope

- [ ] `src/simulation/math/*`（算法纯函数）
- [ ] `src/modules/*`（模块页 / 交互）
- [ ] `src/content/*`（教学讲义 / walkthrough / 公式 / 术语）
- [ ] `src/store/*`（Zustand 状态）
- [ ] `src/components/*`（共享 UI / 图表 / 布局）
- [ ] `electron/*`（桌面端主进程 / 预加载）
- [ ] `scripts/*` 或 CI / workflow
- [ ] 文档（README / docs/）
- [ ] 其它

## 关联 Issue / Linked issues

Closes #
Refs #

## 测试计划 / Test plan

<!-- 自测做了什么；带上命令和结果末行。 -->

- [ ] `npm run verify`
- [ ] `npx tsc -b --noEmit`
- [ ] `npx vitest run`
- [ ] `npm run build`
- [ ] `npm run e2e`（涉及 UI / 交互时必须）
- [ ] `npm run qa:screenshots`（视觉改动时建议）
- [ ] `npm run release:audit`（涉及 release 前的大改）
- [ ] 手动在浏览器和 Electron 桌面端各打开一遍受影响模块

## release:audit 自检清单 / Audit self-check

- [ ] 新建 / 重命名 / 删除核心文件时已同步更新 `scripts/verify-project.mjs::requiredFiles`
- [ ] 新增 `ModuleId` 时已在 `ModuleRenderer.tsx` 写显式 `moduleId === '<id>'` 分支
- [ ] 新增大依赖时已考虑 Vite `manualChunks`
- [ ] 新增 store slice 时使用切片选择器 `useSimulationStore((s) => s.xxx)`，不会被 `time` 拖崩重渲染
- [ ] 新增拖拽 SVG 时已提供键盘等效（tabIndex / role / aria-label / onKeyDown）
- [ ] 不引入 `shadow-neon` / `shadow-mint` / `backdrop-blur` / `bg-radial-grid` 等装饰
- [ ] 物理 bug 静态回归（BEMF 角度 / SVPWM T1T2 / R-32 潜热 / 过热气密度方向 / 死区方向）未触发

## 截图 / 视频 / Screenshots

<!-- UI 改动必须贴前后对比；建议附 `output/screenshots/desktop-*.png` 里相关那张。 -->

## 风险与回滚 / Risk and rollback

<!-- 如果上线后出问题，最快的回滚方式是什么？哪些用户行为会暴露问题？ -->

## 其它说明 / Notes
