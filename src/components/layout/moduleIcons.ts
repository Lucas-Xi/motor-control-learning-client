import {
  Activity, BookOpen, Boxes, CircleDot, Compass, Factory, Gauge,
  Grid3x3, LineChart, Magnet, Radio, RefreshCw, Snowflake, Split, Waves,
  Zap, type LucideIcon,
} from 'lucide-react';
import type { ModuleId } from '../../simulation/engine/types';

/**
 * 模块专属图标映射（v0.2 图标栏）。
 * 一模块一图标，替代旧的字符串模糊匹配；新增模块必须在此登记。
 */
const MODULE_ICONS: Record<ModuleId, LucideIcon> = {
  'motor-basics': Magnet,
  'three-phase': Waves,
  'clarke-transform': Split,
  'park-transform': RefreshCw,
  'pid-control': Gauge,
  'foc-flow': Compass,
  svpwm: Grid3x3,
  inverter: Zap,
  'control-loops': Activity,
  'sensorless-foc': Radio,
  'field-weakening': CircleDot,
  'faults-debugging': LineChart,
  'hfi-sensorless': Radio,
  'startup-statemachine': Compass,
  'apf-frontend': Factory,
  'refrigeration-bench': Snowflake,
  'assembly-workshop': Boxes,
};

export function iconForModule(id: ModuleId): LucideIcon {
  return MODULE_ICONS[id] ?? BookOpen;
}
