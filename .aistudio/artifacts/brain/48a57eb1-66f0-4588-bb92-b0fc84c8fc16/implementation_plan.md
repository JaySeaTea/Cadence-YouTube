# Cadence v1.3.1 — Live Broadcast Detection & Real-Time "Back to Live" Catch-Up (Issue #10)

Fixes the false 1-hour resetting countdown on YouTube Live Streams by introducing grounded multi-tier live broadcast detection, an active `Live` status readout at the broadcast head, a real-time wall-clock catch-up countdown (`Live in 20m @ 1.5×`) with one-click Jump to Live resync when watching from the DVR buffer, and an interactive Live DVR test mode inside the Workbench simulator.

## User Review & Critical Decisions

> [!IMPORTANT]
> All three UX choices from our clarification round are locked into this `v1.3.1` specification, alongside defensive fallbacks so Cadence never depends on a single undocumented YouTube player property.

- **Confirmed Decision 1 — Compact Catch-Up Readout**: When watching behind the live edge at speeds above `1.0×`, the below-video bar displays a compact wall-clock catch-up countdown (`Live in 20m @ 1.5×`), accounting for the moving live broadcast horizon (`lagSec / (rate - 1.0)`). Hovering reveals the exact buffer lag in a tooltip.
- **Confirmed Decision 2 — Clickable Jump to Live Action**: Whenever a viewer is behind the live edge (catching up, paused, or watching at `≤ 1.0×`), the duration readout upgrades from static text into a subtle interactive button that jumps straight back to the live broadcast head when clicked.
- **Confirmed Decision 3 — Interactive Live DVR Workbench Scenario**: The web Workbench simulator gains a dedicated Live Broadcast DVR scenario so you can test live-edge clamping, pausing/drifting behind live, `> 1.0×` catch-up math, and one-click Jump to Live before testing on YouTube.
- **Defensive Player Safeguards Included**: Active live broadcasts also bypass *Stop After Video Ends* (preventing MSE rolling segment boundaries from pausing a live stream) and ignore YouTube's automatic `1.0×` rate clamp at the live head so saved channel rules and session overrides are never falsely tripped.

---

## 1. Overview & Core Concept

- **What It Does**: Distinguishes active YouTube live broadcasts from standard videos and archived past-stream replays. On active broadcasts, Cadence replaces the misleading 1-hour Media Source Extensions (MSE) rolling buffer countdown with context-aware live telemetry: `● Live` when synced at the broadcast head, `10m behind Live` when paused or watching at `≤ 1.0×`, and `Live in 20m @ 1.5×` when actively closing the DVR gap above `1.0×`.
- **Target Audience / Persona**: YouTube viewers who watch live lectures, news briefings, technical streams, and podcasts—often pausing a broadcast for 10–20 minutes and accelerating playback to catch back up to real time without skipping content.
- **Key Value**: Eliminates bogus 60-minute MSE buffer countdowns while turning DVR playback speed into a predictable, clickable catch-up instrument.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Opening an Active Live Broadcast (At Live Head)**
   - The viewer opens a live `/watch?v=...` broadcast.
   - Instead of showing `60m left`, the right-hand slot of the below-video Cadence bar displays a clean, read-only **`● Live`** indicator.
   - Because future broadcast frames do not exist yet, YouTube clamps playback at the live head to `1.0×`; Cadence recognizes this live-head clamp and preserves the channel's baseline status cleanly without flagging a false *Session Override*.

2. **Pausing or Scrubbing Back into the Live DVR Buffer**
   - The viewer pauses the live stream or scrubs backward by 10 minutes.
   - Even while the video element is paused, a lightweight 1 Hz live-drift timer updates how far behind the live broadcast the viewer has drifted (`10m behind Live` → `11m behind Live`).
   - The readout renders as a subtle interactive button (`cursor-pointer`, hover border/highlight, tooltip *"Click to jump back to live edge"*).

3. **Accelerating Playback to Catch Up (`> 1.0×`)**
   - The viewer resumes playback at `1.5×` (either automatically from their saved Channel Rule once behind the live head or via the session speed bar).
   - Cadence computes net catch-up velocity (`1.5× - 1.0× = 0.5×` buffer gained per real second) and displays **`Live in 20m @ 1.5×`**, counting down smoothly in real wall-clock time (`tabular-nums`).
   - Clicking **`Live in 20m @ 1.5×`** at any moment triggers an immediate resync to the live broadcast head and transitions the indicator back to **`● Live`**.
   - Alternatively, letting the countdown reach `0s` naturally arrives at the live head, where YouTube settles at `1.0×` and the indicator transitions seamlessly to **`● Live`**.

4. **Testing in the Web Workbench Simulator (`v1.3.1`)**
   - Selecting the **Live Stream DVR** scenario in the Workbench switches the simulated player into an active broadcast with a live-edge scrubber, quick DVR offset controls (`Rewind 10m`, `Rewind 2m`, `At Live Edge`), live drift while paused, real-time catch-up math across all speed buttons, and clickable Jump to Live resync.

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian broadcast precision—quiet, native-feeling YouTube dark chrome integration paired with crisp SaaS console clarity in the Workbench.
- **Color Palette & Mood**:
  - Dominant dark slate canvas (`#0F172A` / `#0B0F19` bar surface) with cool hairline borders (`border-slate-700/90` and `rgba(255, 255, 255, 0.14)`).
  - Semantic broadcast accent: True live state uses YouTube-native crimson (`#DC2626` / `#EF4444`) strictly for the active live broadcast dot paired with explicit `Live` text (never color alone). Interactive behind-live catch-up buttons use high-legibility slate text (`#E2E8F0`) with subtle hover surface contrast (`hover:bg-slate-800`) and amber/crimson focus-visible rings.
- **Typography & Hierarchy**:
  - Workbench structure in `Plus Jakarta Sans` / `DM Sans`; all duration counters, speed multipliers, and DVR offsets strictly set in monospace tabular numerals (`JetBrains Mono` / `tabular-nums`) so second-by-second countdowns never cause horizontal layout jitter.
  - Single-line control discipline (`whitespace-nowrap shrink-0`) across every button and status readout in both the injected bar and Workbench.
- **Interactive Feedback & Motion**:
  - Instantaneous `< 150ms` hover and press transitions using opacity and background-color shifts only—no layout-shifting animations or decorative pulsing effects on static elements.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Multi-Tier Grounded Live Detection Over Single-Method Reliance**
  - *Chosen Approach*: Combine (1) visible player chrome DOM inspection (`.ytp-time-display.ytp-live` and `.ytp-live-badge`), (2) guarded `#movie_player` metadata verification (`getVideoData().isLive` / `getPlayerResponse().videoDetails.isLive` matched against the current video ID), and (3) W3C `HTMLMediaElement.seekable` range inspection.
  - *Why*: Protects against YouTube internal method renames while accurately separating **active live broadcasts** from **archived stream VODs** (where `isLiveContent` stays `true` forever, which would mislabel finished replays if checked naively).
  - *Alternatives Considered*: Querying the external YouTube Data API v3—rejected because it requires user API keys, network latency, and quota for state already present in the browser player.

- **Decision 2: Hysteresis Threshold + Extrapolated Pause Drift for DVR Lag**
  - *Chosen Approach*: Enter "Behind Live" mode when DVR lag reaches `≥ 15s` (and YouTube's native live badge is enabled/not at live head), and snap back to `● Live` when lag drops to `≤ 10s` or the native badge reports live-head sync. While paused on a live stream, extrapolate live-edge advancement at `1.0s/sec` if the MSE buffer pauses segment updates.
  - *Why*: Live DASH streams naturally sit 3–10 seconds behind segment ingestion; hysteresis prevents flickering between `● Live` and `Live in ...` on routine segment boundaries, while wall-clock pause extrapolation guarantees accurate lag growth even when `<video>` stops firing `timeupdate`.

- **Decision 3: Live-Head `1.0×` Clamp Immunity**
  - *Chosen Approach*: Ignore automatic `ratechange → 1.0×` events that occur while synced at the live head so Cadence does not record a false manual *Session Override* or overwrite saved channel speeds. When the viewer rewinds into the DVR buffer (`≥ 15s` behind), re-apply their configured channel/session speed automatically so catch-up works hands-free.
  - *Why*: Directly preserves the integrity of Issue #7's Session Override state machine on channels whose saved speed is above `1.0×`.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                   YouTube Watch Page (MAIN World Bridge)                   │
│                                                                            │
│  ┌──────────────────────────┐    ┌──────────────────────────────────────┐  │
│  │ Tiered Live Detector     │───▶│ DVR & Remaining Telemetry Engine     │  │
│  │ • .ytp-time-display.live │    │ • VOD: rawRemaining = dur - current  │  │
│  │ • .ytp-live-badge state  │    │ • Live Edge: video.seekable.end()    │  │
│  │ • videoDetails.isLive    │    │   + getProgressState().seekableEnd   │  │
│  │   (videoId-verified)     │    │ • Pause Drift: 1Hz wall-clock tick   │  │
│  └────────────┬─────────────┘    └──────────────────┬───────────────────┘  │
│               │                                     │                      │
│               ▼                                     ▼                      │
│  ┌──────────────────────────┐            TIME_REMAINING_UPDATE             │
│  │ Playback Safeguards      │          { isLive, isAtLiveHead,             │
│  │ • Bypass Stop-at-End     │            dvrLagSec, canJumpToLive, ... }   │
│  │ • Ignore live-head 1.0×  │                       │                      │
│  │   auto-clamp ratechange  │                       │                      │
│  └──────────────────────────┘                       ▼                      │
└─────────────────────────────────────────────────────┼──────────────────────┘
                                                      │ window.postMessage
┌─────────────────────────────────────────────────────┼──────────────────────┐
│               Extension Isolated Content Script & UI Bar                   │
│                                                     ▼                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Below-Video Duration / Live Slot                                     │  │
│  │ • VOD:          "24m left @ 1.5×" (read-only span)                   │  │
│  │ • Live @ Head:  "● Live" (live dot + label)                          │  │
│  │ • Live > 1.0×:  "Live in 20m @ 1.5×" (clickable button ──▶ JUMP_LIVE)│  │
│  │ • Live ≤ 1.0×:  "10m behind Live"    (clickable button ──▶ JUMP_LIVE)│  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│                Web Workbench Simulator & Extension Packager                │
│                                                                            │
│  ┌──────────────────────────┐    ┌──────────────────────────────────────┐  │
│  │ Simulated Broadcast Mode │───▶│ Shared Live Catch-Up Math & Controls │  │
│  │ • Live DVR Stream item   │    │ • Live head growth (+1s / real sec)  │  │
│  │ • Quick DVR seek presets │    │ • Catch-up: lagSec / (rate - 1.0)    │  │
│  │ • Live-head 1.0× clamp   │    │ • Clickable Jump to Live resync      │  │
│  └──────────────────────────┘    └──────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Extended `TIME_REMAINING_UPDATE` Bridge Payload**:
  - `videoId`: Active YouTube video identifier.
  - `hidden`: `true` during active ad playback or invalid/unloaded media; `false` for valid VODs and active live streams.
  - `isLive`: `true` strictly for active live broadcasts (never archived VODs).
  - `isAtLiveHead`: `true` when synced with the live broadcast head (via native `.ytp-live-badge` live-head state or hysteresis lag `≤ 10s`).
  - `dvrLagSec`: Non-negative seconds behind the live edge (`null` for standard VODs or non-DVR live streams at head).
  - `isPaused`: Current `video.paused` boolean so the UI knows whether playback is actively closing the DVR gap or drifting behind.
  - `rawRemainingSec`: Standard remaining seconds for finite VODs (`null` when `isLive` is `true`).
  - `playbackRate`: Active playback rate rounded to 2 decimals.
- **Workbench `SimulatedVideo` Extension**:
  - Optional `isLiveStream?: boolean` and `initialDvrWindowSec?: number` fields on simulated catalog entries so standard VOD items and the new Live DVR broadcast item coexist seamlessly in the queue.

### Interactive Component & State Mapping

- **Live State Transitions & Catch-Up Formatting**:
  - When `isLive && isAtLiveHead`: Renders non-interactive `● Live` indicator.
  - When `isLive && !isAtLiveHead && !isPaused && playbackRate > 1.02`: Computes `catchUpSec = Math.round(dvrLagSec / (playbackRate - 1.0))` and renders an interactive `<button>` reading `Live in <duration> @ <rate>×` with tooltip showing `<lag> behind live · Click to jump to live edge`.
  - When `isLive && !isAtLiveHead && (isPaused || playbackRate <= 1.02)`: Renders an interactive `<button>` reading `<lag> behind Live` with tooltip `Click to jump back to live edge`.
- **`JUMP_TO_LIVE` Bridge Command**:
  - Clicking the interactive behind-live button dispatches `JUMP_TO_LIVE` from the content script to the `MAIN` world bridge.
  - The bridge first invokes YouTube's native `.ytp-live-badge.click()` if available and enabled (ensuring YouTube's internal DVR state and live badge synchronize cleanly), falling back to seeking `video.currentTime` / `player.seekTo` to `seekableEnd`, resuming playback if paused, and immediately broadcasting an updated `TIME_REMAINING_UPDATE`.
- **DVR Rewind Auto-Speed Restoration**:
  - If a channel rule specifies `> 1.0×` (e.g., `1.5×`) and YouTube clamped the player to `1.0×` at the live head, scrubbing or pausing `≥ 15s` behind live automatically restores the configured `1.5×` target speed upon play so catch-up starts immediately without manual intervention.
- **Version Alignment (`v1.3.1`)**:
  - Updates version string to `1.3.1` across the extension manifest, toolbar popup header, options header, Workbench header/packager, and downloadable/synced extension bundle.
