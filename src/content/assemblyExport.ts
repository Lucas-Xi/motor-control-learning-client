import type { CompressorSpec, InverterPlatform } from './compressorLibrary';
import type {
  AssemblyResult,
  ControlStrategy,
  LiquidSeparator,
  LoadCondition,
  PfcPlatform,
} from './assemblyLibraries';

/**
 * 整机模板导出 ——
 *
 * 把工作台搭好的 6 槽位配置 + runAssembly 诊断结果生成一份 STM32 main.c 风格的工程骨架。
 *
 * 用户拿到后能：
 *   - 直接看到所有关键 #define 已填好（电机参数 / PWM 频率 / 死区 / 状态机阈值）
 *   - 看到 FOC 快环 / 慢环 / 启动状态机的实现注释（不写实现，只给位置和顺序）
 *   - 把它当 cookbook 模板，对照仿真 verdict 决定下一步开发优先级
 *
 * 不生成可编译完整工程 —— HAL 初始化 / ADC 中断 / TIM 配置由用户结合芯片型号自行实现。
 */

export interface ExportOptions {
  compressor: CompressorSpec;
  inverter: InverterPlatform;
  strategy: ControlStrategy;
  load: LoadCondition;
  pfc: PfcPlatform;
  separator: LiquidSeparator;
  result: AssemblyResult;
}

function strategyHeader(strategy: ControlStrategy): string {
  if (strategy.id === 'spwm-vf') return '/* SPWM 开环 V/f：固定 V/f 曲线 + 端电压调制；不闭电流环，没有角度反馈 */';
  if (strategy.id === 'foc-encoder') return '/* FOC + 编码器：标准 dq 闭环，角度来自外置增量编码器 */';
  if (strategy.id === 'foc-bemf') return '/* FOC + 反电动势无感：龙伯格观测器/SMO 估角，零速段不可用（需叠开环爬起来）*/';
  return '/* FOC + HFI + BEMF：零速 → 低速用 HFI 凸极注入定角，速度起来后切到反电动势观测 */';
}

function startupSequence(strategy: ControlStrategy): string {
  if (strategy.id === 'spwm-vf') return 'align → openloop（整段）';
  if (strategy.id === 'foc-encoder') return 'align → bemf（编码器有真角度，跳过开环/HFI 引导）';
  if (strategy.id === 'foc-bemf') return 'align → openloop → bemf';
  return 'align → openloop → hfi → bemf → (fieldweak)';
}

function fastLoopComment(strategy: ControlStrategy): string {
  if (strategy.id === 'spwm-vf') {
    return `/* ADC 中断 = PWM 同步采样（V/f 模式简化版）
 *   1. Theta 内部计数器累加 ω·dt
 *   2. V_alpha, V_beta = V_f(theta)   ← V/f 曲线
 *   3. SVPWM 反变换 → duty A/B/C
 *   4. 写 TIM CCR1/2/3
 *
 * V/f 不闭电流环，所以这条快路径只到调制。
 */`;
  }
  return `/* ADC 中断 = 快环（与 PWM update 同步）
 *   1. Ia, Ib 采样 → Ic = -Ia-Ib（KCL，省一通道 ADC）
 *   2. Clarke:   (Ia, Ib) → (I_alpha, I_beta)
 *   3. Park:     (I_alpha, I_beta, theta) → (Id, Iq)
 *   4. PI 电流环: (Id_ref - Id) → Vd  /  (Iq_ref - Iq) → Vq
 *      （含死区补偿 + 反积分饱和 + voltage_limit_V 限幅）
 *   5. 反 Park:  (Vd, Vq, theta) → (V_alpha, V_beta)
 *   6. SVPWM:    (V_alpha, V_beta, V_dc) → duty A/B/C
 *   7. 写 TIM1 CCR1/2/3（中心对齐 + 死区已在 TIM 自带）
 */`;
}

function modulationConstant(strategy: ControlStrategy): string {
  if (strategy.modulationLimitFactor === 0.5) return '0.500f /* SPWM 线性区上限 */';
  return '0.866f /* SVPWM 线性区上限 */';
}

function safeIdent(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
}

// ———————————————————— MCU 厂商识别 + 模板 ————————————————————

export type McuVendor = 'stm32' | 'renesas' | 'ti';

export function getMcuVendor(mcuPartNo: string): McuVendor {
  if (/STM32/i.test(mcuPartNo)) return 'stm32';
  if (/Renesas|^RX\d|^R5F/i.test(mcuPartNo)) return 'renesas';
  if (/TMS320|^TI |C2000/i.test(mcuPartNo)) return 'ti';
  return 'stm32'; // 兜底
}

interface McuTemplate {
  /** 顶部 #include 区 */
  headers: string;
  /** Cortex-M / RXv / C28x 一句话简介 */
  chipBlurb: string;
  /** main() 的 system init 段 */
  systemInit: string;
  /** ADC injected / TIM PWM 配置 + 注释 */
  peripheralInit: string;
  /** 快环中断函数名 */
  isrName: string;
  /** 写三相 PWM 比较寄存器的代码（接收 dutyA/B/C 0..1） */
  pwmWrite: string;
  /** ADC 读相电流的伪 API */
  adcReadA: string;
  adcReadB: string;
}

const MCU_TEMPLATES: Record<McuVendor, McuTemplate> = {
  stm32: {
    headers: `#include "main.h"
#include "stm32g4xx_hal.h"
#include <stdint.h>
#include <math.h>`,
    chipBlurb: 'STM32 Cortex-M4 + FPU @ 170MHz；ADC injected conversion 同步 TIM1 update；HRTIM 可选。',
    systemInit: `    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();
    MX_ADC1_Init();
    MX_TIM1_Init();`,
    peripheralInit: `    /* ADC injected conversion 同步 TIM1 TRGO（中心对齐谷值采样） */
    HAL_ADCEx_InjectedStart_IT(&hadc1);
    /* TIM1 中心对齐 + 死区 ${'${deadTimeUs}'}μs @ ${'${pwmFreqHz}'}Hz */
    HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);
    HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_1);
    HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_2);
    HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_2);
    HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_3);
    HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_3);`,
    isrName: 'ADC1_2_IRQHandler',
    pwmWrite: `    /* 写 PWM 比较值（中心对齐：ARR = period，CCR ∈ [0, ARR]） */
    __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, (uint32_t)(dutyA * htim1.Init.Period));
    __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_2, (uint32_t)(dutyB * htim1.Init.Period));
    __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_3, (uint32_t)(dutyC * htim1.Init.Period));`,
    adcReadA: 'HAL_ADCEx_InjectedGetValue(&hadc1, ADC_INJECTED_RANK_1) * ADC_SCALE_A',
    adcReadB: 'HAL_ADCEx_InjectedGetValue(&hadc1, ADC_INJECTED_RANK_2) * ADC_SCALE_A',
  },
  renesas: {
    headers: `#include "platform.h"
#include "iodefine.h"
#include <stdint.h>
#include <math.h>`,
    chipBlurb: 'Renesas RX 系列（RX26T / RX72T）32-bit RXv3 内核；MTU3 互补 PWM；硬件 FOC 加速器（部分型号），日系空调主流。',
    systemInit: `    R_BSP_PowerOn_BSP();
    R_BSP_HardwareLock(BSP_LOCK_TIMER);
    /* RX26T: 120MHz, FPU enabled in startup */
    InitClock_RX26T();
    InitGPIO_PWM_Pins();`,
    peripheralInit: `    /* MTU3 互补 PWM + 死区，TGRA/B/C 为 3 相 duty */
    InitMTU3_ComplementaryPWM(${'${pwmFreqHz}'}, ${'${deadTimeUs}'});
    /* S12AD 12-bit ADC injected by MTU3 TADCORA（PWM 谷值同步采样） */
    InitS12AD_PWMSync();
    /* 使能 ADC 中断 */
    IEN(PERIB, INTB128) = 1;
    IPR(PERIB, INTB128) = 14;`,
    isrName: 'INT_Excep_PERIB_INTB128',
    pwmWrite: `    /* MTU3 TGRA/B/C 写 duty（period = MTU3.TGRD） */
    MTU3.TGRA = (uint16_t)(dutyA * MTU3.TGRD);
    MTU3.TGRB = (uint16_t)(dutyB * MTU3.TGRD);
    MTU4.TGRA = (uint16_t)(dutyC * MTU4.TGRD);`,
    adcReadA: 'S12AD.ADDR0 * ADC_SCALE_A',
    adcReadB: 'S12AD.ADDR1 * ADC_SCALE_A',
  },
  ti: {
    headers: `#include "F28x_Project.h"
#include "F2837xD_device.h"
#include <stdint.h>
#include <math.h>`,
    chipBlurb: 'TI C2000 F28379D 双核 200MHz；CLA 协处理器跑 FOC 浮点不占主 CPU；EPWM + ADC SOC 同步硬实时。',
    systemInit: `    InitSysCtrl();
    DINT;
    InitPieCtrl();
    IER = 0x0000; IFR = 0x0000;
    InitPieVectTable();
    EALLOW;
    /* 配置 EPWM clock / ADC clock */
    CpuSysRegs.PCLKCR2.bit.EPWM1 = 1;
    CpuSysRegs.PCLKCR13.bit.ADC_A = 1;
    EDIS;`,
    peripheralInit: `    /* EPWM1 中心对齐 + 死区，CMPA/B 为 3 相 duty */
    InitEPwm1_Compressor(${'${pwmFreqHz}'}, ${'${deadTimeUs}'});
    InitEPwm2_Compressor(${'${pwmFreqHz}'}, ${'${deadTimeUs}'});
    InitEPwm3_Compressor(${'${pwmFreqHz}'}, ${'${deadTimeUs}'});
    /* ADCa SOC0/SOC1 由 EPWM1 SOC 触发 → PWM 谷值采样 */
    InitAdca_PWMSync();
    /* 注册 ADC 中断到 PIE */
    Interrupt_register(INT_ADCA1, &adca1_isr);
    Interrupt_enable(INT_ADCA1);`,
    isrName: 'adca1_isr',
    pwmWrite: `    /* EPWM1/2/3 CMPA.bit.CMPA 写 duty（period = TBPRD） */
    EPwm1Regs.CMPA.bit.CMPA = (uint16_t)(dutyA * EPwm1Regs.TBPRD);
    EPwm2Regs.CMPA.bit.CMPA = (uint16_t)(dutyB * EPwm2Regs.TBPRD);
    EPwm3Regs.CMPA.bit.CMPA = (uint16_t)(dutyC * EPwm3Regs.TBPRD);
    /* Ack ADC 中断 */
    AdcaRegs.ADCINTFLGCLR.bit.ADCINT1 = 1;
    PieCtrlRegs.PIEACK.all = PIEACK_GROUP1;`,
    adcReadA: 'AdcaResultRegs.ADCRESULT0 * ADC_SCALE_A',
    adcReadB: 'AdcaResultRegs.ADCRESULT1 * ADC_SCALE_A',
  },
};

function tplFill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\$\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

/** 渲染 .c 文本。日期由 caller 注入，便于测试可重复。 */
export function exportAssemblyAsC(opts: ExportOptions, dateLabel = new Date().toISOString().slice(0, 19).replace('T', ' ')): string {
  const { compressor, inverter, strategy, load, pfc, separator, result } = opts;
  const verdictLabel = result.verdict === 'pass' ? '通过' : result.verdict === 'pass-warn' ? '通过·有告警' : '不通过';
  const cop = result.metrics.cop.toFixed(2);
  const settling = Number.isFinite(result.timeline.settling95PctS) ? result.timeline.settling95PctS.toFixed(2) + ' s' : '> 8 s（未收敛）';
  const busPct = result.metrics.busHeadroomPct.toFixed(0);
  const faultsRemaining = result.items.filter((i) => i.level === 'fault').map((i) => i.message);
  const faultsBlock = faultsRemaining.length
    ? `\n * 待修复 fault:\n${faultsRemaining.map((m) => ` *   - ${m}`).join('\n')}`
    : '\n * 待修复 fault: 无';

  // 按 MCU 厂商选模板
  const vendor = getMcuVendor(inverter.mcuPartNo);
  const tpl = MCU_TEMPLATES[vendor];
  const vendorLabel = vendor === 'stm32' ? 'STM32 (ST Microelectronics)' : vendor === 'renesas' ? 'Renesas RX 系列' : 'TI C2000';
  const peripheralInit = tplFill(tpl.peripheralInit, { pwmFreqHz: inverter.pwmFreqHz, deadTimeUs: inverter.deadTimeUs.toFixed(1) });

  return `/* ============================================================
 * 整机搭建工作台 · 自动生成 ${vendorLabel} 工程骨架
 * Generated: ${dateLabel}
 *
 * 6 槽位选型摘要：
 *   压缩机:     ${compressor.brand} ${compressor.partNo}（${compressor.hp}HP, ${compressor.refrigerant}, ${compressor.type}）
 *   变频器平台: ${inverter.ipmBrand} ${inverter.ipmPartNo}（${inverter.topology}, ${inverter.ratedCurrentA}A / ${inverter.ratedBusV}V）
 *   主控 MCU:   ${inverter.mcuPartNo}
 *   控制策略:   ${strategy.name}
 *   工况:       ${load.name}（T_e=${load.Te}°C, T_c=${load.Tc}°C, target=${load.targetRpm} rpm）
 *   PFC 前级:   ${pfc.name}
 *   液气分离器: ${separator.name}
 *
 * 诊断结论:    ${verdictLabel}
 *   COP:         ${cop}
 *   95% 收敛:    ${settling}
 *   母线余量:    ${busPct}%${faultsBlock}
 *
 * ${strategyHeader(strategy)}
 *
 * 启动状态机序列：${startupSequence(strategy)}
 *
 * 主控芯片：${vendorLabel} · ${inverter.mcuPartNo}
 *   ${tpl.chipBlurb}
 * ============================================================ */

${tpl.headers}

/* ──────────── 电机参数（来自压缩机 datasheet） ──────────── */
#define MOTOR_POLE_PAIRS            ${compressor.polePairs}
#define MOTOR_RATED_CURRENT_A       ${compressor.ratedCurrentA.toFixed(2)}f
#define MOTOR_RATED_SPEED_RPM       ${Math.round(compressor.maxRpm * 0.6)}
#define MOTOR_MAX_SPEED_RPM         ${compressor.maxRpm}
#define MOTOR_RS_OHM                ${(compressor.rsMohm / 1000).toFixed(4)}f
#define MOTOR_LD_H                  ${(compressor.ldMh / 1000).toExponential(3)}f
#define MOTOR_LQ_H                  ${(compressor.lqMh / 1000).toExponential(3)}f
#define MOTOR_FLUX_WB               ${compressor.flux.toFixed(4)}f
#define MOTOR_SALIENCY_RATIO        ${(compressor.lqMh / compressor.ldMh).toFixed(2)}f  /* Lq/Ld，HFI 凸极解调需 > 1.2 */

/* ──────────── 逆变器配置 ──────────── */
#define INVERTER_VDC_V              ${pfc.vdcOutput.toFixed(0)}.0f  /* PFC: ${pfc.name} */
#define INVERTER_PWM_FREQ_HZ        ${inverter.pwmFreqHz}
#define INVERTER_PWM_PERIOD_US      ${(1e6 / inverter.pwmFreqHz).toFixed(2)}f
#define INVERTER_DEAD_TIME_US       ${inverter.deadTimeUs.toFixed(1)}f
#define INVERTER_RATED_CURR_A       ${inverter.ratedCurrentA.toFixed(1)}f
#define INVERTER_RATED_BUS_V        ${inverter.ratedBusV}
#define MODULATION_MAX              ${modulationConstant(strategy)}
#define VOLTAGE_LIMIT_V             (INVERTER_VDC_V * MODULATION_MAX)

/* ──────────── 启动状态机阈值 ──────────── */
#define STARTUP_ALIGN_MS            300       /* 对齐阶段：注入 Id 让转子吸到 0° */
#define HFI_HANDOFF_RPM             200       /* 开环 → HFI 切换阈值 */
#define BEMF_HANDOFF_RPM            600       /* HFI → BEMF 切换阈值 */
#define FIELDWEAK_RPM_THRESH        ${Math.round(load.targetRpm * 0.85)}      /* target × 0.85 */
#define TARGET_RPM                  ${load.targetRpm}
#define RAMP_LIMIT_RPM_PER_S        ${separator.maxRampRpmS}     /* 液气分离器承载: ${separator.name} */

/* ──────────── FOC 电流环 PI 参数（初值，需现场校正） ──────────── */
typedef struct {
    float Kp;
    float Ki;
    float voltage_limit_V;
    float integrator;          /* 状态变量（运行时） */
} FOC_PI_t;

static FOC_PI_t foc_id = { 8.0f, 1000.0f, VOLTAGE_LIMIT_V, 0.0f };
static FOC_PI_t foc_iq = { 8.0f, 1000.0f, VOLTAGE_LIMIT_V, 0.0f };

/* ──────────── 制冷工况（用于性能监控 / 热保护） ──────────── */
#define COOLING_TE_C                ${load.Te.toFixed(1)}f
#define COOLING_TC_C                ${load.Tc.toFixed(1)}f
#define COOLING_SUPERHEAT_K         ${load.superheatK.toFixed(1)}f
#define COOLING_SUBCOOL_K           ${load.subcoolK.toFixed(1)}f
#define COMPRESSOR_DISPLACEMENT_CC  ${compressor.displacementCc.toFixed(1)}f

/* ──────────── 故障保护阈值 ──────────── */
#define OCP_THRESHOLD_A             (INVERTER_RATED_CURR_A * 1.5f)   /* 硬件 OCP */
#define DISCHARGE_T_LIMIT_C         ${compressor.refrigerant === 'R32' ? '105.0f' : compressor.refrigerant === 'R410A' ? '110.0f' : '95.0f'}   /* ${compressor.refrigerant} 排气限 */
#define PRESSURE_RATIO_LIMIT        ${compressor.refrigerant === 'R134a' ? '8.0f' : '7.0f'}

/* ============================================================
 * 入口骨架（HAL / RCC / 中断回调由用户结合芯片型号自行实现）
 * ============================================================ */

void Clarke_Transform(float Ia, float Ib, float *I_alpha, float *I_beta);
void Park_Transform(float I_alpha, float I_beta, float theta, float *Id, float *Iq);
void InvPark_Transform(float Vd, float Vq, float theta, float *V_alpha, float *V_beta);
void SVPWM(float V_alpha, float V_beta, float V_dc, float *dutyA, float *dutyB, float *dutyC);
float FOC_PI_Step(FOC_PI_t *pi, float ref, float fb, float dt);

int main(void)
{
    /* 1. 系统初始化（${vendorLabel} BSP） */
${tpl.systemInit}

    /* 2. PWM + ADC 同步配置（PWM 频率 ${inverter.pwmFreqHz} Hz，死区 ${inverter.deadTimeUs.toFixed(1)} μs） */
${peripheralInit}

    /* 3. 启动状态机：${startupSequence(strategy)} */
    Startup_Init(STARTUP_ALIGN_MS, HFI_HANDOFF_RPM, BEMF_HANDOFF_RPM, FIELDWEAK_RPM_THRESH);

    /* 4. 慢任务循环（速度环 1kHz / 通信 / 监控） */
    while (1) {
        if (slow_task_ready()) {
            /* 速度环：(speed_ref - speed_fb) → iq_ref */
            /* 位置环（可选） */
            /* 通信：上位机 / 网关 */
            /* 监控：排气温度 / 压力 / OCP / 过温 */
        }
    }
}

/* ──────────── 快环（ADC 中断）${strategy.pwmKHzMin}-${strategy.pwmKHzMax} kHz 推荐工作区 ──────────── */
${fastLoopComment(strategy)}

void ${tpl.isrName}(void)
{
    /* 读 Ia, Ib（同步 PWM 谷值采样，${vendorLabel} ADC API） */
    float Ia = ${tpl.adcReadA};
    float Ib = ${tpl.adcReadB};

    /* TODO: 减去 ADC 零漂校准值（断 PWM 时记录的 offset） */
    Ia -= ADC_OFFSET_A_FIX;
    Ib -= ADC_OFFSET_B_FIX;

    float I_alpha, I_beta, Id, Iq;
    Clarke_Transform(Ia, Ib, &I_alpha, &I_beta);
    Park_Transform(I_alpha, I_beta, theta_now, &Id, &Iq);

    /* PI 电流环（dt = 1 / PWM 频率） */
    const float dt = 1.0f / (float)INVERTER_PWM_FREQ_HZ;
    float Vd = FOC_PI_Step(&foc_id, ${strategy.fieldWeakening ? 'id_ref_with_fieldweak' : '0.0f'}, Id, dt);
    float Vq = FOC_PI_Step(&foc_iq, iq_ref, Iq, dt);

    /* 反 Park + SVPWM */
    float V_alpha, V_beta, dutyA, dutyB, dutyC;
    InvPark_Transform(Vd, Vq, theta_now, &V_alpha, &V_beta);
    SVPWM(V_alpha, V_beta, INVERTER_VDC_V, &dutyA, &dutyB, &dutyC);

${tpl.pwmWrite}
}

/* ============================================================
 * 工程化提醒（来自本次诊断）：
${result.items.filter((i) => i.level !== 'ok').map((i) => ' *   [' + (i.level === 'fault' ? 'FAULT' : 'WARN ') + '] ' + i.message).join('\n') || ' *   无告警'}
 *
 * 完成上述快环后，重点验证：
 *   1. OCP 比较器阈值 = OCP_THRESHOLD_A，触发后必须硬件切断 TIM Break
 *   2. ADC 零漂校准：上电后 PWM 关掉 10ms 记录 Ia/Ib 零点
 *   3. 启动状态机的失败回退路径（${startupSequence(strategy)}）
 *   4. 弱磁工作区（如已启用）的 Id_ref 平滑（避免阶跃造成转矩抖动）
 * ============================================================ */

#define ${safeIdent(compressor.partNo)}_TEMPLATE_VERSION 1
`;
}
