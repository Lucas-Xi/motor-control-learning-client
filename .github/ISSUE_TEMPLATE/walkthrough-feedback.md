---
name: Walkthrough 反馈 / Walkthrough feedback
about: 学员针对某个模块的深度引导（goal / pitfalls / quiz / 步骤）提反馈
title: "[Walkthrough] "
labels: walkthrough, content
assignees: ''
---

## 模块 / Module

模块 ID（来自 `src/simulation/engine/types.ts::ModuleId`）:

<!-- 例如：svpwm / sensorless-foc / refrigeration-bench / hfi-sensorless -->

## 出问题的步骤 / Step

<!-- 第几步出问题？步骤的标题是什么？（按 walkthroughs/<module>.ts 里的 steps 顺序） -->

第 N 步，标题：

## 问题类型 / Type

- [ ] 中文表达不准确 / 有错别字
- [ ] 物理意义讲反了 / 公式错
- [ ] 参数预设不合理（一进去波形就饱和 / 看不到现象）
- [ ] Quiz 选项有歧义 / 答案不对
- [ ] Pitfall 描述不到位 / 漏了一个常见坑
- [ ] WhyMatters 部分没说清楚为什么这一步重要
- [ ] 步骤顺序有问题（先后逻辑断裂）
- [ ] 其它 / Other

## 学员上下文 / Learner context

- 你之前对电机控制的熟悉程度？（完全初学 / 看过 FOC 视频 / 写过仿真 / 调过实物）
- 卡了多久？

## 具体描述 / Detail

<!-- 比如："第 3 步说'此时 Iq 应该收敛到 5A'，但是我把 Kp 拉到默认值后 Iq 一直在 4.3 振荡"。最好带截图。 -->

## 截图 / 数据 / Evidence

<!-- 拖图、贴 CSV、贴 quiz 选项 -->

## 改进建议 / Suggested fix

<!-- 可选：你认为应该改成什么样？比如改文案、改默认参数、改 quiz 选项 -->
