import type { Transition, Variants } from 'framer-motion';

export const motionDuration = {
  fast: 0.18,
  base: 0.26,
  slow: 0.44,
  pulse: 1.6,
} as const;

export const motionEase = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
  pulse: [0.4, 0, 0.6, 1] as [number, number, number, number],
} as const;

export const easeOut: Transition = { duration: motionDuration.base, ease: motionEase.out };
export const easeFast: Transition = { duration: motionDuration.fast, ease: motionEase.out };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: easeOut },
  exit: { opacity: 0, y: -8, transition: easeFast },
};

export const moduleSwap: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: motionDuration.base, ease: motionEase.out } },
  exit: { opacity: 0, y: -8, transition: { duration: motionDuration.fast, ease: motionEase.out } },
};

export const flowPulse: Transition = {
  duration: motionDuration.pulse,
  ease: motionEase.pulse,
  repeat: Infinity,
  repeatType: 'mirror',
};

export const railShimmer: Transition = {
  duration: 2.4,
  ease: 'linear',
  repeat: Infinity,
};

export const moduleEntry: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: easeOut },
};
