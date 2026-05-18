/**
 * 数字孪生分享 token 编解码（snapshotCodec）。
 *
 * 目标：把"工程师 A 调好的一组参数"打包成 URL 短 token，发给同事 B 通过
 *  https://host/#snapshot=<token> 收到后预览 / 应用。
 *
 * 设计取舍：
 *   - 只装"工程参数 / 装配选型 / 挑战通关摘要"，不装会话级状态（time / running /
 *     activeModule），也不装 attempts / 时间戳等隐私信息。
 *   - 每个 slice 用 **固定字段顺序的数组**（不发字段名），大幅压缩。例如
 *     pid 序列化为 `[2.2,18,0.02,1,0.12,24,2,1]`（最后那个 1 = antiWindup true）。
 *     decode 时按同样的字段顺序回填到 long-key object。
 *   - 总体 payload 形如：
 *       { v: 1, sim: { mb:[..], tp:[..], ... }, asm: {..}?, ch: {..}? }
 *   - URL-safe base64：把 `+/=` 替换成 `-_~`，避免 # / & / ? 冲突。
 *   - 第一字节 '1' 是版本号；将来 schema 改动 → 升 '2'，老 URL 通过 case 走旧路径。
 *   - 不引入新依赖；靠"位置数组 + toPrecision(5)"把默认参数压到 < 1200 字符。
 *
 * **添加 / 删除字段的约束**：FIELD_ORDER 表里只能在末尾追加，禁止重排或删除已发布的
 *   字段。删除字段会让历史 token 解码错位；新增字段在表末尾追加，decode 时缺失部分
 *   走 undefined（partial 合并到默认值即可）。
 */

const VERSION = '1';

/** 把 token 里的 base64 字符做 URL-safe 替换 */
function toUrlSafe(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '~');
}

function fromUrlSafe(t: string): string {
  let s = t.replace(/-/g, '+').replace(/_/g, '/').replace(/~/g, '');
  // base64 pad
  while (s.length % 4 !== 0) s += '=';
  return s;
}

/** Unicode-safe btoa / atob。这里参数全是 ASCII（数字 + 英文 key），普通 btoa 就够。 */
function safeBtoa(s: string): string {
  if (typeof btoa === 'function') return btoa(s);
  // Node fallback（vitest 环境下 btoa 实际存在，这条分支主要是 belt-and-suspenders）
  return Buffer.from(s, 'binary').toString('base64');
}

function safeAtob(s: string): string {
  if (typeof atob === 'function') return atob(s);
  return Buffer.from(s, 'base64').toString('binary');
}

/** 把数字限定为最多 5 位有效数字，去掉 "1e-9" 这种长后缀；整数原样 */
function trimNum(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (Number.isInteger(v)) return v;
  // toPrecision 在 |v| < 1e-4 或 > 1e21 时返回科学计数法；这种数据本身就罕见
  return Number(v.toPrecision(5));
}

/** Snapshot 实际数据（不含版本头）。sim 值是位置数组，按 FIELD_ORDER 解 */
export interface SnapshotPayload {
  /** Simulation store 的 17 段参数（短 key → 位置数组） */
  sim: Record<string, Array<unknown>>;
  /** Assembly progress：6 槽位选型 ID。可选，老链接里没有时是 undefined。 */
  asm?: {
    compressorBundleId: string;
    inverterPartNo: string;
    strategyId: string;
    loadId: string;
    pfcId: string;
    separatorId: string;
  };
  /** Challenge：通关摘要（id → bestValue）。不发 attempts / 时间戳。 */
  ch?: Record<string, number>;
}

/** 完整的 AppState 输入（来自 store getState()） */
export interface AppStateInput {
  motorBasics: Record<string, unknown>;
  threePhase: Record<string, unknown>;
  clarke: Record<string, unknown>;
  park: Record<string, unknown>;
  pid: Record<string, unknown>;
  svpwm: Record<string, unknown>;
  inverter: Record<string, unknown>;
  sensorless: Record<string, unknown>;
  weakField: Record<string, unknown>;
  fault: Record<string, unknown>;
  controlLoop: Record<string, unknown>;
  foc: Record<string, unknown>;
  hfi: Record<string, unknown>;
  startup: Record<string, unknown>;
  apf: Record<string, unknown>;
  refrigeration: Record<string, unknown>;
  assemblySlotIds?: {
    compressorBundleId: string;
    inverterPartNo: string;
    strategyId: string;
    loadId: string;
    pfcId: string;
    separatorId: string;
  };
  /** 挑战记录的"通关 bestValue"摘要 */
  challengeBestValues?: Record<string, number>;
}

/** Slice key → 短 key 的双向映射。一旦发布，禁止重命名旧 key（破坏老 URL）。 */
const SIM_SHORT_KEYS: Record<keyof Omit<AppStateInput, 'assemblySlotIds' | 'challengeBestValues'>, string> = {
  motorBasics: 'mb',
  threePhase: 'tp',
  clarke: 'cl',
  park: 'pk',
  pid: 'pd',
  svpwm: 'sv',
  inverter: 'iv',
  sensorless: 'sl',
  weakField: 'wf',
  fault: 'fa',
  controlLoop: 'cp',
  foc: 'fc',
  hfi: 'hf',
  startup: 'st',
  apf: 'ap',
  refrigeration: 'rf',
};

const SHORT_TO_SIM = Object.fromEntries(
  Object.entries(SIM_SHORT_KEYS).map(([k, v]) => [v, k]),
) as Record<string, string>;

/**
 * 每个 slice 的字段顺序。**只能在末尾追加，禁止重排或删除**——否则历史 token 错位。
 *
 * 字段名与 presets.ts / types.ts 中的字段名一一对应；这里只列 default 里实际有
 * 的字段（自动派生字段不在此列）。
 */
const FIELD_ORDER: Record<keyof typeof SIM_SHORT_KEYS, readonly string[]> = {
  motorBasics: [
    'polePairs', 'mechanicalDeg', 'rpm', 'ratedCurrent', 'ratedSpeed',
    'rs', 'ldMh', 'lqMh', 'flux', 'inertiaUm', 'dampingUm',
  ],
  threePhase: ['amplitude', 'frequency', 'phaseDeg', 'balance', 'harmonic', 'noise'],
  clarke: ['ia', 'ib', 'ic', 'amplitude', 'phaseDeg', 'balanced'],
  park: ['thetaDeg', 'iAlpha', 'iBeta', 'speedRpm', 'loadTorque', 'idRef', 'iqRef'],
  pid: ['kp', 'ki', 'kd', 'target', 'loadDisturbance', 'limit', 'sampleMs', 'antiWindup'],
  svpwm: ['uAlpha', 'uBeta', 'uDc', 'electricalDeg', 'modulation'],
  inverter: [
    'uDc', 'pwmFrequency', 'deadTimeUs', 'dutyA', 'dutyB', 'dutyC',
    'loadInductanceMh', 'modulationMode',
  ],
  sensorless: [
    'speedRpm', 'ke', 'rs', 'lsMh', 'observerGain', 'pllKp', 'pllKi', 'noise', 'loadDisturbance',
  ],
  weakField: [
    'uDc', 'targetRpm', 'id', 'iq', 'ldMh', 'lqMh', 'flux', 'currentLimit', 'voltageMargin',
  ],
  fault: ['faultType', 'severity'],
  controlLoop: [
    'currentKp', 'currentKi', 'speedKp', 'speedKi', 'positionKp', 'positionKi', 'positionKd',
    'loadTorque', 'inertia', 'damping', 'targetSpeed', 'targetPosition',
  ],
  foc: [
    'iqRef', 'idRef', 'kp', 'ki', 'thetaErrorDeg', 'samplingDelaySamples',
    'voltageLimit', 'electricalFreq',
  ],
  hfi: [
    'injectVoltage', 'injectFreqHz', 'speedRpm', 'saliencyRatio', 'demodCutoffHz',
    'pllKp', 'pllKi', 'measNoise', 'trueThetaRad',
  ],
  startup: [
    'state', 'targetRpm', 'currentRpm', 'accelRampRpmS', 'alignDurationMs',
    'hfiHandoffRpm', 'bemfHandoffRpm', 'fieldweakRpm',
  ],
  apf: [
    'vAcRms', 'vAcFreqHz', 'udcRef', 'boostInductanceMh', 'boostCapacitanceUf',
    'loadCurrent', 'currentKp', 'currentKi', 'voltageKp', 'voltageKi',
  ],
  refrigeration: [
    'refrigerant', 'Te', 'Tc', 'superheatK', 'subcoolK',
    'ambientOutdoorC', 'ambientIndoorC', 'eevOpening',
    'displacementCc', 'clearanceRatio', 'isentropicEff', 'closedLoop',
  ],
};

/** 把一个 slice 对象按 FIELD_ORDER 序列化成位置数组（trim 数字） */
function sliceToArray(sliceLong: keyof typeof SIM_SHORT_KEYS, slice: Record<string, unknown>): unknown[] {
  const order = FIELD_ORDER[sliceLong];
  const out: unknown[] = new Array(order.length);
  for (let i = 0; i < order.length; i++) {
    const v = slice[order[i]];
    if (typeof v === 'number') out[i] = trimNum(v);
    else if (typeof v === 'boolean') out[i] = v ? 1 : 0;
    else out[i] = v ?? null;
  }
  // 尾部 null 截断，进一步省字节
  let last = out.length - 1;
  while (last >= 0 && out[last] === null) last--;
  return out.slice(0, last + 1);
}

/** 把位置数组按 FIELD_ORDER 反序列化回 partial 对象 */
function arrayToSlice(
  sliceLong: keyof typeof SIM_SHORT_KEYS,
  arr: unknown[],
): Record<string, unknown> {
  const order = FIELD_ORDER[sliceLong];
  const out: Record<string, unknown> = {};
  const len = Math.min(order.length, arr.length);
  for (let i = 0; i < len; i++) {
    const fname = order[i];
    const v = arr[i];
    if (v === null || v === undefined) continue;
    // boolean 字段反序列化：原本 0/1 → 还原成 boolean
    if ((fname === 'antiWindup' || fname === 'balanced' || fname === 'closedLoop') && typeof v === 'number') {
      out[fname] = v !== 0;
    } else {
      out[fname] = v;
    }
  }
  return out;
}

/** 把 AppStateInput 序列化成压缩 JSON 字符串 */
function buildPayloadJson(state: AppStateInput): string {
  const sim: Record<string, unknown[]> = {};
  for (const [longKey, shortKey] of Object.entries(SIM_SHORT_KEYS) as Array<
    [keyof typeof SIM_SHORT_KEYS, string]
  >) {
    const slice = state[longKey as keyof AppStateInput];
    if (slice && typeof slice === 'object' && !Array.isArray(slice)) {
      sim[shortKey] = sliceToArray(longKey, slice as Record<string, unknown>);
    }
  }
  const payload: SnapshotPayload = { sim };
  if (state.assemblySlotIds) payload.asm = state.assemblySlotIds;
  if (state.challengeBestValues && Object.keys(state.challengeBestValues).length > 0) {
    const ch: Record<string, number> = {};
    for (const [id, v] of Object.entries(state.challengeBestValues)) ch[id] = trimNum(v);
    payload.ch = ch;
  }
  return JSON.stringify(payload);
}

/**
 * 把当前 AppState 编码成 URL-safe token（含版本头）。
 *
 * 形式：'1' + urlSafeBase64(JSON.stringify(SnapshotPayload))
 */
export function encodeSnapshot(state: AppStateInput): string {
  const json = buildPayloadJson(state);
  const b64 = safeBtoa(json);
  return VERSION + toUrlSafe(b64);
}

export interface DecodeResult {
  ok: boolean;
  /** 解析成功时的部分状态（已展开短 key 回长 key） */
  state?: DecodedSnapshot;
  /** 失败原因，给 UI 显示 */
  error?: string;
}

/** 解码出来的"宽容版"状态：每个 slice 是 Partial（只覆盖发过来的字段） */
export interface DecodedSnapshot {
  version: string;
  sim: Partial<Record<keyof AppStateInput, Record<string, unknown>>>;
  asm?: SnapshotPayload['asm'];
  ch?: SnapshotPayload['ch'];
}

/** 把 token 解码回 SnapshotPayload；非法 / 版本不支持时 ok=false */
export function decodeSnapshot(token: string): DecodeResult {
  if (typeof token !== 'string' || token.length < 2) {
    return { ok: false, error: '空 token' };
  }
  const version = token[0];
  const body = token.slice(1);
  if (version !== '1') {
    return { ok: false, error: `不支持的 token 版本：${version}（当前仅支持 1）` };
  }
  let json: string;
  try {
    json = safeAtob(fromUrlSafe(body));
  } catch {
    return { ok: false, error: '无法 base64 解码（token 已损坏？）' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: '解码后 JSON 非法' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'JSON 顶层不是对象' };
  }
  const p = parsed as Partial<SnapshotPayload>;
  if (!p.sim || typeof p.sim !== 'object') {
    return { ok: false, error: 'sim 段缺失' };
  }
  // 展开短 key 回长 key；位置数组 → 对象
  const sim: DecodedSnapshot['sim'] = {};
  for (const [shortKey, sliceArr] of Object.entries(p.sim)) {
    const longKey = SHORT_TO_SIM[shortKey] as keyof typeof SIM_SHORT_KEYS | undefined;
    if (!longKey) continue; // 未知 key 静默忽略，向前兼容
    if (Array.isArray(sliceArr)) {
      sim[longKey] = arrayToSlice(longKey, sliceArr);
    } else if (sliceArr && typeof sliceArr === 'object') {
      // 兼容路径：将来某版本若用 { k: v }，这里直接落地
      sim[longKey] = sliceArr as Record<string, unknown>;
    }
  }
  return {
    ok: true,
    state: {
      version,
      sim,
      asm: p.asm,
      ch: p.ch,
    },
  };
}

/** 工具：把 store 里 SimulationStore 的全部 slice 拍成 AppStateInput */
export function packAppState(
  sim: Record<string, unknown>,
  assemblySlotIds?: AppStateInput['assemblySlotIds'],
  challengeBestValues?: AppStateInput['challengeBestValues'],
): AppStateInput {
  return {
    motorBasics: (sim.motorBasics ?? {}) as Record<string, unknown>,
    threePhase: (sim.threePhase ?? {}) as Record<string, unknown>,
    clarke: (sim.clarke ?? {}) as Record<string, unknown>,
    park: (sim.park ?? {}) as Record<string, unknown>,
    pid: (sim.pid ?? {}) as Record<string, unknown>,
    svpwm: (sim.svpwm ?? {}) as Record<string, unknown>,
    inverter: (sim.inverter ?? {}) as Record<string, unknown>,
    sensorless: (sim.sensorless ?? {}) as Record<string, unknown>,
    weakField: (sim.weakField ?? {}) as Record<string, unknown>,
    fault: (sim.fault ?? {}) as Record<string, unknown>,
    controlLoop: (sim.controlLoop ?? {}) as Record<string, unknown>,
    foc: (sim.foc ?? {}) as Record<string, unknown>,
    hfi: (sim.hfi ?? {}) as Record<string, unknown>,
    startup: (sim.startup ?? {}) as Record<string, unknown>,
    apf: (sim.apf ?? {}) as Record<string, unknown>,
    refrigeration: (sim.refrigeration ?? {}) as Record<string, unknown>,
    assemblySlotIds,
    challengeBestValues,
  };
}

/** Slice 短 key → 中文友好标签（diff 表头用） */
export const SLICE_LABELS: Record<keyof Omit<AppStateInput, 'assemblySlotIds' | 'challengeBestValues'>, string> = {
  motorBasics: '电机基础',
  threePhase: '三相磁场',
  clarke: 'Clarke',
  park: 'Park',
  pid: 'PID',
  svpwm: 'SVPWM',
  inverter: '逆变器',
  sensorless: '无感观测',
  weakField: '弱磁',
  fault: '故障',
  controlLoop: '三闭环',
  foc: 'FOC 流程',
  hfi: 'HFI',
  startup: '启动机',
  apf: 'APF',
  refrigeration: '制冷台架',
};
