import React, { useMemo, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import {
  CategoryPreset,
  ChannelRule,
  ExtensionSettings,
} from '../types/extension';
import { buildExtensionFiles } from '../extension/generateExtensionZip';

interface ExtensionCodeViewerProps {
  settings: ExtensionSettings;
  presets: CategoryPreset[];
  rules: ChannelRule[];
  onDownloadZip: () => void;
}

export const ExtensionCodeViewer: React.FC<ExtensionCodeViewerProps> = ({
  settings,
  presets,
  rules,
  onDownloadZip,
}) => {
  const files = useMemo(
    () => buildExtensionFiles(settings, presets, rules),
    [settings, presets, rules]
  );

  const [selectedPath, setSelectedPath] = useState<string>('manifest.json');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const activeFile = files.find((f) => f.path === selectedPath) || files[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopiedPath(activeFile.path);
      window.setTimeout(() => setCopiedPath(null), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-800/90">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 [text-wrap:balance]">
            Manifest V3 Extension Source Files
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
            Inspect every file included in your Chrome extension package. Your {rules.length}{' '}
            persisted channel rules and speed presets are automatically compiled into{' '}
            <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
              background.js
            </code>{' '}
            and{' '}
            <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
              content.js
            </code>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={onDownloadZip}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Download .zip Package
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 bg-[#111827] border border-slate-800/90 rounded-xl overflow-hidden">
        {/* Left File Tree */}
        <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-800 bg-[#0D1320] p-3">
          <div className="px-2.5 py-2 text-xs font-semibold text-slate-400">
            cadence-youtube-extension/
          </div>
          <div className="space-y-0.5 mt-1">
            {files.map((file) => {
              const active = file.path === activeFile.path;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-mono transition-colors cursor-pointer ${
                    active
                      ? 'bg-red-600 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-800/80'
                  }`}
                >
                  <span className="truncate">{file.path}</span>
                  <span
                    className={`text-[11px] tabular-nums ml-2 shrink-0 ${
                      active ? 'text-red-100' : 'text-slate-500'
                    }`}
                  >
                    {file.content.split('\n').length}L
                  </span>
                </button>
              );
            })}
            <div className="px-3 py-2 text-xs font-mono text-slate-500">
              icons/icon16..128.png
            </div>
          </div>
        </div>

        {/* Right Source Inspector */}
        <div className="lg:col-span-9 flex flex-col min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800 bg-[#111827]">
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold text-slate-100">
                {activeFile.path}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{activeFile.description}</p>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedPath === activeFile.path ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy File
                </>
              )}
            </button>
          </div>

          <pre className="p-5 bg-[#090D16] text-slate-200 font-mono text-xs leading-relaxed overflow-x-auto max-h-[580px] overflow-y-auto">
            <code>{activeFile.content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
