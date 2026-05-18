---
name: 新功能 / Feature request
about: 提议新教学模块、新参数、新可视化、新算法或新实验案例
title: "[Feature] "
labels: enhancement
assignees: ''
---

## 教学场景 / Teaching scenario

<!-- 这个功能解决学员学习路径上的哪一个具体痛点？最好附一句"学员当前会被卡在 XX"。 -->

## 目标用户 / Target learner

- [ ] 完全初学（只懂 BLDC 概念）
- [ ] 初级嵌入式工程师（写过 PWM、看过 FOC 代码但没调过）
- [ ] 中级工程师（调过电流环、做过弱磁）
- [ ] 高级工程师（带新人 / 写文档用）

## 期望交互 / Proposed UX

<!-- 用一段中文描述用户进入模块后能做什么。例如："用户拖动 SVPWM 矢量 → 看到 T1/T2 和扇区编号实时变化 → 点击 Run → 三相 duty 输出到底部波形面板"。 -->

## 涉及算法 / 数学 / Algorithms

<!-- 如果需要新算法，给一个公式或参考；如果是已有算法的新封装，注明在 src/simulation/math/ 下应该新增/修改哪些函数。 -->

## 参考资料 / References

<!-- 论文、TI/ST 文档、教材章节、其它开源项目 -->

## 优先级 / Priority

- [ ] P0 - 紧急（教学链路断了）
- [ ] P1 - 计划内（下一波要做）
- [ ] P2 - 想要（有空再做）
- [ ] P3 - 长尾（社区或贡献者实现）

## 验收清单 / Acceptance checklist

- [ ] 算法纯函数化（不在 UI 写控制逻辑）
- [ ] 教学讲义同步更新（lessons.ts + formulas.ts + glossary.ts）
- [ ] 提供至少一个 experimentPreset
- [ ] 提供至少一个深度 walkthrough（goal/whyMatters/quiz/pitfalls）
- [ ] verify + tsc + vitest + e2e 通过
