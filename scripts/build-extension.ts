import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  DEFAULT_PRESETS,
  DEFAULT_SETTINGS,
  INITIAL_CHANNEL_RULES,
} from '../src/data/sampleDefaults';
import { buildExtensionFiles } from '../src/extension/generateExtensionZip';

const EXTENSION_OUT_DIR = path.join(process.cwd(), 'extension');
const ICONS_OUT_DIR = path.join(EXTENSION_OUT_DIR, 'icons');

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function insideRoundedRect(x: number, y: number, size: number, radius: number): boolean {
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  const cx = Math.max(radius, Math.min(size - radius, x));
  const cy = Math.max(radius, Math.min(size - radius, y));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function insidePlayTriangle(
  x: number,
  y: number,
  left: number,
  top: number,
  bottom: number,
  midX: number,
  midY: number
): boolean {
  if (x < left || x > midX || y < top || y > bottom) return false;
  const progress = (x - left) / (midX - left);
  const halfHeight = (1 - progress) * ((bottom - top) / 2);
  return Math.abs(y - midY) <= halfHeight;
}

function renderCadenceIconPng(size: number): Buffer {
  const radius = size * 0.22;
  const left = size * 0.24;
  const top = size * 0.25;
  const bottom = size * 0.75;
  const midX = size * 0.6;
  const midY = size * 0.5;
  const barX = size * 0.67;
  const barWidth = Math.max(2, Math.round(size * 0.11));

  // 4x4 supersampling for clean anti-aliased edges across 16px–128px icons
  const samples = 4;
  const stride = 1 + size * 4;
  const rawScanlines = Buffer.alloc(size * stride);

  for (let py = 0; py < size; py++) {
    const rowOffset = py * stride;
    rawScanlines[rowOffset] = 0; // PNG filter type 0 (None)

    for (let px = 0; px < size; px++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = px + (sx + 0.5) / samples;
          const y = py + (sy + 0.5) / samples;

          if (!insideRoundedRect(x, y, size, radius)) {
            continue;
          }

          if (x >= barX && x <= barX + barWidth && y >= top && y <= bottom) {
            // Stop bar: #F8FAFC (248, 250, 252)
            rSum += 248;
            gSum += 250;
            bSum += 252;
            aSum += 255;
          } else if (insidePlayTriangle(x, y, left, top, bottom, midX, midY)) {
            // Play triangle: #DC2626 (220, 38, 38)
            rSum += 220;
            gSum += 38;
            bSum += 38;
            aSum += 255;
          } else {
            // Rounded badge background: #0F172A (15, 23, 42)
            rSum += 15;
            gSum += 23;
            bSum += 42;
            aSum += 255;
          }
        }
      }

      const totalSamples = samples * samples;
      const alpha = Math.round(aSum / totalSamples);
      const pixelOffset = rowOffset + 1 + px * 4;

      if (alpha === 0) {
        rawScanlines[pixelOffset] = 0;
        rawScanlines[pixelOffset + 1] = 0;
        rawScanlines[pixelOffset + 2] = 0;
        rawScanlines[pixelOffset + 3] = 0;
      } else {
        const coveredSamples = aSum / 255;
        rawScanlines[pixelOffset] = Math.round(rSum / coveredSamples);
        rawScanlines[pixelOffset + 1] = Math.round(gSum / coveredSamples);
        rawScanlines[pixelOffset + 2] = Math.round(bSum / coveredSamples);
        rawScanlines[pixelOffset + 3] = alpha;
      }
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const compressedData = zlib.deflateSync(rawScanlines, { level: 9 });

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressedData),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function main() {
  await fs.mkdir(ICONS_OUT_DIR, { recursive: true });

  const files = buildExtensionFiles(
    DEFAULT_SETTINGS,
    DEFAULT_PRESETS,
    INITIAL_CHANNEL_RULES
  );

  for (const file of files) {
    const outPath = path.join(EXTENSION_OUT_DIR, file.path);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, file.content, 'utf-8');
  }

  for (const size of [16, 32, 48, 128]) {
    const pngBuffer = renderCadenceIconPng(size);
    await fs.writeFile(path.join(ICONS_OUT_DIR, `icon${size}.png`), pngBuffer);
  }

  console.log(
    `Generated standalone Chrome extension in /extension (${files.length} source files + 4 PNG icons, ${INITIAL_CHANNEL_RULES.length} sample rules).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
