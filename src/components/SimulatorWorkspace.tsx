import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  FastForward,
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
  onAddLog: (action: string, detail: string) => void;
  onNavigateToRules: () => void;
}

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

export const SimulatorWorkspace: React.FC<SimulatorWorkspaceProps> = ({
  settings,
  presets,
  rules,
  logs,
  onUpdateSettings,
  onSaveChannelRule,
  onAddLog,
  onNavigateToRules,
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
  const [popupToast, setPopupToast] = useState<string | null>(null);
  const [showNativeGearMenu, setShowNativeGearMenu] = useState<boolean>(false);
  const [audioMuted, setAudioMuted] = useState<boolean>(true);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const currentTimeRef = useRef<number>(1440);
  const liveEdgeRef = useRef<number>(3600);
  const wasBehindLiveRef = useRef<boolean>(false);
  const sessionOverrideRef = useRef<number | null>(null);
  const baselineSpeedRef = useRef<number>(1.0);
  const toastTimerRef = useRef<number | null>(null);
  const barToastTimerRef = useRef<number | null>(null);
  const popupToastTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPulseTimeRef = useRef<number>(0);

  const syncTime = (val: number) => {
    currentTimeRef.current = val;
    setCurrentTime(val);
  };

  const syncLiveEdge = (val: number) => {
    liveEdgeRef.current = val;
    setLiveEdgeTime(val);
  };

  const isHomeBrowseMode = playlistMode === 'youtube_home';
  const currentVideo = SIMULATED_VIDEOS[currentVideoIndex];
  const isLiveStream = Boolean(currentVideo.isLiveStream);

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
  };

  const triggerBarToast = (message: string) => {
    if (!settings.enabled || !settings.showInPageControlBar) return;
    setBarToast(message);
    if (barToastTimerRef.current) window.clearTimeout(barToastTimerRef.current);
    barToastTimerRef.current = window.setTimeout(() => {
      setBarToast(null);
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
    setIsPlaying(false);
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
    startBehindSec = 0
  ) => {
    const nextVid = SIMULATED_VIDEOS[index];
    const wasHome = playlistMode === 'youtube_home';
    if (overrideMode) {
      setPlaylistMode(overrideMode);
    } else if (wasHome) {
      setPlaylistMode('standalone');
    }

    setCurrentVideoIndex(index);
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

  useEffect(() => {
    if (isHomeBrowseMode) return;
    if (!isPlaying && !isLiveStream) return;

    const tickMs = 100;
    const interval = window.setInterval(() => {
      if (isLiveStream) {
        const nextEdge = liveEdgeRef.current + tickMs / 1000;
        syncLiveEdge(nextEdge);

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
              if (activeSession !== null && activeSession > 1.01) {
                setSessionOverrideSpeed(null);
                setPlaybackSpeed(baselineSpeedRef.current);
              }
              onAddLog(
                'Caught up to Live broadcast head',
                `Reset active playback speed to 1.0× on "${currentVideo.title}"`
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
    playbackSpeed,
    currentVideo.durationSec,
    currentVideo.title,
    settings.enabled,
    settings.stopAfterVideoEnds,
    playlistMode,
    audioMuted,
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
    settings.enabled && isLiveStream && isAtLiveHead && playbackSpeed > 1.01;
  const effectiveSpeed =
    isLiveStream && isAtLiveHead && playbackSpeed > 1.01 ? 1.0 : playbackSpeed;

  useEffect(() => {
    if ((!isLiveStream || !isAtLiveHead) && barToast) {
      clearBarToast();
    }
  }, [isLiveStream, isAtLiveHead, barToast]);

  const handleSessionBarSpeedChange = (newSpeed: number) => {
    const clean = clampSpeed(newSpeed);

    if (isLiveStream && isAtLiveHead) {
      if (clean > 1.01) {
        if (sessionOverrideSpeed !== null && sessionOverrideSpeed > 1.01) {
          setSessionOverrideSpeed(null);
          setPlaybackSpeed(baselineSpeed);
        }
        triggerBarToast('Stream is currently at live end');
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

    if (isLiveStream && isAtLiveHead) {
      if (clean > 1.01) {
        if (sessionOverrideSpeed !== null && sessionOverrideSpeed > 1.01) {
          setSessionOverrideSpeed(null);
          setPlaybackSpeed(baselineSpeed);
        }
        triggerBarToast('Stream is currently at live end');
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
    if (isLiveStream && isAtLiveHead && clean > 1.01) {
      if (sessionOverrideSpeed !== null && sessionOverrideSpeed > 1.01) {
        setSessionOverrideSpeed(null);
        setPlaybackSpeed(baselineSpeed);
      }
      triggerPopupToast('Stream is currently at live end');
      triggerBarToast('Stream is currently at live end');
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
    const mins = Math.round(secondsBehind / 60);
    triggerToast(
      playbackSpeed > 1.02
        ? `Rewound ${mins}m · Catching up at ${formatSpeed(playbackSpeed)}×`
        : `Rewound ${mins}m into DVR buffer`
    );
    onAddLog(
      `DVR rewound ${mins}m behind live`,
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

  const timelineHorizon = isLiveStream ? Math.max(1, liveEdgeTime) : currentVideo.durationSec;
  const progressPercent = Math.min(100, (currentTime / timelineHorizon) * 100);
  const actualPlayerRate = effectiveSpeed;

  const rawRemainingSec = isLiveStream ? 0 : Math.max(0, currentVideo.durationSec - currentTime);
  const durationSlotModel = (() => {
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

  const playlistLabel =
    playlistMode === 'youtube_home'
      ? 'YouTube Home · Browse Feed'
      : playlistMode === 'watch_later'
        ? `Watch Later · ${SIMULATED_VIDEOS.length} videos`
        : playlistMode === 'creator_playlist'
          ? `Creator Series Playlist · ${SIMULATED_VIDEOS.length} videos`
          : isLiveStream
            ? 'Live Broadcast · DVR Enabled'
            : 'Standalone Watch Page';

  const badgeText =
    !isHomeBrowseMode && settings.enabled && settings.perChannelSpeedEnabled
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
            Test zero-lag channel speed locks, real-time remaining duration at speed, self-clearing
            session overrides, YouTube Home badge clearing, and playlist end-of-video stopping.
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
            disabled={isHomeBrowseMode || isLiveStream}
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
            <div className="p-5 sm:p-6 space-y-5">
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
                    . Click any video below to lock its channel speed at 0ms.
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
            </div>
          ) : (
            <>
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
                    className="group relative h-1.5 bg-white/25 rounded-full cursor-pointer mb-3"
                    onClick={(e) => {
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
                    <div
                      className="h-full bg-red-600 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
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
                            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-mono tabular-nums text-white/90 whitespace-nowrap shrink-0 cursor-pointer"
                            title="Simulate rewinding 2 minutes into the live DVR buffer"
                          >
                            −2m DVR
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

              {/* Simulated YouTube Dark Watch Metadata & Injected Session-Only Bar */}
              <div className="p-5 sm:p-6 space-y-5">
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

                {/* YouTube Channel Owner Row + Injected Cadence Session-Only Bar */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 py-4 border-y border-slate-800">
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
                  </div>

                  {/* Injected Cadence Session-Only Below-Video Control Bar */}
                  {settings.enabled && settings.showInPageControlBar && (
                    <div className="relative flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0B0F19] border border-slate-700/90">
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

                      <span
                        className="text-xs text-slate-400 tabular-nums whitespace-nowrap"
                        title={
                          isLiveHeadClamped
                            ? `Stream is currently at live end (1.0×) · Saved ${formatSpeed(baselineSpeed)}× rule restores automatically behind live`
                            : sessionOverrideSpeed !== null
                              ? `Session override active · Saved baseline is ${formatSpeed(baselineSpeed)}×`
                              : 'Session-only speed bar · Does not alter saved Channel Rules'
                        }
                      >
                        {sessionOverrideSpeed !== null
                          ? 'Session'
                          : matchedRule
                            ? 'Rule'
                            : 'Default'}{' '}
                        ·{' '}
                        <strong
                          className={
                            sessionOverrideSpeed !== null ? 'text-amber-300' : 'text-slate-100'
                          }
                        >
                          {formatSpeed(effectiveSpeed)}×
                        </strong>
                      </span>

                      <div className="flex items-center gap-1 flex-wrap">
                        {[0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((spd) => {
                          const active = Math.abs(effectiveSpeed - spd) < 0.015;
                          const isLiveBlocked = isLiveStream && isAtLiveHead && spd > 1.01;
                          return (
                            <button
                              key={spd}
                              type="button"
                              aria-disabled={isLiveBlocked ? true : undefined}
                              onClick={() => handleSessionBarSpeedChange(spd)}
                              className={`px-2 py-1 rounded text-xs font-mono tabular-nums font-medium transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                                active
                                  ? 'bg-red-600 text-white'
                                  : isLiveBlocked
                                    ? 'text-slate-300 opacity-42 hover:opacity-70 hover:bg-amber-500/10'
                                    : 'text-slate-300 hover:bg-slate-800'
                              }`}
                              title={
                                isLiveBlocked
                                  ? 'Unavailable while synced at live end — rewind stream to speed up'
                                  : `Set ${formatSpeed(spd)}× for this video session only`
                              }
                            >
                              {formatSpeed(spd)}×
                            </button>
                          );
                        })}
                      </div>

                      <span
                        className="hidden sm:inline-block w-px h-3.5 bg-slate-700"
                        aria-hidden="true"
                      />

                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSessionBarSpeedChange(effectiveSpeed - 0.05)}
                          className="px-2 py-1 rounded border border-slate-700/90 text-[11px] font-mono font-semibold tabular-nums text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                          title="Slow down by 0.05× for this video session only"
                        >
                          −0.05
                        </button>
                        {(() => {
                          const isStepUpLiveBlocked =
                            isLiveStream && isAtLiveHead && effectiveSpeed + 0.05 > 1.01;
                          return (
                            <button
                              type="button"
                              aria-disabled={isStepUpLiveBlocked ? true : undefined}
                              onClick={() => handleSessionBarSpeedChange(effectiveSpeed + 0.05)}
                              className={`px-2 py-1 rounded border border-slate-700/90 text-[11px] font-mono font-semibold tabular-nums text-slate-200 transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                                isStepUpLiveBlocked
                                  ? 'opacity-42 hover:opacity-70 hover:bg-amber-500/10'
                                  : 'hover:bg-slate-800'
                              }`}
                              title={
                                isStepUpLiveBlocked
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
                          disabled={sessionOverrideSpeed === null}
                          className={`px-2 py-1 rounded border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            sessionOverrideSpeed !== null
                              ? 'border-red-500/60 text-slate-100 hover:bg-slate-800 cursor-pointer'
                              : 'border-slate-800 text-slate-500 cursor-default opacity-50'
                          }`}
                          title={`Reset to ${matchedRule ? 'Channel Rule' : 'Default'} (${formatSpeed(
                            isLiveStream && isAtLiveHead && baselineSpeed > 1.01 ? 1.0 : baselineSpeed
                          )}×)`}
                        >
                          Reset
                        </button>
                      </div>

                      {durationSlotModel.text && (
                        <>
                          <span
                            className="hidden sm:inline-block w-px h-3.5 bg-slate-700"
                            aria-hidden="true"
                          />
                          <button
                            type="button"
                            disabled={!durationSlotModel.clickable}
                            onClick={() => {
                              if (durationSlotModel.clickable) {
                                handleJumpToLive();
                              }
                            }}
                            className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0 transition-colors ${
                              durationSlotModel.clickable
                                ? 'border border-slate-700/90 text-slate-200 hover:bg-slate-800 hover:border-red-500/60 cursor-pointer'
                                : durationSlotModel.mode === 'live-head'
                                  ? 'border border-transparent text-slate-100 font-semibold cursor-default'
                                  : 'border border-transparent text-slate-400 cursor-default'
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
                            <span>{durationSlotModel.text}</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
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
                    {isLiveStream && isAtLiveHead
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
                      isLiveStream && isAtLiveHead
                        ? sessionOverrideSpeed === null &&
                          matchedRule?.presetId === preset.id &&
                          Math.abs(preset.speed - 1.0) < 0.02
                        : sessionOverrideSpeed === null &&
                          matchedRule?.presetId === preset.id &&
                          Math.abs(effectiveSpeed - preset.speed) < 0.02;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          handleAssignChannelSpeed(
                            preset.speed,
                            preset.id,
                            `Popup (${preset.label})`
                          )
                        }
                        className={`px-2.5 py-2 rounded-md border text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-red-600 border-red-600 text-white'
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
                      isLiveStream && isAtLiveHead
                        ? sessionOverrideSpeed === null && Math.abs(spd - 1.0) < 0.015
                        : sessionOverrideSpeed === null && Math.abs(effectiveSpeed - spd) < 0.015;
                    const matchingPreset = presets.find((p) => Math.abs(p.speed - spd) < 0.01);
                    return (
                      <button
                        key={spd}
                        type="button"
                        onClick={() =>
                          handleAssignChannelSpeed(
                            spd,
                            matchingPreset ? matchingPreset.id : 'custom',
                            'Popup quick speed'
                          )
                        }
                        className={`py-1.5 rounded-md border text-xs font-mono font-semibold tabular-nums transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-red-600 border-red-600 text-white'
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
                      onClick={() =>
                        handleAssignChannelSpeed(
                          Math.max(0.25, effectiveSpeed - 0.05),
                          'custom',
                          'Popup fine stepper'
                        )
                      }
                      className="px-2 py-1 rounded border border-slate-700 bg-[#0B0F19] text-slate-200 text-xs font-mono tabular-nums hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      −0.05×
                    </button>
                    <span className="w-14 text-center text-xs font-mono font-semibold tabular-nums text-slate-100">
                      {formatSpeed(effectiveSpeed)}×
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleAssignChannelSpeed(
                          Math.min(4.0, effectiveSpeed + 0.05),
                          'custom',
                          'Popup fine stepper'
                        )
                      }
                      className="px-2 py-1 rounded border border-slate-700 bg-[#0B0F19] text-slate-200 text-xs font-mono tabular-nums hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
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
                    Session-only speed bar with remaining time beside Subscribe
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
