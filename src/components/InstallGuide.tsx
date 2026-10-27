import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { EXTENSION_VERSION } from '../data/initialData';

interface InstallGuideProps {
  ruleCount: number;
  onDownloadZip: () => void;
  onNavigateToRules: () => void;
}

export const InstallGuide: React.FC<InstallGuideProps> = ({
  ruleCount,
  onDownloadZip,
  onNavigateToRules,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);

  const copyExtensionsUrl = async () => {
    try {
      await navigator.clipboard.writeText('chrome://extensions');
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div className="space-y-10">
      <div className="pb-6 border-b border-slate-800/90">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 [text-wrap:balance]">
          Load or Update Your Extension in Chrome
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-400">
          Install Cadence{' '}
          <span className="font-mono tabular-nums text-slate-200">v{EXTENSION_VERSION}</span> using
          Chrome’s unpacked extension loader. Pull updates with{' '}
          <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
            git pull
          </code>{' '}
          and click Reload on{' '}
          <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
            chrome://extensions
          </code>
          —Cadence cleanly retires prior listeners and preserves your saved channel rules.
        </p>
      </div>

      {/* Standalone /extension Repository Folder vs Custom .zip Export */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <h2 className="text-base font-bold text-slate-100">
            Cloning from GitHub? Load the Standalone /extension Folder Directly
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            This repository includes a ready-to-load unpacked Chrome extension in{' '}
            <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
              /extension
            </code>{' '}
            seeded with 4 sample channel rules. Point Chrome’s{' '}
            <strong className="text-slate-200">Load unpacked</strong> button directly at{' '}
            <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
              /extension
            </code>
            , then use <strong className="text-slate-200">Import JSON</strong> /{' '}
            <strong className="text-slate-200">Backup JSON</strong> on the Chrome Options page to
            manage your personal subscriptions privately.
          </p>
        </div>
        <button
          type="button"
          onClick={onDownloadZip}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center cursor-pointer tabular-nums"
        >
          <Download className="w-3.5 h-3.5" />
          Download v{EXTENSION_VERSION} (.zip)
        </button>
      </div>

      {/* 4-Step Installation Sequence */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-xl divide-y divide-slate-800">
        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <h2 className="text-base font-bold text-slate-100">
              01. Use /extension From Git or Export a Custom .zip
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Either clone the repository and use its{' '}
              <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
                /extension
              </code>{' '}
              directory directly, or download{' '}
              <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
                cadence-youtube-extension.zip
              </code>{' '}
              and unzip it into a permanent folder (with your {ruleCount} currently active{' '}
              {ruleCount === 1 ? 'rule' : 'rules'} preloaded).
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onNavigateToRules}
              className="px-3.5 py-2 text-xs font-semibold text-slate-200 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Edit Channels First
            </button>
            <button
              type="button"
              onClick={onDownloadZip}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download .zip
            </button>
          </div>
        </div>

        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <h2 className="text-base font-bold text-slate-100">
              02. Open Chrome Extensions &amp; Enable Developer Mode
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Paste{' '}
              <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
                chrome://extensions
              </code>{' '}
              into a new Chrome tab’s address bar, then toggle on{' '}
              <strong className="text-slate-200">Developer mode</strong> in the top-right corner
              of the page.
            </p>
          </div>
          <button
            type="button"
            onClick={copyExtensionsUrl}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center cursor-pointer"
          >
            {copiedUrl ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Copied URL
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy chrome://extensions
              </>
            )}
          </button>
        </div>

        <div className="p-6 space-y-1">
          <h2 className="text-base font-bold text-slate-100">
            03. Click “Load Unpacked” &amp; Select the Unzipped Folder
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
            Click the <strong className="text-slate-200">Load unpacked</strong> button in the
            top-left toolbar and choose the unzipped folder containing{' '}
            <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
              manifest.json
            </code>
            . Pin the Cadence icon in Chrome’s puzzle-piece extensions menu for quick toolbar
            access.
          </p>
        </div>

        <div className="p-6 space-y-1">
          <h2 className="text-base font-bold text-slate-100">
            04. Open Any YouTube Watch Page or Playlist
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
            Cadence automatically attaches to open YouTube tabs via{' '}
            <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
              chrome.scripting
            </code>
            , detects the active channel, applies its saved playback speed, renders both the
            toolbar popup controls and below-video speed + remaining-time bar, and stops playback
            cleanly when any video finishes—even inside Watch Later (
            <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
              list=WL
            </code>
            ) or saved creator playlists.
          </p>
        </div>
      </div>

      {/* Technical Architecture Summary */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-xl p-6">
        <h2 className="text-base font-bold text-slate-100 pb-4 border-b border-slate-800">
          How Cadence Solves YouTube’s Tricky Edge Cases
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 text-sm text-slate-400 leading-relaxed">
          <div className="space-y-1.5">
            <h3 className="font-semibold text-slate-100">
              Zero-Lag Pre-Navigation Lock &amp; Self-Clearing Session Bar
            </h3>
            <p>
              Cadence captures video card channel hints on click, resets YouTube’s persistent{' '}
              <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
                &lt;video&gt;
              </code>{' '}
              rate and toolbar badge when returning to YouTube Home, enforces target speeds on{' '}
              <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
                loadstart
              </code>{' '}
              within milliseconds, shows real-time remaining duration at your active speed, and
              automatically clears session override badges whenever playback returns to baseline.
            </p>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-slate-100">
              Stopping Watch Later &amp; Saved Playlists
            </h3>
            <p>
              YouTube’s native Autoplay toggle is ignored inside Watch Later and creator playlists.
              Cadence disables{' '}
              <code className="font-mono text-xs text-slate-200 bg-slate-800/80 px-1.5 py-0.5 rounded">
                yt-playlist-manager
              </code>{' '}
              auto-advance and pauses the player right before the automatic end-of-video transition
              fires—while still allowing manual clicks on the Next button or playlist sidebar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
