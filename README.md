# Cadence — Per-Channel Speed & Playlist Stop for YouTube

**Cadence** is a Manifest V3 Chrome Extension (plus an interactive dark-mode web workbench) engineered around two high-impact improvements to YouTube:

1. **Automatic Per-Channel Playback Speeds**: Assign channels to reusable category profiles—such as **Music (`1.0×`)**, **Educational (`1.5×`)**, or **Podcast / Lecture (`2.0×`)**—or set any custom speed from `0.25×` to `4.0×`. Whenever a video or live stream from that channel plays, Cadence applies its saved rate automatically (while leaving ads at normal speed) and optionally remembers manual speed adjustments you make in the YouTube player.
2. **Strict End-of-Video Stop (Including Watch Later & Saved Playlists)**: YouTube's native Autoplay toggle does not stop playlist auto-advance inside **Watch Later (`list=WL`)** or saved creator playlists. Cadence disarms `yt-playlist-manager` auto-advance and pauses playback right as the video finishes, presenting a clean **Replay / Play Next / Dismiss** bar while preserving manual **Next (`Shift+N`)** and playlist sidebar clicks.

---

## Repository Structure

```text
├── extension/                  # Standalone Manifest V3 Chrome Extension (Load Unpacked directly!)
│   ├── manifest.json           # Manifest V3 config (storage, tabs, scripting, activeTab)
│   ├── background.js           # Service worker: sample seeding, badge readout & open-tab attach
│   ├── page-bridge.js          # MAIN-world bridge for #movie_player API & playlist stop guard
│   ├── content.js              # ISOLATED-world storage sync, below-video speed bar & popup API
│   ├── content.css             # Adaptive styles for YouTube watch-page bar & end-stop banner
│   ├── popup.html / popup.js   # Dark-mode toolbar popup (presets, quick speeds, ±0.05× stepper)
│   ├── options.html / .js      # Full-tab rule manager with JSON Import, JSON Backup & Reset
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
5. Pin **Cadence** from Chrome's puzzle-piece extensions menu. Any already-open YouTube `/watch` or `/live` tabs attach immediately without needing a page refresh.

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

- **Cross-World Structured Messaging (`page-bridge.js` ↔ `content.js`)**: YouTube's internal player methods (`#movie_player.getPlayerResponse()`, `setPlaybackRate()`, `setAutonavState()`, and `yt-playlist-manager`) live in the page's `MAIN` JavaScript world, whereas `chrome.storage.local` lives in the `ISOLATED` content-script world. Because Chromium strips `CustomEvent.detail` across world boundaries, Cadence communicates via structured `window.postMessage` envelopes paired with a direct DOM metadata fallback (`ytd-watch-metadata #owner`).
- **Zero-Refresh Attachment (`background.js` & `popup.js`)**: On install, update, browser startup, or toolbar icon click, Cadence uses `chrome.scripting` to attach to already-open YouTube `/watch` and `/live` tabs and query live channel metadata immediately.
- **Playlist Stop Guard**: Monitors `timeupdate` near the end of each video (scaled by playback rate) and pauses playback before YouTube's playlist manager advances to the next item—while tracking pointer and keyboard (`Shift+N` / `Shift+P`) intent so manual navigation always works normally.

---

## License

Released under the [MIT License](./LICENSE).
