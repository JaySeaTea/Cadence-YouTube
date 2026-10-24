# Changelog

All notable changes to **Cadence — Per-Channel Speed & Playlist Stop for YouTube** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-10-23

### Fixed
- **Orphaned Content Script Lifecycle on Reload / Folder Swap**: Fixed `Uncaught (in promise) Error: Extension context invalidated.` on `chrome://extensions` when reloading, disabling, or replacing the unpacked extension while YouTube watch tabs are open. Added synchronous `chrome.runtime.id` context validation around all `chrome.runtime` and `chrome.storage` calls, automatic `AbortController` listener self-teardown for retired script instances, and clean DOM/MAIN-world handover for `#cadence-owner-bar` and `page-bridge.js`.

## [1.1.0] - 2026-10-23

### Added
- **Standalone `/extension` Unpacked Directory**: Added a complete, git-tracked Manifest V3 Chrome extension directory (`/extension`) with prebuilt `16×16`, `32×32`, `48×48`, and `128×128` PNG icons (`npm run build:extension`) so Chrome's **Load unpacked** can point directly at the repository folder.
- **Zero-Refresh Tab Attachment & Live Probing**: Added `scripting` and `activeTab` permissions with automatic attachment in `background.js` and an on-demand `chrome.scripting.executeScript` fallback in `popup.js` so already-open YouTube tabs are detected immediately without refreshing.
- **YouTube Live Stream & Playlist Detection**: Expanded URL and DOM channel extraction across `/watch`, `/watch?v=...&list=...`, and `/live/...` routes.
- **Full Toolbar Popup Speed Controls**: Upgraded `popup.html` and `popup.js` with 1-click Category Presets (`Music 1.0×`, `Educational 1.5×`, `Podcast 2.0×`), Quick Speeds (`1.0×`–`2.0×`), and a Fine Speed Stepper (`±0.05×` up to `4.0×`).
- **Chrome Options Page JSON Import & Backup**: Added **Import JSON**, **Backup JSON**, and **Reset Samples** actions to `options.html` / `options.js`, fully compatible with the web workbench's `cadence-channel-rules.json` format.
- **Privacy-Clean Base Defaults**: Scoped repository defaults in both `/extension` and the web workbench to 4 starter sample rules while gitignoring runtime `data/` files so personal YouTube subscriptions are never committed to Git.

### Fixed
- **Cross-World Event Serialization**: Replaced `CustomEvent.detail` cross-world messaging (which Chrome nullifies across `MAIN` and `ISOLATED` worlds) with structured `window.postMessage` envelopes plus a direct DOM channel reader fallback in `content.js`.

## [1.0.0] - 2026-10-23

### Added
- **Per-Channel Playback Speed Engine**: Automatically detects the active YouTube channel (`channelId`, `@handle`, or channel name) and applies its saved category profile or custom playback rate (`0.25×`–`4.0×`), while skipping ads (`ad-showing`).
- **Automatic Manual Speed Memory**: Listens for intentional user speed changes inside YouTube's player and remembers that playback speed for future videos from the same channel.
- **Strict End-of-Video & Playlist Stop**: Suppresses YouTube Up Next autoplay, `yt-playlist-manager` auto-advance inside **Watch Later (`list=WL`)** and saved creator playlists, and pauses playback cleanly at the end of every video with an on-player **Replay / Play Next / Dismiss** banner.
- **Below-Video Speed Control Bar**: Injects a compact speed selector beside the Subscribe button on YouTube watch pages.
- **Interactive Dark-Mode Web Workbench**: Built a React + Express simulation studio, channel rules manager, source inspector, and `.zip` packager styled in native dark slate (`#0B0F19`).
