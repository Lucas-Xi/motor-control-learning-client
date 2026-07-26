export const THREE_COLORS = {
  background: '#07111f',
  surface: '#0d1929',
  line: '#2c3d57',
  lineStrong: '#5d7793',
  ink: '#e7f3ff',
  inkMuted: '#9eb5cb',
  primary: '#34d6ff',
  measure: '#43f7b5',
  warn: '#ffb84d',
  fault: '#ff5c7a',
  rotor: '#cfe2f5',
  stator: '#3a5a7e',
} as const;

export const PHASE_COLORS = [THREE_COLORS.primary, THREE_COLORS.measure, THREE_COLORS.warn] as const;