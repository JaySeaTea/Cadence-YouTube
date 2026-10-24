import React, { useRef, useState } from 'react';
import { Download, Plus, RotateCcw, Search, Trash2, Upload } from 'lucide-react';
import {
  CategoryPreset,
  CategoryPresetId,
  ChannelRule,
  ExtensionSettings,
} from '../types/extension';
import { normalizeHandle, resolveRuleSpeed } from '../data/initialData';

interface ChannelRulesManagerProps {
  settings: ExtensionSettings;
  presets: CategoryPreset[];
  rules: ChannelRule[];
  onUpdatePresetSpeed: (id: Exclude<CategoryPresetId, 'custom'>, speed: number) => void;
  onUpdateSettings: (patch: Partial<ExtensionSettings>) => void;
  onAddRule: (rule: Omit<ChannelRule, 'id' | 'updatedAt'>) => void;
  onImportRules: (importedRules: ChannelRule[]) => void;
  onResetSampleRules: () => void;
  onUpdateRule: (id: string, patch: Partial<ChannelRule>) => void;
  onDeleteRule: (id: string) => void;
}

function formatSpeed(speed: number): string {
  return speed.toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
}

export const ChannelRulesManager: React.FC<ChannelRulesManagerProps> = ({
  settings,
  presets,
  rules,
  onUpdatePresetSpeed,
  onUpdateSettings,
  onAddRule,
  onImportRules,
  onResetSampleRules,
  onUpdateRule,
  onDeleteRule,
}) => {
  const [channelName, setChannelName] = useState('');
  const [handleInput, setHandleInput] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<CategoryPresetId>('educational');
  const [customSpeed, setCustomSpeed] = useState<number>(1.5);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | CategoryPresetId>('all');
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
  };

  const handleExportJson = () => {
    const payload = JSON.stringify({ presets, rules }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cadence-channel-rules.json';
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

  const filteredRules = rules.filter((r) => {
    const matchesCategory = filterCategory === 'all' || r.presetId === filterCategory;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      r.channelName.toLowerCase().includes(q) ||
      r.handle.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-800/90">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 [text-wrap:balance]">
            Channel Speed Rules &amp; Category Profiles
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
            The base repository ships with 4 sample channel rules while keeping local workspace
            data gitignored. Export or import JSON backups to sync personal subscriptions directly
            with Chrome’s extension options page.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
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

      {/* Category Speed Profiles Grid */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-100">
              01. Category Playback Profiles
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Updating a category speed automatically updates every channel assigned to that
              profile.
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
      </section>

      {/* Add Channel & High-Density Channel Rules Table */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-xl p-6 space-y-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-100">
              02. Per-Channel Speed Rules
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Add channels by name, @handle, or YouTube channel URL. While watching YouTube in
              Chrome, you can also save channels with a single click.
            </p>
          </div>
          <span className="text-xs text-slate-400 tabular-nums shrink-0">
            {rules.length} saved
          </span>
        </div>

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
              placeholder="e.g. NPR Music, 3Blue1Brown, Lex Fridman"
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
              placeholder="e.g. @3blue1brown"
              className="w-full px-3 py-2 text-sm bg-[#0B0F19] border border-slate-700/90 rounded-lg font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Profile
            </label>
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

        {/* Search & Segmented Category Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter saved channels..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-[#0B0F19] border border-slate-700/90 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="inline-flex items-center p-1 bg-[#0B0F19] border border-slate-800 rounded-lg overflow-x-auto">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'music', label: 'Music' },
                { id: 'educational', label: 'Educational' },
                { id: 'podcast', label: 'Podcast' },
                { id: 'custom', label: 'Custom' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterCategory(tab.id)}
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
        </div>

        {/* High-Density Rules Table */}
        {filteredRules.length === 0 ? (
          <div className="py-12 text-center border-t border-slate-800">
            <p className="text-sm font-medium text-slate-200">
              No matching channel rules found
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Add a YouTube channel above or clear your active search filter.
            </p>
            {(searchQuery || filterCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterCategory('all');
                }}
                className="mt-4 px-3.5 py-1.5 text-xs font-semibold text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-slate-800">
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
                {filteredRules.map((rule) => {
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
        )}
      </section>
    </div>
  );
};
