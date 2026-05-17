import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { CompressorEnvelope } from '../../components/charts/CompressorEnvelope';
import { useSimulationStore } from '../../store/simulationStore';
import { useBenchCycle } from './useBenchCycle';
import { formatNumber } from '../../utils/format';

const TD_LIMIT = 110;
const PR_LIMIT = 7;

export function EnvelopeProbeCard() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const result = useBenchCycle();

  const violated = result.Tdischarge > TD_LIMIT || result.pressureRatio > PR_LIMIT;
  const marginPr = PR_LIMIT - result.pressureRatio;
  const marginTd = TD_LIMIT - result.Tdischarge;

  return (
    <Card
      title="压缩机操作包线"
      eyebrow="operating envelope"
      density="compact"
      tone={violated ? 'fault' : 'default'}
    >
      <div className="relative w-full overflow-hidden" style={{ paddingTop: `${(360 / 480) * 100}%` }}>
        <div className="absolute inset-0">
          <CompressorEnvelope
            Te={refrig.Te}
            Tc={refrig.Tc}
            Tdischarge={result.Tdischarge}
            pressureRatio={result.pressureRatio}
            refrigerant={refrig.refrigerant}
          />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-caption sm:grid-cols-4">
        <EnvelopeCell
          label="压力比 P_d/P_s"
          value={formatNumber(result.pressureRatio, 2)}
          status={result.pressureRatio > PR_LIMIT ? 'fault' : 'primary'}
        />
        <EnvelopeCell
          label="排气温度 T_d"
          value={`${formatNumber(result.Tdischarge, 1)} °C`}
          status={result.Tdischarge > TD_LIMIT ? 'fault' : 'warn'}
        />
        <EnvelopeCell
          label="距压比限 7"
          value={formatNumber(marginPr, 2)}
          status={marginPr <= 0 ? 'fault' : marginPr < 1 ? 'warn' : 'measure'}
        />
        <EnvelopeCell
          label="距 T_d 限 110°C"
          value={`${formatNumber(marginTd, 1)} °C`}
          status={marginTd <= 0 ? 'fault' : marginTd < 5 ? 'warn' : 'measure'}
        />
      </div>
    </Card>
  );
}

/** 包线单元格：颜色 + 形状 + 屏阅器文本三通道，色盲打印友好 */
type CellStatus = 'measure' | 'primary' | 'warn' | 'fault';
function EnvelopeCell({ label, value, status }: { label: string; value: string; status: CellStatus }) {
  const text = status === 'fault' ? 'text-accent-fault'
    : status === 'warn' ? 'text-accent-warn'
    : status === 'measure' ? 'text-accent-measure'
    : 'text-accent-primary';
  const sr = status === 'fault' ? '超限'
    : status === 'warn' ? '警戒'
    : status === 'measure' ? '安全' : null;
  // 形状徽标：fault=⬢ / warn=△ / measure=✓ / primary 无形状
  const Icon = status === 'fault' ? AlertOctagon
    : status === 'warn' ? AlertTriangle
    : status === 'measure' ? CheckCircle2 : null;
  return (
    <div className="rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
      <div className="text-ink-muted">{label}</div>
      <div className={`flex items-center gap-1 font-mono ${text}`}>
        {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
        {sr && <span className="sr-only">{sr} </span>}
        <span>{value}</span>
      </div>
    </div>
  );
}
