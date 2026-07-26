export function shortestAngleDelta(target: number, current: number): number {
  return ((target - current + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

export function approachAngle(current: number, target: number, deltaSeconds: number, speed = 12): number {
  return current + shortestAngleDelta(target, current) * Math.min(1, deltaSeconds * speed);
}