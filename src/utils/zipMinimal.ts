/**
 * 最小可用 zip 打包器（STORE 模式，无压缩）。
 *
 * 为什么自写而不引 jszip / fflate：
 *  - 项目约束"不引入新依赖"
 *  - zip 的 STORE 模式（不压缩）格式极简：本地文件头 + 数据 + 中央目录 + EOCD
 *  - STM32 项目骨架是纯 ASCII C 源码，压缩比有限；本地解压时 7z / explorer / unzip 都支持 STORE
 *
 * CompressionStream 当然能跑 DEFLATE，但需要额外封装 stream → ArrayBuffer 的胶水
 * 和 CRC32 同步流程；为了让代码量可读 + 测试可控，这里走 STORE。
 *
 * 参考：APPNOTE.TXT v6.3.10 §4.3
 *  - 本地文件头：0x04034b50  (4 bytes)
 *  - 中央目录头：0x02014b50  (4 bytes)
 *  - EOCD     ：0x06054b50  (4 bytes)
 *
 * 编码：文件名按 UTF-8 编（设置 general purpose bit 11），适应中文/Markdown 字符。
 */

/** CRC32 (IEEE 802.3 polynomial 0xEDB88320) */
function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

const enc = new TextEncoder();

export interface ZipFile {
  /** 路径 - 用正斜杠，不要含 .. 或盘符前缀 */
  path: string;
  /** 文件内容 - 字符串走 UTF-8；Uint8Array 原样写入 */
  content: string | Uint8Array;
}

/**
 * 把一组文件打成 zip 字节流（STORE）。
 *
 * 返回 Uint8Array（可直接喂 downloadBinary）。
 * 限制：单文件 < 4 GiB，总文件数无显式上限（中央目录用 16-bit 计数器，<65535）。
 * STM32 骨架最多 10 个文件 × 几十 KB，远远在限制内。
 */
export function buildZip(files: ZipFile[]): Uint8Array {
  const central: Uint8Array[] = [];   // 中央目录条目
  const local: Uint8Array[] = [];     // 本地文件块（含 header + data）
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.path);
    const data = typeof f.content === 'string' ? enc.encode(f.content) : f.content;
    const crc = crc32(data);
    const size = data.length;
    // 本地文件头 (30 bytes) + filename + data
    const lfh = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(lfh.buffer);
    dv.setUint32(0, 0x04034b50, true);     // signature
    dv.setUint16(4, 20, true);              // version needed
    dv.setUint16(6, 0x0800, true);          // general purpose flags: bit 11 = UTF-8 name
    dv.setUint16(8, 0, true);               // method = STORE
    dv.setUint16(10, 0, true);              // mod time
    dv.setUint16(12, 0x21, true);           // mod date (1980-01-01 + 1 = 1980-01-01, valid placeholder)
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);           // compressed size
    dv.setUint32(22, size, true);           // uncompressed size
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);              // extra length
    lfh.set(nameBytes, 30);
    local.push(lfh, data);

    // 中央目录条目 (46 bytes) + filename
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);     // signature
    cv.setUint16(4, 20, true);              // version made by
    cv.setUint16(6, 20, true);              // version needed
    cv.setUint16(8, 0x0800, true);          // flags UTF-8
    cv.setUint16(10, 0, true);              // method STORE
    cv.setUint16(12, 0, true);              // mod time
    cv.setUint16(14, 0x21, true);           // mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);              // extra
    cv.setUint16(32, 0, true);              // comment
    cv.setUint16(34, 0, true);              // disk start
    cv.setUint16(36, 0, true);              // internal attrs
    cv.setUint32(38, 0, true);              // external attrs
    cv.setUint32(42, offset, true);         // relative offset of local header
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += lfh.length + data.length;
  }

  // 拼装：local 块 + 中央目录 + EOCD(22 bytes)
  const localSize = local.reduce((s, b) => s + b.length, 0);
  const centralSize = central.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);                 // disk number
  ev.setUint16(6, 0, true);                 // disk where central starts
  ev.setUint16(8, files.length, true);      // # entries on this disk
  ev.setUint16(10, files.length, true);     // total # entries
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, localSize, true);        // offset of central directory
  ev.setUint16(20, 0, true);                // comment length

  const out = new Uint8Array(localSize + centralSize + eocd.length);
  let p = 0;
  for (const b of local) { out.set(b, p); p += b.length; }
  for (const b of central) { out.set(b, p); p += b.length; }
  out.set(eocd, p);
  return out;
}
