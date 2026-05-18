import type { ModuleId } from '../simulation/engine/types';
import type { LessonContent } from './lessons';

/**
 * English lesson content. Same schema as `lessons.ts`.
 *
 * Design notes:
 *  - Translates introBeginner / learningGoals / concepts / formulas.explanation /
 *    engineeringMeaning / stm32Guide / commonMistakes / debugMethods / experiments /
 *    summary / nextSteps / quiz; keeps formula expressions and code examples intact
 *    (C identifiers / math symbols).
 *  - `quiz.correct` indices match the zh-CN version (option ordering preserved).
 *  - Acronyms (PMSM, FOC, SVPWM, HFI, APF, PFC, IPM, BEMF, SMO, PLL, MTPA, MTPV)
 *    are kept as is; first-time expansions appear in concepts.
 */

const baseCode = `// STM32 / C porting notes: the algorithm layer keeps only inputs, state, outputs.\n// 1. Read Ia/Ib/Ic in the ADC ISR.\n// 2. Call the pure clarke/park/pi/svpwm functions.\n// 3. Write TIM1/TIM8 CCR duty cycles.\n// 4. Stream key variables to UART or RTT for scope correlation.`;

void baseCode;

export const lessonsEn: Partial<Record<ModuleId, LessonContent>> = {
  'motor-basics': {
    id: 'motor-basics',
    introBeginner: {
      metaphor: 'A motor is like a crowd of people pushing a swing in turn — energising the stator windings creates magnetic poles (the "hands"), and the rotor carrying permanent magnets (the "swing") gets periodically pushed in the same direction. The core problem FOC solves is "when to push and how hard" so that the swing builds up smoothly and steadily.',
      coreIdea: 'All FOC math is built on the most basic chain: mechanical angle to electrical angle through multiplying by pole pairs, then steering the magnetic field direction.',
      whyCare: [
        'If the pole-pair count is wrong the electrical angle is off by an integer factor and the motor will jitter or even spin backwards — the single most common reason FOC will not turn at power-up.',
        'Mechanical angle (what your eyes see the rotor doing) and electrical angle (what the controller uses) are two different quantities and must not be mixed.',
        'Every later module (Clarke / Park / SVPWM / field weakening) assumes you already know the electrical angle right now.',
      ],
      firstAction: 'On the right, change the pole-pair count from 4 to 8 and watch the two rings: the mechanical angle theta_m stays at 45 degrees while the electrical angle theta_e jumps to 360 degrees — for an 8-pole-pair motor the electrical angle cycles eight times per mechanical revolution.',
    },
    learningGoals: [
      'Tell apart DC, BLDC, PMSM, and induction-motor control differences.',
      'Understand the role of stator, rotor, permanent magnets, windings, Hall sensors, and encoders.',
      'Master the relationship between mechanical angle, electrical angle, and pole pairs.',
    ],
    concepts: [
      'Mechanical angle is what the physical rotor turns through; electrical angle is what one magnetic period maps to. The higher the pole-pair count, the more electrical angle accumulates per mechanical turn.',
      'PMSM torque mostly comes from the q-axis current; the d-axis is usually aligned with the permanent-magnet flux. Surface-mounted PMSMs commonly run Id=0; interior PMSMs add MTPA.',
      'Back-EMF scales with speed and flux linkage. The faster you spin, the more voltage headroom the controller needs.',
    ],
    formulas: [
      { title: 'Electrical angle', expression: 'θe = polePairs × θm', explanation: 'theta_m is the mechanical angle read from the encoder, polePairs is the pole-pair count. The control algorithm always uses theta_e — this is literally the first line of FOC code.' },
      { title: 'Electrical frequency', expression: 'fe = (rpm / 60) × polePairs', explanation: 'A 4-pole-pair motor at 1500 rpm gives fe = 25 x 4 = 100 Hz. This value sets the lower bound for the PWM frequency (at least several tens of times higher).' },
      { title: 'Electromagnetic torque', expression: 'Te = 1.5 × p × (ψf × Iq + (Ld - Lq) × Id × Iq)', explanation: 'p is the pole-pair count, psi_f is the magnet flux linkage. For surface-mounted PMSM Ld=Lq and torque approximates Te ~ 1.5 x p x psi_f x Iq, proportional to Iq. That is why q-axis is called the "torque axis".' },
      { title: 'Back-EMF', expression: 'BEMF = Ke × ω', explanation: 'Back-EMF grows with speed; once it approaches the bus voltage the controller has no voltage headroom left and field weakening becomes necessary.' },
    ],
    engineeringMeaning: [
      'The first thing to verify when debugging FOC is the pole-pair count (datasheet, or count teeth on a tear-down). Get this wrong and every dq value is wrong.',
      'Rs / Ld / Lq / Ke / Kt / J / B — these seven parameters set current-loop bandwidth and observer accuracy. Ask for the full data sheet when sourcing a motor.',
      'Mechanical angle resolution (encoder counts / pole pairs) bounds the worst-case dq error in the current loop. Low resolution combined with a high pole-pair count means big errors.',
    ],
    stm32Guide: [
      'Read theta_m from the encoder or Hall, then compute (uint16_t)((theta_raw * polePairs) % ENCODER_RESOLUTION) to get theta_e.',
      'On startup you must perform "alignment": drive a known dq voltage so the rotor parks at d-axis zero, then clear the encoder offset.',
      'Store pole_pairs, Rs, Ls, Ke in a motor_param_t struct loaded from Flash so you can swap motors without recompiling.',
    ],
    commonMistakes: [
      'Feeding the mechanical angle straight into Park (motor jitters or refuses to turn).',
      'Writing the pole count instead of pole pairs — an 8-pole motor has 4 pole pairs, not 8.',
      'Closing the loop without first aligning the encoder zero.',
      'Mixing units / scaling between phase currents (Ia), line currents (Iab), and dq currents.',
    ],
    debugMethods: [
      'On a bench with no load and low bus voltage (12 V), manually set Iq=1 A and slowly ramp theta_e to see whether the rotor tracks.',
      'Log theta_m and theta_e every PWM cycle over SWO/RTT/UART; under healthy conditions theta_e cycles polePairs times faster than theta_m.',
      'Probe the three phase currents on a scope: they should be symmetric sinusoids 120 degrees apart.',
    ],
    experiments: [
      'Change pole pairs from 4 to 8: mechanical angle is unchanged but electrical-angle cycles double.',
      'Sweep mechanical speed 0 to 6000 rpm and watch electrical frequency follow (fe = rpm x p / 60).',
    ],
    summary: 'Multiplying mechanical angle by the pole-pair count to get the electrical angle is mile zero of FOC. Every later module assumes you can compute it correctly.',
    nextSteps: ['Continue to the three-phase module to see how three phase currents synthesise an actually rotating magnetic field — that is why getting the electrical angle right is enough to spin a motor.'],
    codeExample: `/* ============================================
 * motor.h — motor parameters and angle math
 * Targets STM32F4/G4/H7, centre-aligned PWM @ 16 kHz
 * ============================================ */
typedef struct {
    uint8_t  pole_pairs;     // pole pairs (NOT pole count)
    float    rs;             // phase resistance, Ohm
    float    ld_h;           // d-axis inductance, H
    float    lq_h;           // q-axis inductance, H
    float    psi_f;          // PM flux linkage, Wb
    float    rated_current;  // rated current, A
} motor_param_t;

/* Raw encoder count -> electrical angle (rad)
 * encoder_raw:  0 .. ENCODER_RESOLUTION-1
 * encoder_zero: the offset captured during start-up alignment */
static inline float encoder_to_theta_e(
    uint32_t encoder_raw,
    uint32_t encoder_zero,
    uint8_t  pole_pairs)
{
    /* 1. subtract the alignment offset to get the mechanical count */
    int32_t mech = (int32_t)encoder_raw - (int32_t)encoder_zero;
    if (mech < 0) mech += ENCODER_RESOLUTION;

    /* 2. multiply by pole pairs (avoid overflow) */
    uint32_t elec = ((uint32_t)mech * pole_pairs) % ENCODER_RESOLUTION;

    /* 3. normalise to [0, 2*pi) */
    return (float)elec * (2.0f * M_PI / ENCODER_RESOLUTION);
}

/* Call this at the very start of the ADC ISR — the entry point of the FOC chain */
volatile float g_theta_e;
void ADC_IRQHandler_Begin(void) {
    g_theta_e = encoder_to_theta_e(
        ENCODER_GetCount(),
        g_param.encoder_zero,
        g_param.pole_pairs);
    /* Then comes Clarke -> Park -> PI -> inverse Park -> SVPWM */
}`,
    quiz: [
      {
        q: 'A PMSM nameplate reads "8 poles, 4 pole pairs". What pole-pair value should FOC use?',
        options: ['8', '4', '16', '2'],
        correct: 1,
        hint: '"Poles" counts every magnetic pole (N and S); "pole pairs" = poles / 2. FOC uses pole pairs, so 4 here.',
      },
      {
        q: 'A 4-pole-pair motor spins at 1500 rpm. What is the electrical frequency?',
        options: ['25 Hz', '50 Hz', '100 Hz', '6000 Hz'],
        correct: 2,
        hint: 'fe = rpm/60 x polePairs = 25 x 4 = 100 Hz. PWM frequency should be at least 50 times higher.',
      },
      {
        q: 'If you feed the mechanical angle theta_m directly into Park as if it were theta_e, what is most likely to happen?',
        options: ['Motor spins normally, just slower', 'Motor jitters or refuses to spin', 'Current goes down', 'No effect — FOC self-corrects'],
        correct: 1,
        hint: 'theta_e should be theta_m times pole pairs. An integer-factor mismatch puts dq projections in the wrong place, sending the Iq command into Id, producing little to no torque.',
      },
      {
        q: 'For a surface-mounted PMSM (Ld=Lq) running Id=0, what mainly sets the electromagnetic torque?',
        options: ['Id', 'Iq', 'Bus voltage', 'PWM frequency'],
        correct: 1,
        hint: 'Te = 1.5p(psi_f x Iq + (Ld-Lq)Id x Iq). When Ld=Lq the second term vanishes and Iq is directly proportional to torque.',
      },
      {
        q: 'Why must encoder zero alignment happen before FOC starts up?',
        options: ['Hardware requirement', 'So the controller knows where the d-axis is to compute dq projections correctly', 'To protect the encoder', 'To reduce PWM noise'],
        correct: 1,
        hint: 'The d-axis follows the rotor magnet N pole. Aligning pins "encoder reading = 0" to "d-axis pointing at stator phase A". Without it Id/Iq commands carry a constant offset from the real axes.',
      },
    ],
  },
  'three-phase': {
    id: 'three-phase',
    introBeginner: {
      metaphor: 'Three-phase currents are like three people standing 120 degrees apart taking turns to push a revolving door — there is always someone pushing so the door keeps turning. The three push with sinusoidal force, offset by 120 degrees, and together they give the door a force whose magnitude is constant and whose direction rotates smoothly. That force is the synthesised stator field.',
      coreIdea: 'Three windings fixed in space and fed currents offset by 120 degrees synthesise a rotating field — this is the physical foundation that lets any AC motor spin.',
      whyCare: [
        'Without grasping "three-phase to rotating field", the geometry behind Clarke / Park is just number juggling.',
        'Three-phase imbalance is the single most common fault source during bring-up (sampling offset, missing phase, wrong phase order). One look at the waveform and the synthesis vector tells the story.',
        'Going from "3 phase AC" to "a 2D vector" is the pivotal change of perspective from the hardware view to the FOC control view.',
      ],
      firstAction: 'Drag the frequency on the right from 50 Hz to 120 Hz and watch the synthesised field arrow in the stator cross-section spin noticeably faster, while the period of the three-phase waveform shrinks. Then push "three-phase imbalance" to 0.3 and watch the arrow tip trace an ellipse instead of a circle.',
    },
    learningGoals: [
      'Understand three sinusoidal currents 120 degrees apart.',
      'Observe why the synthesised field vector rotates at constant speed.',
      'See how amplitude, frequency, phase, imbalance, harmonics, and noise affect the field.',
    ],
    concepts: [
      'Ideal three-phase currents satisfy Ia + Ib + Ic = 0, and the three windings are 120 degrees apart in space, so the synthesised field has constant magnitude and rotates uniformly.',
      'Frequency sets the rotational speed of the field, amplitude its strength, and initial phase the field direction at t=0.',
      'Imbalance, harmonics, and sampling noise turn the synthesised vector into an ellipse, jitter, or ripple.',
    ],
    formulas: [
      { title: 'Three-phase sinusoidal currents', expression: 'Ia = I·sin(ωt),  Ib = I·sin(ωt − 2π/3),  Ic = I·sin(ωt + 2π/3)', explanation: 'I is the peak value, omega = 2 x pi x f; when balanced the three currents always sum to zero.' },
      { title: 'Resulting MMF', expression: 'F(t) = (3/2)·I·e^(jωt)', explanation: 'Three windings 120 degrees apart in space, fed currents 120 degrees apart in time, produce a rotating complex vector of constant magnitude (3/2) x I.' },
      { title: 'Electrical frequency vs synchronous speed', expression: 'n_s = 60·f / p', explanation: 'A 4-pole-pair motor at 50 Hz reaches a synchronous speed of 750 rpm. In FOC the controller chooses f and so sets the target speed the motor must follow.' },
    ],
    engineeringMeaning: [
      'All FOC coordinate transforms are built on top of three-phase sinusoidal quantities. Once you see the waveform and the rotating field, alpha-beta and dq stop being abstract.',
      'On real drives, three-phase imbalance usually comes from current-sampling offset, phase-resistance mismatch, dead-time, wrong phase sequence, or PWM update timing errors.',
    ],
    stm32Guide: [
      'Synchronise ADC sampling with the PWM midpoint (injected sampling plus centre-aligned PWM) to dodge switching noise.',
      'Right after power-up perform ADC offset calibration: with the motor de-energised, average several hundred ia/ib/ic samples to capture the zero reference.',
      'During debugging, run open-loop V/f or open-loop sinusoidal current at low voltage (12 V) to check three-phase symmetry, then close the loop.',
    ],
    commonMistakes: [
      'Looking at only one phase and ignoring the phase relationship of the other two.',
      'Sampling near the PWM edges, letting switching ripple leak straight into the control loop.',
      'Mixing RMS, peak, and average values — scaling drifts.',
      'Closing the current loop without ADC offset calibration.',
    ],
    debugMethods: [
      'Use a scope or current clamp to compare three-phase peak amplitudes and phase relationships (they must be exactly 120 degrees apart).',
      'Log ia+ib+ic at runtime: a balanced system stays below 0.1 A; large offset means sampling bias or a missing phase.',
      'FFT ia/ib/ic; if harmonics exceed 5%, check dead-time and back-EMF harmonic content.',
    ],
    experiments: [
      'Sweep frequency 50 to 120 Hz and watch the rotating field speed up (constant amplitude).',
      'Inject a 5th harmonic and watch dips appear at the peak of the waveform and ripples appear in the alpha-beta trajectory.',
      'Set imbalance to 0.3 and watch the circular trajectory collapse into an ellipse.',
    ],
    summary: 'The core of three-phase sinusoids is not the sin() formula but "three currents offset by 120 degrees in time, flowing in three windings offset by 120 degrees in space, synthesise a rotating field".',
    nextSteps: ['Continue to Clarke transform: compress three-phase quantities into a 2D alpha-beta vector — the first coordinate transform in FOC.'],
    codeExample: `/* ============================================
 * Three-phase ADC sampling + offset calibration
 * Targets STM32 ADC + DMA + injected sequence trigger
 * ============================================ */

/* Power-up calibration: average 1024 samples while the motor is de-energised
 * to capture the zero-current ADC raw codes */
typedef struct {
    int32_t ia_offset;   // raw ADC code
    int32_t ib_offset;
    int32_t ic_offset;
    float   adc_to_amps; // scale = Vref / (4096 * R_shunt * Gain)
} current_calib_t;

void current_calibrate(current_calib_t *c) {
    int32_t sa = 0, sb = 0, sc = 0;
    for (int i = 0; i < 1024; i++) {
        while (!(ADC1->JSR & ADC_JSR_JEOC)) { /* wait for injected EOC */ }
        sa += ADC1->JDR1;
        sb += ADC1->JDR2;
        sc += ADC1->JDR3;
        ADC1->JSR &= ~ADC_JSR_JEOC;
    }
    c->ia_offset = sa >> 10;   // /1024
    c->ib_offset = sb >> 10;
    c->ic_offset = sc >> 10;
}

/* In the ISR: raw code -> real amps */
static inline float adc_to_amps(int32_t raw, int32_t offset, float scale) {
    return (float)(raw - offset) * scale;
}

/* Usage in the FOC ISR:
 *   float ia = adc_to_amps(ADC1->JDR1, calib.ia_offset, calib.adc_to_amps);
 *   float ib = adc_to_amps(ADC1->JDR2, calib.ib_offset, calib.adc_to_amps);
 *   float ic = -ia - ib;   // three-phase sum = 0 reconstructs the third phase, saving one ADC
 *   // Debug assertion: |ia + ib + ic| should be below 0.1 A
 */`,
    quiz: [
      {
        q: 'For balanced three-phase sinusoidal currents, what is the theoretical value of Ia + Ib + Ic?',
        options: ['Proportional to amplitude I', 'Proportional to frequency f', 'Always 0', 'Varies with omega·t'],
        correct: 2,
        hint: 'sin(wt) + sin(wt - 2pi/3) + sin(wt + 2pi/3) = 0 is an identity. If at runtime |Ia+Ib+Ic| stays above 0.1 A the ADC offset most likely needs calibration.',
      },
      {
        q: 'You change the three-phase current frequency from 50 Hz to 120 Hz. What happens to the synthesised stator field?',
        options: ['Amplitude grows', 'Amplitude unchanged, rotates faster', 'Disappears', 'Reverses direction'],
        correct: 1,
        hint: 'Amplitude depends on the current peak; frequency only sets the angular speed omega = 2 x pi x f.',
      },
      {
        q: 'A scope shows three phases at 6 A each, but only two of them are 120 degrees apart and the third is 100 degrees off. What happens?',
        options: ['Same as a healthy system', 'The synthesised field amplitude becomes unstable and the trajectory becomes an ellipse', 'Motor stops', 'PWM frequency changes'],
        correct: 1,
        hint: 'Phase mismatch breaks the symmetric synthesis into a circular field; the alpha-beta vector tip traces an ellipse or jitters.',
      },
      {
        q: 'Why is it strongly recommended that STM32 ADC sampling for three-phase currents happens at the PWM midpoint?',
        options: ['Hardware requirement', 'The midpoint is the switching edge, where current changes fastest', 'The midpoint has the smallest current ripple and dodges switching noise', 'It is the only way the wiring allows'],
        correct: 2,
        hint: 'In centre-aligned PWM the midpoint is exactly when high- and low-side switches have settled; ripple is near the average value, whereas sampling near a switching edge picks up huge noise.',
      },
      {
        q: 'A 4-pole-pair PMSM driven at a 100 Hz stator current — what is its synchronous mechanical speed?',
        options: ['100 rpm', '1500 rpm', '6000 rpm', '400 rpm'],
        correct: 1,
        hint: 'n_s = 60 x f / p = 60 x 100 / 4 = 1500 rpm.',
      },
    ],
  },
  'clarke-transform': {
    id: 'clarke-transform',
    introBeginner: {
      metaphor: 'Clarke transform is like projecting three arrows onto a flat wall. Three-phase currents Ia/Ib/Ic are three vectors 120 degrees apart in space; because Ia+Ib+Ic=0 their net effect has only two degrees of freedom, so a single X-Y plane is enough. Clarke compresses "three arrows" into "Ialpha on X plus Ibeta on Y".',
      coreIdea: 'A geometric projection from "three phase" to "two stationary" axes. With balanced three-phase quantities only two degrees of freedom remain, so alpha-beta is a more efficient representation and a mandatory step before Park.',
      whyCare: [
        'Clarke is the very first coordinate transform in the FOC chain: three-phase ADC -> Clarke -> Park -> PI -> inverse Park -> SVPWM.',
        'I0 (zero-sequence component) = (Ia+Ib+Ic)/3 is a health metric for three-phase imbalance and ADC offset.',
        'Once Clarke clicks, "why does SVPWM draw a hexagon on the alpha-beta plane" clicks — they live in the same coordinate system.',
      ],
      firstAction: 'On the right switch to "manual Ia/Ib/Ic", set Ia=5, Ib=-5, Ic=0 and watch the alpha-beta vector tip on the left move. This is the classroom example: Ialpha=Ia=5, Ibeta=(Ia+2 x Ib)/sqrt(3)=(5-10)/1.732 ~ -2.89 — verify the numbers match what you read.',
    },
    learningGoals: [
      'Understand the projection from abc three-phase coordinates to the alpha-beta stationary frame.',
      'Grasp the meaning of the zero-sequence component.',
      'Recognise how an unbalanced three-phase system changes the alpha-beta vector.',
    ],
    concepts: [
      'Clarke projects three phase currents onto two perpendicular stationary axes. A balanced three-phase system has only two degrees of freedom, so 2D is enough.',
      'I0 is the common-mode offset across the three phases. In a three-wire star motor it cannot generate useful torque, but it does expose sampling offset or imbalance.',
    ],
    formulas: [
      { title: 'Clarke transform (amplitude-invariant form)', expression: 'Iα = Ia,   Iβ = (Ia + 2·Ib) / √3', explanation: 'The standard engineering form: Ialpha = Ia directly, and three-phase to two-phase only takes a single sin-coefficient 1/sqrt(3).' },
      { title: 'Zero-sequence component', expression: 'I0 = (Ia + Ib + Ic) / 3', explanation: 'When balanced I0 is about 0; a clearly nonzero value points at ADC zero, a missing phase, or phase-resistance mismatch.' },
      { title: 'Matrix form', expression: '[Iα; Iβ; I0] = (1/3)·[2,−1,−1; 0,√3,−√3; 1,1,1]·[Ia; Ib; Ic]', explanation: 'The power-invariant form divides by sqrt(2/3); on MCUs the amplitude-invariant form is more common.' },
    ],
    engineeringMeaning: [
      'Clarke is the entry door of FOC. ADC three-phase currents flow through Clarke first; only then come Park and the current loop.',
      'A common two-resistor sampling trick reconstructs the third phase as Ic = -Ia - Ib, saving one ADC channel. This relies on the ADC being offset-calibrated and the three-phase sum truly being zero.',
    ],
    stm32Guide: [
      'During ADC calibration log the three-phase zero-current offsets; at runtime subtract the offsets before Clarke.',
      'Implement Clarke as a static inline function so the compiler folds it straight into the FOC ISR with no overhead.',
      'Pre-compute 1/sqrt(3) ~ 0.5773502692f as a const to avoid sqrt at runtime.',
    ],
    commonMistakes: [
      'Using raw currents without subtracting the ADC offset.',
      'Mixing the amplitude-invariant and power-invariant forms, which throws off all downstream PI and SVPWM scaling.',
      'In two-shunt sampling, reconstructing Ic with the wrong sign (it must be Ic = -Ia - Ib, not +Ia + Ib).',
    ],
    debugMethods: [
      'With no load at standstill, Ialpha, Ibeta, and I0 should all be near zero; any offset means the ADC offset is uncalibrated.',
      'When running open-loop V/f sinusoidally, the alpha-beta tip should trace a clean circle; an ellipse means three-phase imbalance or inconsistent sample scaling.',
      'Set Ia=+5, Ib=-2.5, Ic=-2.5 (the classroom example) and you should read Ialpha=+5, Ibeta=0, I0=0.',
    ],
    experiments: [
      'Switch to "manual Ia/Ib/Ic", deliberately make the three-phase sum nonzero, and watch I0 drift.',
      'Balanced 5 A at 0 degrees of phase -> alpha-beta vector along +alpha; phase 90 degrees -> along +beta.',
    ],
    summary: 'Clarke = project "three scalar quantities in space" onto "a 2D vector". This is the geometric prerequisite that lets FOC control two DC quantities with PI.',
    nextSteps: ['Continue to Park: let the alpha-beta plane rotate with the rotor so AC quantities become DC dq quantities.'],
    codeExample: `/* ============================================
 * clarke.h — Clarke transform (amplitude-invariant form)
 * The compiler inlines it into the FOC ISR
 * ============================================ */
#define ONE_OVER_SQRT3   0.57735026919f

typedef struct {
    float alpha;
    float beta;
    float zero;     // I0 = (Ia+Ib+Ic)/3, zero-sequence health check
} alpha_beta_t;

static inline alpha_beta_t clarke(float ia, float ib, float ic) {
    alpha_beta_t o;
    o.alpha = ia;
    o.beta  = (ia + 2.0f * ib) * ONE_OVER_SQRT3;
    o.zero  = (ia + ib + ic) * 0.33333333f;
    return o;
}

/* Two-ADC saving version: only Ia and Ib, reconstruct Ic = -Ia - Ib.
 * Requires star connection, accurate sampling, and a balanced system. */
static inline alpha_beta_t clarke_2adc(float ia, float ib) {
    alpha_beta_t o;
    o.alpha = ia;
    o.beta  = (ia + 2.0f * ib) * ONE_OVER_SQRT3;
    o.zero  = 0.0f;     // assume three-phase sum = 0
    return o;
}

/* Health check: run periodically during bring-up to catch ADC offset drift */
static inline int current_health_check(alpha_beta_t s) {
    return fabsf(s.zero) < 0.1f ? 1 : 0;
}`,
    quiz: [
      {
        q: 'What is the standard (amplitude-invariant) formula for Ibeta in the Clarke transform?',
        options: ['Iβ = Ib', 'Iβ = (Ia + 2·Ib) / √3', 'Iβ = Ic - Ib', 'Iβ = (Ib - Ic) / √3'],
        correct: 1,
        hint: 'Amplitude-invariant: Ialpha=Ia, Ibeta=(Ia+2Ib)/sqrt(3). The equivalent form (Ib-Ic)/sqrt(3) follows by substituting Ic=-Ia-Ib.',
      },
      {
        q: 'You observe I0 = 0.8 A at runtime while the motor is rated 6 A. Most likely cause?',
        options: ['Normal operation', 'Uncalibrated three-phase ADC zero / missing phase / phase-resistance imbalance', 'PWM frequency too high', 'Wrong Park angle'],
        correct: 1,
        hint: 'Balanced three-phase I0 should be well below 1% of the amplitude. 0.8 A / 6 A = 13% is a significant offset — calibrate the ADC offsets first.',
      },
      {
        q: 'What is the implicit prerequisite of the two-ADC saving scheme Ic=-Ia-Ib?',
        options: ['Stable bus voltage', 'Star connection plus ADC offset already subtracted', 'High PWM frequency', 'Motor at standstill'],
        correct: 1,
        hint: 'It requires ia+ib+ic=0 to hold strictly: star connection plus an accurate ADC. Delta connection breaks the assumption.',
      },
      {
        q: 'If the sqrt(3) factor in the Clarke formula for Ibeta is mistakenly written as sqrt(2), what happens?',
        options: ['No effect', 'The alpha-beta vector amplitude is mis-scaled, so Park-derived Id/Iq are off by a proportional factor', 'Motor stops', 'ADC errors'],
        correct: 1,
        hint: 'sqrt(3) ~ 1.732, sqrt(2) ~ 1.414 — about 18% difference. Everything downstream (PI, limiters, SVPWM) drifts by that factor.',
      },
      {
        q: 'Power-invariant vs amplitude-invariant Clarke — what is the most direct consequence of mixing them in FOC?',
        options: ['No difference', 'PI gains, current limits, and SVPWM modulation index are all off by sqrt(2/3)', 'Motor jitters', 'ADC overflow'],
        correct: 1,
        hint: 'Power-invariant adds a sqrt(2/3) ~ 0.8165 scaling factor. Once mixed, every downstream calibration is off by that factor.',
      },
    ],
  },
  'park-transform': {
    id: 'park-transform',
    introBeginner: {
      metaphor: 'Park transform is like standing on a spinning carousel — you and the carousel turn together, so other points on it appear stationary to you. In the stationary frame Ialpha-beta is a fast-rotating arrow, but jump onto the rotor and spin with it and that arrow suddenly becomes two fixed rods (Id, Iq) with constant direction and length. From now on the PI controllers only need to chase DC quantities — the AC headache is gone.',
      coreIdea: 'The same current vector looks like a fast-varying AC signal in the stationary alpha-beta frame but becomes a stable DC signal in the rotor-synchronous dq frame. Park is the rotation between these two viewpoints.',
      whyCare: [
        'Without Park, PI controllers have to chase sinusoids — large steady-state phase / magnitude errors. After Park they chase DC, with zero steady-state error.',
        'Id controls the flux linkage, Iq controls the torque — this decoupling builds a 1:1 link between current and torque, the bedrock of accurate FOC torque control.',
        'Encoder zero alignment = aligning the controller-perceived d-axis with the real rotor flux direction. An X-degree zero error makes sin(X) of the Iq command spill into Id, costing torque and raising current.',
      ],
      firstAction: 'On the right slowly drag electrical angle theta from 0 to 360 degrees and watch the d/q axes on the left rotate with it. At the same time watch the lengths of the Id/Iq line segments swap back and forth — the same alpha-beta vector projects to completely different Id/Iq values for different theta.',
    },
    learningGoals: [
      'Understand the relationship between the alpha-beta stationary frame and the dq rotating frame.',
      'Grasp the physical meaning of the d-axis and q-axis.',
      'See "why an AC signal becomes a DC signal in a synchronous frame".',
    ],
    concepts: [
      'The d-axis aligns with the rotor magnet N pole; the q-axis leads it by 90 electrical degrees and is responsible for torque. The frame rotates synchronously with the rotor.',
      'Id controls the flux linkage, Iq controls the torque. Surface-mounted PMSMs default to Id=0; field weakening injects negative Id.',
      'theta must be an electrical angle (mechanical x pole pairs) and its zero must be rigorously aligned with the rotor flux direction.',
    ],
    formulas: [
      { title: 'Park transform', expression: 'Id =  Iα·cos θ + Iβ·sin θ\\nIq = −Iα·sin θ + Iβ·cos θ', explanation: 'theta is the electrical angle. Conceptually this rotates the alpha-beta plane by -theta around the origin.' },
      { title: 'Inverse Park (FOC output side)', expression: 'Uα = Vd·cos θ − Vq·sin θ\\nUβ = Vd·sin θ + Vq·cos θ', explanation: 'After the current PI produces Vd/Vq in the dq domain, rotate by +theta back to alpha-beta for SVPWM.' },
      { title: 'PMSM torque', expression: 'Te = 1.5·p·(ψf·Iq + (Ld−Lq)·Id·Iq)', explanation: 'For surface-mounted machines Ld=Lq so Te ~ 1.5 x p x psi_f x Iq — Iq sets the torque directly.' },
    ],
    engineeringMeaning: [
      'Park lets PI control DC quantities, giving zero steady-state error and rigorous tuning.',
      'A wrong angle introduces dq cross-coupling: same Iq command produces less torque, larger current, and lower efficiency.',
      'A low-resolution encoder combined with a high pole-pair count translates angle jitter directly into dq jitter, raising current-loop noise.',
    ],
    stm32Guide: [
      'theta_e comes from the encoder (mechanical x pole pairs) or an observer (sensorless); normalise to [0, 2 x pi) before sin/cos.',
      'sincosf computes sin and cos in a single call — about 30% faster than separate sinf + cosf.',
      'A lookup table with linear interpolation (256-entry table + 8-bit interpolation) keeps sin/cos under 50 ns, good for MCUs below 100 MHz.',
    ],
    commonMistakes: [
      'Angle direction (cw/ccw) does not match the motor phase order, so the motor spins backwards or refuses to spin.',
      'Treating the mechanical angle as the electrical angle (forgetting to multiply by pole pairs).',
      'Failing to align the encoder zero — power-up gives an Iq=0 command yet torque is biased.',
      'Wrong sign on sin/cos (Park and inverse Park must use the same theta and consistent sign conventions).',
    ],
    debugMethods: [
      'Zero-speed lock (Vq=0, Vd=constant) parks the rotor at the d-axis zero, then clear the encoder zero.',
      'At low-speed open-loop V/f, log Id/Iq: ideally Id ~ 0 and Iq carries the load current; otherwise the angle direction or zero is off.',
      'Step test: command Iq=2 A, Id=0. Healthily Iq tracks and Id stays near 0. Id drifting above ~0.5 A signals angle error.',
    ],
    experiments: [
      'Drag theta and watch the same alpha-beta vector project to different points in dq.',
      'Set Ialpha=5, Ibeta=0, theta=0 -> Id=5, Iq=0; theta=90 -> Id=0, Iq=5.',
      'Deliberately offset theta by 15 degrees and watch Id drift to sin(15) x 5 ~ 1.3 A.',
    ],
    summary: 'Park = "see the world from the rotor". It turns AC control into DC control, the prerequisite that lets PI do its job.',
    nextSteps: ['Continue to the PID module to see how PI in closed loop tracks Id/Iq step commands.'],
    codeExample: `/* ============================================
 * park.h — Park / inverse Park transform
 * STM32 FPU calls sincosf directly; older MCUs can swap in a table
 * ============================================ */

typedef struct { float d; float q; } dq_t;
typedef struct { float alpha; float beta; } alpha_beta_t;

/* alpha-beta -> dq (Park) */
static inline dq_t park(float alpha, float beta, float theta_e) {
    float s, c;
    sincosf(theta_e, &s, &c);    // both at once
    dq_t o;
    o.d =  alpha * c + beta * s;
    o.q = -alpha * s + beta * c;
    return o;
}

/* dq -> alpha-beta (inverse Park) */
static inline alpha_beta_t inv_park(float vd, float vq, float theta_e) {
    float s, c;
    sincosf(theta_e, &s, &c);
    alpha_beta_t o;
    o.alpha = vd * c - vq * s;
    o.beta  = vd * s + vq * c;
    return o;
}

/* === Encoder zero alignment (run once at start-up) ===
 * Drive Vd > 0 and Vq = 0 — the rotor is forced to the d-axis zero.
 * Then clear the encoder counter and record that instant as encoder_zero.
 */
void align_encoder_zero(uint32_t *out_zero) {
    /* Apply 1 A equivalent on the d-axis (open-loop voltage mode) */
    set_open_loop_voltage(2.0f /*Vd*/, 0.0f /*Vq*/, 0.0f /*theta_e*/);
    HAL_Delay(800);                 // wait for the rotor to settle
    *out_zero = ENCODER->CNT;       // d-axis zero captured here
    set_open_loop_voltage(0, 0, 0); // release
}

/* Usage:
 *   align_encoder_zero(&calib.enc_zero);   // once at power-up
 *   // Then in each PWM ISR:
 *   theta_e = encoder_to_theta_e(ENCODER->CNT, calib.enc_zero, p);
 *   dq_t i = park(i_alpha, i_beta, theta_e);
 */`,
    quiz: [
      {
        q: 'For the same Ialpha=5, Ibeta=0, theta sweeps from 0 to 90 degrees. How do Id/Iq evolve?',
        options: ['Stay at Id=5, Iq=0', 'Id from 5 to 0, Iq from 0 to 5', 'Both reach 5 simultaneously', 'No change'],
        correct: 1,
        hint: 'Id = alpha cos(theta) + beta sin(theta), Iq = -alpha sin(theta) + beta cos(theta). At theta=0 you get (5,0); at theta=90 you get (0,5).',
      },
      {
        q: 'The encoder zero is off by 10 degrees and uncalibrated. Commanding Iq=5, Id=0, what does Id actually read?',
        options: ['0', '5', '5·sin(10°) ≈ 0.87', '5·cos(10°) ≈ 4.92'],
        correct: 2,
        hint: 'Park angle error delta-theta lets the Iq command "leak" sin(delta-theta) of itself onto Id, leaving Iq only with cos(delta-theta) x 5.',
      },
      {
        q: 'For a surface-mounted PMSM (Ld=Lq), what mainly sets torque?',
        options: ['Id', 'Iq', 'Total |alpha-beta| magnitude', 'Electrical frequency omega'],
        correct: 1,
        hint: 'Te = 1.5p(psi_f x Iq + (Ld-Lq) x IdIq). With Ld=Lq the second term vanishes and Iq is the sole driver.',
      },
      {
        q: 'In field-weakening control, what is the physical meaning of injecting negative Id?',
        options: ['Increase torque', 'Weaken the effective flux linkage -> lower back-EMF -> exchange for higher speed', 'Reduce losses', 'Protect hardware'],
        correct: 1,
        hint: 'Negative Id along the -d direction subtracts from the PM flux psi_f, reducing BEMF = Ke x omega and opening voltage headroom for the inverter output.',
      },
      {
        q: 'In what order do Park and inverse Park appear along the FOC chain?',
        options: ['Both at the front', 'Park first (sampling side), inverse Park later (output side)', 'Inverse Park first', 'Both at the same time'],
        correct: 1,
        hint: 'ADC -> Clarke -> Park -> PI -> inverse Park -> SVPWM -> bridge. Park turns measured alpha-beta into dq; inverse Park turns the PI-output Vdq back into alpha-beta.',
      },
    ],
  },
  'pid-control': {
    id: 'pid-control',
    introBeginner: {
      metaphor: 'PID is like adjusting a shower: P is the direct twist — if the water is too cold, twist the hot tap hard (proportional to the mismatch). I is the slow nudge — if you are still a little off, keep adding small amounts until you arrive. D is the predictor — if you sense the temperature changing fast you pull back early to avoid overshoot. Together they let "output" track "set-point" automatically.',
      coreIdea: 'PID = current error (P) + accumulated history (I) + change trend (D). In motor control 99% of the time you only use PI (P + I); D is reserved for position loops or very jittery systems.',
      whyCare: [
        'Current loop, speed loop, and position loop are all PID/PI — learn one and you can tune them all.',
        'Too low Kp gives slow response; too high causes oscillation or overcurrent. Too little Ki leaves steady-state error; too much produces integral wind-up and big overshoots.',
        '"After changing the sample period you must recompute Ki/Kd" is a classic newbie trap — PID gains are bound to Ts.',
      ],
      firstAction: 'Drag Kp on the right from 2.2 slowly to 8 and watch the response transition from smooth climb to overshoot and ringing. Click the "oscillation preset" for the extreme case, then toggle "anti-windup" off and compare the giant overshoot.',
    },
    learningGoals: [
      'Understand the physical role of P, I, and D.',
      'Tell apart the roles of current-loop PI, speed-loop PI, and position-loop PID.',
      'Recognise the four classic symptoms: overshoot, steady-state error, oscillation, and integral windup.',
    ],
    concepts: [
      'P is like a spring — the larger the error, the harder it pushes. I is like a ledger — long-term error is gradually paid off. D is like a damper — it resists fast changes.',
      'In motor control the current loop uses PI (bandwidth 1 to 5 kHz), the speed loop uses PI (50 to 500 Hz), and the position loop uses PID or feed-forward.',
      'Anti-windup: when the output saturates, stop or reduce integrator accumulation, so that releasing the saturation does not cause a big overshoot.',
    ],
    formulas: [
      { title: 'Discrete positional PID', expression: 'u[k] = Kp·e[k] + Ki·Ts·Σe + Kd·(e[k]−e[k−1])/Ts', explanation: 'Ts is the sample period; the output u must be clamped or the integral grows without bound.' },
      { title: 'Incremental PID', expression: 'Δu[k] = Kp·(e[k]−e[k−1]) + Ki·Ts·e[k] + Kd·(e[k]−2·e[k−1]+e[k−2])/Ts', explanation: 'Computes only the increment, no integrator state needed; intrinsically anti-windup (output stays put when error is zero).' },
      { title: 'Anti-windup (back-calculation)', expression: 'I[k+1] = I[k] + Ki·Ts·e[k] + Kt·(u_sat − u_unsat)', explanation: 'Kt is the back-calculation gain that pushes the integrator the other way by the saturated delta. Kt = Ki/Kp is a reasonable starting point.' },
    ],
    engineeringMeaning: [
      'Too-small parameters give slow response; too-large parameters give oscillation or even overcurrent. Anti-windup must be enabled.',
      'Inner-loop bandwidth must be at least 5 to 10 times the outer-loop bandwidth or the outer loop chases the inner and oscillates.',
      'Sample period Ts is the ruler for PID gains — halving Ts means either Ki/2 + Kd x 2 or switching to incremental PID for safer behaviour.',
    ],
    stm32Guide: [
      'A PID state struct holds integral / last_error / out_min / out_max / Kt.',
      'Pin the current loop to the PWM ISR (16 to 20 kHz) and divide the speed loop down to 1 to 5 kHz.',
      'Mark all floating-point PID functions as static inline so the compiler folds them into the ISR with zero call overhead.',
    ],
    commonMistakes: [
      'Integrator without limits -> after saturation, a large overshoot or even an overcurrent trip.',
      'Current loop and speed loop running at the same frequency with the same high bandwidth -> they fight and oscillate.',
      'Changing Ts without recomputing Ki/Kd -> behaviour changes completely.',
      'Mixing positional and incremental forms in the same code.',
    ],
    debugMethods: [
      'Tuning order: current loop first (observe Iq step response), then speed loop (speed step), then position loop.',
      'Bump only P until you find Kp_critical at the edge of oscillation, then back off to 0.4 to 0.6 of that.',
      'Add I until the steady-state error is below 1%; watch for integral oscillation.',
      'D usually starts at zero; only add it when position-loop jitter is severe, and always include a low-pass to avoid amplifying noise.',
    ],
    experiments: [
      'Load the "slow response" preset and watch the long rise time.',
      'Load the "oscillation" preset and watch clear overshoot with persistent ringing.',
      'Disable anti-windup, set a large Ki and a big setpoint, and watch the post-saturation "integral windup" overshoot.',
    ],
    summary: 'PID is not voodoo knobs but an engineered closed loop with sample period, limits, and anti-windup. Master one and you master all.',
    nextSteps: ['Drop the PI into the FOC current loop and observe how Id/Iq tracking interacts with saturation.'],
    codeExample: `/* ============================================
 * pi.h — PI with anti-windup (positional + back-calculation)
 * Suitable for current and speed loops
 * ============================================ */

typedef struct {
    float kp;
    float ki;             // true gain; Ts is folded into how it is used
    float ts;             // sample period in seconds
    float integral;
    float out_min;
    float out_max;
    float kt;             // anti-windup back-calc gain, suggest ki / kp
} pi_t;

static inline void pi_init(pi_t *c, float kp, float ki, float ts,
                           float lim_min, float lim_max) {
    c->kp = kp;  c->ki = ki;  c->ts = ts;
    c->integral = 0.0f;
    c->out_min = lim_min;  c->out_max = lim_max;
    c->kt = (kp > 1e-6f) ? (ki / kp) : 0.0f;
}

/* Single PI step (positional form + anti-windup back-calc) */
static inline float pi_step(pi_t *c, float ref, float meas) {
    float err = ref - meas;

    /* 1. compute the unsaturated output */
    float u_unsat = c->kp * err + c->integral;

    /* 2. clamp */
    float u = u_unsat;
    if (u > c->out_max) u = c->out_max;
    else if (u < c->out_min) u = c->out_min;

    /* 3. update integrator + back-calc */
    c->integral += c->ki * c->ts * err + c->kt * (u - u_unsat);

    return u;
}

void pi_reset(pi_t *c) { c->integral = 0.0f; }

/* === Tuning hints ===
 * Current loop: Kp = omega_bw * L,  Ki = omega_bw * R
 *   1 kHz bandwidth (omega_bw = 6283 rad/s) + L = 1.2 mH + R = 0.55 Ohm:
 *     Kp ~ 7.5,  Ki ~ 3450
 *   PWM 16 kHz -> Ts = 62.5 us; start tuning with Kp = 1 to 2 for safety.
 * Speed loop: bandwidth / 5 to 10; try Kp = 0.05 to 0.3, Ki = 0.5 to 3.
 */`,
    quiz: [
      {
        q: 'What problem does the I (integral) term in PID primarily solve?',
        options: ['Faster response', 'Eliminating steady-state error', 'Suppressing noise', 'Reducing overcurrent risk'],
        correct: 1,
        hint: 'P only outputs when error is nonzero. When error is small but not zero, I gradually accumulates and pushes it to zero — that is "eliminating steady-state offset".',
      },
      {
        q: 'With anti-windup disabled, a large Ki, and a set-point past the output limit, what happens after saturation releases?',
        options: ['No effect', 'Normal', 'The integral keeps growing during saturation, then on release produces a big overshoot and prolonged ringing', 'PWM shuts off'],
        correct: 2,
        hint: 'During saturation the integral keeps accumulating, piling up "fake" integral. Once the set-point returns to normal it takes a long time to bleed it off in the opposite direction.',
      },
      {
        q: 'Current loop bandwidth is 1 kHz. What speed-loop bandwidth makes sense?',
        options: ['Also 1 kHz', '500 Hz', '100 to 200 Hz', '5 kHz'],
        correct: 2,
        hint: 'Outer bandwidth should be much smaller than inner (5 to 10x) or commands change faster than the inner loop can follow, and they fight.',
      },
      {
        q: 'Halve Ts from 1 ms to 0.5 ms (sample rate doubled). How should the positional PID Ki be adjusted?',
        options: ['Unchanged', 'Doubled', 'Halved', 'Change Kp'],
        correct: 2,
        hint: 'Positional I term is Ki x Ts x sum(e). Halving Ts means you must also halve Ki to keep the equivalent integral gain — but a more reliable option is to leave Ki alone and switch to incremental PID.',
      },
      {
        q: 'D (derivative) is usually not added in motor control. The main reason is?',
        options: ['Hardware does not support it', 'Math is complex', 'Sampling noise gets amplified by the (e[k]-e[k-1])/Ts derivative, injecting jitter', 'Not needed'],
        correct: 2,
        hint: 'D amplifies high-frequency noise. Even when you need it for a position loop you must low-pass first. Current and speed loops are fine with PI.',
      },
    ],
  },
  'foc-flow': {
    id: 'foc-flow',
    introBeginner: {
      metaphor: 'FOC is like fitting a three-phase AC motor with a "translator". The naive way drives three-phase voltages directly and the motor sees a constantly rotating complex waveform — accurate torque control is impossible. FOC turns that complex three-phase into two stable DC quantities (Id for flux, Iq for torque), like swapping a rocking ship deck for solid ground — adjusting valves on solid ground is far easier.',
      coreIdea: 'FOC is not a single equation but a pipeline run once per PWM cycle: sample -> Clarke -> Park -> current PI -> inverse Park -> SVPWM -> output. Each stage does one thing, and faults can be localised.',
      whyCare: [
        'Without FOC, a PMSM is just open-loop guesswork; torque control is imprecise, efficiency is poor, and dynamics are bad.',
        'FOC is the industry standard for EV traction, servos, and robotic joints. Master it and you can read 90% of motor-control code.',
        'Once you understand each pipeline stage, "motor jitter" or "startup failure" can be diagnosed precisely (sampling? angle? PI? SVPWM? hardware?).',
      ],
      firstAction: 'Click the "current loop response" tab on top, drag Iq step to 5 A and watch Iq (green) chase the dashed setpoint. Then drag "angle error delta-theta" from 0 to 15 degrees and watch Id (blue) rise during the Iq step — the famous "dq cross-talk".',
    },
    learningGoals: [
      'String together sampling, Clarke, Park, the current loop, inverse Park, SVPWM, and the angle feedback.',
      'Understand the input/output of each stage of the FOC pipeline.',
      'Pin down the root causes of current-loop overshoot, oscillation, and cross-talk.',
    ],
    concepts: [
      'Each PWM cycle FOC runs one closed loop: sample currents -> compute coordinates -> run PI -> compute voltage vector -> update PWM -> wait for next feedback.',
      'Angle feedback comes from an encoder or an observer; its quality directly sets the dq decoupling quality.',
      'PI works in the dq domain (DC quantities), much simpler than controlling three-phase AC directly.',
      'Current loop bandwidth omega_bw ~ Kp / L, with Ki / Kp = R / L as a pole-zero cancellation starting point.',
    ],
    formulas: [
      { title: 'FOC pipeline', expression: 'abc → Clarke → Park → PI(Id, Iq) → inv-Park → SVPWM → bridge', explanation: 'Every stage is a pure function with clear inputs and outputs, easy to port to C / STM32 / MATLAB.' },
      { title: 'dq PMSM model', expression: 'vd = R·id + Ld·did/dt - ω·Lq·iq;  vq = R·iq + Lq·diq/dt + ω·(Ld·id + ψf)', explanation: 'dq are cross-coupled by omega x L x iq and omega x L x id; the higher the speed the stronger the coupling, so a decoupling feed-forward is added on the PI output.' },
      { title: 'Typical current-loop tuning', expression: 'Kp = ω_bw × L,  Ki = ω_bw × R', explanation: 'For 1 kHz bandwidth, Kp = 6283 x 0.0012 ~ 7.5 (in practice with 16 kHz PWM, Kp = 1 to 3 is safer). Ki/Kp = R/L cancels the zero against the pole.' },
    ],
    engineeringMeaning: [
      'With the pipeline broken out, "motor jitter" can be pinned down: sampling? angle? PI oscillation? SVPWM saturation? hardware short?',
      'Current loop bandwidth bounds the speed loop bandwidth. Typically 1 to 5 kHz for current vs 50 to 500 Hz for speed — a 10x ratio keeps things stable.',
      'Angle error delta-theta shows up directly as a bump on Id when Iq steps: this is the hands-on test for encoder zero alignment.',
    ],
    stm32Guide: [
      'Centre-aligned PWM at 16 to 20 kHz, ADC sample at the PWM midpoint (lowest current ripple), and run the full FOC chain inside the ISR.',
      'TIM1/TIM8 + ADC1/ADC2 with InjectedConv + DMA for dual sampling; the CPU only post-processes in the ISR tail (under 5 us).',
      'Write all algorithms (Clarke/Park/PI/SVPWM) as pure functions, passed by reference from main, easy to unit-test and port.',
    ],
    commonMistakes: [
      'Putting control algorithms in the UI or business layer — un-portable and un-testable.',
      'printf / HAL_Delay / floating-point division inside the ISR — the PWM period overruns.',
      'Sampling near PWM edges (heavy noise).',
      'PI without anti-windup — saturation releases into a big overshoot.',
      'Forgetting __DSB() at the ISR tail to make the CCR write visible.',
    ],
    debugMethods: [
      'Stage-by-stage freeze debug: ADC zero (ia+ib+ic ~ 0) first -> open-loop voltage vector that pulls the rotor -> close the current loop -> finally close the speed loop.',
      'Each PWM cycle log ia/ib/ic/ialpha/ibeta/id/iq/vd/vq/duty/sector over RTT or UART, cross-referenced with a function generator / scope.',
      'For current-loop overshoot first suspect too-large Kp or too much sampling delay; for steady-state error look at Ki and the limits.',
    ],
    experiments: [
      'Drag angle error delta-theta to plus/minus 15 degrees and watch Id spike at the Iq step — the physical signature of dq cross-talk.',
      'Sweep electrical frequency omega from 0 to 200 Hz and watch Iq develop "wobble" — the cross-coupling omega x L x iq feeding into vd.',
      'Push "sampling delay" from 1 to 4; at the same Kp the oscillation gets noticeably worse — delay eats phase margin.',
      'Load the "excessive oscillation" preset, halve Kp, and watch the overshoot shrink.',
    ],
    summary: 'FOC is not mathematically hard but engineering-long. Treat each stage as an independently testable pure function and the whole system stays stable.',
    nextSteps: ['Dive into SVPWM next to see how the alpha-beta voltage from inverse Park becomes six switch states plus zero vectors.'],
    codeExample: `/* ============================================
 * foc.c — FOC ISR (runs inside the 16 kHz PWM ISR)
 * Targets STM32G4 (Cortex-M4F + FPU); single pass < 6 us
 * ============================================ */
#include "foc.h"

static pi_state_t g_pi_d = { .integral = 0 };
static pi_state_t g_pi_q = { .integral = 0 };

void TIM1_UP_TIM16_IRQHandler(void) {
    if (TIM1->SR & TIM_SR_UIF) {
        TIM1->SR = ~TIM_SR_UIF;

        /* 1. sample three-phase currents (injected ADC already triggered) */
        float ia = adc_to_amps(ADC1->JDR1, g_offset.ia);
        float ib = adc_to_amps(ADC1->JDR2, g_offset.ib);
        float ic = -ia - ib;     // sum = 0, save one ADC

        /* 2. read the electrical angle (encoder/observer) */
        float theta_e = encoder_to_theta_e(
            ENCODER->CNT, g_param.encoder_zero, g_param.pole_pairs);
        float sin_t, cos_t;
        sincosf(theta_e, &sin_t, &cos_t);

        /* 3. Clarke: abc -> alpha-beta */
        float i_alpha = ia;
        float i_beta  = ONE_OVER_SQRT3 * (ia + 2.0f * ib);

        /* 4. Park: alpha-beta -> dq */
        float i_d =  cos_t * i_alpha + sin_t * i_beta;
        float i_q = -sin_t * i_alpha + cos_t * i_beta;

        /* 5. current PI (dq domain, DC quantities) */
        float v_d = pi_step(&g_pi_d, g_ref.id - i_d, g_param.kp, g_param.ki, DT);
        float v_q = pi_step(&g_pi_q, g_ref.iq - i_q, g_param.kp, g_param.ki, DT);

        /* 5b. decoupling feed-forward (recommended at high speed) */
        v_d -= 2.0f * M_PI * g_state.elec_freq * g_param.lq * i_q;
        v_q += 2.0f * M_PI * g_state.elec_freq * (g_param.ld * i_d + g_param.psi_f);

        /* 5c. circular voltage clamp (SVPWM linear region ~ Udc/sqrt(3)) */
        float v_lim = g_state.udc * ONE_OVER_SQRT3 * 0.95f;
        float v_mag = sqrtf(v_d*v_d + v_q*v_q);
        if (v_mag > v_lim) { v_d *= v_lim/v_mag; v_q *= v_lim/v_mag; }

        /* 6. inverse Park: dq -> alpha-beta */
        float v_alpha = cos_t * v_d - sin_t * v_q;
        float v_beta  = sin_t * v_d + cos_t * v_q;

        /* 7. SVPWM: alpha-beta -> three-phase duties */
        svpwm_t sv = svpwm_calc(v_alpha, v_beta, g_state.udc);

        /* 8. write CCR (effective next PWM cycle) */
        TIM1->CCR1 = (uint16_t)(sv.duty_a * TIM1->ARR);
        TIM1->CCR2 = (uint16_t)(sv.duty_b * TIM1->ARR);
        TIM1->CCR3 = (uint16_t)(sv.duty_c * TIM1->ARR);
        __DSB();
    }
}`,
    quiz: [
      {
        q: 'What is the biggest advantage of running PI in dq rather than directly on abc?',
        options: ['Less computation', 'In steady state the controlled signal is DC, so PI can drive steady-state error to zero', 'No sensor needed', 'Cheaper hardware'],
        correct: 1,
        hint: 'abc currents are AC; standard PI chasing AC always leaves steady-state phase/magnitude error. dq is DC, so PI can reach zero steady-state error.',
      },
      {
        q: 'Current-loop Kp grows until Iq overshoots 30% with ringing. The most likely cause?',
        options: ['Ki too small', 'Voltage limit too large', 'Kp has outrun the current-loop bandwidth / sample-delay product', 'Wrong motor parameters'],
        correct: 2,
        hint: 'Current-loop bandwidth omega_bw ~ Kp/L. Too-large Kp pushes omega_bw above 1/(2 x pi x delay), eating phase margin and starting oscillation.',
      },
      {
        q: 'Stepping Iq alone also pulls Id up to a peak. Most likely cause?',
        options: ['Insufficient Kp', 'Unaligned encoder zero / angle error delta-theta', 'PWM frequency too low', 'Wrong ADC sampling'],
        correct: 1,
        hint: 'An Iq command projected onto a misaligned d-axis leaks into Id. Try tuning the "angle error delta-theta" parameter to observe it.',
      },
      {
        q: 'At high speed the current loop slows down and develops wobble. What helps most?',
        options: ['Raise Kp', 'Raise Ki', 'Add dq decoupling feed-forward (vd -= omega·Lq·iq; vq += omega·(Ld·id + psi_f))', 'Lower the PWM frequency'],
        correct: 2,
        hint: 'At high speed the omega x L terms let d and q interfere; pure PI feedback is slow to correct. Feed-forward cancels the coupling directly.',
      },
      {
        q: 'Which of the following is the most dangerous in the FOC ISR?',
        options: ['Floating-point multiply-add', 'A sincosf call', 'printf or HAL_Delay', 'CCR writes'],
        correct: 2,
        hint: 'printf/Delay block for hundreds of microseconds to milliseconds; a 60 us PWM period cannot fit them and you immediately drop a cycle.',
      },
    ],
  },
  'svpwm': {
    id: 'svpwm',
    introBeginner: {
      metaphor: 'SVPWM is like colour mixing — you want any voltage vector direction, but the palette only has 8 base colours (V0 through V7 = 8 switch states). Each PWM cycle SVPWM mixes the two closest base colours plus some "white" (zero vectors) by time fractions so that the average equals the desired colour.',
      coreIdea: 'Split the alpha-beta plane into 6 sectors of a hexagon and synthesise the target Ualpha-beta in each sector with the two adjacent active vectors V_k and V_{k+1} plus zero vectors V0/V7 weighted by times T1, T2, T0.',
      whyCare: [
        'SVPWM gives about 15% more bus utilisation than SPWM and lets the motor reach higher speeds; EV traction and servos almost always use SVPWM.',
        'Six sectors plus eight switch states are the "grammar" linking the inverter to the motor — they let you read code and probe hardware in the same vocabulary.',
        'Over-modulation (m > 1.0) and sector mis-classification are common bugs; looking at the hexagon is the most intuitive way to diagnose.',
      ],
      firstAction: 'On the right slowly drag the electrical angle from 0 to 360 degrees and watch the highlighted sector on the left hexagon cycle 1 -> 2 -> 3 -> 4 -> 5 -> 6. Push modulation index to 0.95 and T0 collapses near zero; push past 1.0 to enter saturation (red badge).',
    },
    learningGoals: [
      'Understand the relationship between the six active vectors, the two zero vectors, and the six sectors.',
      'Master the math from T1 / T2 / T0 to duty cycles dutyA / B / C.',
      'Tell apart the bus-utilisation gap between SVPWM and SPWM and why it exists.',
    ],
    concepts: [
      'SVPWM does not feed three-phase sinusoids; within each PWM period it combines the two adjacent active vectors plus zero vectors so the average voltage equals the target vector.',
      'Whichever 60-degree sector the target lands in selects the two adjacent base vectors; the sector itself comes from atan2(Ubeta, Ualpha).',
      'V0(000) / V7(111) are zero vectors that hold the neutral-point voltage at zero; they are inserted to complete the period.',
    ],
    formulas: [
      { title: 'Sector determination', expression: 'sector = floor(atan2(Uβ, Uα) / 60°) + 1', explanation: 'Divide [0, 2 x pi) into six 60-degree slices; mind the sign during normalisation.' },
      { title: 'T1, T2 calculation (sector N, 0 ≤ θ-N·60° ≤ 60°)', expression: 'T1 = m·sin((N·60° - θ + 60°))·Ts\\nT2 = m·sin(θ - (N-1)·60°)·Ts\\nT0 = Ts - T1 - T2', explanation: 'm is the modulation index, Ts is the PWM period. T0 < 0 means you have entered over-modulation and need clamping.' },
      { title: 'Modulation index', expression: 'm = √3·|Uref| / Udc', explanation: 'm = 1 is the upper bound of the SVPWM linear region (sqrt(3)/2 ~ 1.155 times the utilisation of SPWM with m = 1).' },
      { title: 'Three-phase duty cycles', expression: 'Tcm = (Ts + T1 - T2)/2 etc. (per sector)\\nduty = Tc / Ts', explanation: 'For centre-aligned PWM a common "seven-segment" sequence is 000 -> 100 -> 110 -> 111 -> 110 -> 100 -> 000, which maps to the three duty cycles.' },
    ],
    engineeringMeaning: [
      'SVPWM gives about 15.5% more utilisation than SPWM (sqrt(3)/2) — same bus voltage spins the motor faster and saves on the bus capacitor.',
      'SVPWM is equivalent to SPWM with third-harmonic injection; the embedded implementation is usually the "min-max" trick (duty = sinusoidal - (max+min)/2) which only needs a single sin/cos pass.',
      'Over-modulation handling: when m > 1, scale T1/T2 proportionally so T0 stays at or above 0, or switch to six-step operation.',
    ],
    stm32Guide: [
      'Once dutyA/B/C are in [0, 1] write TIMx->CCR = (uint16_t)(duty x ARR).',
      'Centre-aligned PWM + injected ADC sequence: sample at the PWM midpoint where the current ripple is smallest.',
      'Min-max implementation in a single line: duty_a = (Valpha x k1 + offset); offset = -(max(va,vb,vc) + min(va,vb,vc))/2.',
    ],
    commonMistakes: [
      'Sector-boundary 0/360 degree normalisation (atan2 returns [-pi, pi]; add 2 x pi before dividing by 60).',
      'Failing to clamp T0 < 0 — duty cycles go crazy.',
      'Not clamping three-phase duty cycles to [0.02, 0.98] — the PWM compare cannot resolve them.',
      'Mixing up seven-segment and five-segment sequences.',
    ],
    debugMethods: [
      'Rotate Ualpha/Ubeta through a full circle and verify sectors cycle 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 1.',
      'At a low modulation index (m < 0.5) the three duties should look like smooth sinusoids plus a 1.5-times "saddle" — that is the third-harmonic shape.',
      'Probe upper-bridge PWM_A and PWM_B on a scope: they should be phase-shifted, not synchronised.',
    ],
    experiments: [
      'Load the "SVPWM sector switching" preset and slowly sweep the electrical angle to watch the six sectors light up in turn.',
      'Load the "over-modulation" preset (m > 1) to see the red saturation warning.',
      'Compare bus utilisation metrics: SVPWM 71.1% vs SPWM 82.1% at different m values.',
    ],
    summary: 'SVPWM = "split the target voltage vector among the two active vectors of its sector plus zero vectors by time". In code that becomes: pick the sector -> compute T1/T2/T0 -> compute the three duty cycles.',
    nextSteps: ['Continue to the inverter module to see how duty cycles become phase voltages and line voltages (including dead-time losses).'],
    codeExample: `/* ============================================
 * svpwm.h — SVPWM algorithm (min-max form, < 1 us per PWM ISR)
 * Target STM32 advanced timers; output range [0, 1] feeds CCR directly
 * ============================================ */

#define ONE_OVER_SQRT3   0.57735026919f

typedef struct {
    float duty_a;       // upper-bridge duty cycle [0, 1]
    float duty_b;
    float duty_c;
    uint8_t sector;     // 1-6
    uint8_t saturated;  // 1 = entered over-modulation
} svpwm_t;

/* Inputs: alpha-beta voltage command (V), bus voltage Udc (V); returns three duties */
svpwm_t svpwm_calc(float v_alpha, float v_beta, float udc) {
    svpwm_t r = { 0 };

    /* 1. min-max core: equivalent to SPWM + third-harmonic injection
     *    Va_ref = Valpha
     *    Vb_ref = -0.5 x Valpha + (sqrt(3)/2) x Vbeta
     *    Vc_ref = -0.5 x Valpha - (sqrt(3)/2) x Vbeta
     */
    const float SQRT3_2 = 0.8660254038f;
    float va = v_alpha;
    float vb = -0.5f * v_alpha + SQRT3_2 * v_beta;
    float vc = -0.5f * v_alpha - SQRT3_2 * v_beta;

    /* 2. find max/min, inject -(max+min)/2 */
    float vmax = va > vb ? (va > vc ? va : vc) : (vb > vc ? vb : vc);
    float vmin = va < vb ? (va < vc ? va : vc) : (vb < vc ? vb : vc);
    float offset = -0.5f * (vmax + vmin);

    /* 3. normalise to [0, 1] duty */
    float scale = 1.0f / udc;
    r.duty_a = 0.5f + (va + offset) * scale;
    r.duty_b = 0.5f + (vb + offset) * scale;
    r.duty_c = 0.5f + (vc + offset) * scale;

    /* 4. clamp */
    if (r.duty_a < 0.0f) { r.duty_a = 0.0f; r.saturated = 1; }
    if (r.duty_a > 1.0f) { r.duty_a = 1.0f; r.saturated = 1; }
    if (r.duty_b < 0.0f) { r.duty_b = 0.0f; r.saturated = 1; }
    if (r.duty_b > 1.0f) { r.duty_b = 1.0f; r.saturated = 1; }
    if (r.duty_c < 0.0f) { r.duty_c = 0.0f; r.saturated = 1; }
    if (r.duty_c > 1.0f) { r.duty_c = 1.0f; r.saturated = 1; }

    /* 5. also compute the sector (for diagnostics/visualisation) */
    float angle = atan2f(v_beta, v_alpha);
    if (angle < 0) angle += 2.0f * M_PI;
    r.sector = (uint8_t)(angle * (3.0f / M_PI)) + 1;
    if (r.sector > 6) r.sector = 6;

    return r;
}

/* Usage (FOC ISR tail):
 *   svpwm_t s = svpwm_calc(v_alpha, v_beta, g_state.udc);
 *   TIM1->CCR1 = (uint16_t)(s.duty_a * (TIM1->ARR + 1));
 *   TIM1->CCR2 = (uint16_t)(s.duty_b * (TIM1->ARR + 1));
 *   TIM1->CCR3 = (uint16_t)(s.duty_c * (TIM1->ARR + 1));
 */`,
    quiz: [
      {
        q: 'The bus-utilisation advantage of SVPWM over SPWM is roughly?',
        options: ['No difference', 'About 15%', '50%', '100%'],
        correct: 1,
        hint: 'SPWM linear region m_max ~ 1, corresponding to 0.5 x Udc peak output. SVPWM m_max ~ 1 corresponds to Udc/sqrt(3) peak — sqrt(3)/2 ~ 1.155 times bigger, i.e., about 15.5%.',
      },
      {
        q: 'Hexagon vertex V1 corresponds to which upper-bridge switch state?',
        options: ['000', '100', '110', '111'],
        correct: 1,
        hint: 'V1 = (100) means A high, B low, C low. V2(110), V3(010), V4(011), V5(001), V6(101); V0(000) and V7(111) are zero vectors.',
      },
      {
        q: 'When the modulation index m > 1.0 ("over-modulation") what happens in hardware?',
        options: ['Nothing', 'In some PWM cycles T0 < 0 gets clamped to 0, distorting the output nonlinearly', 'PWM shuts off', 'ADC errors'],
        correct: 1,
        hint: 'T0 < 0 is physically impossible (the zero vector cannot last for a negative time). The code clamps it to 0 so T1+T2 = Ts; the output distorts and current harmonics rise.',
      },
      {
        q: 'Why is SVPWM equivalent to "SPWM with third-harmonic injection"?',
        options: ['Coincidence', 'The min-max offset injection is exactly the third harmonic of the phase voltage; it sums to zero across phases and does not change line voltages', 'Historical accident', 'For easier programming'],
        correct: 1,
        hint: 'The third harmonic is in phase across all three phases; adding it to each duty does not change line voltages but lets the neutral-point voltage swing so usable phase-voltage range grows — that is the 15% utilisation gain.',
      },
      {
        q: 'For centre-aligned PWM with injected ADC trigger and seven-segment SVPWM, why is the midpoint the best sampling instant?',
        options: ['Hardware requirement', 'The midpoint is the steady region right after switching has settled, so ripple is minimal', 'To reduce code size', 'Lower reactive consumption'],
        correct: 1,
        hint: 'Centre-aligned counter reaching ARR triggers injected ADC, at which point all bridges are stable in the same switch combination — current ripple is at its minimum, while sampling near a switching edge picks up huge noise.',
      },
    ],
  },
  'inverter': {
    id: 'inverter',
    introBeginner: {
      metaphor: 'The inverter is like an array of six relay switches arranged in three pairs that take turns to chop the DC bus into the desired AC phase voltage. The trick is to keep the switches from blowing up (dead-time prevents shoot-through where upper and lower switch are on at the same time) while also compensating for the distortion that dead-time introduces.',
      coreIdea: 'Six MOSFETs or IGBTs grouped in three pairs; upper and lower switches in each pair are complementary; duty cycle sets the average phase voltage; dead-time is a necessary protection but distorts the low-speed voltage.',
      whyCare: [
        'Without correct PWM + dead-time setup, no matter how good the FOC algorithm is, you will blow MOSFETs.',
        'Dead-time loss is most visible at low speed and small current — a common cause of "low-speed whine" and "waveform glitches".',
        'STM32 advanced timers (TIM1/TIM8) with complementary outputs, dead-time, and brake inputs are the industrial-grade hardware backbone of motor control — be fluent with them.',
      ],
      firstAction: 'Drag dead-time from 1 us to 4 us on the right and watch obvious notches appear at the top of the phase voltage (dead-time loss grows). Then drop PWM frequency from 16 kHz to 4 kHz and watch dead-time take a larger fraction of each cycle and amplify the loss.',
    },
    learningGoals: [
      'Get familiar with the three-phase bridge, complementary upper/lower switches, and dead-time.',
      'Understand the conversion from duty cycle to phase voltage to line voltage.',
      'Recognise dead-time distortion, over-modulation, and shoot-through risk.',
    ],
    concepts: [
      'A three-phase bridge has six switches in three pairs (phases A/B/C); upper and lower are complementary. Both on simultaneously is a shoot-through short.',
      'Dead-time td: after the upper switch turns off, wait td before turning on the lower one; typical values are 0.5 to 3 us.',
      'Average phase voltage Va = (Da - 0.5) x Udc; line voltage Vab = Va - Vb.',
      'Dead-time loss delta-V ~ td x f_pwm x Udc and depends on the sign of the phase current.',
    ],
    formulas: [
      { title: 'Average phase voltage (ideal)', expression: 'Va = (Da - 0.5) × Udc', explanation: 'Da is the upper-bridge duty in [0,1], referenced to the bus midpoint. Da=0.5 -> Va=0; Da=1 -> Va=+Udc/2.' },
      { title: 'Dead-time loss', expression: 'ΔV_dt = td × fpwm × Udc × sign(Iphase)', explanation: 'When current flows into the motor the upper switch is "shortchanged" by td; flowing out it is the lower switch. Loss scales with dead-time and frequency.' },
      { title: 'Over-modulation threshold', expression: '|Vphase| > 0.5 × Udc → some PWM cycles clamp at 0 or 1', explanation: 'Single-phase amplitude in the SVPWM linear region is ~ Udc/sqrt(3) ~ 0.577 x Udc; pushing past it clamps duty cycles.' },
      { title: 'Dead-time compensation', expression: 'Va_cmd = Va_ref + ΔV_dt × sign(Ia)', explanation: 'Pre-compensate by adding delta-V_dt to the PWM command; compensation is inaccurate near current zero-crossings (sign flips), so additional damping is needed there.' },
    ],
    engineeringMeaning: [
      'Dead-time is the cost of protection. Too large td distorts at low speed; too small invites shoot-through. Pick values based on driver and switch datasheets.',
      'Hardware protection: brake input (BKIN) + over-current comparator (COMP) disable PWM; software interrupt provides backup.',
      'Phase-voltage scaling (Vphase / Udc) in the motor parameters must match the inverter topology — star phase voltage and line voltage differ by sqrt(3).',
    ],
    stm32Guide: [
      'TIM1/TIM8 advanced-timer complementary PWM: CCxE = 1, CCxNE = 1; dead-time lives in the BDTR.DTG register (step size in the reference manual).',
      'Connect brake BKIN to the over-current comparator (COMP); on a trigger the hardware kills all PWM, no CPU needed.',
      'Debug order: first power only the inverter (no motor) to verify complementary PWM + dead-time; then attach a motor at 12 V; then move to 48 V bus.',
    ],
    commonMistakes: [
      'Forgetting to enable the polarity of the complementary output (CCxNE).',
      'Dead-time too large (> 5 us) — severe low-speed waveform distortion and whining.',
      'No hardware over-current protection — software cannot react in time.',
      'PWM duty not initialised to 0.5 at power-up, causing an in-rush at the bus.',
    ],
    debugMethods: [
      'First, capture upper-side PWM_A and lower-side PWM_A with a logic analyser to confirm complementary outputs and measure td.',
      'Probe phase voltage on a scope (with the motor disconnected, look directly at the half-bridge midpoint); it should be a clean square wave.',
      'Attach the motor at low voltage (12 V); probe three-phase currents and they should be symmetric sinusoids; asymmetry hints at dead-time compensation or ADC offset issues.',
    ],
    experiments: [
      'Compare dead-time 0.5 us vs 4 us and observe how deep the notch on the line voltage gets.',
      'Compare PWM 4 kHz vs 32 kHz to see how the dead-time fraction of a cycle affects distortion.',
      'Push duty to 0.95 to see the distortion entering over-modulation.',
    ],
    summary: 'The inverter is the power bridge from algorithm to real motor. The ideal model is clean, but dead-time / over-current / shoot-through protection are non-negotiable engineering details.',
    nextSteps: ['Move to the three-loop module to see how current, speed, and position loops cascade commands to the inverter.'],
    codeExample: `/* ============================================
 * inverter_init.c — STM32G4 TIM1 three-phase complementary + dead-time + brake
 * ============================================ */

#define PWM_FREQ_HZ      16000
#define DEAD_TIME_NS     1000      // 1 us, tune per driver datasheet
#define APB2_CLOCK_HZ    170000000 // G4 main clock

void inverter_pwm_init(void) {
    /* 1. TIM1 clock */
    RCC->APB2ENR |= RCC_APB2ENR_TIM1EN;

    /* 2. Centre-aligned PWM, ARR = clock / freq / 2 (centre-aligned counts up and down) */
    TIM1->PSC = 0;
    TIM1->ARR = APB2_CLOCK_HZ / PWM_FREQ_HZ / 2 - 1;
    TIM1->CR1 |= TIM_CR1_CMS_0;     // centre-aligned mode 1 (compare update on up-counting)

    /* 3. PWM mode 1 on three channels + complementary outputs */
    TIM1->CCMR1 |= (6 << TIM_CCMR1_OC1M_Pos) | TIM_CCMR1_OC1PE;
    TIM1->CCMR1 |= (6 << TIM_CCMR1_OC2M_Pos) | TIM_CCMR1_OC2PE;
    TIM1->CCMR2 |= (6 << TIM_CCMR2_OC3M_Pos) | TIM_CCMR2_OC3PE;
    TIM1->CCER  |= TIM_CCER_CC1E | TIM_CCER_CC1NE
                 | TIM_CCER_CC2E | TIM_CCER_CC2NE
                 | TIM_CCER_CC3E | TIM_CCER_CC3NE;

    /* 4. Dead-time + main output enable (BDTR)
     *    DTG[7:5]=0xx -> DT = DTG x tCK_INT
     *    1 us @ 170 MHz -> DTG ~ 170 (0xAA) */
    uint32_t dtg = (uint32_t)((uint64_t)DEAD_TIME_NS * APB2_CLOCK_HZ / 1000000000ULL);
    if (dtg > 127) dtg = 127;       // simple cap; longer requires the higher-order encoding
    TIM1->BDTR = TIM_BDTR_MOE | (dtg & 0xFF);

    /* 5. Brake BKIN (wired to the over-current comparator output, falling-edge trigger) */
    TIM1->BDTR |= TIM_BDTR_BKE | TIM_BDTR_BKP;

    /* 6. Initial 50% duty to avoid in-rush at power-up */
    TIM1->CCR1 = TIM1->ARR / 2;
    TIM1->CCR2 = TIM1->ARR / 2;
    TIM1->CCR3 = TIM1->ARR / 2;

    /* 7. Interrupt (update event also triggers injected ADC) */
    TIM1->DIER |= TIM_DIER_UIE;
    NVIC_SetPriority(TIM1_UP_TIM16_IRQn, 0);
    NVIC_EnableIRQ(TIM1_UP_TIM16_IRQn);

    /* 8. Start */
    TIM1->CR1 |= TIM_CR1_CEN;
}

/* Writing CCR in the ISR:
 *   TIM1->CCR1 = (uint16_t)(duty_a * (TIM1->ARR + 1));
 * After BKIN MOE=0 forces every PWM low without CPU intervention.
 */`,
    quiz: [
      {
        q: 'What happens if upper and lower switches on the same phase turn on simultaneously?',
        options: ['Normal operation', 'Shoot-through short, switches blow instantly', 'Just wrong output', 'Protection kicks in automatically'],
        correct: 1,
        hint: 'Both on at once = bus directly to ground through two switches — a transient short with millisecond-scale failure. Dead-time exists exactly to prevent this.',
      },
      {
        q: 'Dead-time td = 2 us, PWM 16 kHz, duty 50%. What fraction of one cycle is "lost" conduction time?',
        options: ['About 0.4%', 'About 3.2%', 'About 32%', 'About 50%'],
        correct: 1,
        hint: 'Period 62.5 us, dead-time 2 us = 3.2%. At low speed and small current this voltage loss is significant.',
      },
      {
        q: 'What does the BKIN brake input on STM32 advanced timer TIM1 do?',
        options: ['Starts PWM', 'Hardware kills all PWM outputs immediately, no CPU intervention', 'Changes frequency', 'Resets the timer'],
        correct: 1,
        hint: 'On over-current the comparator output reaches BKIN; the MOE register clears automatically and all PWM go low. The CPU interrupt only handles after-the-fact reporting.',
      },
      {
        q: 'A motor whines at low speed and small current. The most likely root cause?',
        options: ['Kp too high', 'Excessive dead-time causing low-speed voltage distortion', 'PWM frequency too low', 'Encoder resolution insufficient'],
        correct: 1,
        hint: 'Dead-time loss delta-V scales with td x f_pwm; voltage distortion is worst near current zero-crossings. Shorten dead-time or add dead-time compensation.',
      },
      {
        q: 'Power-up causes a large in-rush at the bus. Reviewing the code, what is the safest initial PWM CCR value?',
        options: ['0', 'ARR (= 100%)', 'ARR/2 (= 50%)', 'Anything'],
        correct: 2,
        hint: 'CCR=0 leaves upper closed and lower open; current flows from low side through the windings to ground without a voltage difference. The safest is ARR/2 (50%) so that all three phase midpoints sit at Udc/2 and there is no inter-phase voltage.',
      },
    ],
  },
  'control-loops': {
    id: 'control-loops',
    introBeginner: {
      metaphor: 'Three nested loops are like Russian dolls: position loop ("I want to reach the 3rd floor") -> speed loop (the elevator accelerates then decelerates) -> current loop (the motor torque). The outer loop tells the inner what to change, the inner executes quickly. The outer loop must always be slower; otherwise it fights to give orders.',
      coreIdea: 'Three-level cascade: position -> issues speed command -> speed loop -> issues current command -> current loop -> issues voltage command. Bandwidth grows from outer to inner (5 to 10x at each layer); tuning order goes inner-to-outer.',
      whyCare: [
        'Servos, robotic joints, and CNC all use three-loop architecture. Less than three is too slow; more is meaningless.',
        '"Tune the speed loop before the current loop is even ready" is the most common newbie trap — if the inner loop is unstable, no amount of outer tuning will save you.',
        'A 5 to 10x bandwidth gap between inner and outer is a rule of thumb; violate it and you either oscillate or have unusably slow response.',
      ],
      firstAction: 'On the right slowly push position-loop Kp from 3.5 to 12 and watch the motor go from smoothly reaching the target to "overshoot, bounce, overshoot again". Then push speed-loop Kp from 0.08 to 0.4 and watch high-frequency oscillation — both loops over-driven.',
    },
    learningGoals: [
      'Understand the hierarchy of current, speed, and position loops.',
      'Master the physical reason for "inner fast, outer slow".',
      'Learn the inner-to-outer tuning order.',
    ],
    concepts: [
      'The current loop is innermost and controls torque directly; bandwidth 1 to 5 kHz. The speed loop sits in the middle, outputting an Iq reference; bandwidth 100 to 500 Hz. The position loop is outermost, outputting a speed reference; bandwidth 10 to 50 Hz.',
      'Outer bandwidth must be much smaller than inner (5 to 10x); otherwise the outer commands change faster than the inner can follow and they fight.',
      'Every loop output must be clamped (current limit, speed limit, acceleration limit).',
    ],
    formulas: [
      { title: 'Three-loop cascade structure', expression: 'position PID → speed PI → current PI → inv-Park → SVPWM → bridge', explanation: 'Each layer outputs the reference for the next; execution frequency decreases outward (current at PWM frequency, speed at 1 to 2 kHz, position at 100 to 500 Hz).' },
      { title: 'Current-loop bandwidth estimate', expression: 'ω_bw_i ≈ Kp / L', explanation: 'Kp is the current-PI proportional gain, L is the inductance. 1 kHz bandwidth corresponds to Kp ~ 7.5 (with L = 1.2 mH).' },
      { title: 'Speed-loop bandwidth match', expression: 'ω_bw_s ≤ ω_bw_i / (5~10)', explanation: 'A 1 kHz current loop means at most 100 to 200 Hz on the speed loop; any faster and it starts oscillating.' },
      { title: 'Position loop + feed-forward', expression: 'Vref = Kp_p·(Pref-P) + Vref_ff', explanation: 'The position loop outputs a speed reference; adding an acceleration feed-forward Vref_ff directly to the current reference greatly improves tracking accuracy.' },
    ],
    engineeringMeaning: [
      'Industrial servos must distinguish the three layers. CNC machining, robotic joints, and variable-speed compressors all rely on this architecture.',
      'Inner bandwidth sets the upper limit. A larger inductance lowers bandwidth, which forces the outer loop to be even slower; consider this when choosing motor and drive.',
      'Feed-forward dramatically improves tracking accuracy. Velocity and acceleration feed-forward are common in servos and bring position-loop steady-state error close to zero.',
    ],
    stm32Guide: [
      'Run the current loop in the PWM ISR (16 to 20 kHz), the speed loop in a 1 to 2 kHz software timer, and the position loop at 100 to 500 Hz.',
      'Clamp every loop output immediately (current below IMAX, speed below SPMAX, acceleration below AMAX).',
      'For debugging log position reference, actual position, speed reference, actual speed, Iq reference, and actual Iq over RTT or scope and compare six traces.',
    ],
    commonMistakes: [
      'Tuning the outer loop before the inner is settled.',
      'Same frequency and same high bandwidth for inner and outer — guaranteed oscillation.',
      'Outer loop output not clamped — current command jumps past the motor capability instantly.',
      'Ignoring mechanical inertia J and using rule-of-thumb gains.',
    ],
    debugMethods: [
      'Strict tuning order: current loop -> speed loop -> position loop.',
      'Current loop: step Iq, observe rise time and overshoot.',
      'Speed loop: lock position-loop output (or run open-loop), inject a small speed step, observe tracking.',
      'Position loop: tune last, with a slow ramp rather than a step.',
    ],
    experiments: [
      'Push position-loop Kp to 12 and watch overshoot and ringing.',
      'Push speed-loop Kp to 0.4 with current-loop Kp = 2 and watch the combined oscillation.',
      'Push load torque from 0.08 to 0.5 and watch steady-state error and current headroom.',
    ],
    summary: 'Three loops is not "more loops are stronger" but "each layer must be faster and more strictly clamped than the next outer layer". Tuning is discipline, not magic.',
    nextSteps: ['Continue to sensorless FOC: where does the angle come from when there is no encoder?'],
    codeExample: `/* ============================================
 * triple_loop.c — three-loop cascade scheduling
 * Each loop runs at its own frequency
 * ============================================ */
#include "pi.h"

/* Three PI controllers */
static pi_t pi_iq;          // current loop (16 kHz)
static pi_t pi_speed;       // speed loop (2 kHz)
static pi_t pi_position;    // position loop (200 Hz)

/* References and limits */
static float ref_position_deg;
static float ref_speed_rpm;
static float ref_iq_a;

/* System limits */
#define IQ_MAX_A          8.0f
#define SPEED_MAX_RPM     5000.0f
#define ACCEL_MAX_RPMS    20000.0f      // rpm/s

void triple_loop_init(void) {
    /* current loop: high bandwidth, same frequency as PWM */
    pi_init(&pi_iq, 1.6f, 220.0f, 1.0f/16000.0f, -IQ_MAX_A * 4.0f, IQ_MAX_A * 4.0f);
    /* speed loop: 1/8 of inner, 2 kHz */
    pi_init(&pi_speed, 0.08f, 0.8f, 1.0f/2000.0f, -IQ_MAX_A, IQ_MAX_A);
    /* position loop: 1/10 of speed, 200 Hz */
    pi_init(&pi_position, 3.5f, 0.2f, 1.0f/200.0f, -SPEED_MAX_RPM, SPEED_MAX_RPM);
}

/* PWM ISR (16 kHz) - only the current loop */
void TIM1_UP_IRQHandler(void) {
    float v_q = pi_step(&pi_iq, ref_iq_a, g_state.iq);
    /* ... inverse Park, SVPWM ... */
}

/* Software timer (2 kHz) - speed loop */
void speed_loop_tick(void) {
    /* speed ramp to avoid step jumps in the current command */
    static float ref_speed_lim = 0;
    float dv = ref_speed_rpm - ref_speed_lim;
    float dv_max = ACCEL_MAX_RPMS / 2000.0f;
    if (dv >  dv_max) dv =  dv_max;
    if (dv < -dv_max) dv = -dv_max;
    ref_speed_lim += dv;

    ref_iq_a = pi_step(&pi_speed, ref_speed_lim, g_state.speed_rpm);
}

/* Software timer (200 Hz) - position loop */
void position_loop_tick(void) {
    ref_speed_rpm = pi_step(&pi_position, ref_position_deg, g_state.position_deg);
}

/* === Tuning steps ===
 * 1. Force the outer loops (speed, position) to zero output or open-loop;
 *    run only the current loop. Step Iq (1A->3A), tune Kp until oscillation,
 *    take 0.5 of that.
 * 2. Enable the speed loop with position output still zero; step a small speed
 *    (100->500 rpm) and tune speed Kp for fast yet non-oscillating response.
 * 3. Enable the position loop; ramp a position target and tune position Kp.
 */`,
    quiz: [
      {
        q: 'What is the correct order for tuning three-loop control?',
        options: ['position -> speed -> current', 'speed -> position -> current', 'current -> speed -> position', 'Any order'],
        correct: 2,
        hint: 'Inner to outer. If the inner is unstable, no amount of outer tuning helps — the outer is just sending commands to an unreliable inner.',
      },
      {
        q: 'Current-loop bandwidth is 1 kHz. The most stable choice for speed-loop bandwidth?',
        options: ['Also 1 kHz', '500 Hz', '100 to 200 Hz', '5 kHz'],
        correct: 2,
        hint: 'Outer bandwidth = inner / 5 to 10. 1 kHz inner -> 100 to 200 Hz outer is most stable; equal or faster oscillates.',
      },
      {
        q: 'Position-loop output is not clamped. What happens on a large position step?',
        options: ['Reaches the target normally', 'Speed command jumps to thousands of rpm, beyond motor capability', 'Current drops', 'Position loop stops'],
        correct: 1,
        hint: 'Kp_p x large error = large speed command, possibly exceeding max motor speed -> speed loop sends large Iq -> hits current limit or trips. Clamp every loop output.',
      },
      {
        q: 'What does servo-motor acceleration feed-forward do?',
        options: ['Nothing', 'Sends the current required for the ideal acceleration straight to the current loop, easing the position/speed loops and improving tracking accuracy', 'Protects hardware', 'Reduces noise'],
        correct: 1,
        hint: 'Feedback control corrects after the fact; feed-forward predicts. When the trajectory is known, feed-forward Iq_ff = J x d(omega)/dt straight to the current reference and tracking accuracy jumps.',
      },
      {
        q: 'Mechanical inertia J quadruples. How should the speed-loop Kp roughly change?',
        options: ['Unchanged', 'Quadruple', 'Quarter', 'Any value'],
        correct: 1,
        hint: 'The speed loop sees a plant gain inverse to J (same Iq gives less acceleration). To keep closed-loop bandwidth constant Kp must also scale by the same factor.',
      },
    ],
  },
  'sensorless-foc': {
    id: 'sensorless-foc',
    introBeginner: {
      metaphor: 'Sensorless FOC is like echolocation in the dark — without an encoder (no eyes), you "listen" to the back-EMF to figure out where the rotor is. Loud echo (high speed) is clear; small echo (low speed) is buried in noise, so you have to blind-push for a while (open-loop start) until the echo emerges, then close the loop.',
      coreIdea: 'Sensorless does not mean "no angle" — it estimates the angle from voltage, current, and the motor model. At low speed the back-EMF is small and estimation is unreliable; at high speed accuracy is good. Common scheme: open-loop start -> back-EMF observer -> PLL to lock the angle.',
      whyCare: [
        'Fans, pumps, compressors, and home appliances use sensorless FOC (saves an encoder = saves cost and simplifies the structure).',
        '"Motor will not turn", "low-speed lock-out", and "jitter at the switch instant" almost all trace back to angle estimation quality.',
        'Understanding BEMF and PLL is why fan vendors say "you must open-loop spin for 1 second on startup".',
      ],
      firstAction: 'On the right drag speed from 450 rpm to 2000 rpm and watch the "PLL lock" plot on the left: estimated angle (blue) goes from lagging real angle (green) by a lot to almost overlapping. The "BEMF alpha-beta" waveform below grows in amplitude — louder echo, sharper location.',
    },
    learningGoals: [
      'Tell apart sensored FOC and sensorless FOC.',
      'Understand the working principle of the back-EMF observer and PLL.',
      'Learn the engineering recipe of "open-loop start -> handoff to closed loop".',
    ],
    concepts: [
      'BEMF = Ke x omega is proportional to speed. At low speed the BEMF is small and the Rs/Ls parameter errors plus ADC noise dominate, making estimation unreliable.',
      'PLL (Phase-Locked Loop) drives a PI to track the measured angle, providing a smooth filtered angle.',
      'Engineering recipe: open-loop V/f drags the motor to the target speed (typical 30-50% rated) -> wait for observer confidence -> smoothly hand off to closed loop.',
    ],
    formulas: [
      { title: 'Back-EMF observation', expression: 'eα = vα − R·iα − L·diα/dt\\neβ = vβ − R·iβ − L·diβ/dt', explanation: 'Subtract resistive and inductive drops from the alpha-beta voltage; what is left is the BEMF. Wrong Rs/Ls directly hurts accuracy.' },
      { title: 'Angle extraction', expression: 'θ_est = atan2(eα, −eβ)', explanation: 'The BEMF vector leads the rotor flux by 90 degrees; atan2 plus a 90-degree correction recovers the electrical angle.' },
      { title: 'PLL locking', expression: 'Δθ = sin(θ_meas − θ_est)\\nω_est = Kp·Δθ + ∫(Ki·Δθ)dt\\nθ_est ← θ_est + ω_est·dt', explanation: 'A PI chases the phase difference. Higher Kp/Ki at low speed speeds up convergence but also injects more jitter.' },
      { title: 'SMO (sliding-mode observer)', expression: 'di_est/dt = (1/L)·(v − R·i_est − Z·sign(i_est − i_meas))', explanation: 'The sliding equivalent-control term Z x sign(...) after low-pass filtering approximates the BEMF. Robust but chatters.' },
    ],
    engineeringMeaning: [
      'At low speed the BEMF signal is smaller than the noise — open-loop start is mandatory. 500 rpm is a common empirical threshold.',
      'Inaccurate Rs/Ls -> biased BEMF estimate -> constant angle offset. Production lines must do parameter identification.',
      'Load step changes (open-to-closed-loop handoff, sudden load) can temporarily de-lock the PLL — need a health check that automatically falls back to open loop.',
    ],
    stm32Guide: [
      'Discretise with forward Euler (Ts = PWM period); use Tustin for higher-bandwidth cases.',
      'L x di_alpha/dt is (i_alpha[k] - i_alpha[k-1]) / Ts, but apply a Butterworth low-pass first to suppress high-frequency noise.',
      'Power-up sequence: 1) align the d-axis -> 2) open-loop V/f drag -> 3) monitor PLL convergence (angle error below 5 degrees for 20 ms) -> 4) close the loop.',
    ],
    commonMistakes: [
      'Closing the loop at low speed — BEMF too small, PLL cannot lock, motor jitters or even reverses.',
      'Observer gains too high -> angle jitter amplified into current-loop noise.',
      'No PLL health check; under fault the controller keeps using a bad estimated angle and blows switches.',
      'Open-loop V/f startup voltage too high or too low — the motor desyncs.',
    ],
    debugMethods: [
      'Temporarily fit an encoder and compare estimated vs real angle, plot the error curve.',
      'Inspect BEMF alpha-beta — they should be symmetric sinusoids. Distortion means bad Rs/Ls or dead-time compensation.',
      'Load step: measure PLL recovery time (should be under 50 ms); slow recovery means too-low Kp/Ki.',
    ],
    experiments: [
      'Sweep speed 450 to 2000 rpm and watch how PLL locking quality changes.',
      'Push the "noise" parameter from 0.08 to 0.5 and watch angle estimation jitter grow.',
      'Double PLL Kp/Ki and watch BEMF noise propagate straight into the angle estimate.',
    ],
    summary: 'The core of sensorless FOC is "angle confidence management" — knowing when to trust the estimate and when to fall back to open loop. Algorithms are just one piece.',
    nextSteps: ['Continue to field weakening — at high speed sensorless, how do we trade voltage headroom for more speed.'],
    codeExample: `/* ============================================
 * smo_pll.c — sliding-mode observer + PLL lock
 * Simplified teaching version; production needs parameter ID + health check
 * ============================================ */
typedef struct {
    /* motor parameters */
    float rs;       // Ohm
    float ls;       // H
    float ke;       // V*s/rad

    /* SMO state */
    float i_alpha_est, i_beta_est;
    float z_alpha_filtered, z_beta_filtered;  // equivalent BEMF
    float smo_gain;
    float lpf_alpha;     // LPF coefficient = Ts*wc / (1+Ts*wc)

    /* PLL state */
    float pll_kp, pll_ki;
    float pll_integral;
    float omega_est;     // rad/s
    float theta_est;     // rad
} sensorless_t;

static inline float sat_unit(float x) { return x > 1.0f ? 1.0f : (x < -1.0f ? -1.0f : x); }

void sensorless_step(sensorless_t *s,
                     float v_alpha, float v_beta,
                     float i_alpha_meas, float i_beta_meas,
                     float dt)
{
    /* 1. SMO: current model + equivalent control term */
    float di_alpha = (v_alpha - s->rs * s->i_alpha_est) / s->ls;
    float di_beta  = (v_beta  - s->rs * s->i_beta_est)  / s->ls;

    /* Equivalent BEMF term: sat replaces sign to smooth chattering */
    float err_a = sat_unit((s->i_alpha_est - i_alpha_meas) * 5.0f);
    float err_b = sat_unit((s->i_beta_est  - i_beta_meas)  * 5.0f);
    float z_alpha = -s->smo_gain * err_a;
    float z_beta  = -s->smo_gain * err_b;

    s->i_alpha_est += (di_alpha + z_alpha / s->ls) * dt;
    s->i_beta_est  += (di_beta  + z_beta  / s->ls) * dt;

    /* 2. Low-pass to remove chattering and obtain a smooth BEMF */
    s->z_alpha_filtered += s->lpf_alpha * (z_alpha - s->z_alpha_filtered);
    s->z_beta_filtered  += s->lpf_alpha * (z_beta  - s->z_beta_filtered);

    /* 3. PLL lock: delta-theta = sin(theta_meas - theta_est)
     *    Avoid atan2 jitter by using the sin-error form */
    float sin_dtheta = -s->z_beta_filtered  * cosf(s->theta_est)
                       -s->z_alpha_filtered * sinf(s->theta_est);
    /* Normalise to [-1, 1] by dividing by the BEMF magnitude */
    float bemf_amp = sqrtf(s->z_alpha_filtered * s->z_alpha_filtered
                         + s->z_beta_filtered  * s->z_beta_filtered) + 1e-6f;
    sin_dtheta /= bemf_amp;
    sin_dtheta = sat_unit(sin_dtheta);

    /* PI lock */
    s->pll_integral += s->pll_ki * sin_dtheta * dt;
    s->omega_est = s->pll_kp * sin_dtheta + s->pll_integral;

    /* Integrate angle */
    s->theta_est += s->omega_est * dt;
    if (s->theta_est >  M_PI) s->theta_est -= 2.0f * M_PI;
    if (s->theta_est < -M_PI) s->theta_est += 2.0f * M_PI;
}

/* Health check (run in a slow task in the main loop):
 *   - BEMF magnitude below threshold -> fall back to open loop
 *   - |delta-theta| above threshold for 20 ms -> fall back to open loop
 *   - estimated omega_est versus command speed deviates too much -> raise alarm
 */`,
    quiz: [
      {
        q: 'Why does sensorless FOC always need an "open-loop start" stage?',
        options: ['Hardware requirement', 'At low speed the BEMF is buried in noise and the angle cannot be estimated', 'To make the user wait patiently', 'To save cost'],
        correct: 1,
        hint: 'BEMF = Ke x omega is proportional to speed. Below ~500 rpm the BEMF is almost zero and only the Rs/Ls error and ADC noise remain — the angle cannot be recovered. Use open-loop V/f to drag the motor up first.',
      },
      {
        q: 'In the BEMF observation formula e = v - R*i - L*di/dt, which parameter error most easily causes an angle offset?',
        options: ['v', 'R', 'L', 'None affect it'],
        correct: 1,
        hint: 'R multiplies the current directly, so the error propagates straight to BEMF. L affects the di/dt term and is weaker when current changes are small. Production parameter ID always starts with Rs.',
      },
      {
        q: 'The side effect of raising Kp/Ki in the PLL?',
        options: ['No effect', 'Faster lock but amplified angle jitter (noise propagates through PI straight to theta)', 'Lower bandwidth', 'De-lock'],
        correct: 1,
        hint: 'Higher PI gains track faster but also amplify input-side noise (BEMF estimation jitter). Particularly sensitive at low speed with high noise — needs a compromise.',
      },
      {
        q: 'Why must the SMO equivalent-control term be low-pass filtered?',
        options: ['Hardware requirement', 'The sign() switching function chatters at high frequency; filtering it out yields a smooth BEMF', 'Saves computation', 'Corrects Rs'],
        correct: 1,
        hint: 'SMO forces the estimated current to converge to the measured current via sign(error). This switching chatters at sampling frequency, so the low-pass extracts the BEMF average that we use for angle information.',
      },
      {
        q: 'Best criterion for handing off from open-loop to closed-loop?',
        options: ['Wait 1 second', 'BEMF magnitude above threshold + PLL angle error below 5 degrees for 20 ms', 'Detect current is steady', 'Speed command reached'],
        correct: 1,
        hint: 'The handoff condition should be based on "estimation quality" — sufficient BEMF SNR + PLL stably locked for a while. A pure timer is not enough; a startup desync may have lost the motor altogether.',
      },
    ],
  },
  'field-weakening': {
    id: 'field-weakening',
    introBeginner: {
      metaphor: 'Field weakening is like an automatic gearbox on a car — low gear (1st) gives big torque but a low speed ceiling; at high speed you shift to 4th, torque drops but the car goes faster. In a motor the "gear" is not mechanical but electrical: injecting negative Id weakens the permanent-magnet flux so back-EMF drops and the inverter has voltage headroom again.',
      coreIdea: 'At high speed BEMF = Ke x omega approaches the bus-voltage ceiling, the current loop runs out of voltage and saturates. Injecting -Id weakens the effective flux -> BEMF drops -> voltage headroom returns -> the motor can spin faster (at the cost of torque).',
      whyCare: [
        'EV traction, servo spindles, and compressors that need high speed all use field weakening — without it the BEMF hits the bus and the motor will not spin up.',
        '"My voltage is maxed and current is added but speed will not climb" is 99% missing field weakening.',
        'Weakening and demagnetisation are one step apart; too much negative Id damages the magnet, so the engineering limit must be strict.',
      ],
      firstAction: 'On the right push target speed from 4200 rpm to 8000 rpm and watch the red "voltage saturated" warning light up. Then drag Id to -3 A and watch the red ellipse (voltage limit) grow; push to -5 A and the warning clears — you are in a safe operating region.',
    },
    learningGoals: [
      'Understand why high speed needs field weakening.',
      'Master the geometry of the current limit circle, voltage limit ellipse, and the Id/Iq operating point.',
      'Tell apart constant-torque, constant-power, MTPA, and MTPV regions.',
    ],
    concepts: [
      'Current limit circle: |I| = sqrt(Id^2 + Iq^2) below I_max. A hard current limit.',
      'Voltage limit ellipse: sqrt(Vd^2 + Vq^2) below Udc/sqrt(3). Higher frequency makes the ellipse flatter (its centre shifts toward -Id).',
      'The operating point must lie inside both curves simultaneously. At low speed the current circle is small and hits first; at high speed the voltage ellipse shrinks and hits first.',
      'Field weakening slides the operating point along -Id so it lands inside the smaller voltage ellipse.',
    ],
    formulas: [
      { title: 'PMSM steady-state voltage (dq)', expression: 'Vd = R·Id − ω·Lq·Iq\\nVq = R·Iq + ω·(Ld·Id + ψf)', explanation: 'At high speed R x I terms are much smaller than the omega x L terms; voltage is dominated by "back-EMF + cross coupling".' },
      { title: 'Voltage magnitude', expression: '|V| = √(Vd² + Vq²) ≤ V_max = Udc/√3', explanation: 'V_max is the SVPWM linear-region cap. Going over leads to over-modulation and the current loop loses control.' },
      { title: 'BEMF cancellation (field-weakening condition)', expression: '−ω·Ld·Id ≈ ω·ψf', explanation: 'Negative Id shrinks the effective flux psi_f + Ld x Id, dropping the back-EMF and freeing voltage.' },
      { title: 'MTPA / MTPV', expression: 'MTPA: Iq² + (Lq−Ld)·Id·Iq − ψf·Id = 0\\nMTPV: optimise Iq along the voltage ellipse', explanation: 'MTPA = max torque per amp; MTPV = max torque per volt. The former is for low speed, the latter for deep field weakening.' },
    ],
    engineeringMeaning: [
      'Field weakening is voltage-budget management. Low speed is constant torque, mid speed enters weakening, high speed is constant power.',
      'The negative-Id limit comes from two constraints: the current circle (|I| below I_max) and the demagnetisation threshold (from the magnet vendor). Demagnetisation is irreversible.',
      'Weakening transitions must be smooth — an open PI controls voltage magnitude and lets it sit just below V_max, automatically adjusting Id.',
    ],
    stm32Guide: [
      'Field-weakening PI: error = V_max - |V|, output Id command (taken negative).',
      'Operating-point monitor: every slow task period compute |V| and |I|; raise an alarm when out of range.',
      'V_max leaves 5-10% headroom (use 0.95 x Udc/sqrt(3)) to avoid hammering against the limit.',
    ],
    commonMistakes: [
      'Adding more speed without checking voltage headroom, leaving the current loop saturated long-term.',
      'Negative Id too large -> current circle overflow + demagnetisation risk.',
      'Field-weakening PI gain too high -> Id command oscillates -> torque ripple.',
      'No minimum-speed threshold -> field weakening also runs at low speed, wasting energy.',
    ],
    debugMethods: [
      'Plot the Id/Iq operating point with the current circle and voltage ellipse to see where it sits.',
      'Watch the |V_dq| / V_max ratio: above 0.95 triggers field weakening.',
      'Log torque, current, and bus voltage before and after entering/leaving weakening; compute efficiency.',
    ],
    experiments: [
      'Leave Id alone, push target speed from 4200 to 8000 -> see the voltage saturation warning.',
      'Raise Iq -> torque grows but voltage saturates earlier; adding -Id instead lets you push to higher speed.',
      'Drop Udc from 48 V to 24 V and watch the voltage ellipse shrink by half; weakening kicks in much earlier.',
    ],
    summary: 'Field weakening = trading current for voltage headroom, the inescapable voltage-budget management for high-speed operation.',
    nextSteps: ['Continue to the fault-debugging module to string together every diagnostic skill you have learned.'],
    codeExample: `/* ============================================
 * field_weakening.c — automatic field weakening (voltage-magnitude loop)
 * Outputs the Id command to the current loop
 * ============================================ */
#include "pi.h"

typedef struct {
    pi_t pi_fw;            // FW PI (input: voltage headroom error, output: Id command)
    float v_max;           // SVPWM linear cap = 0.95 x Udc/sqrt(3)
    float id_min;          // most-negative Id cap (demag safety + current circle)
    float i_max;           // current circle |I| below I_max
    float deadband;        // do not weaken while |V|/V_max is below this
} fw_ctrl_t;

void fw_init(fw_ctrl_t *f, float udc, float i_max, float id_min) {
    f->v_max = 0.95f * udc * 0.57735027f;     // 1/sqrt(3)
    f->id_min = id_min;
    f->i_max = i_max;
    f->deadband = 0.93f;     // stay out until 95% headroom is used

    /* FW PI: large error -> inject Id quickly (negative direction) */
    pi_init(&f->pi_fw, 0.5f, 100.0f, 1.0f/2000.0f,
            id_min,    /* out_min: most negative Id */
            0.0f);     /* out_max: do not push positive Id */
}

/* Inputs: present Vd / Vq, present Iq; output: Id reference */
float fw_compute_id_ref(fw_ctrl_t *f, float vd, float vq, float iq_ref) {
    float v_mag = sqrtf(vd*vd + vq*vq);
    float v_ratio = v_mag / f->v_max;

    /* dead-band: do nothing */
    if (v_ratio < f->deadband) {
        pi_reset(&f->pi_fw);
        return 0.0f;
    }

    /* err = 1.0 - current ratio (negative means already over -> need more negative Id) */
    float err = 1.0f - v_ratio;
    float id_ref = pi_step(&f->pi_fw, 0.0f, -err);    /* note sign convention */

    /* Current-circle constraint: |Id|^2 + Iq^2 below I_max^2 */
    float iq_sq = iq_ref * iq_ref;
    float id_max_circle = -sqrtf(f->i_max * f->i_max - iq_sq);
    if (id_ref < id_max_circle) id_ref = id_max_circle;

    return id_ref;
}

/* Usage (after the speed loop, before the current loop):
 *   id_ref = fw_compute_id_ref(&fw, vd_last, vq_last, iq_ref);
 *   // now id_ref + iq_ref go into the current loop
 *
 * === Tuning notes ===
 * 1. v_max must leave headroom (90-95%) to avoid hammering the limit.
 * 2. id_min is determined by two lines: current circle + demag threshold (take the stricter).
 * 3. PI gain too high -> Id command oscillates -> torque ripple; too low -> slow response.
 */`,
    quiz: [
      {
        q: 'At high speed the current loop |V| hits the limit and the motor will not accelerate. The most direct fix?',
        options: ['Raise Iq', 'Inject negative Id to weaken the flux', 'Raise PWM frequency', 'Lower the bandwidth'],
        correct: 1,
        hint: 'Negative Id shrinks the effective flux psi_f + Ld x Id -> BEMF drops -> voltage headroom returns -> speed can keep climbing.',
      },
      {
        q: 'Between the current limit circle and the voltage limit ellipse, which one does not constrain low-speed operation?',
        options: ['Current circle', 'Voltage ellipse', 'Both do', 'Neither'],
        correct: 1,
        hint: 'At low speed omega is small so the voltage ellipse is huge and contains the entire current circle — the current circle is the hard limit. At high speed omega is large and the ellipse shrinks inside the circle and hits first.',
      },
      {
        q: 'Pushing negative Id too far can cause what irreversible damage?',
        options: ['Over-current', 'Over-voltage', 'Magnet demagnetisation (permanent loss of magnetism)', 'Over-temperature'],
        correct: 2,
        hint: 'Deep negative Id creates a reverse field; once it exceeds the magnet coercivity the magnetism is permanently weakened. Every permanent-magnet motor has a demag threshold from the vendor, and the Id limit must respect it.',
      },
      {
        q: 'MTPA (maximum torque per amp) applies in which region?',
        options: ['Low-speed constant-torque', 'High-speed field-weakening', 'Deep field-weakening', 'All regions'],
        correct: 0,
        hint: 'MTPA = max torque at a given current magnitude, most efficient before hitting the voltage limit. Once voltage saturates you switch to the field-weakening (constant-power) strategy.',
      },
      {
        q: 'Bus voltage Udc drops from 48 V to 24 V. How does the speed at which field weakening kicks in change?',
        options: ['Unchanged', 'Doubled', 'Halved', 'Up by sqrt(2)'],
        correct: 2,
        hint: 'V_max scales with Udc, so the voltage ellipse radius halves. BEMF = Ke x omega hits V_max at half the speed, so weakening kicks in at half the speed.',
      },
    ],
  },
  'faults-debugging': {
    id: 'faults-debugging',
    introBeginner: {
      metaphor: 'Fault debugging is like a doctor diagnosing illness — not just looking at symptoms ("motor jitters"), but chaining "symptom -> waveform -> intermediate variable -> hardware measurement" into a line of evidence. Each fault has a typical waveform signature; reading waveforms is diagnosing.',
      coreIdea: 'Build a "phenomenon library" mapping eight common faults (over-current / phase loss / offset / phase order / angle / oscillation / saturation / startup failure) to waveform signatures plus troubleshooting steps plus fixes.',
      whyCare: [
        'On-site debugging is 80% locating the fault and 10% changing code. Reading waveforms = debugging motors.',
        '"Low-speed whine" can be dead-time, PI oscillation, sampling noise, or mechanical resonance — same symptom, multiple causes. The evidence-chain mindset replaces guessing.',
        'Before industrial delivery you must do EFT/ESD/temperature-cycle tests. Pre-running fault-injection experiments avoids embarrassment post-launch.',
      ],
      firstAction: 'Switch through the "fault type" on the right to test 8 faults and observe the Ia/Ib/Ic/speed waveform signatures. Each fault on the right also lists "symptoms + causes + steps + fixes" — the field diagnostic manual.',
    },
    learningGoals: [
      'Recognise the waveform signatures of 8 typical faults.',
      'Build the "waveform -> cause -> investigate -> fix" debug chain.',
      'Correlate software intermediate variables with on-site scope / logic-analyser measurements.',
    ],
    concepts: [
      'A fault is not the same as an alarm code. The same "over-current alarm" can be PI oscillation, wrong phase order, wrong angle, mechanical stall, or an aging bus capacitor.',
      'The same phenomenon may have multiple causes — whine could be PI oscillation / dead-time / resonance / sampling noise. Ruling them out one by one is the diagnostic discipline.',
      'Fault snapshot: at the trigger moment log Ia/Ib/Ic/Id/Iq/Vd/Vq/duty/theta/speed/fault flags together and read it back over RTT/UART afterwards.',
    ],
    formulas: [
      { title: 'Debug golden loop', expression: 'symptom → waveform → intermediate variable → hardware measurement → hypothesis → modify → retest', explanation: 'Change one variable at a time and keep reproducible experiments. Blind multi-changes leave you lost.' },
      { title: 'Over-current criterion (software)', expression: '|Ia| > I_OC  or  √(Iα²+Iβ²) > I_OC × 1.15', explanation: 'Software protection I_OC = 1.2 x I_rated; hardware protection is typically 1.5 to 2 x I_rated via a comparator that kills PWM directly.' },
      { title: 'Phase-order error diagnosis', expression: 'Forward command but motor runs backwards / same Iq command but torque is biased opposite', explanation: 'Swap any two wires in hardware or swap Ib/Ic in software.' },
    ],
    engineeringMeaning: [
      'Field debugging relies on evidence. Turning common mistakes into a case library shortens new-engineer ramp-up from months to weeks.',
      'Fault protection has two layers: hardware (comparator + BKIN) and software (ISR check + tiered handler). Hardware is the floor; software classifies.',
      'Black-box data: write a 256-byte snapshot to EEPROM on every fault; field returns can be diagnosed instantly.',
    ],
    stm32Guide: [
      'Place the fault-snapshot struct in the tail of RAM (linker script section) so reset does not clear it.',
      'Hardware protection: COMP + DAC output to TIM1 BKIN, with a GPIO fault pin alongside.',
      'Tiered protection: hardware -> software ISR -> slow task; processing budgets from < 1 us to 1 ms per tier.',
    ],
    commonMistakes: [
      'After an over-current trip only lowering Kp without checking phase order and angle.',
      'Continuing to add Iq command while voltage saturates (useless and harmful).',
      'Software-only protection without hardware backup — if the MCU hangs, nothing saves you.',
      'No fault log saved; every diagnosis is from memory.',
    ],
    debugMethods: [
      'Fault reproduction starts from a safe boundary: 12 V bus + 1 A limit + no load, then ramp up parameters.',
      'Scope + logic analyser + UART, cross-validating.',
      'Reproduce the same fault 2-3 times under different Kp/Ki/speed to find the pattern.',
    ],
    experiments: [
      'Switch through 8 fault types and read waveform signatures: over-current spikes, phase loss missing a phase, phase order showing reverse rotation, angle error showing high-frequency jitter.',
      'Tune "fault severity" from mild (still runnable) to severe (must stop).',
      'Compare with the "cause / steps / fix" advice on the right to internalise each fault\'s diagnostic recipe.',
    ],
    summary: 'The goal of fault debugging is to translate "feels wrong" into "measurable, reproducible, fixable". Evidence chains plus a case library are an engineer\'s most valuable asset.',
    nextSteps: ['Go back to the FOC pipeline module and use single-stepping to locate where each fault appears along the data flow. Course completed.'],
    codeExample: `/* ============================================
 * fault.c — tiered fault protection + black-box snapshot
 * Hardware protection < 1 us, software ISR < 50 us, main loop < 10 ms
 * ============================================ */

typedef enum {
    FAULT_NONE,
    FAULT_OVER_CURRENT,
    FAULT_OVER_VOLTAGE,
    FAULT_UNDER_VOLTAGE,
    FAULT_OVER_TEMP,
    FAULT_PHASE_LOSS,
    FAULT_ENCODER_LOST,
    FAULT_ANGLE_DIVERGENCE,
} fault_code_t;

/* === Black-box snapshot (placed via the linker in a RAM section that survives reset) === */
typedef struct __attribute__((packed)) {
    uint32_t magic;          // 0xDEADBEEF
    uint32_t timestamp_ms;
    fault_code_t code;
    float ia, ib, ic;
    float id, iq;
    float vd, vq;
    float duty_a, duty_b, duty_c;
    float theta_e;
    float speed_rpm;
    float udc;
    float temp_c;
    uint32_t crc32;
} fault_snapshot_t;

extern fault_snapshot_t __noinit_fault_snap __attribute__((section(".noinit")));

/* === Tier 1: hardware protection (< 1 us, no CPU) ===
 *   COMP1 compares ADC4 (phase current) with DAC3 (1.8 x I_rated);
 *   over the limit -> BKIN_N -> TIM1 MOE=0 -> all PWM off.
 *
 * In the BKIN NMI just snapshot + set the fault flag. */
void NMI_Handler(void) {
    if (TIM1->SR & TIM_SR_BIF) {
        TIM1->SR &= ~TIM_SR_BIF;
        save_snapshot(FAULT_OVER_CURRENT);
        g_state.fault_pending = 1;
    }
}

/* === Tier 2: software protection (PWM ISR tail, < 50 us) === */
void check_software_faults(void) {
    /* over-current (incl. instantaneous current before clamping) */
    float i_mag = sqrtf(g_state.ialpha * g_state.ialpha
                       + g_state.ibeta * g_state.ibeta);
    if (i_mag > I_OC_SOFT) {
        save_snapshot(FAULT_OVER_CURRENT);
        TIM1->BDTR &= ~TIM_BDTR_MOE;     // soft-off PWM
        g_state.fault_pending = 1;
    }
    /* bus voltage window */
    if (g_state.udc > UDC_MAX) save_snapshot(FAULT_OVER_VOLTAGE);
    if (g_state.udc < UDC_MIN) save_snapshot(FAULT_UNDER_VOLTAGE);
    /* phase-current sum check for missing phase */
    if (fabsf(g_state.ia + g_state.ib + g_state.ic) > 1.5f)
        save_snapshot(FAULT_PHASE_LOSS);
}

/* === Tier 3: main loop (10 ms) === */
void fault_handler_task(void) {
    if (!g_state.fault_pending) return;
    /* show fault code, blink LED, send CAN alert, append to Flash long-term log */
    led_blink(g_snap.code);
    can_send_fault_msg(&__noinit_fault_snap);
    flash_log_append(&__noinit_fault_snap);
    /* unlock conditions (PWM off + fault source cleared + user reset) */
}

/* === Engineering recipe ===
 * 1. At power-up read __noinit_fault_snap; if CRC passes the previous reset
 *    had a fault — replay to the user.
 * 2. The snapshot must trigger fast so the scene is preserved.
 * 3. Never call printf / Flash write / Delay from an ISR.
 */`,
    quiz: [
      {
        q: 'Key difference between hardware and software over-current protection?',
        options: ['Hardware is slower', 'Hardware directly kills PWM without CPU state; software relies on an ISR', 'Software is more accurate', 'Hardware costs more'],
        correct: 1,
        hint: 'Hardware comparator -> BKIN -> PWM off, saves you even when the CPU hangs. Software protection needs ISR response (>= 10 us, often longer), too slow at critical moments. Both must coexist.',
      },
      {
        q: 'During debug the motor will not spin forward but works backward normally. Most likely cause?',
        options: ['Kp too high', 'Phase order error (wiring has two phases swapped, or software has Ib/Ic swapped)', 'Encoder failure', 'Over-current'],
        correct: 1,
        hint: 'Phase order determines the rotating field direction. Swapping two phases reverses the field and reverses the motor. Fix: physically swap any two phase wires, or swap the Ib and Ic ADC channels in software.',
      },
      {
        q: 'A scope shows Ia is consistently 1.5 A higher than Ib and Ic. Most likely cause?',
        options: ['Over-current', 'Uncalibrated Ia ADC offset', 'Wrong phase order', 'PWM frequency drift'],
        correct: 1,
        hint: 'Each ADC channel has an independent offset. With no current Ia should equal Ib = Ic = 0, but the ADC reads tens of mV offset — hundreds of mA. You must average zero-current samples to capture the offset and subtract at runtime.',
      },
      {
        q: 'Current-loop Iq step has 50% overshoot but steady-state Iq is stable. The most likely fix?',
        options: ['Raise Ki', 'Lower Kp or raise the limit', 'Raise the bus', 'Replace the motor'],
        correct: 1,
        hint: 'Too-large Kp -> overshoot at the step. If Kp cannot be lowered further (response would suffer), raise the limit to reduce the release impulse from integral windup. Ki has little correlation with overshoot.',
      },
      {
        q: 'Where is the best place for the fault snapshot?',
        options: ['Normal RAM', 'A .noinit section defined by the linker (RAM not cleared on reset)', 'Flash', 'EEPROM'],
        correct: 1,
        hint: 'On reset normal RAM is cleared and the fault info is gone. .noinit is not zeroed by the startup code, so the next boot can read it. For power loss add EEPROM/Flash for long-term backup.',
      },
    ],
  },
  'hfi-sensorless': {
    id: 'hfi-sensorless',
    introBeginner: {
      metaphor: 'HFI is like sending sonar into a dark room — at low speed the back-EMF is too small ("light" is unavailable), so you actively inject a high-frequency signal and "listen" for the saliency in the echo to locate the rotor. Compressor zero-speed startup depends on it.',
      coreIdea: 'Inject a high-frequency voltage on the d-axis; for an IPM motor Ld < Lq so the response-current amplitude depends on rotor position. Demodulation recovers the angle. The motor barely moves yet you already know "which way it points".',
      whyCare: [
        'Compressors need "zero-speed startup" — closed-loop FOC immediately at power-up, no V/f blind push.',
        'A BEMF observer basically fails below 500 rpm; HFI is the only viable option in that band.',
        'It works only on salient (IPM) machines; surface-mounted PMSMs with Ld ~ Lq make HFI useless. So saliency ratio is a hard requirement when choosing a compressor motor.',
      ],
      firstAction: 'On the right pull saliency ratio Lq/Ld from 2.18 down to 1.05 (close to surface-mounted) and watch the angle estimate collapse; pull it back above 2.5 and lock returns instantly.',
    },
    learningGoals: [
      'Understand the physical intuition of high-frequency injection and the saliency-signal mechanism.',
      'Master the inject -> respond -> demodulate -> PLL pipeline.',
      'Know the boundaries: must be IPM, low-speed band, audible noise possible.',
    ],
    concepts: [
      'IPM motors with Ld < Lq are magnetically asymmetric; the injected high-frequency current response in dq differs between axes.',
      'Demodulation = measurement signal x in-phase carrier -> the DC component carries sin(2 x delta-theta) error info.',
      'A PLL drives that error to zero to give a smooth angle estimate.',
    ],
    formulas: [
      { title: 'Saliency-signal gain', expression: 'gain ≈ (Lq − Ld) / (Lq·Ld) · V_h', explanation: 'Bigger difference = stronger signal; surface-mounted motors with Lq ~ Ld have gain near zero — HFI fails.' },
      { title: 'Demodulated output', expression: 'demod_lp ∝ sin(2·(θ_true − θ_est))', explanation: 'Note the 2 x angle difference — HFI only resolves info inside 180 degrees and needs an extra polarity-detection step.' },
      { title: 'BEMF vs HFI handoff', expression: 'speed < 5%·rated → HFI;  5-10% → smooth blend;  > 10% → BEMF / SMO', explanation: 'In the transition band weight-blend both estimators to avoid an angle jump at handoff.' },
    ],
    engineeringMeaning: [
      'HFI is mandatory for compressor zero-speed startup. The "saliency ratio" in the vendor datasheet is for HFI.',
      'Injection frequency trades audible noise (> 1 kHz dodges the 200-1000 Hz sensitive band) against PWM headroom.',
      'High-frequency injection adds iron losses and current harmonics, so at high speed you must switch to BEMF.',
    ],
    stm32Guide: [
      'The injected high-frequency signal is added after the current-PI output and before inverse Park.',
      'Demodulate with an IIR low-pass (cutoff ~ 200 Hz); CMSIS-DSP provides ready-made filters.',
      'HFI <-> BEMF handoff uses a hysteresis comparator to avoid bouncing.',
    ],
    commonMistakes: [
      'Using on a surface-mounted motor (Lq ~ Ld — nothing happens).',
      'Injection voltage too high causes audible noise; too low is buried in noise.',
      'Skipping polarity detection — startup direction is random.',
    ],
    debugMethods: [
      'Temporarily fit an encoder to compare the HFI angle estimate.',
      'Look at the demod_lp output: normally a smooth DC; strong 2 x omega_h ripple means the demodulation LPF is not low enough.',
      'At high speed observe the HFI -> BEMF transient; the angle must not jump by more than 10 degrees at the switch.',
    ],
    experiments: [
      'Saliency ratio 2.5 -> 1.05 and watch HFI fail.',
      'Injection frequency 800 Hz -> 200 Hz (too low, contaminated by PWM harmonics) -> 1500 Hz.',
      'Add noise and watch the PLL lock speed change.',
    ],
    summary: 'HFI is the standard low-speed sensorless solution for compressors. It overcomes the BEMF dead-band at low speed via active injection, but works only on IPM saliency.',
    nextSteps: ['Continue to the startup state-machine (module 14) to see how HFI cooperates with V/f and BEMF across the whole startup flow.'],
    codeExample: `/* hfi.c — compressor low-speed sensorless HFI control */
typedef struct {
    float v_inject;       // injection voltage amplitude V
    float f_inject;       // injection frequency Hz
    float omega_inject;   // = 2 x pi x f_inject
    float carrier_phase;  // accumulating carrier phase
    float demod_lp;       // demodulation LPF output
    float lpf_alpha;
    /* PLL */
    float pll_kp, pll_ki, pll_int, theta_est, omega_est;
} hfi_ctx_t;

void hfi_init(hfi_ctx_t *h, float v, float f_hz, float pwm_freq) {
    h->v_inject = v;
    h->f_inject = f_hz;
    h->omega_inject = 2.0f * M_PI * f_hz;
    h->lpf_alpha = (2.0f * M_PI * 200.0f / pwm_freq);  // 200Hz LPF
    /* ... */
}

/* In the FOC ISR: inject + demodulate + PLL */
void hfi_step(hfi_ctx_t *h, float i_q_meas, float dt,
              float *out_v_d_inject, float *out_theta_est)
{
    /* 1. accumulate carrier phase */
    h->carrier_phase += h->omega_inject * dt;
    if (h->carrier_phase > 2.0f * M_PI) h->carrier_phase -= 2.0f * M_PI;
    float carrier = sinf(h->carrier_phase);

    /* 2. inject voltage (sum on top of the current-loop V_d output) */
    *out_v_d_inject = h->v_inject * carrier;

    /* 3. demodulate: the high-frequency part of i_q_meas times the carrier carries sin(2*delta-theta) */
    float product = i_q_meas * carrier;
    h->demod_lp += h->lpf_alpha * (product - h->demod_lp);

    /* 4. PLL locks to sin(2*delta-theta) = 0 */
    float err = -h->demod_lp;
    h->pll_int += h->pll_ki * err * dt;
    h->omega_est = h->pll_kp * err + h->pll_int;
    h->theta_est += h->omega_est * dt;
    if (h->theta_est > M_PI) h->theta_est -= 2.0f * M_PI;
    if (h->theta_est < -M_PI) h->theta_est += 2.0f * M_PI;

    *out_theta_est = h->theta_est;
}`,
    quiz: [
      {
        q: 'Can HFI be used on a surface-mounted PMSM (Lq ~ Ld)?',
        options: ['Yes', 'No — the saliency-signal gain is near zero', 'Only at low speed', 'Yes with hardware mods'],
        correct: 1,
        hint: 'HFI relies on (Lq - Ld) / (Lq x Ld) being nonzero; on surface-mounted motors this is almost zero, so no amount of injection produces a signal.',
      },
      {
        q: 'Why is the injection frequency commonly chosen in 800-1500 Hz?',
        options: ['Hardware limit', '> 1 kHz dodges the audible 200-1000 Hz; with 6 kHz PWM, 1.5 kHz still leaves 4x headroom', 'Does not matter', 'Tied to mains frequency'],
        correct: 1,
        hint: 'Audible-noise sensitivity is 200-1000 Hz; you also need to stay well below PWM (commonly < 1/4 of PWM) to avoid aliasing.',
      },
      {
        q: 'HFI demodulation outputs sin(2 x delta-theta), meaning the estimate has a 180-degree ambiguity. How is that solved?',
        options: ['Ignore it', 'During startup align to a fixed direction (forced d-axis alignment) to remove the ambiguity', 'Use cos instead', 'Change hardware'],
        correct: 1,
        hint: 'During the startup alignment phase apply DC to the d-axis so the rotor parks at zero; starting the PLL from a known direction avoids the 180-degree flip.',
      },
      {
        q: 'What is the typical speed boundary for handing off from HFI to BEMF?',
        options: ['1% of synchronous speed', '5-10% of synchronous speed', '50% of synchronous speed', '100%'],
        correct: 1,
        hint: 'At 5-10% of synchronous speed the BEMF can be observed stably by the SMO; continuing HFI just adds noise and losses, so hand off.',
      },
      {
        q: 'For the same compressor, saliency ratio drops from 2.5 to 1.5. How does HFI lock change?',
        options: ['No effect', 'Lock time grows, error grows', 'Actually more stable', 'Diverges'],
        correct: 1,
        hint: 'Saliency-signal gain ~ (r-1)/(r+1). r=2.5 gives 0.43; r=1.5 gives 0.20 — more than halved, so the signal weakens and noise becomes relatively larger.',
      },
    ],
  },
  'apf-frontend': {
    id: 'apf-frontend',
    introBeginner: {
      metaphor: 'An APF / PFC front end is like the "power shaper" of a home variable-speed drive — it shapes the chaotic current pulled from the grid into a clean sinusoid synchronous with the voltage, while boosting to 380 V for the compressor drive. Without it the input current harmonics fail certification and the grid is stressed.',
      coreIdea: 'Single-phase 220 V grid passes through a rectifier to produce |sin| half-waves, then a Boost stage with a dual-loop controller (outer regulates the bus, inner makes the inductor current track |sin|) achieves high power factor + low THD + a stable 380 V bus.',
      whyCare: [
        'Standards like GB/T 17625.1 cap household harmonics; without PFC, plain rectifier THD is over 100% and you cannot certify.',
        'A 380 V high bus is the prerequisite for downstream FOC field weakening (see the field-weakening module).',
        'When the load (compressor) power steps, the PFC voltage loop must hold the bus so FOC does not see a big voltage disturbance.',
      ],
      firstAction: 'On the right pull bus target Udc from 380 V to 250 V (close to not boosting) and watch the phase offset between input current and grid voltage grow while PF drops; pull back to 380 V and PF approaches 1.',
    },
    learningGoals: [
      'Understand the Boost PFC topology and control objective.',
      'Master the dual-loop structure: voltage loop + current loop.',
      'Know the engineering meaning of PF, THD, and bus ripple — three key metrics.',
    ],
    concepts: [
      'Boost PFC = rectifier bridge + boost inductor + switch + diode + bus cap; the switch controls the inductor current to track |sin|.',
      'Outer loop: bus-voltage PI -> outputs the current-reference magnitude. Inner loop: reference x |sin| compared with inductor current -> duty cycle.',
      'PF = real power / apparent power; THD = harmonic RMS / fundamental RMS; ripple % = (Umax - Umin) / Uavg.',
    ],
    formulas: [
      { title: 'Boost ratio (steady state)', expression: 'Udc = Vrect / (1 - D)', explanation: 'D is the duty cycle; D=0 -> Udc=Vpeak (no boost), D=0.5 -> Udc=2 x Vpeak.' },
      { title: 'Ideal PF', expression: 'PF = 1  when i_line(t) = k · v_line(t)', explanation: 'Current and voltage are exactly in phase and have the same shape (sinusoid); PF=1. PFC aims to approach that state.' },
      { title: 'Bus ripple', expression: 'ΔUdc ≈ I_load / (2·ω_line · C)', explanation: 'Twice the line frequency is the dominant ripple frequency (rectifier output 100 Hz); larger C means smaller ripple.' },
    ],
    engineeringMeaning: [
      'PFC is standard for DC variable-speed air conditioners and industrial fridges, not an optional add-on.',
      'Current-loop bandwidth 1 to 5 kHz, voltage-loop bandwidth 50 to 200 Hz; outer must be much smaller than inner to avoid fighting.',
      'Bus-cap sizing is "must hold at least one mains-cycle of energy"; too small = big ripple, too big = large in-rush at startup.',
    ],
    stm32Guide: [
      'PFC uses a dedicated PWM channel (typically TIM1_CH4 or TIM3) separate from FOC to avoid interference.',
      'Current sampling uses internal OPAMP + injected ADC synchronised with PWM; bus ADC can sit on the regular sequence.',
      'CCM (continuous conduction mode) is most common; DCM-CCM boundary at light load needs separate handling to avoid duty-cycle steps.',
    ],
    commonMistakes: [
      'Inner/outer bandwidths reversed (outer faster than inner) -> oscillation.',
      'No rate limit on the load step -> the bus is dragged down instantly.',
      'Current-sampling filter too aggressive -> inner loop becomes unstable.',
      'Not distinguishing 100 Hz ripple from PWM switching ripple.',
    ],
    debugMethods: [
      'Scope input voltage and current — ideally in phase and same shape.',
      'FFT the input current harmonics; 3rd / 5th / 7th are commonly over-spec.',
      'Observe bus voltage dip and recovery time under a load step.',
    ],
    experiments: [
      'Udc 380 -> 250 V and watch PF drop.',
      'Load current 4 -> 12 A and watch the bus sag.',
      'Boost inductor 1.5 -> 0.5 mH and watch the current ripple grow.',
    ],
    summary: 'PFC is the "interface manager" between the compressor drive and the grid — listen to the grid (PF=1) while delivering a stable bus to the downstream. Dual loop + averaged model is the starter kit.',
    nextSteps: ['That concludes all 15 modules. Loop back to "Motor basics" (01) and read through in order — you should be able to follow the entire chain from grid to motor inside a compressor drive.'],
    codeExample: `/* apf_pfc.c — single-phase Boost PFC dual-loop control
 * PWM 60 kHz, control period = PWM period = 16.7 us
 * Targets STM32G4 + internal OPAMP for current amplification
 */

typedef struct {
    /* measurements */
    float v_ac_rect;     // rectifier output voltage (ADC)
    float i_l;           // inductor current A
    float udc;           // bus voltage V

    /* references */
    float udc_ref;       // bus target
    float i_amp_ref;     // current-magnitude reference (voltage-loop output)

    /* controller state */
    float volt_int, curr_int;
    float volt_kp, volt_ki;
    float curr_kp, curr_ki;

    /* internal */
    float sin_norm;      // |sin(omega*t)| template (from zero-crossing / PLL)
} pfc_ctx_t;

void pfc_pwm_isr(pfc_ctx_t *p, float dt) {
    /* 1. outer (voltage) loop: every N PWM cycles (assume every cycle here) */
    float err_v = p->udc_ref - p->udc;
    p->volt_int += err_v * dt;
    p->i_amp_ref = clamp(p->volt_kp * err_v + p->volt_ki * p->volt_int, 0, 30);

    /* 2. current reference: tracks |sin| */
    float i_ref = p->i_amp_ref * p->sin_norm;

    /* 3. inner (current) loop */
    float err_i = i_ref - p->i_l;
    p->curr_int += err_i * dt;
    float duty = p->curr_kp * err_i + p->curr_ki * p->curr_int;
    duty = clamp(duty, 0, 0.95f);

    /* 4. write CCR */
    TIM1->CCR4 = (uint16_t)(duty * (TIM1->ARR + 1));
}

/* Zero-crossing produces the |sin| template:
 * the input-voltage sampler PLL tracks the 100 Hz rectified sine phase */
void pfc_update_sine_template(pfc_ctx_t *p) {
    /* Simplified: directly normalise v_ac_rect */
    static float v_peak = 1;
    if (p->v_ac_rect > v_peak) v_peak = p->v_ac_rect;
    v_peak *= 0.9999f;     // slow decay
    p->sin_norm = p->v_ac_rect / fmaxf(v_peak, 1.0f);
}`,
    quiz: [
      {
        q: 'In the Boost PFC dual-loop structure, which is the outer loop?',
        options: ['Current loop', 'Voltage loop', 'Equal', 'Depends on load'],
        correct: 1,
        hint: 'Voltage outside, current inside. Outer slow (50-200 Hz), inner fast (1-5 kHz). Outer output becomes the inner reference magnitude.',
      },
      {
        q: 'What should the input current look like for ideal PF=1?',
        options: ['Square wave', '|sin| half wave', 'A sinusoid in phase with the grid voltage (with positive and negative halves)', 'Constant'],
        correct: 2,
        hint: 'PF=1 means current and voltage are in phase and same shape. Note: the inductor current is |sin| (always positive), but the input-side line current flips with each half cycle and is a full sinusoid.',
      },
      {
        q: 'Bus cap C quadrupled. How does the 100 Hz ripple amplitude change?',
        options: ['Unchanged', 'Quadruple', 'Halved', 'Quartered'],
        correct: 3,
        hint: 'delta-Udc ~ I/(2*omega*C), inverse to C. Quadrupling C gives 1/4 ripple. But the in-rush current also scales up, so trade off.',
      },
      {
        q: 'Without active PFC and using a rectifier + big cap "passive PF", what does the input current roughly look like?',
        options: ['Sinusoid', 'Narrow pulses near the grid voltage peak only; THD > 100%', 'Square wave', 'DC'],
        correct: 1,
        hint: 'The bridge conducts only when capacitor voltage approaches Vpeak — narrow tall pulses rich in harmonics, THD typically 100-150%. That is why standards forbid this scheme.',
      },
      {
        q: 'Load (compressor drive) jumps from 4 A to 12 A. What happens to the PFC bus voltage?',
        options: ['Instantly stable', 'Short sag, then the voltage loop pulls it back to target', 'Drops continuously', 'Spikes up'],
        correct: 1,
        hint: 'Load jump speeds up cap discharge and the bus sags. The voltage PI sees larger err -> raises current-magnitude reference -> inner loop absorbs more energy to compensate -> bus returns to target. Typical recovery 50-200 ms.',
      },
    ],
  },
  'startup-statemachine': {
    id: 'startup-statemachine',
    introBeginner: {
      metaphor: 'A compressor startup is like an aeroplane taking off — power-up (preflight) -> bus pre-charge (taxi) -> rotor align (find the runway direction) -> V/f drag (push thrust) -> HFI takes over (retract gear) -> BEMF closed loop (climb) -> field weakening (cruise). Each phase has entry/exit conditions and skipping the order crashes the plane.',
      coreIdea: 'A reliable compressor drive is internally a clear 7-state machine; each state does one thing, has entry/exit conditions, and provides fallbacks on error.',
      whyCare: [
        '"Compressor failed to start" is the No. 1 field-return fault category, almost always a state-machine design issue.',
        'A state-machine mindset makes code testable, tunable, and portable — no more trying every new model from scratch.',
        'Anti-liquid-slugging ramp is an industry-experience value (300-800 rpm/s); breaking it can damage valve plates and pistons.',
      ],
      firstAction: 'On the right push acceleration ramp from 600 rpm/s to 3000 to simulate an illegal fast startup and watch Iq spike (liquid-slugging risk). Pull back to 400 and the curve smooths.',
    },
    learningGoals: [
      'Lay out the seven compressor-startup states and their transition conditions.',
      'Understand the engineering meaning of the anti-liquid-slugging ramp.',
      'Read the state-machine log when startup fails.',
    ],
    concepts: [
      'After power-up the state machine advances in order; each state has entry/exit/timeout.',
      'Transition conditions commonly use hysteresis comparators to avoid bouncing.',
      'The core of anti-liquid-slugging is to bound d-omega/dt so that liquid refrigerant has time to vaporise before being compressed.',
    ],
    formulas: [
      { title: 'Anti-liquid-slugging ramp cap', expression: 'dω/dt ≤ ω_ramp_max', explanation: 'Industry experience: 300-800 rpm/s. Exact value per the compressor vendor manual.' },
      { title: 'V/f start voltage', expression: 'V_phase = V_min + (V_rated/ω_rated) · ω', explanation: 'A minimum voltage at low speed overcomes resistive drop so the motor can move.' },
      { title: 'Phase-handoff boundary', expression: 'HFI: ω < 5% rated;  BEMF: 5-100% rated;  field weakening: ω > 80% rated', explanation: 'Boundaries use hysteresis to avoid bouncing at the threshold.' },
    ],
    engineeringMeaning: [
      'The state machine is your "navigation map" during field debugging — first check which state is stuck or wrongly transitioned.',
      'Each state must declare timeout / fault conditions explicitly; do not rely on "it should transition".',
      'Field weakening can coexist with the BEMF state; it is a subset behaviour of the BEMF state.',
    ],
    stm32Guide: [
      'Implement with enum + switch; each case handles entry / steady / exit.',
      'Record state, timestamp, and previous state for black-box replay.',
      'When transitioning, reset the controller integrators (PI handoff) to avoid impulses.',
    ],
    commonMistakes: [
      'No timeout, HFI waits forever for BEMF handoff.',
      'Acceleration ramp too steep -> liquid slug.',
      'V/f startup voltage too high -> startup current trips hardware protection.',
    ],
    debugMethods: [
      'On startup failure record the last state + time spent + previous state.',
      'Scope bus voltage, Iq, and speed simultaneously to find which cycle goes wrong.',
      'Step-test every state\'s entry/exit, simulate extremes (very high ramp, very low target speed).',
    ],
    experiments: [
      'Acceleration ramp 200 vs 1500 rpm/s and compare total startup time and Iq peaks.',
      'Change HFI handoff threshold 50 -> 200 rpm and watch the startup sequence change.',
      'Set target speed from 3000 to 8000 and see whether field weakening is entered.',
    ],
    summary: 'Compressor startup = a 7-state machine + anti-slug ramp + smooth handoff. This is the "skeleton" of an engineering-grade delivery.',
    nextSteps: ['Third wave of modules: APF front end + compressor fault library (liquid slug / stall / phase loss / bus under-voltage).'],
    codeExample: `/* compressor_startup.c — 7-state startup machine */

typedef enum {
    STATE_IDLE,
    STATE_PRECHARGE,
    STATE_ALIGN,
    STATE_OPEN_LOOP,
    STATE_HFI,
    STATE_BEMF,
    STATE_FIELDWEAK,
    STATE_FAULT
} startup_state_t;

typedef struct {
    startup_state_t state;
    uint32_t state_enter_ms;
    float rpm_ref;
    float rpm_actual;
    float accel_ramp_rpm_s;
} startup_ctx_t;

void startup_tick(startup_ctx_t *ctx, float dt) {
    uint32_t age = HAL_GetTick() - ctx->state_enter_ms;

    switch (ctx->state) {
    case STATE_IDLE:
        if (cmd_start_received()) goto_state(ctx, STATE_PRECHARGE);
        break;

    case STATE_PRECHARGE:
        if (g_state.udc > UDC_OK_THRESHOLD && age > 200) {
            goto_state(ctx, STATE_ALIGN);
        }
        if (age > 2000) goto_fault(ctx, FAULT_PRECHARGE_TIMEOUT);
        break;

    case STATE_ALIGN:
        /* Apply DC to the d-axis to park the rotor at zero */
        set_open_loop_voltage(ALIGN_VD, 0, 0);
        if (age > ALIGN_DURATION_MS) {
            ENCODER->CNT = 0;       // clear encoder zero
            goto_state(ctx, STATE_OPEN_LOOP);
        }
        break;

    case STATE_OPEN_LOOP:
        ctx->rpm_ref += ctx->accel_ramp_rpm_s * dt;
        if (ctx->rpm_ref >= HFI_HANDOFF_RPM) {
            goto_state(ctx, STATE_HFI);
        }
        break;

    case STATE_HFI:
        ctx->rpm_ref += ctx->accel_ramp_rpm_s * dt;
        if (ctx->rpm_ref >= BEMF_HANDOFF_RPM && bemf_lock_quality_ok()) {
            goto_state(ctx, STATE_BEMF);
        }
        break;

    case STATE_BEMF:
        ctx->rpm_ref = ramp_to(ctx->rpm_ref, ctx->target_rpm,
                               ctx->accel_ramp_rpm_s * dt);
        if (ctx->rpm_actual > FIELDWEAK_RPM) {
            goto_state(ctx, STATE_FIELDWEAK);
        }
        break;

    case STATE_FIELDWEAK:
        /* Field weakening is not a new state but a modifier on BEMF; allow both ways */
        if (ctx->rpm_actual < FIELDWEAK_RPM - HYST) {
            goto_state(ctx, STATE_BEMF);
        }
        break;

    case STATE_FAULT:
        disable_pwm();
        break;
    }
}

/* Key: on transition log to the black box + reset PI integrators */
void goto_state(startup_ctx_t *ctx, startup_state_t next) {
    snapshot_log(ctx->state, next, HAL_GetTick());
    pi_reset(&pi_iq);
    pi_reset(&pi_id);
    ctx->state = next;
    ctx->state_enter_ms = HAL_GetTick();
}`,
    quiz: [
      {
        q: 'What is the first state of the compressor startup state machine?',
        options: ['Alignment', 'Bus pre-charge', 'V/f startup', 'BEMF'],
        correct: 1,
        hint: 'The bus capacitor is empty at power-up. You must pre-charge slowly through a current-limiting resistor (~200 ms) before switching to the normal bus; otherwise the in-rush current is too large.',
      },
      {
        q: 'What does "anti-liquid-slugging ramp 600 rpm/s" mean?',
        options: ['Up to 600 rpm per second', 'per minute', 'per hour', 'per millisecond'],
        correct: 0,
        hint: 'A 600 rpm/s acceleration cap means 0 to 3000 rpm takes at least 5 seconds. It is an industry value; too fast compresses liquid refrigerant and damages valve plates.',
      },
      {
        q: 'In addition to "speed reaches threshold", what else should the criterion for handing off from HFI to BEMF include?',
        options: ['Nothing else', 'BEMF signal quality good enough (magnitude above threshold, PLL locked)', 'Time elapsed', 'Hardware ready'],
        correct: 1,
        hint: 'Speed alone is not enough. Confirm BEMF SNR is sufficient for SMO to lock stably; otherwise the angle diverges at handoff. A hysteresis comparator avoids bouncing.',
      },
      {
        q: 'Why reset the PI integrators on state transition?',
        options: ['Coding style', 'The integral accumulated in the previous state does not match the new state and would cause overshoot at handoff', 'Memory savings', 'Latency reduction'],
        correct: 1,
        hint: 'The V/f phase has no current loop; entering HFI/BEMF closed loop the PI integral should start from 0; otherwise a bad initial offset causes a transient overshoot.',
      },
      {
        q: 'Which fields should the black-box log most prioritise?',
        options: ['Just the state', 'previous state, current state, dwell time, plus key vars at entry (rpm/Iq/Udc/temp)', 'Just a timestamp', 'Just the error code'],
        correct: 1,
        hint: 'Post-mortem most often uses the "snapshot at transition": where did we come from, how long did we sit, what state did we carry. A bare state code cannot locate the issue.',
      },
    ],
  },
  'refrigeration-bench': {
    id: 'refrigeration-bench',
    learningGoals: [
      'Understand the 4 state points of the vapor-compression refrigeration cycle (suction-discharge-condensation-throttle) and read the P-h diagram.',
      'Work back from operating conditions (evaporating/condensing temperature, superheat, outdoor temperature) to pressure ratio, volumetric efficiency, and discharge temperature.',
      'Understand the coupling between COP and motor Iq: cycle-side demand determines the motor-side Iq reference.',
      'Tell apart "system-side problems" (low refrigerant, blockage) from "motor-side problems" (control parameters, sampling fault).',
    ],
    engineeringMeaning: [
      'Motor debugging may look like current-loop tuning, but what the customer experiences is "can it run in steady state under this condition + what is the COP".',
      'Discharge temperature and suction/discharge pressures are compressor lifetime metrics, signalling system issues earlier than winding temperature.',
      'EEV control and FOC speed loop often run on the same MCU; you cannot write a good system state machine without understanding the bench.',
      'APF / energy-rating certification looks at system-level COP, not just motor efficiency; condition optimisation typically has more room than motor optimisation.',
    ],
    introBeginner: {
      metaphor: 'Even great motor and algorithm tuning is invisible to the user — they only feel "is the air conditioning cold enough, is the energy bill reasonable". This module brings the whole refrigeration system in — given outdoor/indoor temperatures and evaporator/condenser temperatures, simulate the vapor-compression cycle, see the real suction/discharge pressures, mass flow, COP, and verify how much Iq the motor really needs.',
      coreIdea: 'Four-step vapor-compression cycle: 1) compressor turns low-pressure gas into high-pressure hot gas; 2) condenser releases heat to outdoor; 3) expansion valve drops the high-pressure liquid into a low-pressure two-phase mixture; 4) evaporator absorbs heat indoors and returns to low-pressure gas. The pressure difference is set by T_e/T_c — larger difference -> more compression work -> larger motor Iq, lower COP.',
      whyCare: [
        'When conditions change (summer vs winter / heavy vs light load), the FOC Iq reference is literally a mapping from the operating condition — it is not picked out of thin air.',
        'Discharge temperature is the compressor lifetime kill switch — over 110 C burns PVE oil and ruins winding insulation.',
        'Customer complaints "no cooling" are almost always cycle-side issues (low refrigerant / blockage / poor condensation); inspecting the suction/discharge pressure ratio is more direct than looking at current.',
        'COP is the core metric for energy certification (tier-1 efficiency / APF); condition optimisation often has more headroom than motor optimisation.',
      ],
      firstAction: 'Adjust evaporating temperature T_e from 5 C to 12 C and watch how suction pressure shifts and COP climbs — this is the real-world switch from "comfort mode" to "boost mode" on an AC.',
    },
    concepts: [
      'The vapor-compression cycle is the engineering implementation of an inverse Carnot cycle — consuming electrical work to move heat from a cold reservoir to a hot one.',
      'Pressure ratio = P_d / P_s = saturation-pressure ratio; typically 3-5 for AC, can reach 8+ for refrigeration.',
      'Volumetric efficiency eta_v = 1 - C x ((P_d/P_s)^(1/n) - 1): the clearance gas re-expands into the suction stroke and crowds out fresh charge.',
      'Discharge temperature T_d follows polytropic compression T_d = T_s x (P_d/P_s)^((n-1)/n); n ~ 1.18-1.25.',
      'Per-unit cooling capacity q_c = h_1 - h_4; per-unit work w = h_2 - h_1; COP = q_c / w.',
      'Two-sided trade-off on superheat: too low (< 3 K) risks liquid slug; too high (> 10 K) sacrifices cooling capacity and raises discharge temperature.',
    ],
    formulas: [
      { title: 'Pressure-temperature relation (simplified Antoine)', expression: 'ln(P_MPa) = A - B/T_K', explanation: 'A, B are refrigerant constants. The three refrigerants in this simulation use (A, B): R-32 (8.515, 2382), R-410A (8.474, 2376), R-134a (8.505, 2658).' },
      { title: 'Polytropic discharge temperature', expression: 'T_d = T_s · (P_d/P_s)^((n-1)/n)', explanation: 'n is the polytropic index. Use 1.20 for R-32, 1.18 for R-410A, 1.13 for R-134a. Each doubling of pressure ratio raises T_d by about 30%.' },
      { title: 'Volumetric efficiency', expression: 'η_v = 1 - C·((P_d/P_s)^(1/n) - 1)', explanation: 'C is the clearance ratio, commonly 3-8%. At PR=5 efficiency falls from 95% to 70%.' },
      { title: 'Mass flow', expression: 'm_dot = ρ_1 · V_disp · η_v · N', explanation: 'rho_1 is the suction density (strongly tied to T_e), V_disp is displacement (m^3), N is shaft speed (rps).' },
      { title: 'COP-to-current coupling', expression: 'τ = W_comp/ω, Iq = τ / (1.5·Pp·ψ_f)', explanation: 'The system side computes W_comp -> mechanical torque tau, from which the FOC Iq is back-solved. This is the bridge of the closed-loop coupling.' },
    ],
    stm32Guide: [
      'EEV control: commonly a stepper EEV from PG / Beck / Sanhua driven by GPIO serial, where step count corresponds to opening (0-500 steps).',
      'Superheat feedback: an NTC on the suction pipe, with SH = T_suct - T_sat(P_s) computed against the saturation pressure. The EEV PI commonly targets SH=5 K.',
      'Discharge protection: derate above 105 C, hard stop above 115 C. Use 100 k NTC B3950 on a dedicated ADC channel.',
      'High/low pressure protection: suction sensor (0.5-4.5 V -> 0-2.5 MPa) and discharge sensor (0.5-4.5 V -> 0-5 MPa) trigger a hardware comparator that kills PWM.',
      'Outdoor temperature: NTC mounted on the condenser inlet side, used as input for derating and EEV feed-forward.',
      'Condition-to-frequency mapping: T_outdoor, T_indoor, target delta-T form a 3D interpolation table -> target speed; typical table 5 x 3 x 5 = 75 operating points.',
    ],
    commonMistakes: [
      'Judging the condition from current magnitude alone, ignoring whether the EEV opens enough. With the EEV stuck small, Iq can be high while the real issue is cycle blockage.',
      'EEV feedback loop using evaporator-exit temperature instead of superheat — once P_s drifts the temperature loses meaning.',
      'After the condenser fan stops, still pushing higher speed, so P_d spikes and the high-pressure protection trips. Always derate before stopping.',
      'Condition-to-frequency table only calibrated at room temperature; extrapolation to extreme heat (> 40 C) or cold (< -5 C) blows up.',
    ],
    debugMethods: [
      'Manual measurement: suction pressure + suction temperature -> compute SH; discharge pressure + discharge temperature -> compute subcooling (in real systems the subcooling sits on the P_d side).',
      'Fast charge / discharge observation: at steady state apply a large load step; watch how long P_d stabilises and whether motor Iq keeps up — a combined indicator of EEV / PFC / FOC speed-loop bandwidth.',
      'Refrigerant leak diagnosis: at the same condition mass flow drops, SH rises, COP drops -> low refrigerant.',
      'Condenser fouling diagnosis: at the same condition P_d rises, T_d rises, COP drops -> dirty condenser or fan stall.',
    ],
    experiments: [
      'Compare R-32 vs R-410A: at the same T_e/T_c, R-32 has 1/3 less mass flow but 5-8% higher COP.',
      'Raise superheat from 5 K to 12 K: cooling capacity drops 8%, discharge temperature rises 8 C. Which red line is hit first?',
      'Outdoor temperature 35 C -> 45 C: T_c climbs -> pressure ratio grows -> eta_v drops -> mass flow shrinks + unit work grows -> COP falls from 3.5 to 2.2.',
      'Enable closed-loop coupling and change T_c; return to module 06 (FOC) to verify iqRef synchronously changes.',
    ],
    summary: 'The refrigeration bench is the most often ignored — and most often biting back — territory of motor-control engineers: no amount of motor stability can save a sick cycle. Master P-h diagrams and the COP derivation and you can communicate with system engineers on the same frequency and tell at a glance whether a complaint is system-side or motor-side.',
    nextSteps: [
      'Return to module 06 (FOC pipeline), turn off closed-loop coupling and switch to manual Iq, and watch the motor response against the load demand computed by this bench.',
      'Visit module 09 (three loops) and test the speed loop\'s disturbance rejection to condition jumps.',
      'Visit module 12 (faults and debugging) and review derived faults like liquid-slug / stall.',
    ],
    codeExample: `/* ============================================
 * Condition acquisition + compressor drive main loop (simplified)
 * ============================================ */

typedef struct {
    float Te_C, Tc_C;          /* from saturation pressure back-solve */
    float Ps_MPa, Pd_MPa;      /* direct sensor read */
    float Tsuct_C, Tdisch_C;   /* NTC */
    float SH_K, SC_K;          /* derived */
    float T_outdoor_C, T_indoor_C;
    uint16_t eev_steps;        /* 0..500 */
} bench_state_t;

/* 1 kHz slow task: condition acquisition and protection */
void bench_slow_task(bench_state_t *s) {
    s->Ps_MPa = adc_to_pressure(adc_low_side_channel);
    s->Pd_MPa = adc_to_pressure(adc_high_side_channel);
    s->Tsuct_C = ntc_to_temp(adc_suction_channel);
    s->Tdisch_C = ntc_to_temp(adc_discharge_channel);

    /* Back-solve saturation temperature (lookup / Antoine inverse) */
    s->Te_C = sat_temp_from_p(s->Ps_MPa, REFRIGERANT);
    s->Tc_C = sat_temp_from_p(s->Pd_MPa, REFRIGERANT);
    s->SH_K = s->Tsuct_C - s->Te_C;
    s->SC_K = s->Tc_C - ntc_to_temp(adc_subcool_channel);

    /* Discharge-temperature protection */
    if (s->Tdisch_C > 115.0f) {
        emergency_stop("DISCHARGE_OVERTEMP");
    } else if (s->Tdisch_C > 105.0f) {
        derate_rpm_target(0.85f);
    }

    /* High-pressure protection */
    if (s->Pd_MPa > pd_threshold_for_outdoor(s->T_outdoor_C)) {
        derate_rpm_target(0.7f);
    }
}

/* 100 Hz EEV PI: superheat tracking */
void eev_pi_task(bench_state_t *s) {
    static float integ = 0;
    const float SH_TARGET = 5.0f;       /* 5 K superheat */
    float err = SH_TARGET - s->SH_K;
    integ += err * 0.01f;
    integ = clampf(integ, -50, 50);
    int16_t delta_steps = (int16_t)(2.0f * err + 5.0f * integ);

    /* SH too low (too wet) -> close EEV; SH too high (too dry) -> open EEV */
    s->eev_steps = clamp_u16(s->eev_steps - delta_steps, 0, 500);
    eev_drive_steps(s->eev_steps);
}

/* Condition-to-frequency map (3D lookup) */
uint16_t lookup_target_rpm(float T_outdoor, float T_indoor, float deltaT_target) {
    /* table[T_out][T_in][dT] -> rpm */
    return rpm_lookup_3d(T_outdoor, T_indoor, deltaT_target);
}

/* Main loop */
void main_loop(void) {
    bench_state_t bench = {0};
    while (1) {
        if (slow_tick_1khz()) bench_slow_task(&bench);
        if (slow_tick_100hz()) eev_pi_task(&bench);
        uint16_t target_rpm = lookup_target_rpm(
            bench.T_outdoor_C, bench.T_indoor_C, get_user_setpoint() - bench.T_indoor_C);
        speed_loop_set_target(target_rpm);
        /* FOC fast loop (10 kHz) is independently driven by the ADC ISR, not here */
    }
}
`,
    quiz: [
      {
        q: 'When outdoor temperature rises from 35 C to 45 C, what mainly drives the COP drop?',
        options: ['Pressure ratio grows while volumetric efficiency drops', 'Refrigerant specific heat changes', 'Motor efficiency changes', 'Indoor temperature changes'],
        correct: 0,
        hint: 'T_c rises -> P_d rises -> pressure ratio grows -> polytropic compression work increases and eta_v decreases, so each unit of mass flow produces less useful work.',
      },
      {
        q: 'Discharge temperature approaching 110 C typically indicates:',
        options: ['Over-charged refrigerant', 'Low superheat combined with high pressure ratio', 'Low condensing pressure', 'High motor winding temperature'],
        correct: 1,
        hint: 'Discharge temperature = suction temperature x (pressure-ratio)^((n-1)/n). Both high suction temperature (= high SH) and high pressure ratio together produce the high reading.',
      },
      {
        q: 'What does the electronic expansion valve (EEV) typically use as feedback?',
        options: ['Discharge temperature', 'Condensing pressure', 'Suction superheat SH', 'Suction pressure'],
        correct: 2,
        hint: 'The EEV core target is "just-vaporised + a little superheat" at the evaporator exit, i.e. SH at 3-7 K.',
      },
      {
        q: 'When the operating condition becomes more severe (T_c rises), how should the FOC module Iq reference change?',
        options: ['No change, the motor self-adapts', 'Lower Iq', 'Raise Iq', 'Reverse Iq'],
        correct: 2,
        hint: 'T_c up -> W_comp up -> mechanical torque up -> the FOC speed loop must raise Iq to hold the speed. This is the closed-loop coupling.',
      },
      {
        q: 'What does COP = 3.5 physically mean?',
        options: ['1 kW of electricity moves 3.5 kW of heat', 'Motor efficiency 350%', 'Refrigerant mass flow is 3.5 times the current', 'Evaporator temperature is 1/3.5 of the condensing temperature'],
        correct: 0,
        hint: 'COP = Q_c / W_input. Note it is "coefficient of performance" not "efficiency" — it can exceed 1 because the energy source also includes heat absorbed from the environment.',
      },
    ],
  },
};





