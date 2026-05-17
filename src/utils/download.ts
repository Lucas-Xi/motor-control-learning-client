/**
 * 浏览器端文件下载工具（无依赖）。
 *
 * 用 Blob + URL.createObjectURL 触发下载；适用于波形 CSV、参数 JSON、STM32 .c 起步代码。
 * 不走外部接口或第三方库，纯前端，符合本项目"全离线"的要求。
 */

export function downloadText(filename: string, text: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 浏览器异步处理点击事件，延迟释放避免某些 Chromium 版本下载未启动
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 把对象数组转成 CSV 文本；列顺序由 header 决定（找不到的列写空字符串）。 */
export function toCsv<T extends Record<string, unknown>>(rows: T[], header: Array<keyof T>): string {
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    // 含逗号 / 双引号 / 换行 / 前后空格的字段要加双引号转义
    if (/[",\n\r]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    header.map(String).join(','),
    ...rows.map((row) => header.map((k) => escape(row[k])).join(',')),
  ];
  return lines.join('\n');
}

/** 给文件名时间戳，避免重名 */
export function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
