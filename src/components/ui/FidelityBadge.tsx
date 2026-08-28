import { ShieldCheck, Beaker, Sparkles, FlaskConical } from 'lucide-react';
import { useI18n, type TKey } from '../../i18n/useI18n';

type Fidelity = 'exact' | 'physical' | 'simplified' | 'illustrative';

interface Props {
  level: Fidelity;
  /** 一行内可见的简短说明 */
  hint: string;
}

const meta: Record<Fidelity, { labelKey: TKey; toneClass: string; Icon: typeof ShieldCheck }> = {
  exact: {
    labelKey: 'shell.fidelityExact',
    toneClass: 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure',
    Icon: ShieldCheck,
  },
  physical: {
    labelKey: 'shell.fidelityPhysical',
    toneClass: 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary',
    Icon: FlaskConical,
  },
  simplified: {
    labelKey: 'shell.fidelitySimplified',
    toneClass: 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn',
    Icon: Beaker,
  },
  illustrative: {
    labelKey: 'shell.fidelityIllustrative',
    toneClass: 'border-ink-muted/40 bg-bg-base text-ink-secondary',
    Icon: Sparkles,
  },
};

export function FidelityBadge({ level, hint }: Props) {
  const { t } = useI18n();
  const m = meta[level];
  const Icon = m.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-caption font-medium ${m.toneClass}`}
      title={hint}
    >
      <Icon className="h-3 w-3" />
      {t(m.labelKey)}
    </span>
  );
}

/** 4 档定义，给学生一个心理预期：
 *  - exact：纯数学公式直接落地（Clarke / Park / SVPWM 算法、ideal sin 生成），结果与硬件理论值一致
 *  - physical：基于 dq 微分方程、PI 控制器、低通等真实组件搭出的可工作仿真（电流环、PID 阶跃、PLL 锁相）
 *  - simplified：保留主要动力学但有硬编码参数或近似（三闭环、弱磁稳态、逆变器平均模型）
 *  - illustrative：按现象生成的特征波形（故障注入），用来直观看现象，不对应物理仿真
 */
export type { Fidelity };
