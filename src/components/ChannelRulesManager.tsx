import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Download,
  Gauge,
  ListVideo,
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
  SavedTimeByDay,
  SavedTimeDisplayMode,
} from '../types/extension';
import {
  EXTENSION_VERSION,
  normalizeHandle,
  resolveRuleSpeed,
} from '../data/initialData';
import {
  formatSavedDurationCompact,
  formatSavedDurationFull,
  getMonthWeeklySeries,
  getTodaySavedSec,
  getWeekDailySeries,
  sumSavedTimeMap,
} from '../utils/savedTimeAnalytics';
import { SavedTimeAnalytics } from './SavedTimeAnalytics';

interface ChannelRulesManagerProps {
  settings: ExtensionSettings;
  presets: CategoryPreset[];
  rules: ChannelRule[];
  totalTimeSavedSec: number;
  savedTimeByDay: SavedTimeByDay;
  timeSavedSince?: number;
  onResetTimeSaved: () => void;
  onRestoreSavedTimeData?: (nextByDay: SavedTimeByDay, nextTotalSec: number, nextSince?: number) => void;
  onUpdatePresetSpeed: (id: Exclude<CategoryPresetId, 'custom'>, speed: number) => void;
  onUpdateSettings: (patch: Partial<ExtensionSettings>) => void;
  onAddRule: (rule: Omit<ChannelRule, 'id' | 'updatedAt'>) => void;
  onImportRules: (importedRules: ChannelRule[]) => void;
  onResetSampleRules: () => void;
  onUpdateRule: (id: string, patch: Partial<ChannelRule>) => void;
  onDeleteRule: (id: string) => void;
}

type PanelId = '01' | '02' | '03' | '04';
type SortOption = 'recent' | 'name' | 'speed';
type PageSizeOption = 10 | 25 | 50 | 'all';

function formatSpeed(speed: number): string {
  return speed.toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
}

export const ChannelRulesManager: React.FC<ChannelRulesManagerProps> = ({
  settings,
  presets,
  rules,
  totalTimeSavedSec,
  savedTimeByDay,
  timeSavedSince,
  onResetTimeSaved,
  onRestoreSavedTimeData,
  onUpdatePresetSpeed,
  onUpdateSettings,
  onAddRule,
  onImportRules,
  onResetSampleRules,
  onUpdateRule,
  onDeleteRule,
}) => {
  // All four panels start collapsed on Page Open so every section + summary fits in one view
  const [expandedPanels, setExpandedPanels] = useState<Record<PanelId, boolean>>({
    '01': false,
    '02': false,
    '03': false,
    '04': false,
  });

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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const togglePanel = (id: PanelId) => {
    setExpandedPanels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allExpanded =
    expandedPanels['01'] &&
    expandedPanels['02'] &&
    expandedPanels['03'] &&
    expandedPanels['04'];

  const handleToggleExpandAll = () => {
    const nextVal = !allExpanded;
    setExpandedPanels({
      '01': nextVal,
      '02': nextVal,
      '03': nextVal,
      '04': nextVal,
    });
  };

  const popupDisplayMode: SavedTimeDisplayMode =
    settings.popupTimeSavedDisplay || 'daily';
  const barDisplayMode: SavedTimeDisplayMode =
    settings.barTimeSavedDisplay || 'daily';

  const todaySec = useMemo(() => getTodaySavedSec(savedTimeByDay), [savedTimeByDay]);
  const thisWeekSummary = useMemo(
    () => getWeekDailySeries(savedTimeByDay, 0),
    [savedTimeByDay]
  );
  const thisMonthSummary = useMemo(
    () => getMonthWeeklySeries(savedTimeByDay, 0),
    [savedTimeByDay]
  );

  // Summaries for collapsed panels
  const activeControlLabels = useMemo(() => {
    const active: string[] = [];
    if (settings.perChannelSpeedEnabled) active.push('Per-Channel Speed');
    if (settings.stopAfterVideoEnds) active.push('Autoplay Stop');
    if (settings.showInPageControlBar) active.push('Speed Bar');
    if (settings.convertShortsToWatch !== false) active.push('Shorts Redirect');
    if (settings.disableVideoPreviews !== false) active.push('Previews Blocked');
    if (settings.showWatchLaterRemoveAction !== false) active.push('Watch Later Remove');
    return active;
  }, [settings]);

  const ruleCategoryCounts = useMemo(() => {
    const counts = { music: 0, educational: 0, podcast: 0, custom: 0 };
    for (const r of rules) {
      counts[r.presetId] = (counts[r.presetId] || 0) + 1;
    }
    return counts;
  }, [rules]);

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
        version: EXTENSION_VERSION,
        exportedAt: new Date().toISOString(),
        settings,
        presets,
        rules,
        totalTimeSavedSec,
        timeSavedSince,
        savedTimeByDay,
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

      if (
        onRestoreSavedTimeData &&
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        const nextByDay: SavedTimeByDay = {};
        if (parsed.savedTimeByDay && typeof parsed.savedTimeByDay === 'object') {
          for (const [k, v] of Object.entries(parsed.savedTimeByDay)) {
            const num = Math.max(0, Math.floor(Number(v) || 0));
            if (/^\d{4}-\d{2}-\d{2}$/.test(k) && num > 0) {
              nextByDay[k] = num;
            }
          }
        }
        const incomingTotal =
          typeof parsed.totalTimeSavedSec === 'number' && parsed.totalTimeSavedSec >= 0
            ? Math.floor(parsed.totalTimeSavedSec)
            : sumSavedTimeMap(nextByDay);
        const incomingSince =
          typeof parsed.timeSavedSince === 'number' &&
          Number.isFinite(parsed.timeSavedSince) &&
          parsed.timeSavedSince > 0
            ? Math.floor(parsed.timeSavedSince)
            : undefined;
        if (incomingTotal > 0 || Object.keys(nextByDay).length > 0 || incomingSince !== undefined) {
          onRestoreSavedTimeData(
            nextByDay,
            Math.max(incomingTotal, sumSavedTimeMap(nextByDay)),
            incomingSince
          );
        }
      }
    } catch {
      // Ignore malformed JSON files safely
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });

    return result;
  }, [rules, searchQuery, filterCategory, sortBy, presets, settings.defaultSpeed]);

  const totalFilteredCount = filteredAndSortedRules.length;
  const numericPageSize = pageSize === 'all' ? totalFilteredCount || 1 : pageSize;
  const totalPages =
    pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalFilteredCount / numericPageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = pageSize === 'all' ? 0 : (safeCurrentPage - 1) * numericPageSize;
  const endIndex =
    pageSize === 'all'
      ? totalFilteredCount
      : Math.min(totalFilteredCount, startIndex + numericPageSize);
  const paginatedRules = useMemo(() => {
    return filteredAndSortedRules.slice(startIndex, endIndex);
  }, [filteredAndSortedRules, startIndex, endIndex]);

  const formatReadoutModeLabel = (mode: SavedTimeDisplayMode) =>
    mode === 'total' ? 'Total' : mode === 'daily' ? 'Daily' : 'Off';

  const popupReadoutLabel = formatReadoutModeLabel(popupDisplayMode);
  const barReadoutLabel = formatReadoutModeLabel(barDisplayMode);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-800/90">
        <div className="max-w-2xl">
          <div className="text-xs font-mono tabular-nums text-slate-400 mb-1">
            Cadence Options Prototype · v{EXTENSION_VERSION}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 [text-wrap:balance]">
            Channel Speed Rules &amp; Playback Settings
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            All four sections start compact for an instant overview—expand any panel to configure
            controls, inspect Option A saved-time graphs, or edit your channel library.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleToggleExpandAll}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800/90 border border-slate-700 rounded-lg hover:bg-slate-700/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {allExpanded ? (
              <>
                <ChevronsDownUp className="w-3.5 h-3.5 text-slate-300" />
                Collapse All
              </>
            ) : (
              <>
                <ChevronsUpDown className="w-3.5 h-3.5 text-slate-300" />
                Expand All
              </>
            )}
          </button>

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

      {/* Panel 01: Playback & Feed Controls */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl px-5 py-4 transition-colors hover:border-slate-700/80">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            aria-expanded={expandedPanels['01']}
            onClick={() => togglePanel('01')}
            className="flex-1 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0 cursor-pointer group"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-red-500 shrink-0" />
                <h2 className="text-base font-bold text-slate-100 group-hover:text-white transition-colors">
                  01. Playback &amp; Feed Controls
                </h2>
              </div>
              {!expandedPanels['01'] && (
                <p className="text-xs text-slate-400 mt-1 truncate">
                  <span className="font-mono tabular-nums text-slate-200 font-semibold">
                    {activeControlLabels.length}/6
                  </span>{' '}
                  active
                  {activeControlLabels.length > 0 && (
                    <>
                      {' · '}
                      {activeControlLabels.slice(0, 4).join(' · ')}
                      {activeControlLabels.length > 4
                        ? ` · +${activeControlLabels.length - 4} more`
                        : ''}
                    </>
                  )}
                </p>
              )}
            </div>
          </button>

          <button
            type="button"
            aria-expanded={expandedPanels['01']}
            onClick={() => togglePanel('01')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-[#0B0F19] border border-slate-800 hover:border-slate-600 hover:bg-slate-800/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{expandedPanels['01'] ? 'Collapse' : 'Expand'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                expandedPanels['01'] ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {expandedPanels['01'] && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-5 mt-4 border-t border-slate-800">
            <label className="flex items-start justify-between gap-3 p-3.5 bg-[#0B0F19] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  Per-Channel Playback Speed
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Automatically applies saved target speeds when navigating to subscribed channels.
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

            <label className="flex items-start justify-between gap-3 p-3.5 bg-[#0B0F19] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  Stop Playback After Video Ends
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Strictly pauses at video completion; blocks auto-advance in Watch Later &amp; creator playlists.
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

            <label className="flex items-start justify-between gap-3 p-3.5 bg-[#0B0F19] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  Show Speed Bar Below Video
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Mounts the full-width Cadence speed, skip capsules &amp; time deck directly above video titles.
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

            <label className="flex items-start justify-between gap-3 p-3.5 bg-[#0B0F19] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  Convert Shorts to Standard Player
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Automatically opens YouTube Shorts in the full desktop watch player with timeline controls.
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

            <label className="flex items-start justify-between gap-3 p-3.5 bg-[#0B0F19] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  Disable Video Previews
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Blocks thumbnail hover previews on Home, Search, and Feeds while preserving creator featured trailers.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.disableVideoPreviews !== false}
                onChange={(e) =>
                  onUpdateSettings({ disableVideoPreviews: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-3.5 bg-[#0B0F19] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors cursor-pointer">
              <div>
                <div className="text-sm font-semibold text-slate-200">
                  Show &ldquo;Remove from Watch Later&rdquo; on Video End
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Displays the Watch Later removal action on the end-of-video overlay when watching from Watch Later.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.showWatchLaterRemoveAction !== false}
                onChange={(e) =>
                  onUpdateSettings({ showWatchLaterRemoveAction: e.target.checked })
                }
                className="mt-0.5 w-4 h-4 accent-red-600 rounded cursor-pointer shrink-0"
              />
            </label>
          </div>
        )}
      </section>

      {/* Panel 02: Saved Time & Historical Analytics (Option A Prototype + Popup Readout Setting) */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl px-5 py-4 transition-colors hover:border-slate-700/80">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            aria-expanded={expandedPanels['02']}
            onClick={() => togglePanel('02')}
            className="flex-1 text-left min-w-0 cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
              <h2 className="text-base font-bold text-slate-100 group-hover:text-white transition-colors">
                02. Saved Time &amp; Historical Analytics
              </h2>
            </div>
            {!expandedPanels['02'] && (
              <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums truncate">
                <span className="text-emerald-400 font-semibold">
                  {formatSavedDurationFull(totalTimeSavedSec)}
                </span>{' '}
                lifetime ·{' '}
                <span className="text-emerald-400 font-semibold">
                  {formatSavedDurationCompact(todaySec)}
                </span>{' '}
                today ·{' '}
                <span className="text-emerald-400 font-semibold">
                  {formatSavedDurationCompact(thisWeekSummary.totalSec)}
                </span>{' '}
                this week ·{' '}
                <span className="text-emerald-400 font-semibold">
                  {formatSavedDurationCompact(thisMonthSummary.totalSec)}
                </span>{' '}
                this month · Popup: <span className="text-slate-200">{popupReadoutLabel}</span> · Bar:{' '}
                <span className="text-slate-200">{barReadoutLabel}</span>
              </p>
            )}
          </button>

          <button
            type="button"
            aria-expanded={expandedPanels['02']}
            onClick={() => togglePanel('02')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-[#0B0F19] border border-slate-800 hover:border-slate-600 hover:bg-slate-800/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{expandedPanels['02'] ? 'Collapse' : 'Expand'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                expandedPanels['02'] ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {expandedPanels['02'] && (
          <div className="mt-4 border-t border-slate-800">
            <SavedTimeAnalytics
              totalTimeSavedSec={totalTimeSavedSec}
              savedTimeByDay={savedTimeByDay}
              timeSavedSince={timeSavedSince}
              popupDisplayMode={popupDisplayMode}
              barDisplayMode={barDisplayMode}
              onChangePopupDisplayMode={(mode) =>
                onUpdateSettings({ popupTimeSavedDisplay: mode })
              }
              onChangeBarDisplayMode={(mode) =>
                onUpdateSettings({ barTimeSavedDisplay: mode })
              }
              onResetTimeSaved={onResetTimeSaved}
              onRestoreSampleHistory={onRestoreSavedTimeData}
            />
          </div>
        )}
      </section>

      {/* Panel 03: Category Playback Profiles */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl px-5 py-4 transition-colors hover:border-slate-700/80">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            aria-expanded={expandedPanels['03']}
            onClick={() => togglePanel('03')}
            className="flex-1 text-left min-w-0 cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-sky-400 shrink-0" />
              <h2 className="text-base font-bold text-slate-100 group-hover:text-white transition-colors">
                03. Category Playback Profiles
              </h2>
            </div>
            {!expandedPanels['03'] && (
              <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums truncate">
                {presets
                  .map((p) => {
                    const short =
                      p.id === 'music'
                        ? 'Music'
                        : p.id === 'educational'
                          ? 'Educational'
                          : 'Podcast';
                    return `${short} ${formatSpeed(p.speed)}×`;
                  })
                  .join(' · ')}{' '}
                · Unlisted Default {formatSpeed(settings.defaultSpeed)}×
              </p>
            )}
          </button>

          <button
            type="button"
            aria-expanded={expandedPanels['03']}
            onClick={() => togglePanel('03')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-[#0B0F19] border border-slate-800 hover:border-slate-600 hover:bg-slate-800/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{expandedPanels['03'] ? 'Collapse' : 'Expand'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                expandedPanels['03'] ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {expandedPanels['03'] && (
          <div className="mt-4 pt-5 border-t border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800/80">
              <p className="text-xs text-slate-400">
                Updating a category speed automatically updates every channel assigned to that profile.
              </p>
              <div className="flex items-center gap-2.5 text-xs text-slate-300 shrink-0">
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
                      defaultSpeed: Math.min(
                        4.0,
                        Math.max(0.25, Number(e.target.value) || 1.0)
                      ),
                    })
                  }
                  className="w-20 px-2.5 py-1 bg-[#0B0F19] border border-slate-700 rounded-md font-mono text-xs font-semibold tabular-nums text-right text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800">
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
                      <h3 className="text-sm font-semibold text-slate-100">
                        {preset.label}
                      </h3>
                      <span className="text-lg font-mono font-bold tabular-nums text-slate-100">
                        {formatSpeed(preset.speed)}×
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {preset.description}
                    </p>
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
          </div>
        )}
      </section>

      {/* Panel 04: Per-Channel Speed Rules */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl px-5 py-4 transition-colors hover:border-slate-700/80">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            aria-expanded={expandedPanels['04']}
            onClick={() => togglePanel('04')}
            className="flex-1 text-left min-w-0 cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <ListVideo className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-base font-bold text-slate-100 group-hover:text-white transition-colors">
                04. Per-Channel Speed Rules
              </h2>
            </div>
            {!expandedPanels['04'] && (
              <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums truncate">
                <span className="text-slate-200 font-semibold">{rules.length}</span> saved{' '}
                {rules.length === 1 ? 'rule' : 'rules'} · {ruleCategoryCounts.music} Music ·{' '}
                {ruleCategoryCounts.educational} Educational · {ruleCategoryCounts.podcast} Podcast
                {ruleCategoryCounts.custom > 0 ? ` · ${ruleCategoryCounts.custom} Custom` : ''}
              </p>
            )}
          </button>

          <button
            type="button"
            aria-expanded={expandedPanels['04']}
            onClick={() => togglePanel('04')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-[#0B0F19] border border-slate-800 hover:border-slate-600 hover:bg-slate-800/80 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{expandedPanels['04'] ? 'Collapse' : 'Expand'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                expandedPanels['04'] ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {expandedPanels['04'] && (
          <div className="mt-4 pt-5 border-t border-slate-800 space-y-6">
            {/* Add New Channel Form */}
            <form
              onSubmit={handleCreateRule}
              className="grid grid-cols-1 sm:grid-cols-12 gap-3 pb-6 border-b border-slate-800"
            >
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Channel Name
                </label>
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
                  onChange={(e) =>
                    handlePresetSelectionInForm(e.target.value as CategoryPresetId)
                  }
                  className="w-full px-3 py-2 text-sm bg-[#0B0F19] border border-slate-700/90 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="music">
                    Music ({formatSpeed(presets.find((p) => p.id === 'music')?.speed ?? 1.0)}×)
                  </option>
                  <option value="educational">
                    Educational (
                    {formatSpeed(presets.find((p) => p.id === 'educational')?.speed ?? 1.5)}×)
                  </option>
                  <option value="podcast">
                    Podcast / Lecture (
                    {formatSpeed(presets.find((p) => p.id === 'podcast')?.speed ?? 2.0)}×)
                  </option>
                  <option value="custom">Custom Speed</option>
                </select>
              </div>

              <div className="sm:col-span-2 flex items-end gap-2">
                {selectedPreset === 'custom' && (
                  <div className="w-20 shrink-0">
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Speed
                    </label>
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

            {/* Controls Bar: Search, Category Pills, Sort, and Page Size */}
            <div className="space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
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

                <div className="text-xs text-slate-400 font-mono tabular-nums">
                  {totalFilteredCount === 0 ? (
                    '0 rules found'
                  ) : (
                    <>
                      Showing{' '}
                      <span className="font-semibold text-slate-200">
                        {startIndex + 1}–{endIndex}
                      </span>{' '}
                      of{' '}
                      <span className="font-semibold text-slate-200">
                        {totalFilteredCount}
                      </span>{' '}
                      {totalFilteredCount === 1 ? 'rule' : 'rules'}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Rules Table */}
            {totalFilteredCount === 0 ? (
              <div className="py-12 text-center border-t border-slate-800">
                <p className="text-sm font-medium text-slate-200">
                  No matching channel rules found
                </p>
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
                        const effectiveSpeed = resolveRuleSpeed(
                          rule,
                          presets,
                          settings.defaultSpeed
                        );
                        return (
                          <tr
                            key={rule.id}
                            className="hover:bg-slate-800/40 transition-colors"
                          >
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
                                <option value="educational">
                                  Educational &amp; Explainer
                                </option>
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
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (pageNum) => (
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
                        )
                      )}
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
          </div>
        )}
      </section>
    </div>
  );
};
