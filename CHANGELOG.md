# Changelog

All notable changes to **Cadence — Per-Channel Speed & Playlist Stop for YouTube** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.4] - 2026-10-28

### Added
- **Floating Amber Live-End Toast on Below-Video Toolbar**: Clicking any speed above `1.0×` (`1.25×`–`2.0×` or `+0.05` at `1.0×`) on the below-video speed bar while synced at the live broadcast head (`● Live`) now displays a floating amber warning toast (`"Stream is currently at live end"`) anchored directly above the toolbar alongside the upper-right video player warning toast, matching the toolbar popup's amber notice without shifting page layout.
- **Subtle Live-End Dimming for `> 1.0×` Toolbar Controls**: Subtly dimmed speed chips above `1.0×` (`1.25×`, `1.5×`, `1.75×`, `2.0×`) and `+0.05` (when at `1.0×`) on the below-video toolbar while synced at `● Live` (`aria-disabled="true"` with explanatory tooltip), keeping them clickable to surface the live-end notice while restoring full contrast immediately when behind live.

### Fixed
- **Watch-Page `#movie_player` Toast Targeting & Bridge Fallback**: Scoped `#movie_player` lookups to `ytd-watch-flexy #movie_player` across `content.js`, `page-bridge.js`, and `popup.js` so hidden `ytd-video-preview` hover players never intercept upper-right player corner toasts, and added a direct live-badge fallback plus MAIN-world `SET_SPEED` live-head block event so live-end feedback never misses on newly opened streams.

## [1.3.3] - 2026-10-28

### Added
- **Live-End `1.0×` Speed Lock & Toast Notification (#13)**: Blocked speed increases above `1.0×` whenever a live broadcast is synced at the live head (`● Live`) across the below-video speed bar, Extension Toolbar Popup, YouTube player gear menu / `Shift+>` shortcuts, and Web Workbench—displaying `"Stream is currently at live end"` while keeping playback, bar chips, and toolbar badge at `1.0×`. Speeds below `1.0×` remain available to drift into DVR, and saved Channel Rules above `1.0×` clamp non-destructively at the live head and restore automatically when behind live.

### Fixed
- **Reset Active Speed & Badge to `1.0×` After Jump to Live (#11)**: Cleared `> 1.0×` session speed overrides and resynced the below-video speed bar, popup readout, and Chrome toolbar badge back to `1.0×` whenever returning to the live head via Cadence's catch-up pill, YouTube's native `.ytp-live-badge` (`LIVE` button), scrubbing the timeline slider to the live edge, or catching up organically at elevated speed.
- **Accurate Behind-Live DVR Lag Across Pause, Resume & System Sleep (#12)**: Replaced stale post-pause `.ytp-live-badge` / `getProgressState().seekableEnd` reads with a monotonic `Date.now()` wall-clock live-head anchor (`liveAnchorVideoSec + elapsedSec`) gated by advancing `seekableEnd` ticks so pausing at `Live` and resuming minutes later immediately reflects true lag and pressing Play while behind live never dips to a stale buffered horizon (`3m → 38s → 3m`). Added hidden-tab timer gating, display-bucket message deduplication, and `visibilitychange` / OS sleep-wake DVR window cap reconciliation.

## [1.3.2] - 2026-10-27

### Fixed
- **Eliminated `1h behind Live` MSE Duration Artifact on Live Stream Refresh (#10)**: Stopped reading `HTMLMediaElement.seekable.end()` on finite-duration MSE live streams (where Chromium reports `mediaSource.duration = liveEdge + 3600s`), honored `.ytp-live-badge` / `getProgressState().isAtLiveHead` unconditionally when synced at the broadcast head, calibrated a wall-clock live-head anchor cross-checked against `getProgressState().seekableEnd - current`, `video.buffered`, and `.ytp-time-current` negative DVR offsets, and guarded `JUMP_TO_LIVE` fallback seeks from MSE forward duration ceilings.
- **Speed-Adjusted Live DVR Catch-Up Readout & Rate Persistence (#10)**: Updated `#movie_player.setPlaybackRate()` ordering so YouTube's internal SABR/MSE live controller engages fast catch-up rates without snapping fine `0.05×` steps or resetting configured DVR speeds via internal `1.0×` `ratechange` events; enabled immediate catch-up calculation while paused or playing using Cadence's effective speed; and displayed explicit lag alongside catch-up time (`−10m · Live in 20m @ 1.5×`, `−10m · Live in 10m @ 2×`) so buffer offset and speed-adjusted catch-up duration are both clear at every playback rate.

## [1.3.1] - 2026-10-27

### Added
- **Live Broadcast Indicator & Real-Time `"Back to Live"` Catch-Up Countdown (#10)**: Added active live broadcast telemetry to the below-video speed bar: shows **`● Live`** when synced at the broadcast head, a real-time wall-clock catch-up countdown (**`Live in 20m @ 1.5×`**, accounting for the moving live edge via `lagSec / (rate - 1.0)`) when catching up above `1.0×`, and **`10m behind Live`** (with live pause drift) when paused or playing at `≤ 1.0×`.
- **Clickable `"Jump to Live"` Resync (#10)**: Whenever behind the live edge on a DVR broadcast, clicking the Cadence duration readout jumps back to the live broadcast head via YouTube's native live badge / `seekable` horizon and resumes playback.
- **Interactive Live DVR Test Scenario in Workbench (#10)**: Added a live DVR broadcast scenario (`Test Live DVR (−10m)`) with live-head `1.0×` clamping, pause drift, `−10m` / `−2m` DVR rewind controls, and one-click Jump to Live resync.

### Fixed
- **False 1-Hour Resetting Countdown on Live Streams (#10)**: Replaced single-class `.ytp-live` / `Infinity` checks with multi-tier live detection (`.ytp-time-display.ytp-live`, visible `.ytp-live-badge`, `videoId`-verified `videoDetails.isLive`, and `HTMLMediaElement.seekable` ranges) so YouTube's finite 3600-second MSE rolling horizon never triggers a false 60-minute countdown while archived past-stream VODs continue showing normal remaining duration.
- **Live Stream Safeguards (`Stop at End` & Live-Head `1.0×` Clamp) (#10)**: Bypassed `Stop After Video Ends` on active live broadcasts and ignored YouTube's automatic `1.0×` rate clamp at the live head so saved channel rules and session overrides are never falsely tripped.

## [1.3.0] - 2026-10-27

### Added
- **Real-Time Remaining Duration (`@ Speed`) (#3)**: Added a subtle, speed-adjusted wall-clock remaining duration readout (e.g., `24m left @ 1.5×`, `1h 12m left @ 1.5×`, or `42s left @ 1.5×` in the final minute) inside the below-video speed bar on YouTube watch pages and in the Web Simulator. Updates `.cadence-remaining-time` text in-place (throttled to 1s during playback, instant on speed changes and seeks) without rebuilding button DOM, and hides automatically during ads or unbounded broadcasts.
- **Version Readout Across Toolbar Popup, Options Page & Workbench (#9)**: Displays the active extension version (`v1.3.0`) dynamically via `chrome.runtime.getManifest().version` in both the Extension Toolbar Popup (`popup.html`) and Extension Options page (`options.html`), synced via a canonical `EXTENSION_VERSION` constant across the Web Workbench.

### Changed
- **Unified `/watch` Route Scope (#8)**: Removed deprecated `/live/...` URL formatting, filtering, and simulator `"Live Stream"` context tabs across `background.js`, `page-bridge.js`, `content.js`, `popup.html` / `popup.js`, the Web Simulator, and GitHub issue templates so Cadence focuses cleanly on `/watch` Channel Rules and Playlists.

### Fixed
- **Automatic `"Session Override"` Reset on Baseline Match (#7)**: Fixed stale `"Session"` / `"Session Override"` indicators when playback speed was adjusted away from baseline and later returned to match the active Channel Rule (or `1.0×` Default) via either YouTube's built-in gear menu or the below-video speed bar. Returning to baseline speed by any control surface now automatically clears `sessionOverride`, dims the `Reset` button, and restores normal `Rule` or `Default` indicators in both the watch bar and Toolbar Popup.

## [1.2.0] - 2026-10-24

### Added
- **Session-Only Below-Video Speed Bar**: Upgraded the watch-page speed bar (`#cadence-owner-bar`) next to YouTube's Subscribe button with `0.75×`–`2.0×` quick chips, fine `−0.05×` / `+0.05×` steppers (`0.25×`–`4.0×`), and a one-click **Reset** button. Adjustments made on the below-video bar apply strictly to the current video session (`videoId`) and never overwrite saved Channel Rules.
- **YouTube Home Mode in Web Simulator**: Added a **YouTube Home** browse context and upgraded session-only below-video controls in the web workbench to mirror Chrome behavior end-to-end.

### Changed
- **Session-Only Default for Player Gear Menu**: Changed `autoRememberManualSpeed` to `false` by default (with automatic `settingsSchemaVersion: 2` migration) so speed changes in YouTube's built-in player menu stay temporary for the current video unless **Remember Manual Changes** is explicitly enabled. Permanent Channel Rules are managed exclusively in the Cadence Toolbar Popup or Options page.

### Fixed
- **Zero-Lag Speed Lock & Badge Reset on YouTube Home**: Eliminated the 2–3 second playback speed carryover when returning to YouTube Home and clicking into a new video. Cadence now clears the toolbar icon badge and resets YouTube's persistent `<video>` rate to `1.0×` immediately on non-watch routes, captures destination channel hints on video card click (`NAVIGATION_PREVIEW`), verifies `videoId` parity against `ytd-watch-flexy` to reject stale DOM nodes, and enforces target speeds synchronously on `loadstart` / `loadeddata` / `canplay` / `playing`.

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
