import React, { useEffect, useRef, useState } from 'react';
import {
  FastForward,
  Pause,
  Play,
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
import { resolveRuleSpeed, SIMULATED_VIDEOS } from '../data/initialData';

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
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatSpeed(speed: number): string {
  return speed.toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
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
  const [currentTime, setCurrentTime] = useState<number>(8);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.5);
  const [stoppedByCadence, setStoppedByCadence] = useState<boolean>(false);
  const [autoAdvancingCountdown, setAutoAdvancingCountdown] = useState<boolean>(false);
  const [playerToast, setPlayerToast] = useState<string | null>(null);
  const [showNativeGearMenu, setShowNativeGearMenu] = useState<boolean>(false);
  const [audioMuted, setAudioMuted] = useState<boolean>(true);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const currentTimeRef = useRef<number>(8);
  const toastTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPulseTimeRef = useRef<number>(0);

  const syncTime = (val: number) => {
    currentTimeRef.current = val;
    setCurrentTime(val);
  };

  const currentVideo = SIMULATED_VIDEOS[currentVideoIndex];

  const matchedRule = rules.find(
    (r) =>
      (r.channelId && r.channelId === currentVideo.channelId) ||
      r.handle.toLowerCase() === currentVideo.handle.toLowerCase() ||
      r.channelName.toLowerCase() === currentVideo.channelName.toLowerCase()
  );

  const triggerToast = (message: string) => {
    if (!settings.enabled || !settings.showSpeedToast) return;
    setPlayerToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setPlayerToast(null);
    }, 2200);
  };

  useEffect(() => {
    if (!settings.enabled || !settings.perChannelSpeedEnabled) {
      setPlaybackSpeed(1.0);
      return;
    }
    const target = resolveRuleSpeed(matchedRule, presets, settings.defaultSpeed);
    setPlaybackSpeed(target);
  }, [
    currentVideo.id,
    settings.enabled,
    settings.perChannelSpeedEnabled,
    settings.defaultSpeed,
    matchedRule,
    presets,
  ]);

  const selectVideo = (index: number, manualSource = true) => {
    const nextVid = SIMULATED_VIDEOS[index];
    setCurrentVideoIndex(index);
    syncTime(0);
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
      triggerToast(`${formatSpeed(resolved)}× · ${descriptor}`);
      onAddLog(
        `Applied ${formatSpeed(resolved)}× speed`,
        `${nextVid.channelName} (${nextVid.handle}) · ${descriptor}`
      );
    } else if (manualSource) {
      setPlaybackSpeed(1.0);
    }
  };

  const playSubtleCadenceTick = (speed: number) => {
    if (audioMuted) return;
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
    if (!isPlaying) return;

    const tickMs = 100;
    const interval = window.setInterval(() => {
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
    playbackSpeed,
    currentVideo.durationSec,
    currentVideo.title,
    settings.enabled,
    settings.stopAfterVideoEnds,
    playlistMode,
    audioMuted,
  ]);

  useEffect(() => {
    if (!autoAdvancingCountdown) return;
    const timer = window.setTimeout(() => {
      const nextIdx = (currentVideoIndex + 1) % SIMULATED_VIDEOS.length;
      onAddLog(
        'YouTube auto-advanced video',
        `Stop After Video Ends is currently off — advanced to "${SIMULATED_VIDEOS[nextIdx].title}"`
      );
      selectVideo(nextIdx, false);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [autoAdvancingCountdown, currentVideoIndex]);

  const handleManualPlayerSpeedChange = (newSpeed: number) => {
    const clean = Math.round(Math.min(3.0, Math.max(0.25, newSpeed)) * 100) / 100;
    setPlaybackSpeed(clean);
    setShowNativeGearMenu(false);

    if (settings.enabled && settings.autoRememberManualSpeed) {
      const matchedPreset = presets.find((p) => Math.abs(p.speed - clean) < 0.01);
      onSaveChannelRule(
        currentVideo,
        clean,
        matchedPreset ? matchedPreset.id : 'custom',
        'Auto-remembered from YouTube player'
      );
      triggerToast(`Remembered ${formatSpeed(clean)}× for ${currentVideo.channelName}`);
    } else {
      triggerToast(`Player speed ${formatSpeed(clean)}× (not saved)`);
    }
  };

  const handleAssignChannelSpeed = (speed: number, presetId: CategoryPresetId, origin: string) => {
    const clean = Math.round(Math.min(3.0, Math.max(0.25, speed)) * 100) / 100;
    setPlaybackSpeed(clean);
    onSaveChannelRule(currentVideo, clean, presetId, origin);
    triggerToast(`Saved ${formatSpeed(clean)}× for ${currentVideo.channelName}`);
  };

  const handleSkipNearEnd = () => {
    setStoppedByCadence(false);
    setAutoAdvancingCountdown(false);
    const targetTime = Math.max(0, currentVideo.durationSec - 3);
    syncTime(targetTime);
    setIsPlaying(true);
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

  const progressPercent = Math.min(100, (currentTime / currentVideo.durationSec) * 100);
  const playlistLabel =
    playlistMode === 'watch_later'
      ? 'Watch Later · 4 videos'
      : playlistMode === 'creator_playlist'
        ? 'Creator Series Playlist · 4 videos'
        : playlistMode === 'live_stream'
          ? 'Live Stream (/live)'
          : 'Standalone Watch Page';

  return (
    <div className="space-y-8">
      {/* Intro & Simulation Context Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between pb-6 border-b border-slate-800/90">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 [text-wrap:balance]">
            Interactive YouTube &amp; Extension Workbench
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
            Test per-channel speed switching and playlist end-of-video stopping below. Any channel
            speeds or subscriptions you configure are persisted automatically and bundled into your
            downloadable Chrome extension.
          </p>
        </div>

        {/* Playlist Context Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="inline-flex items-center p-1 bg-[#111827] border border-slate-800 rounded-lg"
            role="group"
            aria-label="Simulated YouTube playback context"
          >
            {(
              [
                { id: 'watch_later', label: 'Watch Later' },
                { id: 'creator_playlist', label: 'Creator Playlist' },
                { id: 'standalone', label: 'Single Video' },
                { id: 'live_stream', label: 'Live Stream' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setPlaylistMode(mode.id);
                  setStoppedByCadence(false);
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
            onClick={handleSkipNearEnd}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#111827] border border-slate-700/90 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Jump to 3 seconds before the video ends to test playlist hard-stop"
          >
            <FastForward className="w-3.5 h-3.5 text-red-500" />
            Test Last 3 Seconds
          </button>
        </div>
      </div>

      {/* Main 12-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 8 Columns: Simulated YouTube Watch Environment (Native Dark Mode) */}
        <div className="lg:col-span-8 bg-[#111827] border border-slate-800/90 rounded-xl overflow-hidden">
          {/* Simulated Browser URL Bar */}
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-[#0D1320] border-b border-slate-800 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 min-w-0 font-mono truncate">
              <span className="text-slate-500 select-none">https://</span>
              <span className="text-slate-200 truncate">
                {playlistMode === 'live_stream'
                  ? `youtube.com/live/${currentVideo.id}`
                  : `youtube.com/watch?v=${currentVideo.id}${
                      playlistMode === 'watch_later'
                        ? '&list=WL'
                        : playlistMode === 'creator_playlist'
                          ? '&list=PL_CREATOR_SERIES'
                          : ''
                    }`}
              </span>
            </div>
            <div className="text-xs text-slate-400 whitespace-nowrap shrink-0 tabular-nums">
              {playlistLabel}
            </div>
          </div>

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
                <span className="font-mono tabular-nums">{formatSpeed(playbackSpeed)}× active</span>
              </div>

              {/* Cadence Auto-Speed Player Toast */}
              {playerToast && (
                <div className="px-3 py-1.5 rounded-md bg-slate-950/90 border border-white/15 text-xs font-medium text-white tabular-nums shadow-sm">
                  {playerToast}
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
              <div className="absolute right-4 bottom-14 z-30 w-48 p-2 rounded-lg bg-slate-950/95 border border-slate-700 text-white shadow-lg">
                <div className="px-2.5 py-1.5 text-[11px] text-slate-400 border-b border-slate-800">
                  YouTube Player Speed
                </div>
                <div className="grid grid-cols-2 gap-1 pt-1.5">
                  {[0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => handleManualPlayerSpeedChange(spd)}
                      className={`px-2.5 py-1.5 rounded text-xs font-mono tabular-nums text-left transition-colors cursor-pointer ${
                        Math.abs(playbackSpeed - spd) < 0.02
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
                  syncTime(ratio * currentVideo.durationSec);
                  setStoppedByCadence(false);
                }}
              >
                <div
                  className="h-full bg-red-600 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between gap-4 text-white">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentTime >= currentVideo.durationSec) {
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

                  <span className="text-xs font-mono tabular-nums text-white/90">
                    {formatTime(currentTime)} / {formatTime(currentVideo.durationSec)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNativeGearMenu((s) => !s)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs font-mono tabular-nums text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    title="Change speed via YouTube player menu to test Auto-Remember"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Player: {formatSpeed(playbackSpeed)}×
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Simulated YouTube Dark Watch Metadata & Injected Cadence Channel Bar */}
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

            {/* YouTube Channel Owner Row + Injected Cadence Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 border-y border-slate-800">
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

              {/* Injected Cadence In-Page Control Bar (html[dark] style) */}
              {settings.enabled && settings.showInPageControlBar && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0B0F19] border border-slate-700/90">
                  <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                    {matchedRule ? 'Channel Rule' : 'Default'} ·{' '}
                    <strong className="text-slate-100">{formatSpeed(playbackSpeed)}×</strong>
                  </span>
                  <div className="flex items-center gap-1">
                    {[1.0, 1.25, 1.5, 1.75, 2.0].map((spd) => {
                      const active = Math.abs(playbackSpeed - spd) < 0.02;
                      const matchingPreset = presets.find((p) => Math.abs(p.speed - spd) < 0.01);
                      return (
                        <button
                          key={spd}
                          type="button"
                          onClick={() =>
                            handleAssignChannelSpeed(
                              spd,
                              matchingPreset ? matchingPreset.id : 'custom',
                              'In-page YouTube bar'
                            )
                          }
                          className={`px-2 py-1 rounded text-xs font-mono tabular-nums font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'bg-red-600 text-white'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {formatSpeed(spd)}×
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Channel / Playlist Switcher Queue */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-100">
                  Switch Channel in Queue to Test Auto-Speed
                </h3>
                <span className="text-xs text-slate-400">
                  Click any video to simulate navigating on YouTube
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
                            <span className="tabular-nums">{formatTime(vid.durationSec)}</span>
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
        </div>

        {/* Right 4 Columns: Live Chrome Extension Popup Preview + Event Log */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-5 space-y-5">
            {/* Extension Popup Top Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
              <div>
                <div className="text-sm font-bold text-slate-100 font-display">
                  Cadence Toolbar Popup
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Mirrors popup.html in Chrome
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
            <div className="space-y-3 pb-4 border-b border-slate-800">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-slate-400">Detected Channel</span>
                <span className="text-xs font-mono tabular-nums font-semibold text-slate-100">
                  {formatSpeed(playbackSpeed)}×
                </span>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-100">
                  {currentVideo.channelName}
                </div>
                <div className="text-xs text-slate-400">{currentVideo.handle}</div>
              </div>

              {/* Preset Profile Buttons */}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                {presets.map((preset) => {
                  const isSelected =
                    matchedRule?.presetId === preset.id &&
                    Math.abs(playbackSpeed - preset.speed) < 0.02;
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
                  const active = Math.abs(playbackSpeed - spd) < 0.015;
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

              {/* Fine-Grained ±0.05x Custom Speed Stepper */}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-xs text-slate-400">Fine Speed Stepper</span>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      handleAssignChannelSpeed(
                        Math.max(0.25, playbackSpeed - 0.05),
                        'custom',
                        'Popup fine stepper'
                      )
                    }
                    className="px-2 py-1 rounded border border-slate-700 bg-[#0B0F19] text-slate-200 text-xs font-mono tabular-nums hover:bg-slate-800 cursor-pointer"
                  >
                    −0.05×
                  </button>
                  <span className="w-14 text-center text-xs font-mono font-semibold tabular-nums text-slate-100">
                    {formatSpeed(playbackSpeed)}×
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleAssignChannelSpeed(
                        Math.min(4.0, playbackSpeed + 0.05),
                        'custom',
                        'Popup fine stepper'
                      )
                    }
                    className="px-2 py-1 rounded border border-slate-700 bg-[#0B0F19] text-slate-200 text-xs font-mono tabular-nums hover:bg-slate-800 cursor-pointer"
                  >
                    +0.05×
                  </button>
                </div>
              </div>
            </div>

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
                    Updates channel rule when you adjust YouTube’s speed menu
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
                    Places quick speed buttons beside Subscribe on YouTube
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
                {rules.length} channel {rules.length === 1 ? 'rule' : 'rules'} persisted
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
