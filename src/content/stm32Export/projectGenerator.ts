/**
 * STM32 工程导出器 —— 把 store 当前参数 + assembly 6 槽位选型一键生成可读的 C 工程骨架。
 *
 * 输出多个文件（main.c / foc_isr.c / motor_param.h / fault_codes.h / state_machine.c
 * / CMakeLists.txt or Makefile / README.md）。
 *
 * 设计原则：
 *   1. **store 即真理**：所有 #define 数值都来自传入的 SimulationSnapshot，
 *      用户在网页上调过的参数能直接对应到 MCU 里的常量。
 *   2. **MCU 系列差异隔离**：HAL 头文件、时钟初始化、ISR 名走 mcuTemplate.ts。
 *   3. **不真编译**：生成的工程仅语法可读 + 关键宏正确，由用户在 CubeMX 里补全
 *      RCC / GPIO / DMA / NVIC 后才能 build。这是教学骨架，不是 turnkey。
 *   4. **风格对齐 walkthrough**：命名（TIM1->CCR1 / ADC1->JSQR / HAL_TIMEx_PWMN_Start）
 *      与 src/content/walkthroughs/inverter.ts 中的 STM32 HAL/LL 片段一致。
 */

import { calculateSvpwm } from '../../simulation/math/svpwm';
import { MCU_TEMPLATES } from './mcuTemplate';
import {
  FAULT_ENUM_LIST,
  STARTUP_STATE_LIST,
  type ExportFile,
  type GeneratorInput,
  type McuFamily,
  type ParamMapping,
} from './types';

void calculateSvpwm; // 显式标注：foc_isr.c 注释里会引用此函数名，让 IDE 跳转看到

/** 默认时间戳生成器；测试时通过 input.generatedAt 注入固定值 */
function defaultTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 浮点格式化为 C float 字面量（fixed 形式） */
function f(v: number, digits = 4): string {
  if (!Number.isFinite(v)) return '0.0f';
  if (Math.abs(v) < 1e-3 && v !== 0) return v.toExponential(3) + 'f';
  return v.toFixed(digits) + 'f';
}

/** 电感等小量统一用 exponential：电感 mH 转 H 后落在 1e-4..1e-2 区间，
 * 直接 toFixed(6) 会显得"0.001100"难读；exponential 更直观也节省字符。
 */
function fExp(v: number): string {
  if (!Number.isFinite(v)) return '0.0f';
  return v.toExponential(3) + 'f';
}

/** 统一的文件头 banner */
function banner(family: McuFamily, generatedAt: string, fileLabel: string): string {
  return `/* ============================================================
 * ${fileLabel}
 * 由 compressor-bench 学习客户端生成 · ${family}
 * Generated: ${generatedAt}
 *
 * 警告：本文件由仿真器自动生成，电机参数 / PWM 频率 / PI 增益
 * 均来自当前 store 状态。修改前请先在 Web 端验证。
 * ============================================================ */`;
}

/** 收集 store → C define 对照表（UI 预览用 + main.c / motor_param.h 共用） */
export function buildParamMappings(input: GeneratorInput): ParamMapping[] {
  const { snapshot } = input;
  const m = snapshot.motorBasics;
  const inv = snapshot.inverter;
  const pid = snapshot.pid;
  const foc = snapshot.foc;
  const sv = snapshot.svpwm;
  const cl = snapshot.controlLoop;
  const su = snapshot.startup;

  return [
    // —— 电机基本参数 ——
    { storeKey: 'motorBasics.polePairs', storeValue: m.polePairs, cDefine: 'MOTOR_POLE_PAIRS', cValue: String(m.polePairs) },
    { storeKey: 'motorBasics.rs', storeValue: m.rs, cDefine: 'MOTOR_RS_OHM', cValue: f(m.rs), unit: 'Ω' },
    { storeKey: 'motorBasics.ldMh', storeValue: m.ldMh, cDefine: 'MOTOR_LD_H', cValue: fExp(m.ldMh / 1000), unit: 'H' },
    { storeKey: 'motorBasics.lqMh', storeValue: m.lqMh, cDefine: 'MOTOR_LQ_H', cValue: fExp(m.lqMh / 1000), unit: 'H' },
    { storeKey: 'motorBasics.flux', storeValue: m.flux, cDefine: 'MOTOR_FLUX_WB', cValue: f(m.flux), unit: 'Wb' },
    { storeKey: 'motorBasics.ratedCurrent', storeValue: m.ratedCurrent, cDefine: 'MOTOR_RATED_CURRENT_A', cValue: f(m.ratedCurrent, 2), unit: 'A' },
    { storeKey: 'motorBasics.ratedSpeed', storeValue: m.ratedSpeed, cDefine: 'MOTOR_RATED_SPEED_RPM', cValue: String(Math.round(m.ratedSpeed)), unit: 'rpm' },
    { storeKey: 'motorBasics.inertiaUm', storeValue: m.inertiaUm, cDefine: 'MOTOR_INERTIA_KGM2', cValue: f(m.inertiaUm * 1e-6, 8), unit: 'kg·m²' },
    { storeKey: 'motorBasics.dampingUm', storeValue: m.dampingUm, cDefine: 'MOTOR_DAMPING_NMS_PER_RAD', cValue: f(m.dampingUm * 1e-6, 8), unit: 'N·m·s/rad' },

    // —— 逆变器 ——
    { storeKey: 'inverter.uDc', storeValue: inv.uDc, cDefine: 'INVERTER_VDC_V', cValue: f(inv.uDc, 1), unit: 'V' },
    { storeKey: 'inverter.pwmFrequency', storeValue: inv.pwmFrequency, cDefine: 'INVERTER_PWM_FREQ_HZ', cValue: String(Math.round(inv.pwmFrequency)), unit: 'Hz' },
    { storeKey: 'inverter.deadTimeUs', storeValue: inv.deadTimeUs, cDefine: 'INVERTER_DEAD_TIME_US', cValue: f(inv.deadTimeUs, 2), unit: 'μs' },
    { storeKey: 'inverter.modulationMode', storeValue: inv.modulationMode, cDefine: 'MODULATION_MAX', cValue: inv.modulationMode === 'svpwm' ? '0.866f' : '0.500f' },

    // —— 电流环 PI ——
    { storeKey: 'foc.kp', storeValue: foc.kp, cDefine: 'CURRENT_PI_KP', cValue: f(foc.kp, 3) },
    { storeKey: 'foc.ki', storeValue: foc.ki, cDefine: 'CURRENT_PI_KI', cValue: f(foc.ki, 1) },
    { storeKey: 'foc.iqRef', storeValue: foc.iqRef, cDefine: 'IQ_REF_DEFAULT_A', cValue: f(foc.iqRef, 2), unit: 'A' },
    { storeKey: 'foc.idRef', storeValue: foc.idRef, cDefine: 'ID_REF_DEFAULT_A', cValue: f(foc.idRef, 2), unit: 'A' },
    { storeKey: 'foc.voltageLimit', storeValue: foc.voltageLimit, cDefine: 'VOLTAGE_LIMIT_V', cValue: f(foc.voltageLimit, 1), unit: 'V' },

    // —— 速度环 / 位置环 PI ——
    { storeKey: 'controlLoop.speedKp', storeValue: cl.speedKp, cDefine: 'SPEED_PI_KP', cValue: f(cl.speedKp, 4) },
    { storeKey: 'controlLoop.speedKi', storeValue: cl.speedKi, cDefine: 'SPEED_PI_KI', cValue: f(cl.speedKi, 3) },
    { storeKey: 'controlLoop.positionKp', storeValue: cl.positionKp, cDefine: 'POSITION_PI_KP', cValue: f(cl.positionKp, 3) },

    // —— PID（通用槽位）——
    { storeKey: 'pid.kp', storeValue: pid.kp, cDefine: 'PID_KP_DEFAULT', cValue: f(pid.kp, 3) },
    { storeKey: 'pid.ki', storeValue: pid.ki, cDefine: 'PID_KI_DEFAULT', cValue: f(pid.ki, 2) },
    { storeKey: 'pid.kd', storeValue: pid.kd, cDefine: 'PID_KD_DEFAULT', cValue: f(pid.kd, 4) },
    { storeKey: 'pid.limit', storeValue: pid.limit, cDefine: 'PID_OUT_LIMIT', cValue: f(pid.limit, 2) },

    // —— SVPWM 工作点（仅作初始化建议）——
    { storeKey: 'svpwm.uDc', storeValue: sv.uDc, cDefine: 'SVPWM_VDC_NOMINAL_V', cValue: f(sv.uDc, 1), unit: 'V' },
    { storeKey: 'svpwm.modulation', storeValue: sv.modulation, cDefine: 'SVPWM_MODULATION_NOMINAL', cValue: f(sv.modulation, 3) },

    // —— 启动状态机阈值 ——
    { storeKey: 'startup.targetRpm', storeValue: su.targetRpm, cDefine: 'STARTUP_TARGET_RPM', cValue: String(Math.round(su.targetRpm)), unit: 'rpm' },
    { storeKey: 'startup.alignDurationMs', storeValue: su.alignDurationMs, cDefine: 'STARTUP_ALIGN_MS', cValue: String(Math.round(su.alignDurationMs)), unit: 'ms' },
    { storeKey: 'startup.hfiHandoffRpm', storeValue: su.hfiHandoffRpm, cDefine: 'HFI_HANDOFF_RPM', cValue: String(Math.round(su.hfiHandoffRpm)), unit: 'rpm' },
    { storeKey: 'startup.bemfHandoffRpm', storeValue: su.bemfHandoffRpm, cDefine: 'BEMF_HANDOFF_RPM', cValue: String(Math.round(su.bemfHandoffRpm)), unit: 'rpm' },
    { storeKey: 'startup.fieldweakRpm', storeValue: su.fieldweakRpm, cDefine: 'FIELDWEAK_HANDOFF_RPM', cValue: String(Math.round(su.fieldweakRpm)), unit: 'rpm' },
    { storeKey: 'startup.accelRampRpmS', storeValue: su.accelRampRpmS, cDefine: 'ACCEL_RAMP_RPM_S', cValue: String(Math.round(su.accelRampRpmS)), unit: 'rpm/s' },
  ];
}

// ———————————————————— 文件生成函数 ————————————————————

function genMotorParamH(input: GeneratorInput, generatedAt: string): string {
  const mappings = buildParamMappings(input);
  const defines = mappings
    .map((m) => {
      const unit = m.unit ? ` /* ${m.unit} */` : '';
      return `#define ${m.cDefine.padEnd(28)} ${m.cValue}${unit}`;
    })
    .join('\n');

  return `${banner(input.mcuFamily, generatedAt, 'motor_param.h — 电机/逆变器/PI 常量（来自 web 仿真当前 store）')}

#ifndef MOTOR_PARAM_H_
#define MOTOR_PARAM_H_

#include <stdint.h>

/* ──────────── 当前选型 ──────────── */
/*  压缩机:   ${input.slots.compressorLabel}
 *  策略:     ${input.slots.strategyLabel}
 *  工况:     ${input.slots.loadLabel}
 *  PFC:      ${input.slots.pfcLabel}
 *  液气分离: ${input.slots.separatorLabel}
 *  主控:     ${input.slots.inverterMcuPartNo}
 */

/* ──────────── store → #define 同步 ──────────── */
${defines}

/* 衍生量（运行时常用） */
#define MOTOR_SALIENCY_RATIO        (MOTOR_LQ_H / MOTOR_LD_H)   /* HFI 凸极比，>1.2 才有解调信号 */
#define INVERTER_PWM_PERIOD_US      (1000000.0f / (float)INVERTER_PWM_FREQ_HZ)
#define CURRENT_LOOP_DT_S           (1.0f / (float)INVERTER_PWM_FREQ_HZ)
#define SPEED_LOOP_DIVIDER          10                          /* 速度环每 10 个电流环跑一次 */

#endif /* MOTOR_PARAM_H_ */
`;
}

function genFaultCodesH(input: GeneratorInput, generatedAt: string): string {
  const enums = FAULT_ENUM_LIST
    .map((e, i) => `    ${e.cName.padEnd(28)} = ${String(i).padStart(2, '0')},  /* ${e.comment} */`)
    .join('\n');

  return `${banner(input.mcuFamily, generatedAt, 'fault_codes.h — 14 种故障枚举（与 web 端 FaultType 一一对应）')}

#ifndef FAULT_CODES_H_
#define FAULT_CODES_H_

#include <stdint.h>

typedef enum {
${enums}
    FAULT_COUNT  /* 哨兵 */
} FaultCode_t;

/* 故障旗位（位域更便于多故障并存） */
typedef struct {
    uint32_t bits;   /* (1 << FaultCode_t) 累加 */
    uint32_t timestamp_ms;
} FaultRegister_t;

extern FaultRegister_t g_fault_reg;

static inline void Fault_Set(FaultCode_t code) {
    g_fault_reg.bits |= (1U << (uint32_t)code);
}

static inline uint32_t Fault_IsActive(FaultCode_t code) {
    return (g_fault_reg.bits >> (uint32_t)code) & 1U;
}

static inline void Fault_Clear(FaultCode_t code) {
    g_fault_reg.bits &= ~(1U << (uint32_t)code);
}

#endif /* FAULT_CODES_H_ */
`;
}

function genStateMachineC(input: GeneratorInput, generatedAt: string): string {
  const cases = STARTUP_STATE_LIST.map((s, i) => {
    const next = STARTUP_STATE_LIST[i + 1]?.cName ?? 'STARTUP_FIELDWEAK';
    let body = `            /* ${s.comment} */`;
    if (s.cName === 'STARTUP_IDLE') body += `\n            if (start_requested) next = STARTUP_PRECHARGE;`;
    else if (s.cName === 'STARTUP_PRECHARGE') body += `\n            if (vdc_voltage >= INVERTER_VDC_V * 0.95f) next = STARTUP_ALIGN;`;
    else if (s.cName === 'STARTUP_ALIGN') body += `\n            if (state_elapsed_ms >= STARTUP_ALIGN_MS) next = STARTUP_OPEN_LOOP;`;
    else if (s.cName === 'STARTUP_OPEN_LOOP') body += `\n            if (current_rpm >= HFI_HANDOFF_RPM) next = STARTUP_HFI;`;
    else if (s.cName === 'STARTUP_HFI') body += `\n            if (current_rpm >= BEMF_HANDOFF_RPM) next = STARTUP_BEMF;`;
    else if (s.cName === 'STARTUP_BEMF') body += `\n            if (current_rpm >= FIELDWEAK_HANDOFF_RPM) next = STARTUP_FIELDWEAK;`;
    else if (s.cName === 'STARTUP_FIELDWEAK') body += `\n            /* 弱磁稳态：注入负 Id 维持高速 */`;
    void next;
    return `        case ${s.cName}: {
${body}
            break;
        }`;
  }).join('\n');

  return `${banner(input.mcuFamily, generatedAt, 'state_machine.c — 7 状态启动机（idle → precharge → align → open-loop → hfi → bemf → fieldweak）')}

#include "motor_param.h"
#include "fault_codes.h"

typedef enum {
${STARTUP_STATE_LIST.map((s) => `    ${s.cName},  /* ${s.comment} */`).join('\n')}
} StartupState_t;

static StartupState_t s_state = STARTUP_IDLE;
static uint32_t       s_state_enter_ms = 0;
FaultRegister_t       g_fault_reg = {0};

extern uint32_t HAL_GetTick(void);

void Startup_Tick(uint8_t start_requested, float vdc_voltage, float current_rpm)
{
    StartupState_t next = s_state;
    uint32_t state_elapsed_ms = HAL_GetTick() - s_state_enter_ms;
    (void)state_elapsed_ms; (void)vdc_voltage; (void)current_rpm;

    switch (s_state) {
${cases}
        default: next = STARTUP_IDLE;
    }

    if (next != s_state) {
        s_state = next;
        s_state_enter_ms = HAL_GetTick();
    }
}

StartupState_t Startup_GetState(void) { return s_state; }
`;
}

function genFocIsrC(input: GeneratorInput, generatedAt: string): string {
  const tpl = MCU_TEMPLATES[input.mcuFamily];
  const useSvpwm = input.snapshot.inverter.modulationMode === 'svpwm';
  const modCall = useSvpwm
    ? '    /* SVPWM：calculateSvpwm(V_alpha, V_beta, INVERTER_VDC_V, &dutyA, &dutyB, &dutyC) */\n    SVPWM_Calculate(V_alpha, V_beta, INVERTER_VDC_V, &dutyA, &dutyB, &dutyC);'
    : '    /* SPWM：直接 (Vα,Vβ) → (Va,Vb,Vc) → duty，无零序注入 */\n    SPWM_Calculate(V_alpha, V_beta, INVERTER_VDC_V, &dutyA, &dutyB, &dutyC);';

  return `${banner(input.mcuFamily, generatedAt, `foc_isr.c — ADC 中断快环（sample → Clarke → Park → PI → 反 Park → ${useSvpwm ? 'SVPWM' : 'SPWM'} → CCR）`)}

${tpl.halHeaders.join('\n')}
#include "motor_param.h"
#include "fault_codes.h"
#include <math.h>

extern ADC_HandleTypeDef hadc1;
extern TIM_HandleTypeDef htim1;

/* PI 状态结构（每个轴一份） */
typedef struct {
    float Kp;
    float Ki;
    float integrator;
    float out_limit;
} PI_State_t;

/* 初值来自 store: foc.kp / foc.ki / foc.voltageLimit */
static PI_State_t s_pi_id = { CURRENT_PI_KP, CURRENT_PI_KI, 0.0f, VOLTAGE_LIMIT_V };
static PI_State_t s_pi_iq = { CURRENT_PI_KP, CURRENT_PI_KI, 0.0f, VOLTAGE_LIMIT_V };

/* 当前角度（rad） —— 由 BEMF 观测器 / HFI 解调 / 编码器写入 */
volatile float theta_now = 0.0f;
volatile float iq_ref    = IQ_REF_DEFAULT_A;
volatile float id_ref    = ID_REF_DEFAULT_A;

/* 前置声明：transforms / svpwm 实现（独立 .c，参考 web 仿真同名函数） */
void Clarke_Transform(float Ia, float Ib, float *Ialpha, float *Ibeta);
void Park_Transform(float Ialpha, float Ibeta, float theta, float *Id, float *Iq);
void InvPark_Transform(float Vd, float Vq, float theta, float *Valpha, float *Vbeta);
void SVPWM_Calculate(float Valpha, float Vbeta, float Vdc, float *dutyA, float *dutyB, float *dutyC);
void SPWM_Calculate(float Valpha, float Vbeta, float Vdc, float *dutyA, float *dutyB, float *dutyC);

/**
 * 单步 PI（带反积分饱和）：
 *   error    = ref - fb
 *   pre      = Kp*error + integrator
 *   out      = clamp(pre, ±out_limit)
 *   integrator += Ki * error * dt;  if pre saturates 反向 → 不再累加
 *
 * 这是 web 仿真 src/simulation/math/pid.ts::piStep 的 C 平移；
 * 增益单位与连续时间形式一致（Ki 单位 1/s）。
 */
static float PI_Step(PI_State_t *pi, float ref, float fb, float dt)
{
    float error = ref - fb;
    float pre   = pi->Kp * error + pi->integrator;
    float out   = pre;
    if (out >  pi->out_limit) out =  pi->out_limit;
    if (out < -pi->out_limit) out = -pi->out_limit;
    /* 反积分饱和：饱和方向上不再累 */
    if (!((pre > pi->out_limit && error > 0.0f) || (pre < -pi->out_limit && error < 0.0f))) {
        pi->integrator += pi->Ki * error * dt;
    }
    return out;
}

/**
 * 快环 ISR：ADC 注入序列完成中断（同步 TIM1 中心对齐谷值）。
 *
 * 顺序严格：
 *   1. 读 Ia / Ib（KCL: Ic = -Ia - Ib，省一通道）
 *   2. Clarke (abc → αβ)
 *   3. Park (αβ → dq)，需要 theta_now
 *   4. PI 电流环 (Id_ref - Id) → Vd / (Iq_ref - Iq) → Vq
 *   5. 反 Park (dq → αβ)
 *   6. ${useSvpwm ? 'SVPWM' : 'SPWM'} 反变换得 duty
 *   7. 写 TIM1->CCR1/2/3
 *
 * 耗时预算：${input.mcuFamily} @ ${input.snapshot.inverter.pwmFrequency} Hz PWM
 *   → 周期 ${(1e6 / input.snapshot.inverter.pwmFrequency).toFixed(1)} μs，本 ISR 必须 < 50% 周期。
 */
void ${tpl.isrName}(void)
{
    /* 1. 采样 */
    int32_t raw_a = ${tpl.adcRead.iaExpr};
    int32_t raw_b = ${tpl.adcRead.ibExpr};
    /* ADC 标度：(raw - offset) * scale；offset 由上电时 PWM 关掉测得 */
    extern float g_adc_offset_a, g_adc_offset_b, g_adc_scale_a;
    float Ia = ((float)raw_a - g_adc_offset_a) * g_adc_scale_a;
    float Ib = ((float)raw_b - g_adc_offset_b) * g_adc_scale_a;

    /* 过流保护（软件 OCP，硬件 OCP 由 TIM Break + 比较器并行做） */
    if (fabsf(Ia) > MOTOR_RATED_CURRENT_A * 1.5f || fabsf(Ib) > MOTOR_RATED_CURRENT_A * 1.5f) {
        Fault_Set(FAULT_OVER_CURRENT);
        TIM1->BDTR &= ~TIM_BDTR_MOE;   /* 切断 PWM */
        return;
    }

    /* 2-3. Clarke + Park */
    float I_alpha, I_beta, Id, Iq;
    Clarke_Transform(Ia, Ib, &I_alpha, &I_beta);
    Park_Transform(I_alpha, I_beta, theta_now, &Id, &Iq);

    /* 4. PI 电流环 */
    const float dt = CURRENT_LOOP_DT_S;
    float Vd = PI_Step(&s_pi_id, id_ref, Id, dt);
    float Vq = PI_Step(&s_pi_iq, iq_ref, Iq, dt);

    /* 5. 反 Park */
    float V_alpha, V_beta;
    InvPark_Transform(Vd, Vq, theta_now, &V_alpha, &V_beta);

    /* 6. ${useSvpwm ? 'SVPWM' : 'SPWM'} 反变换 */
    float dutyA, dutyB, dutyC;
${modCall}

${tpl.ccrWrite}

    /* 7. ADC 中断标志清零（部分 HAL 版本需要） */
    __HAL_ADC_CLEAR_FLAG(&hadc1, ADC_FLAG_JEOC);
}
`;
}

function genMainC(input: GeneratorInput, generatedAt: string): string {
  const tpl = MCU_TEMPLATES[input.mcuFamily];
  return `${banner(input.mcuFamily, generatedAt, `main.c — 入口 + 时钟 / TIM1 / ADC1 配置（${input.mcuFamily} @ ${tpl.chipBlurb.split('；')[0]}）`)}

${tpl.halHeaders.join('\n')}
#include "motor_param.h"
#include "fault_codes.h"
#include <stdint.h>

/* CubeMX 生成的句柄占位 —— 用户在 CubeMX 中实际生成后会自动覆盖此处 */
ADC_HandleTypeDef hadc1;
TIM_HandleTypeDef htim1;

/* ADC 校准量（上电时 PWM 关掉测得） */
float g_adc_offset_a = 2048.0f;
float g_adc_offset_b = 2048.0f;
float g_adc_scale_a  = 0.012207f;  /* (3.3V / 4096) / shunt_R / amp_gain，按硬件调 */

extern void Startup_Tick(uint8_t start_requested, float vdc_voltage, float current_rpm);
extern void MX_GPIO_Init(void);
extern void MX_ADC1_Init(void);
extern void MX_TIM1_Init(void);

${tpl.systemClockConfig}

int main(void)
{
    /* 1. HAL + 时钟初始化 */
    HAL_Init();
    SystemClock_Config();

    /* 2. 外设初始化（CubeMX 生成的 MX_xxx_Init） */
    MX_GPIO_Init();
    MX_ADC1_Init();
    MX_TIM1_Init();

    /* 3. ADC 注入序列同步 TIM1 TRGO */
${tpl.adcInit}

    /* 4. TIM1 三对互补输出启动（中心对齐 + 死区 ${input.snapshot.inverter.deadTimeUs.toFixed(1)}μs @ ${input.snapshot.inverter.pwmFrequency} Hz） */
${tpl.tim1Init}

    /* 5. 主循环：状态机 + 慢任务 */
    uint8_t start_cmd = 1;
    float   vdc_meas  = INVERTER_VDC_V;
    float   rpm_meas  = 0.0f;
    while (1) {
        /* 状态机 tick @ 1kHz —— 慢任务用 SysTick 节拍 */
        Startup_Tick(start_cmd, vdc_meas, rpm_meas);

        /* 速度环（每 SPEED_LOOP_DIVIDER 个快环跑一次，由 foc_isr 主动调用） */
        /* 监控 / 通信 / 排气温度查询 / 上位机协议 */
    }
}

/* 错误处理 stub（CubeMX 风格） */
void Error_Handler(void)
{
    Fault_Set(FAULT_STARTUP_FAIL);
    while (1) {}
}
`;
}

function genCMakeLists(input: GeneratorInput, generatedAt: string): string {
  const tpl = MCU_TEMPLATES[input.mcuFamily];
  return `# ============================================================
# CMakeLists.txt — ${input.mcuFamily} FOC 工程
# 由 compressor-bench 学习客户端生成
# Generated: ${generatedAt}
# ============================================================

cmake_minimum_required(VERSION 3.22)

# 工具链（请安装 arm-none-eabi-gcc）
set(CMAKE_SYSTEM_NAME      Generic)
set(CMAKE_SYSTEM_PROCESSOR arm)
set(CMAKE_C_COMPILER       arm-none-eabi-gcc)
set(CMAKE_CXX_COMPILER     arm-none-eabi-g++)
set(CMAKE_ASM_COMPILER     arm-none-eabi-gcc)
set(CMAKE_OBJCOPY          arm-none-eabi-objcopy)

project(compressor_foc_${input.mcuFamily.toLowerCase()} C ASM)

# MCU 编译标志（${input.mcuFamily}）
set(MCU_FLAGS "${tpl.cmakeMcuFlags}")
add_compile_options(\${MCU_FLAGS} -Wall -Wextra -ffunction-sections -fdata-sections -O2)
add_link_options(\${MCU_FLAGS} -T\${CMAKE_SOURCE_DIR}/${tpl.cmakeLinkerScript}
                 -Wl,--gc-sections -Wl,--print-memory-usage)

# 宏定义（HAL 驱动选择）
add_definitions(
    -D${tpl.cmakeHalLib.replace('=', '=')}
    -DUSE_HAL_DRIVER
)

include_directories(
    Core/Inc
    Drivers/CMSIS/Include
    Drivers/CMSIS/Device/ST/${input.mcuFamily}xx/Include
    Drivers/${input.mcuFamily}xx_HAL_Driver/Inc
)

file(GLOB_RECURSE SOURCES
    Core/Src/*.c
    Drivers/${input.mcuFamily}xx_HAL_Driver/Src/*.c
    startup_*.s
)

add_executable(\${PROJECT_NAME}.elf \${SOURCES})

add_custom_command(TARGET \${PROJECT_NAME}.elf POST_BUILD
    COMMAND \${CMAKE_OBJCOPY} -O binary \${PROJECT_NAME}.elf \${PROJECT_NAME}.bin
    COMMAND \${CMAKE_OBJCOPY} -O ihex   \${PROJECT_NAME}.elf \${PROJECT_NAME}.hex
)

# 烧录目标（${tpl.flashTool}）
add_custom_target(flash
    COMMAND STM32_Programmer_CLI -c port=SWD -w \${PROJECT_NAME}.bin 0x08000000 -rst
    DEPENDS \${PROJECT_NAME}.elf
)
`;
}

function genReadme(input: GeneratorInput, generatedAt: string): string {
  const tpl = MCU_TEMPLATES[input.mcuFamily];
  const mappings = buildParamMappings(input);
  const tableRows = mappings
    .map((m) => `| \`${m.storeKey}\` | ${m.storeValue}${m.unit ? ' ' + m.unit : ''} | \`${m.cDefine}\` | \`${m.cValue}\` |`)
    .join('\n');
  return `# ${input.mcuFamily} 压缩机 FOC 工程骨架

由 compressor-bench 学习客户端生成 · ${generatedAt}

## 选型摘要

| 槽位 | 选择 |
| --- | --- |
| 压缩机 | ${input.slots.compressorLabel} |
| 主控 MCU | ${input.slots.inverterMcuPartNo} （工程按 ${input.mcuFamily} 生成） |
| 控制策略 | ${input.slots.strategyLabel} |
| 工况 | ${input.slots.loadLabel} |
| PFC 前级 | ${input.slots.pfcLabel} |
| 液气分离器 | ${input.slots.separatorLabel} |

## 目录结构

\`\`\`
Core/
  Inc/
    motor_param.h     电机/逆变器/PI 常量（store → #define）
    fault_codes.h     14 种故障枚举 + Fault_Set/Clear/IsActive
  Src/
    main.c            入口 + SystemClock_Config + 主循环
    foc_isr.c         ADC 中断快环（sample → Clarke → Park → PI → SVPWM → CCR）
    state_machine.c   7 状态启动机
CMakeLists.txt
README.md
\`\`\`

## 用法

1. 用 STM32CubeMX 新建 ${input.mcuFamily} 工程，启用 TIM1 / ADC1 / DMA / NVIC。
2. ${tpl.cubeMxNote}
3. 把本工程的 \`Core/\` 目录覆盖到 CubeMX 生成的 \`Core/\`。
4. 编译：\`mkdir build && cd build && cmake .. && make\`
5. 烧录：\`make flash\` 或用 ${tpl.flashTool}。

## 参数对照表（store → C define）

下表的左列是你在 web 仿真器里调的值，右列是生成的 C 常量。
**修改 web 端参数后重新导出即可同步。** 共 ${mappings.length} 项：

| store 字段 | 当前值 | C 宏 | C 值 |
| --- | --- | --- | --- |
${tableRows}

## 注意事项

- 本工程**仅是骨架**：CubeMX 的 RCC / GPIO / DMA / NVIC 配置需要你自行补全。
- \`Clarke_Transform\` / \`Park_Transform\` / \`SVPWM_Calculate\` 的实现需要从 web 仿真
  \`src/simulation/math/transforms.ts\` + \`svpwm.ts\` 平移到 C。
- 上电首步必须做 ADC 零漂校准（PWM 关掉 10ms 测 Ia/Ib offset）。
- 硬件 OCP 必须用比较器 + TIM Break 输入并行做；软件 OCP 仅作冗余。
- 启动序列：${input.slots.strategyLabel}。
`;
}

/** 主入口：根据 input 生成所有工程文件 */
export function generateProject(input: GeneratorInput): ExportFile[] {
  const generatedAt = input.generatedAt ?? defaultTimestamp();

  return [
    {
      path: 'Core/Src/main.c',
      label: 'main.c',
      purpose: '入口 + 时钟初始化 + 主循环',
      category: 'source',
      content: genMainC(input, generatedAt),
    },
    {
      path: 'Core/Src/foc_isr.c',
      label: 'foc_isr.c',
      purpose: 'ADC 中断快环 (Clarke → Park → PI → 反 Park → SVPWM)',
      category: 'source',
      content: genFocIsrC(input, generatedAt),
    },
    {
      path: 'Core/Src/state_machine.c',
      label: 'state_machine.c',
      purpose: '7 状态启动机 (idle → precharge → align → open-loop → hfi → bemf → fieldweak)',
      category: 'source',
      content: genStateMachineC(input, generatedAt),
    },
    {
      path: 'Core/Inc/motor_param.h',
      label: 'motor_param.h',
      purpose: '电机/逆变器/PI 常量（store → #define 同步）',
      category: 'header',
      content: genMotorParamH(input, generatedAt),
    },
    {
      path: 'Core/Inc/fault_codes.h',
      label: 'fault_codes.h',
      purpose: '14 种故障枚举 + 位域寄存器',
      category: 'header',
      content: genFaultCodesH(input, generatedAt),
    },
    {
      path: 'CMakeLists.txt',
      label: 'CMakeLists.txt',
      purpose: `${input.mcuFamily} arm-none-eabi-gcc 构建脚本`,
      category: 'build',
      content: genCMakeLists(input, generatedAt),
    },
    {
      path: 'README.md',
      label: 'README.md',
      purpose: '用法说明 + 烧录步骤 + 参数对照表',
      category: 'doc',
      content: genReadme(input, generatedAt),
    },
  ];
}

/** 把多文件压成一个"单一打包文本"——用于纯文本下载（不引入 JSZip） */
export function packAsSingleText(files: ExportFile[]): string {
  const sep = '\n\n' + '='.repeat(72) + '\n';
  return files
    .map((f) => `${sep}FILE: ${f.path}\n${'─'.repeat(60)}\n${f.content}`)
    .join('\n');
}

export { MCU_TEMPLATES, guessMcuFamily } from './mcuTemplate';
