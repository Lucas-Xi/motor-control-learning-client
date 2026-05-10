# 模块扩展说明

这份说明用于在现有电机控制学习客户端中新增一个完整模块。目标不是只加一个页面，而是同时补齐教学内容、参数控制、算法仿真和路由入口。

## 推荐接入顺序

1. **定义模块 ID**
   - 在 `src/simulation/engine/types.ts` 中扩展 `ModuleId`。
   - 模块 ID 要短、稳定、可读，最好和路由目录一致。

2. **补模块元数据和实验预设**
   - 在 `src/simulation/engine/presets.ts` 中加入 `moduleMetas` 条目。
   - 同时补一个或多个 `experimentPresets`，让用户可以一键进入典型案例。

3. **补教学内容**
   - 在 `src/content/lessons.ts` 中增加对应章节。
   - 每个模块都建议包含：
     - 学习目标
     - 基础概念
     - 数学公式
     - 工程意义
     - STM32 / C 迁移思路
     - 常见错误
     - 调试方法
     - 交互实验
     - 总结
     - 下一步学习建议
     - 代码示例

4. **补状态和默认参数**
   - 在 `src/simulation/engine/types.ts` 中为该模块增加独立参数结构。
   - 在 `src/simulation/engine/presets.ts` 中提供默认值。
   - 在 `src/store/simulationStore.ts` 中增加对应 state、update 方法和 reset 分支。

5. **实现算法模块**
   - 新算法放在 `src/simulation/math/`。
   - 优先写成纯函数，参数和返回值都明确标注单位。
   - 如果算法需要迭代状态，建议显式传入 `state` 并返回新状态，方便迁移到 STM32 / MATLAB。

6. **创建专属页面**
   - 在 `src/modules/<module-id>/` 下创建模块页。
   - 页面里负责组合：
     - 文案说明
     - 参数面板绑定
     - 图表 / 矢量图
     - 3D 场景
     - 公式面板

7. **接入路由**
   - 在 `src/modules/ModuleRenderer.tsx` 中增加显式分支。
   - 当前项目不建议再回到 `GenericModule` 这种泛化 fallback，因为教学模块需要稳定的独立结构。

8. **补中文教学内容和校验**
   - 若新增模块涉及新的公式或概念，同步补充 `src/content/formulas.ts`、`src/content/glossary.ts`。
   - 新增页面后先跑 `npm run verify`，再跑 `npm run build`。
   - 若模块会影响交互，再补 Playwright 冒烟测试。

## 页面结构建议

推荐每个模块页都使用下面的组合顺序：

1. 顶部：模块总览 + 当前状态
2. 中间：核心交互图、3D 场景或流程图
3. 右侧：参数说明、故障点、预设按钮
4. 底部：波形、响应曲线、矢量图
5. 结尾：公式面板和代码示例

这样做的好处是：

- 教学内容和实时仿真在同一屏内闭环；
- 用户知道“改了哪个参数，哪个图会变”；
- 后续封装 Electron 或加入新模块时，页面结构不会失控。

## 新模块命名建议

- 目录名尽量使用 kebab-case，例如 `sensorless-foc`。
- 页面组件名使用 PascalCase，例如 `SensorlessFOCModule`。
- 默认导出尽量少用，优先显式导入导出，方便重构和静态分析。

## 扩展检查清单

新增模块后，请至少确认以下内容：

- `ModuleRenderer` 可以点击进入；
- 右侧参数会实时影响图表或 3D 画面；
- 教学内容是中文，且包含公式和工程解释；
- `npm run verify` 通过；
- `npm run build` 通过；
- 移动端和桌面端都能阅读和操作；
- 没有遗留的 `TODO`、`GenericModule` 或临时调试代码。

