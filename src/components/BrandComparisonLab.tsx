import React, { useId, useState } from 'react';
import { EXTENSION_VERSION } from '../data/sampleDefaults';

type TaglineVariant = 'sentence' | 'caps' | 'caps_italic';
type PopupPlaybackState = 'active' | 'idle';
type ToolbarTheme = 'dark' | 'light';

interface EmblemProps {
  size: number;
  className?: string;
}

const CurrentEmblem: React.FC<EmblemProps> = ({ size, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
    className={`shrink-0 ${className}`}
  >
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

interface ProgressEmblemProps extends EmblemProps {
  fillPercent: number;
}

const ProposedProgressEmblem: React.FC<ProgressEmblemProps> = ({
  size,
  fillPercent,
  className = '',
}) => {
  const clipId = useId();
  const trackX = 3.5;
  const trackW = 13;
  const fillW = Math.max(2, Math.min(trackW, (trackW * fillPercent) / 100));

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={trackX} y="14.2" width={trackW} height="2.4" rx="1.2" />
        </clipPath>
      </defs>
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
      <path d="M7.1 4.1L14.3 8.2L7.1 12.3V4.1Z" fill="#EF4444" />
      <rect x={trackX} y="14.2" width={trackW} height="2.4" rx="1.2" fill="#F8FAFC" />
      <rect
        x={trackX}
        y="14.2"
        width={fillW}
        height="2.4"
        fill="#DC2626"
        clipPath={`url(#${clipId})`}
      />
    </svg>
  );
};

interface PopupPreviewProps {
  variant: 'current' | 'proposed';
  taglineVariant: TaglineVariant;
  showAccentLine: boolean;
  playbackState: PopupPlaybackState;
  fillPercent: number;
  selectedPreset: 'music' | 'educational' | 'podcast';
  speed: number;
  toggles: { stop: boolean; shorts: boolean; previews: boolean };
  onSelectPreset: (preset: 'music' | 'educational' | 'podcast', nextSpeed: number) => void;
  onStepSpeed: (delta: number) => void;
  onToggle: (key: 'stop' | 'shorts' | 'previews') => void;
}

const formatSpeed = (val: number): string =>
  val.toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');

const PopupLiveCard: React.FC<PopupPreviewProps> = ({
  variant,
  taglineVariant,
  showAccentLine,
  playbackState,
  fillPercent,
  selectedPreset,
  speed,
  toggles,
  onSelectPreset,
  onStepSpeed,
  onToggle,
}) => {
  const isProposed = variant === 'proposed';
  const isActive = playbackState === 'active';
  const isCaps = isProposed && taglineVariant !== 'sentence';
  const isItalic = isProposed && taglineVariant === 'caps_italic';
  const taglineText = isCaps ? 'YOUTUBE AT YOUR SPEED' : 'YouTube at your speed';

  return (
    <div
      className="w-[356px] max-w-full rounded-xl overflow-hidden border border-slate-800 shadow-2xl text-slate-100 select-none"
      style={{
        background: '#0b0f19',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Popup Top Header */}
      {isProposed ? (
        <div
          className="relative flex items-center gap-2.5 border-b border-slate-800"
          style={{
            background: '#111827',
            padding: showAccentLine ? '14px 16px 12px' : '12px 16px',
          }}
        >
          {showAccentLine && (
            <div
              aria-hidden="true"
              className="absolute top-0 left-0 right-0 h-[2.5px]"
              style={{
                background:
                  'linear-gradient(90deg, #dc2626 0%, rgba(220, 38, 38, 0.72) 45%, rgba(220, 38, 38, 0.16) 80%, rgba(220, 38, 38, 0) 100%)',
              }}
            />
          )}
          <ProposedProgressEmblem size={32} fillPercent={fillPercent} />
          <div className="flex flex-col leading-tight">
            <span className="text-[16px] font-bold tracking-[-0.015em] text-slate-50">
              Cadence
            </span>
            <span
              className={
                isCaps
                  ? `text-[10px] font-semibold tracking-[0.09em] text-slate-400 mt-0.5 ${
                      isItalic ? 'italic' : ''
                    }`
                  : 'text-[11.5px] font-medium text-slate-400 mt-0.5'
              }
            >
              {taglineText}
            </span>
          </div>
        </div>
      ) : (
        <div
          className="flex items-center border-b border-slate-800"
          style={{ background: '#111827', padding: '13px 16px' }}
        >
          <div className="inline-flex items-center gap-[7px]">
            <CurrentEmblem size={18} />
            <span className="text-[15px] font-bold tracking-[-0.01em] text-slate-50">
              Cadence
            </span>
            <span className="text-[12.5px] font-semibold text-slate-300">
              - YouTube at your speed
            </span>
          </div>
        </div>
      )}

      {/* Popup Middle Body */}
      <div style={{ padding: '16px 16px 8px' }}>
        <div
          className="relative rounded-lg transition-colors"
          style={{
            margin: '2px 0 4px',
            padding: '15px 12px 12px',
            border: isActive ? '1.5px solid #dc2626' : '1.5px solid #334155',
            background: isActive ? 'rgba(220, 38, 38, 0.05)' : 'rgba(17, 24, 39, 0.55)',
          }}
        >
          <span
            className="absolute -top-[8px] left-[10px] inline-flex items-center gap-[5px] px-1.5 text-[10px] font-bold uppercase tracking-[0.06em]"
            style={{
              background: '#0b0f19',
              color: isActive ? '#f87171' : '#64748b',
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: isActive ? '#dc2626' : '#475569' }}
            />
            Now Playing
          </span>

          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[11px] text-slate-400">
              {isActive ? 'Saved Channel Rule' : 'Active YouTube Tab'}
            </span>
            {isActive && (
              <span className="text-[12px] font-bold text-slate-50 tabular-nums">
                {formatSpeed(speed)}×
              </span>
            )}
          </div>
          <div className="text-[14px] font-semibold text-slate-50">
            {isActive ? 'Orbital Mechanics Lab' : 'Open a YouTube video'}
          </div>
          {isActive && (
            <div className="text-[11px] text-slate-400 mt-0.5">@orbitalmechanicslab</div>
          )}

          {isActive && (
            <div className="mt-2.5 flex flex-col gap-2.5">
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'music' as const, label: 'Music', spd: 1.0 },
                  { id: 'educational' as const, label: 'Educational', spd: 1.5 },
                  { id: 'podcast' as const, label: 'Podcast', spd: 2.0 },
                ].map((preset) => {
                  const active =
                    selectedPreset === preset.id && Math.abs(speed - preset.spd) < 0.015;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectPreset(preset.id, preset.spd)}
                      className={`px-2 py-[7px] rounded-md border text-left cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#dc2626] border-[#dc2626] text-white'
                          : 'bg-[#111827] border-slate-700 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <span className="block text-[11px] font-medium">{preset.label}</span>
                      <span className="block text-[12px] font-bold mt-0.5 tabular-nums">
                        {formatSpeed(preset.spd)}×
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[11px] text-slate-400">Channel Rule Fine Stepper</span>
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onStepSpeed(-0.05)}
                    className="px-2 py-1 rounded-[5px] border border-slate-700 bg-[#111827] hover:bg-slate-800 text-[11px] font-semibold text-slate-200 tabular-nums cursor-pointer"
                  >
                    −0.05×
                  </button>
                  <span className="min-w-[48px] text-center text-[12px] font-bold text-slate-50 tabular-nums">
                    {formatSpeed(speed)}×
                  </span>
                  <button
                    type="button"
                    onClick={() => onStepSpeed(0.05)}
                    className="px-2 py-1 rounded-[5px] border border-slate-700 bg-[#111827] hover:bg-slate-800 text-[11px] font-semibold text-slate-200 tabular-nums cursor-pointer"
                  >
                    +0.05×
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Popup Toggles */}
        <div style={{ padding: '12px 0 6px' }}>
          {[
            {
              key: 'stop' as const,
              title: 'Stop Playback After Video Ends',
              sub: 'Blocks Up Next, Watch Later & Playlists',
            },
            {
              key: 'shorts' as const,
              title: 'Convert Shorts to Standard Player',
              sub: 'Auto-redirect /shorts/ & rewrite feed links',
            },
            {
              key: 'previews' as const,
              title: 'Disable Video Previews',
              sub: 'Blocks hover previews on Home, Search & Feeds',
            },
          ].map((item) => {
            const on = toggles[item.key];
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <div>
                  <div className="text-[13px] font-medium text-slate-100">{item.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{item.sub}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => onToggle(item.key)}
                  className="relative inline-block w-[42px] h-[24px] shrink-0 rounded-full transition-colors cursor-pointer"
                  style={{ background: on ? '#dc2626' : '#334155' }}
                >
                  <span
                    className="absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white transition-transform"
                    style={{ transform: on ? 'translateX(18px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Popup Footer */}
      <div
        className="flex items-center justify-between border-t border-slate-800"
        style={{ background: '#111827', padding: '12px 16px' }}
      >
        <span className="text-[12.5px] font-semibold text-slate-200 underline cursor-pointer hover:text-white">
          All Cadence Options
        </span>
        <div className="inline-flex items-center gap-2">
          <span className="text-[14px] opacity-90" title="Support Cadence on Buy Me a Coffee">
            ☕
          </span>
          <span className="text-[12px] font-semibold text-slate-300 tabular-nums">
            v{EXTENSION_VERSION}
          </span>
        </div>
      </div>
    </div>
  );
};

interface ToolbarPreviewProps {
  variant: 'current' | 'proposed';
  taglineVariant: TaglineVariant;
  showAccentLine: boolean;
  theme: ToolbarTheme;
  fillPercent: number;
  speed: number;
  onSetSpeed: (spd: number) => void;
}

const VideoToolbarCard: React.FC<ToolbarPreviewProps> = ({
  variant,
  taglineVariant,
  showAccentLine,
  theme,
  fillPercent,
  speed,
  onSetSpeed,
}) => {
  const isProposed = variant === 'proposed';
  const isDark = theme === 'dark';

  const cardBg = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.045)';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.14)';
  const textPrimary = isDark ? '#f1f5f9' : '#0f172a';
  const textMuted = isDark ? '#94a3b8' : '#475569';
  const chipBg = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(15, 23, 42, 0.06)';
  const chipBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.14)';

  const isCaps = isProposed && taglineVariant !== 'sentence';
  const isItalic = isProposed && taglineVariant === 'caps_italic';
  const taglineText = isCaps ? 'YOUTUBE AT YOUR SPEED' : 'YouTube at your speed';

  return (
    <div
      className="rounded-xl p-4 border transition-colors"
      style={{
        background: isDark ? '#0f0f0f' : '#ffffff',
        borderColor: isDark ? '#27272a' : '#e2e8f0',
        fontFamily: '"Roboto", "YouTube Sans", Arial, sans-serif',
      }}
    >
      {/* YouTube Player-Below Transport Deck */}
      <div
        className="relative overflow-hidden rounded-[10px] px-3 py-2 flex flex-col gap-1.5 border"
        style={{ background: cardBg, borderColor: cardBorder }}
      >
        {isProposed && showAccentLine && (
          <div
            aria-hidden="true"
            className="absolute top-0 left-0 right-0 h-[2.5px]"
            style={{
              background:
                'linear-gradient(270deg, #dc2626 0%, rgba(220, 38, 38, 0.72) 32%, rgba(220, 38, 38, 0.14) 68%, rgba(220, 38, 38, 0) 100%)',
            }}
          />
        )}
        {/* Row 1: Readout Left + Brand Lockup Right */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-[11px] tabular-nums">
            <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: textPrimary }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Speed:</span>
              <span className="font-bold">{formatSpeed(speed)}×</span>
            </span>
            <span
              className="h-3 w-px"
              style={{
                background: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.18)',
              }}
            />
            <span className="font-medium" style={{ color: isDark ? '#34d399' : '#059669' }}>
              VOD · 4m 12s saved
            </span>
          </div>

          <button
            type="button"
            title="Cadence - YouTube at your speed (Click to open All Cadence Options)"
            className="inline-flex items-center gap-1.5 bg-transparent border-0 p-0 text-[11px] whitespace-nowrap cursor-pointer transition-opacity hover:opacity-100"
          >
            {isProposed ? (
              <>
                <ProposedProgressEmblem size={16} fillPercent={fillPercent} />
                <span
                  className="font-bold tracking-[-0.015em]"
                  style={{ color: isDark ? '#f8fafc' : '#0f172a' }}
                >
                  Cadence
                </span>
                <span
                  aria-hidden="true"
                  className="inline-block w-[1.5px] h-3 rounded-full mx-0.5"
                  style={{ background: '#dc2626' }}
                />
                <span
                  className={
                    isCaps
                      ? `text-[10px] font-semibold tracking-[0.06em] ${isItalic ? 'italic' : ''}`
                      : 'font-medium'
                  }
                  style={{ color: isDark ? '#94a3b8' : '#64748b' }}
                >
                  {taglineText}
                </span>
              </>
            ) : (
              <>
                <CurrentEmblem size={15} />
                <span className="font-bold tracking-[-0.01em]" style={{ color: textPrimary }}>
                  Cadence
                </span>
                <span style={{ color: textMuted, opacity: 0.85 }}>
                  - YouTube at your speed
                </span>
              </>
            )}
          </button>
        </div>

        {/* Row 2: Speed Chips + Fine Stepper + Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1">
            {[1.0, 1.25, 1.5, 1.75, 2.0].map((val) => {
              const active = Math.abs(speed - val) < 0.015;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => onSetSpeed(val)}
                  className="px-2 py-0.5 rounded-[5px] text-[11px] font-semibold border tabular-nums cursor-pointer"
                  style={{
                    background: active ? '#dc2626' : chipBg,
                    borderColor: active ? '#dc2626' : chipBorder,
                    color: active ? '#ffffff' : textPrimary,
                  }}
                >
                  {formatSpeed(val)}×
                </button>
              );
            })}
            <span
              className="mx-1 px-1.5 py-0.5 rounded text-[11px] font-medium border tabular-nums"
              style={{
                background: chipBg,
                borderColor: chipBorder,
                color: textMuted,
              }}
            >
              −0.05× | {formatSpeed(speed)}× | +0.05×
            </span>
          </div>

          <div className="inline-flex items-center gap-1 text-[11px]">
            {['Music 1.0×', 'Educational 1.5×', 'Podcast 2.0×'].map((lbl) => {
              const isEdu = lbl.startsWith('Educational') && Math.abs(speed - 1.5) < 0.015;
              return (
                <span
                  key={lbl}
                  className="px-2 py-0.5 rounded-[5px] border font-medium"
                  style={{
                    background: isEdu ? 'rgba(220, 38, 38, 0.16)' : chipBg,
                    borderColor: isEdu ? 'rgba(220, 38, 38, 0.5)' : chipBorder,
                    color: isEdu ? (isDark ? '#fca5a5' : '#b91c1c') : textMuted,
                  }}
                >
                  {lbl}
                </span>
              );
            })}
            <span
              className="px-2 py-0.5 rounded-[5px] border italic font-medium"
              style={{
                background: 'transparent',
                borderColor: chipBorder,
                color: isDark ? '#fca5a5' : '#b91c1c',
              }}
            >
              Educational @ 1.5×
            </span>
          </div>
        </div>

        {/* Row 3: Seek Capsules */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="inline-flex items-center gap-1">
            {['↺ 60s', '↺ 30s', '↺ 10s'].map((label) => (
              <span
                key={label}
                className="px-2 py-0.5 rounded-full border text-[10.5px] font-medium tabular-nums"
                style={{
                  background: chipBg,
                  borderColor: chipBorder,
                  color: textMuted,
                }}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="inline-flex items-center gap-1">
            {['10s ↻', '30s ↻', '60s ↻'].map((label) => (
              <span
                key={label}
                className="px-2 py-0.5 rounded-full border text-[10.5px] font-medium tabular-nums"
                style={{
                  background: chipBg,
                  borderColor: chipBorder,
                  color: textMuted,
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Simulated YouTube Video Title Underneath */}
      <div
        className="mt-2.5 text-[15px] font-semibold tracking-tight"
        style={{ color: textPrimary }}
      >
        Why Low-Thrust Ion Trajectories Spiral Instead of Hohmann Transfer
      </div>
    </div>
  );
};

export const BrandComparisonLab: React.FC = () => {
  const [taglineVariant, setTaglineVariant] = useState<TaglineVariant>('caps_italic');
  const [showAccentLine, setShowAccentLine] = useState<boolean>(true);
  const [popupPlaybackState, setPopupPlaybackState] = useState<PopupPlaybackState>('active');
  const [toolbarTheme, setToolbarTheme] = useState<ToolbarTheme>('dark');
  const [fillPercent, setFillPercent] = useState<number>(45);

  const [selectedPreset, setSelectedPreset] = useState<'music' | 'educational' | 'podcast'>(
    'educational'
  );
  const [speed, setSpeed] = useState<number>(1.5);
  const [toggles, setToggles] = useState({
    stop: true,
    shorts: true,
    previews: true,
  });

  const handleSelectPreset = (
    preset: 'music' | 'educational' | 'podcast',
    nextSpeed: number
  ) => {
    setSelectedPreset(preset);
    setSpeed(nextSpeed);
  };

  const handleStepSpeed = (delta: number) => {
    setSpeed((prev) => Math.round(Math.min(4.0, Math.max(0.25, prev + delta)) * 100) / 100);
  };

  const handleToggle = (key: 'stop' | 'shorts' | 'previews') => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const proposedIsCaps = taglineVariant !== 'sentence';
  const proposedIsItalic = taglineVariant === 'caps_italic';
  const proposedTaglineOptions = proposedIsCaps
    ? 'YOUTUBE AT YOUR SPEED'
    : 'YouTube at your speed';

  return (
    <div className="space-y-8">
      {/* Lab Header & Live Controls */}
      <section className="rounded-xl border border-slate-800 bg-[#0F1624] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div>
            <h1 className="text-xl font-bold text-slate-50 font-display">
              Branding Side-by-Side Preview — Legacy v1.6.2 vs. Shipped v{EXTENSION_VERSION}
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Live HTML comparison pairing the 45%-progress emblem,{' '}
              <span className="text-slate-200 font-medium">ALL CAPS Italic</span> tagline, and
              fading Cadence-red accent line shipped in v{EXTENSION_VERSION} against the prior
              v1.6.2 branding.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Tagline typography selector */}
            <div className="inline-flex rounded-lg border border-slate-700/80 bg-[#0B0F19] p-1">
              <button
                type="button"
                onClick={() => setTaglineVariant('sentence')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  taglineVariant === 'sentence'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Sentence
              </button>
              <button
                type="button"
                onClick={() => setTaglineVariant('caps')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  taglineVariant === 'caps'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                ALL CAPS
              </button>
              <button
                type="button"
                onClick={() => setTaglineVariant('caps_italic')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold italic transition-colors cursor-pointer ${
                  taglineVariant === 'caps_italic'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                ALL CAPS Italic
              </button>
            </div>

            {/* Popup active/idle toggle */}
            <div className="inline-flex rounded-lg border border-slate-700/80 bg-[#0B0F19] p-1">
              <button
                type="button"
                onClick={() => setPopupPlaybackState('active')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  popupPlaybackState === 'active'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Popup: Active
              </button>
              <button
                type="button"
                onClick={() => setPopupPlaybackState('idle')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  popupPlaybackState === 'idle'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                Popup: Idle
              </button>
            </div>

            {/* YouTube Dark/Light toggle */}
            <div className="inline-flex rounded-lg border border-slate-700/80 bg-[#0B0F19] p-1">
              <button
                type="button"
                onClick={() => setToolbarTheme('dark')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  toolbarTheme === 'dark'
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                YT Dark
              </button>
              <button
                type="button"
                onClick={() => setToolbarTheme('light')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  toolbarTheme === 'light'
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                YT Light
              </button>
            </div>
          </div>
        </div>

        {/* Emblem Progress Bar Fill & Option 2 Accent Line Controls */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3 text-xs text-slate-300">
              <span className="font-semibold text-slate-200">
                Emblem Progress Fill:
              </span>
              <input
                type="range"
                min={15}
                max={85}
                step={5}
                value={fillPercent}
                onChange={(e) => setFillPercent(Number(e.target.value))}
                className="accent-red-600 cursor-pointer w-36"
              />
              <span className="font-mono text-slate-400 tabular-nums w-9">{fillPercent}%</span>
            </div>

            <div className="h-4 w-px bg-slate-800 hidden sm:block" />

            <button
              type="button"
              role="switch"
              aria-checked={showAccentLine}
              onClick={() => setShowAccentLine((prev) => !prev)}
              className="inline-flex items-center gap-2.5 text-xs cursor-pointer group"
            >
              <span className="font-semibold text-slate-200 group-hover:text-white transition-colors">
                Fading Red Accent Line
                <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                  (Option 2)
                </span>
              </span>
              <span
                className="relative inline-block w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: showAccentLine ? '#dc2626' : '#334155' }}
              >
                <span
                  className="absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white transition-transform"
                  style={{
                    transform: showAccentLine ? 'translateX(16px)' : 'translateX(0)',
                  }}
                />
              </span>
              <span
                className={`text-[11px] font-semibold uppercase tracking-wide ${
                  showAccentLine ? 'text-red-400' : 'text-slate-500'
                }`}
              >
                {showAccentLine ? 'On' : 'Off'}
              </span>
            </button>
          </div>

          <span className="text-xs text-slate-500">
            Interactive controls inside both popups and toolbars work live for direct comparison.
          </span>
        </div>
      </section>

      {/* 1. Emblem Scale Comparison */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
            01. Emblem Comparison Across Sizes (16px Toolbar → 128px Store)
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Current Emblem Sizes */}
          <div className="rounded-xl border border-slate-800 bg-[#111827] p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
              Legacy v1.6.2 — Play + Vertical Pause Bar
            </div>
            <div className="flex flex-wrap items-end gap-6">
              {[16, 20, 32, 48, 84].map((sz) => (
                <div key={sz} className="flex flex-col items-center gap-2">
                  <CurrentEmblem size={sz} />
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {sz}px
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Proposed Emblem Sizes */}
          <div className="rounded-xl border border-red-900/50 bg-[#111827] p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-4">
              Option 3 Baseline — Play + Partially Filled Video Progress Bar
            </div>
            <div className="flex flex-wrap items-end gap-6">
              {[16, 20, 32, 48, 84].map((sz) => (
                <div key={sz} className="flex flex-col items-center gap-2">
                  <ProposedProgressEmblem size={sz} fillPercent={fillPercent} />
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {sz}px
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Options Page Header Side-by-Side */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          02. Options Page Header (options.html)
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Current Options Header */}
          <div className="rounded-xl border border-slate-800 bg-[#0b0f19] p-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-4">
              Legacy v1.6.2
            </div>
            <div className="flex items-end justify-between gap-4 flex-wrap pb-5 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-[9px] flex-wrap mb-2">
                  <CurrentEmblem size={26} />
                  <span className="text-[25px] font-bold text-slate-50 tracking-[-0.01em] leading-none">
                    Cadence
                  </span>
                  <span className="text-[16px] font-medium text-slate-400">
                    - YouTube at your speed
                  </span>
                  <span className="text-[13px] font-medium text-slate-400 tabular-nums">
                    · v{EXTENSION_VERSION}
                  </span>
                </div>
                <p className="text-[13px] text-slate-400 leading-relaxed max-w-md">
                  Configure category speed profiles, manage per-channel playback rules, or
                  import and back up your personal subscriptions as JSON.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1.5 rounded-md border border-slate-700 bg-[#111827] text-xs font-semibold text-slate-300">
                  Import JSON
                </span>
                <span className="px-2.5 py-1.5 rounded-md border border-slate-700 bg-[#111827] text-xs font-semibold text-slate-300">
                  Backup JSON
                </span>
                <span className="px-2.5 py-1.5 rounded-md bg-amber-500 text-xs font-bold text-slate-950">
                  ☕ Buy Me a Coffee
                </span>
              </div>
            </div>
          </div>

          {/* Proposed Options Header */}
          <div className="rounded-xl border border-red-900/50 bg-[#0b0f19] p-6">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-red-400 mb-4">
              Proposed — Option 3 Baseline{showAccentLine ? ' + Red Accent Line' : ''}
            </div>
            <div
              className={`relative flex items-end justify-between gap-4 flex-wrap pb-5 ${
                showAccentLine ? '' : 'border-b border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center gap-3.5 mb-2.5">
                  <ProposedProgressEmblem size={44} fillPercent={fillPercent} />
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-2.5">
                      <span className="text-[27px] font-bold text-slate-50 tracking-[-0.02em] leading-none">
                        Cadence
                      </span>
                      <span className="text-[13px] font-medium text-slate-400 tabular-nums">
                        · v{EXTENSION_VERSION}
                      </span>
                    </div>
                    <span
                      className={
                        proposedIsCaps
                          ? `text-[11.5px] font-semibold tracking-[0.11em] text-slate-400 mt-1.5 ${
                              proposedIsItalic ? 'italic' : ''
                            }`
                          : 'text-[14.5px] font-medium text-slate-400 mt-1'
                      }
                    >
                      {proposedTaglineOptions}
                    </span>
                  </div>
                </div>
                <p className="text-[13px] text-slate-400 leading-relaxed max-w-md">
                  Configure category speed profiles, manage per-channel playback rules, or
                  import and back up your personal subscriptions as JSON.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1.5 rounded-md border border-slate-700 bg-[#111827] text-xs font-semibold text-slate-300">
                  Import JSON
                </span>
                <span className="px-2.5 py-1.5 rounded-md border border-slate-700 bg-[#111827] text-xs font-semibold text-slate-300">
                  Backup JSON
                </span>
                <span className="px-2.5 py-1.5 rounded-md bg-amber-500 text-xs font-bold text-slate-950">
                  ☕ Buy Me a Coffee
                </span>
              </div>
              {showAccentLine && (
                <div
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg, #dc2626 0%, rgba(220, 38, 38, 0.72) 45%, rgba(220, 38, 38, 0.16) 80%, rgba(220, 38, 38, 0) 100%)',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Toolbar Popup Side-by-Side (Exact 356px width) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          03. Extension Toolbar Popup (popup.html · 356px Exact Width)
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-800 bg-[#0F1624] p-6 flex flex-col items-center">
            <div className="w-full text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-5">
              Legacy v1.6.2
            </div>
            <PopupLiveCard
              variant="current"
              taglineVariant={taglineVariant}
              showAccentLine={false}
              playbackState={popupPlaybackState}
              fillPercent={fillPercent}
              selectedPreset={selectedPreset}
              speed={speed}
              toggles={toggles}
              onSelectPreset={handleSelectPreset}
              onStepSpeed={handleStepSpeed}
              onToggle={handleToggle}
            />
          </div>

          <div className="rounded-xl border border-red-900/50 bg-[#0F1624] p-6 flex flex-col items-center">
            <div className="w-full text-[11px] font-semibold uppercase tracking-wider text-red-400 mb-5">
              Proposed — Option 3 Baseline{showAccentLine ? ' + Red Accent Line' : ''}
            </div>
            <PopupLiveCard
              variant="proposed"
              taglineVariant={taglineVariant}
              showAccentLine={showAccentLine}
              playbackState={popupPlaybackState}
              fillPercent={fillPercent}
              selectedPreset={selectedPreset}
              speed={speed}
              toggles={toggles}
              onSelectPreset={handleSelectPreset}
              onStepSpeed={handleStepSpeed}
              onToggle={handleToggle}
            />
          </div>
        </div>
      </section>

      {/* 4. Below-Video YouTube Toolbar Side-by-Side */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          04. Below-Video YouTube Toolbar ({toolbarTheme === 'dark' ? 'Dark' : 'Light'} Mode)
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Legacy v1.6.2
            </div>
            <VideoToolbarCard
              variant="current"
              taglineVariant={taglineVariant}
              showAccentLine={false}
              theme={toolbarTheme}
              fillPercent={fillPercent}
              speed={speed}
              onSetSpeed={setSpeed}
            />
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
              Proposed — Option 3 Baseline{showAccentLine ? ' + Red Accent Line' : ''}
            </div>
            <VideoToolbarCard
              variant="proposed"
              taglineVariant={taglineVariant}
              showAccentLine={showAccentLine}
              theme={toolbarTheme}
              fillPercent={fillPercent}
              speed={speed}
              onSetSpeed={setSpeed}
            />
          </div>
        </div>
      </section>
    </div>
  );
};
