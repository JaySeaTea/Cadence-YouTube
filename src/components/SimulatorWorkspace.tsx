import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  FastForward,
  Lock,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  CategoryPreset,
  CategoryPresetId,
  ChannelRule,
  ExtensionEventLog,
  ExtensionSettings,
  PlaylistContextMode,
  SimulatedVideo,
} from '../types/extension';
import {
  EXTENSION_VERSION,
  resolveRuleSpeed,
  SIMULATED_VIDEOS,
} from '../data/initialData';

interface SimulatorWorkspaceProps {
  settings: ExtensionSettings;
  presets: CategoryPreset[];
  rules: ChannelRule[];
  logs: ExtensionEventLog[];
  onUpdateSettings: (patch: Partial<ExtensionSettings>) => void;
  onSaveChannelRule: (
    video: Pick<SimulatedVideo, 'channelName' | 'handle' | 'channelId'>,
    speed: number,
    presetId: CategoryPresetId,
    sourceLabel: string
  ) => void;
  onClearChannelRule: (ruleId: string, channelName: string) => void;
  onAddLog: (action: string, detail: string) => void;
  onNavigateToRules: () => void;
  onNavigateToLayoutLab?: () => void;
}

const CadenceEmblem: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
    <rect
      x="1"
      y="1"
      width="18"
      height="18"
      rx="5"
      fill="#0F172A"
      stroke="#DC2626"
      strokeOpacity="0.6"
      strokeWidth="1.2"
    />
    <path d="M5.6 5.4L12.3 10L5.6 14.6V5.4Z" fill="#DC2626" />
    <rect x="13.4" y="5.4" width="2.1" height="9.2" rx="0.9" fill="#F8FAFC" />
  </svg>
);

const ReplayArcIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.65"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M3.2 5.2H6.6V1.8" />
    <path d="M3.5 5.2A5.3 5.3 0 1 1 2.8 9.2" />
  </svg>
);

const SkipArcIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.65"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12.8 5.2H9.4V1.8" />
    <path d="M12.5 5.2A5.3 5.3 0 1 0 13.2 9.2" />
  </svg>
);

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatSpeed(speed: number): string {
  return speed.toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
}

function formatCompactSpeed(speed: number): string {
  const n = Math.round(speed * 100) / 100;
  return String(n);
}

function buildDurationSizerText(text: string): string {
  if (!text) return '';
  return text
    .replace(/@\s*[\d.]+×$/, '@ 8.88×')
    .replace(/\b\d([sm])\b/g, '88$1')
    .replace(/\d/g, '8');
}

function clampSpeed(speed: number): number {
  return Math.round(Math.min(4.0, Math.max(0.25, speed)) * 100) / 100;
}

function formatCompactDuration(rawSec: number): string {
  const safeSec = Math.max(0, Math.round(rawSec || 0));
  if (safeSec < 60) {
    return `${safeSec}s`;
  }
  const totalMins = Math.max(1, Math.round(safeSec / 60));
  if (totalMins < 60) {
    return `${totalMins}m`;
  }
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatRemainingReadout(rawRemainingSec: number, speed: number): string {
  if (!Number.isFinite(rawRemainingSec) || rawRemainingSec < 0) return '';
  const safeRate = Math.max(0.25, speed || 1.0);
  const totalSec = Math.max(0, Math.round(rawRemainingSec / safeRate));
  return `${formatCompactDuration(totalSec)} left @ ${formatSpeed(safeRate)}×`;
}

function formatTimeSavedDetail(
  rawDurationSec: number,
  speed: number
): { text: string; tone: 'positive' | 'neutral' | 'slower' } {
  const safeRate = Math.max(0.25, speed || 1.0);
  const adjustedSec = Math.round(rawDurationSec / safeRate);
  const diffSec = rawDurationSec - adjustedSec;
  if (Math.abs(diffSec) < 3) {
    return { text: '0s saved', tone: 'neutral' };
  }
  const absSec = Math.abs(diffSec);
  const hrs = Math.floor(absSec / 3600);
  const mins = Math.floor((absSec % 3600) / 60);
  const secs = absSec % 60;
  const formatted =
    hrs > 0
      ? `${hrs}h ${String(mins).padStart(2, '0')}m`
      : mins > 0
        ? `${mins}m ${String(secs).padStart(2, '0')}s`
        : `${secs}s`;
  if (diffSec > 0) {
    return { text: `Saves ${formatted}`, tone: 'positive' };
  }
  return { text: `+${formatted}`, tone: 'slower' };
}

export const SimulatorWorkspace: React.FC<SimulatorWorkspaceProps> = ({
  settings,
  presets,
  rules,
  logs,
  onUpdateSettings,
  onSaveChannelRule,
  onClearChannelRule,
  onAddLog,
  onNavigateToRules,
  onNavigateToLayoutLab,
}) => {
  const [playlistMode, setPlaylistMode] = useState<PlaylistContextMode>('watch_later');
  const [currentVideoIndex, setCurrentVideoIndex] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(1440);
  const [liveEdgeTime, setLiveEdgeTime] = useState<number>(3600);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.5);
  const [sessionOverrideSpeed, setSessionOverrideSpeed] = useState<number | null>(null);
  const [stoppedByCadence, setStoppedByCadence] = useState<boolean>(false);
  const [autoAdvancingCountdown, setAutoAdvancingCountdown] = useState<boolean>(false);
  const [playerToast, setPlayerToast] = useState<string | null>(null);
  const [playerToastWarning, setPlayerToastWarning] = useState<boolean>(false);
  const [barToast, setBarToast] = useState<string | null>(null);
  const [barToastReason, setBarToastReason] = useState<'live' | 'ad' | null>(null);
  const [popupToast, setPopupToast] = useState<string | null>(null);
  const [adRemainingSec, setAdRemainingSec] = useState<number>(0);
  const [showNativeGearMenu, setShowNativeGearMenu] = useState<boolean>(false);
  const [audioMuted, setAudioMuted] = useState<boolean>(true);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const [collapseTagline, setCollapseTagline] = useState<boolean>(false);
  const [unconvertedShortsActive, setUnconvertedShortsActive] = useState<boolean>(false);

  const currentTimeRef = useRef<number>(1440);
  const liveEdgeRef = useRef<number>(3600);
  const adRemainingRef = useRef<number>(0);
  const wasBehindLiveRef = useRef<boolean>(false);
  const sessionOverrideRef = useRef<number | null>(null);
  const baselineSpeedRef = useRef<number>(1.0);
  const toastTimerRef = useRef<number | null>(null);
  const barToastTimerRef = useRef<number | null>(null);
  const popupToastTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPulseTimeRef = useRef<number>(0);
  const row1Ref = useRef<HTMLDivElement | null>(null);
  const row1LeftRef = useRef<HTMLDivElement | null>(null);
  const brandFullSizerRef = useRef<HTMLSpanElement | null>(null);

  const syncTime = (val: number) => {
    currentTimeRef.current = val;
    setCurrentTime(val);
  };

  const syncLiveEdge = (val: number) => {
    liveEdgeRef.current = val;
    setLiveEdgeTime(val);
  };

  const syncAdRemaining = (val: number) => {
    adRemainingRef.current = val;
    setAdRemainingSec(val);
  };

  const isHomeBrowseMode = playlistMode === 'youtube_home';
  const currentVideo = SIMULATED_VIDEOS[currentVideoIndex];
  const isLiveStream = Boolean(currentVideo.isLiveStream);
  const isAdPlaying = !isHomeBrowseMode && adRemainingSec > 0;
  const shortsConvertEnabled = settings.enabled && settings.convertShortsToWatch !== false;

  const matchedRule = rules.find(
    (r) =>
      (r.channelId && r.channelId === currentVideo.channelId) ||
      r.handle.toLowerCase() === currentVideo.handle.toLowerCase() ||
      r.channelName.toLowerCase() === currentVideo.channelName.toLowerCase()
  );

  const baselineSpeed =
    settings.enabled && settings.perChannelSpeedEnabled
      ? resolveRuleSpeed(matchedRule, presets, settings.defaultSpeed)
      : 1.0;

  sessionOverrideRef.current = sessionOverrideSpeed;
  baselineSpeedRef.current = baselineSpeed;

  const clearBarToast = () => {
    if (barToastTimerRef.current) {
      window.clearTimeout(barToastTimerRef.current);
      barToastTimerRef.current = null;
    }
    setBarToast(null);
    setBarToastReason(null);
  };

  const triggerBarToast = (message: string, reason: 'live' | 'ad' = 'live') => {
    if (!settings.enabled || !settings.showInPageControlBar) return;
    setBarToast(message);
    setBarToastReason(reason);
    if (barToastTimerRef.current) window.clearTimeout(barToastTimerRef.current);
    barToastTimerRef.current = window.setTimeout(() => {
      setBarToast(null);
      setBarToastReason(null);
    }, 2400);
  };

  const triggerToast = (message: string, forceShow = false, isWarning = false) => {
    if (!settings.enabled) return;
    if (!forceShow && !settings.showSpeedToast) return;
    setPlayerToast(message);
    setPlayerToastWarning(isWarning);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setPlayerToast(null);
      setPlayerToastWarning(false);
    }, 2400);
  };

  const triggerPopupToast = (message: string) => {
    setPopupToast(message);
    if (popupToastTimerRef.current) window.clearTimeout(popupToastTimerRef.current);
    popupToastTimerRef.current = window.setTimeout(() => {
      setPopupToast(null);
    }, 2600);
  };

  useEffect(() => {
    if (unconvertedShortsActive && shortsConvertEnabled) {
      setUnconvertedShortsActive(false);
      triggerToast(`Converted /shorts/${currentVideo.id} → /watch player`, true);
      onAddLog(
        'Auto-converted /shorts/ route to standard Watch player',
        `Redirected /shorts/${currentVideo.id} → /watch?v=${currentVideo.id} via history-safe location.replace`
      );
    }
  }, [unconvertedShortsActive, shortsConvertEnabled, currentVideo.id]);

  useEffect(() => {
    if (isHomeBrowseMode) {
      setPlaybackSpeed(settings.defaultSpeed || 1.0);
      return;
    }
    if (!settings.enabled) {
      setPlaybackSpeed(1.0);
      return;
    }
    if (sessionOverrideSpeed !== null) {
      if (Math.abs(sessionOverrideSpeed - baselineSpeed) < 0.015) {
        setSessionOverrideSpeed(null);
        setPlaybackSpeed(baselineSpeed);
        return;
      }
      setPlaybackSpeed(sessionOverrideSpeed);
      return;
    }
    if (!settings.perChannelSpeedEnabled) {
      setPlaybackSpeed(1.0);
      return;
    }
    const target = resolveRuleSpeed(matchedRule, presets, settings.defaultSpeed);
    setPlaybackSpeed(target);
  }, [
    isHomeBrowseMode,
    currentVideo.id,
    sessionOverrideSpeed,
    baselineSpeed,
    settings.enabled,
    settings.perChannelSpeedEnabled,
    settings.defaultSpeed,
    matchedRule,
    presets,
  ]);

  const handleEnterYouTubeHome = () => {
    setPlaylistMode('youtube_home');
    setUnconvertedShortsActive(false);
    setIsPlaying(false);
    syncAdRemaining(0);
    setSessionOverrideSpeed(null);
    setStoppedByCadence(false);
    setAutoAdvancingCountdown(false);
    setShowNativeGearMenu(false);
    setPlayerToast(null);
    setPlayerToastWarning(false);
    clearBarToast();
    setPopupToast(null);
    wasBehindLiveRef.current = false;
    const defaultSpd = settings.defaultSpeed || 1.0;
    setPlaybackSpeed(defaultSpd);
    onAddLog(
      'Returned to YouTube Home',
      `Cleared toolbar badge and reset player speed to ${formatSpeed(defaultSpd)}×`
    );
  };

  const selectVideo = (
    index: number,
    manualSource = true,
    overrideMode?: Exclude<PlaylistContextMode, 'youtube_home'>,
    startBehindSec = 0,
    keepShortsUnconverted = false
  ) => {
    const nextVid = SIMULATED_VIDEOS[index];
    const wasHome = playlistMode === 'youtube_home';
    if (overrideMode) {
      setPlaylistMode(overrideMode);
    } else if (wasHome) {
      setPlaylistMode('standalone');
    }

    setUnconvertedShortsActive(keepShortsUnconverted);
    setCurrentVideoIndex(index);
    syncAdRemaining(0);
    setSessionOverrideSpeed(null);
    clearBarToast();
    setPopupToast(null);
    if (nextVid.isLiveStream) {
      const startEdge = nextVid.initialLiveEdgeSec || 3600;
      const safeBehind = Math.max(0, startBehindSec);
      syncLiveEdge(startEdge);
      syncTime(Math.max(0, startEdge - safeBehind));
      wasBehindLiveRef.current = safeBehind >= 3;
    } else {
      wasBehindLiveRef.current = false;
      syncTime(0);
    }
    setStoppedByCadence(false);
    setAutoAdvancingCountdown(false);
    setShowNativeGearMenu(false);
    setIsPlaying(true);

    const rule = rules.find(
      (r) =>
        (r.channelId && r.channelId === nextVid.channelId) ||
        r.handle.toLowerCase() === nextVid.handle.toLowerCase() ||
        r.channelName.toLowerCase() === nextVid.channelName.toLowerCase()
    );

    if (settings.enabled && settings.perChannelSpeedEnabled) {
      const resolved = resolveRuleSpeed(rule, presets, settings.defaultSpeed);
      setPlaybackSpeed(resolved);
      const presetObj =
        rule && rule.presetId !== 'custom'
          ? presets.find((p) => p.id === rule.presetId)
          : undefined;
      const descriptor = presetObj
        ? presetObj.label
        : rule
          ? 'Saved Channel Rule'
          : 'Default Speed';
      if (nextVid.isLiveStream && startBehindSec < 3 && resolved > 1.01) {
        triggerToast(`1.0× · Live (${formatSpeed(resolved)}× rule clamped at live end)`);
        onAddLog(
          `Clamped to 1.0× at live end (${formatSpeed(resolved)}× rule preserved)`,
          `${nextVid.channelName} (${nextVid.handle}) · Restores ${formatSpeed(resolved)}× automatically behind live`
        );
      } else {
        triggerToast(`${formatSpeed(resolved)}× · ${descriptor}`);
        onAddLog(
          `Locked ${formatSpeed(resolved)}× on loadstart (0ms)`,
          `${nextVid.channelName} (${nextVid.handle}) · ${descriptor}`
        );
      }
    } else if (manualSource) {
      setPlaybackSpeed(1.0);
    }
  };

  const playSubtleCadenceTick = (speed: number) => {
    if (audioMuted || isHomeBrowseMode) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new window.AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;
      const interval = Math.max(0.18, 0.55 / speed);
      if (now - nextPulseTimeRef.current >= interval) {
        nextPulseTimeRef.current = now;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const baseFreq =
          currentVideo.suggestedCategory === 'music'
            ? 330
            : currentVideo.suggestedCategory === 'educational'
              ? 440
              : 260;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, now);
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.085);
      }
    } catch {
      // Ignore Web Audio blocks if not yet interacted
    }
  };

  const finishSimulatedAd = (skippedManually = false) => {
    syncAdRemaining(0);
    if (barToastReason === 'ad') {
      clearBarToast();
    }
    setPopupToast(null);
    const activeSession = sessionOverrideRef.current;
    const restoredTarget =
      activeSession !== null ? activeSession : baselineSpeedRef.current;
    const liveBehindNow =
      isLiveStream &&
      (wasBehindLiveRef.current || liveEdgeRef.current - currentTimeRef.current >= 3);
    const effectivePostAd =
      isLiveStream && !liveBehindNow && restoredTarget > 1.01 ? 1.0 : restoredTarget;

    if (settings.enabled) {
      if (activeSession !== null) {
        triggerToast(`Restored Session ${formatSpeed(effectivePostAd)}×`);
        onAddLog(
          `${skippedManually ? 'Skipped ad' : 'Mid-roll ad finished'} — restored Session ${formatSpeed(effectivePostAd)}×`,
          `Preserved session speed override across ad break on "${currentVideo.title}"`
        );
      } else if (settings.perChannelSpeedEnabled && Math.abs(effectivePostAd - 1.0) > 0.015) {
        triggerToast(`${formatSpeed(effectivePostAd)}× · ${matchedRule ? 'Channel Rule' : 'Default'}`);
        onAddLog(
          `${skippedManually ? 'Skipped ad' : 'Ad finished'} — restored ${formatSpeed(effectivePostAd)}×`,
          `Re-applied ${matchedRule ? 'saved channel rule' : 'default speed'} for ${currentVideo.channelName}`
        );
      } else {
        onAddLog(
          skippedManually ? 'Skipped simulated ad' : 'Simulated ad finished',
          `Resumed "${currentVideo.title}" at ${formatSpeed(effectivePostAd)}×`
        );
      }
    }
  };

  const handleStartSimulatedAd = () => {
    if (isHomeBrowseMode) return;
    setStoppedByCadence(false);
    setAutoAdvancingCountdown(false);
    setShowNativeGearMenu(false);
    if (barToastReason === 'live') {
      clearBarToast();
    }
    syncAdRemaining(5);
    setIsPlaying(true);
    const preservedNote =
      sessionOverrideSpeed !== null
        ? `Session override (${formatSpeed(sessionOverrideSpeed)}×) preserved for post-ad restore`
        : matchedRule
          ? `Channel rule (${formatSpeed(baselineSpeed)}×) held until ad finishes`
          : 'Ad playing at 1.0×';
    onAddLog('Mid-roll ad started (1.0× speed lock)', preservedNote);
  };

  useEffect(() => {
    if (isHomeBrowseMode) return;
    if (!isPlaying && !isLiveStream && adRemainingRef.current <= 0) return;

    const tickMs = 100;
    const interval = window.setInterval(() => {
      if (isLiveStream) {
        const nextEdge = liveEdgeRef.current + tickMs / 1000;
        syncLiveEdge(nextEdge);
      }

      if (adRemainingRef.current > 0) {
        if (isLiveStream && liveEdgeRef.current - currentTimeRef.current >= 3) {
          wasBehindLiveRef.current = true;
        }
        if (isPlaying) {
          playSubtleCadenceTick(1.0);
          const nextAd = Math.max(0, adRemainingRef.current - tickMs / 1000);
          if (nextAd <= 0.02) {
            finishSimulatedAd(false);
          } else {
            syncAdRemaining(nextAd);
          }
        }
        return;
      }

      if (isLiveStream) {
        const nextEdge = liveEdgeRef.current;
        const lagBefore = Math.max(0, nextEdge - currentTimeRef.current);
        if (!wasBehindLiveRef.current && lagBefore >= 3) {
          wasBehindLiveRef.current = true;
        }

        if (isPlaying) {
          const currentlyAtHead = !wasBehindLiveRef.current && lagBefore <= 1.5;
          const effectiveLiveRate =
            currentlyAtHead && playbackSpeed > 1.01 ? 1.0 : playbackSpeed;
          playSubtleCadenceTick(effectiveLiveRate);
          const candidateTime =
            currentTimeRef.current + (tickMs / 1000) * effectiveLiveRate;
          if (candidateTime >= nextEdge - 0.15) {
            const wasCatchingUp = wasBehindLiveRef.current;
            wasBehindLiveRef.current = false;
            syncTime(nextEdge);
            if (wasCatchingUp) {
              const activeSession = sessionOverrideRef.current;
              const hadFastRate =
                playbackSpeed > 1.01 || (activeSession !== null && activeSession > 1.01);
              if (activeSession !== null && activeSession > 1.01) {
                setSessionOverrideSpeed(null);
                setPlaybackSpeed(baselineSpeedRef.current);
              }
              if (hadFastRate) {
                triggerToast('Caught up to Live · 1.0×');
              }
              onAddLog(
                'Caught up to Live — synced native LIVE badge (1.0×)',
                `Re-activated red LIVE badge and clamped playback to 1.0× on "${currentVideo.title}"`
              );
            }
          } else {
            syncTime(candidateTime);
          }
        }
        return;
      }

      playSubtleCadenceTick(playbackSpeed);

      const nextTime = currentTimeRef.current + (tickMs / 1000) * playbackSpeed;
      if (nextTime >= currentVideo.durationSec) {
        syncTime(currentVideo.durationSec);
        setIsPlaying(false);

        if (settings.enabled && settings.stopAfterVideoEnds) {
          setStoppedByCadence(true);
          const contextLabel =
            playlistMode === 'watch_later'
              ? 'Watch Later playlist'
              : playlistMode === 'creator_playlist'
                ? 'Saved creator playlist'
                : 'Up Next autoplay';
          onAddLog(
            'Stopped playback at video end',
            `Blocked ${contextLabel} from advancing after "${currentVideo.title}"`
          );
        } else {
          setAutoAdvancingCountdown(true);
        }
      } else {
        syncTime(nextTime);
      }
    }, tickMs);

    return () => window.clearInterval(interval);
  }, [
    isPlaying,
    isHomeBrowseMode,
    isLiveStream,
    adRemainingSec > 0,
    playbackSpeed,
    currentVideo.durationSec,
    currentVideo.title,
    currentVideo.channelName,
    matchedRule,
    settings.enabled,
    settings.perChannelSpeedEnabled,
    settings.stopAfterVideoEnds,
    playlistMode,
    audioMuted,
    barToastReason,
  ]);

  useEffect(() => {
    if (!autoAdvancingCountdown || isHomeBrowseMode) return;
    const timer = window.setTimeout(() => {
      const nextIdx = (currentVideoIndex + 1) % SIMULATED_VIDEOS.length;
      onAddLog(
        'YouTube auto-advanced video',
        `Stop After Video Ends is currently off — advanced to "${SIMULATED_VIDEOS[nextIdx].title}"`
      );
      selectVideo(nextIdx, false);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [autoAdvancingCountdown, currentVideoIndex, isHomeBrowseMode]);

  const rawDvrLagSec = isLiveStream ? Math.max(0, liveEdgeTime - currentTime) : 0;
  if (isLiveStream) {
    if (!wasBehindLiveRef.current && rawDvrLagSec >= 3) {
      wasBehindLiveRef.current = true;
    } else if (wasBehindLiveRef.current && rawDvrLagSec <= 1) {
      wasBehindLiveRef.current = false;
    }
  } else {
    wasBehindLiveRef.current = false;
  }

  const dvrLagSec = isLiveStream ? Math.max(0, Math.round(rawDvrLagSec)) : 0;
  const isAtLiveHead = isLiveStream && !wasBehindLiveRef.current && dvrLagSec < 3;
  const isLiveHeadClamped =
    !isAdPlaying && settings.enabled && isLiveStream && isAtLiveHead && playbackSpeed > 1.01;
  const effectiveSpeed = isAdPlaying
    ? 1.0
    : isLiveStream && isAtLiveHead && playbackSpeed > 1.01
      ? 1.0
      : playbackSpeed;

  useEffect(() => {
    if (barToastReason === 'live' && (!isLiveStream || !isAtLiveHead)) {
      clearBarToast();
    }
    if (barToastReason === 'ad' && !isAdPlaying) {
      clearBarToast();
    }
  }, [isLiveStream, isAtLiveHead, isAdPlaying, barToastReason]);

  const handleSessionBarSpeedChange = (newSpeed: number) => {
    const clean = clampSpeed(newSpeed);

    if (isAdPlaying) {
      triggerBarToast('Speed locked during ad', 'ad');
      triggerToast('Speed locked during ad', true, true);
      onAddLog(
        'Blocked speed change during ad',
        `Held 1.0× during ad break (attempted ${formatSpeed(clean)}×)${
          sessionOverrideSpeed !== null
            ? ` · Session ${formatSpeed(sessionOverrideSpeed)}× preserved`
            : ''
        }`
      );
      return;
    }

    if (isLiveStream && isAtLiveHead) {
      if (clean > 1.01) {
        if (sessionOverrideSpeed !== null && sessionOverrideSpeed > 1.01) {
          setSessionOverrideSpeed(null);
          setPlaybackSpeed(baselineSpeed);
        }
        triggerBarToast('Stream is currently at live end', 'live');
        triggerToast('Stream is currently at live end', true, true);
        onAddLog(
          'Blocked speed increase at live end',
          `Held 1.0× on "${currentVideo.title}" — surfaced toolbar & player live-end notice`
        );
        return;
      }
      clearBarToast();
      if (Math.abs(clean - 1.0) < 0.015) {
        setSessionOverrideSpeed(null);
        setPlaybackSpeed(baselineSpeed);
        triggerToast('1.0× · Live');
        return;
      }
    } else {
      clearBarToast();
    }

    const matchesBaseline = Math.abs(clean - baselineSpeed) < 0.015;

    if (matchesBaseline) {
      const wasOverridden = sessionOverrideSpeed !== null;
      setSessionOverrideSpeed(null);
      setPlaybackSpeed(baselineSpeed);
      const baselineLabel = matchedRule ? 'Channel Rule' : 'Default';
      triggerToast(
        wasOverridden
          ? `Restored ${formatSpeed(baselineSpeed)}× (${baselineLabel})`
          : `${formatSpeed(baselineSpeed)}× · ${baselineLabel}`
      );
      if (wasOverridden) {
        onAddLog(
          `Cleared session override at ${formatSpeed(baselineSpeed)}×`,
          `Returned to ${matchedRule ? 'saved channel rule' : 'default speed'} for ${currentVideo.channelName}`
        );
      }
      return;
    }

    setSessionOverrideSpeed(clean);
    setPlaybackSpeed(clean);
    const suffix = matchedRule
      ? `Rule ${formatSpeed(baselineSpeed)}× unchanged`
      : 'This video only';
    triggerToast(`Session ${formatSpeed(clean)}× · ${suffix}`);
    onAddLog(
      `Session speed ${formatSpeed(clean)}× (this video only)`,
      `${currentVideo.channelName} · ${
        matchedRule
          ? `Channel rule (${formatSpeed(baselineSpeed)}×) preserved`
          : 'Unlisted channel default preserved'
      }`
    );
  };

  const handleResetSessionBarSpeed = () => {
    if (isAdPlaying) {
      triggerBarToast('Speed locked during ad', 'ad');
      triggerToast('Speed locked during ad', true, true);
      onAddLog(
        'Blocked speed reset during ad',
        'Held 1.0× during ad break — surfaced toolbar & player ad-lock notice'
      );
      return;
    }
    clearBarToast();
    setSessionOverrideSpeed(null);
    setPlaybackSpeed(baselineSpeed);
    const displayRate = isLiveStream && isAtLiveHead && baselineSpeed > 1.01 ? 1.0 : baselineSpeed;
    triggerToast(
      `Reset to ${formatSpeed(displayRate)}× (${
        isLiveStream && isAtLiveHead && baselineSpeed > 1.01
          ? `Live End · ${formatSpeed(baselineSpeed)}× Rule`
          : matchedRule
            ? 'Channel Rule'
            : 'Default'
      })`
    );
    onAddLog(
      `Reset session override to ${formatSpeed(displayRate)}×`,
      `Restored ${matchedRule ? 'saved channel rule' : 'default speed'} for ${currentVideo.channelName}`
    );
  };

  const handleManualPlayerSpeedChange = (newSpeed: number) => {
    const clean = clampSpeed(newSpeed);
    setShowNativeGearMenu(false);

    if (isAdPlaying) {
      triggerBarToast('Speed locked during ad', 'ad');
      triggerToast('Speed locked during ad', true, true);
      onAddLog(
        'Blocked player speed change during ad',
        `Held 1.0× during ad break (attempted ${formatSpeed(clean)}×)`
      );
      return;
    }

    if (isLiveStream && isAtLiveHead) {
      if (clean > 1.01) {
        if (sessionOverrideSpeed !== null && sessionOverrideSpeed > 1.01) {
          setSessionOverrideSpeed(null);
          setPlaybackSpeed(baselineSpeed);
        }
        triggerBarToast('Stream is currently at live end', 'live');
        triggerToast('Stream is currently at live end', true, true);
        onAddLog(
          'Blocked player speed > 1.0× at live end',
          `Reset to 1.0× on "${currentVideo.title}" — stream is currently at live end`
        );
        return;
      }
      clearBarToast();
      if (Math.abs(clean - 1.0) < 0.015) {
        setSessionOverrideSpeed(null);
        setPlaybackSpeed(baselineSpeed);
        triggerToast('1.0× · Live');
        return;
      }
    } else {
      clearBarToast();
    }

    if (settings.enabled && settings.autoRememberManualSpeed) {
      setSessionOverrideSpeed(null);
      setPlaybackSpeed(clean);
      const matchedPreset = presets.find((p) => Math.abs(p.speed - clean) < 0.01);
      onSaveChannelRule(
        currentVideo,
        clean,
        matchedPreset ? matchedPreset.id : 'custom',
        'Auto-remembered from YouTube player'
      );
      triggerToast(`Remembered ${formatSpeed(clean)}× for ${currentVideo.channelName}`);
      return;
    }

    const matchesBaseline = Math.abs(clean - baselineSpeed) < 0.015;
    if (matchesBaseline) {
      const wasOverridden = sessionOverrideSpeed !== null;
      setSessionOverrideSpeed(null);
      setPlaybackSpeed(baselineSpeed);
      const baselineLabel = matchedRule ? 'Channel Rule' : 'Default';
      triggerToast(
        wasOverridden
          ? `Restored ${formatSpeed(baselineSpeed)}× (${baselineLabel})`
          : `${formatSpeed(baselineSpeed)}× · ${baselineLabel}`
      );
      if (wasOverridden) {
        onAddLog(
          `Player menu restored ${formatSpeed(baselineSpeed)}×`,
          `Cleared session override — matches ${matchedRule ? 'saved channel rule' : 'default speed'} for ${currentVideo.channelName}`
        );
      }
      return;
    }

    setSessionOverrideSpeed(clean);
    setPlaybackSpeed(clean);
    const suffix = matchedRule
      ? `Rule ${formatSpeed(baselineSpeed)}× unchanged`
      : 'This video only';
    triggerToast(`Session ${formatSpeed(clean)}× · ${suffix}`);
    onAddLog(
      `Player menu ${formatSpeed(clean)}× (session-only)`,
      `${currentVideo.channelName} · Channel rule unchanged`
    );
  };

  const handleAssignChannelSpeed = (speed: number, presetId: CategoryPresetId, origin: string) => {
    const clean = clampSpeed(speed);
    if (isAdPlaying) {
      triggerPopupToast('Speed locked during ad');
      triggerBarToast('Speed locked during ad', 'ad');
      triggerToast('Speed locked during ad', true, true);
      onAddLog(
        'Blocked popup speed change during ad',
        `Kept 1.0× via ${origin} — speed locked during ad`
      );
      return;
    }
    if (isLiveStream && isAtLiveHead && clean > 1.01) {
      if (sessionOverrideSpeed !== null && sessionOverrideSpeed > 1.01) {
        setSessionOverrideSpeed(null);
        setPlaybackSpeed(baselineSpeed);
      }
      triggerPopupToast('Stream is currently at live end');
      triggerBarToast('Stream is currently at live end', 'live');
      triggerToast('Stream is currently at live end', true, true);
      onAddLog(
        'Blocked popup speed > 1.0× at live end',
        `Kept 1.0× via ${origin} — stream is currently at live end`
      );
      return;
    }
    clearBarToast();
    setPopupToast(null);
    setSessionOverrideSpeed(null);
    setPlaybackSpeed(clean);
    onSaveChannelRule(currentVideo, clean, presetId, origin);
    triggerToast(`Saved ${formatSpeed(clean)}× for ${currentVideo.channelName}`);
  };

  const handleSkipNearEnd = () => {
    if (isHomeBrowseMode || isLiveStream) return;
    setStoppedByCadence(false);
    setAutoAdvancingCountdown(false);
    const targetTime = Math.max(0, currentVideo.durationSec - 3);
    syncTime(targetTime);
    setIsPlaying(true);
  };

  const handleRewindDvr = (secondsBehind: number) => {
    if (!isLiveStream) return;
    clearBarToast();
    const target = Math.max(0, liveEdgeRef.current - secondsBehind);
    wasBehindLiveRef.current = secondsBehind >= 3;
    syncTime(target);
    setStoppedByCadence(false);
    const offsetLabel = formatCompactDuration(secondsBehind);
    triggerToast(
      playbackSpeed > 1.02
        ? `Rewound ${offsetLabel} · Catching up at ${formatSpeed(playbackSpeed)}×`
        : `Rewound ${offsetLabel} into DVR buffer`
    );
    onAddLog(
      `DVR rewound ${offsetLabel} behind live`,
      `Playback at ${formatSpeed(playbackSpeed)}× ${
        playbackSpeed > 1.02 && isPlaying
          ? `catches up in ${formatCompactDuration(secondsBehind / (playbackSpeed - 1.0))}`
          : 'holding buffer offset'
      }`
    );
  };

  const handleJumpToLive = () => {
    if (!isLiveStream) return;
    clearBarToast();
    wasBehindLiveRef.current = false;
    syncTime(liveEdgeRef.current);
    setIsPlaying(true);
    if (sessionOverrideSpeed !== null && sessionOverrideSpeed > 1.01) {
      setSessionOverrideSpeed(null);
      setPlaybackSpeed(baselineSpeed);
    }
    setPopupToast(null);
    triggerToast('Jumped to Live · 1.0×');
    onAddLog(
      'Jumped to Live broadcast head (1.0×)',
      `Resynced ${currentVideo.channelName} live stream and reset active speed to 1.0×${
        baselineSpeed > 1.01 ? ` (${formatSpeed(baselineSpeed)}× rule preserved for DVR)` : ''
      }`
    );
  };

  const handleQuickTestLiveDvr = () => {
    const liveIdx = SIMULATED_VIDEOS.findIndex((v) => v.isLiveStream);
    if (liveIdx < 0) return;
    if (currentVideoIndex !== liveIdx || isHomeBrowseMode) {
      selectVideo(liveIdx, true, 'standalone', 600);
      onAddLog(
        'Opened Live DVR scenario (10m behind)',
        `Testing real-time Back-to-Live catch-up math on "${SIMULATED_VIDEOS[liveIdx].title}"`
      );
    } else {
      handleRewindDvr(600);
    }
  };

  const handleReplay = () => {
    setStoppedByCadence(false);
    setAutoAdvancingCountdown(false);
    syncTime(0);
    setIsPlaying(true);
  };

  const handlePlayNextManual = () => {
    const nextIdx = (currentVideoIndex + 1) % SIMULATED_VIDEOS.length;
    onAddLog(
      'Manual next video selected',
      `User chose to advance to "${SIMULATED_VIDEOS[nextIdx].title}"`
    );
    selectVideo(nextIdx, true);
  };

  const handleSeekBySeconds = (deltaSec: number) => {
    if (isAdPlaying) {
      triggerBarToast('Skip locked during ad', 'ad');
      triggerToast('Skip locked during ad', true, true);
      onAddLog(
        'Blocked seek during ad',
        `Held ad playback (attempted ${deltaSec > 0 ? `+${deltaSec}s` : `${deltaSec}s`}) — surfaced ad-lock notice`
      );
      return;
    }

    if (isLiveStream) {
      if (isAtLiveHead && deltaSec > 0) {
        triggerBarToast('Stream is currently at live end', 'live');
        triggerToast('Stream is currently at live end', true, true);
        onAddLog(
          'Blocked skip ahead at live end',
          `Held live edge on "${currentVideo.title}" — stream is currently at live end`
        );
        return;
      }

      clearBarToast();
      const target = Math.min(
        liveEdgeRef.current,
        Math.max(0, currentTimeRef.current + deltaSec)
      );
      if (deltaSec > 0 && liveEdgeRef.current - target <= 2) {
        wasBehindLiveRef.current = false;
        syncTime(liveEdgeRef.current);
        if (sessionOverrideSpeed !== null && sessionOverrideSpeed > 1.01) {
          setSessionOverrideSpeed(null);
          setPlaybackSpeed(baselineSpeed);
        }
        triggerToast('Synced to Live · 1.0×');
        onAddLog(
          'Skipped ahead to Live broadcast head (1.0×)',
          `Reached live edge via +${deltaSec}s skip on "${currentVideo.title}"`
        );
        return;
      }

      const nextLag = Math.max(0, Math.round(liveEdgeRef.current - target));
      wasBehindLiveRef.current = nextLag >= 3;
      syncTime(target);
      setStoppedByCadence(false);
      const label = deltaSec < 0 ? `Replay ${Math.abs(deltaSec)}s` : `Skip +${deltaSec}s`;
      triggerToast(`${label} · −${formatCompactDuration(Math.max(1, nextLag))} DVR`);
      onAddLog(
        `${label} in Live DVR`,
        `Now ${formatCompactDuration(Math.max(1, nextLag))} behind live broadcast head`
      );
      return;
    }

    clearBarToast();
    const target = Math.min(
      currentVideo.durationSec,
      Math.max(0, currentTimeRef.current + deltaSec)
    );
    syncTime(target);
    if (target < currentVideo.durationSec - 0.25) {
      setStoppedByCadence(false);
      setAutoAdvancingCountdown(false);
    }
    const label = deltaSec < 0 ? `Replay ${Math.abs(deltaSec)}s` : `Skip +${deltaSec}s`;
    triggerToast(`${label} · ${formatTime(target)}`);
    onAddLog(label, `Seeked "${currentVideo.title}" to ${formatTime(target)}`);
  };

  const handleOpenSimulatedShort = (index: number) => {
    const targetVid = SIMULATED_VIDEOS[index];
    if (shortsConvertEnabled) {
      selectVideo(index, true, 'standalone', 0, false);
      triggerToast(`Converted /shorts/ → /watch (${currentVideo ? formatSpeed(resolveRuleSpeed(
        rules.find(
          (r) =>
            (r.channelId && r.channelId === targetVid.channelId) ||
            r.handle.toLowerCase() === targetVid.handle.toLowerCase()
        ),
        presets,
        settings.defaultSpeed
      )) : '1.0'}×)`, true);
      onAddLog(
        `Auto-converted Shorts card (/shorts/${targetVid.id} → /watch)`,
        `Opened "${targetVid.title}" in standard Watch player with full speed & skip deck`
      );
    } else {
      selectVideo(index, true, 'standalone', 0, true);
      onAddLog(
        `Opened native /shorts/${targetVid.id} (Shorts conversion off)`,
        'Enable "Convert Shorts to Standard Player" in Popup to auto-redirect /shorts/ URLs'
      );
    }
  };

  const handleClearBarChannelRule = () => {
    if (isAdPlaying) {
      triggerBarToast('Speed locked during ad', 'ad');
      triggerToast('Speed locked during ad', true, true);
      onAddLog(
        'Blocked rule clear during ad',
        'Held 1.0× during ad break — speed locked during ad'
      );
      return;
    }
    if (!matchedRule) return;
    clearBarToast();
    setSessionOverrideSpeed(null);
    const fallbackSpd = settings.defaultSpeed || 1.0;
    setPlaybackSpeed(fallbackSpd);
    onClearChannelRule(matchedRule.id, currentVideo.channelName);
    const displayFallback =
      isLiveStream && isAtLiveHead && fallbackSpd > 1.01 ? 1.0 : fallbackSpd;
    triggerToast(
      `Cleared rule for ${currentVideo.channelName} · ${formatSpeed(displayFallback)}× Default`
    );
  };

  const timelineHorizon = isLiveStream ? Math.max(1, liveEdgeTime) : currentVideo.durationSec;
  const progressPercent = isAdPlaying
    ? Math.min(100, Math.max(0, ((5 - adRemainingSec) / 5) * 100))
    : Math.min(100, (currentTime / timelineHorizon) * 100);
  const actualPlayerRate = effectiveSpeed;

  const rawRemainingSec = isLiveStream ? 0 : Math.max(0, currentVideo.durationSec - currentTime);
  const durationSlotModel = (() => {
    if (isAdPlaying) {
      return {
        mode: 'ad' as const,
        text: 'Controls paused until ad ends',
        title: 'Playback speed and skip controls are locked until the sponsored ad finishes',
        clickable: false,
      };
    }
    if (isLiveStream) {
      if (isAtLiveHead) {
        return {
          mode: 'live-head' as const,
          text: 'Live',
          title: 'Live broadcast · Synced at live edge',
          clickable: false,
        };
      }
      const lagLabel = formatCompactDuration(Math.max(1, dvrLagSec));
      if (playbackSpeed > 1.02) {
        const catchUpSec = Math.max(1, Math.round(dvrLagSec / (playbackSpeed - 1.0)));
        const catchUpLabel = formatCompactDuration(catchUpSec);
        const titlePrefix = !isPlaying
          ? `Paused ${lagLabel} behind live · Resuming at ${formatSpeed(playbackSpeed)}× catches up in ${catchUpLabel}`
          : `${lagLabel} behind live · Catching up at ${formatSpeed(playbackSpeed)}×`;
        return {
          mode: 'live-catchup' as const,
          text: `−${lagLabel} · Live in ${catchUpLabel} @ ${formatSpeed(playbackSpeed)}×`,
          title: `${titlePrefix} · Click to jump to live edge`,
          clickable: true,
        };
      }
      return {
        mode: 'live-behind' as const,
        text: `${lagLabel} behind Live`,
        title: `${!isPlaying ? 'Paused · ' : ''}Increase speed above 1× to catch up, or click to jump to live edge`,
        clickable: true,
      };
    }

    const vodText = formatRemainingReadout(rawRemainingSec, playbackSpeed);
    return {
      mode: 'vod' as const,
      text: vodText,
      title: 'Real wall-clock time remaining at active playback speed',
      clickable: false,
    };
  })();

  const isSessionActive =
    sessionOverrideSpeed !== null && Math.abs(sessionOverrideSpeed - baselineSpeed) >= 0.015;
  const ruleActionSpeed = clampSpeed(
    sessionOverrideSpeed !== null ? sessionOverrideSpeed : playbackSpeed
  );
  const vodSavedTimeModel =
    !isAdPlaying && !isLiveStream
      ? formatTimeSavedDetail(currentVideo.durationSec, effectiveSpeed)
      : null;

  useEffect(() => {
    const rowEl = row1Ref.current;
    const leftEl = row1LeftRef.current;
    const sizerEl = brandFullSizerRef.current;
    if (!rowEl || !leftEl || !sizerEl) return;

    const measure = () => {
      const available = rowEl.clientWidth;
      const leftW = leftEl.getBoundingClientRect().width;
      const fullBrandW = sizerEl.getBoundingClientRect().width;
      if (available > 0 && fullBrandW > 0) {
        setCollapseTagline(leftW + fullBrandW + 16 > available);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rowEl);
    observer.observe(leftEl);
    return () => observer.disconnect();
  }, [
    isHomeBrowseMode,
    unconvertedShortsActive,
    settings.enabled,
    settings.showInPageControlBar,
    isAdPlaying,
    isLiveStream,
    isAtLiveHead,
    isSessionActive,
    Boolean(matchedRule),
    effectiveSpeed,
    durationSlotModel.text,
  ]);

  const playlistLabel =
    playlistMode === 'youtube_home'
      ? 'YouTube Home · Browse Feed'
      : unconvertedShortsActive
        ? 'YouTube Shorts · Vertical Feed'
        : playlistMode === 'watch_later'
          ? `Watch Later · ${SIMULATED_VIDEOS.length} videos`
          : playlistMode === 'creator_playlist'
            ? `Creator Series Playlist · ${SIMULATED_VIDEOS.length} videos`
            : isLiveStream
              ? 'Live Broadcast · DVR Enabled'
              : 'Standalone Watch Page';

  const badgeText =
    !isHomeBrowseMode &&
    settings.enabled &&
    (settings.perChannelSpeedEnabled || sessionOverrideSpeed !== null)
      ? `${formatSpeed(effectiveSpeed)}x`
      : '';

  return (
    <div className="space-y-8">
      {/* Intro & Simulation Context Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-6 border-b border-slate-800/90">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 [text-wrap:balance]">
            Interactive YouTube &amp; Extension Workbench
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
            Test the full-width v1.4.0 3-row watch deck above the video title, 10s/30s/60s replay
            &amp; skip capsules, 1-click italic channel rules, automatic Shorts-to-Watch conversion,
            and playlist end-of-video stopping.
          </p>
        </div>

        {/* Playlist & Browse Context Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="inline-flex items-center p-1 bg-[#111827] border border-slate-800 rounded-lg overflow-x-auto max-w-full"
            role="group"
            aria-label="Simulated YouTube playback context"
          >
            {(
              [
                { id: 'youtube_home', label: 'YouTube Home' },
                { id: 'watch_later', label: 'Watch Later' },
                { id: 'creator_playlist', label: 'Creator Playlist' },
                { id: 'standalone', label: 'Single Video' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  if (mode.id === 'youtube_home') {
                    handleEnterYouTubeHome();
                  } else {
                    const leavingHome = playlistMode === 'youtube_home';
                    setUnconvertedShortsActive(false);
                    setPlaylistMode(mode.id);
                    setStoppedByCadence(false);
                    if (leavingHome) {
                      selectVideo(currentVideoIndex, true, mode.id);
                    }
                  }
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  playlistMode === mode.id
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleStartSimulatedAd}
            disabled={isHomeBrowseMode || isAdPlaying}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#111827] border border-slate-700/90 rounded-lg hover:bg-slate-800 disabled:opacity-45 disabled:cursor-default transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
            title="Simulate a 5-second YouTube mid-roll ad to test Speed & Skip lock during ads"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            {isAdPlaying ? `Ad Playing (${Math.ceil(adRemainingSec)}s)` : 'Simulate Ad (5s)'}
          </button>

          <button
            type="button"
            onClick={handleQuickTestLiveDvr}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#111827] border border-slate-700/90 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Switch to Live DVR broadcast 10 minutes behind live edge to test Back-to-Live catch-up math"
          >
            <Radio className="w-3.5 h-3.5 text-red-500" />
            Test Live DVR (−10m)
          </button>

          <button
            type="button"
            onClick={handleSkipNearEnd}
            disabled={isHomeBrowseMode || isLiveStream || isAdPlaying}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#111827] border border-slate-700/90 rounded-lg hover:bg-slate-800 disabled:opacity-45 disabled:cursor-default transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title={
              isLiveStream
                ? 'Active live broadcasts have no end time — Stop After Video Ends is bypassed'
                : 'Jump to 3 seconds before the video ends to test playlist hard-stop'
            }
          >
            <FastForward className="w-3.5 h-3.5 text-red-500" />
            Test Last 3 Seconds
          </button>

          {onNavigateToLayoutLab && (
            <button
              type="button"
              onClick={onNavigateToLayoutLab}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-200 bg-red-600/15 border border-red-500/40 rounded-lg hover:bg-red-600/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Open responsive v1.4.0 Toolbar Layout Lab"
            >
              v1.4.0 Layout Lab →
            </button>
          )}
        </div>
      </div>

      {/* Main 12-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 8 Columns: Simulated YouTube Environment */}
        <div className="lg:col-span-8 bg-[#111827] border border-slate-800/90 rounded-xl overflow-hidden">
          {/* Simulated Browser URL Bar */}
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-[#0D1320] border-b border-slate-800 text-xs text-slate-400">
            <div className="flex items-center gap-3 min-w-0">
              {!isHomeBrowseMode && (
                <button
                  type="button"
                  onClick={handleEnterYouTubeHome}
                  className="text-xs font-semibold text-slate-300 hover:text-white underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
                  title="Simulate clicking the YouTube Home logo"
                >
                  ← Home
                </button>
              )}
              <div className="flex items-center gap-1.5 min-w-0 font-mono truncate">
                <span className="text-slate-500 select-none">https://</span>
                <span className="text-slate-200 truncate">
                  {isHomeBrowseMode
                    ? 'youtube.com/'
                    : unconvertedShortsActive
                      ? `youtube.com/shorts/${currentVideo.id}`
                      : `youtube.com/watch?v=${currentVideo.id}${
                          playlistMode === 'watch_later'
                            ? '&list=WL'
                            : playlistMode === 'creator_playlist'
                              ? '&list=PL_CREATOR_SERIES'
                              : ''
                        }`}
                </span>
              </div>
            </div>
            <div className="text-xs text-slate-400 whitespace-nowrap shrink-0 tabular-nums">
              {playlistLabel}
            </div>
          </div>

          {isHomeBrowseMode ? (
            /* Simulated YouTube Home Feed View */
            <div className="p-5 sm:p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-4 border-b border-slate-800">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-100">
                    YouTube Home Feed
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Toolbar badge is cleared and player speed is reset to{' '}
                    <span className="font-mono tabular-nums text-slate-200">
                      {formatSpeed(settings.defaultSpeed || 1.0)}×
                    </span>
                    . Click any video or Shorts shelf item below to test 0ms speed locks and{' '}
                    <span className="font-mono text-slate-200">/shorts/ → /watch</span> conversion.
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                  Idle rate · {formatSpeed(playbackSpeed)}×
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SIMULATED_VIDEOS.map((vid, idx) => {
                  const rule = rules.find(
                    (r) =>
                      (r.channelId && r.channelId === vid.channelId) ||
                      r.handle.toLowerCase() === vid.handle.toLowerCase() ||
                      r.channelName.toLowerCase() === vid.channelName.toLowerCase()
                  );
                  const expectedSpeed =
                    settings.enabled && settings.perChannelSpeedEnabled
                      ? resolveRuleSpeed(rule, presets, settings.defaultSpeed)
                      : 1.0;

                  return (
                    <button
                      key={vid.id}
                      type="button"
                      onClick={() => selectVideo(idx, true, 'standalone')}
                      className="group text-left rounded-lg bg-[#0B0F19] border border-slate-800/90 hover:border-slate-700 overflow-hidden transition-colors cursor-pointer"
                    >
                      <div className="relative aspect-video bg-slate-950 overflow-hidden">
                        {!imgErrors[vid.id] ? (
                          <img
                            src={vid.thumbnailUrl}
                            alt={vid.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setImgErrors((prev) => ({ ...prev, [vid.id]: true }))
                            }
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-400">
                            <Play className="w-7 h-7 text-red-500" />
                          </div>
                        )}
                        <span
                          className={`absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums text-white ${
                            vid.isLiveStream ? 'bg-red-600 font-semibold' : 'bg-black/85'
                          }`}
                        >
                          {vid.isLiveStream ? 'LIVE' : formatTime(vid.durationSec)}
                        </span>
                      </div>
                      <div className="p-3.5 space-y-1.5">
                        <div className="text-sm font-semibold text-slate-100 line-clamp-1">
                          {vid.title}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                          <span className="truncate">
                            {vid.channelName} · {vid.handle}
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-slate-200 shrink-0">
                            {formatSpeed(expectedSpeed)}× {rule ? 'rule' : 'default'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Simulated YouTube Shorts Shelf */}
              <div className="pt-4 border-t border-slate-800/90 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">
                      YouTube Shorts Shelf
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {shortsConvertEnabled
                        ? 'Links rewritten in-place to /watch?v=… so clicking opens the standard Watch player.'
                        : 'Shorts conversion is paused — links remain /shorts/… until re-enabled in Popup.'}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    {shortsConvertEnabled ? 'href → /watch?v=…' : 'href → /shorts/…'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {SIMULATED_VIDEOS.filter((v) => !v.isLiveStream)
                    .slice(0, 3)
                    .map((vid) => {
                      const originalIndex = SIMULATED_VIDEOS.findIndex((item) => item.id === vid.id);
                      return (
                        <button
                          key={`short-${vid.id}`}
                          type="button"
                          onClick={() => handleOpenSimulatedShort(originalIndex)}
                          className="group text-left p-3 rounded-lg bg-[#0B0F19] border border-slate-800/90 hover:border-slate-700 transition-colors cursor-pointer space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                            <span className="truncate">
                              {shortsConvertEnabled ? `/watch?v=${vid.id}` : `/shorts/${vid.id}`}
                            </span>
                            <span className="text-slate-500 shrink-0">0:58</span>
                          </div>
                          <div className="text-xs font-semibold text-slate-100 line-clamp-1 group-hover:text-white">
                            {vid.title}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {vid.channelName} ·{' '}
                            <span
                              className={
                                shortsConvertEnabled ? 'text-emerald-400' : 'text-amber-300'
                              }
                            >
                              {shortsConvertEnabled ? 'Auto-converts to Watch' : 'Stays on /shorts/'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : (
            <>
              {unconvertedShortsActive && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-xs text-amber-200">
                  <span>
                    Viewing un-redirected <code className="font-mono">/shorts/{currentVideo.id}</code>{' '}
                    route (Shorts conversion is turned off in Popup).
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ convertShortsToWatch: true })}
                    className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 font-semibold text-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Enable Shorts → Watch Conversion
                  </button>
                </div>
              )}
              {/* Video Player Viewport */}
              <div className="relative aspect-video bg-slate-950 select-none overflow-hidden border-b border-slate-800/80">
                {!imgErrors[currentVideo.id] ? (
                  <img
                    src={currentVideo.thumbnailUrl}
                    alt={`${currentVideo.title} by ${currentVideo.channelName}`}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setImgErrors((prev) => ({ ...prev, [currentVideo.id]: true }))
                    }
                    className={`w-full h-full object-cover transition-transform duration-300 ${
                      isPlaying ? 'scale-[1.015]' : 'scale-100 opacity-90'
                    }`}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-300 px-6 text-center">
                    <Play className="w-10 h-10 text-red-500 mb-3" />
                    <p className="text-sm font-medium">{currentVideo.title}</p>
                    <p className="text-xs text-slate-400 mt-1">{currentVideo.channelName}</p>
                  </div>
                )}

                {/* Measured Contrast Scrim */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/35 pointer-events-none" />

                {/* Top-Left Context Indicator */}
                <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-4 pointer-events-none">
                  <div className="text-xs font-medium text-white/90 drop-shadow-xs">
                    {isAdPlaying ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 font-semibold tabular-nums">
                        Sponsored · Ad · 0:0{Math.max(1, Math.ceil(adRemainingSec))}
                      </span>
                    ) : (
                      <>
                        <span>{currentVideo.channelName}</span>
                        <span className="mx-1.5 opacity-60">·</span>
                        <span className="font-mono tabular-nums">
                          {formatSpeed(effectiveSpeed)}×{' '}
                          {isLiveHeadClamped
                            ? `live end (${formatSpeed(baselineSpeed)}× rule)`
                            : sessionOverrideSpeed !== null
                              ? 'session override'
                              : 'active'}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Cadence Auto-Speed Player Toast */}
                  {playerToast && (
                    <div
                      role="status"
                      aria-live="polite"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap tabular-nums shadow-sm ${
                        playerToastWarning
                          ? 'bg-[#111827]/95 border-amber-500/50 text-amber-200'
                          : 'bg-slate-950/90 border-white/15 text-white'
                      }`}
                    >
                      {playerToastWarning && (
                        <AlertTriangle
                          className="w-3.5 h-3.5 text-amber-400 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span>{playerToast}</span>
                    </div>
                  )}
                </div>

                {/* Simulated Mid-Roll Ad Overlay & Skip Ad Control */}
                {isAdPlaying && (
                  <div className="absolute right-4 bottom-16 z-20 flex items-center gap-2.5">
                    {sessionOverrideSpeed !== null && (
                      <span className="hidden sm:inline-block px-2.5 py-1.5 rounded-md bg-slate-950/90 border border-slate-700/90 text-[11px] font-mono tabular-nums text-slate-300">
                        Session {formatSpeed(sessionOverrideSpeed)}× queued after ad
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => finishSimulatedAd(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-slate-950/95 hover:bg-slate-900 border border-white/25 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-md"
                    >
                      Skip Ad
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Cadence End-of-Video Hard-Stop Overlay */}
                {stoppedByCadence && (
                  <div className="absolute inset-x-5 bottom-16 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-slate-950/95 border border-slate-700 text-white">
                    <div>
                      <p className="text-sm font-semibold">
                        Playback stopped at end of video
                      </p>
                      <p className="text-xs text-slate-300 mt-0.5">
                        {playlistMode === 'watch_later'
                          ? 'Cadence prevented Watch Later from auto-playing the next video.'
                          : playlistMode === 'creator_playlist'
                            ? 'Cadence prevented this creator playlist from auto-playing the next video.'
                            : 'Cadence prevented Up Next from auto-playing another video.'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleReplay}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Replay
                      </button>
                      <button
                        type="button"
                        onClick={handlePlayNextManual}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        Play Next Manually
                      </button>
                    </div>
                  </div>
                )}

                {/* Native YouTube Auto-Advance Simulation Notice */}
                {autoAdvancingCountdown && (
                  <div className="absolute inset-x-5 bottom-16 z-20 flex items-center justify-between gap-3 p-4 rounded-lg bg-slate-950/95 border border-amber-500/40 text-white">
                    <div className="text-xs">
                      <p className="font-semibold text-amber-300">
                        Stop After Video Ends is turned off
                      </p>
                      <p className="text-slate-300 mt-0.5">
                        Simulating native YouTube auto-advancing to the next video...
                      </p>
                    </div>
                  </div>
                )}

                {/* Native YouTube Gear Speed Menu Popup */}
                {showNativeGearMenu && (
                  <div className="absolute right-4 bottom-14 z-30 w-52 p-2 rounded-lg bg-slate-950/95 border border-slate-700 text-white shadow-lg">
                    <div className="px-2.5 py-1.5 text-[11px] text-slate-400 border-b border-slate-800">
                      YouTube Gear Menu (
                      {settings.autoRememberManualSpeed ? 'Saves Rule' : 'Session-Only'})
                    </div>
                    <div className="grid grid-cols-2 gap-1 pt-1.5">
                      {[0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5].map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => handleManualPlayerSpeedChange(spd)}
                          className={`px-2.5 py-1.5 rounded text-xs font-mono tabular-nums text-left transition-colors cursor-pointer ${
                            Math.abs(effectiveSpeed - spd) < 0.02
                              ? 'bg-red-600 text-white font-semibold'
                              : 'text-slate-200 hover:bg-white/10'
                          }`}
                        >
                          {formatSpeed(spd)}×
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom Player Scrub Bar & Controls */}
                <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-3 pt-6">
                  <div
                    className={`group relative h-1.5 bg-white/25 rounded-full mb-3 ${
                      isAdPlaying ? 'cursor-default' : 'cursor-pointer'
                    }`}
                    onClick={(e) => {
                      if (isAdPlaying) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                      const targetTime = ratio * timelineHorizon;
                      if (isLiveStream) {
                        if (timelineHorizon - targetTime <= 2) {
                          wasBehindLiveRef.current = false;
                          syncTime(liveEdgeRef.current);
                          if (sessionOverrideSpeed !== null && sessionOverrideSpeed > 1.01) {
                            setSessionOverrideSpeed(null);
                            setPlaybackSpeed(baselineSpeed);
                          }
                          onAddLog(
                            'Scrubbed to Live broadcast head (1.0×)',
                            `Reset active speed to 1.0× on "${currentVideo.title}"`
                          );
                        } else {
                          wasBehindLiveRef.current = true;
                          syncTime(targetTime);
                        }
                      } else {
                        syncTime(targetTime);
                      }
                      setStoppedByCadence(false);
                    }}
                  >
                    <svg
                      viewBox="0 0 100 6"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                      className="w-full h-full block rounded-full overflow-hidden"
                    >
                      <rect
                        x="0"
                        y="0"
                        width={progressPercent}
                        height="6"
                        fill={isAdPlaying ? '#fbbf24' : '#dc2626'}
                      />
                    </svg>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-white flex-wrap">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          if (!isLiveStream && currentTime >= currentVideo.durationSec) {
                            handleReplay();
                          } else {
                            setIsPlaying((p) => !p);
                          }
                        }}
                        className="p-1.5 rounded-md hover:bg-white/15 transition-colors cursor-pointer"
                        aria-label={isPlaying ? 'Pause video' : 'Play video'}
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={handlePlayNextManual}
                        className="p-1.5 rounded-md hover:bg-white/15 transition-colors cursor-pointer"
                        title="Manual Next Video (Allowed even when auto-play is blocked)"
                        aria-label="Next video"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setAudioMuted((m) => !m)}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/15 text-xs text-white/90 transition-colors cursor-pointer"
                        title="Toggle subtle cadence pulse audio"
                      >
                        {audioMuted ? (
                          <VolumeX className="w-4 h-4 text-slate-300" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-white" />
                        )}
                        <span className="hidden sm:inline text-[11px]">
                          {audioMuted ? 'Sound off' : 'Tempo pulse on'}
                        </span>
                      </button>

                      {isLiveStream ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isAtLiveHead}
                            onClick={handleJumpToLive}
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                              isAtLiveHead
                                ? 'text-white cursor-default'
                                : 'bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer'
                            }`}
                            title={
                              isAtLiveHead
                                ? 'Synced at live broadcast head'
                                : 'Native YouTube LIVE button — click to jump to live head'
                            }
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isAtLiveHead ? 'bg-red-500' : 'bg-slate-400'
                              }`}
                              aria-hidden="true"
                            />
                            LIVE
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRewindDvr(600)}
                            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-mono tabular-nums text-white/90 whitespace-nowrap shrink-0 cursor-pointer"
                            title="Simulate rewinding 10 minutes into the live DVR buffer"
                          >
                            −10m DVR
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRewindDvr(120)}
                            disabled={isAdPlaying}
                            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-45 text-[11px] font-mono tabular-nums text-white/90 whitespace-nowrap shrink-0 cursor-pointer"
                            title="Simulate rewinding 2 minutes into the live DVR buffer"
                          >
                            −2m DVR
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRewindDvr(15)}
                            disabled={isAdPlaying}
                            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 disabled:opacity-45 text-[11px] font-mono tabular-nums text-white/90 whitespace-nowrap shrink-0 cursor-pointer"
                            title="Simulate rewinding 15 seconds behind live to watch accelerated playback catch up and re-activate the red LIVE badge"
                          >
                            −15s DVR
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-mono tabular-nums text-white/90">
                          {formatTime(currentTime)} / {formatTime(currentVideo.durationSec)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNativeGearMenu((s) => !s)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs font-mono tabular-nums text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        title={
                          isLiveStream && isAtLiveHead && playbackSpeed > 1.0
                            ? `YouTube clamps live-edge playback to 1.0× while Cadence preserves ${formatSpeed(playbackSpeed)}× rule`
                            : 'Change speed via YouTube player gear menu'
                        }
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Player: {formatSpeed(actualPlayerRate)}×
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Simulated YouTube Dark Watch Metadata (#above-the-fold) */}
              <div className="p-5 sm:p-6 space-y-4">
                {/* v1.4.0 Full-Width 3-Row Transport Deck Mounted Above #title */}
                {settings.enabled && settings.showInPageControlBar && !unconvertedShortsActive && (
                  <div
                    id="cadence-watch-bar"
                    className="relative w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F19] border border-slate-700/90"
                  >
                    {/* Floating Amber Toolbar Toast */}
                    {barToast && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="absolute bottom-[calc(100%+7px)] left-1/2 -translate-x-1/2 z-30 pointer-events-none inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111827] border border-amber-500/50 text-[11.5px] font-medium text-amber-200 whitespace-nowrap tabular-nums shadow-lg"
                      >
                        <AlertTriangle
                          className="w-3.5 h-3.5 text-amber-400 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{barToast}</span>
                      </div>
                    )}

                    {/* Row 1: Speed Source + Telemetry (Left) & Collision-Aware Brand Signature (Right) */}
                    <div
                      ref={row1Ref}
                      className="relative flex items-center justify-between gap-2 pb-1.5 border-b border-white/[0.06]"
                    >
                      <span
                        ref={brandFullSizerRef}
                        aria-hidden="true"
                        className="absolute -top-[9999px] left-0 invisible pointer-events-none select-none inline-flex items-center gap-1.5 px-1.5 py-0.5 whitespace-nowrap"
                      >
                        <CadenceEmblem className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[11px] font-bold tracking-tight font-display">
                          Cadence
                        </span>
                        <span className="text-[11px]">- YouTube at your speed</span>
                      </span>

                      <div ref={row1LeftRef} className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-flex items-center gap-1.5 text-xs text-slate-300 whitespace-nowrap shrink-0 tabular-nums"
                          title={
                            isAdPlaying
                              ? `Speed locked during ad${
                                  isSessionActive
                                    ? ` · Session ${formatSpeed(sessionOverrideSpeed!)}× restores after ad`
                                    : ''
                                }`
                              : isLiveHeadClamped
                                ? `Stream is currently at live end (1.0×) · Saved ${formatSpeed(baselineSpeed)}× rule restores automatically behind live`
                                : isSessionActive
                                  ? `Session override active · Baseline is ${formatSpeed(baselineSpeed)}×`
                                  : 'Active playback speed source'
                          }
                        >
                          <span className="text-slate-400 font-medium">
                            {isAdPlaying
                              ? 'Sponsored Ad'
                              : isSessionActive
                                ? 'Session Override'
                                : matchedRule
                                  ? 'Channel Rule'
                                  : 'Default'}
                          </span>
                          <span className="text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <span className="inline-grid items-center font-mono font-semibold">
                            <span
                              aria-hidden="true"
                              className="col-start-1 row-start-1 invisible pointer-events-none select-none"
                            >
                              8.88×
                            </span>
                            <span
                              className={`col-start-1 row-start-1 ${
                                isAdPlaying || isSessionActive
                                  ? 'text-amber-300'
                                  : 'text-slate-100'
                              }`}
                            >
                              {formatCompactSpeed(effectiveSpeed)}×
                            </span>
                          </span>
                        </span>

                        {durationSlotModel.text && (
                          <>
                            <span
                              className="w-px h-3 bg-white/10 shrink-0"
                              aria-hidden="true"
                            />
                            {durationSlotModel.mode === 'ad' ? (
                              <span
                                className="text-[11.5px] font-medium text-amber-300/90 whitespace-nowrap truncate"
                                title={durationSlotModel.title}
                              >
                                {durationSlotModel.text}
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={!durationSlotModel.clickable}
                                onClick={() => {
                                  if (durationSlotModel.clickable) {
                                    handleJumpToLive();
                                  }
                                }}
                                className={`inline-flex items-center gap-1.5 rounded text-[11.5px] font-mono tabular-nums whitespace-nowrap shrink-0 transition-colors ${
                                  durationSlotModel.clickable
                                    ? 'px-1.5 py-0.5 border border-slate-700/90 text-slate-200 hover:bg-slate-800 hover:border-red-500/60 cursor-pointer'
                                    : durationSlotModel.mode === 'live-head'
                                      ? 'text-slate-100 font-semibold cursor-default'
                                      : 'text-slate-400 cursor-default'
                                }`}
                                title={durationSlotModel.title}
                              >
                                {durationSlotModel.mode !== 'vod' && (
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      durationSlotModel.mode === 'live-head'
                                        ? 'bg-red-500'
                                        : 'bg-amber-500'
                                    }`}
                                    aria-hidden="true"
                                  />
                                )}
                                <span className="inline-grid items-center text-left">
                                  <span
                                    aria-hidden="true"
                                    className="col-start-1 row-start-1 invisible pointer-events-none select-none"
                                  >
                                    {buildDurationSizerText(durationSlotModel.text)}
                                  </span>
                                  <span className="col-start-1 row-start-1">
                                    {durationSlotModel.text}
                                  </span>
                                </span>
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={onNavigateToRules}
                        className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        title="Cadence - YouTube at your speed · Click to manage Channel Rules"
                      >
                        <CadenceEmblem className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[11px] font-bold tracking-tight text-slate-200 font-display">
                          Cadence
                        </span>
                        {!collapseTagline && (
                          <span className="text-[11px] text-slate-400">
                            - YouTube at your speed
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Row 2: Quick Speed Presets (Left) & Always-Shown Style B Seek Capsules (Right) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {[0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((spd) => {
                          const active = !isAdPlaying && Math.abs(effectiveSpeed - spd) < 0.015;
                          const isLiveBlocked =
                            !isAdPlaying && isLiveStream && isAtLiveHead && spd > 1.01;
                          const isBlocked = isAdPlaying || isLiveBlocked;
                          return (
                            <button
                              key={spd}
                              type="button"
                              aria-disabled={isBlocked ? true : undefined}
                              onClick={() => handleSessionBarSpeedChange(spd)}
                              className={`px-2 py-1 rounded-md text-xs font-mono tabular-nums font-semibold transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                                active
                                  ? 'bg-red-600 text-white'
                                  : isBlocked
                                    ? 'text-slate-300 opacity-40 hover:opacity-70 hover:bg-amber-500/10'
                                    : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'
                              }`}
                              title={
                                isAdPlaying
                                  ? 'Speed locked during ad'
                                  : isLiveBlocked
                                    ? 'Unavailable while synced at live end — rewind stream to speed up'
                                    : `Set ${formatSpeed(spd)}× for this video session only`
                              }
                            >
                              {formatSpeed(spd)}×
                            </button>
                          );
                        })}
                      </div>

                      {/* Style B Replay & Skip Ahead Capsules */}
                      <div className="inline-flex items-center gap-1.5 shrink-0 ml-auto">
                        <div
                          className="inline-flex items-center rounded-md bg-white/[0.04] border border-white/10 overflow-hidden divide-x divide-white/10 shrink-0"
                          role="group"
                          aria-label="Replay 60, 30, or 10 seconds"
                        >
                          {([60, 30, 10] as const).map((sec, idx) => (
                            <button
                              key={`back-${sec}`}
                              type="button"
                              aria-disabled={isAdPlaying ? true : undefined}
                              onClick={() => handleSeekBySeconds(-sec)}
                              className={`inline-flex items-center gap-1 px-1.5 py-1 text-[11px] font-mono font-semibold tabular-nums text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isAdPlaying
                                  ? 'opacity-40 hover:opacity-70 hover:bg-amber-500/10'
                                  : 'hover:bg-white/10 hover:text-white'
                              }`}
                              title={
                                isAdPlaying
                                  ? 'Skip locked during ad'
                                  : `Replay ${sec} seconds`
                              }
                            >
                              {idx === 0 && (
                                <ReplayArcIcon className="w-3 h-3 text-slate-400 shrink-0" />
                              )}
                              <span>{sec}</span>
                            </button>
                          ))}
                        </div>

                        <div
                          className="inline-flex items-center rounded-md bg-white/[0.04] border border-white/10 overflow-hidden divide-x divide-white/10 shrink-0"
                          role="group"
                          aria-label="Skip ahead 10, 30, or 60 seconds"
                        >
                          {([10, 30, 60] as const).map((sec, idx) => {
                            const skipLiveBlocked =
                              !isAdPlaying && isLiveStream && isAtLiveHead;
                            const skipBlocked = isAdPlaying || skipLiveBlocked;
                            return (
                              <button
                                key={`fwd-${sec}`}
                                type="button"
                                aria-disabled={skipBlocked ? true : undefined}
                                onClick={() => handleSeekBySeconds(sec)}
                                className={`inline-flex items-center gap-1 px-1.5 py-1 text-[11px] font-mono font-semibold tabular-nums text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  skipBlocked
                                    ? 'opacity-40 hover:opacity-70 hover:bg-amber-500/10'
                                    : 'hover:bg-white/10 hover:text-white'
                                }`}
                                title={
                                  isAdPlaying
                                    ? 'Skip locked during ad'
                                    : skipLiveBlocked
                                      ? 'Stream is currently at live end'
                                      : `Skip ahead ${sec} seconds`
                                }
                              >
                                <span>{sec}</span>
                                {idx === 2 && (
                                  <SkipArcIcon className="w-3 h-3 text-slate-400 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Row 3: Fine ±0.05 + Reset + VOD Saved Time (Left) & Style A Italic Rule Slot (Right) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 mt-1.5 border-t border-white/[0.05]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          aria-disabled={isAdPlaying ? true : undefined}
                          onClick={() => handleSessionBarSpeedChange(effectiveSpeed - 0.05)}
                          className={`px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-[11px] font-mono font-semibold tabular-nums text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isAdPlaying
                              ? 'opacity-40 hover:opacity-70 hover:bg-amber-500/10'
                              : 'hover:bg-white/10 hover:text-white'
                          }`}
                          title={
                            isAdPlaying
                              ? 'Speed locked during ad'
                              : 'Slow down by 0.05× for this video session only'
                          }
                        >
                          −0.05
                        </button>
                        {(() => {
                          const isStepUpLiveBlocked =
                            !isAdPlaying &&
                            isLiveStream &&
                            isAtLiveHead &&
                            effectiveSpeed + 0.05 > 1.01;
                          const isStepUpBlocked = isAdPlaying || isStepUpLiveBlocked;
                          return (
                            <button
                              type="button"
                              aria-disabled={isStepUpBlocked ? true : undefined}
                              onClick={() => handleSessionBarSpeedChange(effectiveSpeed + 0.05)}
                              className={`px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/10 text-[11px] font-mono font-semibold tabular-nums text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isStepUpBlocked
                                  ? 'opacity-40 hover:opacity-70 hover:bg-amber-500/10'
                                  : 'hover:bg-white/10 hover:text-white'
                              }`}
                              title={
                                isAdPlaying
                                  ? 'Speed locked during ad'
                                  : isStepUpLiveBlocked
                                    ? 'Unavailable while synced at live end — rewind stream to speed up'
                                    : 'Speed up by 0.05× for this video session only'
                              }
                            >
                              +0.05
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={handleResetSessionBarSpeed}
                          disabled={!isAdPlaying && !isSessionActive}
                          aria-disabled={isAdPlaying ? true : undefined}
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            isAdPlaying
                              ? 'border-white/10 text-slate-300 opacity-40 hover:opacity-70 hover:bg-amber-500/10 cursor-pointer'
                              : isSessionActive
                                ? 'border-red-500/60 text-slate-100 hover:bg-white/10 cursor-pointer'
                                : 'border-white/[0.06] text-slate-500 cursor-default opacity-50'
                          }`}
                          title={
                            isAdPlaying
                              ? 'Speed locked during ad'
                              : `Reset to ${matchedRule ? 'Channel Rule' : 'Default'} (${formatSpeed(
                                  isLiveStream && isAtLiveHead && baselineSpeed > 1.01
                                    ? 1.0
                                    : baselineSpeed
                                )}×)`
                          }
                        >
                          Reset
                        </button>

                        {vodSavedTimeModel && (
                          <span
                            className={`pl-1 text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0 ${
                              vodSavedTimeModel.tone === 'positive'
                                ? 'text-emerald-400 font-semibold'
                                : vodSavedTimeModel.tone === 'neutral'
                                  ? 'text-slate-500'
                                  : 'text-slate-400'
                            }`}
                            title="Wall-clock time saved across the full video at your active playback speed"
                          >
                            {vodSavedTimeModel.text}
                          </span>
                        )}
                      </div>

                      {/* Style A Full-Italic 1-Click Channel Rule Slot */}
                      <div className="inline-flex items-center gap-1.5 italic text-[11.5px] shrink-0 ml-auto">
                        {!matchedRule ? (
                          <>
                            <span className="text-slate-400 whitespace-nowrap">No rule</span>
                            <button
                              type="button"
                              aria-disabled={isAdPlaying ? true : undefined}
                              onClick={() => {
                                const matchingPreset = presets.find(
                                  (p) => Math.abs(p.speed - ruleActionSpeed) < 0.01
                                );
                                handleAssignChannelSpeed(
                                  ruleActionSpeed,
                                  matchingPreset ? matchingPreset.id : 'custom',
                                  'Watch toolbar (+ Save Rule)'
                                );
                              }}
                              className={`italic px-2 py-0.5 rounded-md border border-white/12 bg-white/[0.04] text-[11px] font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isAdPlaying
                                  ? 'opacity-40 hover:opacity-70 hover:bg-amber-500/10'
                                  : 'hover:bg-white/10 hover:text-white'
                              }`}
                              title={
                                isAdPlaying
                                  ? 'Speed locked during ad'
                                  : `Save ${formatSpeed(ruleActionSpeed)}× as permanent Channel Rule for ${currentVideo.channelName}`
                              }
                            >
                              + Save {formatCompactSpeed(ruleActionSpeed)}× Rule
                            </button>
                          </>
                        ) : isSessionActive && !isAdPlaying ? (
                          <>
                            <span className="text-slate-400 whitespace-nowrap tabular-nums">
                              Rule:{' '}
                              <strong className="font-semibold text-slate-200">
                                {formatCompactSpeed(baselineSpeed)}×
                              </strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const matchingPreset = presets.find(
                                  (p) => Math.abs(p.speed - ruleActionSpeed) < 0.01
                                );
                                handleAssignChannelSpeed(
                                  ruleActionSpeed,
                                  matchingPreset ? matchingPreset.id : 'custom',
                                  'Watch toolbar (Update Rule)'
                                );
                              }}
                              className="italic px-2 py-0.5 rounded-md border border-amber-500/45 bg-amber-500/10 hover:bg-amber-500/20 text-[11px] font-medium text-amber-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                              title={`Update ${currentVideo.channelName} rule from ${formatSpeed(baselineSpeed)}× to ${formatSpeed(ruleActionSpeed)}×`}
                            >
                              Update → {formatCompactSpeed(ruleActionSpeed)}×
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-400 whitespace-nowrap tabular-nums">
                              Rule:{' '}
                              <strong className="font-semibold text-slate-200">
                                {formatCompactSpeed(baselineSpeed)}×
                              </strong>
                            </span>
                            <button
                              type="button"
                              aria-disabled={isAdPlaying ? true : undefined}
                              onClick={handleClearBarChannelRule}
                              className={`italic px-2 py-0.5 rounded-md border border-white/12 bg-white/[0.04] text-[11px] font-medium text-slate-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isAdPlaying
                                  ? 'opacity-40 hover:opacity-70 hover:bg-amber-500/10'
                                  : 'hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-200'
                              }`}
                              title={
                                isAdPlaying
                                  ? 'Speed locked during ad'
                                  : `Clear saved Channel Rule for ${currentVideo.channelName}`
                              }
                            >
                              Clear ×
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-100">
                    {currentVideo.title}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                    <span>{currentVideo.viewsLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{currentVideo.publishedLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span>{currentVideo.handle}</span>
                  </div>
                </div>

                {/* Native YouTube Channel Owner & Actions Row (100% Untouched by Cadence in v1.4.0) */}
                <div className="flex flex-wrap items-center justify-between gap-4 py-3.5 border-y border-slate-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 text-slate-100 font-display font-bold text-sm flex items-center justify-center shrink-0">
                      {currentVideo.channelName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-100 truncate">
                        {currentVideo.channelName}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {currentVideo.subscribers}
                      </div>
                    </div>
                    <span className="ml-2 px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 select-none">
                      Subscribe
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-300 select-none">
                    <span className="px-3 py-1.5 rounded-full bg-slate-800/90 border border-slate-700/80 font-medium whitespace-nowrap">
                      Like · Share
                    </span>
                    <span className="px-3 py-1.5 rounded-full bg-slate-800/90 border border-slate-700/80 font-medium whitespace-nowrap">
                      Save
                    </span>
                  </div>
                </div>

                {/* Channel / Playlist Switcher Queue */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Switch Video to Test Session Reset &amp; Zero-Lag Rule Lock
                    </h3>
                    <span className="text-xs text-slate-400">
                      Session overrides reset automatically on baseline match or next video
                    </span>
                  </div>

                  <div className="divide-y divide-slate-800/80 border-t border-slate-800">
                    {SIMULATED_VIDEOS.map((vid, idx) => {
                      const isCurrent = idx === currentVideoIndex;
                      const rule = rules.find(
                        (r) =>
                          (r.channelId && r.channelId === vid.channelId) ||
                          r.handle.toLowerCase() === vid.handle.toLowerCase()
                      );
                      const expectedSpeed =
                        settings.enabled && settings.perChannelSpeedEnabled
                          ? resolveRuleSpeed(rule, presets, settings.defaultSpeed)
                          : 1.0;

                      return (
                        <button
                          key={vid.id}
                          type="button"
                          onClick={() => selectVideo(idx, true)}
                          className={`w-full flex items-center justify-between gap-4 py-3 px-2.5 text-left transition-colors cursor-pointer ${
                            isCurrent ? 'bg-slate-800/65' : 'hover:bg-slate-800/35'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <span className="w-5 text-xs font-mono tabular-nums text-slate-400 shrink-0">
                              {isCurrent ? '▶' : String(idx + 1).padStart(2, '0')}
                            </span>
                            <div className="w-24 aspect-video rounded bg-slate-950 border border-slate-800 overflow-hidden shrink-0">
                              {!imgErrors[vid.id] ? (
                                <img
                                  src={vid.thumbnailUrl}
                                  alt={vid.title}
                                  referrerPolicy="no-referrer"
                                  onError={() =>
                                    setImgErrors((prev) => ({ ...prev, [vid.id]: true }))
                                  }
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-slate-900" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-100 truncate">
                                {vid.title}
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5 truncate">
                                <span>{vid.channelName}</span>
                                <span className="mx-1.5" aria-hidden="true">
                                  ·
                                </span>
                                <span>{vid.handle}</span>
                                <span className="mx-1.5" aria-hidden="true">
                                  ·
                                </span>
                                <span className="tabular-nums">
                                  {vid.isLiveStream ? 'Streaming live' : formatTime(vid.durationSec)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-sm font-mono font-semibold tabular-nums text-slate-100">
                              {formatSpeed(expectedSpeed)}×
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {rule ? rule.presetId : 'default'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right 4 Columns: Live Chrome Extension Popup Preview + Event Log */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-5 space-y-5">
            {/* Extension Popup Top Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-slate-100 font-display">
                    Cadence Toolbar Popup
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-400">
                    · v{EXTENSION_VERSION}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                  Toolbar Badge ·{' '}
                  <span className="font-mono text-slate-200">
                    {badgeText || 'cleared'}
                  </span>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
                <span>Active</span>
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => onUpdateSettings({ enabled: e.target.checked })}
                  className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                />
              </label>
            </div>

            {/* Active Channel Speed Assignment */}
            {isHomeBrowseMode ? (
              <div className="space-y-1.5 pb-4 border-b border-slate-800">
                <div className="text-xs text-slate-400">Active YouTube Tab</div>
                <div className="text-sm font-semibold text-slate-100">
                  Open a YouTube video
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  While browsing YouTube Home, Cadence clears the toolbar icon badge and keeps
                  playback idle at {formatSpeed(settings.defaultSpeed || 1.0)}× until a video opens.
                </p>
              </div>
            ) : (
              <div className="space-y-3 pb-4 border-b border-slate-800">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-400">
                    {isAdPlaying
                      ? sessionOverrideSpeed !== null
                        ? `Ad Playing (1.0×) · Session ${formatSpeed(sessionOverrideSpeed)}× queued`
                        : 'Ad Playing · Speed Locked (1.0×)'
                      : isLiveStream && isAtLiveHead
                        ? sessionOverrideSpeed !== null && sessionOverrideSpeed < 0.99
                          ? `Live Stream · Session (${formatSpeed(sessionOverrideSpeed)}×)`
                          : matchedRule && baselineSpeed > 1.01
                            ? `Live End (1.0×) · Rule ${formatSpeed(baselineSpeed)}×`
                            : 'Live Broadcast · At Live End'
                        : sessionOverrideSpeed !== null
                          ? `Session Override · ${
                              matchedRule
                                ? `Rule is ${formatSpeed(baselineSpeed)}×`
                                : `Default ${formatSpeed(baselineSpeed)}×`
                            }`
                          : matchedRule
                            ? 'Saved Channel Rule'
                            : 'Detected Channel · Default'}
                  </span>
                  <span className="text-xs font-mono tabular-nums font-semibold text-slate-100">
                    {formatSpeed(effectiveSpeed)}×
                  </span>
                </div>

                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    {currentVideo.channelName}
                  </div>
                  <div className="text-xs text-slate-400">{currentVideo.handle}</div>
                </div>

                {popupToast && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/40 text-[11px] font-medium text-amber-200"
                  >
                    {popupToast}
                  </div>
                )}

                {/* Preset Profile Buttons (Saves Persistent Channel Rule) */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {presets.map((preset) => {
                    const isSelected =
                      !isAdPlaying &&
                      (isLiveStream && isAtLiveHead
                        ? sessionOverrideSpeed === null &&
                          matchedRule?.presetId === preset.id &&
                          Math.abs(preset.speed - 1.0) < 0.02
                        : sessionOverrideSpeed === null &&
                          matchedRule?.presetId === preset.id &&
                          Math.abs(effectiveSpeed - preset.speed) < 0.02);
                    const isBlocked =
                      isAdPlaying || (isLiveStream && isAtLiveHead && preset.speed > 1.01);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-disabled={isBlocked ? true : undefined}
                        onClick={() =>
                          handleAssignChannelSpeed(
                            preset.speed,
                            preset.id,
                            `Popup (${preset.label})`
                          )
                        }
                        className={`px-2.5 py-2 rounded-md border text-left transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'bg-red-600 border-red-600 text-white'
                            : isBlocked
                              ? 'bg-[#0B0F19] border-slate-700/90 text-slate-300 opacity-45 hover:opacity-75 hover:border-amber-500/40'
                              : 'bg-[#0B0F19] border-slate-700/90 text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <div className="text-[11px] font-medium truncate">
                          {preset.id === 'music'
                            ? 'Music'
                            : preset.id === 'educational'
                              ? 'Educational'
                              : 'Podcast'}
                        </div>
                        <div className="text-xs font-mono font-semibold tabular-nums mt-0.5">
                          {formatSpeed(preset.speed)}×
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Speeds Row (1.0x - 2.0x) */}
                <div className="grid grid-cols-5 gap-1.5">
                  {[1.0, 1.25, 1.5, 1.75, 2.0].map((spd) => {
                    const active =
                      !isAdPlaying &&
                      (isLiveStream && isAtLiveHead
                        ? sessionOverrideSpeed === null && Math.abs(spd - 1.0) < 0.015
                        : sessionOverrideSpeed === null && Math.abs(effectiveSpeed - spd) < 0.015);
                    const isBlocked =
                      isAdPlaying || (isLiveStream && isAtLiveHead && spd > 1.01);
                    const matchingPreset = presets.find((p) => Math.abs(p.speed - spd) < 0.01);
                    return (
                      <button
                        key={spd}
                        type="button"
                        aria-disabled={isBlocked ? true : undefined}
                        onClick={() =>
                          handleAssignChannelSpeed(
                            spd,
                            matchingPreset ? matchingPreset.id : 'custom',
                            'Popup quick speed'
                          )
                        }
                        className={`py-1.5 rounded-md border text-xs font-mono font-semibold tabular-nums transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-red-600 border-red-600 text-white'
                            : isBlocked
                              ? 'bg-[#0B0F19] border-slate-700/90 text-slate-300 opacity-45 hover:opacity-75 hover:border-amber-500/40'
                              : 'bg-[#0B0F19] border-slate-700/90 text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        {formatSpeed(spd)}×
                      </button>
                    );
                  })}
                </div>

                {/* Fine-Grained ±0.05x Custom Channel Rule Stepper */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-xs text-slate-400">Channel Rule Fine Stepper</span>
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      aria-disabled={isAdPlaying ? true : undefined}
                      onClick={() =>
                        handleAssignChannelSpeed(
                          Math.max(0.25, effectiveSpeed - 0.05),
                          'custom',
                          'Popup fine stepper'
                        )
                      }
                      className={`px-2 py-1 rounded border border-slate-700 bg-[#0B0F19] text-slate-200 text-xs font-mono tabular-nums transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                        isAdPlaying
                          ? 'opacity-45 hover:opacity-75 hover:border-amber-500/40'
                          : 'hover:bg-slate-800'
                      }`}
                    >
                      −0.05×
                    </button>
                    <span className="w-14 text-center text-xs font-mono font-semibold tabular-nums text-slate-100">
                      {formatSpeed(effectiveSpeed)}×
                    </span>
                    <button
                      type="button"
                      aria-disabled={
                        isAdPlaying ||
                        (isLiveStream && isAtLiveHead && effectiveSpeed + 0.05 > 1.01)
                          ? true
                          : undefined
                      }
                      onClick={() =>
                        handleAssignChannelSpeed(
                          Math.min(4.0, effectiveSpeed + 0.05),
                          'custom',
                          'Popup fine stepper'
                        )
                      }
                      className={`px-2 py-1 rounded border border-slate-700 bg-[#0B0F19] text-slate-200 text-xs font-mono tabular-nums transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                        isAdPlaying ||
                        (isLiveStream && isAtLiveHead && effectiveSpeed + 0.05 > 1.01)
                          ? 'opacity-45 hover:opacity-75 hover:border-amber-500/40'
                          : 'hover:bg-slate-800'
                      }`}
                    >
                      +0.05×
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Core Background Behavior Toggles */}
            <div className="space-y-3.5 pb-4 border-b border-slate-800">
              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    Per-Channel Auto Playback Speed
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Applies saved speed automatically whenever a channel plays
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.perChannelSpeedEnabled}
                  onChange={(e) =>
                    onUpdateSettings({ perChannelSpeedEnabled: e.target.checked })
                  }
                  className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
                />
              </label>

              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    Remember Manual Speed Changes
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Also save YouTube gear-menu adjustments to channel rules
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoRememberManualSpeed}
                  onChange={(e) =>
                    onUpdateSettings({ autoRememberManualSpeed: e.target.checked })
                  }
                  className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
                />
              </label>

              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    Stop Playback After Video Ends
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Prevents auto-play on Watch Later, saved playlists, and Up Next
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.stopAfterVideoEnds}
                  onChange={(e) =>
                    onUpdateSettings({ stopAfterVideoEnds: e.target.checked })
                  }
                  className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
                />
              </label>

              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    Show Speed Bar Below Video
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Full-width 3-row speed, skip &amp; rule deck above video title
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showInPageControlBar}
                  onChange={(e) =>
                    onUpdateSettings({ showInPageControlBar: e.target.checked })
                  }
                  className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
                />
              </label>

              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    Convert Shorts to Standard Player
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Auto-redirects /shorts/ links &amp; URLs to /watch player
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.convertShortsToWatch !== false}
                  onChange={(e) =>
                    onUpdateSettings({ convertShortsToWatch: e.target.checked })
                  }
                  className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
                />
              </label>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 tabular-nums">
                {rules.length} channel {rules.length === 1 ? 'rule' : 'rules'} · v{EXTENSION_VERSION}
              </span>
              <button
                type="button"
                onClick={onNavigateToRules}
                className="font-semibold text-red-400 hover:text-red-300 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Manage All Channels
              </button>
            </div>
          </div>

          {/* Background Engine Action Log */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-xs font-semibold text-slate-100">
                Recent Extension Actions
              </h3>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {logs.length} events
              </span>
            </div>

            {logs.length === 0 ? (
              <p className="py-6 text-xs text-slate-400 text-center">
                Switch channels or jump to the end of a video to see background events.
              </p>
            ) : (
              <div className="divide-y divide-slate-800/80 max-h-56 overflow-y-auto">
                {logs.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="py-2.5 text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-slate-200">{entry.action}</span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                        {entry.timestamp}
                      </span>
                    </div>
                    <p className="text-slate-400 mt-0.5 leading-snug">{entry.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
