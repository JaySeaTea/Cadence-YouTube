# Cadence v1.3.0 — Session Override Auto-Reset, Watch Simplification, Version Readout & Remaining Time

This `v1.3.0` release resolves two UX bugs (`#7` and `#8`) and delivers two cohesive watch-bar and extension UI enhancements (`#9` and `#3`) while keeping player routing and DOM hooks lean, fast, and easy to verify.

## User Review & Critical Decisions

> [!IMPORTANT]
> Please review the behaviors below for Issues **#7, #8, #9, and #3**. Click **Proceed** to build `v1.3.0`, or share any tweaks you would like first.

- **Bug #7 — Automatic Session Override Reset**: Whenever playback speed is adjusted via **either** YouTube's built-in gear menu **or** the below-video speed bar to match the active channel's baseline speed (its saved Channel Rule or the `1.0×` Default), Cadence automatically clears the `Session` / `Session Override` state, disables the `Reset` button, and restores normal `Rule` or `Default` indicators in both the watch bar and Toolbar Popup.
- **Bug #8 — Unified `/watch` Scope (Remove "Live Stream" Mode)**: Removes all `/live` URL branching, `Live Stream` context tabs, and livestream-specific copy across the Chrome extension and Web Simulator so Cadence focuses strictly on standard `/watch?v=...` videos, Channel Rules, and Playlists regardless of whether an upload is standard, a Premiere, or a live broadcast.
- **Feature #9 — Version Readout (`v1.3.0`)**: Displays the active extension version dynamically (sourced directly from the extension manifest in Chrome and synced in the Web Workbench) in the **Toolbar Popup**, **Extension Options Page**, and **Web Workbench** for instant verification after updates.
- **Feature #3 — Real-Time Remaining Duration (`@ Speed`)**: Displays a subtle, speed-adjusted remaining duration readout (e.g., `24m left` or `1h 12m left` scaled by current playback rate, switching to seconds in the final minute, and hidden automatically if a broadcast has no finite duration) inside the below-video speed bar on YouTube and in the Web Simulator.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. Makes temporary session overrides self-cleaning whenever you return to your normal channel or default speed by any control surface (`#7`).
  2. Streamlines URL matching and simulator modes around YouTube's standard `/watch` watch pages and playlists without redundant livestream modes (`#8`).
  3. Surfaces the exact installed Cadence version (`v1.3.0`) inside the Toolbar Popup, Options Page, and Web Workbench (`#9`).
  4. Computes real wall-clock time remaining at your current playback speed (`(duration - currentTime) / playbackRate`) directly inside the below-video control bar (`#3`).
- **Target Audience / Persona**: Viewers managing structured per-channel playback speeds and playlists on desktop/Chromebook who want accurate status feedback, instant version confirmation after `git pull` reloads, and effortless real-time duration awareness on long lectures and podcasts.
- **Key Value**: Eliminates lingering override badges and unused livestream clutter while adding zero-overhead remaining-time awareness and version visibility.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Self-Clearing Session Speed (`#7`)**: On an unlisted channel (`Default · 1.0×`) or a saved channel (`Rule · 1.5×`), you temporarily speed up to `1.75×` via YouTube's player gear menu or the below-video bar—both surfaces show `Session · 1.75×` / `Session Override`. Later, you dial speed back to `1.0×` (or `1.5×`) using either the gear menu or the bar; Cadence immediately recognizes parity with the baseline speed and reverts the bar label to `Default · 1.0×` (or `Rule · 1.5×`), dims `Reset`, and clears `Session Override` in the popup.
  2. **Glanceable Real-Time Remaining Duration (`#3`)**: Watching a `60:00` video at `1.5×` from the beginning shows `40m left` quietly inside the below-video bar. Clicking `2.0×` immediately updates the readout to `30m left` in real time without shifting button positions.
  3. **Unified Watch & Playlist Contexts (`#8`)**: In both the Chrome extension and Web Simulator, playback contexts focus cleanly on `YouTube Home`, `Watch Later`, `Creator Playlist`, and `Single Video` over standard `/watch?v=...` URLs.
  4. **Instant Version Check (`#9`)**: Opening the Cadence Toolbar Popup, the All Channel Rules Options page, or the Web Workbench displays `v1.3.0` in subtle tabular metadata so you can verify an unpacked reload in one glance.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Crisp dark-studio utility instrumentation with calm, unboxed typographic metadata and zero decorative clutter.
  - *Color Palette & Mood*: Deep cool slate canvas (`--background`: `#0B0F19`), elevated dark slate surfaces (`--card`: `#111827`) with `1px` structural borders (`#1E293B`), high-contrast slate typography (`#F1F5F9` primary, `#94A3B8` muted metadata), and crimson active speed states (`--accent`: `#DC2626`).
  - *Typography & Hierarchy*: `Plus Jakarta Sans` display headings, `Public Sans` body/control labels, and `JetBrains Mono` (`tabular-nums`) across all speed readouts, version strings (`v1.3.0`), and remaining-time counters so numerals never cause horizontal layout jitter.
  - *Component Styling & Layout*: Single-elevation containers, unboxed metadata separated by `·` dividers (strictly zero static pills), and `whitespace-nowrap shrink-0` single-line controls.
- **Interactive Feedback & Motion**:
  - Immediate (`<100ms`) recalculation of remaining time whenever speed or scrub position changes; calm rounded hours/minutes format (`1h 14m left`, `24m left`, and `42s left` under 1 minute) so peripheral vision isn't distracted by a constantly ticking stopwatch.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Baseline-Parity Comparison Across All Speed Control Surfaces (`#7`)**
  - *Chosen Approach*: Centralize a single baseline check (`Math.abs(newSpeed - baselineSpeed) < 0.015`) shared by both the below-video bar handler and the native player `ratechange` listener. Whenever `true`, `sessionOverride` resets to `{ videoId: null, speed: null }`.
  - *Why*: Guarantees identical, predictable indicator state regardless of whether you used YouTube's gear menu, keyboard shortcuts (`<`/`>`), or Cadence's below-video bar to return to your normal speed.
  - *Alternatives Considered*: Requiring an explicit click on `Reset` even when speed already equaled baseline caused confusing stale `Session Override` labels.

- **Decision 2: Targeted Text-Node Updates for Remaining Duration (`#3`)**
  - *Chosen Approach*: Render a dedicated `.cadence-remaining-time` text node inside the below-video bar and update **only its `textContent`** on `timeupdate` (throttled to 1-second intervals) and immediately on `ratechange` / `seeked`, hiding the readout automatically if `video.duration` is non-finite or if YouTube reports an active unbounded broadcast (`getVideoStats` / live badge).
  - *Why*: Avoids rebuilding the bar's button DOM while you are clicking speed chips, keeps CPU overhead virtually zero, and handles live broadcasts on `/watch?v=...` gracefully without needing separate URL rules.
  - *Alternatives Considered*: Re-rendering `bar.innerHTML` on every `timeupdate` tick would swallow button clicks between `mousedown` and `mouseup`.

- **Decision 3: Dynamic Manifest Version Lookup (`#9`)**
  - *Chosen Approach*: Read `chrome.runtime.getManifest().version` at runtime in the Popup and Options page, paired with a single shared `EXTENSION_VERSION = '1.3.0'` constant in the codebase for the manifest generator and Web Workbench.
  - *Why*: Eliminates any possibility of a future release bumping the manifest version while forgetting to update a hardcoded HTML label.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Cadence v1.3.0 Runtime Flow                          │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ YouTube Watch Page (/watch?v=...) — MAIN World Bridge                  │  │
│  │ • Zero-lag speed lock on loadstart + verified videoId matching         │  │
│  │ • Samples finite duration, currentTime & playbackRate (1s throttled)   │  │
│  │ • Emits VIDEO_DETECTED, MANUAL_RATE_CHANGE & TIME_REMAINING_UPDATE     │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Isolated Content Controller & Watch Bar (#cadence-owner-bar)           │  │
│  │ • Baseline Parity Guard: if |newSpeed - baselineSpeed| < 0.015         │  │
│  │   ──▶ auto-clears sessionOverride (fixes #7 across Bar & Gear Menu)    │  │
│  │ • Updates .cadence-remaining-time span in-place ("24m left" @ speed)   │  │
│  └──────────────────┬──────────────────────────────────┬──────────────────┘  │
│                     ▼                                  ▼                     │
│  ┌───────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ Toolbar Popup (v1.3.0 Readout)    │  │ Options & Web Workbench (v1.3.0)│  │
│  │ • Reads getManifest().version     │  │ • Reads getManifest().version   │  │
│  │ • Reflects clean Rule / Default / │  │ • Unified /watch & Playlist     │  │
│  │   Session status in real time     │  │   simulation (no /live clutter) │  │
│  └───────────────────────────────────┘  └─────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Single Canonical Version Constant (`EXTENSION_VERSION = '1.3.0'`)**: Drives the generated Manifest V3 `version` field, Install Guide download labels, Workbench footer/popup preview, and dynamic `chrome.runtime.getManifest().version` readouts in Chrome.
  - **Simplified `PlaylistContextMode`**: Scoped cleanly to `'youtube_home' | 'watch_later' | 'creator_playlist' | 'standalone'` (removing `'live_stream'`).
  - **Remaining Time State**: Computed from `{ remainingRealSeconds, speed, hasFiniteDuration }` where `remainingRealSeconds = Math.max(0, (duration - currentTime) / playbackRate)` (suppressed when `isAd` is true or when YouTube's player marks the stream as an unbounded live broadcast via `.ytp-live` / `isLive`).

- **Interactive Component & State Mapping**:
  - **Below-Video Bar & Native Gear Menu (`#7` + `#3`)**:
    - Adjusting speed via quick chips (`0.75×`–`2.0×`), fine steppers (`±0.05`), or YouTube's gear menu checks `Math.abs(targetSpeed - baselineSpeed) < 0.015`:
      - If **equal to baseline**: sets `sessionOverride = { videoId: null, speed: null }`, switches label back to `Rule · X.X×` or `Default · 1.0×`, disables `Reset`, and shows toast `Restored X.X× (Channel Rule)` or `Restored 1.0× (Default)`.
      - If **different from baseline**: sets `sessionOverride = { videoId, speed }`, switches label to `Session · X.X×`, enables `Reset`, and immediately recalculates the remaining duration readout (`24m left`) for the new speed.
  - **Toolbar Popup & Options Page (`#9`)**:
    - Toolbar Popup header/footer displays `Cadence` alongside subtle `v1.3.0` metadata and reflects cleared `Session Override` state immediately whenever speed matches baseline.
    - Options page header displays `Cadence for YouTube · v1.3.0` dynamically via `chrome.runtime.getManifest().version`.
  - **Unified `/watch` Matching (`#8`)**:
    - Background badge guard, content script route checks, popup active-tab detection, and simulator URL bar all target standard `/watch` URLs (`youtube.com/watch?v=...` and `&list=...`), removing `/live` route checks and simulator livestream tabs.
