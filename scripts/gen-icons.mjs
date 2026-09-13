// 生成扩展图标 extension/icons/{16,48,128}.png——零依赖手写 PNG 编码（zlib + CRC32），
// 4x 超采样抗锯齿。形象：知伴蓝圆角方块底 + 看山白圆脸 + 两只蓝眼睛。
// 用法：node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../extension/icons');
const BLUE = [5, 109, 232];
const WHITE = [255, 255, 255];

// ---- 最小 PNG 编码 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (1 + size * 4) + 1);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- 绘制（S 为像素边长，返回 RGBA 字节数组）----
function draw(S) {
  const px = new Float64Array(S * S * 4); // 先累积超采样，最后平均
  const put = (x, y, c, a) => {
    const i = (y * S + x) * 4;
    px[i] += c[0] * a; px[i + 1] += c[1] * a; px[i + 2] += c[2] * a; px[i + 3] += a;
  };
  // 背景：圆角方形（角半径 22%），铺满
  const r = S * 0.22;
  const inRoundSq = (x, y) => {
    const x0 = r, x1 = S - r, y0 = r, y1 = S - r;
    if (x >= x0 && x < x1) return true;
    if (y >= y0 && y < y1) return true;
    const cx = x < x0 ? x0 : x1, cy = y < y0 ? y0 : y1;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  // 看山：两只圆耳 + 白圆脸 + 蓝眼睛
  const ear = (x, y) =>
    (x - S * 0.30) ** 2 + (y - S * 0.30) ** 2 <= (S * 0.105) ** 2 ||
    (x - S * 0.70) ** 2 + (y - S * 0.30) ** 2 <= (S * 0.105) ** 2;
  const face = (x, y) => (x - S * 0.5) ** 2 + (y - S * 0.56) ** 2 <= (S * 0.30) ** 2;
  const eye = (x, y) =>
    (x - S * 0.415) ** 2 + (y - S * 0.54) ** 2 <= (S * 0.048) ** 2 ||
    (x - S * 0.585) ** 2 + (y - S * 0.54) ** 2 <= (S * 0.048) ** 2;

  // 超采样 4x：每个输出像素拆 4x4 个采样点
  const SS = 4;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
          if (!inRoundSq(fx, fy)) continue; // 圆角外透明
          if (eye(fx, fy)) { put(x, y, BLUE, 1); continue; }
          if (face(fx, fy) || ear(fx, fy)) { put(x, y, WHITE, 1); continue; }
          put(x, y, BLUE, 1);
        }
      }
    }
  }
  const out = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const a = px[i * 4 + 3];
    if (a === 0) continue;
    out[i * 4] = Math.round(px[i * 4] / a);
    out[i * 4 + 1] = Math.round(px[i * 4 + 1] / a);
    out[i * 4 + 2] = Math.round(px[i * 4 + 2] / a);
    out[i * 4 + 3] = Math.round(a / (SS * SS) * 255);
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
for (const size of [16, 48, 128]) {
  const rgba = draw(size);
  writeFileSync(join(OUT, `${size}.png`), encodePng(size, rgba));
  console.log(`icons/${size}.png`);
}
