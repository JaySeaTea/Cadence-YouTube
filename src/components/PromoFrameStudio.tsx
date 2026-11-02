import React, { useEffect, useRef, useState } from 'react';
import { Download, Eye, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  ensurePromoFontsReady,
  IntroFrameConfig,
  OutroFrameConfig,
  PROMO_PRESETS,
  PromoEmblemStyle,
  PromoPresetId,
  renderIntroFrameSvg,
  renderIntroFrameToCanvas,
  renderOutroFrameSvg,
  renderOutroFrameToCanvas,
  renderSceneOverlayToCanvas,
  SCENE_CALLOUT_OVERLAYS,
  SceneOverlayCard,
} from '../utils/promoFrameRenderer';

type StudioMode = 'bookends' | 'overlays';

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const PromoFrameStudio: React.FC = () => {
  const [studioMode, setStudioMode] = useState<StudioMode>('bookends');
  const [presetId, setPresetId] = useState<PromoPresetId>('polished');
  const [introConfig, setIntroConfig] = useState<IntroFrameConfig>(
    () => ({ ...PROMO_PRESETS.polished.intro })
  );
  const [outroConfig, setOutroConfig] = useState<OutroFrameConfig>(
    () => ({ ...PROMO_PRESETS.polished.outro })
  );
  const [showEditor, setShowEditor] = useState<boolean>(false);
  const [compareHeraRefs, setCompareHeraRefs] = useState<boolean>(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const introCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const outroCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  const applyPreset = (nextPreset: PromoPresetId) => {
    setPresetId(nextPreset);
    setIntroConfig({ ...PROMO_PRESETS[nextPreset].intro });
    setOutroConfig({ ...PROMO_PRESETS[nextPreset].outro });
  };

  const handleSharedGlowChange = (glowValue: number) => {
    setIntroConfig((prev) => ({ ...prev, glowIntensity: glowValue }));
    setOutroConfig((prev) => ({ ...prev, glowIntensity: glowValue }));
  };

  const handleSharedEmblemStyle = (style: PromoEmblemStyle) => {
    setIntroConfig((prev) => ({ ...prev, emblemStyle: style }));
    setOutroConfig((prev) => ({ ...prev, emblemStyle: style }));
  };

  // Render live 1920x1080 crisp previews for Intro & Outro
  useEffect(() => {
    if (studioMode !== 'bookends') return;
    let cancelled = false;
    (async () => {
      await ensurePromoFontsReady();
      if (cancelled) return;
      if (introCanvasRef.current) {
        renderIntroFrameToCanvas(introCanvasRef.current, introConfig, 1920, false);
      }
      if (outroCanvasRef.current) {
        renderOutroFrameToCanvas(outroCanvasRef.current, outroConfig, 1920, false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioMode, introConfig, outroConfig]);

  // Render live 1280x720 transparent previews for the 5 scene callout overlays
  useEffect(() => {
    if (studioMode !== 'overlays') return;
    let cancelled = false;
    (async () => {
      await ensurePromoFontsReady();
      if (cancelled) return;
      for (const card of SCENE_CALLOUT_OVERLAYS) {
        const canvas = overlayCanvasRefs.current[card.id];
        if (canvas) {
          renderSceneOverlayToCanvas(canvas, card, 1280);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioMode]);

  const downloadBookendPng = async (
    kind: 'intro' | 'outro',
    targetWidth: 3840 | 1920
  ) => {
    const key = `${kind}-${targetWidth}`;
    setExportingKey(key);
    try {
      await ensurePromoFontsReady();
      const offscreen = document.createElement('canvas');
      if (kind === 'intro') {
        renderIntroFrameToCanvas(offscreen, introConfig, targetWidth, true);
      } else {
        renderOutroFrameToCanvas(offscreen, outroConfig, targetWidth, true);
      }
      const suffix = targetWidth === 3840 ? '4k' : '1080p';
      await new Promise<void>((resolve) => {
        offscreen.toBlob((blob) => {
          if (blob) {
            triggerBlobDownload(blob, `cadence-${kind}-${suffix}.png`);
          }
          resolve();
        }, 'image/png');
      });
    } finally {
      setExportingKey(null);
    }
  };

  const downloadBookendSvg = (kind: 'intro' | 'outro') => {
    const svgContent =
      kind === 'intro' ? renderIntroFrameSvg(introConfig) : renderOutroFrameSvg(outroConfig);
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    triggerBlobDownload(blob, `cadence-${kind}-4k.svg`);
  };

  const downloadOverlayPng = async (card: SceneOverlayCard, targetWidth: 3840 | 1920) => {
    const key = `${card.id}-${targetWidth}`;
    setExportingKey(key);
    try {
      await ensurePromoFontsReady();
      const offscreen = document.createElement('canvas');
      renderSceneOverlayToCanvas(offscreen, card, targetWidth);
      const suffix = targetWidth === 3840 ? '4k' : '1080p';
      await new Promise<void>((resolve) => {
        offscreen.toBlob((blob) => {
          if (blob) {
            triggerBlobDownload(blob, `cadence-${card.id}-${suffix}.png`);
          }
          resolve();
        }, 'image/png');
      });
    } finally {
      setExportingKey(null);
    }
  };

  return (
    <section className="bg-[#111827] border border-slate-800/90 rounded-xl divide-y divide-slate-800">
      {/* Studio Header & Mode Switcher */}
      <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <h2 className="text-base font-bold text-slate-100">
            Static 4K Promo Video Frames &amp; Transparent Scene Overlays
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Drop-in static{' '}
            <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded tabular-nums">
              3840×2160
            </code>{' '}
            4K PNGs,{' '}
            <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded tabular-nums">
              1920×1080
            </code>{' '}
            PNGs, and lossless{' '}
            <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
              .svg
            </code>{' '}
            files with the Outro’s crimson glow unified across both bookends, anti-banded 8-bit
            gradients, and properly fitted telemetry containers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex rounded-lg bg-[#0B0F19] p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => setStudioMode('bookends')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                studioMode === 'bookends'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Intro &amp; Outro Frames
            </button>
            <button
              type="button"
              onClick={() => setStudioMode('overlays')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                studioMode === 'overlays'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              5 Transparent Overlays
            </button>
          </div>
        </div>
      </div>

      {studioMode === 'bookends' ? (
        <>
          {/* Preset, Glow & Wording Controls Bar */}
          <div className="px-6 py-4 bg-[#0D1322] flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => applyPreset('polished')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  presetId === 'polished'
                    ? 'bg-red-600/15 border-red-500/50 text-slate-100'
                    : 'border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                Polished Copy (Recommended)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('hera-original')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  presetId === 'hera-original'
                    ? 'bg-red-600/15 border-red-500/50 text-slate-100'
                    : 'border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                Hera Original Copy (Fixed Box)
              </button>

              <div className="h-4 w-px bg-slate-800 hidden sm:block" />

              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="text-slate-400 whitespace-nowrap">Red Glow:</span>
                <input
                  type="range"
                  min={0.4}
                  max={1.55}
                  step={0.05}
                  value={outroConfig.glowIntensity}
                  onChange={(e) => handleSharedGlowChange(parseFloat(e.target.value))}
                  aria-label="Red radial glow intensity"
                  className="w-24 accent-red-600 cursor-pointer"
                />
                <span className="font-mono tabular-nums text-slate-200 w-10">
                  {Math.round(outroConfig.glowIntensity * 100)}%
                </span>
              </div>

              <div className="h-4 w-px bg-slate-800 hidden sm:block" />

              <div className="inline-flex rounded-lg bg-[#0B0F19] p-0.5 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => handleSharedEmblemStyle('floating')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    introConfig.emblemStyle === 'floating'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Floating Mark
                </button>
                <button
                  type="button"
                  onClick={() => handleSharedEmblemStyle('badge')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    introConfig.emblemStyle === 'badge'
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Icon Badge
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCompareHeraRefs((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  compareHeraRefs
                    ? 'bg-slate-800 border-slate-600 text-slate-100'
                    : 'border-slate-700/80 text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                {compareHeraRefs ? 'Hide Hera Reference' : 'Compare w/ Hera Shots'}
              </button>
              <button
                type="button"
                onClick={() => setShowEditor((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showEditor
                    ? 'bg-slate-800 border-slate-600 text-slate-100'
                    : 'border-slate-700/80 text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showEditor ? 'Hide Text Editor' : 'Customize Wording'}
              </button>
            </div>
          </div>

          {/* Optional Custom Copy Drawer */}
          {showEditor && (
            <div className="p-6 bg-[#0B0F19]/80 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Intro Frame Copy
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIntroConfig({ ...PROMO_PRESETS[presetId].intro })}
                    className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Intro
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-xs text-slate-400">Subtitle Hook</span>
                    <input
                      type="text"
                      value={introConfig.subtitle}
                      onChange={(e) =>
                        setIntroConfig((prev) => ({ ...prev, subtitle: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 text-sm bg-[#111827] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Left Pill Segment (White)</span>
                    <input
                      type="text"
                      value={introConfig.speedBadge}
                      onChange={(e) =>
                        setIntroConfig((prev) => ({ ...prev, speedBadge: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-[#111827] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Middle Segment (Optional)</span>
                    <input
                      type="text"
                      value={introConfig.middleBadge}
                      placeholder="e.g. +30s Skip"
                      onChange={(e) =>
                        setIntroConfig((prev) => ({ ...prev, middleBadge: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-[#111827] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </label>
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-xs text-slate-400">Right Outcome Segment (Emerald)</span>
                    <input
                      type="text"
                      value={introConfig.savedBadge}
                      onChange={(e) =>
                        setIntroConfig((prev) => ({ ...prev, savedBadge: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 text-xs font-mono bg-[#111827] border border-slate-700 rounded-lg text-emerald-300 focus:outline-none focus:border-red-500"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Outro Frame Copy
                  </h3>
                  <button
                    type="button"
                    onClick={() => setOutroConfig({ ...PROMO_PRESETS[presetId].outro })}
                    className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Outro
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Subtitle Line</span>
                    <input
                      type="text"
                      value={outroConfig.subtitle}
                      onChange={(e) =>
                        setOutroConfig((prev) => ({ ...prev, subtitle: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 text-sm bg-[#111827] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">CTA Button Text</span>
                    <input
                      type="text"
                      value={outroConfig.ctaLabel}
                      onChange={(e) =>
                        setOutroConfig((prev) => ({ ...prev, ctaLabel: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 text-sm bg-[#111827] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Bottom Trust Micro-Copy</span>
                    <input
                      type="text"
                      value={outroConfig.trustLine}
                      onChange={(e) =>
                        setOutroConfig((prev) => ({ ...prev, trustLine: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 text-xs bg-[#111827] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-red-500"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Side-by-Side 16:9 Intro & Outro Previews */}
          <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* INTRO CARD */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    01. Intro Title Card (0:00 – 0:03)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Unified crimson radial glow + auto-sized telemetry pill (no clipping)
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                  16:9 · 4K
                </span>
              </div>

              <div className="aspect-video w-full rounded-lg overflow-hidden border border-slate-800 bg-[#050811]">
                <canvas
                  ref={introCanvasRef}
                  className="w-full h-full block object-contain"
                />
              </div>

              {compareHeraRefs && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs text-slate-400">
                    Uploaded Hera Intro reference (notice the clipped{' '}
                    <code className="font-mono text-[11px] text-slate-300">1.5× · Saves 3m 20s</code>{' '}
                    box &amp; missing red glow):
                  </p>
                  <img
                    src="/assets/aistudio/Hera_Cadence_Intro_fb83d56e.png"
                    alt="Original Hera Intro reference"
                    className="w-full aspect-video object-cover rounded-lg border border-slate-800/80 opacity-90"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => downloadBookendPng('intro', 3840)}
                  disabled={exportingKey === 'intro-3840'}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                >
                  <Download className="w-3.5 h-3.5" />
                  {exportingKey === 'intro-3840' ? 'Rendering 4K...' : 'Download 4K .PNG'}
                </button>
                <button
                  type="button"
                  onClick={() => downloadBookendPng('intro', 1920)}
                  disabled={exportingKey === 'intro-1920'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                >
                  <Download className="w-3.5 h-3.5" />
                  1080p .PNG
                </button>
                <button
                  type="button"
                  onClick={() => downloadBookendSvg('intro')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 border border-slate-700 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Lossless .SVG
                </button>
              </div>
            </div>

            {/* OUTRO CARD */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    02. Outro End Card (Final 4 Seconds)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Warm crimson bloom + Chrome Web Store CTA + compression-safe footer text
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                  16:9 · 4K
                </span>
              </div>

              <div className="aspect-video w-full rounded-lg overflow-hidden border border-slate-800 bg-[#050811]">
                <canvas
                  ref={outroCanvasRef}
                  className="w-full h-full block object-contain"
                />
              </div>

              {compareHeraRefs && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs text-slate-400">
                    Uploaded Hera Outro reference (source inspiration for the crimson glow):
                  </p>
                  <img
                    src="/assets/aistudio/Hera_Cadence_Outro_7b23ca7d.png"
                    alt="Original Hera Outro reference"
                    className="w-full aspect-video object-cover rounded-lg border border-slate-800/80 opacity-90"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => downloadBookendPng('outro', 3840)}
                  disabled={exportingKey === 'outro-3840'}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                >
                  <Download className="w-3.5 h-3.5" />
                  {exportingKey === 'outro-3840' ? 'Rendering 4K...' : 'Download 4K .PNG'}
                </button>
                <button
                  type="button"
                  onClick={() => downloadBookendPng('outro', 1920)}
                  disabled={exportingKey === 'outro-1920'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                >
                  <Download className="w-3.5 h-3.5" />
                  1080p .PNG
                </button>
                <button
                  type="button"
                  onClick={() => downloadBookendSvg('outro')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 border border-slate-700 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Lossless .SVG
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Transparent 16:9 Scene Callout Overlays */
        <div className="p-6 space-y-5">
          <div className="max-w-3xl space-y-1">
            <h3 className="text-sm font-bold text-slate-100">
              Full-Frame Transparent RGBA Overlays for Screen Recordings
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Each PNG exports at full{' '}
              <code className="font-mono text-slate-200 tabular-nums">3840×2160</code> or{' '}
              <code className="font-mono text-slate-200 tabular-nums">1920×1080</code> with a true
              transparent alpha channel and pre-aligned title-safe margins—drop directly onto Track
              V2 above your screen capture with a{' '}
              <span className="font-mono tabular-nums text-slate-300">0.25s</span> cross-dissolve.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {SCENE_CALLOUT_OVERLAYS.map((card) => (
              <div
                key={card.id}
                className="p-4 rounded-xl bg-[#0B0F19] border border-slate-800/90 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-200">{card.sceneLabel}</span>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    {card.timecodeHint}
                  </span>
                </div>

                {/* Checkerboard alpha preview */}
                <div className="aspect-video w-full rounded-lg overflow-hidden border border-slate-800 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:14px_14px] bg-[#090D16]">
                  <canvas
                    ref={(el) => {
                      overlayCanvasRefs.current[card.id] = el;
                    }}
                    className="w-full h-full block object-contain"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadOverlayPng(card, 3840)}
                    disabled={exportingKey === `${card.id}-3840`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {exportingKey === `${card.id}-3840` ? 'Rendering...' : '4K Alpha .PNG'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadOverlayPng(card, 1920)}
                    disabled={exportingKey === `${card.id}-1920`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                  >
                    <Download className="w-3.5 h-3.5" />
                    1080p Alpha .PNG
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
