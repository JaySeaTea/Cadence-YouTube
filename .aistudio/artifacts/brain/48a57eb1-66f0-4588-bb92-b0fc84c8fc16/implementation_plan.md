# Cadence v1.6.1 — Watch Toolbar Stabilization & Live Detection Fixes

Cadence `v1.6.1` is a targeted stabilization update resolving three watch-page toolbar issues introduced in v1.6.0:
1. **Eliminate False-Positive "Live Stream" Detection**: Standard VOD videos and archived stream replays will never be classified as "Live". Multi-factor validation will require genuine YouTube live player classes (`#movie_player.ytp-live`) and confirmed stream metadata before engaging live locks or disabling acceleration controls.
2. **Immediate Toolbar Speed & "Saves Time" Synchronization**: The toolbar's Row 1 speed readout, active speed chips, and Row 3 "Saves Xm Ys" indicator will update synchronously across all speed adjustments (via toolbar buttons, keyboard shortcuts, or the Extension Popup), whether playing or paused.
3. **Atomic Off-Screen Toolbar Construction**: The watch toolbar will be fully constructed and validated off-screen before inserting into the DOM, eliminating any possibility of an empty or thin grey placeholder bar rendering during page transitions.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> All product behaviors and technical safeguards below directly incorporate your confirmed choices from Phase 1 clarifying questions:

- **Confirmed Decision 1 — Live vs. VOD Detection Hardening**:
  - *User Choice*: Require live player classes and positive stream indicators.
  - *Implementation*: Detection will require `#movie_player.classList.contains('ytp-live')` AND positive `player.getVideoData().isLive === true`. Buffering states (`NaN` duration) and archived live replays will never trigger the live mode lock. Loose DOM fallback checks in `content.js` will be constrained so dormant or disabled live badge templates never falsely trigger live state.
- **Confirmed Decision 2 — Real-Time Toolbar Speed & Savings Sync**:
  - *User Choice*: Keep toolbar fully synchronized across all speed changes.
  - *Implementation*: When playback speed changes from any source (Extension Popup, keyboard shortcuts `>`/`<`, YouTube player menus, or toolbar buttons), `content.js` will immediately update its active speed state, update Row 1 and Row 2 active chips, recalculate `computeSavedTimeModel()`, and render the "Saves Xm Ys" readout in real time (both while playing and paused).
- **Confirmed Decision 3 — Zero Blank Bar Guarantee**:
  - *User Choice*: Construct offscreen and insert only when fully populated.
  - *Implementation*: In `renderInPageBar()`, `cadence-watch-bar` will be created, populated with `innerHTML`, bound to event listeners, and validated off-screen. Only when fully assembled will it be mounted or replaced in the DOM. If any transient error occurs during video switching, no empty container shell will ever be left in the page.
- **Confirmed Decision 4 — Chrome Web Store Studio Preservation**:
  - Promo Frame & CWS Screenshot Studio remain locked at `v1.5.1`. Runtime extension version will bump to `v1.6.1`.

---

## 1. Overview & Core Concept

- **What It Does**: Restores reliable, rock-solid toolbar operation on standard YouTube Watch pages:
  - Ensures standard videos display the full suite of playback controls, active speed readouts, and projected/banked time savings.
  - Keeps live stream protections strictly confined to genuinely live broadcasts.
  - Prevents race conditions during YouTube SPA navigation from rendering an empty toolbar shell.
- **Target Audience / Persona**: All YouTube viewers using Cadence who rely on the persistent below-video toolbar for fine-grained speed control, quick skips, and time-saved tracking.
- **Key Value**: Consistency and polish—the toolbar always shows the correct state, updates in lockstep with the video, and never flashes empty or locked states on standard videos.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Watching Standard Videos (VOD & Archived Streams)**:
   - Viewer navigates to any standard YouTube video or past live stream replay.
   - The toolbar immediately renders with normal VOD controls:
     - Row 1: `Default · 1.5×` or `Channel Rule · 1.5×` (with accurate duration readout).
     - Row 2: Active speed highlighted (e.g. `1.5×`), full seek capsules active (`-60`, `-30`, `-10`, `+10`, `+30`, `+60`).
     - Row 3: Steppers (`-0.05`, `+0.05`), `Reset`, channel rule action, and green `"Saves Xm Ys"` readout.
   - Live stream indicators (red Live dot, "Stream is currently at live end" tooltip) are strictly absent.
2. **Adjusting Speed via Extension Popup or Keyboard**:
   - Viewer adjusts speed via the Extension Popup (e.g. clicking `1.75×`) or typing `>`:
     - The video accelerates to `1.75×`.
     - The below-video toolbar instantly updates its Row 1 readout to `1.75×`.
     - The `1.75×` chip on Row 2 highlights immediately.
     - Row 3 updates its `"Saves Xm Ys"` calculation instantly.
     - The top-right toast notification displays `1.75× · Session Override`.
3. **Smooth Video Transitions Without Blank Bars**:
   - Viewer clicks a recommended video or navigates between tabs.
   - YouTube's Polymer framework updates the watch page DOM.
   - Cadence builds the new toolbar off-screen; no empty grey bar or unpopulated frame is ever visible to the user.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Multi-Factor Live Broadcast Validation**:
  - *Chosen Approach*: Require BOTH `#movie_player.classList.contains('ytp-live')` AND explicit stream flags in player data (`vd.isLive === true` or ongoing live stream indicators). For DOM checks, verify `offsetParent !== null` and computed `display !== 'none'` on the live badge.
  - *Why*: YouTube's desktop player HTML template includes `.ytp-live-badge` (with `disabled="true"`) on every video, hiding it via CSS `#movie_player:not(.ytp-live) .ytp-live-badge { display: none; }`. Checking for the presence of the element or disabled attribute caused false positives when evaluated before styles resolved or during buffering. Multi-factor checks eliminate this class of bug completely.
- **Decision 2 — Duration NaN/Infinity Isolation**:
  - *Chosen Approach*: When `video.duration` is `NaN` or `Infinity` during initial MSE buffer initialization, do NOT infer live broadcast unless `#movie_player` explicitly has `.ytp-live`. Treat uninitialized durations as "loading VOD", not Live.
  - *Why*: In Chrome MSE, standard videos frequently report `NaN` or `Infinity` for the first 100–300ms while media segments buffer.
- **Decision 3 — Atomic Off-Screen DOM Swapping**:
  - *Chosen Approach*: Construct the new toolbar element completely in memory, populate all child elements and models, and swap it into `#above-the-fold` / `#watch-metadata` using `replaceWith` or single-step insertion.
  - *Why*: Prevents the browser from painting an empty container div while JavaScript asynchronously computes channel rules, duration models, and saved time metrics.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       YouTube Watch Page Player & DOM                       │
│                                                                             │
│  HTML5 Video & #movie_player              Cadence MAIN Page Bridge          │
│  ┌───────────────────────────────────┐    ┌──────────────────────────────┐  │
│  │ #movie_player.ytp-live (REQUIRED) │    │ Multi-factor live check:     │  │
│  │ video.duration (finite = VOD)     │───►│ • player.classList 'ytp-live'│  │
│  │ player.getVideoData().isLive      │    │ • vd.isLive === true         │  │
│  └───────────────────────────────────┘    │ • Never flag NaN as Live     │  │
│                                           └──────────────┬───────────────┘  │
│                                                          │ TIME_REMAINING_UPDATE
│                                                          │ MANUAL_RATE_CHANGE
│                                                          ▼                  │
│                                           ┌──────────────────────────────┐  │
│                                           │ Cadence Content Script       │  │
│                                           │ • Synchronous rate update    │  │
│                                           │ • Atomic offscreen mount     │  │
│                                           │ • Instant saved time calc    │  │
│                                           └──────────────┬───────────────┘  │
│                                                          │                  │
│                                                          ▼                  │
│                                           ┌──────────────────────────────┐  │
│                                           │ Below-Video Watch Toolbar    │  │
│                                           │ • Row 1: Mode & Speed sync   │  │
│                                           │ • Row 2: Speed chips & seek  │  │
│                                           │ • Row 3: Saves Xm Ys live    │  │
│                                           └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Changes in `src/extension/generateExtensionZip.ts`

1. **`pageBridgeJs`**:
   - Overhaul `isLiveBroadcast(player, video)`:
     - Require `player && player.classList && player.classList.contains('ytp-live')`.
     - Check `player.getVideoData().isLive === true` or `player.getPlayerResponse()?.videoDetails?.isLive === true`.
     - If `video && Number.isFinite(video.duration) && video.duration > 0`, treat as VOD unless `.ytp-live` class is active.
     - Never return `true` purely based on `!Number.isFinite(video.duration)` during initial loading.
   - Ensure `ratechange` and `SET_SPEED` post `MANUAL_RATE_CHANGE` and `TIME_REMAINING_UPDATE` immediately with the new rate.
2. **`contentJs`**:
   - In `isAnyLiveStreamActive()` and `isDomLiveHeadFallback()`:
     - Require `player && player.classList.contains('ytp-live')`.
     - Ensure the badge is rendered and visible (`badge.offsetParent !== null` and `getComputedStyle(badge).display !== 'none'`).
   - In `renderInPageBar()`:
     - Construct `bar = document.createElement('div')` completely off-screen.
     - Generate HTML, bind all listeners, apply duration and saved time models.
     - If valid, mount to the target container or replace the existing bar in a single atomic step.
     - Wrap in a `try...catch` boundary with safe fallback cleanup.
   - In message handlers (`CADENCE_SET_CHANNEL_SPEED`, `MANUAL_RATE_CHANGE`, `TIME_REMAINING_UPDATE`):
     - Synchronously update `remainingState.playbackRate`, `activeSpeed`, and trigger `updateRemainingReadoutInPlace()` or `renderInPageBar()` immediately.
3. **`generateExtensionZip.ts` & `sampleDefaults.ts`**:
   - Bump extension runtime version to `v1.6.1`.
   - Maintain CWS screenshot studio locked at `v1.5.1`.

---

## 5. Verification Plan

1. **Compilation & Extension Package Build**:
   - Run `npm run build:extension` to regenerate `/extension` files and `CWS.zip`.
   - Run `node --check` across all generated extension JS files (`background.js`, `page-bridge.js`, `content.js`, `popup.js`, `options.js`).
   - Run `tsc --noEmit` (`lint_applet`) and `vite build` (`compile_applet`) to ensure 0 errors.
2. **Issue 1 (Live False-Positive) Verification**:
   - Verify standard VOD videos and archived stream replays never enter live mode.
   - Verify quick speed chips ($1.25\times$, $1.5\times$, $1.75\times$, $2.0\times$) and forward seek buttons are never greyed out or marked `is-live-blocked`.
3. **Issue 2 (Speed & "Saves Time" Sync) Verification**:
   - Change speed in Extension Popup or via `>` shortcut.
   - Verify toolbar Row 1 speed, Row 2 active chip, and Row 3 "Saves Xm Ys" readout update immediately in real time.
4. **Issue 3 (Blank Bar Prevention) Verification**:
   - Simulate rapid video transitions and player mount cycles.
   - Confirm the toolbar never appears as an unpopulated or thin grey bar.

---

## 6. Implementation & Verification Status

- [x] **Live Detection Hardening**: Multi-factor validation implemented across `page-bridge.js`, `content.js`, and `popup.js`. Requires `#movie_player.classList.contains('ytp-live')` and active live indicators; standard VODs and buffering MSE videos (`NaN` duration) are never falsely treated as Live.
- [x] **Immediate Speed & "Saves Time" Readout Synchronization**: Synchronous rate application implemented on `CADENCE_SET_CHANNEL_SPEED` and `MANUAL_RATE_CHANGE`. Row 1 speed readout, active speed chips, and Row 3 "Saves Xm Ys" calculate and update in real time.
- [x] **Atomic Offscreen Watch Bar Assembly**: `cadence-watch-bar` is constructed, populated, and wired completely off-screen in memory before atomic insertion (`replaceWith` or single-step insert), protected by error boundaries with auto-cleanup of empty orphan elements.
- [x] **CWS Snapshot Locked**: Promo Frame and Chrome Web Store Screenshot Studio remain locked at `v1.5.1`.
- [x] **Extension Build & Validation**: Successfully regenerated `/extension` and `CWS.zip` (60.0 KB) at `v1.6.1`. Validated JS syntax across all 5 scripts (`node --check`), with clean TypeScript check (`tsc --noEmit`) and Vite compilation.
