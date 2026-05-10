import { useCallback, useEffect, useRef } from 'react';

type AnyFn = (...args: never[]) => void;

export function useRafThrottle<T extends AnyFn>(callback: T): T {
  const latestArgs = useRef<unknown[] | null>(null);
  const frame = useRef<number | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const flush = useCallback(() => {
    frame.current = null;
    if (latestArgs.current) {
      const args = latestArgs.current;
      latestArgs.current = null;
      (callbackRef.current as unknown as (...a: unknown[]) => void)(...args);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      latestArgs.current = null;
    };
  }, []);

  const throttled = useCallback((...args: unknown[]) => {
    latestArgs.current = args;
    if (frame.current === null) {
      frame.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  return throttled as unknown as T;
}
