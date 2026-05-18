import { describe, expect, it } from 'vitest';
import { buildZip } from '../zipMinimal';

/** Read uint32 LE from a Uint8Array */
function u32(buf: Uint8Array, off: number): number {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(off, true);
}
function u16(buf: Uint8Array, off: number): number {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint16(off, true);
}

describe('buildZip', () => {
  it('produces a valid local file header signature', () => {
    const z = buildZip([{ path: 'a.txt', content: 'hello' }]);
    // 0x04034b50 = local file header
    expect(u32(z, 0)).toBe(0x04034b50);
  });

  it('ends with EOCD signature 0x06054b50', () => {
    const z = buildZip([{ path: 'a.txt', content: 'hello' }]);
    // EOCD is exactly 22 bytes; sig at length-22
    expect(u32(z, z.length - 22)).toBe(0x06054b50);
    // entry count
    expect(u16(z, z.length - 22 + 10)).toBe(1);
  });

  it('records correct entry count for multi-file', () => {
    const z = buildZip([
      { path: 'a.txt', content: 'A' },
      { path: 'b.txt', content: 'BB' },
      { path: 'src/c.c', content: '// hi\n' },
    ]);
    const eocdOff = z.length - 22;
    expect(u32(z, eocdOff)).toBe(0x06054b50);
    expect(u16(z, eocdOff + 8)).toBe(3);
    expect(u16(z, eocdOff + 10)).toBe(3);
  });

  it('writes filename right after local header', () => {
    const z = buildZip([{ path: 'a.txt', content: 'x' }]);
    // header has 30 fixed bytes, then filename
    const nameLen = u16(z, 26);
    expect(nameLen).toBe(5); // 'a.txt'
    const name = new TextDecoder().decode(z.subarray(30, 30 + nameLen));
    expect(name).toBe('a.txt');
  });

  it('handles UTF-8 filenames (Chinese / multi-byte)', () => {
    const z = buildZip([{ path: '说明.md', content: '中' }]);
    const nameLen = u16(z, 26);
    const name = new TextDecoder().decode(z.subarray(30, 30 + nameLen));
    expect(name).toBe('说明.md');
    // UTF-8 flag bit 11 should be set (= 0x0800)
    const flags = u16(z, 6);
    expect(flags & 0x0800).toBe(0x0800);
  });

  it('writes correct CRC32 of stored data', () => {
    // CRC32("hello") = 0x3610a686
    const z = buildZip([{ path: 'a.txt', content: 'hello' }]);
    expect(u32(z, 14)).toBe(0x3610a686);
    // uncompressed size = 5
    expect(u32(z, 22)).toBe(5);
  });

  it('produces empty zip when given empty array (only EOCD)', () => {
    const z = buildZip([]);
    expect(z.length).toBe(22);
    expect(u32(z, 0)).toBe(0x06054b50);
    expect(u16(z, 8)).toBe(0);
  });
});
