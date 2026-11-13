import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Filter,
  Plus,
  RotateCcw,
  Search,
  Sliders,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  CategoryPreset,
  CategoryPresetId,
  ChannelRule,
  ExtensionSettings,
} from '../types/extension';
import {
  EXTENSION_VERSION,
  normalizeHandle,
  resolveRuleSpeed,
} from '../data/initialData';

interface ChannelRulesManagerProps {
  settings: ExtensionSettings;
  presets: CategoryPreset[];
  rules: ChannelRule[];
  totalTimeSavedSec: number;
  onResetTimeSaved: () => void;
  onUpdatePresetSpeed: (id: Exclude<CategoryPresetId, 'custom'>, speed: number) => void;
  onUpdateSettings: (patch: Partial<ExtensionSettings>) => void;
  onAddRule: (rule: Omit<ChannelRule, 'id' | 'updatedAt'>) => void;
  onImportRules: (importedRules: ChannelRule[]) => void;
  onResetSampleRules: () => void;
  onUpdateRule: (id: string, patch: Partial<ChannelRule>) => void;
  onDeleteRule: (id: string) => void;
}

type SortOption = 'recent' | 'name' | 'speed';
type PageSizeOption = 10 | 25 | 50 | 'all';

function formatSpeed(speed: number): string {
  return speed.toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
}

function formatFullSavedTime(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export const ChannelRulesManager: React.FC<ChannelRulesManagerProps> = ({
  settings,
  presets,
  rules,
  totalTimeSavedSec,
  onResetTimeSaved,
  onUpdatePresetSpeed,
  onUpdateSettings,
  onAddRule,
  onImportRules,
  onResetSampleRules,
  onUpdateRule,
  onDeleteRule,
}) => {
  // Add Rule form state
  const [channelName, setChannelName] = useState('');
  const [handleInput, setHandleInput] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<CategoryPresetId>('educational');
  const [customSpeed, setCustomSpeed] = useState<number>(1.5);

  // Search & Filter state (Issue #26)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | CategoryPresetId>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Time saved reset confirmation state (Issue #24)
  const [isResetBoxOpen, setIsResetBoxOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [resetSuccessNotice, setResetSuccessNotice] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handlePresetSelectionInForm = (presetId: CategoryPresetId) => {
    setSelectedPreset(presetId);
    if (presetId !== 'custom') {
      const found = presets.find((p) => p.id === presetId);
      if (found) setCustomSpeed(found.speed);
    }
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = channelName.trim();
    if (!trimmedName) return;

    const normalizedHandle = handleInput.trim()
      ? normalizeHandle(handleInput)
      : normalizeHandle(trimmedName);

    onAddRule({
      channelName: trimmedName,
      handle: normalizedHandle,
      channelId: '',
      presetId: selectedPreset,
      customSpeed: Math.min(4.0, Math.max(0.25, Number(customSpeed) || 1.0)),
    });

    setChannelName('');
    setHandleInput('');
    setCurrentPage(1);
  };

  const handleExportJson = () => {
    const payload = JSON.stringify(
      {
        version: 5,
        exportedAt: new Date().toISOString(),
        settings,
        presets,
        rules,
        totalTimeSavedSec,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence-backup-v${EXTENSION_VERSION}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.rules)
          ? parsed.rules
          : [];
      const sanitized: ChannelRule[] = list
        .filter((item: unknown) => typeof item === 'object' && item !== null)
        .map((item: Record<string, unknown>, i: number) => ({
          id: typeof item.id === 'string' ? item.id : `imported-${Date.now()}-${i}`,
          channelName: String(item.channelName || 'Unnamed Channel'),
          handle: normalizeHandle(String(item.handle || item.channelName || '')),
          channelId: typeof item.channelId === 'string' ? item.channelId : '',
          presetId:
            item.presetId === 'music' ||
            item.presetId === 'educational' ||
            item.presetId === 'podcast' ||
            item.presetId === 'custom'
              ? item.presetId
              : 'custom',
          customSpeed: Math.min(4.0, Math.max(0.25, Number(item.customSpeed) || 1.0)),
          updatedAt: new Date().toISOString().slice(0, 10),
        }));
      if (sanitized.length > 0) {
        onImportRules(sanitized);
      }
    } catch {
      // Ignore malformed JSON files safely
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExecuteResetCounter = () => {
    if (resetConfirmInput.trim() !== 'Forget Time Saved') return;
    onResetTimeSaved();
    setIsResetBoxOpen(false);
    setResetConfirmInput('');
    setResetSuccessNotice(true);
    setTimeout(() => setResetSuccessNotice(false), 3500);
  };

  // Filtered and Sorted Rules
  const filteredAndSortedRules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const result = rules.filter((r) => {
      const matchesCategory = filterCategory === 'all' || r.presetId === filterCategory;
      const matchesSearch =
        !q ||
        r.channelName.toLowerCase().includes(q) ||
        r.handle.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });

    result.sort((a, b) => {
      if (sortBy === 'name') {
        return a.channelName.localeCompare(b.channelName, undefined, { sensitivity: 'base' });
      }
      if (sortBy === 'speed') {
        const speedA = resolveRuleSpeed(a, presets, settings.defaultSpeed);
        const speedB = resolveRuleSpeed(b, presets, settings.defaultSpeed);
        return speedB - speedA;
      }
      // 'recent' (default)
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });

    return result;
  }, [rules, searchQuery, filterCategory, sortBy, presets, settings.defaultSpeed]);

  const totalFilteredCount = filteredAndSortedRules.length;
  const numericPageSize = pageSize === 'all' ? totalFilteredCount || 1 : pageSize;
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalFilteredCount / numericPageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = pageSize === 'all' ? 0 : (safeCurrentPage - 1) * numericPageSize;
  const endIndex =
    pageSize === 'all'
      ? totalFilteredCount
      : Math.min(totalFilteredCount, startIndex + numericPageSize);
  const paginatedRules = useMemo(() => {
    return filteredAndSortedRules.slice(startIndex, endIndex);
  }, [filteredAndSortedRules, startIndex, endIndex]);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-800/90">
        <div className="max-w-2xl">
          <div className="text-xs font-mono tabular-nums text-slate-400 mb-1.5">
            Cadence Options · v{EXTENSION_VERSION}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 [text-wrap:balance]">
            Channel Speed Rules &amp; Playback Settings
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
            Configure automatic channel playback speeds, feed controls, and lifetime time saved.
            Export or import JSON backups to sync personal subscriptions directly across browser installs.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 bg-[#111827] border border-slate-700/90 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import JSON
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 bg-[#111827] border border-slate-700/90 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Backup JSON
          </button>
          <button
            type="button"
            onClick={onResetSampleRules}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 bg-[#111827] border border-slate-700/90 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Samples
          </button>
        </div>
      </div>

      {/* Panel 01: Playback & Feed Controls (Issue #23) */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl p-6">
        <div className="pb-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-red-500" />
            <h2 className="text-base font-bold text-slate-100">01. Playback &amp; Feed Controls</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Global extension behavior for YouTube watch pages, playlists, video feeds, and thumbnail previews.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-5">
          <label className="flex items-start justify-between gap-3 p-3.5 bg-[#0B0F19] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
            <div>
              <div className="text-sm font-semibold text-slate-200">Per-Channel Playback Speed</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Automatically applies saved target speeds when navigating to subscribed channels.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.perChannelSpeedEnabled}
              onChange={(e) => onUpdateSettings({ perChannelSpeedEnabled: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
            />
          </label>

          <label className="flex items-start justify-between gap-3 p-3.5 bg-[#0B0F19] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
            <div>
              <div className="text-sm font-semibold text-slate-200">Stop Playback After Video Ends</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Strictly pauses at video completion; blocks auto-advance in Watch Later &amp; creator playlists.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.stopAfterVideoEnds}
              onChange={(e) => onUpdateSettings({ stopAfterVideoEnds: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
            />
          </label>

          <label className="flex items-start justify-between gap-3 p-3.5 bg-[#0B0F19] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
            <div>
              <div className="text-sm font-semibold text-slate-200">Show Speed Bar Below Video</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Mounts the full-width Cadence speed, skip capsules &amp; time deck directly above video titles.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.showInPageControlBar}
              onChange={(e) => onUpdateSettings({ showInPageControlBar: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
            />
          </label>

          <label className="flex items-start justify-between gap-3 p-3.5 bg-[#0B0F19] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
            <div>
              <div className="text-sm font-semibold text-slate-200">Convert Shorts to Standard Player</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Automatically opens YouTube Shorts in the full desktop watch player with timeline controls.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.convertShortsToWatch !== false}
              onChange={(e) => onUpdateSettings({ convertShortsToWatch: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
            />
          </label>

          {/* Issue #23 Toggle */}
          <label className="md:col-span-2 flex items-start justify-between gap-3 p-3.5 bg-[#0B0F19] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-200">Disable Video Previews</span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-red-950/80 border border-red-700/60 text-red-300 rounded">
                  Updated in v{EXTENSION_VERSION}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Blocks thumbnail video hover previews and animated hover overlays across Home, Search,
                History, Feeds, and Watch Sidebar, while preserving creator featured trailers on /@channel pages.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.disableVideoPreviews !== false}
              onChange={(e) => onUpdateSettings({ disableVideoPreviews: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
            />
          </label>
        </div>
      </section>

      {/* Panel 02: Lifetime Time Saved Stat & Reset Flow (Issue #24) */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-bold text-slate-100">02. Lifetime Time Saved</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Tracks genuine wall-clock time saved by watching videos at accelerated speeds (&gt;1.0×).
            </p>
          </div>

          {!isResetBoxOpen && (
            <button
              type="button"
              onClick={() => setIsResetBoxOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-red-400 bg-[#0B0F19] border border-slate-800 hover:border-red-900/60 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
            >
              Reset Counter
            </button>
          )}
        </div>

        <div className="pt-5 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums tracking-tight text-emerald-400">
              {formatFullSavedTime(totalTimeSavedSec)}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Accrued continuously across accelerated videos · Preserved across restarts and browser sessions.
            </p>
          </div>

          {resetSuccessNotice && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-xs rounded-lg animate-in fade-in">
              <Check className="w-4 h-4 shrink-0" />
              <span>Lifetime time saved has been reset to 0s.</span>
            </div>
          )}
        </div>

        {/* Inline Reset Confirmation (strictly requires typing "Forget Time Saved", no window.prompt/alert) */}
        {isResetBoxOpen && (
          <div className="mt-5 p-4 bg-[#0B0F19] border border-red-900/60 rounded-lg space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 leading-relaxed">
                Resetting your counter will clear your lifetime time-saved metric back to zero. To confirm this action, please type{' '}
                <span className="font-mono font-semibold text-amber-300 select-all">Forget Time Saved</span>{' '}
                in the box below:
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <input
                type="text"
                value={resetConfirmInput}
                onChange={(e) => setResetConfirmInput(e.target.value)}
                placeholder='Type "Forget Time Saved"'
                className="flex-1 px-3 py-1.5 text-xs font-mono bg-[#111827] border border-slate-700 rounded-md text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={resetConfirmInput.trim() !== 'Forget Time Saved'}
                  onClick={handleExecuteResetCounter}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsResetBoxOpen(false);
                    setResetConfirmInput('');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Panel 03: Category Playback Profiles */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-100">03. Category Playback Profiles</h2>
            <p className="text-xs text-slate-400 mt-1">
              Updating a category speed automatically updates every channel assigned to that profile.
            </p>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-slate-300">
            <label htmlFor="default-fallback-speed" className="whitespace-nowrap">
              Unlisted Channel Default:
            </label>
            <input
              id="default-fallback-speed"
              type="number"
              min={0.25}
              max={4.0}
              step={0.05}
              value={settings.defaultSpeed}
              onChange={(e) =>
                onUpdateSettings({
                  defaultSpeed: Math.min(4.0, Math.max(0.25, Number(e.target.value) || 1.0)),
                })
              }
              className="w-20 px-2.5 py-1 bg-[#0B0F19] border border-slate-700 rounded-md font-mono text-xs font-semibold tabular-nums text-right text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800 pt-5">
          {presets.map((preset, idx) => (
            <div
              key={preset.id}
              className={`${
                idx === 0
                  ? 'pb-5 md:pb-0 md:pr-6'
                  : idx === 1
                    ? 'py-5 md:py-0 md:px-6'
                    : 'pt-5 md:pt-0 md:pl-6'
              } flex flex-col justify-between gap-4`}
            >
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">{preset.label}</h3>
                  <span className="text-lg font-mono font-bold tabular-nums text-slate-100">
                    {formatSpeed(preset.speed)}×
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{preset.description}</p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="inline-flex items-center gap-1 flex-wrap">
                  {[1.0, 1.25, 1.5, 1.75, 2.0, 2.5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => onUpdatePresetSpeed(preset.id, val)}
                      className={`px-2 py-1 rounded text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                        Math.abs(preset.speed - val) < 0.02
                          ? 'bg-red-600 text-white font-semibold'
                          : 'bg-[#0B0F19] border border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {formatSpeed(val)}×
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Panel 04: Per-Channel Speed Rules with Issue #26 Pagination, Sorting & Filtering */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl p-6 space-y-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-100">04. Per-Channel Speed Rules</h2>
            <p className="text-xs text-slate-400 mt-1">
              Search, sort, filter, and paginate through your saved channel library.
            </p>
          </div>
          <span className="text-xs text-slate-400 tabular-nums shrink-0">
            {rules.length} saved · v{EXTENSION_VERSION}
          </span>
        </div>

        {/* Add New Channel Form */}
        <form
          onSubmit={handleCreateRule}
          className="grid grid-cols-1 sm:grid-cols-12 gap-3 pb-6 border-b border-slate-800"
        >
          <div className="sm:col-span-4">
            <label className="block text-xs font-medium text-slate-300 mb-1">Channel Name</label>
            <input
              type="text"
              required
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g. Veritasium, 3Blue1Brown, Lex Fridman"
              className="w-full px-3 py-2 text-sm bg-[#0B0F19] border border-slate-700/90 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              @Handle or Channel URL
            </label>
            <input
              type="text"
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              placeholder="e.g. @veritasium"
              className="w-full px-3 py-2 text-sm bg-[#0B0F19] border border-slate-700/90 rounded-lg font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-300 mb-1">Profile</label>
            <select
              value={selectedPreset}
              onChange={(e) => handlePresetSelectionInForm(e.target.value as CategoryPresetId)}
              className="w-full px-3 py-2 text-sm bg-[#0B0F19] border border-slate-700/90 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="music">
                Music ({formatSpeed(presets.find((p) => p.id === 'music')?.speed ?? 1.0)}×)
              </option>
              <option value="educational">
                Educational ({formatSpeed(presets.find((p) => p.id === 'educational')?.speed ?? 1.5)}×)
              </option>
              <option value="podcast">
                Podcast / Lecture ({formatSpeed(presets.find((p) => p.id === 'podcast')?.speed ?? 2.0)}×)
              </option>
              <option value="custom">Custom Speed</option>
            </select>
          </div>

          <div className="sm:col-span-2 flex items-end gap-2">
            {selectedPreset === 'custom' && (
              <div className="w-20 shrink-0">
                <label className="block text-xs font-medium text-slate-300 mb-1">Speed</label>
                <input
                  type="number"
                  min={0.25}
                  max={4.0}
                  step={0.05}
                  value={customSpeed}
                  onChange={(e) => setCustomSpeed(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-[#0B0F19] border border-slate-700/90 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            )}
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Rule
            </button>
          </div>
        </form>

        {/* Issue #26 Controls Bar: Search, Category Pills, Sort, and Page Size */}
        <div className="space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search channel name or handle..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-[#0B0F19] border border-slate-700/90 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sorting & Page Size Selectors */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                <span>Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="px-2 py-1 bg-[#0B0F19] border border-slate-700 rounded-md text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="recent">Recently updated</option>
                  <option value="name">Channel Name A to Z</option>
                  <option value="speed">Speed highest to lowest</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span>Per Page:</span>
                <select
                  value={String(pageSize)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPageSize(val === 'all' ? 'all' : (Number(val) as PageSizeOption));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 bg-[#0B0F19] border border-slate-700 rounded-md text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="10">10 rules</option>
                  <option value="25">25 rules</option>
                  <option value="50">50 rules</option>
                  <option value="all">All</option>
                </select>
              </div>
            </div>
          </div>

          {/* Preset Category Filter Pills */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="inline-flex items-center p-1 bg-[#0B0F19] border border-slate-800 rounded-lg overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'All Channels' },
                  { id: 'music', label: 'Music' },
                  { id: 'educational', label: 'Educational' },
                  { id: 'podcast', label: 'Podcast' },
                  { id: 'custom', label: 'Custom' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setFilterCategory(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    filterCategory === tab.id
                      ? 'bg-slate-800 text-slate-100 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Range Indicator */}
            <div className="text-xs text-slate-400 font-mono tabular-nums">
              {totalFilteredCount === 0 ? (
                '0 rules found'
              ) : (
                <>
                  Showing <span className="font-semibold text-slate-200">{startIndex + 1}–{endIndex}</span> of{' '}
                  <span className="font-semibold text-slate-200">{totalFilteredCount}</span>{' '}
                  {totalFilteredCount === 1 ? 'rule' : 'rules'}
                </>
              )}
            </div>
          </div>
        </div>

        {/* High-Density Rules Table */}
        {totalFilteredCount === 0 ? (
          <div className="py-12 text-center border-t border-slate-800">
            <p className="text-sm font-medium text-slate-200">No matching channel rules found</p>
            <p className="text-xs text-slate-400 mt-1">
              Add a YouTube channel above or reset your active filters.
            </p>
            {(searchQuery || filterCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterCategory('all');
                  setCurrentPage(1);
                }}
                className="mt-4 px-3.5 py-1.5 text-xs font-semibold text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="border-t border-slate-800 pt-2 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400">
                    <th className="py-3 pr-4">Channel</th>
                    <th className="py-3 px-4">Handle</th>
                    <th className="py-3 px-4">Category Profile</th>
                    <th className="py-3 px-4 text-right">Target Speed</th>
                    <th className="py-3 pl-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-sm">
                  {paginatedRules.map((rule) => {
                    const effectiveSpeed = resolveRuleSpeed(rule, presets, settings.defaultSpeed);
                    return (
                      <tr key={rule.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 pr-4 font-semibold text-slate-100 whitespace-nowrap">
                          {rule.channelName}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs text-slate-400 whitespace-nowrap">
                          {rule.handle}
                        </td>
                        <td className="py-2.5 px-4">
                          <select
                            aria-label={`Profile for ${rule.channelName}`}
                            value={rule.presetId}
                            onChange={(e) => {
                              const nextPreset = e.target.value as CategoryPresetId;
                              const found = presets.find((p) => p.id === nextPreset);
                              onUpdateRule(rule.id, {
                                presetId: nextPreset,
                                customSpeed: found ? found.speed : rule.customSpeed,
                              });
                            }}
                            className="px-2.5 py-1 text-xs border border-slate-700 rounded-md bg-[#0B0F19] text-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                          >
                            <option value="music">Music &amp; Performance</option>
                            <option value="educational">Educational &amp; Explainer</option>
                            <option value="podcast">Podcast &amp; Lecture</option>
                            <option value="custom">Custom Speed</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {rule.presetId === 'custom' ? (
                            <input
                              type="number"
                              min={0.25}
                              max={4.0}
                              step={0.05}
                              value={rule.customSpeed}
                              onChange={(e) =>
                                onUpdateRule(rule.id, {
                                  customSpeed: Math.min(
                                    4.0,
                                    Math.max(0.25, Number(e.target.value) || 1.0)
                                  ),
                                })
                              }
                              className="w-20 px-2 py-1 text-right font-mono text-xs font-semibold tabular-nums bg-[#0B0F19] text-slate-100 border border-slate-700 rounded-md"
                            />
                          ) : (
                            <span className="font-mono text-sm font-semibold tabular-nums text-slate-100">
                              {formatSpeed(effectiveSpeed)}×
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pl-4 text-right">
                          <button
                            type="button"
                            onClick={() => onDeleteRule(rule.id)}
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded-md transition-colors cursor-pointer"
                            title={`Remove ${rule.channelName}`}
                            aria-label={`Remove ${rule.channelName}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls (Issue #26) */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#0B0F19] border border-slate-700 rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-[#0B0F19] cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>

                <div className="flex items-center gap-1 overflow-x-auto">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 flex items-center justify-center text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                        safeCurrentPage === pageNum
                          ? 'bg-red-600 text-white'
                          : 'bg-[#0B0F19] border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-[#0B0F19] border border-slate-700 rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-[#0B0F19] cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
