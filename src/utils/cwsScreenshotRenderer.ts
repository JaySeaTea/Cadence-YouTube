import JSZip from 'jszip';
import { ensurePromoFontsReady } from './promoFrameRenderer';

export interface CwsHighlightBox {
  /** Coordinates in the source screenshot's native pixel space */
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  color: string;
  glowColor: string;
  badgeText?: string;
  badgeAlign?: 'top-left' | 'top-right' | 'bottom-right';
}

export interface CwsSlideSpec {
  id: string;
  slideNumber: string;
  filename: string;
  imageUrl: string;
  layout: 'wide' | 'split-popup' | 'split-options';
  eyebrow: string;
  headline: string;
  subtitle: string;
  crop?: { x: number; y: number; w: number; h: number };
  highlights: CwsHighlightBox[];
  callouts: Array<{ label: string; detail?: string; accent: 'red' | 'emerald' | 'amber' }>;
}

export const CWS_SLIDE_SPECS: CwsSlideSpec[] = [
  {
    id: 'slide-1-watch-deck',
    slideNumber: '01',
    filename: '01-cadence-channel-speed-deck-1280x800.png',
    imageUrl: '/assets/aistudio/Zoomed_Channel_Rule_Active_03536fe2.png',
    layout: 'wide',
    eyebrow: 'AUTOMATIC PER-CHANNEL PLAYBACK SPEED',
    headline: 'Every YouTube Channel, Automatically at Your Speed',
    subtitle:
      'Applies saved channel rules on load, calculates real wall-clock time saved, and adds 10s / 30s / 60s skip capsules.',
    highlights: [
      {
        srcX: 8,
        srcY: 378,
        srcW: 1585,
        srcH: 118,
        color: '#EF4444',
        glowColor: 'rgba(239, 68, 68, 0.38)',
        badgeText: 'Full-Width Cadence Watch Deck',
        badgeAlign: 'top-right',
      },
    ],
    callouts: [
      { label: 'Channel Rule · 1.75× Auto-Applied', accent: 'red' },
      { label: 'Saves 29s Wall-Clock Telemetry', accent: 'emerald' },
      { label: '10s / 30s / 60s Instant Skip & Replay', accent: 'red' },
    ],
  },
  {
    id: 'slide-2-popup',
    slideNumber: '02',
    filename: '02-cadence-toolbar-popup-1280x800.png',
    imageUrl: '/assets/aistudio/Cadence_Extension_Popup_e0743e90.png',
    layout: 'split-popup',
    eyebrow: 'PINNED CHROME TOOLBAR POPUP',
    headline: 'One-Click Channel Rules & Global Toggles',
    subtitle:
      'Switch category profiles, fine-tune in 0.05× steps, convert Shorts to the standard player, and toggle playlist guards.',
    // Privacy-safe crop: keeps pinned 1.75x Chrome badge + full popup while excluding personal YouTube avatar on far right
    crop: { x: 162, y: 40, w: 493, h: 716 },
    highlights: [
      {
        srcX: 604,
        srcY: 46,
        srcW: 48,
        srcH: 48,
        color: '#EF4444',
        glowColor: 'rgba(239, 68, 68, 0.45)',
      },
    ],
    callouts: [
      {
        label: 'Category Presets & 0.05× Fine Stepper',
        detail: 'Assign Music (1.0×), Educational (1.5×), Podcast (2.0×), or custom speeds.',
        accent: 'red',
      },
      {
        label: 'Shorts → Standard Watch Player',
        detail: 'Redirects /shorts/ to full timeline controls without back-button loops.',
        accent: 'emerald',
      },
      {
        label: 'Live Speed Badge in Toolbar',
        detail: 'Always see the active playback multiplier at a glance (1.75x).',
        accent: 'amber',
      },
    ],
  },
  {
    id: 'slide-3-playlist-stop',
    slideNumber: '03',
    filename: '03-cadence-playlist-hard-stop-1280x800.png',
    imageUrl: '/assets/aistudio/End_of_Video_Stop_in_Playlist_2de23529.png',
    layout: 'wide',
    eyebrow: 'PLAYLIST & WATCH LATER GUARD',
    headline: 'Stop Forced Auto-Advance at the End of Any Video',
    subtitle:
      'Holds cleanly when a video finishes—even inside Watch Later (list=WL) and multi-part course playlists.',
    highlights: [
      {
        srcX: 30,
        srcY: 274,
        srcW: 1528,
        srcH: 96,
        color: '#EF4444',
        glowColor: 'rgba(239, 68, 68, 0.42)',
        badgeText: 'Auto-Advance Blocked — Advance Only When Ready',
        badgeAlign: 'top-left',
      },
    ],
    callouts: [
      { label: 'Works in Playlists & Watch Later', accent: 'emerald' },
      { label: 'Blocks Up Next Countdown', accent: 'red' },
      { label: '1-Click Replay or Play Next', accent: 'red' },
    ],
  },
  {
    id: 'slide-4-live-dvr',
    slideNumber: '04',
    filename: '04-cadence-live-stream-dvr-1280x800.png',
    imageUrl: '/assets/aistudio/Cadence_-_Live_stream_DVR_d54d2a6f.png',
    layout: 'wide',
    eyebrow: 'LIVE STREAM DVR TELEMETRY',
    headline: 'Smart Live Stream Catch-Up & Real-Time Buffer Tracking',
    subtitle:
      'Rewind any DVR live broadcast to unlock accelerated catch-up speeds with a live countdown to the broadcast edge.',
    highlights: [
      {
        srcX: 8,
        srcY: 282,
        srcW: 1580,
        srcH: 117,
        color: '#F59E0B',
        glowColor: 'rgba(245, 158, 11, 0.38)',
        badgeText: '-12m Behind Live · Catch-Up in 16m @ 1.75×',
        badgeAlign: 'top-left',
      },
    ],
    callouts: [
      { label: 'Live Offset & Catch-Up Countdown', accent: 'amber' },
      { label: 'Auto-Locks at 1.0× Live Edge', accent: 'emerald' },
      { label: 'Non-DVR Stream Warning Notice', accent: 'red' },
    ],
  },
  {
    id: 'slide-5-options',
    slideNumber: '05',
    filename: '05-cadence-options-dashboard-1280x800.png',
    imageUrl: '/assets/aistudio/Cadence_-_Options_Page_8874fd68.png',
    layout: 'split-options',
    eyebrow: '100% LOCAL & PRIVATE STORAGE',
    headline: 'Category Speed Profiles & Portable JSON Backups',
    subtitle:
      'Manage all channel rules in one clean dashboard—stored locally in Chrome with zero analytics or cloud tracking.',
    highlights: [],
    callouts: [
      {
        label: 'Reusable Category Profiles',
        detail: 'Update Educational or Podcast speed once to adjust every linked channel.',
        accent: 'red',
      },
      {
        label: '1-Click JSON Import & Backup',
        detail: 'Export your channel rules anytime as a clean, human-readable JSON file.',
        accent: 'emerald',
      },
      {
        label: 'Minimal Permissions Only',
        detail: 'Uses only storage & scripting on YouTube—zero browsing history access.',
        accent: 'amber',
      },
    ],
  },
];

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

function crc32Bytes(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32BE(arr: Uint8Array, offset: number, val: number) {
  arr[offset] = (val >>> 24) & 0xff;
  arr[offset + 1] = (val >>> 16) & 0xff;
  arr[offset + 2] = (val >>> 8) & 0xff;
  arr[offset + 3] = val & 0xff;
}

function makePngChunkBytes(typeAscii: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  writeUint32BE(chunk, 0, data.length);
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = typeAscii.charCodeAt(i);
  }
  chunk.set(data, 8);
  const crc = crc32Bytes(chunk.subarray(4, 8 + data.length));
  writeUint32BE(chunk, 8 + data.length, crc);
  return chunk;
}

/**
 * Encodes an HTMLCanvasElement as a genuine 24-bit RGB PNG (IHDR color_type = 2, NO alpha channel).
 * Standard browser canvas.toBlob('image/png') outputs 32-bit RGBA (color_type = 6), which the
 * Chrome Web Store Developer Dashboard rejects for store screenshots and promo tiles.
 */
export async function encodeCanvasTo24BitPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  const rgba = ctx.getImageData(0, 0, width, height).data;
  const rowStride = 1 + width * 3; // 1 filter byte + 3 RGB bytes per pixel
  const rawScanlines = new Uint8Array(height * rowStride);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowStride;
    rawScanlines[rowStart] = 0; // Filter type 0 (None)
    let dst = rowStart + 1;
    let src = y * width * 4;
    for (let x = 0; x < width; x++) {
      const a = rgba[src + 3] / 255;
      // Composite onto #050811 obsidian in case any subpixel had <255 alpha
      rawScanlines[dst] = Math.round(rgba[src] * a + 5 * (1 - a));
      rawScanlines[dst + 1] = Math.round(rgba[src + 1] * a + 8 * (1 - a));
      rawScanlines[dst + 2] = Math.round(rgba[src + 2] * a + 17 * (1 - a));
      dst += 3;
      src += 4;
    }
  }

  // Stream scanlines concurrently through RFC 1950 zlib CompressionStream (avoids getWriter backpressure deadlock on >64KB buffers)
  const compressedStream = new Blob([rawScanlines])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  const compressed = new Uint8Array(await new Response(compressedStream).arrayBuffer());

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  writeUint32BE(ihdr, 0, width);
  writeUint32BE(ihdr, 4, height);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 2; // Color type 2 = Truecolor RGB (24-bit, NO alpha!)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makePngChunkBytes('IHDR', ihdr);
  const idatChunk = makePngChunkBytes('IDAT', compressed);
  const iendChunk = makePngChunkBytes('IEND', new Uint8Array(0));

  const totalLen =
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const fullPng = new Uint8Array(totalLen);
  let pos = 0;
  for (const part of [signature, ihdrChunk, idatChunk, iendChunk]) {
    fullPng.set(part, pos);
    pos += part.length;
  }

  return new Blob([fullPng], { type: 'image/png' });
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadPromoImage(src: string): Promise<HTMLImageElement> {
  const existing = imageCache.get(src);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      imageCache.delete(src);
      reject(err);
    };
    img.src = src;
  });

  imageCache.set(src, promise);
  return promise;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCwsCanvasBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  glowX: number,
  glowY: number
) {
  ctx.fillStyle = '#050811';
  ctx.fillRect(0, 0, width, height);

  const slateGrad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    0,
    width * 0.5,
    height * 0.42,
    width * 0.72
  );
  slateGrad.addColorStop(0, 'rgba(19, 28, 49, 0.78)');
  slateGrad.addColorStop(0.6, 'rgba(9, 13, 24, 0.95)');
  slateGrad.addColorStop(1, 'rgba(5, 8, 17, 1)');
  ctx.fillStyle = slateGrad;
  ctx.fillRect(0, 0, width, height);

  // Signature warm crimson ambient bloom matching the promo video bookends
  const crimsonGrad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, width * 0.48);
  crimsonGrad.addColorStop(0, 'rgba(220, 38, 38, 0.22)');
  crimsonGrad.addColorStop(0.42, 'rgba(185, 28, 28, 0.09)');
  crimsonGrad.addColorStop(1, 'rgba(5, 8, 17, 0)');
  ctx.fillStyle = crimsonGrad;
  ctx.fillRect(0, 0, width, height);
}

function drawMiniEmblemAndEyebrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  eyebrow: string,
  centered: boolean
) {
  ctx.save();
  ctx.font = '700 13px "JetBrains Mono", ui-monospace, monospace';
  const textW = ctx.measureText(eyebrow).width;
  const iconW = 18;
  const gap = 10;
  const totalW = iconW + gap + textW;
  const startX = centered ? x - totalW / 2 : x;

  // Mini Play triangle
  ctx.beginPath();
  ctx.moveTo(startX, cy - 7);
  ctx.lineTo(startX + 11, cy);
  ctx.lineTo(startX, cy + 7);
  ctx.closePath();
  ctx.fillStyle = '#EF4444';
  ctx.fill();

  // Mini Stop bar
  roundedRect(ctx, startX + 14, cy - 7, 3.5, 14, 1);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FCA5A5';
  ctx.fillText(eyebrow, startX + iconW + gap, cy + 0.5);
  ctx.restore();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawHighlightsOverImage(
  ctx: CanvasRenderingContext2D,
  spec: CwsSlideSpec,
  cropX: number,
  cropY: number,
  destX: number,
  destY: number,
  scaleX: number,
  scaleY: number
) {
  for (const hl of spec.highlights) {
    const hx = destX + (hl.srcX - cropX) * scaleX;
    const hy = destY + (hl.srcY - cropY) * scaleY;
    const hw = hl.srcW * scaleX;
    const hh = hl.srcH * scaleY;

    ctx.save();
    ctx.shadowColor = hl.glowColor;
    ctx.shadowBlur = 18;
    roundedRect(ctx, hx, hy, hw, hh, 10);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = hl.color;
    ctx.stroke();
    ctx.restore();

    if (hl.badgeText) {
      ctx.save();
      ctx.font = '700 12px "JetBrains Mono", ui-monospace, monospace';
      const tw = ctx.measureText(hl.badgeText).width;
      const bw = tw + 22;
      const bh = 24;
      let bx = hx + 10;
      if (hl.badgeAlign === 'top-right' || hl.badgeAlign === 'bottom-right') {
        bx = hx + hw - bw - 10;
      }
      const by = hy - bh / 2 - 2;

      roundedRect(ctx, bx, by, bw, bh, 7);
      ctx.fillStyle = '#0B0F19';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = hl.color;
      ctx.stroke();

      ctx.fillStyle = '#F8FAFC';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(hl.badgeText, bx + 11, by + bh / 2 + 0.5);
      ctx.restore();
    }
  }
}

export async function renderCwsSlideToCanvas(
  canvas: HTMLCanvasElement,
  spec: CwsSlideSpec,
  showAnnotations: boolean
): Promise<void> {
  const width = 1280;
  const height = 800;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  await ensurePromoFontsReady();
  const img = await loadPromoImage(spec.imageUrl);

  const cropX = spec.crop ? spec.crop.x : 0;
  const cropY = spec.crop ? spec.crop.y : 0;
  const cropW = spec.crop ? spec.crop.w : img.naturalWidth;
  const cropH = spec.crop ? spec.crop.h : img.naturalHeight;

  if (spec.layout === 'wide') {
    drawCwsCanvasBackdrop(ctx, width, height, width * 0.5, height * 0.48);

    // Top Editorial Header
    drawMiniEmblemAndEyebrow(ctx, width / 2, 46, spec.eyebrow, true);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '800 35px "Plus Jakarta Sans", -apple-system, sans-serif';
    ctx.fillText(spec.headline, width / 2, 95);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 16.5px "Public Sans", -apple-system, sans-serif';
    ctx.fillText(spec.subtitle, width / 2, 128);
    ctx.restore();

    // Screenshot Frame Area
    const maxFrameW = 1184;
    const maxFrameH = showAnnotations ? 512 : 576;
    const fitScale = Math.min(maxFrameW / cropW, maxFrameH / cropH);
    const drawW = Math.round(cropW * fitScale);
    const drawH = Math.round(cropH * fitScale);
    const drawX = Math.round((width - drawW) / 2);
    const arenaTop = 158;
    const arenaBottom = showAnnotations ? 706 : 762;
    const drawY = Math.round(arenaTop + (arenaBottom - arenaTop - drawH) / 2);

    // Subtle elevation card shadow + crisp 1.5px slate border
    ctx.save();
    ctx.shadowColor = 'rgba(2, 6, 23, 0.78)';
    ctx.shadowBlur = 38;
    ctx.shadowOffsetY = 14;
    roundedRect(ctx, drawX, drawY, drawW, drawH, 14);
    ctx.fillStyle = '#0B0F19';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundedRect(ctx, drawX, drawY, drawW, drawH, 14);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, cropX, cropY, cropW, cropH, drawX, drawY, drawW, drawH);
    ctx.restore();

    ctx.save();
    roundedRect(ctx, drawX, drawY, drawW, drawH, 14);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.stroke();
    ctx.restore();

    if (showAnnotations) {
      drawHighlightsOverImage(
        ctx,
        spec,
        cropX,
        cropY,
        drawX,
        drawY,
        drawW / cropW,
        drawH / cropH
      );

      // Bottom 3 Feature Pills
      const pillGap = 16;
      ctx.font = '600 13.5px "JetBrains Mono", ui-monospace, monospace';
      const pillWidths = spec.callouts.map((c) => ctx.measureText(c.label).width + 44);
      const totalRowW =
        pillWidths.reduce((s, w) => s + w, 0) + pillGap * (spec.callouts.length - 1);
      let cursorX = (width - totalRowW) / 2;
      const pillY = 724;
      const pillH = 38;

      spec.callouts.forEach((callout, idx) => {
        const pw = pillWidths[idx];
        const dotColor =
          callout.accent === 'emerald'
            ? '#34D399'
            : callout.accent === 'amber'
              ? '#F59E0B'
              : '#EF4444';

        ctx.save();
        roundedRect(ctx, cursorX, pillY, pw, pillH, 10);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.72)';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cursorX + 16, pillY + pillH / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        ctx.font = '600 13.5px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillStyle = '#E2E8F0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(callout.label, cursorX + 27, pillY + pillH / 2 + 0.5);
        ctx.restore();

        cursorX += pw + pillGap;
      });
    }
    return;
  }

  // Split 2-column layouts (Slide 2 Popup & Slide 5 Options Dashboard)
  const isPopup = spec.layout === 'split-popup';
  const leftX = 64;
  const leftMaxW = isPopup ? 545 : 405;
  const rightAreaX = isPopup ? 660 : 504;
  const rightAreaW = width - rightAreaX - 52;

  drawCwsCanvasBackdrop(ctx, width, height, rightAreaX + rightAreaW * 0.5, height * 0.5);

  // Left Column Copy
  drawMiniEmblemAndEyebrow(ctx, leftX, 88, spec.eyebrow, false);

  ctx.save();
  ctx.fillStyle = '#F8FAFC';
  ctx.font = isPopup
    ? '800 38px "Plus Jakarta Sans", -apple-system, sans-serif'
    : '800 33px "Plus Jakarta Sans", -apple-system, sans-serif';
  const titleLines = wrapTextLines(ctx, spec.headline, leftMaxW);
  let textY = 142;
  const lineH = isPopup ? 46 : 41;
  for (const line of titleLines) {
    ctx.fillText(line, leftX, textY);
    textY += lineH;
  }

  textY += 8;
  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 16.5px "Public Sans", -apple-system, sans-serif';
  const subLines = wrapTextLines(ctx, spec.subtitle, leftMaxW);
  for (const sLine of subLines) {
    ctx.fillText(sLine, leftX, textY);
    textY += 25;
  }
  ctx.restore();

  // Left Column Structured Feature Callout Cards
  let cardY = textY + 26;
  for (const item of spec.callouts) {
    const dotColor =
      item.accent === 'emerald'
        ? '#34D399'
        : item.accent === 'amber'
          ? '#F59E0B'
          : '#EF4444';

    ctx.save();
    ctx.font = '500 14px "Public Sans", -apple-system, sans-serif';
    const detailLines = item.detail ? wrapTextLines(ctx, item.detail, leftMaxW - 44) : [];
    const cardH = 44 + detailLines.length * 20 + (detailLines.length > 0 ? 10 : 0);

    roundedRect(ctx, leftX, cardY, leftMaxW, cardH, 12);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(leftX + 18, cardY + 23, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    ctx.font = '700 15px "Plus Jakarta Sans", -apple-system, sans-serif';
    ctx.fillStyle = '#F8FAFC';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, leftX + 31, cardY + 23.5);

    if (detailLines.length > 0) {
      ctx.font = '400 13.5px "Public Sans", -apple-system, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.textBaseline = 'alphabetic';
      let dy = cardY + 48;
      for (const dLine of detailLines) {
        ctx.fillText(dLine, leftX + 31, dy);
        dy += 19;
      }
    }
    ctx.restore();
    cardY += cardH + 14;
  }

  // Right Column Framed Screenshot
  const maxRightH = 708;
  const fitScale = Math.min(rightAreaW / cropW, maxRightH / cropH);
  const drawW = Math.round(cropW * fitScale);
  const drawH = Math.round(cropH * fitScale);
  const drawX = Math.round(rightAreaX + (rightAreaW - drawW) / 2);
  const drawY = Math.round((height - drawH) / 2);

  ctx.save();
  ctx.shadowColor = 'rgba(2, 6, 23, 0.82)';
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 16;
  roundedRect(ctx, drawX, drawY, drawW, drawH, 16);
  ctx.fillStyle = '#0B0F19';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, drawX, drawY, drawW, drawH, 16);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, cropX, cropY, cropW, cropH, drawX, drawY, drawW, drawH);
  ctx.restore();

  ctx.save();
  roundedRect(ctx, drawX, drawY, drawW, drawH, 16);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
  ctx.stroke();
  ctx.restore();

  if (showAnnotations && spec.highlights.length > 0) {
    drawHighlightsOverImage(
      ctx,
      spec,
      cropX,
      cropY,
      drawX,
      drawY,
      drawW / cropW,
      drawH / cropH
    );
  }
}

/**
 * Renders the Chrome Web Store Small Promo Tile (440x280, 24-bit RGB compatible).
 */
export async function renderCwsSmallPromoTileToCanvas(
  canvas: HTMLCanvasElement
): Promise<void> {
  const width = 440;
  const height = 280;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  await ensurePromoFontsReady();
  drawCwsCanvasBackdrop(ctx, width, height, width / 2, 92);

  // Extra concentrated crimson bloom behind floating Play+Stop emblem
  const core = ctx.createRadialGradient(width / 2, 82, 0, width / 2, 82, 96);
  core.addColorStop(0, 'rgba(239, 68, 68, 0.42)');
  core.addColorStop(0.55, 'rgba(220, 38, 38, 0.14)');
  core.addColorStop(1, 'rgba(220, 38, 38, 0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, width, height);

  // Floating Play + Stop Mark centered at x=220, y=76
  const cx = width / 2;
  const cy = 76;
  ctx.save();
  ctx.shadowColor = 'rgba(239, 68, 68, 0.55)';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy - 26);
  ctx.lineTo(cx + 9, cy);
  ctx.lineTo(cx - 26, cy + 26);
  ctx.closePath();
  ctx.fillStyle = '#EF4444';
  ctx.fill();

  ctx.shadowColor = 'rgba(248, 250, 252, 0.3)';
  ctx.shadowBlur = 10;
  roundedRect(ctx, cx + 16, cy - 26, 10, 52, 2);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.restore();

  // Brand Title & Tagline
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#F8FAFC';
  ctx.font = '800 44px "Plus Jakarta Sans", -apple-system, sans-serif';
  ctx.fillText('Cadence', cx, 152);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 15.5px "Public Sans", -apple-system, sans-serif';
  ctx.fillText('YouTube at your speed — set once per channel.', cx, 182);

  // Bottom Telemetry Pill
  const pillText = 'Channel Speeds  ·  Skip Bar  ·  Playlist Stop';
  ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
  const pw = ctx.measureText(pillText).width + 32;
  const ph = 30;
  const px = cx - pw / 2;
  const py = 208;

  roundedRect(ctx, px, py, pw, ph, 8);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.78)';
  ctx.stroke();

  ctx.fillStyle = '#34D399';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, cx, py + ph / 2 + 0.5);
  ctx.restore();
}

export async function exportAllCwsStoreAssetsZip(
  showAnnotations: boolean
): Promise<Blob> {
  const zip = new JSZip();
  const canvas = document.createElement('canvas');

  for (const spec of CWS_SLIDE_SPECS) {
    await renderCwsSlideToCanvas(canvas, spec, showAnnotations);
    const png24Blob = await encodeCanvasTo24BitPngBlob(canvas);
    zip.file(spec.filename, png24Blob);
  }

  await renderCwsSmallPromoTileToCanvas(canvas);
  const tileBlob = await encodeCanvasTo24BitPngBlob(canvas);
  zip.file('06-cadence-small-promo-tile-440x280.png', tileBlob);

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
