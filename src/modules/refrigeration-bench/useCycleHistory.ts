import { useEffect, useRef, useState } from 'react';

/**
 * 把"每帧把若干 metric 推进定长数组、强制重渲染画 sparkline"的样板抽成 hook。
 *
 * 用法：
 *   const history = useCycleHistory({ cop, Td, Qc, Iq });
 *   <Sparkline data={history.cop} ... />
 *
 * 性能注意：history 是同一个对象引用、内部数组也是同一份引用——只有内容被 push/shift。
 * 这是有意的：sparkline 只需要拿到当前帧的数组快照画图，不需要每次创建新数组。
 * `force((t) => t + 1)` 触发的重渲染会让 sparkline 重新读取数组内容。
 */
export function useCycleHistory<K extends string>(
  values: Record<K, number>,
  maxLen = 40,
): Record<K, number[]> {
  const histRef = useRef<Record<string, number[]>>({});

  // 关键：首次渲染时 useEffect 还没跑，histRef.current 仍是 {}。
  // 如果直接返回 ref，调用方 history.cop 就是 undefined → Sparkline 收到
  // data={undefined} 会 data.length 崩溃。因此在每次渲染时同步保证所有 key
  // 至少存在一个空数组（O(N) cheap，N=指标数）。
  for (const key of Object.keys(values) as K[]) {
    if (!histRef.current[key]) histRef.current[key] = [];
  }

  const [, force] = useState(0);

  // 用 join 把所有数值变化压成单一依赖键——避免 useEffect 的变长 deps 数组警告，
  // 同时与"任何一个 metric 变化都要推进历史"的语义一致。
  const fp = (Object.keys(values) as K[]).map((k) => values[k]).join('|');

  useEffect(() => {
    const h = histRef.current;
    for (const key of Object.keys(values) as K[]) {
      if (!h[key]) h[key] = [];
      h[key].push(values[key]);
      if (h[key].length > maxLen) h[key].shift();
    }
    force((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp, maxLen]);

  return histRef.current as Record<K, number[]>;
}
