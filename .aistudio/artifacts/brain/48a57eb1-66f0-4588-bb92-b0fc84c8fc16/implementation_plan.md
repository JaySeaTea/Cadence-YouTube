# Cadence v1.6.0 Re-Roll — Architecture Re-Anchor, Authoritative Bridge Calculations & Extension Script Linting

Cadence `v1.6.0` is re-planned to deliver the full suite of #23 (Disable Video Previews), #24 (Real-Time Per-Video & Lifetime Time Saved), and #26 (Paginated & Filtered Options Rules) while restoring the verified stability of `v1.5.2`:
1. **Re-Anchor to Proven v1.5.2 Watch Bar Baseline**: Re-establish the clean, tested `v1.5.2` watch toolbar and live/VOD detection state machine in `page-bridge.js` and `content.js`, ensuring zero divergence from its rock-solid daily-driver stability.
2. **Authoritative Bridge Precomputation (#24)**: Compute all saved-time metrics (both wall-clock banked seconds and projected remaining savings) directly in `page-bridge.js` where the HTML5 `<video>` and `#movie_player` elements reside natively. Pass the precomputed saved-time model directly in `TIME_REMAINING_UPDATE` payloads, turning `content.js` into a lightweight visual presenter with zero DOM video lookups, zero missing helper functions, and zero `ReferenceError`s.
3. **Automated Extension Script Identifier Linter**: Add a static identifier and syntax validation step to `scripts/build-extension.ts` that audits all extracted extension JavaScript files (`content.js`, `page-bridge.js`, `popup.js`, `options.js`, and `background.js`) to guarantee that any undeclared variable, missing function, or syntax issue fails the build immediately before packaging.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> All product decisions and architectural directions below incorporate your confirmed choices from the clarifying interview:

- **Confirmed Decision 1 — Re-Anchor to Proven v1.5.2 Baseline**:
  - *User Choice*: Re-anchor to proven v1.5.2 watch bar baseline.
  - *Execution*: The watch toolbar rendering loop, live stream DVR state machine, and channel rule application logic in `content.js` and `page-bridge.js` will revert to the clean `v1.5.2` foundation before surgical integration of the new v1.6.0 features.
- **Confirmed Decision 2 — Authoritative Bridge Precomputation**:
  - *User Choice*: Precompute saved time in bridge and pass in payload.
  - *Execution*: `page-bridge.js` already runs in the page's MAIN world with direct, synchronous access to `video.currentTime`, `video.duration`, `video.playbackRate`, and `#movie_player`. It will track `currentVideoTimeSavedSec`, compute the projected remaining savings `(remainingSec * (rate - 1.0)) / rate`, and package a complete `savedTimeModel` (`{ visible, tone, text, title }`) inside every `TIME_REMAINING_UPDATE` message. `content.js` will render this model directly without querying `<video>` elements or calling helper functions like `getWatchVideoElement`.
- **Confirmed Decision 3 — Automated Extension Build Linter**:
  - *User Choice*: Add automated identifier and linter check to extension build.
  - *Execution*: Extend `scripts/build-extension.ts` to run automated syntax and undeclared identifier checks across all output scripts using Node.js `vm.Script` / ESLint rules before creating `CWS.zip`.
- **Confirmed Decision 4 — Preserve Solid v1.6.0 Options & Popup Features**:
  - Keep the praised v1.6.0 Options page intact: Panel 01 Playback & Feed Controls (5 toggles), Panel 02 Lifetime Time Saved card with typed `"Forget Time Saved"` confirmation, Panel 03 Category Profiles, and Panel 04 Paginated/Filtered Channel Rules (10/25/50/All page size, 3 sort modes, instant search, category pills).
  - Keep the Extension Popup 5th toggle for Disable Video Previews and the footer rule/time-saved badge.
- **Confirmed Decision 5 — Chrome Web Store Studio Preservation**:
  - Promo Frame & CWS Screenshot Studio remain locked at `v1.5.1`. Target release is bumped to `v1.6.0`.

---

## 1. Overview & Core Concept

- **What It Does**:
  - Provides a frictionless, stable playback experience on all YouTube watch pages with instantaneous speed updates, reliable channel rule enforcement, and clear visibility of time saved.
  - Silences intrusive thumbnail video previews across browsing feeds (Home, Search, Sidebar) while preserving creator trailers on `/@channel` pages.
  - Organizes dozens of saved channel rules into a paginated, searchable, and sortable directory on the Options page.
- **Root Cause Analysis of Divergence**:
  - In `content.js`, `computeSavedTimeModel` attempted to call `getWatchVideoElement()`, a helper that only existed in `page-bridge.js`. In isolated content scripts, calling undeclared functions causes an immediate `Uncaught ReferenceError`, aborting the toolbar update loop and freezing UI reactivity.
  - Concurrently, overly broad live fallback heuristics in `content.js` matched YouTube's dormant player template classes, falsely locking standard VODs into live mode.
- **The Solution**: Precomputing saved-time metrics authoritatively in `page-bridge.js` completely eliminates cross-context DOM lookups in `content.js`, while strict player class checks (`#movie_player.ytp-live`) guarantee standard videos never enter live lock.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Watching Standard Videos (VOD & Replays)**:
   - Toolbar loads cleanly below video title (`cadence-watch-bar`):
     - **Row 1**: Mode tag (`Default · 1.5×` or `Channel Rule · 1.5×`), video time remaining.
     - **Row 2**: Active speed highlighted, all seek buttons (`-60`, `-30`, `-10`, `+10`, `+30`, `+60`) fully interactive.
     - **Row 3**: Steppers (`-0.05`, `+0.05`), `Reset`, channel rule action, and green `"Saves Xm Ys"` readout.
   - Speed adjustments via toolbar chips, Popup, or keyboard shortcuts (`>`, `<`) update the toolbar immediately without delay or visual stutter.
2. **End-of-Video Autoplay Stop & Savings Summary**:
   - When a video reaches the end, playback stops cleanly and autoplay queue progression is halted.
   - The Cadence End-of-Video toolbar pops up with Replay, Next, and Dismiss buttons.
   - If playback acceleration was used ($\ge 1\text{s}$ saved), the banner displays `" · You saved {time} with Cadence!"`.
   - Clicking **Replay** resets video to `0:00`, restarts playback, and cleanly dismisses the toolbar.
3. **Real Live Stream Experience**:
   - On genuine live streams (`#movie_player.ytp-live` active):
     - At live edge: Displays `Live Stream · At Live End`, disables $> 1.0\times$ acceleration and forward skips, shows red Live dot.
     - Rewound behind live (DVR): Displays lag (e.g. `42s behind Live`), allows catch-up speeds up to `2.0×`, shows static `Behind Live` tooltip.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Authoritative vs. Distributed Saved-Time Math**:
  - *Chosen Approach*: `page-bridge.js` performs 100% of the wall-clock time saved tracking and projected duration calculations. It constructs the exact view model and sends it to `content.js`.
  - *Why*: Eliminates code duplication and DOM traversal bugs in `content.js`. `content.js` simply sets `textContent` and `display` on `#cadence-saved-time` based on the payload.
- **Decision 2 — Clean Rebase over In-Situ Patching**:
  - *Chosen Approach*: Restore the tested `v1.5.2` transport deck DOM structure and event wiring, then apply the v1.6.0 delta on top.
  - *Why*: Eliminates subtle regression artifacts and ensures proven long-session stability.
- **Decision 3 — Automated AST / Scope Linter in Extension Build**:
  - *Chosen Approach*: Add an automated verification script that compiles and validates all template string scripts (`content.js`, `page-bridge.js`, `popup.js`, `options.js`, `background.js`) against undefined identifiers before outputting `/extension` and `CWS.zip`.
  - *Why*: `tsc --noEmit` only validates TypeScript syntax, not string literals containing JavaScript code. Automated script parsing catches `ReferenceError`s before code ever reaches the browser.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      YouTube MAIN World (page-bridge.js)                    │
│                                                                             │
│   HTML5 Video Element             #movie_player Instance                    │
│   • currentTime / duration        • .classList.contains('ytp-live')         │
│   • playbackRate                  • getProgressState()                      │
│            │                               │                                │
│            ▼                               ▼                                │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ Authoritative Savings & State Engine                                │   │
│   │ • Wall-clock bank: dtWall * (rate - 1.0) when rate > 1.0            │   │
│   │ • Projected remaining: (remainingSec * (rate - 1.0)) / rate         │   │
│   │ • SavedTimeModel: { visible, tone, text: "Saves Xm Ys", title }     │   │
│   │ • Multi-factor live check: requires #movie_player.ytp-live          │   │
│   └──────────────────────────────────┬──────────────────────────────────┘   │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │ postMessage('TIME_REMAINING_UPDATE')
                                       │ { savedTimeModel, playbackRate, isLive }
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Content Script Context (content.js)                      │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ Pure Presenter Watch Toolbar                                        │   │
│   │ • Receives precomputed savedTimeModel (zero video DOM calls)        │   │
│   │ • Synchronous speed sync on user clicks & ratechange                │   │
│   │ • Atomic offscreen mount prevents empty grey bars                   │   │
│   └──────────────────────────────────┬──────────────────────────────────┘   │
│                                      │
│                                      ▼
│                             #cadence-watch-bar
│                             Row 1: Readout & Brand
│                             Row 2: Speed Chips & Seeks
│                             Row 3: Steppers & Saves Xm Ys
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Verification Plan

1. **Automated Static Extension Linting**:
   - Run `npm run build:extension`.
   - Verify that all 5 extension scripts pass automated identifier and syntax analysis without undeclared variables or syntax errors.
   - Run `tsc --noEmit` and `vite build`.
2. **Toolbar Speed Responsiveness & Saved Time Verification**:
   - Load video at standard speed (1.0×); verify toolbar displays normal VOD controls.
   - Accelerate to 1.5× via popup, keyboard shortcut `>`, or toolbar chip:
     - Verify Row 1 speed readout updates instantly.
     - Verify active speed chip highlights instantly.
     - Verify Row 3 `"Saves Xm Ys"` readout displays immediately without throwing `ReferenceError`.
   - Check Chrome DevTools console for zero `Uncaught ReferenceError`s.
3. **Live vs. VOD Isolation Verification**:
   - Confirm standard videos and past live stream replays never show the "Live" badge or clamp speeds.
   - Confirm actual live streams at live edge properly clamp to 1.0× and show the static Behind Live indicator when rewound.
4. **Options Page & Popup Integrity**:
   - Confirm Options page Panel 01 (5 toggles), Panel 02 (Lifetime Time Saved with confirmation reset), Panel 03 (Profiles), and Panel 04 (Paginated/Filtered Rules) function smoothly.
