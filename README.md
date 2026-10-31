# Cadence — Per-Channel Speed & Playlist Stop for YouTube

**Cadence** (`v1.4.1`) is a Manifest V3 Chrome Extension (plus an interactive dark-mode web workbench) engineered around high-impact playback control on YouTube:

1. **Automatic Per-Channel Playback Speeds + Full-Width 3-Row Watch Deck**: Assign channels to reusable category profiles—such as **Music (`1.0×`)**, **Educational (`1.5×`)**, or **Podcast / Lecture (`2.0×`)**—or set any custom speed from `0.25×` to `4.0×` via the toolbar popup, Options page, or directly from the watch toolbar's italic 1-click **Rule** slot (`+ Save Rule`, `Update →`, `Clear ×`). Whenever a video starts, Cadence locks in its saved rate within milliseconds, locks speed and skip adjustments during ads (`"Speed locked during ad"` / `"Skip locked during ad"`), and restores any active Session override or Channel Rule automatically when an ad finishes. Mounted full-width directly **above `#title`** inside `ytd-watch-metadata #above-the-fold` (leaving Subscribe, Like, and Share 100% untouched), the 3-row deck includes `0.75×`–`2.0×` quick presets, `±0.05` fine steppers, **10s / 30s / 60s Replay & Skip Ahead capsules**, real-time **remaining duration** (`11m left @ 1.75×`), **VOD wall-clock saved time** (`Saves 6m 09s`), **live broadcast detection** (`● Live`) with `1.0×` live-end clamp, and a monotonic **Live DVR catch-up countdown** (`−10m · Live in 10m @ 2.0×`).
2. **Automatic Shorts-to-Watch Conversion (`/shorts/` → `/watch`)**: Enabled by default (with a 1-click toggle in the Extension Popup), Cadence rewrites `<a href*="/shorts/">` feed links to `/watch?v=<id>` in-place and redirects direct or SPA `/shorts/<id>` routes with history-safe `location.replace`—giving every Short a full timeline scrubber, per-channel speed lock, and below-video transport deck without trapping your browser Back button.
3. **Strict End-of-Video Stop (Including Watch Later & Saved Playlists)**: YouTube's native Autoplay toggle does not stop playlist auto-advance inside **Watch Later (`list=WL`)** or saved creator playlists. Cadence disarms `yt-playlist-manager` auto-advance and pauses playback right as the video finishes (automatically bypassed on active live broadcasts), presenting a clean **Replay / Play Next / Dismiss** bar while preserving manual **Next (`Shift+N`)** and playlist sidebar clicks.

---

## Repository Structure

```text
├── extension/                  # Standalone Manifest V3 Chrome Extension (Load Unpacked directly!)
│   ├── manifest.json           # Manifest V3 config (v1.4.1 — storage, tabs, scripting, activeTab)
│   ├── background.js           # Service worker: v3 schema sync, badge readout & open-tab attach
│   ├── page-bridge.js          # MAIN-world bridge for #movie_player API, seek, Shorts & stop guard
│   ├── content.js              # ISOLATED-world 3-row watch deck above #title, rule slot & popup API
│   ├── content.css             # Light/dark styles for full-width 3-row deck & end-stop banner
│   ├── popup.html / popup.js   # Dark-mode toolbar popup (presets, ±0.05× stepper & Shorts toggle)
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

- **Zero-Lag Pre-Navigation Speed Lock & Shorts Conversion (`page-bridge.js` ↔ `content.js`)**: Captures destination `videoId` and channel hints directly from clicked YouTube video and Shorts cards (`NAVIGATION_PREVIEW`), rewrites `<a href*="/shorts/">` anchors in-place and redirects `/shorts/<id>` routes with history-safe `location.replace`, resets YouTube's persistent `<video>` rate to `1.0×` and clears the toolbar badge immediately on non-watch routes, validates `videoId` parity on `ytd-watch-flexy`, and enforces target speeds synchronously on `loadstart`, `loadeddata`, `canplay`, and `playing`.
- **Full-Width 3-Row Watch Deck Above `#title`**: Mounted at the top of `ytd-watch-metadata #above-the-fold` (`#cadence-watch-bar`) so YouTube's `#owner` and `#actions` rows never squeeze. Combines collision-aware `ResizeObserver` brand collapse, `0.75×`–`2.0×` session speed presets, grouped 10s/30s/60s Replay & Skip capsules, VOD wall-clock remaining & saved time, and a 1-click italic Channel Rule slot.
- **Zero-Refresh Attachment (`background.js` & `popup.js`)**: On install, update, browser startup, or toolbar icon click, Cadence uses `chrome.scripting` to attach to already-open YouTube tabs and query live channel metadata immediately.
- **Playlist Stop Guard**: Monitors `timeupdate` near the end of each video (scaled by playback rate) and pauses playback before YouTube's playlist manager advances to the next item—while tracking pointer and keyboard (`Shift+N` / `Shift+P`) intent so manual navigation always works normally.

---

## Release Backlog & GitHub Issue Forms

This repository includes structured GitHub Issue Forms in `.github/ISSUE_TEMPLATE/` so you can collect bugs and enhancement ideas over time and ship them together in batches:

- **Bug Report** (`bug` label): Dropdowns for the exact YouTube surface (`Watch`, `Watch Later`, `Creator Playlist`, `Shorts`, `Popup`, `Options`) plus URL and error/screenshot fields.
- **Feature / Enhancement** (`enhancement` label): Checkboxes for target surfaces (`Background`, `Below-Video Bar`, `Popup`, `Keyboard Shortcut`, `Options`) and a **Batch Priority** selector (`Next Release Batch`, `Soon`, `Someday`).

---

## License

Released under the [MIT License](./LICENSE).
