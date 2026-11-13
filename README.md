# Cadence — Per-Channel Speed & Playlist Stop for YouTube

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install%20v1.5.1-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/cadence-%E2%80%94-per-channel-spe/flocdmlnhefmnkigiihbiloloinpfffe)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-Support%20Cadence-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/jayseatea)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-10b981?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-slate?style=for-the-badge)](./LICENSE)

**Cadence** is a Manifest V3 Chrome Extension (plus an interactive dark-mode web workbench) engineered around high-impact playback control on YouTube:

1. **Automatic Per-Channel Playback Speeds + Full-Width 3-Row Watch Deck**: Assign channels to reusable category profiles—such as **Music (`1.0×`)**, **Educational (`1.5×`)**, or **Podcast / Lecture (`2.0×`)**—or set any custom speed from `0.25×` to `4.0×` via the toolbar popup, Options page, or directly from the watch toolbar's italic 1-click **Rule** slot (`+ Save Rule`, `Update →`, `Clear ×`). Whenever a video starts, Cadence locks in its saved rate within milliseconds, locks speed and skip adjustments during ads (`"Speed locked during ad"` / `"Skip locked during ad"`), and restores any active Session override or Channel Rule automatically when an ad finishes. Mounted full-width directly **above `#title`** inside `ytd-watch-metadata #above-the-fold` (leaving Subscribe, Like, and Share 100% untouched), the 3-row deck includes `0.75×`–`2.0×` quick presets, `±0.05` fine steppers, **10s / 30s / 60s Replay & Skip Ahead capsules**, real-time **remaining duration** (`11m left @ 1.75×`), **VOD wall-clock saved time** (`Saves 6m 09s`), **live broadcast detection** (`● Live`) with `1.0×` live-end clamp, a monotonic **Live DVR catch-up countdown** (`−10m · Live in 10m @ 2.0×`), and a **constant inline warning** (`⚠ Rewind unavailable on this live stream`) during slowed `< 1.0×` playback on rewind-disabled live streams that resets cleanly to `1.0×` on stream catch-up.
2. **Automatic Shorts-to-Watch Conversion (`/shorts/` → `/watch`)**: Enabled by default (with a 1-click toggle in the Extension Popup), Cadence rewrites `<a href*="/shorts/">` feed links to `/watch?v=<id>` in-place and redirects direct or SPA `/shorts/<id>` routes with history-safe `location.replace`—giving every Short a full timeline scrubber, per-channel speed lock, and below-video transport deck without trapping your browser Back button.
3. **Strict End-of-Video Stop (Including Watch Later & Saved Playlists)**: YouTube's native Autoplay toggle does not stop playlist auto-advance inside **Watch Later (`list=WL`)** or saved creator playlists. Cadence disarms `yt-playlist-manager` auto-advance and pauses playback right as the video finishes (automatically bypassed on active live broadcasts), presenting a clean **Replay / Play Next / Dismiss** bar while preserving manual **Next (`Shift+N`)** and playlist sidebar clicks.

---

## Repository Structure

```text
├── CWS.zip                     # Ready-to-upload Chrome/Brave/Edge package (manifest.json at root)
├── Firefox.zip                 # Ready-to-upload Firefox Add-ons (AMO) package (manifest.json at root)
├── PRIVACY.md                  # Store Privacy Policy & permission disclosures
├── extension/                  # Standalone Manifest V3 Chromium Extension (Chrome, Brave, Edge, Opera)
│   ├── manifest.json           # Manifest V3 config (storage, scripting, Chrome 111+)
│   ├── background.js           # Service worker / event page: schema sync, badge readout & tab attach
│   ├── page-bridge.js          # MAIN-world bridge for #movie_player API, seek, Shorts & stop guard
│   ├── content.js              # ISOLATED-world 3-row watch deck above #title, rule slot & popup API
│   ├── content.css             # Light/dark styles for full-width 3-row deck & end-stop banner
│   ├── popup.html / popup.js   # Dark-mode toolbar popup (presets, ±0.05× stepper & 4 core toggles)
│   ├── options.html / .js      # Full-tab rule manager with version readout, JSON Import & Backup
│   └── icons/                  # 16×16, 32×32, 48×48, and 128×128 extension icons
├── extension-firefox/          # Standalone Manifest V3 Firefox 128+ Extension (Load Temporary Add-on)
├── scripts/
│   └── build-extension.ts      # Regenerates /extension, /extension-firefox, CWS.zip & Firefox.zip
├── src/                        # Interactive React + Tailwind dark-mode simulator & rule studio
└── server.ts                   # Express + Vite dev/start server with gitignored local state API
```

---

## Install from the Chrome Web Store

Cadence is published and available directly on the official Chrome Web Store:

👉 **[Install Cadence on the Chrome Web Store](https://chromewebstore.google.com/detail/cadence-%E2%80%94-per-channel-spe/flocdmlnhefmnkigiihbiloloinpfffe)**

- One-click installation and automatic updates.
- Verified Manifest V3 with minimal permissions (`storage`, `scripting`).
- 100% private: zero analytics, zero cookies, zero external trackers.

---

## Install Manually (Developer Mode / Standalone `/extension` Folder)

You can also load Cadence directly from a local clone of this repository without an internet build step:

1. Clone this repository to a permanent folder on your machine:
   ```bash
   git clone <your-repo-url> cadence-youtube
   ```
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left toolbar and select the **`extension/`** directory inside this repository.
5. Pin **Cadence** from Chrome's puzzle-piece extensions menu. Any already-open YouTube `/watch` tabs attach immediately without needing a page refresh.

---

## Privacy & Backing Up Your Channel Rules

Cadence collects **zero user data** and makes **zero external network requests** (see [`PRIVACY.md`](./PRIVACY.md)). Both `/extension` and `CWS.zip` ship with **0 pre-seeded channel rules** so fresh installs start completely clean, while local workbench state in `data/` remains gitignored.

### Backing Up & Restoring Your Personal Rules
Both the **Chrome Extension Options Page** (`All Channel Rules` in the popup) and the **Web Workbench** (`Channel Rules` tab) share the exact same JSON format (`cadence-channel-rules.json`):

- **Save a backup**: Click **Backup JSON** on Chrome's Options page (or in the Web Workbench) to download your `{ presets, rules }` file locally.
- **Restore or transfer**: Click **Import JSON** on any machine to non-destructively merge your personal channel list into Chrome's `chrome.storage.local`.
- **Reset category presets**: Click **Reset Presets** on Chrome's Options page to restore the default `1.0× / 1.5× / 2.0×` category multipliers without affecting saved channels.

---

## Running the Interactive Web Workbench

The repository also includes a full-stack dark-mode workbench for simulating YouTube channel transitions, testing playlist end-of-video stops, editing rules, inspecting Manifest V3 source files, and exporting customized `.zip` bundles.

```bash
# Install dependencies
npm install

# Start the Express + Vite workbench on http://localhost:3000
npm run dev

# Regenerate standalone Chrome (/extension + CWS.zip) and Firefox (/extension-firefox + Firefox.zip) packages
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

## ☕ Support & Donations

Cadence is completely free, open-source, and privacy-first. There are no paywalls, subscriptions, telemetry, or advertisements.

If Cadence saves you time every day, consider buying a coffee to support ongoing maintenance and feature development:

<a href="https://buymeacoffee.com/jayseatea" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="42" width="150" />
</a>

Or support directly via: **[buymeacoffee.com/jayseatea](https://buymeacoffee.com/jayseatea)**

---

## Privacy & License

- **Privacy Policy**: See [`PRIVACY.md`](./PRIVACY.md) — 100% local `chrome.storage.local` storage, zero telemetry, zero remote code.
- **License**: Released under the [MIT License](./LICENSE).
