import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  Code2,
  Columns2,
  Eye,
  Forward,
  Layers,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import thumbMusic from '../assets/images/thumb_music_session_1792776982151.jpg';
import thumbEducational from '../assets/images/thumb_educational_science_1792776982678.jpg';
import thumbPodcast from '../assets/images/thumb_podcast_lecture_1792776984218.jpg';
import thumbSystems from '../assets/images/thumb_systems_lecture_1792776984438.jpg';
import thumbLiveOrbital from '../assets/images/thumb_live_orbital_telemetry_1793158997775.jpg';

type ComparisonMode = 'v140-three-row' | 'v135-owner' | 'off';
type ScenarioMode = 'vod' | 'live-dvr' | 'live-head' | 'ad';
type ViewportMode = 'two-column' | 'half-split' | 'tight-split';
type BaselineSourceMode = 'rule' | 'default';

interface ToolbarLayoutLabProps {
  onBackToSimulator: () => void;
}

const BASELINE_SCREENSHOT_PATH =
  '/assets/aistudio/Screenshot_2026-10-30_5.20.05_PM_7e59b7f6.png';

const UP_NEXT_ITEMS = [
  {
    id: 'up-1',
    title: 'Can You Pass My Architecture Quiz? 10 Systems Questions',
    channel: 'Systems Craft',
    verified: true,
    meta: '12K views · Streamed 48 min ago',
    duration: '1:29:31',
    thumb: thumbSystems,
  },
  {
    id: 'up-2',
    title: 'Why Low-Thrust Ion Trajectories Spiral Instead of Hohmann Transfer',
    channel: 'Orbital Mechanics Lab',
    verified: true,
    meta: '8.9K views · 6h ago',
    duration: '44:38',
    thumb: thumbEducational,
  },
  {
    id: 'up-3',
    title: 'Mobile Hardware & ChromeOS Silicon in a Post-ARM World',
    channel: 'The Longform Archive',
    verified: false,
    meta: '4.5K views · 11h ago',
    duration: '29:07',
    thumb: thumbPodcast,
  },
  {
    id: 'up-4',
    title: 'Autumn Modular Tape Session — Ambient Hardware Synthesis',
    channel: 'Velvet Room Sessions',
    verified: false,
    meta: '4.1K views · 9h ago',
    duration: '1:17:33',
    thumb: thumbMusic,
  },
  {
    id: 'up-5',
    title: 'LIVE: Lunar Relay Insertion Burn & Deep-Space Telemetry',
    channel: 'Orbital Mechanics Lab',
    verified: true,
    meta: '18K watching · Live',
    duration: 'LIVE',
    thumb: thumbLiveOrbital,
  },
];

function formatSpeed(speed: number): string {
  return speed.toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
}

function formatCompactSpeed(speed: number): string {
  const n = Math.round(speed * 100) / 100;
  return String(n);
}

function clampSpeed(speed: number): number {
  return Math.round(Math.min(4.0, Math.max(0.25, speed)) * 100) / 100;
}

function formatCompactDuration(rawSec: number): string {
  const safeSec = Math.max(0, Math.round(rawSec || 0));
  if (safeSec < 60) return `${safeSec}s`;
  const totalMins = Math.max(1, Math.round(safeSec / 60));
  if (totalMins < 60) return `${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatExactMinutesSeconds(rawSec: number): string {
  const safeSec = Math.max(0, Math.round(rawSec || 0));
  if (safeSec < 60) return `${safeSec}s`;
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
  }
  return secs > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${mins}m`;
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function buildDurationSizerText(text: string): string {
  if (!text) return '';
  return text
    .replace(/@\s*[\d.]+×$/, '@ 8.88×')
    .replace(/\b\d([sm])\b/g, '88$1')
    .replace(/\d/g, '8');
}

const CadenceEmblem: React.FC = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" className="w-4 h-4 shrink-0">
    <rect
      x="0.75"
      y="0.75"
      width="18.5"
      height="18.5"
      rx="4.5"
      fill="#0F172A"
      stroke="rgba(255,255,255,0.22)"
      strokeWidth="1"
    />
    <path d="M5.2 5.1L12.5 10L5.2 14.9V5.1Z" fill="#EF4444" />
    <rect x="13.7" y="5.1" width="2" height="9.8" rx="0.8" fill="#F8FAFC" />
  </svg>
);

export const ToolbarLayoutLab: React.FC<ToolbarLayoutLabProps> = ({
  onBackToSimulator,
}) => {
  const [comparisonMode, setComparisonMode] =
    useState<ComparisonMode>('v140-three-row');
  const [scenario, setScenario] = useState<ScenarioMode>('vod');
  const [viewportMode, setViewportMode] = useState<ViewportMode>('tight-split');
  const [baselineSource, setBaselineSource] =
    useState<BaselineSourceMode>('default');
  const [savedRuleSpeed, setSavedRuleSpeed] = useState<number>(1.5);
  const defaultGlobalSpeed = 1.25;

  const [showSkipControls, setShowSkipControls] = useState<boolean>(true);
  const [showDomXray, setShowDomXray] = useState<boolean>(false);

  const baselineSpeed =
    baselineSource === 'rule' ? savedRuleSpeed : defaultGlobalSpeed;
  const totalDurationSec = 860; // 14:20 video
  const [currentSec, setCurrentSec] = useState<number>(185);
  const [dvrLagSec, setDvrLagSec] = useState<number>(1320); // 22m behind live
  const [speed, setSpeed] = useState<number>(1.75);
  const [hasSessionOverride, setHasSessionOverride] = useState<boolean>(true);
  const [barToast, setBarToast] = useState<string | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<string | null>(null);
  const [videoImgError, setVideoImgError] = useState<boolean>(false);
  const [thumbErrors, setThumbErrors] = useState<Record<string, boolean>>({});
  const [measuredBarWidth, setMeasuredBarWidth] = useState<number>(504);
  const [collapseTagline, setCollapseTagline] = useState<boolean>(false);

  const barContainerRef = useRef<HTMLDivElement | null>(null);
  const row1ContainerRef = useRef<HTMLDivElement | null>(null);
  const row1LeftRef = useRef<HTMLDivElement | null>(null);
  const brandFullMeasureRef = useRef<HTMLSpanElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const seekTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
    };
  }, []);

  const recomputeRow1Layout = () => {
    const barEl = barContainerRef.current;
    if (barEl) {
      const w = Math.round(barEl.getBoundingClientRect().width);
      if (w > 0) {
        setMeasuredBarWidth((prev) => (prev === w ? prev : w));
      }
    }

    const row1El = row1ContainerRef.current;
    const leftEl = row1LeftRef.current;
    if (!row1El || !leftEl) return;

    const availableWidth = row1El.clientWidth;
    if (availableWidth <= 0) return;

    const leftWidth = Math.ceil(leftEl.getBoundingClientRect().width);
    const fullBrandWidth = Math.ceil(
      brandFullMeasureRef.current?.getBoundingClientRect().width || 206
    );
    const minBreathingGapPx = 16;
    const shouldCollapse =
      leftWidth + fullBrandWidth + minBreathingGapPx > availableWidth;

    setCollapseTagline((prev) => (prev === shouldCollapse ? prev : shouldCollapse));
  };

  useLayoutEffect(() => {
    recomputeRow1Layout();
  });

  useEffect(() => {
    const barEl = barContainerRef.current;
    const row1El = row1ContainerRef.current;
    const leftEl = row1LeftRef.current;
    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => recomputeRow1Layout());
    if (barEl) ro.observe(barEl);
    if (row1El) ro.observe(row1El);
    if (leftEl) ro.observe(leftEl);

    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(() => recomputeRow1Layout()).catch(() => {});
    }

    return () => ro.disconnect();
  }, [viewportMode, comparisonMode]);

  const triggerAmberToast = (msg: string) => {
    setBarToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setBarToast(null);
    }, 2400);
  };

  const triggerSeekNotice = (msg: string) => {
    setSeekFeedback(msg);
    if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
    seekTimerRef.current = window.setTimeout(() => {
      setSeekFeedback(null);
    }, 1800);
  };

  const isAd = scenario === 'ad';
  const isLiveHead = scenario === 'live-head';
  const isLiveDvr = scenario === 'live-dvr';
  const effectiveSpeed = isAd ? 1.0 : isLiveHead && speed > 1.01 ? 1.0 : speed;

  const handleSelectScenario = (next: ScenarioMode) => {
    setScenario(next);
    setBarToast(null);
    if (next === 'live-dvr') {
      setSpeed(2.0);
      setHasSessionOverride(Math.abs(2.0 - baselineSpeed) >= 0.015);
      setDvrLagSec(1320);
    } else if (next === 'live-head') {
      setSpeed(1.0);
      setHasSessionOverride(false);
    } else if (next === 'vod') {
      setSpeed(1.75);
      setHasSessionOverride(Math.abs(1.75 - baselineSpeed) >= 0.015);
    }
  };

  const applyRuleStatePreset = (
    nextBaseline: BaselineSourceMode,
    withOverride: boolean
  ) => {
    if (isAd || isLiveHead) {
      setScenario('vod');
    }
    const targetBase =
      nextBaseline === 'rule' ? savedRuleSpeed : defaultGlobalSpeed;
    setBaselineSource(nextBaseline);
    if (withOverride) {
      const overrideVal = Math.abs(targetBase - 1.75) < 0.015 ? 2.0 : 1.75;
      setSpeed(overrideVal);
      setHasSessionOverride(true);
    } else {
      setSpeed(targetBase);
      setHasSessionOverride(false);
    }
  };

  const handleSpeedClick = (targetSpeed: number) => {
    const clean = clampSpeed(targetSpeed);
    if (isAd) {
      triggerAmberToast('Speed locked during ad');
      return;
    }
    if (isLiveHead && clean > 1.01) {
      triggerAmberToast('Stream is currently at live end');
      return;
    }
    setBarToast(null);
    if (Math.abs(clean - baselineSpeed) < 0.015) {
      setSpeed(baselineSpeed);
      setHasSessionOverride(false);
    } else {
      setSpeed(clean);
      setHasSessionOverride(true);
    }
  };

  const handleResetSpeed = () => {
    if (isAd) {
      triggerAmberToast('Speed locked during ad');
      return;
    }
    setBarToast(null);
    setSpeed(isLiveHead ? 1.0 : baselineSpeed);
    setHasSessionOverride(false);
    triggerSeekNotice(
      `Reset to ${baselineSource === 'rule' ? 'Rule' : 'Default'} (${formatSpeed(
        baselineSpeed
      )}×)`
    );
  };

  const handleSaveOrUpdateChannelRule = () => {
    if (isAd) {
      triggerAmberToast('Speed locked during ad');
      return;
    }
    const nextRuleSpd = clampSpeed(effectiveSpeed);
    setSavedRuleSpeed(nextRuleSpd);
    setBaselineSource('rule');
    setSpeed(nextRuleSpd);
    setHasSessionOverride(false);
    triggerSeekNotice(`Saved Rule · ${formatSpeed(nextRuleSpd)}×`);
  };

  const handleClearChannelRule = () => {
    if (isAd) {
      triggerAmberToast('Speed locked during ad');
      return;
    }
    setBaselineSource('default');
    if (!isLiveHead) {
      setSpeed(defaultGlobalSpeed);
      setHasSessionOverride(false);
    }
    triggerSeekNotice(
      `Cleared Rule · Default (${formatSpeed(defaultGlobalSpeed)}×)`
    );
  };

  const handleSkipDelta = (deltaSec: number) => {
    if (isAd) {
      triggerAmberToast('Skip locked during ad');
      return;
    }
    const sign = deltaSec > 0 ? '+' : '−';
    const absLabel = `${Math.abs(deltaSec)}s`;

    if (isLiveHead) {
      if (deltaSec < 0) {
        setScenario('live-dvr');
        setDvrLagSec(Math.abs(deltaSec));
        triggerSeekNotice(`Rewound ${absLabel} into DVR`);
      } else {
        triggerAmberToast('Stream is currently at live end');
      }
      return;
    }

    if (isLiveDvr) {
      const nextLag = Math.max(0, dvrLagSec - deltaSec);
      if (nextLag <= 2) {
        setDvrLagSec(0);
        setScenario('live-head');
        setSpeed(1.0);
        setHasSessionOverride(false);
        triggerSeekNotice('Synced to Live · 1.0×');
      } else {
        setDvrLagSec(nextLag);
        triggerSeekNotice(
          `${sign}${absLabel} · −${formatCompactDuration(nextLag)} DVR`
        );
      }
      return;
    }

    const nextTime = Math.min(
      totalDurationSec,
      Math.max(0, currentSec + deltaSec)
    );
    setCurrentSec(nextTime);
    triggerSeekNotice(`${sign}${absLabel} → ${formatClock(nextTime)}`);
  };

  const handleJumpToLive = () => {
    setDvrLagSec(0);
    setScenario('live-head');
    setSpeed(1.0);
    setHasSessionOverride(false);
    triggerSeekNotice('Jumped to Live · 1.0×');
  };

  const durationBadge = (() => {
    if (isAd) {
      return { mode: 'hidden' as const, text: '', clickable: false };
    }
    if (isLiveHead) {
      return { mode: 'live-head' as const, text: 'Live', clickable: false };
    }
    if (isLiveDvr) {
      const lagTxt = formatCompactDuration(dvrLagSec);
      if (effectiveSpeed > 1.02) {
        const catchupSec = Math.max(
          1,
          Math.round(dvrLagSec / (effectiveSpeed - 1.0))
        );
        return {
          mode: 'live-catchup' as const,
          text: `−${lagTxt} · Live in ${formatCompactDuration(catchupSec)} @ ${formatSpeed(effectiveSpeed)}×`,
          clickable: true,
        };
      }
      return {
        mode: 'live-behind' as const,
        text: `${lagTxt} behind Live`,
        clickable: true,
      };
    }
    const remSec = Math.max(
      0,
      Math.round((totalDurationSec - currentSec) / effectiveSpeed)
    );
    return {
      mode: 'vod' as const,
      text: `${formatCompactDuration(remSec)} left @ ${formatSpeed(effectiveSpeed)}×`,
      clickable: false,
    };
  })();

  const renderToastOverlay = () => {
    if (!barToast) return null;
    return (
      <div
        role="status"
        aria-live="polite"
        className="absolute bottom-[calc(100%+7px)] left-1/2 -translate-x-1/2 z-40 pointer-events-none inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111827] border border-amber-500/50 text-[11.5px] font-medium text-amber-200 whitespace-nowrap tabular-nums shadow-lg"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>{barToast}</span>
      </div>
    );
  };

  const renderDurationPill = () => {
    if (!durationBadge.text) return null;
    return (
      <button
        type="button"
        disabled={!durationBadge.clickable}
        onClick={() => {
          if (durationBadge.clickable) handleJumpToLive();
        }}
        title={durationBadge.clickable ? 'Click to jump to live edge' : undefined}
        className={`inline-flex items-center gap-1.5 rounded text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0 transition-colors ${
          durationBadge.clickable
            ? 'px-1.5 py-0.5 border border-slate-400/35 text-slate-100 hover:bg-white/15 hover:border-red-500/70 cursor-pointer'
            : durationBadge.mode === 'live-head'
              ? 'text-white font-semibold cursor-default'
              : 'text-slate-300 cursor-default'
        }`}
      >
        {durationBadge.mode !== 'vod' && (
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              durationBadge.mode === 'live-head' ? 'bg-red-500' : 'bg-amber-400'
            }`}
          />
        )}
        <span className="inline-grid items-center text-left">
          <span
            aria-hidden="true"
            className="col-start-1 row-start-1 invisible pointer-events-none select-none"
          >
            {buildDurationSizerText(durationBadge.text)}
          </span>
          <span className="col-start-1 row-start-1">{durationBadge.text}</span>
        </span>
      </button>
    );
  };

  // Consistent Preset Buttons across all layout widths (~244px total width)
  const renderPresetButtons = () => {
    const presets = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    return (
      <div className="inline-flex items-center gap-0.5 shrink-0">
        {presets.map((spd) => {
          const active = !isAd && Math.abs(effectiveSpeed - spd) < 0.015;
          const blocked = isAd || (isLiveHead && spd > 1.01);
          return (
            <button
              key={spd}
              type="button"
              onClick={() => handleSpeedClick(spd)}
              className={`px-1 py-0.5 text-[11px] rounded font-mono tabular-nums font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#dc2626] text-white font-semibold'
                  : blocked
                    ? 'text-slate-300 opacity-40 hover:opacity-70 hover:bg-amber-500/15'
                    : 'text-slate-200 hover:bg-white/15'
              }`}
            >
              {formatSpeed(spd)}×
            </button>
          );
        })}
      </div>
    );
  };

  // VOD-Only Green "Saved Time" Badge Next to Reset (Omitted on Live DVR, Live Head, and Ads)
  const renderSavedTimeInline = () => {
    if (isAd || isLiveHead || isLiveDvr) return null;

    const deltaSec = Math.round(
      totalDurationSec - totalDurationSec / effectiveSpeed
    );

    if (Math.abs(deltaSec) < 3) {
      return (
        <span
          title="Playing at standard 1.0× speed"
          className="ml-1 text-[10.5px] font-mono tabular-nums text-slate-400/75 whitespace-nowrap shrink-0"
        >
          0s saved
        </span>
      );
    }

    if (deltaSec > 0) {
      return (
        <span
          title={`Total wall-clock time saved on this ${formatClock(totalDurationSec)} video at ${formatSpeed(effectiveSpeed)}×`}
          className="ml-1 text-[10.5px] font-mono tabular-nums text-emerald-400 whitespace-nowrap shrink-0"
        >
          Saves {formatExactMinutesSeconds(deltaSec)}
        </span>
      );
    }

    return (
      <span
        title={`Adds ${formatExactMinutesSeconds(Math.abs(deltaSec))} to total video duration at ${formatSpeed(effectiveSpeed)}×`}
        className="ml-1 text-[10.5px] font-mono tabular-nums text-slate-400/80 whitespace-nowrap shrink-0"
      >
        +{formatExactMinutesSeconds(Math.abs(deltaSec))}
      </span>
    );
  };

  // Row 3 Left Cluster: [−0.05] [+0.05] [Reset] + VOD Saved Time
  const renderRow3FineControls = (includeSavedTime = true) => {
    const blockedDown = isAd;
    const blockedUp = isAd || (isLiveHead && effectiveSpeed + 0.05 > 1.01);

    return (
      <div className="inline-flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => handleSpeedClick(effectiveSpeed - 0.05)}
          title="Decrease playback speed by 0.05×"
          className={`px-1.5 py-0.5 rounded border border-slate-400/25 bg-white/[0.04] text-[10.5px] font-mono tabular-nums text-slate-200 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            blockedDown ? 'opacity-40' : 'hover:bg-white/15 hover:text-white'
          }`}
        >
          −0.05
        </button>
        <button
          type="button"
          onClick={() => handleSpeedClick(effectiveSpeed + 0.05)}
          title="Increase playback speed by 0.05×"
          className={`px-1.5 py-0.5 rounded border border-slate-400/25 bg-white/[0.04] text-[10.5px] font-mono tabular-nums text-slate-200 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            blockedUp ? 'opacity-40' : 'hover:bg-white/15 hover:text-white'
          }`}
        >
          +0.05
        </button>
        <button
          type="button"
          onClick={handleResetSpeed}
          disabled={!isAd && !hasSessionOverride}
          title={`Reset session override to ${
            baselineSource === 'rule' ? 'Rule' : 'Default'
          } (${formatSpeed(baselineSpeed)}×)`}
          className={`px-1.5 py-0.5 rounded border text-[10.5px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
            isAd
              ? 'border-slate-400/25 bg-white/[0.04] text-slate-200 opacity-40 cursor-pointer'
              : hasSessionOverride
                ? 'border-red-500/65 bg-red-500/10 text-white hover:bg-red-500/20 cursor-pointer'
                : 'border-white/10 text-slate-400 opacity-45 cursor-default'
          }`}
        >
          Reset
        </button>

        {includeSavedTime && renderSavedTimeInline()}
      </div>
    );
  };

  // LOCKED STYLE B: Segmented Rewind / Fast-Forward Capsules ([↺ 60|30|10] [10|30|60 ↻]) (~186px)
  const renderLockedStyleBSkipControls = () => {
    if (!showSkipControls) return null;
    const blockedBack = isAd;
    const blockedForward = isAd || isLiveHead;

    return (
      <div className="inline-flex items-center gap-1.5 shrink-0">
        {/* Replay Capsule */}
        <div
          className={`inline-flex items-center rounded border border-slate-400/25 bg-white/[0.04] divide-x divide-white/15 overflow-hidden ${
            blockedBack ? 'opacity-40' : ''
          }`}
        >
          <span
            aria-hidden="true"
            title="Replay seconds"
            className="px-1 py-0.5 text-slate-400 flex items-center justify-center select-none"
          >
            <RotateCcw className="w-3 h-3" />
          </span>
          {[-60, -30, -10].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => handleSkipDelta(sec)}
              title={`Replay ${Math.abs(sec)} seconds`}
              className={`px-1.5 py-0.5 text-[10.5px] font-mono tabular-nums text-slate-200 whitespace-nowrap cursor-pointer transition-colors ${
                blockedBack ? '' : 'hover:bg-white/15 hover:text-white'
              }`}
            >
              {Math.abs(sec)}
            </button>
          ))}
        </div>

        {/* Skip Ahead Capsule */}
        <div
          className={`inline-flex items-center rounded border border-slate-400/25 bg-white/[0.04] divide-x divide-white/15 overflow-hidden ${
            blockedForward ? 'opacity-40' : ''
          }`}
        >
          {[10, 30, 60].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => handleSkipDelta(sec)}
              title={`Skip ahead ${sec} seconds`}
              className={`px-1.5 py-0.5 text-[10.5px] font-mono tabular-nums text-slate-200 whitespace-nowrap cursor-pointer transition-colors ${
                blockedForward ? '' : 'hover:bg-white/15 hover:text-white'
              }`}
            >
              {sec}
            </button>
          ))}
          <span
            aria-hidden="true"
            title="Skip ahead seconds"
            className="px-1 py-0.5 text-slate-400 flex items-center justify-center select-none"
          >
            <RotateCcw className="w-3 h-3 scale-x-[-1]" />
          </span>
        </div>
      </div>
    );
  };

  // LOCKED STYLE A: Full Italic Lower-Right Rule Slot ("Rule" standardized everywhere)
  const renderRow3LowerRightRuleSlot = () => {
    if (baselineSource === 'default') {
      return (
        <div className="inline-flex items-center gap-1.5 italic whitespace-nowrap shrink-0">
          <span className="text-[10.5px] text-slate-400/85">No rule</span>
          <button
            type="button"
            onClick={handleSaveOrUpdateChannelRule}
            title="Save active speed as a Rule for Chrome Unboxed"
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-400/25 bg-white/[0.03] italic text-[10.5px] tabular-nums text-slate-300/90 whitespace-nowrap cursor-pointer transition-colors ${
              isAd ? 'opacity-40' : 'hover:bg-white/12 hover:text-white'
            }`}
          >
            <Plus className="w-2.5 h-2.5 text-red-400 shrink-0" />
            <span>Save {formatSpeed(effectiveSpeed)}× Rule</span>
          </button>
        </div>
      );
    }

    if (hasSessionOverride && !isAd) {
      return (
        <div className="inline-flex items-center gap-1.5 italic whitespace-nowrap shrink-0">
          <span className="text-[10.5px] tabular-nums text-slate-400/85">
            Rule: {formatSpeed(savedRuleSpeed)}×
          </span>
          <button
            type="button"
            onClick={handleSaveOrUpdateChannelRule}
            title={`Update Chrome Unboxed Rule from ${formatSpeed(savedRuleSpeed)}× to ${formatSpeed(effectiveSpeed)}×`}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-amber-400/35 bg-amber-500/[0.08] italic text-[10.5px] tabular-nums text-amber-200/95 hover:bg-amber-500/20 whitespace-nowrap cursor-pointer transition-colors"
          >
            <span>Update → {formatSpeed(effectiveSpeed)}×</span>
          </button>
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-1.5 italic whitespace-nowrap shrink-0">
        <span className="text-[10.5px] tabular-nums text-slate-400/85">
          Rule: {formatSpeed(savedRuleSpeed)}×
        </span>
        <button
          type="button"
          onClick={handleClearChannelRule}
          title="Clear saved Rule and revert to Default speed"
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-400/25 bg-white/[0.03] italic text-[10.5px] text-slate-300/90 whitespace-nowrap cursor-pointer transition-colors ${
            isAd ? 'opacity-40' : 'hover:bg-white/12 hover:text-white'
          }`}
        >
          <span>Clear</span>
          <X className="w-2.5 h-2.5 text-slate-400 shrink-0" />
        </button>
      </div>
    );
  };

  // Locked Top-Right Brand Signature: Dynamically drops tagline whenever Row 1 Left + Full Brand would collide
  const renderBrandSignature = () => {
    return (
      <button
        type="button"
        onClick={() => triggerSeekNotice('Opens Cadence Options & Channel Rules')}
        title="Cadence - YouTube at your speed (Click to open Options)"
        className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-300/85 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer group"
      >
        <CadenceEmblem />
        <span className="font-display font-semibold tracking-tight text-slate-200 group-hover:text-white">
          Cadence
        </span>
        {!collapseTagline && (
          <span className="text-slate-400 group-hover:text-slate-300">
            - YouTube at your speed
          </span>
        )}
      </button>
    );
  };

  // FINAL LOCKED v1.4.0 3-ROW TRANSPORT DECK ABOVE #title
  const renderThreeRowDeckToolbar = () => {
    const modeLabel = isAd
      ? 'Sponsored Ad'
      : hasSessionOverride
        ? 'Session Override'
        : baselineSource === 'rule'
          ? 'Channel Rule'
          : 'Default';

    return (
      <div
        ref={barContainerRef}
        className="relative w-full rounded-lg bg-white/[0.08] border border-white/[0.14] px-2.5 py-1.5 space-y-1.5 text-xs text-slate-100"
      >
        {renderToastOverlay()}

        {/* Hidden intrinsic sizer for exact full-tagline collision detection across fonts/zoom */}
        <span
          ref={brandFullMeasureRef}
          aria-hidden="true"
          className="absolute left-0 top-0 invisible pointer-events-none select-none inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap"
        >
          <CadenceEmblem />
          <span className="font-display font-semibold tracking-tight">Cadence</span>
          <span>- YouTube at your speed</span>
        </span>

        {/* ROW 1: Speed Source + Real-Time Duration (Left) · Brand Signature (Right) */}
        <div
          ref={row1ContainerRef}
          className="flex items-center justify-between gap-2 pb-1 border-b border-white/[0.08] text-[11px] whitespace-nowrap overflow-hidden"
        >
          <div ref={row1LeftRef} className="inline-flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 text-slate-300 whitespace-nowrap shrink-0">
              <span>{modeLabel} ·</span>
              <span className="inline-grid items-center font-mono tabular-nums">
                <span
                  aria-hidden="true"
                  className="col-start-1 row-start-1 invisible pointer-events-none select-none font-semibold"
                >
                  8.88×
                </span>
                <strong
                  className={`col-start-1 row-start-1 font-semibold ${
                    isAd || hasSessionOverride ? 'text-[#fdba74]' : 'text-white'
                  }`}
                >
                  {formatCompactSpeed(effectiveSpeed)}×
                </strong>
              </span>
            </span>

            <span className="w-px h-3 bg-white/15 shrink-0" aria-hidden="true" />

            {isAd ? (
              <span className="text-amber-300/90 font-mono text-[11px] whitespace-nowrap">
                Controls paused until ad ends
              </span>
            ) : (
              renderDurationPill()
            )}
          </div>

          {renderBrandSignature()}
        </div>

        {/* ROW 2: Playback Speed Presets (Left) + Locked Style B Capsules (Justified Right) */}
        <div className="flex flex-nowrap items-center justify-between gap-2">
          <div className="flex items-center shrink-0">{renderPresetButtons()}</div>

          {showSkipControls && (
            <div className="ml-auto flex items-center justify-end shrink-0">
              {renderLockedStyleBSkipControls()}
            </div>
          )}
        </div>

        {/* ROW 3: [−0.05] [+0.05] [Reset] + VOD-Only Saved Time (Left) · Locked Style A Italic Rule Slot (Right) */}
        <div className="flex flex-nowrap items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
          {renderRow3FineControls(true)}
          <div className="ml-auto flex items-center justify-end shrink-0">
            {renderRow3LowerRightRuleSlot()}
          </div>
        </div>
      </div>
    );
  };

  const renderLegacyV135Bar = () => {
    return (
      <div className="relative ml-2.5 shrink-0 whitespace-nowrap flex items-center gap-1.5 text-xs text-slate-100 rounded-lg bg-white/[0.08] border border-white/[0.14] px-2.5 py-1.5">
        {renderToastOverlay()}
        <span className="text-[11px] text-slate-300 tabular-nums whitespace-nowrap">
          {hasSessionOverride
            ? 'Session'
            : baselineSource === 'rule'
              ? 'Rule'
              : 'Default'}{' '}
          ·{' '}
          <strong className="text-[#fdba74] font-semibold">
            {formatCompactSpeed(effectiveSpeed)}×
          </strong>
        </span>
        {renderPresetButtons()}
        <span className="w-px h-3.5 bg-white/15 mx-0.5 shrink-0" aria-hidden="true" />
        {renderRow3FineControls(false)}
        {durationBadge.text && (
          <>
            <span className="w-px h-3.5 bg-white/15 mx-0.5 shrink-0" aria-hidden="true" />
            {renderDurationPill()}
          </>
        )}
      </div>
    );
  };

  const isPresetNoRuleBase =
    !isAd && !isLiveHead && baselineSource === 'default' && !hasSessionOverride;
  const isPresetNoRuleOverride =
    !isAd && !isLiveHead && baselineSource === 'default' && hasSessionOverride;
  const isPresetRuleBase =
    !isAd && !isLiveHead && baselineSource === 'rule' && !hasSessionOverride;
  const isPresetRuleOverride =
    !isAd && !isLiveHead && baselineSource === 'rule' && hasSessionOverride;

  return (
    <div className="space-y-7">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-800/90">
        <div className="max-w-3xl">
          <div className="text-xs font-mono tabular-nums text-emerald-400 mb-1.5">
            v1.4.0 Watch-Page Toolbar · Final Locked 3-Row Specification
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 [text-wrap:balance]">
            Locked v1.4.0 Transport Deck Across VOD, Live DVR &amp; Split Widths
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
            Locked in <strong className="text-slate-200 font-semibold">Style A</strong> (full italic
            lower-right <code className="font-mono text-xs text-slate-200">Rule</code> slot) and
            restricted <strong className="text-emerald-400 font-semibold">Saves Xm Ys</strong>{' '}
            strictly to finite VOD videos—leaving Live DVR and Live Head clean so Row 1’s{' '}
            <code className="font-mono text-xs text-slate-200">−22m · Live in 22m @ 2.0×</code>{' '}
            remains the sole live timing readout.
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToSimulator}
          className="px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#111827] border border-slate-700/90 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 self-start lg:self-auto cursor-pointer"
        >
          ← Back to Full Simulator
        </button>
      </div>

      {/* Interactive Verification Control Deck */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-center">
          {/* 1. Playback Scenario Switcher (VOD vs Live DVR vs Live Head vs Ad Lock) */}
          <div className="xl:col-span-6 space-y-1.5">
            <div className="text-xs font-semibold text-slate-300">
              1. Verify Playback Mode (VOD Shows Saved Time · Live Streams Omit It)
            </div>
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-[#0B0F19] border border-slate-800 rounded-lg"
              role="group"
              aria-label="Playback scenario"
            >
              {(
                [
                  { id: 'vod', label: 'VOD Video', sub: 'Shows Saves Xm Ys' },
                  { id: 'live-dvr', label: 'Live DVR (−22m)', sub: 'Saved time hidden' },
                  { id: 'live-head', label: 'Live Head', sub: 'Locked @ 1.0×' },
                  { id: 'ad', label: 'Sponsored Ad', sub: 'Controls locked' },
                ] as const
              ).map((sc) => {
                const active = scenario === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => handleSelectScenario(sc.id)}
                    className={`px-2.5 py-2 rounded-md text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-red-600 text-white'
                        : 'text-slate-300 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="text-xs font-semibold leading-tight">{sc.label}</div>
                    <div
                      className={`text-[10px] font-mono mt-0.5 leading-tight truncate ${
                        active ? 'text-red-100' : 'text-slate-400'
                      }`}
                    >
                      {sc.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Channel Rule vs. No Channel Rule State Matrix */}
          <div className="xl:col-span-6 space-y-1.5">
            <div className="text-xs font-semibold text-slate-300">
              2. Verify &ldquo;No Rule&rdquo; vs. &ldquo;Rule&rdquo; States
            </div>
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-[#0B0F19] border border-slate-800 rounded-lg"
              role="group"
              aria-label="Channel rule and session override state presets"
            >
              <button
                type="button"
                onClick={() => applyRuleStatePreset('default', false)}
                className={`px-2 py-2 rounded-md text-left transition-colors cursor-pointer ${
                  isPresetNoRuleBase
                    ? 'bg-slate-800 border border-amber-400/55 text-amber-100'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="text-[11px] font-semibold leading-tight">
                  No Rule ({formatSpeed(defaultGlobalSpeed)}×)
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                  Default active
                </div>
              </button>

              <button
                type="button"
                onClick={() => applyRuleStatePreset('default', true)}
                className={`px-2 py-2 rounded-md text-left transition-colors cursor-pointer ${
                  isPresetNoRuleOverride
                    ? 'bg-slate-800 border border-amber-400/55 text-amber-100'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="text-[11px] font-semibold leading-tight">
                  No Rule + 1.75×
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                  Session override
                </div>
              </button>

              <button
                type="button"
                onClick={() => applyRuleStatePreset('rule', false)}
                className={`px-2 py-2 rounded-md text-left transition-colors cursor-pointer ${
                  isPresetRuleBase
                    ? 'bg-slate-800 border border-amber-400/55 text-amber-100'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="text-[11px] font-semibold leading-tight">
                  Rule ({formatSpeed(savedRuleSpeed)}×)
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                  Rule active
                </div>
              </button>

              <button
                type="button"
                onClick={() => applyRuleStatePreset('rule', true)}
                className={`px-2 py-2 rounded-md text-left transition-colors cursor-pointer ${
                  isPresetRuleOverride
                    ? 'bg-slate-800 border border-amber-400/55 text-amber-100'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="text-[11px] font-semibold leading-tight">
                  Rule + Override
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                  Rule {formatSpeed(savedRuleSpeed)}× → 1.75×
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Secondary Toggles Row: Window Width + Skip Toggle + X-Ray + Legacy Comparison */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/90">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0B0F19] border border-slate-800"
              role="group"
              aria-label="Simulated browser window width"
            >
              {(
                [
                  { id: 'two-column', label: '2-Column (~760px)', icon: Columns2 },
                  { id: 'half-split', label: 'Half-Width (~584px)', icon: Maximize2 },
                  { id: 'tight-split', label: 'Tight Split (~504px)', icon: Minimize2 },
                ] as const
              ).map((vw) => {
                const Icon = vw.icon;
                const active = viewportMode === vw.id;
                return (
                  <button
                    key={vw.id}
                    type="button"
                    onClick={() => setViewportMode(vw.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-slate-800 text-white border border-slate-600'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{vw.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowSkipControls((s) => !s)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                showSkipControls
                  ? 'bg-slate-800 border-slate-600 text-slate-100'
                  : 'bg-[#0B0F19] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Forward className="w-3.5 h-3.5 text-red-400" />
              <span>Skip: {showSkipControls ? 'Shown' : 'Hidden'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDomXray((x) => !x)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                showDomXray
                  ? 'bg-sky-500/15 border-sky-400/50 text-sky-200'
                  : 'bg-[#0B0F19] border-slate-800 text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span>DOM X-Ray</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setComparisonMode((prev) =>
                  prev === 'v140-three-row'
                    ? 'v135-owner'
                    : prev === 'v135-owner'
                      ? 'off'
                      : 'v140-three-row'
                )
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                comparisonMode === 'v135-owner'
                  ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                  : comparisonMode === 'off'
                    ? 'bg-slate-800 border-slate-600 text-slate-200'
                    : 'bg-[#0B0F19] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>
                {comparisonMode === 'v140-three-row'
                  ? 'Compare: v1.4.0 Deck'
                  : comparisonMode === 'v135-owner'
                    ? 'Compare: v1.3.5 #owner Bug'
                    : 'Compare: Toolbar Off'}
              </span>
            </button>
          </div>

          <div className="text-xs font-mono tabular-nums text-slate-400">
            {comparisonMode === 'v140-three-row' ? (
              <span>
                Bar: <strong className="text-slate-200">{measuredBarWidth}px</strong> ·{' '}
                <span className="text-emerald-400">All 3 rows locked</span>
              </span>
            ) : comparisonMode === 'v135-owner' ? (
              <span className="text-amber-300 font-sans">
                <strong>v1.3.5 Reference:</strong> Bar inside <code className="font-mono">#owner</code>{' '}
                dislocates <code className="font-mono">#actions</code>.
              </span>
            ) : (
              <span className="font-sans">Clean YouTube baseline with Cadence hidden.</span>
            )}
          </div>
        </div>
      </div>

      {/* Simulated Dark-Mode YouTube Watch Page (#0f0f0f) */}
      <div className="rounded-xl border border-slate-800 bg-[#0f0f0f] text-[#f1f1f1] overflow-hidden shadow-2xl">
        {/* Simulated YouTube Masthead */}
        <div className="flex items-center justify-between gap-4 px-4 sm:px-6 py-2.5 bg-[#0f0f0f] border-b border-white/10 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-display font-bold text-sm tracking-tight text-white">
              <span className="inline-flex items-center justify-center w-6 h-4 rounded bg-[#ff0033] text-white">
                <Play className="w-2.5 h-2.5 fill-current" />
              </span>
              <span>Premium</span>
            </div>
            <span className="hidden sm:inline font-mono text-[11px] text-neutral-400">
              youtube.com/watch?v=chrome_unboxed_01
            </span>
          </div>

          <div className="hidden md:flex items-center w-72 px-3.5 py-1.5 rounded-full bg-[#121212] border border-white/15 text-neutral-400 text-xs">
            Search or ask a question
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-neutral-400">
            <span>
              {viewportMode === 'two-column'
                ? `2-Column · Bar ${measuredBarWidth}px`
                : viewportMode === 'half-split'
                  ? `Half-Width Split · Bar ${measuredBarWidth}px`
                  : `Tight Split · Bar ${measuredBarWidth}px`}
            </span>
          </div>
        </div>

        {/* #columns Container */}
        <div
          className={`p-4 sm:p-6 transition-all ${
            viewportMode === 'half-split'
              ? 'max-w-[632px] mx-auto border-x border-dashed border-white/10'
              : viewportMode === 'tight-split'
                ? 'max-w-[552px] mx-auto border-x border-dashed border-amber-400/25'
                : ''
          }`}
        >
          <div
            className={`relative grid grid-cols-1 ${
              viewportMode === 'two-column' ? 'lg:grid-cols-12 gap-6' : 'gap-6'
            } items-start`}
          >
            {/* LEFT COLUMN: #primary */}
            <div
              className={`${
                viewportMode === 'two-column' ? 'lg:col-span-8' : ''
              } min-w-0 ${
                showDomXray
                  ? 'outline-1 outline-dashed outline-sky-500/60 p-2 rounded-xl relative'
                  : ''
              }`}
            >
              {showDomXray && (
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-mono text-sky-300">
                  <span>#primary (main video + metadata column)</span>
                  <span>bar width: {measuredBarWidth}px</span>
                </div>
              )}

              {/* #player / #movie_player — Cropped from Uploaded Chrome Unboxed Screenshot */}
              <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black select-none">
                {!videoImgError ? (
                  <img
                    src={BASELINE_SCREENSHOT_PATH}
                    alt="YouTube video frame from uploaded Chrome Unboxed watch page"
                    referrerPolicy="no-referrer"
                    onError={() => setVideoImgError(true)}
                    className="absolute -left-[0.6%] -top-[9.6%] w-[143.3%] h-[146.4%] max-w-none object-cover pointer-events-none"
                  />
                ) : (
                  <img
                    src={thumbPodcast}
                    alt="Fallback studio frame"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Subtle Player Scrub & Status Overlay */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent px-3.5 pb-2.5 pt-8">
                  <progress
                    max={100}
                    value={
                      isAd
                        ? 38
                        : isLiveHead
                          ? 100
                          : isLiveDvr
                            ? 76
                            : Math.min(100, Math.round((currentSec / totalDurationSec) * 100))
                    }
                    className={`block h-1 w-full overflow-hidden rounded-full appearance-none bg-white/25 mb-2 [&::-webkit-progress-bar]:bg-white/25 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full ${
                      isAd
                        ? '[&::-webkit-progress-value]:bg-amber-400 [&::-moz-progress-bar]:bg-amber-400'
                        : '[&::-webkit-progress-value]:bg-[#ff0033] [&::-moz-progress-bar]:bg-[#ff0033]'
                    }`}
                  />
                  <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-white/90">
                    <div className="flex items-center gap-2.5">
                      <span>▶</span>
                      {isAd ? (
                        <span className="text-amber-300 font-sans font-semibold">
                          Sponsored · 0:12 · Speed locked at 1.0×
                        </span>
                      ) : isLiveHead ? (
                        <span className="inline-flex items-center gap-1.5 font-sans font-semibold">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          LIVE
                        </span>
                      ) : isLiveDvr ? (
                        <span className="inline-flex items-center gap-1.5 font-sans font-semibold text-neutral-300">
                          <span className="w-2 h-2 rounded-full bg-neutral-400" />
                          LIVE · −{formatCompactDuration(dvrLagSec)}
                        </span>
                      ) : (
                        <span>
                          {formatClock(currentSec)} / {formatClock(totalDurationSec)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {seekFeedback && (
                        <span className="px-2 py-0.5 rounded bg-black/80 border border-white/20 text-white">
                          {seekFeedback}
                        </span>
                      )}
                      <span>{formatSpeed(effectiveSpeed)}×</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ytd-watch-metadata -> #above-the-fold */}
              <div
                className={`mt-3 ${
                  showDomXray
                    ? 'outline-1 outline-dashed outline-emerald-500/60 p-2.5 rounded-xl bg-emerald-950/10'
                    : ''
                }`}
              >
                {showDomXray && (
                  <div className="mb-2 flex items-center justify-between text-[11px] font-mono text-emerald-300">
                    <span>ytd-watch-metadata &gt; #above-the-fold</span>
                    <span>Locked 3-Row Transport Deck</span>
                  </div>
                )}

                {/* LOCKED v1.4.0 3-ROW TRANSPORT DECK ABOVE #title */}
                {comparisonMode === 'v140-three-row' && (
                  <div className="mb-2.5">
                    {showDomXray && (
                      <div className="text-[10px] font-mono text-red-300 mb-1">
                        .cadence-watch-bar (above #title · Style B Skip · Style A Italic Rule)
                      </div>
                    )}
                    {renderThreeRowDeckToolbar()}
                  </div>
                )}

                {/* #title */}
                <div
                  className={`${
                    showDomXray
                      ? 'outline-1 outline-dashed outline-purple-400/55 px-2 py-1 rounded-md mb-2'
                      : ''
                  }`}
                >
                  {showDomXray && (
                    <div className="text-[10px] font-mono text-purple-300 mb-0.5">#title</div>
                  )}
                  <h2 className="text-[18px] sm:text-[20px] font-bold leading-snug text-[#f1f1f1] font-sans">
                    Googlebook: My Brutally Honest Thoughts After 1 Month
                  </h2>
                </div>

                {/* #top-row: #owner (left) + #actions (right) */}
                <div
                  className={`mt-2.5 flex items-center justify-between gap-3 ${
                    comparisonMode === 'v135-owner' && viewportMode === 'two-column'
                      ? 'flex-nowrap overflow-visible relative z-10'
                      : 'flex-wrap'
                  } ${
                    showDomXray
                      ? 'outline-1 outline-dashed outline-amber-400/60 p-2 rounded-lg bg-amber-950/10'
                      : ''
                  }`}
                >
                  {showDomXray && (
                    <div className="w-full text-[10px] font-mono text-amber-300 mb-1">
                      #top-row (untouched by Cadence in v1.4.0)
                    </div>
                  )}

                  {/* #owner */}
                  <div
                    className={`flex items-center gap-3 min-w-0 ${
                      comparisonMode === 'v135-owner' ? 'shrink-0' : ''
                    } ${
                      showDomXray
                        ? 'outline-1 outline-dashed outline-cyan-400/60 px-2 py-1 rounded-md'
                        : ''
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 via-red-500 to-amber-400 p-0.5 shrink-0">
                      <div className="w-full h-full rounded-full bg-[#181818] flex items-center justify-center text-xs font-bold text-white">
                        CU
                      </div>
                    </div>

                    <div className="min-w-0 mr-1">
                      <div className="flex items-center gap-1 text-[15px] font-semibold text-[#f1f1f1] whitespace-nowrap">
                        <span>Chrome Unboxed</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      </div>
                      <div className="text-xs text-[#aaaaaa] whitespace-nowrap">
                        275K subscribers
                      </div>
                    </div>

                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-[#f1f1f1] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Bell className="w-4 h-4" />
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    {comparisonMode === 'v135-owner' && renderLegacyV135Bar()}
                  </div>

                  {/* #actions */}
                  <div
                    className={`flex items-center gap-2 shrink-0 ${
                      showDomXray
                        ? 'outline-1 outline-dashed outline-pink-400/60 px-2 py-1 rounded-md'
                        : ''
                    }`}
                  >
                    {showDomXray && (
                      <span className="text-[10px] font-mono text-pink-300 mr-1">#actions</span>
                    )}
                    <div className="inline-flex items-center rounded-full bg-white/10 overflow-hidden">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 pl-3.5 pr-3 py-2 text-xs font-semibold text-[#f1f1f1] hover:bg-white/15 cursor-pointer tabular-nums"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        <span>217</span>
                      </button>
                      <span className="w-px h-4 bg-white/20" />
                      <button
                        type="button"
                        aria-label="Dislike"
                        className="pl-3 pr-3.5 py-2 text-[#f1f1f1] hover:bg-white/15 cursor-pointer"
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      aria-label="Share"
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-[#f1f1f1] cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 scale-x-[-1]" />
                    </button>

                    <button
                      type="button"
                      aria-label="Ask"
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-[#f1f1f1] cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      aria-label="Save"
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-[#f1f1f1] cursor-pointer"
                    >
                      <Bookmark className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      aria-label="More actions"
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-[#f1f1f1] cursor-pointer"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* #bottom-row: Description Box */}
                <div
                  className={`mt-3 p-3 rounded-xl bg-white/[0.08] text-xs leading-relaxed text-[#f1f1f1] ${
                    showDomXray ? 'outline-1 outline-dashed outline-slate-400/50' : ''
                  }`}
                >
                  {showDomXray && (
                    <div className="text-[10px] font-mono text-slate-300 mb-1">
                      #bottom-row (#description)
                    </div>
                  )}
                  <div className="font-semibold text-[#f1f1f1] tabular-nums">
                    2.1K views &nbsp;1h ago &nbsp;<span className="text-[#aaaaaa]">5 products</span>
                  </div>
                  <p className="mt-1 text-[#e5e5e5] line-clamp-2">
                    Join Chrome Unboxed Plus for access to our private Discord, an ad-free website
                    experience, AMAs, exclusive giveaways, and more! Start your 7-day trial:{' '}
                    <span className="text-[#3ea6ff]">https://chromeunboxed.com/join/</span>
                  </p>
                  <span className="inline-block mt-1 font-semibold text-white">...more</span>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: #secondary (Up Next Sidebar) */}
            {viewportMode === 'two-column' && (
              <aside
                className={`lg:col-span-4 relative z-20 bg-[#0f0f0f] space-y-3 ${
                  showDomXray
                    ? 'outline-1 outline-dashed outline-rose-400/60 p-2.5 rounded-xl'
                    : ''
                }`}
              >
                {showDomXray && (
                  <div className="flex items-center justify-between text-[11px] font-mono text-rose-300">
                    <span>#secondary (right sidebar)</span>
                    <span>stacks on top of #primary overflow</span>
                  </div>
                )}

                <div className="flex items-center gap-2 overflow-hidden">
                  {['All', 'Learning', 'Related', 'For you', 'Recently uploaded'].map(
                    (chip, i) => (
                      <span
                        key={chip}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                          i === 0
                            ? 'bg-[#f1f1f1] text-[#0f0f0f] font-semibold'
                            : 'bg-white/10 text-[#f1f1f1]'
                        }`}
                      >
                        {chip}
                      </span>
                    )
                  )}
                </div>

                <div className="space-y-2.5">
                  {UP_NEXT_ITEMS.map((item) => (
                    <div key={item.id} className="flex gap-2.5 items-start">
                      <div className="relative w-40 aspect-video rounded-lg overflow-hidden bg-neutral-900 shrink-0">
                        {!thumbErrors[item.id] ? (
                          <img
                            src={item.thumb}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setThumbErrors((prev) => ({ ...prev, [item.id]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-500">
                            <Play className="w-5 h-5" />
                          </div>
                        )}
                        <span
                          className={`absolute bottom-1 right-1 px-1 py-0.5 rounded text-[10px] font-mono tabular-nums text-white ${
                            item.duration === 'LIVE' ? 'bg-red-600 font-semibold' : 'bg-black/85'
                          }`}
                        >
                          {item.duration}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="text-xs font-semibold text-[#f1f1f1] line-clamp-2 leading-snug">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-[#aaaaaa] truncate">{item.channel}</div>
                        <div className="text-[11px] text-[#aaaaaa] truncate tabular-nums">
                          {item.meta}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>

      {/* Final Locked v1.4.0 3-Row Architecture Spec Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl border border-slate-800/90 bg-[#111827]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-100">Row 1 · Telemetry &amp; Brand</h3>
            <span className="text-xs font-mono text-emerald-400">Locked</span>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
            Left pairs active source (<code className="font-mono text-slate-200">Default</code>,{' '}
            <code className="font-mono text-slate-200">Channel Rule</code>, or{' '}
            <code className="font-mono text-slate-200">Session Override</code>) with real-time VOD
            remaining or Live DVR catch-up. Right displays the{' '}
            <strong className="text-slate-200">Cadence - YouTube at your speed</strong> signature.
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-800/90 bg-[#111827]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-100">Row 2 · Presets &amp; Seek Capsules</h3>
            <span className="text-xs font-mono text-emerald-400">Locked · Style B</span>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
            Left anchors the six speed presets (<code className="font-mono text-slate-200">0.75×–2.0×</code>).
            Right anchors the compact Replay and Skip Ahead capsules (
            <code className="font-mono text-slate-200">[↺ 60|30|10] [10|30|60 ↻]</code>) with
            identical geometry at every window width.
          </p>
        </div>

        <div className="p-5 rounded-xl border border-slate-800/90 bg-[#111827]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-100">Row 3 · Fine Step, Saved &amp; Rule</h3>
            <span className="text-xs font-mono text-emerald-400">Locked · Style A</span>
          </div>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
            Left groups <code className="font-mono text-slate-200">−0.05</code>,{' '}
            <code className="font-mono text-slate-200">+0.05</code>,{' '}
            <code className="font-mono text-slate-200">Reset</code>, and VOD-only{' '}
            <span className="text-emerald-400 font-mono">Saves Xm Ys</span> (omitted on all Live
            streams). Right renders the italic 1-click <em className="text-slate-200">Rule</em>{' '}
            slot.
          </p>
        </div>
      </div>

      {/* Reference Drawer: User's Uploaded Issue #18 Captures */}
      <details className="bg-[#111827] border border-slate-800/90 rounded-xl group">
        <summary className="flex items-center justify-between gap-4 px-5 py-3.5 text-xs font-semibold text-slate-300 cursor-pointer select-none">
          <span className="inline-flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-400" />
            View Uploaded Issue #18 Reference Screen Grabs (Alpha, Bravo, Charlie &amp; Clean Baseline)
          </span>
          <span className="text-slate-500 group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-5 pb-5 pt-2 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              label: 'Screen Grab Alpha — 2-Column Overflow Behind #secondary',
              src: '/assets/aistudio/Screen_Grab_Alpha_939c194f.png',
            },
            {
              label: 'Screen Grab Bravo — Chat Closed Overflow Behind #secondary',
              src: '/assets/aistudio/Screen_Grab_Bravo_a3ca3e38.png',
            },
            {
              label: 'Screen Grab Charlie — Half-Width Wrapping & Truncated Owner',
              src: '/assets/aistudio/Screen_Grab_Charlie_f035fdd0.png',
            },
            {
              label: 'Clean YouTube Watch Page Baseline (Toolbar Off)',
              src: BASELINE_SCREENSHOT_PATH,
            },
          ].map((shot) => (
            <figure
              key={shot.src}
              className="rounded-lg border border-slate-800 bg-[#0B0F19] overflow-hidden"
            >
              <img
                src={shot.src}
                alt={shot.label}
                referrerPolicy="no-referrer"
                className="w-full h-auto block"
              />
              <figcaption className="px-3 py-2 text-xs text-slate-400 border-t border-slate-800">
                {shot.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </details>
    </div>
  );
};
