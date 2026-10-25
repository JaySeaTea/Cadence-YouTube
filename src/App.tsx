import React, { useEffect, useRef, useState } from 'react';
import {
  ActiveTab,
  CategoryPreset,
  CategoryPresetId,
  ChannelRule,
  ExtensionEventLog,
  ExtensionSettings,
  SimulatedVideo,
} from './types/extension';
import {
  DEFAULT_PRESETS,
  DEFAULT_SETTINGS,
  INITIAL_CHANNEL_RULES,
} from './data/initialData';
import { downloadExtensionZip } from './extension/generateExtensionZip';
import { SimulatorWorkspace } from './components/SimulatorWorkspace';
import { ChannelRulesManager } from './components/ChannelRulesManager';
import { ExtensionCodeViewer } from './components/ExtensionCodeViewer';
import { InstallGuide } from './components/InstallGuide';

const LEGACY_V1_KEYS = [
  'cadence_ext_settings_v1',
  'cadence_ext_presets_v1',
  'cadence_ext_rules_v1',
  'cadence_ext_updated_at_v1',
];

const STORAGE_KEYS = {
  settings: 'cadence_ext_settings_v2',
  presets: 'cadence_ext_presets_v2',
  rules: 'cadence_ext_rules_v2',
  updatedAt: 'cadence_ext_updated_at_v2',
};

if (typeof window !== 'undefined') {
  try {
    for (const legacyKey of LEGACY_V1_KEYS) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // Ignore storage access errors
  }
}

function currentTimeString(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 8);
}

function mergeRuleLists(primary: ChannelRule[], secondary: ChannelRule[]): ChannelRule[] {
  const merged = [...primary];
  for (const candidate of secondary) {
    const exists = merged.some(
      (r) =>
        (candidate.handle &&
          r.handle &&
          r.handle.toLowerCase() === candidate.handle.toLowerCase()) ||
        r.channelName.toLowerCase() === candidate.channelName.toLowerCase()
    );
    if (!exists) {
      merged.push(candidate);
    }
  }
  return merged;
}

function normalizeSettingsSchema(
  raw: Partial<ExtensionSettings> | undefined
): ExtensionSettings {
  const merged: ExtensionSettings = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if ((raw?.settingsSchemaVersion ?? 1) < 2) {
    merged.autoRememberManualSpeed = false;
    merged.settingsSchemaVersion = 2;
  }
  return merged;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('simulator');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const hadInitialLocalRulesRef = useRef<boolean>(
    typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.rules) !== null
  );
  const userMutatedRef = useRef<boolean>(false);

  const [settings, setSettings] = useState<ExtensionSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.settings);
      return saved ? normalizeSettingsSchema(JSON.parse(saved)) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [presets, setPresets] = useState<CategoryPreset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.presets);
      return saved ? JSON.parse(saved) : DEFAULT_PRESETS;
    } catch {
      return DEFAULT_PRESETS;
    }
  });

  const [rules, setRules] = useState<ChannelRule[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.rules);
      return saved ? JSON.parse(saved) : INITIAL_CHANNEL_RULES;
    } catch {
      return INITIAL_CHANNEL_RULES;
    }
  });

  const [logs, setLogs] = useState<ExtensionEventLog[]>(() => [
    {
      id: 'init-1',
      timestamp: currentTimeString(),
      action: 'Applied 1.5× speed',
      detail: 'Orbital Mechanics Lab (@orbitalmechanics) · Educational & Explainer',
    },
    {
      id: 'init-2',
      timestamp: currentTimeString(),
      action: 'Playlist guard armed',
      detail: 'Watch Later & creator playlist end-of-video auto-advance blocked',
    },
  ]);

  const pushStateToServer = async (
    nextSettings: ExtensionSettings,
    nextPresets: CategoryPreset[],
    nextRules: ChannelRule[]
  ) => {
    try {
      await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: nextSettings,
          presets: nextPresets,
          rules: nextRules,
        }),
      });
    } catch {
      // Offline or local-only fallback still persisted in localStorage
    }
  };

  const markUserMutation = () => {
    userMutatedRef.current = true;
    try {
      localStorage.setItem(STORAGE_KEYS.updatedAt, new Date().toISOString());
    } catch {
      // Ignore storage quota errors
    }
  };

  // Hydrate optional local gitignored runtime state if present without writing personal data by default
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.exists || !data.state) {
          return;
        }

        const srv = data.state;
        const localUpdatedAt = localStorage.getItem(STORAGE_KEYS.updatedAt);

        if (!hadInitialLocalRulesRef.current) {
          if (srv.settings) setSettings(normalizeSettingsSchema(srv.settings));
          if (Array.isArray(srv.presets)) setPresets(srv.presets);
          if (Array.isArray(srv.rules)) setRules(srv.rules);
          if (srv.updatedAt) {
            localStorage.setItem(STORAGE_KEYS.updatedAt, srv.updatedAt);
          }
        } else if (srv.updatedAt && (!localUpdatedAt || srv.updatedAt > localUpdatedAt)) {
          if (srv.settings) setSettings(normalizeSettingsSchema(srv.settings));
          if (Array.isArray(srv.presets)) setPresets(srv.presets);
          if (Array.isArray(srv.rules)) setRules(srv.rules);
          localStorage.setItem(STORAGE_KEYS.updatedAt, srv.updatedAt);
        }
      } catch {
        // Fallback to localStorage seamlessly
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist to localStorage & gitignored runtime state when user makes updates
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
      localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(presets));
      localStorage.setItem(STORAGE_KEYS.rules, JSON.stringify(rules));
    } catch {
      // Ignore storage quota errors
    }

    if (userMutatedRef.current) {
      pushStateToServer(settings, presets, rules);
    }
  }, [settings, presets, rules]);

  const addLog = (action: string, detail: string) => {
    setLogs((prev) => [
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: currentTimeString(),
        action,
        detail,
      },
      ...prev.slice(0, 29),
    ]);
  };

  const handleUpdateSettings = (patch: Partial<ExtensionSettings>) => {
    markUserMutation();
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleUpdatePresetSpeed = (
    id: Exclude<CategoryPresetId, 'custom'>,
    speed: number
  ) => {
    const clean = Math.round(Math.min(4.0, Math.max(0.25, speed)) * 100) / 100;
    markUserMutation();
    setPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, speed: clean } : p))
    );
    addLog(`Updated ${id} profile`, `Category target speed set to ${clean}×`);
  };

  const handleSaveChannelFromSimulator = (
    video: Pick<SimulatedVideo, 'channelName' | 'handle' | 'channelId'>,
    speed: number,
    presetId: CategoryPresetId,
    sourceLabel: string
  ) => {
    markUserMutation();
    setRules((prev) => {
      const idx = prev.findIndex(
        (r) =>
          (video.channelId && r.channelId === video.channelId) ||
          r.handle.toLowerCase() === video.handle.toLowerCase() ||
          r.channelName.toLowerCase() === video.channelName.toLowerCase()
      );
      const updatedRule: ChannelRule = {
        id: idx >= 0 ? prev[idx].id : `rule-${Date.now()}`,
        channelName: video.channelName,
        handle: video.handle,
        channelId: video.channelId,
        presetId,
        customSpeed: speed,
        updatedAt: new Date().toISOString().slice(0, 10),
      };
      if (idx >= 0) {
        const clone = [...prev];
        clone[idx] = updatedRule;
        return clone;
      }
      return [updatedRule, ...prev];
    });
    addLog(
      `Saved ${speed}× for ${video.channelName}`,
      `${video.handle} · ${sourceLabel}`
    );
  };

  const handleAddRule = (newRuleData: Omit<ChannelRule, 'id' | 'updatedAt'>) => {
    markUserMutation();
    setRules((prev) => {
      const existingIdx = prev.findIndex(
        (r) =>
          r.handle.toLowerCase() === newRuleData.handle.toLowerCase() ||
          r.channelName.toLowerCase() === newRuleData.channelName.toLowerCase()
      );
      const entry: ChannelRule = {
        ...newRuleData,
        id: existingIdx >= 0 ? prev[existingIdx].id : `rule-${Date.now()}`,
        updatedAt: new Date().toISOString().slice(0, 10),
      };
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = entry;
        return next;
      }
      return [entry, ...prev];
    });
    addLog(
      `Added channel rule`,
      `${newRuleData.channelName} (${newRuleData.handle})`
    );
  };

  const handleImportRules = (importedRules: ChannelRule[]) => {
    markUserMutation();
    setRules((prev) => mergeRuleLists(importedRules, prev));
    addLog('Imported channel rules', `Merged ${importedRules.length} channel entries`);
  };

  const handleUpdateRule = (id: string, patch: Partial<ChannelRule>) => {
    markUserMutation();
    setRules((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, ...patch, updatedAt: new Date().toISOString().slice(0, 10) }
          : r
      )
    );
  };

  const handleDeleteRule = (id: string) => {
    markUserMutation();
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleResetToSamples = async () => {
    userMutatedRef.current = false;
    setPresets(DEFAULT_PRESETS);
    setRules(INITIAL_CHANNEL_RULES);
    try {
      localStorage.removeItem(STORAGE_KEYS.updatedAt);
    } catch {
      // Ignore storage errors
    }
    try {
      await fetch('/api/state', { method: 'DELETE' });
    } catch {
      // Ignore offline errors
    }
    addLog('Reset to sample rules', 'Restored the 4 starter sample channel rules');
  };

  const handleDownloadZip = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await downloadExtensionZip(settings, presets, rules);
      addLog(
        'Exported Chrome extension (.zip)',
        `Bundled Manifest V3 files with ${rules.length} channel rules`
      );
    } finally {
      setIsExporting(false);
    }
  };

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'simulator', label: 'Live Simulator' },
    { id: 'rules', label: 'Channel Rules' },
    { id: 'code', label: 'Extension Files' },
    { id: 'install', label: 'Install Guide' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F19] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-[#0F1624] border-b border-slate-800/90">
        <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#simulator"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('simulator');
            }}
            className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
          >
            Cadence
          </a>

          {/* Zone 2: 4 clean single-line text navigation links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab(item.id);
                  }}
                  className={`py-0.5 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'text-slate-100 font-semibold underline decoration-red-500 decoration-2 underline-offset-8'
                      : 'hover:text-slate-100 hover:underline hover:underline-offset-8'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={isExporting}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-500 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isExporting ? 'Packaging .zip...' : 'Download Extension (.zip)'}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile View Switcher */}
      <div className="md:hidden bg-[#0F1624] border-b border-slate-800/90 px-4 py-2 overflow-x-auto">
        <div className="flex items-center gap-5 text-xs font-medium text-slate-400">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`py-1 whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === item.id
                  ? 'text-slate-100 font-semibold underline decoration-red-500 decoration-2 underline-offset-4'
                  : 'hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-[1320px] mx-auto px-6 py-8 sm:py-10">
        {activeTab === 'simulator' && (
          <SimulatorWorkspace
            settings={settings}
            presets={presets}
            rules={rules}
            logs={logs}
            onUpdateSettings={handleUpdateSettings}
            onSaveChannelRule={handleSaveChannelFromSimulator}
            onAddLog={addLog}
            onNavigateToRules={() => setActiveTab('rules')}
          />
        )}

        {activeTab === 'rules' && (
          <ChannelRulesManager
            settings={settings}
            presets={presets}
            rules={rules}
            onUpdatePresetSpeed={handleUpdatePresetSpeed}
            onUpdateSettings={handleUpdateSettings}
            onAddRule={handleAddRule}
            onImportRules={handleImportRules}
            onResetSampleRules={handleResetToSamples}
            onUpdateRule={handleUpdateRule}
            onDeleteRule={handleDeleteRule}
          />
        )}

        {activeTab === 'code' && (
          <ExtensionCodeViewer
            settings={settings}
            presets={presets}
            rules={rules}
            onDownloadZip={handleDownloadZip}
          />
        )}

        {activeTab === 'install' && (
          <InstallGuide
            ruleCount={rules.length}
            onDownloadZip={handleDownloadZip}
            onNavigateToRules={() => setActiveTab('rules')}
          />
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-slate-800/90 bg-[#0F1624] mt-12">
        <div className="max-w-[1320px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <span>Cadence for YouTube · Manifest V3 Chrome Extension</span>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className="hover:text-slate-100 transition-colors cursor-pointer"
            >
              Inspect Source
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('install')}
              className="hover:text-slate-100 transition-colors cursor-pointer"
            >
              Chrome Setup Steps
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
