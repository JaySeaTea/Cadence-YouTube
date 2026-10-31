# Changelog

All notable changes to **Cadence — Per-Channel Speed & Playlist Stop for YouTube** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.1] - 2026-10-31

### Fixed
- **Live Stream & Live DVR Seek Coordinate Space — Eliminated Stream Restarts on Replay/Skip Ahead (#19)**: Fixed `SEEK_BY_SECONDS` and `JUMP_TO_LIVE` in `page-bridge.js` mixing `HTMLMediaElement.currentTime` (MSE session buffer offset, which starts near `0` on tab load or resets across out-of-buffer DASH seeks) with `#movie_player.getProgressState().seekableStart` and `#movie_player.seekTo()` (which operate in YouTube's broadcast uptime timeline). Live seeks and wall-clock DVR anchors now track `#movie_player.getCurrentTime()` / `getProgressState().current` in a single consistent coordinate space, and non-DVR broadcasts (`isLiveDvrEnabled: false` / `allowSeeking: false`) now surface `"Rewind unavailable on this live stream"` without reloading the stream.
- **Toolbar Live-Head vs. Live-DVR Desync & False `"Stream is currently at live end"` Warnings (#19)**:
  - Removed premature `remainingState.isAtLiveHead = false` optimistic mutation inside `applySeekFromBar` in `content.js` that prevented `TIME_REMAINING_UPDATE` from detecting `Live → Live DVR` transitions and left Row 2 / Row 3 advancing speeds and skip capsules greyed out (`.is-live-blocked`) even while Row 1 displayed `"3m behind Live"`.
  - Stamped `data-bar-ui-mode` on `#cadence-watch-bar` and enforced automatic full re-render fallback in `updateRemainingReadoutInPlace()` whenever live/ad/DVR/speed state diverges from rendered DOM attributes.
  - Prevented stale `.ytp-live-badge` DOM attributes (left unrefreshed by YouTube while `#movie_player` has `.ytp-autohide` and the cursor is on the below-video Cadence toolbar) from overriding `getProgressState().isAtLiveHead === false` or measured DVR lag, and gated the `8.5s` catch-up handoff strictly behind active `> 1.0×` catch-up so `−10s` replays at `1.0×` enter and remain cleanly in Live DVR mode.

## [1.4.0] - 2026-10-31

### Added
- **Full-Width 3-Row Watch-Page Transport Deck Above `#title` (#18)**: Redesigned and relocated the watch-page control bar (`#cadence-watch-bar`) out of YouTube's `#owner` row and mounted it full-width at the top of `ytd-watch-metadata #above-the-fold` directly above `#title`. Leaves YouTube's Channel Owner, Subscribe, Like, Dislike, Share, and Save buttons 100% untouched across standard 2-column, Theater, half-width split-screen, and tight ~504px viewports.
  - **Row 1 (Telemetry & Collision-Aware Brand Signature)**: Pairs fixed-width active speed source (`Default`, `Channel Rule`, `Session Override`, or `Sponsored Ad`) and wall-clock VOD remaining / clickable Live DVR catch-up / Ad-lock notice on the left with a clickable `Cadence - YouTube at your speed` emblem button on the right (opening Channel Rules / Options). Uses live `ResizeObserver` intrinsic collision measurement so `- YouTube at your speed` dynamically collapses whenever Row 1 space gets tight (including Sponsored Ads and Live DVR in narrow windows).
  - **Row 2 (Quick Speeds & Always-Shown 10s/30s/60s Replay & Skip Capsules)**: Pairs `0.75×`–`2.0×` session speed presets on the left with compact grouped Replay (`[↺ 60 | 30 | 10]`) and Skip Ahead (`[10 | 30 | 60 ↻]`) transport capsules justified right, complete with Ad-lock (`"Skip locked during ad"`), Live-head forward-skip protection (`"Stream is currently at live end"`), and automatic Live-edge resync when skipping forward to the live horizon.
  - **Row 3 (`±0.05` Steppers, VOD-Only Saved Time & 1-Click Italic Channel Rule Slot)**: Pairs capsule-styled `−0.05` / `+0.05` fine steppers and `Reset` with a VOD-only wall-clock saved-time readout (`Saves 6m 09s` in emerald above `1.0×`, `0s saved` at `1.0×`, `+4m 47s` below `1.0×`, and strictly omitted on all Live Head, Live DVR, and Ad states) on the left, and an italic 1-click `Rule` management slot (`No rule` + `+ Save X× Rule`, `Rule: X×` + `Update → Y×`, or `Rule: X×` + `Clear ×`) on the right.
- **Automatic YouTube Shorts-to-Watch Conversion (`/shorts/<id>` → `/watch?v=<id>`)**: Enabled by default (`convertShortsToWatch: true`, `settingsSchemaVersion: 3`) with a dedicated **Convert Shorts to Standard Player** toggle in the Extension Toolbar Popup. Rewrites `<a href*="/shorts/">` links across YouTube Home, Subscriptions, Search, and Channel shelves in-place (preserving original hrefs in `data-cadence-orig-shorts-href` so toggling off restores `/shorts/` links immediately without reload) and redirects direct or SPA `/shorts/<id>` navigations via history-safe `location.replace` so the browser Back button never loops.

### Fixed
- **Eliminated `#owner` / `#actions` Button Overflow & Clipping on Narrow Watch Viewports (#18)**: Removed legacy `#cadence-owner-bar` injection beside Subscribe so YouTube's native watch action pills never wrap or clip at any window width.

## [1.3.5] - 2026-10-29

### Added
- **Ad Speed Lock (`"Speed locked during ad"`) & Automatic Post-Ad Session Override Restoration (#15)**: Locked playback speed changes in both directions (faster and slower) whenever a pre-roll or mid-roll ad (`ad-showing` / `ad-interrupting`) is playing across the below-video speed bar, Extension Toolbar Popup, YouTube player gear menu, and `Shift + >` / `Shift + <` keyboard shortcuts. Subtly dims toolbar controls during ads while keeping them clickable to surface `"Speed locked during ad"` in the floating amber toolbar toast and upper-right player warning toast, preserves any active single-video Session speed override untouched during the ad break, and automatically restores that Session override (or saved Channel Rule) the instant the ad finishes.
- **Interactive Ad Simulation & `−15s DVR` Catch-Up Test Controls in Workbench (#15, #14, #17)**: Added a one-click **`Simulate Ad (5s)`** control (with an in-player **`Skip Ad`** button) and a **`−15s DVR`** live rewind button in the Web Workbench to test ad speed locking, post-ad session override restoration, and passive live catch-up handoff end-to-end.

### Fixed
- **Zero-Shift Fixed-Width Below-Video Toolbar Speed Readout (#16)**: Kept compact speed formatting (`1.8×`, `1×`, `1.75×`) inside CSS `inline-grid` intrinsic sizer containers (`tabular-nums`) for both the toolbar status label and remaining duration readout so stepping `+0.05` / `−0.05` (`1.75×` → `1.8×` → `1.85×`) never shifts button positions or alters the below-video toolbar width.
- **Monotonic Live DVR Catch-Up Countdown & Native Red `LIVE` Badge Sync (#14, #17)**: Interpolated stepped `getProgressState().seekableEnd` DASH segment updates using wall-clock elapsed time and enforced a monotonic catch-up ceiling while playing unpaused above `1.0×` so behind-live and real-time catch-up counters never jump upward mid-catchup. When accelerated playback reaches YouTube's live buffer horizon, Cadence now automatically triggers YouTube's native `.ytp-live-badge` resync, re-activating YouTube's red `LIVE` badge alongside Cadence's `● Live` pill and clamping active speed cleanly to `1.0×`.

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
