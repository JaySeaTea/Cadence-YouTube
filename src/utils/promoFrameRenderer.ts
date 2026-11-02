export type PromoPresetId = 'polished' | 'hera-original';
export type PromoEmblemStyle = 'floating' | 'badge';

export interface IntroFrameConfig {
  title: string;
  subtitle: string;
  speedBadge: string;
  middleBadge: string;
  savedBadge: string;
  glowIntensity: number; // 0.4 to 1.6 (1.0 = signature Outro crimson bloom)
  emblemStyle: PromoEmblemStyle;
}

export interface OutroFrameConfig {
  title: string;
  subtitle: string;
  ctaLabel: string;
  trustLine: string;
  glowIntensity: number; // 0.4 to 1.6
  emblemStyle: PromoEmblemStyle;
}

export interface SceneOverlayCard {
  id: string;
  sceneLabel: string;
  timecodeHint: string;
  eyebrow: string;
  headline: string;
  metricChip: string;
  accent: 'red' | 'emerald' | 'amber';
  anchor: 'bottom-left' | 'top-right' | 'bottom-right';
}

export const PROMO_PRESETS: Record<
  PromoPresetId,
  {
    label: string;
    summary: string;
    intro: IntroFrameConfig;
    outro: OutroFrameConfig;
  }
> = {
  polished: {
    label: 'Polished Copy & Unified Glow (Recommended)',
    summary:
      'Brings the warm crimson glow to both bookends, fixes the clipped Intro badge, sharpens the value hook, and boosts subtext contrast for YouTube compression.',
    intro: {
      title: 'Cadence',
      subtitle: 'Every YouTube channel, automatically at your speed.',
      speedBadge: '1.5× Channel Rule',
      middleBadge: '+30s Skip',
      savedBadge: 'Saves 3m 20s',
      glowIntensity: 1.05,
      emblemStyle: 'floating',
    },
    outro: {
      title: 'Cadence',
      subtitle: 'YouTube at your speed — set once per channel.',
      ctaLabel: 'Get Cadence on the Chrome Web Store',
      trustLine: 'Free for Chrome  ·  Automatic channel pacing  ·  100% local — zero tracking',
      glowIntensity: 1.1,
      emblemStyle: 'floating',
    },
  },
  'hera-original': {
    label: 'Original Hera Wording (Fixed Layout + Red Glow)',
    summary:
      'Keeps the exact wording from your Hera renders while fixing the overflowing Intro pill box and applying the Outro crimson glow across both frames.',
    intro: {
      title: 'Cadence',
      subtitle: 'YouTube™ at your speed.',
      speedBadge: '1.5×',
      middleBadge: '',
      savedBadge: 'Saves 3m 20s',
      glowIntensity: 1.0,
      emblemStyle: 'floating',
    },
    outro: {
      title: 'Cadence',
      subtitle: 'YouTube™ at your speed.',
      ctaLabel: 'Get Cadence for Chrome',
      trustLine: 'Free to install · Personalized channel pacing · Zero data sharing',
      glowIntensity: 1.0,
      emblemStyle: 'floating',
    },
  },
};

export const SCENE_CALLOUT_OVERLAYS: SceneOverlayCard[] = [
  {
    id: 'scene-speed-memory',
    sceneLabel: 'Scene 01 · Per-Channel Speed Memory',
    timecodeHint: '0:03 – 0:11',
    eyebrow: 'AUTOMATIC CHANNEL RULE',
    headline: 'Locks in your saved speed the instant a channel loads',
    metricChip: '1.5× Applied  ·  Saves 3m 20s',
    accent: 'emerald',
    anchor: 'bottom-left',
  },
  {
    id: 'scene-transport-deck',
    sceneLabel: 'Scene 02 · Full-Width Watch Deck & Skip Capsules',
    timecodeHint: '0:11 – 0:20',
    eyebrow: 'ZERO-CLUTTER TRANSPORT DECK',
    headline: '1-click speed presets + 10s / 30s / 60s skip capsules',
    metricChip: '-10s  ·  +30s  ·  +60s',
    accent: 'red',
    anchor: 'top-right',
  },
  {
    id: 'scene-shorts-watch',
    sceneLabel: 'Scene 03 · Shorts-to-Watch Player Conversion',
    timecodeHint: '0:20 – 0:28',
    eyebrow: 'SHORTS → STANDARD PLAYER',
    headline: 'Opens Shorts in the full timeline player without back-button loops',
    metricChip: '/shorts/  →  /watch?v=',
    accent: 'red',
    anchor: 'bottom-left',
  },
  {
    id: 'scene-playlist-stop',
    sceneLabel: 'Scene 04 · Watch Later & Playlist Hard-Stop',
    timecodeHint: '0:28 – 0:36',
    eyebrow: 'PLAYLIST GUARD ARMED',
    headline: 'Stops cleanly when a video finishes — even inside Watch Later',
    metricChip: 'list=WL  ·  Auto-Advance Blocked',
    accent: 'emerald',
    anchor: 'bottom-left',
  },
  {
    id: 'scene-live-guard',
    sceneLabel: 'Scene 05 · Live Stream No-Rewind Notice (v1.5.1)',
    timecodeHint: '0:36 – 0:42',
    eyebrow: 'LIVE DVR TELEMETRY',
    headline: 'Flags non-DVR streams clearly until live buffer catches up to 1.0×',
    metricChip: '⚠ Rewind unavailable on this live stream',
    accent: 'amber',
    anchor: 'top-right',
  },
];

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clampGlow(val: number): number {
  return Math.max(0.25, Math.min(1.75, Number.isFinite(val) ? val : 1));
}

function buildEmblemSvgGroup(
  centerX: number,
  centerY: number,
  style: PromoEmblemStyle
): string {
  if (style === 'badge') {
    const boxSize = 248;
    const x0 = centerX - boxSize / 2;
    const y0 = centerY - boxSize / 2;
    const rx = +(boxSize * 0.22).toFixed(1);
    const left = +(x0 + boxSize * 0.24).toFixed(1);
    const top = +(y0 + boxSize * 0.25).toFixed(1);
    const bottom = +(y0 + boxSize * 0.75).toFixed(1);
    const midX = +(x0 + boxSize * 0.6).toFixed(1);
    const midY = +(y0 + boxSize * 0.5).toFixed(1);
    const barX = +(x0 + boxSize * 0.67).toFixed(1);
    const barW = Math.round(boxSize * 0.11);
    const barH = +(bottom - top).toFixed(1);

    return [
      `  <g filter="url(#emblemGlow)">`,
      `    <rect x="${x0}" y="${y0}" width="${boxSize}" height="${boxSize}" rx="${rx}" fill="#0F172A" stroke="#334155" stroke-width="3" />`,
      `    <polygon points="${left},${top} ${midX},${midY} ${left},${bottom}" fill="url(#playRedGrad)" />`,
      `    <rect x="${barX}" y="${top}" width="${barW}" height="${barH}" rx="4" fill="#F8FAFC" />`,
      `  </g>`,
    ].join('\n');
  }

  // Floating optical lockup (matches Hera Outro emblem geometry centered at centerX)
  const left = centerX - 102;
  const tipX = centerX + 36;
  const top = centerY - 102;
  const bottom = centerY + 102;
  const barX = centerX + 64;
  const barW = 38;
  const barH = 204;

  return [
    `  <g filter="url(#emblemGlow)">`,
    `    <polygon points="${left},${top} ${tipX},${centerY} ${left},${bottom}" fill="url(#playRedGrad)" />`,
    `    <rect x="${barX}" y="${top}" width="${barW}" height="${barH}" rx="4" fill="#F8FAFC" />`,
    `  </g>`,
  ].join('\n');
}

export function renderIntroFrameSvg(config: IntroFrameConfig): string {
  const width = 3840;
  const height = 2160;
  const cx = 1920;
  const emblemCy = 805;
  const glow = clampGlow(config.glowIntensity);

  const outerAlpha = +(0.26 * glow).toFixed(3);
  const midAlpha = +(0.14 * glow).toFixed(3);
  const coreAlpha = +(0.38 * glow).toFixed(3);

  const segments: Array<{ text: string; fill: string }> = [];
  if (config.speedBadge.trim()) {
    segments.push({ text: config.speedBadge.trim(), fill: '#F8FAFC' });
  }
  if (config.middleBadge.trim()) {
    segments.push({ text: config.middleBadge.trim(), fill: '#CBD5E1' });
  }
  if (config.savedBadge.trim()) {
    segments.push({ text: config.savedBadge.trim(), fill: '#34D399' });
  }

  // Approximate monospace character advance for 40px JetBrains Mono (~24.2px per char)
  const sep = '  ·  ';
  const fullPlainText = segments.map((s) => s.text).join(sep);
  const approxTextWidth = fullPlainText.length * 24.4;
  const pillWidth = Math.max(460, Math.round(approxTextWidth + 116));
  const pillHeight = 104;
  const pillX = Math.round(cx - pillWidth / 2);
  const pillY = 1282;

  const tspans = segments
    .map((seg, idx) => {
      const prefix =
        idx > 0 ? `<tspan fill="#64748B">${escapeXml(sep)}</tspan>` : '';
      return `${prefix}<tspan fill="${seg.fill}">${escapeXml(seg.text)}</tspan>`;
    })
    .join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">`,
    `  <defs>`,
    `    <style>`,
    `      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600&amp;family=Plus+Jakarta+Sans:wght@700;800&amp;family=Public+Sans:wght@500;600&amp;display=swap');`,
    `      .title { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-weight: 800; font-size: 184px; letter-spacing: -0.032em; }`,
    `      .subtitle { font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-weight: 500; font-size: 56px; letter-spacing: -0.01em; }`,
    `      .mono-pill { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600; font-size: 40px; font-variant-numeric: tabular-nums; }`,
    `    </style>`,
    `    <radialGradient id="slateAtmosphere" cx="50%" cy="44%" r="64%">`,
    `      <stop offset="0%" stop-color="#131C31" stop-opacity="0.72" />`,
    `      <stop offset="55%" stop-color="#090D18" stop-opacity="0.94" />`,
    `      <stop offset="100%" stop-color="#050811" stop-opacity="1" />`,
    `    </radialGradient>`,
    `    <radialGradient id="crimsonHalo" cx="50%" cy="38%" r="42%">`,
    `      <stop offset="0%" stop-color="#DC2626" stop-opacity="${outerAlpha}" />`,
    `      <stop offset="38%" stop-color="#B91C1C" stop-opacity="${midAlpha}" />`,
    `      <stop offset="75%" stop-color="#7F1D1D" stop-opacity="0.03" />`,
    `      <stop offset="100%" stop-color="#050811" stop-opacity="0" />`,
    `    </radialGradient>`,
    `    <radialGradient id="crimsonCore" cx="50%" cy="37.2%" r="13%">`,
    `      <stop offset="0%" stop-color="#EF4444" stop-opacity="${coreAlpha}" />`,
    `      <stop offset="55%" stop-color="#DC2626" stop-opacity="${+(coreAlpha * 0.35).toFixed(3)}" />`,
    `      <stop offset="100%" stop-color="#DC2626" stop-opacity="0" />`,
    `    </radialGradient>`,
    `    <linearGradient id="playRedGrad" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `      <stop offset="0%" stop-color="#EF4444" />`,
    `      <stop offset="100%" stop-color="#DC2626" />`,
    `    </linearGradient>`,
    `    <linearGradient id="pillSurface" x1="0%" y1="0%" x2="0%" y2="100%">`,
    `      <stop offset="0%" stop-color="#131C2E" stop-opacity="0.92" />`,
    `      <stop offset="100%" stop-color="#0B1120" stop-opacity="0.95" />`,
    `    </linearGradient>`,
    `    <filter id="emblemGlow" x="-40%" y="-40%" width="180%" height="180%">`,
    `      <feDropShadow dx="0" dy="0" stdDeviation="24" flood-color="#EF4444" flood-opacity="${+(0.42 * glow).toFixed(3)}" />`,
    `    </filter>`,
    `  </defs>`,
    `  <rect width="${width}" height="${height}" fill="#050811" />`,
    `  <rect width="${width}" height="${height}" fill="url(#slateAtmosphere)" />`,
    `  <rect width="${width}" height="${height}" fill="url(#crimsonHalo)" />`,
    `  <rect width="${width}" height="${height}" fill="url(#crimsonCore)" />`,
    buildEmblemSvgGroup(cx, emblemCy, config.emblemStyle),
    `  <text x="${cx}" y="1092" text-anchor="middle" fill="#F8FAFC" class="title">${escapeXml(config.title)}</text>`,
    `  <text x="${cx}" y="1194" text-anchor="middle" fill="#94A3B8" class="subtitle">${escapeXml(config.subtitle)}</text>`,
    segments.length > 0
      ? [
          `  <rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="22" fill="url(#pillSurface)" stroke="#334155" stroke-opacity="0.72" stroke-width="2.5" />`,
          `  <text x="${cx}" y="${pillY + 66}" text-anchor="middle" class="mono-pill">${tspans}</text>`,
        ].join('\n')
      : '',
    `</svg>`,
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function renderOutroFrameSvg(config: OutroFrameConfig): string {
  const width = 3840;
  const height = 2160;
  const cx = 1920;
  const emblemCy = 755;
  const glow = clampGlow(config.glowIntensity);

  const outerAlpha = +(0.29 * glow).toFixed(3);
  const midAlpha = +(0.16 * glow).toFixed(3);
  const coreAlpha = +(0.42 * glow).toFixed(3);

  const ctaText = config.ctaLabel.trim();
  // Approximate proportional width for 46px Plus Jakarta Sans SemiBold/Bold (~25.5px avg char + dot + padding)
  const approxCtaTextWidth = ctaText.length * 25.8;
  const btnWidth = Math.max(660, Math.round(approxCtaTextWidth + 170));
  const btnHeight = 118;
  const btnX = Math.round(cx - btnWidth / 2);
  const btnY = 1236;
  const dotCx = btnX + 64;
  const dotCy = btnY + btnHeight / 2;
  const textCenterX = cx + 18;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">`,
    `  <defs>`,
    `    <style>`,
    `      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&amp;family=Public+Sans:wght@500;600&amp;display=swap');`,
    `      .title { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-weight: 800; font-size: 184px; letter-spacing: -0.032em; }`,
    `      .subtitle { font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-weight: 500; font-size: 56px; letter-spacing: -0.01em; }`,
    `      .cta { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-weight: 700; font-size: 45px; letter-spacing: -0.01em; }`,
    `      .trust { font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-weight: 500; font-size: 36px; letter-spacing: 0.005em; }`,
    `    </style>`,
    `    <radialGradient id="slateAtmosphere" cx="50%" cy="42%" r="64%">`,
    `      <stop offset="0%" stop-color="#131C31" stop-opacity="0.72" />`,
    `      <stop offset="55%" stop-color="#090D18" stop-opacity="0.94" />`,
    `      <stop offset="100%" stop-color="#050811" stop-opacity="1" />`,
    `    </radialGradient>`,
    `    <radialGradient id="crimsonHalo" cx="50%" cy="35.5%" r="44%">`,
    `      <stop offset="0%" stop-color="#DC2626" stop-opacity="${outerAlpha}" />`,
    `      <stop offset="38%" stop-color="#B91C1C" stop-opacity="${midAlpha}" />`,
    `      <stop offset="75%" stop-color="#7F1D1D" stop-opacity="0.035" />`,
    `      <stop offset="100%" stop-color="#050811" stop-opacity="0" />`,
    `    </radialGradient>`,
    `    <radialGradient id="crimsonCore" cx="50%" cy="35%" r="13.5%">`,
    `      <stop offset="0%" stop-color="#EF4444" stop-opacity="${coreAlpha}" />`,
    `      <stop offset="55%" stop-color="#DC2626" stop-opacity="${+(coreAlpha * 0.36).toFixed(3)}" />`,
    `      <stop offset="100%" stop-color="#DC2626" stop-opacity="0" />`,
    `    </radialGradient>`,
    `    <linearGradient id="playRedGrad" x1="0%" y1="0%" x2="100%" y2="100%">`,
    `      <stop offset="0%" stop-color="#EF4444" />`,
    `      <stop offset="100%" stop-color="#DC2626" />`,
    `    </linearGradient>`,
    `    <linearGradient id="ctaSurface" x1="0%" y1="0%" x2="0%" y2="100%">`,
    `      <stop offset="0%" stop-color="#162033" stop-opacity="0.96" />`,
    `      <stop offset="100%" stop-color="#0D1424" stop-opacity="0.98" />`,
    `    </linearGradient>`,
    `    <filter id="emblemGlow" x="-40%" y="-40%" width="180%" height="180%">`,
    `      <feDropShadow dx="0" dy="0" stdDeviation="25" flood-color="#EF4444" flood-opacity="${+(0.45 * glow).toFixed(3)}" />`,
    `    </filter>`,
    `  </defs>`,
    `  <rect width="${width}" height="${height}" fill="#050811" />`,
    `  <rect width="${width}" height="${height}" fill="url(#slateAtmosphere)" />`,
    `  <rect width="${width}" height="${height}" fill="url(#crimsonHalo)" />`,
    `  <rect width="${width}" height="${height}" fill="url(#crimsonCore)" />`,
    buildEmblemSvgGroup(cx, emblemCy, config.emblemStyle),
    `  <text x="${cx}" y="1040" text-anchor="middle" fill="#F8FAFC" class="title">${escapeXml(config.title)}</text>`,
    `  <text x="${cx}" y="1142" text-anchor="middle" fill="#94A3B8" class="subtitle">${escapeXml(config.subtitle)}</text>`,
    ctaText
      ? [
          `  <rect x="${btnX}" y="${btnY}" width="${btnWidth}" height="${btnHeight}" rx="26" fill="url(#ctaSurface)" stroke="#334155" stroke-opacity="0.88" stroke-width="2.5" />`,
          `  <circle cx="${dotCx}" cy="${dotCy}" r="10" fill="#EF4444" />`,
          `  <text x="${textCenterX}" y="${btnY + 75}" text-anchor="middle" fill="#F8FAFC" class="cta">${escapeXml(ctaText)}</text>`,
        ].join('\n')
      : '',
    config.trustLine.trim()
      ? `  <text x="${cx}" y="1442" text-anchor="middle" fill="#94A3B8" class="trust">${escapeXml(config.trustLine.trim())}</text>`
      : '',
    `</svg>`,
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

function drawRoundedRectPath(
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

/**
 * Adds ultra-subtle +-0.65 LSB luminance dithering to dark gradients so H.264/AV1
 * video encoders do not produce concentric 8-bit banding rings in the crimson glow.
 */
function applyAntiBandingDither(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Only run fast pixel dither at <= 3840x2160; deterministic LCG PRNG is ~18ms at 4K
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  let seed = 0x1337cafe;
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    // Map top 8 bits to [-1, 0, +1] subtle dither
    const noise = ((seed >>> 24) / 255 - 0.5) * 1.4;
    const r = data[i] + noise;
    const g = data[i + 1] + noise;
    const b = data[i + 2] + noise;
    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(imgData, 0, 0);
}

function drawAtmosphericBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  emblemCy4k: number,
  glowIntensity: number,
  enableDither: boolean
) {
  const scale = width / 3840;
  const cx = width / 2;
  const glowCy = emblemCy4k * scale;
  const glow = clampGlow(glowIntensity);

  // Base deep obsidian
  ctx.fillStyle = '#050811';
  ctx.fillRect(0, 0, width, height);

  // Subtle midnight slate vignette
  const slateGrad = ctx.createRadialGradient(
    cx,
    height * 0.43,
    0,
    cx,
    height * 0.43,
    width * 0.65
  );
  slateGrad.addColorStop(0, 'rgba(19, 28, 49, 0.72)');
  slateGrad.addColorStop(0.55, 'rgba(9, 13, 24, 0.94)');
  slateGrad.addColorStop(1, 'rgba(5, 8, 17, 1)');
  ctx.fillStyle = slateGrad;
  ctx.fillRect(0, 0, width, height);

  // Wide crimson atmospheric halo (from Hera Outro)
  const haloGrad = ctx.createRadialGradient(cx, glowCy, 0, cx, glowCy, width * 0.43);
  haloGrad.addColorStop(0, `rgba(220, 38, 38, ${Math.min(0.65, 0.28 * glow).toFixed(3)})`);
  haloGrad.addColorStop(0.36, `rgba(185, 28, 28, ${Math.min(0.45, 0.15 * glow).toFixed(3)})`);
  haloGrad.addColorStop(0.72, `rgba(127, 29, 29, ${Math.min(0.15, 0.035 * glow).toFixed(3)})`);
  haloGrad.addColorStop(1, 'rgba(5, 8, 17, 0)');
  ctx.fillStyle = haloGrad;
  ctx.fillRect(0, 0, width, height);

  // Tight ruby core bloom behind the Play+Stop mark
  const coreGrad = ctx.createRadialGradient(cx, glowCy, 0, cx, glowCy, width * 0.135);
  coreGrad.addColorStop(0, `rgba(239, 68, 68, ${Math.min(0.78, 0.4 * glow).toFixed(3)})`);
  coreGrad.addColorStop(0.55, `rgba(220, 38, 38, ${Math.min(0.35, 0.14 * glow).toFixed(3)})`);
  coreGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
  ctx.fillStyle = coreGrad;
  ctx.fillRect(0, 0, width, height);

  if (enableDither) {
    applyAntiBandingDither(ctx, width, height);
  }
}

function drawEmblemOnCanvas(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  style: PromoEmblemStyle,
  glowIntensity: number
) {
  const glow = clampGlow(glowIntensity);
  ctx.save();

  if (style === 'badge') {
    const boxSize = 248 * scale;
    const x0 = cx - boxSize / 2;
    const y0 = cy - boxSize / 2;
    const rx = boxSize * 0.22;

    ctx.shadowColor = `rgba(239, 68, 68, ${Math.min(0.75, 0.42 * glow)})`;
    ctx.shadowBlur = 52 * scale;
    drawRoundedRectPath(ctx, x0, y0, boxSize, boxSize, rx);
    ctx.fillStyle = '#0F172A';
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.lineWidth = 3 * scale;
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.72)';
    ctx.stroke();

    const left = x0 + boxSize * 0.24;
    const top = y0 + boxSize * 0.25;
    const bottom = y0 + boxSize * 0.75;
    const midX = x0 + boxSize * 0.6;
    const midY = y0 + boxSize * 0.5;
    const barX = x0 + boxSize * 0.67;
    const barW = boxSize * 0.11;

    const triGrad = ctx.createLinearGradient(left, top, midX, bottom);
    triGrad.addColorStop(0, '#EF4444');
    triGrad.addColorStop(1, '#DC2626');
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(midX, midY);
    ctx.lineTo(left, bottom);
    ctx.closePath();
    ctx.fillStyle = triGrad;
    ctx.fill();

    drawRoundedRectPath(ctx, barX, top, barW, bottom - top, 4 * scale);
    ctx.fillStyle = '#F8FAFC';
    ctx.fill();
    ctx.restore();
    return;
  }

  // Floating optical Play + Stop mark
  const left = cx - 102 * scale;
  const tipX = cx + 36 * scale;
  const top = cy - 102 * scale;
  const bottom = cy + 102 * scale;
  const barX = cx + 64 * scale;
  const barW = 38 * scale;
  const barH = 204 * scale;

  // Crimson optical bloom on play triangle
  ctx.shadowColor = `rgba(239, 68, 68, ${Math.min(0.8, 0.52 * glow)})`;
  ctx.shadowBlur = 46 * scale;
  const triGrad = ctx.createLinearGradient(left, top, tipX, bottom);
  triGrad.addColorStop(0, '#EF4444');
  triGrad.addColorStop(1, '#DC2626');
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(tipX, cy);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.fillStyle = triGrad;
  ctx.fill();

  // Subtle cool-white optical bloom on stop bar
  ctx.shadowColor = `rgba(248, 250, 252, ${Math.min(0.5, 0.28 * glow)})`;
  ctx.shadowBlur = 32 * scale;
  drawRoundedRectPath(ctx, barX, top, barW, barH, 4 * scale);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();

  ctx.restore();
}

export async function ensurePromoFontsReady(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed with fallback metrics if font API rejects
    }
  }
}

export function renderIntroFrameToCanvas(
  canvas: HTMLCanvasElement,
  config: IntroFrameConfig,
  targetWidth = 3840,
  enableDither = false
): void {
  const width = targetWidth;
  const height = Math.round((targetWidth * 9) / 16);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scale = width / 3840;
  const cx = width / 2;
  const emblemCy4k = 805;

  drawAtmosphericBackdrop(ctx, width, height, emblemCy4k, config.glowIntensity, enableDither);
  drawEmblemOnCanvas(
    ctx,
    cx,
    emblemCy4k * scale,
    scale,
    config.emblemStyle,
    config.glowIntensity
  );

  // Wordmark Title
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#F8FAFC';
  ctx.font = `800 ${Math.round(184 * scale)}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(-5.6 * scale).toFixed(2)}px`;
  }
  ctx.fillText(config.title, cx, 1092 * scale);
  ctx.restore();

  // Subtitle
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#94A3B8';
  ctx.font = `500 ${Math.round(56 * scale)}px "Public Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillText(config.subtitle, cx, 1194 * scale);
  ctx.restore();

  // Bottom Telemetry Pill (exact measured multi-segment text so it NEVER clips)
  const segments: Array<{ text: string; color: string }> = [];
  if (config.speedBadge.trim()) {
    segments.push({ text: config.speedBadge.trim(), color: '#F8FAFC' });
  }
  if (config.middleBadge.trim()) {
    segments.push({ text: config.middleBadge.trim(), color: '#CBD5E1' });
  }
  if (config.savedBadge.trim()) {
    segments.push({ text: config.savedBadge.trim(), color: '#34D399' });
  }

  if (segments.length > 0) {
    ctx.save();
    ctx.font = `600 ${Math.round(40 * scale)}px "JetBrains Mono", ui-monospace, SFMono-Regular, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const sep = '  ·  ';
    const sepWidth = ctx.measureText(sep).width;
    const segWidths = segments.map((s) => ctx.measureText(s.text).width);
    const totalTextWidth =
      segWidths.reduce((acc, w) => acc + w, 0) + sepWidth * (segments.length - 1);

    const padX = 56 * scale;
    const pillW = Math.max(360 * scale, totalTextWidth + padX * 2);
    const pillH = 104 * scale;
    const pillX = cx - pillW / 2;
    const pillY = 1282 * scale;

    const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
    pillGrad.addColorStop(0, 'rgba(19, 28, 46, 0.92)');
    pillGrad.addColorStop(1, 'rgba(11, 17, 32, 0.96)');

    drawRoundedRectPath(ctx, pillX, pillY, pillW, pillH, 22 * scale);
    ctx.fillStyle = pillGrad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, 2.5 * scale);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.68)';
    ctx.stroke();

    let cursorX = cx - totalTextWidth / 2;
    const textMidY = pillY + pillH / 2 + 1 * scale;

    segments.forEach((seg, idx) => {
      if (idx > 0) {
        ctx.fillStyle = '#64748B';
        ctx.fillText(sep, cursorX, textMidY);
        cursorX += sepWidth;
      }
      ctx.fillStyle = seg.color;
      ctx.fillText(seg.text, cursorX, textMidY);
      cursorX += segWidths[idx];
    });
    ctx.restore();
  }
}

export function renderOutroFrameToCanvas(
  canvas: HTMLCanvasElement,
  config: OutroFrameConfig,
  targetWidth = 3840,
  enableDither = false
): void {
  const width = targetWidth;
  const height = Math.round((targetWidth * 9) / 16);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scale = width / 3840;
  const cx = width / 2;
  const emblemCy4k = 755;

  drawAtmosphericBackdrop(ctx, width, height, emblemCy4k, config.glowIntensity, enableDither);
  drawEmblemOnCanvas(
    ctx,
    cx,
    emblemCy4k * scale,
    scale,
    config.emblemStyle,
    config.glowIntensity
  );

  // Wordmark Title
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#F8FAFC';
  ctx.font = `800 ${Math.round(184 * scale)}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(-5.6 * scale).toFixed(2)}px`;
  }
  ctx.fillText(config.title, cx, 1040 * scale);
  ctx.restore();

  // Subtitle
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#94A3B8';
  ctx.font = `500 ${Math.round(56 * scale)}px "Public Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillText(config.subtitle, cx, 1142 * scale);
  ctx.restore();

  // Chrome CTA Button
  const ctaText = config.ctaLabel.trim();
  if (ctaText) {
    ctx.save();
    ctx.font = `700 ${Math.round(45 * scale)}px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
    const textW = ctx.measureText(ctaText).width;
    const dotRadius = 10 * scale;
    const dotGap = 24 * scale;
    const innerContentW = dotRadius * 2 + dotGap + textW;
    const padX = 64 * scale;
    const btnW = Math.max(520 * scale, innerContentW + padX * 2);
    const btnH = 118 * scale;
    const btnX = cx - btnW / 2;
    const btnY = 1236 * scale;

    // Subtle soft crimson ambient shadow under CTA button
    ctx.shadowColor = 'rgba(220, 38, 38, 0.16)';
    ctx.shadowBlur = 32 * scale;
    const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
    btnGrad.addColorStop(0, 'rgba(22, 32, 51, 0.96)');
    btnGrad.addColorStop(1, 'rgba(13, 20, 36, 0.98)');

    drawRoundedRectPath(ctx, btnX, btnY, btnW, btnH, 26 * scale);
    ctx.fillStyle = btnGrad;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, 2.5 * scale);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.85)';
    ctx.stroke();

    const startX = cx - innerContentW / 2;
    const midY = btnY + btnH / 2;

    // Glowing crimson dot
    ctx.save();
    ctx.shadowColor = 'rgba(239, 68, 68, 0.75)';
    ctx.shadowBlur = 16 * scale;
    ctx.beginPath();
    ctx.arc(startX + dotRadius, midY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#EF4444';
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(ctaText, startX + dotRadius * 2 + dotGap, midY + 1 * scale);
    ctx.restore();
  }

  // Footer Trust Line
  if (config.trustLine.trim()) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#94A3B8';
    ctx.font = `500 ${Math.round(36 * scale)}px "Public Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(config.trustLine.trim(), cx, 1442 * scale);
    ctx.restore();
  }
}

export function renderSceneOverlayToCanvas(
  canvas: HTMLCanvasElement,
  card: SceneOverlayCard,
  targetWidth = 3840
): void {
  const width = targetWidth;
  const height = Math.round((targetWidth * 9) / 16);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Transparent RGBA canvas so it drops directly over screen recordings on Video Track 2
  ctx.clearRect(0, 0, width, height);

  const scale = width / 3840;
  const accentMap = {
    red: { primary: '#EF4444', chipText: '#FCA5A5', chipBorder: 'rgba(239, 68, 68, 0.4)' },
    emerald: { primary: '#34D399', chipText: '#6EE7B7', chipBorder: 'rgba(52, 211, 153, 0.4)' },
    amber: { primary: '#F59E0B', chipText: '#FCD34D', chipBorder: 'rgba(245, 158, 11, 0.45)' },
  }[card.accent];

  // Measure fonts to compute clean HUD card width
  ctx.font = `700 ${Math.round(28 * scale)}px "JetBrains Mono", ui-monospace, monospace`;
  const eyebrowW = ctx.measureText(card.eyebrow).width;

  ctx.font = `700 ${Math.round(48 * scale)}px "Plus Jakarta Sans", -apple-system, sans-serif`;
  const headlineW = ctx.measureText(card.headline).width;

  ctx.font = `600 ${Math.round(34 * scale)}px "JetBrains Mono", ui-monospace, monospace`;
  const chipTextW = ctx.measureText(card.metricChip).width;
  const chipW = chipTextW + 56 * scale;

  const innerMaxW = Math.max(eyebrowW + 64 * scale, headlineW, chipW);
  const padX = 56 * scale;
  const cardW = Math.min(width - 280 * scale, Math.max(1080 * scale, innerMaxW + padX * 2));
  const cardH = 316 * scale;

  const marginX = 168 * scale;
  const marginY = 164 * scale;

  let cardX = marginX;
  let cardY = height - marginY - cardH;

  if (card.anchor === 'top-right') {
    cardX = width - marginX - cardW;
    cardY = marginY;
  } else if (card.anchor === 'bottom-right') {
    cardX = width - marginX - cardW;
    cardY = height - marginY - cardH;
  }

  // Dark HUD glass card with drop shadow for readability over any bright/dark YouTube frame
  ctx.save();
  ctx.shadowColor = 'rgba(2, 6, 23, 0.68)';
  ctx.shadowBlur = 48 * scale;
  ctx.shadowOffsetY = 18 * scale;

  const bgGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
  bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.94)');
  bgGrad.addColorStop(1, 'rgba(9, 13, 24, 0.97)');

  drawRoundedRectPath(ctx, cardX, cardY, cardW, cardH, 28 * scale);
  ctx.fillStyle = bgGrad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = Math.max(1.5, 3 * scale);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.stroke();

  // Top subtle accent hairline inside card
  drawRoundedRectPath(ctx, cardX + 44 * scale, cardY, 180 * scale, 5 * scale, 2.5 * scale);
  ctx.fillStyle = accentMap.primary;
  ctx.fill();

  const contentX = cardX + padX;

  // Mini Cadence Play+Stop icon + Eyebrow
  const iconCy = cardY + 66 * scale;
  ctx.beginPath();
  ctx.moveTo(contentX, iconCy - 14 * scale);
  ctx.lineTo(contentX + 20 * scale, iconCy);
  ctx.lineTo(contentX, iconCy + 14 * scale);
  ctx.closePath();
  ctx.fillStyle = '#EF4444';
  ctx.fill();

  drawRoundedRectPath(ctx, contentX + 25 * scale, iconCy - 14 * scale, 6 * scale, 28 * scale, 1.5 * scale);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();

  ctx.font = `700 ${Math.round(27 * scale)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(card.eyebrow, contentX + 48 * scale, iconCy + 1 * scale);

  // Headline
  ctx.font = `700 ${Math.round(46 * scale)}px "Plus Jakarta Sans", -apple-system, sans-serif`;
  ctx.fillStyle = '#F8FAFC';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(card.headline, contentX, cardY + 152 * scale);

  // Telemetry Metric Chip
  const chipH = 70 * scale;
  const chipY = cardY + 196 * scale;
  drawRoundedRectPath(ctx, contentX, chipY, chipW, chipH, 16 * scale);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.fill();
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.strokeStyle = accentMap.chipBorder;
  ctx.stroke();

  ctx.font = `600 ${Math.round(33 * scale)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillStyle = accentMap.chipText;
  ctx.textBaseline = 'middle';
  ctx.fillText(card.metricChip, contentX + 28 * scale, chipY + chipH / 2 + 1 * scale);

  ctx.restore();
}
