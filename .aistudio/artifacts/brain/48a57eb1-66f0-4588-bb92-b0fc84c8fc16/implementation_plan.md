# Cadence v1.3.3 — Live Stream Speed Lock, Jump-to-Live Sync & Pause-Lag Accuracy

This patch release (`v1.3.3`) hardens Live DVR playback behavior across YouTube watch pages, the below-video control bar, the Chrome extension toolbar popup and badge, and the Interactive Web Workbench. It prevents speed increases above `1.0×` when already synced at the live broadcast edge, resets active speed indicators to `1.0×` whenever returning to Live, and keeps the behind-live timer accurate across pauses, resumes, and system sleep with zero background CPU or memory overhead.

## User Review & Critical Decisions

> [!IMPORTANT]
> All core behavioral rules below reflect your confirmed preferences, preserve existing VOD and playlist hard-stop behavior without altering saved user rules in storage, and incorporate low-overhead visibility gating plus OS sleep/wake recovery.

- **Confirmed Decision 1 — Release Versioning**: Ship as **`v1.3.3`**, keeping all Live DVR refinements consolidated in the `1.3.x` series across the extension package, popup/options headers, and Web Workbench.
- **Confirmed Decision 2 — Saved Channel Rules Above `1.0×` on Live Streams**: Clamp active playback, the below-video speed bar, and the toolbar icon badge to **`1.0×`** whenever synced at the live head while keeping the channel's saved rule intact in storage; automatically restore the saved rule speed whenever the viewer rewinds or pauses behind the live edge.
- **Confirmed Decision 3 — Directional Speed Guardrail at Live End**: Block speed increases **above `1.0×`** while at the live end (resetting/holding `1.0×` and displaying `"Stream is currently at live end"`), while continuing to allow slower speeds **below `1.0×`** (such as `0.75×` or `−0.05×`), which naturally transition the viewer into DVR behind-live playback.
- **Confirmed Decision 4 — Extension Toolbar Popup at Live End**: Selecting any preset, quick-speed button, or `+0.05×` step above `1.0×` in the toolbar popup while synced at the live end is blocked, displays `"Stream is currently at live end"`, and keeps active speed at `1.0×`.

## 1. Overview & Core Concept

- **What It Does**:
  - **Issue #13 (Live-End Speed Guardrail)**: Blocks attempts to accelerate a live broadcast past `1.0×` when already at the real-time live edge across all four surfaces (automatic background rate enforcement, below-video speed bar, extension toolbar popup, and Web Workbench), immediately resetting active playback to `1.0×` and surfacing a clear `"Stream is currently at live end"` toast.
  - **Issue #11 (Jump-to-Live & Catch-Up `1.0×` Reset)**: Synchronizes the active playback rate, below-video speed chips, popup readout, and Chrome toolbar badge back to `1.0×` the instant a viewer returns to the live head—whether by clicking Cadence's catch-up duration button, clicking YouTube's native `LIVE` button, scrubbing the timeline slider to the right edge, or organically catching up at `> 1.0×`.
  - **Issue #12 (Monotonic Pause/Resume & Sleep-Resilient Behind-Live Timer)**: Tracks elapsed real-world wall-clock lag (`Date.now()`) using only primitive timestamps on the existing bridge loop—gating updates when the tab is hidden, deduplicating emissions once lag reaches minute-level granularity, and reconciling cleanly after OS system sleep, DVR window eviction, or live broadcast completion.
- **Target Audience / Persona**: Viewers who watch live broadcasts alongside VOD content on YouTube—frequently pausing live streams, stepping away from their computer, catching up at `1.5×–2.0×` in DVR buffer mode, and jumping back to real-time Live without wanting stale speed badges or inaccurate countdown timers.
- **Key Value**: What Cadence displays on the below-video bar, toolbar badge, and popup always matches the true physical playback state of a live broadcast—before, during, and after pauses, system sleep, or jumps to Live—with negligible CPU and zero memory growth.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Attempting `> 1.0×` While Synced at Live (`● Live`)**:
     - The viewer is watching a live stream at the live edge (`● Live` indicator active, `1.0×` speed chip selected, toolbar badge reading `1.0x`).
     - Clicking `1.25×–2.0×` or `+0.05` on the below-video bar, choosing a `> 1.0×` speed in YouTube's player menu, or clicking a `> 1.0×` preset/speed in the toolbar popup keeps `1.0×` active and displays the toast **`Stream is currently at live end`**.
     - Clicking `0.75×` or `−0.05` (e.g., to `0.95×`) is allowed and smoothly drifts behind the live head into DVR mode.
  2. **Catching Up Behind Live & Returning to Live**:
     - While `10m behind Live`, the viewer selects `1.5×` (bar shows `Session · 1.5×`, duration button shows `● −10m · Live in 20m @ 1.5×`, toolbar badge shows `1.5x`).
     - The viewer clicks either YouTube's `LIVE` badge, Cadence's `−10m · Live in 20m @ 1.5×` button, or drags the timeline scrubber to the live end (or waits until catch-up completes).
     - Playback jumps to the live head at `1.0×`, any `> 1.0×` session override is cleared, the below-video bar immediately highlights `1.0×` alongside `● Live`, and the extension toolbar badge updates to `1.0x`.
     - If the channel has a saved rule of `1.5×`, the bar and badge clamp cleanly to `1.0×` while at Live (`Rule · 1.0×` with tooltip noting the `1.5×` rule is clamped at Live) and automatically restore `1.5×` if the viewer rewinds into DVR.
  3. **Pausing a Live Stream, Walking Away (System Sleep), & Resuming**:
     - Pausing a live stream while at `● Live` accumulates real wall-clock lag; within seconds, the indicator transitions from `● Live` to `● 15s behind Live` → `● 3m behind Live` while paused.
     - If the user switches tabs or the OS enters sleep while paused, cross-world updates idle completely; the instant the system wakes or the tab regains visibility/focus, `Date.now()` recalculates elapsed time and reconciles against YouTube's active DVR seekable window.
     - Pressing Play preserves the true behind-live lag with zero flicker back to `Live` and zero downward dip to a stale buffer horizon like `38s behind`.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Utilitarian dark-slate developer workbench and native YouTube dark-chrome companion.
  - *Color Palette & Mood*: Dominant deep neutral canvas (`#0B0F19`), flat single-elevation structural containers (`#111827`) with crisp hairline borders (`#1E293B`), high-contrast slate typography (`#F8FAFC` primary, `#94A3B8` muted), and restrained semantic accents—crimson (`#DC2626`) for active speed selection and live-head dot, amber (`#F59E0B`) for behind-live DVR catch-up dot and session override emphasis.
  - *Typography & Hierarchy*: Crisp geometric display headers paired with `font-mono tabular-nums` across all speed chips (`1.0×`, `1.5×`), DVR countdown readouts (`−3m · Live in 6m @ 1.5×`), and popup steppers so numeric updates never cause horizontal layout jitter.
  - *Component Styling & Layout*: Single-row controls with `whitespace-nowrap shrink-0` discipline; zero nested card-in-card clutter; compact inline toast banner inside the `356px` extension popup when a live-end speed increase is blocked so feedback is visible without closing the popup.
- **Interactive Feedback & Motion**:
  - Immediate (`≤ 150ms`) opacity/transform toast reveal on the YouTube player overlay, popup notice strip, and Web Workbench viewport (`"Stream is currently at live end"`).
  - Live-head state transitions update the below-video speed chips, duration readout, and toolbar badge atomically in the same render pass.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Non-Destructive Live-Head Clamping for Saved Channel Rules**:
  - *Chosen Approach*: Compute an effective live-aware speed (`1.0×` whenever `isLive && isAtLiveHead && targetSpeed > 1.0`, otherwise the session override or saved channel rule) rather than overwriting the saved channel rule to `1.0×` in persistent storage.
  - *Why*: Users often subscribe to channels that publish both pre-recorded videos and live streams. Clamping at runtime ensures `1.0×` accuracy on the bar, player, and badge at the live edge while automatically restoring the channel's `1.5×` or `2.0×` rule on VODs or as soon as the viewer rewinds behind Live.
  - *Alternatives Considered*: Mutating the stored channel rule to `1.0×` on Jump-to-Live was rejected because it would silently destroy the user's saved speed preference for future videos on that channel.
- **Decision 2 — Clearing `> 1.0×` Session Overrides Upon Reaching Live Head**:
  - *Chosen Approach*: Whenever a live stream transitions from behind-live to `isAtLiveHead` (via button click, timeline scrub, or organic catch-up), automatically clear any `sessionOverride` above `1.0×`.
  - *Why*: A session override on a live stream exists specifically to catch up to real time. Once caught up, clearing that temporary override prevents stale `Session · 1.5×` chips from lingering at Live and ensures unlisted/`1.0×` channels stay at `1.0×` even if the viewer briefly pauses later.
- **Decision 3 — Monotonic Wall-Clock Live Edge Anchor Across Pause/Resume**:
  - *Chosen Approach*: Treat the live broadcast head (`expectedLiveVideoSec = liveAnchorVideoSec + elapsedWallSec`) as monotonically advancing via `Date.now()`. Disallow YouTube's `.ytp-live-badge` or `getProgressState().isAtLiveHead` from resetting the anchor on unpause when accumulated wall-clock lag exceeds `10s` (unless an explicit Jump-to-Live or forward seek occurred), and hold the monotonic floor on resume until YouTube's `seekableEnd` actively advances across consecutive playing ticks.
  - *Why*: Directly eliminates both failure modes in Issue #12—YouTube's delayed DOM badge update on unpause and YouTube's paused HLS/DASH manifest lookahead stall (`~30–40s`)—while still resyncing cleanly once fresh segments arrive.
- **Decision 4 — Zero-Allocation Timer Reuse, Hidden-Tab Gating & OS Sleep/Wake Reconciliation**:
  - *Chosen Approach*: Reuse the single existing bridge check loop (no new `setInterval` created), store only fixed primitive numeric timestamps (zero heap allocations), skip cross-world `postMessage` emissions while `document.visibilityState === 'hidden'`, deduplicate updates by display bucket (minute-level once lag `≥ 60s`), and resync immediately on `visibilitychange` / `focus` after OS wake—clamping against YouTube's maximum DVR seekable window if a multi-hour sleep exceeded the stream's DVR retention buffer.
  - *Why*: Reduces background CPU and cross-world messaging below `v1.3.2` levels while guaranteeing accurate readouts even if the computer sleeps for minutes or hours with a paused live stream.
  - *Alternatives Considered*: Using `performance.now()` or counting interval ticks was rejected because `performance.now()` can pause during OS suspend on several platforms and interval ticks freeze during sleep, whereas `Date.now()` always reflects true elapsed wall-clock time on wake.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        YOUTUBE MAIN WORLD (Player Bridge)                    │
│  ┌──────────────────────────────┐      ┌──────────────────────────────────┐  │
│  │ Monotonic Live DVR Tracker   │      │ Playback Rate Enforcer           │  │
│  │ • Date.now() wall-clock floor│─────▶│ • Resets video & player to 1.0×  │  │
│  │ • Hidden-tab & sleep-wake    │      │   on live-head arrival           │  │
│  │   DVR window reconciliation  │      │ • Blocks >1.0× native gear/keys  │  │
│  │ • Native LIVE click listener │      └─────────────────┬────────────────┘  │
│  └──────────────┬───────────────┘                        │                   │
└─────────────────┼────────────────────────────────────────┼───────────────────┘
                  │ TIME_REMAINING_UPDATE                  │ LIVE_HEAD_SPEED_BLOCKED
                  │ (display-bucket deduplicated)          ▼
┌─────────────────▼────────────────────────────────────────────────────────────┐
│                   ISOLATED CONTENT CONTROLLER & BELOW-VIDEO BAR              │
│  ┌─────────────────────────────────────┐  ┌───────────────────────────────┐  │
│  │ Live-Aware Speed Resolver           │  │ Below-Video Bar & Player Toast│  │
│  │ • Clears >1.0× session at live head │─▶│ • Renders 1.0× chip + ● Live  │  │
│  │ • Clamps >1.0× rule at live head    │  │ • Shows "Stream is currently  │  │
│  │ • Restores saved rule behind live   │  │   at live end" on >1.0× click │  │
│  └──────────────┬──────────────────────┘  └───────────────────────────────┘  │
└─────────────────┼────────────────────────────────────────▲───────────────────┘
                  │ CADENCE_UPDATE_BADGE (1.0x at head)    │ CADENCE_GET_ACTIVE_CHANNEL
                  ▼                                        │ (includes isLive / isAtLiveHead)
┌────────────────────────────────────────┐  ┌──────────────┴───────────────────┐
│     BACKGROUND SERVICE WORKER          │  │     EXTENSION TOOLBAR POPUP      │
│  • Syncs tab icon badge ("1.0x" etc.)  │  │  • Blocks >1.0× at live end      │
└────────────────────────────────────────┘  │  • Inline + player live-end toast│
                                            └──────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                     WEB WORKBENCH / LIVE DVR SIMULATOR                       │
│  • Mirrors live-end >1.0× block + "Stream is currently at live end" toast    │
│  • Resets bar, simulated popup, player gear & badge to 1.0× on Jump/Scrub    │
│  • Advances liveEdgeTime continuously while paused for exact lag parity      │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Main-World Live Tracking State (Primitive Scalars Only — Zero Heap Growth)**:
    - `liveAnchorVideoSec` & `liveAnchorWallMs`: Monotonic reference mapping media time to real wall-clock `Date.now()`.
    - `pausedAtWallMs`, `lastObservedCurrentTime`, & `lastObservedSeekableEnd`: Tracks pause onset, detects forward seeks or YouTube DVR buffer eviction jumps after long OS sleep, and verifies when YouTube's manifest `seekableEnd` has resumed advancing after wake/unpause.
    - `explicitJumpToLiveUntil`: Short confirmation window (`2500ms`) armed when the user clicks Cadence's catch-up button or YouTube's `.ytp-live-badge`, allowing immediate anchor resync to live head.
    - `wasAtLiveHead`: Tracks live-head state transitions so arriving at the live edge (`false → true`) actively enforces `1.0×` on `video.playbackRate` and `movie_player.setPlaybackRate(1)`.
  - **Content Controller & Popup Channel State**:
    - `remainingState`: `{ videoId, rawRemainingSec, playbackRate, isLive, isAtLiveHead, dvrLagSec, isPaused, hidden }`.
    - `CADENCE_GET_ACTIVE_CHANNEL` response payload extended with `isLive: boolean` and `isAtLiveHead: boolean` (mirrored in the direct scripting fallback) so the Toolbar Popup immediately knows when the active tab is synced at a live broadcast head.

- **Interactive Component & State Mapping**:
  - **Below-Video Speed Bar (`> 1.0×` Click or `+0.05` Step While `isAtLiveHead`)**:
    - Validates `cleanSpeed > 1.01` when `remainingState.isLive && remainingState.isAtLiveHead`.
    - Clears any `> 1.0×` session override, enforces `1.0×` on player bridge + toolbar badge, keeps `1.0×` chip active, and displays `showPlayerToast('Stream is currently at live end')` cleanly as direct user-action feedback.
  - **Extension Toolbar Popup (`> 1.0×` Preset, Quick Speed, or `+0.05×` Step While `isAtLiveHead`)**:
    - Intercepts `newSpeed > 1.01` when `isLive && isAtLiveHead`.
    - Does not write a `> 1.0×` rule; keeps `currentSpeed = 1.0`, renders an inline popup toast banner (`"Stream is currently at live end"`), messages the active tab to show the matching player toast and enforce `1.0×`, and keeps the toolbar badge at `1.0x`.
  - **Jump-to-Live / Scrub-to-Live / Organic Catch-Up**:
    - Clicking `.ytp-live-badge` (captured via delegated pointer/click listener in the player bridge), clicking Cadence's catch-up pill (`JUMP_TO_LIVE`), scrubbing within `≤ 9s` of `expectedLiveVideoSec`, or catching up organically flips `isAtLiveHead` to `true`.
    - Player bridge immediately sets `video.playbackRate = 1.0` and `player.setPlaybackRate(1)`.
    - Content script receives `TIME_REMAINING_UPDATE` (`isAtLiveHead: true`), clears any `> 1.0×` `sessionOverride`, clamps effective speed to `1.0×`, re-renders the below-video bar (`1.0×` active + `● Live`), and dispatches `CADENCE_UPDATE_BADGE` with `speed: 1.0`.
  - **Pause, Background Tab, OS Sleep, & Resume Lifecycle**:
    - **While Visible & Paused**: Reuses the existing bridge check loop (throttled to `~1s`), deduplicating `TIME_REMAINING_UPDATE` by display bucket (`1s` steps below `60s`, `60s` minute buckets once `≥ 1m`) and writing `textContent` only when the string actually changes.
    - **While Hidden or Asleep**: Skips `TIME_REMAINING_UPDATE` completely when `document.visibilityState === 'hidden'`; OS suspend freezes the JS timer at zero CPU usage.
    - **On Wake / Tab Refocus (`visibilitychange` & `focus`)**: Immediately triggers a forced evaluation using `Date.now()`. If the broadcast ended during sleep, exits Live mode cleanly; if sleep exceeded the stream's maximum DVR retention window (e.g., `2h–12h`) and YouTube advanced `currentTime` or capped `seekableEnd - seekableStart`, reconciles the anchor to the active DVR window so lag never exceeds what is physically buffered.
    - **On `play` / `playing`**: Suppresses stale `badgeAtHead` / `ps.isAtLiveHead` resets while `anchorLagSec > 10s` (unless an explicit Jump-to-Live or forward seek occurred), holds the monotonic floor while YouTube's manifest reconnects, and smoothly re-anchors to `cleanPsLag` once `ps.seekableEnd` actively advances across consecutive playing ticks.
  - **Web Workbench Simulator Parity**:
    - Updates simulated below-video bar, simulated YouTube gear menu, simulated Toolbar Popup, timeline scrubber, native `LIVE` button, and organic catch-up loop so every test scenario in the Workbench behaves identically to the packaged Chrome extension.
