import { Children, cloneElement, isValidElement, useLayoutEffect, useRef, useState, type ReactElement } from 'react';

interface SafeResponsiveContainerProps {
  children: ReactElement;
}

/**
 * Recharts ResponsiveContainer can warn when CSS grid measures -1 on the first frame.
 * This wrapper measures the real host div with ResizeObserver and injects numeric
 * width/height into the chart, eliminating first-frame sizing noise.
 */
export function SafeResponsiveContainer({ children }: SafeResponsiveContainerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const update = () => {
      const rect = host.getBoundingClientRect();
      setSize({ width: Math.max(0, Math.floor(rect.width)), height: Math.max(0, Math.floor(rect.height)) });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    const raf = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  const chart = Children.only(children);
  return (
    <div ref={hostRef} className="h-full min-h-0 w-full min-w-0">
      {size.width > 0 && size.height > 0 && isValidElement(chart)
        ? cloneElement(chart as ReactElement<Record<string, unknown>>, { width: size.width, height: size.height })
        : null}
    </div>
  );
}
