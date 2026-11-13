import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import JSZip from 'jszip';
import {
  DEFAULT_PRESETS,
  DEFAULT_SETTINGS,
  EXTENSION_VERSION,
} from '../src/data/sampleDefaults';
import {
  buildExtensionFiles,
  type ExtensionTarget,
} from '../src/extension/generateExtensionZip';
import {
  PROMO_PRESETS,
  renderIntroFrameSvg,
  renderOutroFrameSvg,
} from '../src/utils/promoFrameRenderer';

const CHROME_OUT_DIR = path.join(process.cwd(), 'extension');
const FIREFOX_OUT_DIR = path.join(process.cwd(), 'extension-firefox');
const CWS_ZIP_OUT_PATH = path.join(process.cwd(), 'CWS.zip');
const FIREFOX_ZIP_OUT_PATH = path.join(process.cwd(), 'Firefox.zip');

function auditExtensionJsFile(filePath: string, code: string): void {
  // 1. Verify syntax and parsing integrity via node:vm
  try {
    new vm.Script(code, { filename: filePath });
  } catch (err: any) {
    throw new Error(`[Extension Script Syntax Error] in ${filePath}: ${err.message}`);
  }

  // 2. Automated cross-world identifier audit
  if (filePath.endsWith('content.js')) {
    const forbiddenContentIdentifiers = [
      'getWatchVideoElement',
      'getMainVideo',
      'getMoviePlayer',
      'currentVideoTimeSavedSec',
    ];
    for (const ident of forbiddenContentIdentifiers) {
      const regex = new RegExp(`\\b${ident}\\s*\\(`, 'g');
      if (regex.test(code)) {
        throw new Error(
          `[Extension Identifier Audit Error] content.js calls bridge/DOM-only identifier '${ident}()'. Cross-execution world functions must not be invoked from content script.`
        );
      }
    }
  }

  if (filePath.endsWith('page-bridge.js')) {
    const forbiddenBridgeIdentifiers = [
      'chrome.storage',
      'chrome.runtime',
      'getWatchPlayerElement',
    ];
    for (const ident of forbiddenBridgeIdentifiers) {
      if (code.includes(ident)) {
        throw new Error(
          `[Extension Identifier Audit Error] page-bridge.js references extension-only API '${ident}'. Bridge runs in webpage context without Chrome extension APIs.`
        );
      }
    }
  }
}

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

const PUBLIC_ASSETS_OUT_DIR = path.join(process.cwd(), 'public', 'assets');

function renderCadenceEmblemSvg(): string {
  const size = 1024;
  const radius = +(size * 0.22).toFixed(2); // 225.28
  const left = +(size * 0.24).toFixed(2); // 245.76
  const top = +(size * 0.25).toFixed(2); // 256
  const bottom = +(size * 0.75).toFixed(2); // 768
  const midX = +(size * 0.6).toFixed(2); // 614.4
  const midY = +(size * 0.5).toFixed(2); // 512
  const barX = +(size * 0.67).toFixed(2); // 686.08
  const barWidth = Math.max(2, Math.round(size * 0.11)); // 113
  const barHeight = +(bottom - top).toFixed(2); // 512

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">`,
    `  <rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="#0F172A" />`,
    `  <polygon points="${left},${top} ${midX},${midY} ${left},${bottom}" fill="#DC2626" />`,
    `  <rect x="${barX}" y="${top}" width="${barWidth}" height="${barHeight}" fill="#F8FAFC" />`,
    `</svg>`,
    '',
  ].join('\n');
}

async function buildTargetPackage(
  target: ExtensionTarget,
  outDir: string,
  zipOutPath: string,
  iconBuffers: Array<{ size: number; buffer: Buffer }>
): Promise<number> {
  const iconsDir = path.join(outDir, 'icons');
  await fs.mkdir(iconsDir, { recursive: true });

  // Store & standalone unpacked builds start with 0 pre-seeded channel rules
  const files = buildExtensionFiles(DEFAULT_SETTINGS, DEFAULT_PRESETS, [], target);
  const zip = new JSZip();

  for (const file of files) {
    if (file.path.endsWith('.js')) {
      auditExtensionJsFile(file.path, file.content);
    }
    const outPath = path.join(outDir, file.path);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, file.content, 'utf-8');
    zip.file(file.path, file.content);
  }

  for (const { size, buffer } of iconBuffers) {
    await fs.writeFile(path.join(iconsDir, `icon${size}.png`), buffer);
    zip.file(`icons/icon${size}.png`, buffer);
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  await fs.writeFile(zipOutPath, zipBuffer);
  return zipBuffer.byteLength;
}

async function main() {
  await fs.mkdir(PUBLIC_ASSETS_OUT_DIR, { recursive: true });

  const iconBuffers = [16, 32, 48, 128].map((size) => ({
    size,
    buffer: renderCadenceIconPng(size),
  }));

  const chromeZipBytes = await buildTargetPackage(
    'chrome',
    CHROME_OUT_DIR,
    CWS_ZIP_OUT_PATH,
    iconBuffers
  );
  const firefoxZipBytes = await buildTargetPackage(
    'firefox',
    FIREFOX_OUT_DIR,
    FIREFOX_ZIP_OUT_PATH,
    iconBuffers
  );

  // High-resolution 4K-ready brand emblem & promo bookend assets (kept outside extension zips to preserve lean package size)
  const emblemSvg = renderCadenceEmblemSvg();
  const emblem1024Png = renderCadenceIconPng(1024);
  const intro4kSvg = renderIntroFrameSvg(PROMO_PRESETS.polished.intro);
  const outro4kSvg = renderOutroFrameSvg(PROMO_PRESETS.polished.outro);

  await fs.writeFile(path.join(PUBLIC_ASSETS_OUT_DIR, 'cadence-emblem.svg'), emblemSvg, 'utf-8');
  await fs.writeFile(path.join(PUBLIC_ASSETS_OUT_DIR, 'cadence-emblem-1024.png'), emblem1024Png);
  await fs.writeFile(path.join(PUBLIC_ASSETS_OUT_DIR, 'cadence-intro-4k.svg'), intro4kSvg, 'utf-8');
  await fs.writeFile(path.join(PUBLIC_ASSETS_OUT_DIR, 'cadence-outro-4k.svg'), outro4kSvg, 'utf-8');

  console.log(
    `Generated Cadence v${EXTENSION_VERSION}: Chrome (/extension + CWS.zip ${(chromeZipBytes / 1024).toFixed(1)} KB), Firefox (/extension-firefox + Firefox.zip ${(firefoxZipBytes / 1024).toFixed(1)} KB), and 4K promo assets in /public/assets/.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
