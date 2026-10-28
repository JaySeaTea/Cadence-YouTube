# Cadence — Per-Channel Speed & Playlist Stop for YouTube

**Cadence** (`v1.3.2`) is a Manifest V3 Chrome Extension (plus an interactive dark-mode web workbench) engineered around high-impact playback control on YouTube:

1. **Automatic Per-Channel Playback Speeds + Self-Clearing Session Tweaks**: Assign channels to reusable category profiles—such as **Music (`1.0×`)**, **Educational (`1.5×`)**, or **Podcast / Lecture (`2.0×`)**—or set any custom speed from `0.25×` to `4.0×` via the toolbar popup or Options page. Whenever a video from that channel starts, Cadence locks in its saved rate within milliseconds (while leaving ads at normal speed). Need a temporary single-video speed tweak without altering your saved Channel Rule? Use the **session-only below-video speed bar** (`0.75×`–`2.0×`, `±0.05×`, and **Reset**) beside Subscribe—plus a **real-time remaining duration readout** (`24m left @ 1.5×`) scaled to your active speed, **live broadcast detection** (`● Live`), and a clickable **Live DVR catch-up countdown** (`−10m · Live in 20m @ 1.5×` or `10m behind Live`) that jumps straight back to the live broadcast head. Returning to your channel rule or `1.0×` default by any control automatically clears session override indicators.
2. **Strict End-of-Video Stop (Including Watch Later & Saved Playlists)**: YouTube's native Autoplay toggle does not stop playlist auto-advance inside **Watch Later (`list=WL`)** or saved creator playlists. Cadence disarms `yt-playlist-manager` auto-advance and pauses playback right as the video finishes (automatically bypassed on active live broadcasts), presenting a clean **Replay / Play Next / Dismiss** bar while preserving manual **Next (`Shift+N`)** and playlist sidebar clicks.

---

## Repository Structure

```text
├── extension/                  # Standalone Manifest V3 Chrome Extension (Load Unpacked directly!)
│   ├── manifest.json           # Manifest V3 config (v1.3.2 — storage, tabs, scripting, activeTab)
│   ├── background.js           # Service worker: sample seeding, badge readout & open-tab attach
│   ├── page-bridge.js          # MAIN-world bridge for #movie_player API, live DVR & stop guard
│   ├── content.js              # ISOLATED-world storage sync, below-video speed bar & popup API
│   ├── content.css             # Adaptive styles for YouTube watch-page bar & end-stop banner
│   ├── popup.html / popup.js   # Dark-mode toolbar popup (version readout, presets, ±0.05× stepper)
│   ├── options.html / .js      # Full-tab rule manager with version readout, JSON Import & Backup
│   └── icons/                  # 16×16, 32×32, 48×48, and 128×128 extension icons
├── scripts/
│   └── build-extension.ts      # Regenerates /extension from canonical TypeScript templates
├── src/                        # Interactive React + Tailwind dark-mode simulator & rule studio
└── server.ts                   # Express + Vite dev/start server with gitignored local state API
```

---

## Install in Google Chrome (Standalone `/extension` Folder)

You can load Cadence directly from a cloned copy of this repository—no build step required:

1. Clone this repository to a permanent folder on your machine:
   ```bash
   git clone <your-repo-url> cadence-youtube
   ```
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left toolbar and select the **`extension/`** directory inside this repository.
5. Pin **Cadence** from Chrome's puzzle-piece extensions menu. Any already-open YouTube `/watch` tabs attach immediately without needing a page refresh.

---

## Keeping Your Personal Subscriptions Private

To keep personal YouTube subscriptions out of version control, the repository ships with **4 starter sample rules** (`Velvet Room Sessions`, `Orbital Mechanics Lab`, `The Longform Archive`, and `Systems Craft`) and ignores local workspace data (`data/` in `.gitignore`).

### Backing Up & Restoring Your Personal Rules
Both the **Chrome Extension Options Page** (`All Channel Rules` in the popup) and the **Web Workbench** (`Channel Rules` tab) share the exact same JSON format (`cadence-channel-rules.json`):

- **Save a backup**: Click **Backup JSON** on Chrome's Options page (or in the Web Workbench) to download your `{ presets, rules }` file locally.
- **Restore or transfer**: Click **Import JSON** on any machine to non-destructively merge your personal channel list into Chrome's `chrome.storage.local`.
- **Reset to starter defaults**: Click **Reset Samples** at any time to restore the 4 sample channels.

---

## Running the Interactive Web Workbench

The repository also includes a full-stack dark-mode workbench for simulating YouTube channel transitions, testing playlist end-of-video stops, editing rules, inspecting Manifest V3 source files, and exporting customized `.zip` bundles.

```bash
# Install dependencies
npm install

# Start the Express + Vite workbench on http://localhost:3000
npm run dev

# Regenerate the standalone /extension folder from TypeScript sources
npm run build:extension

# Type-check and build production assets
npm run lint
npm run build
```

---

## How the Manifest V3 Architecture Works

- **Zero-Lag Pre-Navigation Speed Lock (`page-bridge.js` ↔ `content.js`)**: Captures destination `videoId` and channel hints directly from clicked YouTube video cards (`NAVIGATION_PREVIEW`), resets YouTube's persistent `<video>` rate to `1.0×` and clears the toolbar badge immediately when returning to YouTube Home or browse feeds, validates `videoId` parity on `ytd-watch-flexy` so stale DOM nodes are never misread during SPA transitions, and enforces target speeds synchronously on `loadstart`, `loadeddata`, `canplay`, and `playing`.
- **Self-Clearing Session Watch Bar & Remaining Duration**: Speed controls injected beside YouTube's Subscribe button (`#cadence-owner-bar`) and YouTube's native player gear menu adjust a per-video `sessionOverride` by default while displaying real wall-clock remaining duration (`24m left @ 1.5×`). Returning to a channel's saved rule or `1.0×` default by any control clears session override indicators automatically.
- **Zero-Refresh Attachment (`background.js` & `popup.js`)**: On install, update, browser startup, or toolbar icon click, Cadence uses `chrome.scripting` to attach to already-open YouTube `/watch` tabs and query live channel metadata immediately.
- **Playlist Stop Guard**: Monitors `timeupdate` near the end of each video (scaled by playback rate) and pauses playback before YouTube's playlist manager advances to the next item—while tracking pointer and keyboard (`Shift+N` / `Shift+P`) intent so manual navigation always works normally.

---

## Release Backlog & GitHub Issue Forms

This repository includes structured GitHub Issue Forms in `.github/ISSUE_TEMPLATE/` so you can collect bugs and enhancement ideas over time and ship them together in batches:

- **Bug Report** (`bug` label): Dropdowns for the exact YouTube surface (`Watch`, `Watch Later`, `Creator Playlist`, `Shorts`, `Popup`, `Options`) plus URL and error/screenshot fields.
- **Feature / Enhancement** (`enhancement` label): Checkboxes for target surfaces (`Background`, `Below-Video Bar`, `Popup`, `Keyboard Shortcut`, `Options`) and a **Batch Priority** selector (`Next Release Batch`, `Soon`, `Someday`).

---

## License

Released under the [MIT License](./LICENSE).
