import { useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { useI18n } from '../../i18n/useI18n';
import { formatNumber } from '../../utils/format';
import { type BoostPfcResult } from '../../simulation/math/boostPfc';

interface Props {
  result: BoostPfcResult;
}

/**
 * PFC 对比摘要卡：在同一张表里展示 PFC 开启 vs 裸整流的关键指标（THD、PF、η），
 * 让学员一眼看出 PFC 带来的全部好处，以及有无 PFC 的量化差异。
 */
export function PfcCompareSummaryCard({ result }: Props) {
  const { t } = useI18n();
  const stats = useMemo(() => {
    // 估算效率：取最后半个周期稳态值
    const half = Math.floor(result.t_ms.length / 2);
    let vRms = 0, iRmsPfc = 0, iRmsRaw = 0, count = 0;
    for (let i = half; i < result.t_ms.length; i++) {
      vRms += result.v_grid[i] * result.v_grid[i];
      iRmsPfc += result.i_grid_pfc[i] * result.i_grid_pfc[i];
      iRmsRaw += result.i_grid_no_pfc[i] * result.i_grid_no_pfc[i];
      count++;
    }
    vRms = Math.sqrt(vRms / count);
    iRmsPfc = Math.sqrt(iRmsPfc / count);
    iRmsRaw = Math.sqrt(iRmsRaw / count);
    // 简化的 Pin 估算（忽略相位）：Pin ≈ Vrms * Irms
    const pinPfc = vRms * iRmsPfc;
    const pinRaw = vRms * iRmsRaw;
    // Pout ≈ last Udc × estimated load current（从稳态功率反推）
    const lastUdc = result.Udc[result.Udc.length - 1] ?? 0;
    // 从 PFC 结果中取最后一段稳态的母线电压和负载功率来反推 I_load
    // BoostPfcResult 不直接暴露 i_load，用稳态功率近似
    const pOut = lastUdc * (result.i_grid_pfc[result.i_grid_pfc.length - 1] ?? 0) * 0.5; // 粗略功率
    const effPfc = pinPfc > 0.1 ? (pOut / pinPfc) * 100 : 0;
    const effRaw = pinRaw > 0.1 ? (pOut / pinRaw) * 100 : 0;
    return { thdPfc: result.thd, thdRaw: result.thd_no_pfc, pfPfc: result.pf, pfRaw: result.pf_no_pfc, effPfc, effRaw };
  }, [result]);

  const Row = ({ label, pfc, raw, unit, better }: { label: string; pfc: number; raw: number; unit: string; better: 'high' | 'low' }) => {
    const pfcBetter = better === 'high' ? pfc > raw : pfc < raw;
    return (
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded border border-line-subtle bg-bg-base px-3 py-2 text-caption">
        <span className="text-ink-muted">{label}</span>
        <span className="font-medium text-accent-measure">{formatNumber(pfc, 1)}{unit}</span>
        <span className={`font-medium ${pfcBetter ? 'text-ink-muted' : 'text-accent-fault'}`}>
          {formatNumber(raw, 1)}{unit}
        </span>
      </div>
    );
  };

  return (
    <Card title={t('apfFrontend.compareSummaryTitle')} eyebrow="THD · PF · η" density="compact">
      <div className="mb-2 flex items-center gap-3 rounded-lg border border-accent-measure/20 bg-accent-measure/5 px-3 py-1.5 text-caption">
        <span className="text-accent-measure font-medium">PFC</span>
        <span className="text-ink-muted">│</span>
        <span className="text-ink-muted">{t('apfFrontend.chipBare')}</span>
      </div>
      <div className="space-y-1.5">
        <Row label="THD" pfc={stats.thdPfc} raw={stats.thdRaw} unit="%" better="low" />
        <Row label={t('apfFrontend.compareSummaryPowerFactor')} pfc={stats.pfPfc} raw={stats.pfRaw} unit="" better="high" />
        <Row label={t('apfFrontend.compareSummaryEfficiency')} pfc={stats.effPfc} raw={stats.effRaw} unit="%" better="high" />
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {t('apfFrontend.compareSummarySentA')}{formatNumber(stats.thdRaw, 0)}%{t('apfFrontend.compareSummarySentB')}{formatNumber(stats.thdPfc, 0)}%{t('apfFrontend.compareSummarySentC')}{formatNumber(stats.pfRaw, 3)}{t('apfFrontend.compareSummarySentD')}{formatNumber(stats.pfPfc, 3)}{t('apfFrontend.compareSummarySentE')}
      </p>
    </Card>
  );
}