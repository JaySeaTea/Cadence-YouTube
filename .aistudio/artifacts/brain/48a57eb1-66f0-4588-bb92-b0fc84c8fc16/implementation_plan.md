# Cadence v1.4.0 — 3-Row Watch-Page Transport Deck, Replay/Skip Capsules & Shorts Conversion

Upgrade **Cadence** to **v1.4.0** by replacing the legacy inline `#owner` bar with the full-width **3-Row Watch-Page Transport Deck** above `#title` (resolving **Issue #18** across every window width), adding permanent compact **Replay / Skip Ahead** seek capsules and 1-click **Channel Rule** controls, and introducing automatic **YouTube Shorts-to-Watch conversion** across direct URLs and feed links.

## User Review & Critical Decisions

> [!IMPORTANT]
> Every layout, typography, and behavioral detail from our Layout Lab iterations and your clarifying answers is locked in below across both the Chrome extension and the Interactive Simulator Workbench.

- **Confirmed — Full-Width 3-Row Transport Deck Above `#title` (Issue #18)**: Relocates the below-video toolbar out of YouTube’s cramped `#owner` flex row and mounts it full-width inside `ytd-watch-metadata #above-the-fold` directly above `#title`. Standard YouTube buttons (`Like`, `Dislike`, `Share`, `Save`, `More`) and channel names remain 100% untouched across 2-Column, Theater, Half-Width Split, and Tight Split (`~504px`) windows.
- **Confirmed — Dynamic Row 1 Telemetry & Brand Signature**: Pairs the active speed source (`Default`, `Channel Rule`, `Session Override`, or `Sponsored Ad`) and real-time remaining / Live DVR countdown on the left with the clickable **Cadence - YouTube at your speed** emblem signature on the right (opening Cadence Options on click), using live collision measurement (`ResizeObserver`) to drop `- YouTube at your speed` whenever Row 1 space gets tight (including Sponsored Ads and Live DVR in Tight Split).
- **Confirmed — Always-Shown Style B Replay / Skip Ahead Capsules**: Anchors two compact segmented transport capsules (`[↺ 60 | 30 | 10]  [10 | 30 | 60 ↻]`) permanently on Row 2’s right edge whenever the below-video toolbar is enabled—requiring no extra toggle while keeping identical `~186px` geometry at every viewport width.
- **Confirmed — Row 3 Fine Step, VOD-Only Saved Time & Style A Italic Rule Slot**: Places `[−0.05] [+0.05] [Reset]` on Row 3 Left followed immediately by the green `Saves Xm Ys` readout strictly on finite VOD videos (completely omitted on both Live Head and Live DVR streams as well as during Ads), paired with the full-italic 1-click `Rule` slot on Row 3 Right (`No rule · + Save X× Rule`, `Rule: X× · Update → Y×`, or `Rule: X× · Clear ×`).
- **Confirmed — Automatic Shorts Conversion Enabled by Default with Popup Toggle**: Automatically rewrites `/shorts/<id>` feed/shelf links to `/watch?v=<id>` and redirects direct or SPA `/shorts/<id>` navigations into the standard Watch player using history-safe replacement (`location.replace`) so browser Back navigation never loops, controlled by an on-by-default toggle in the Extension Popup.

---

## 1. Overview & Core Concept

- **What It Does**: Unifies Cadence’s watch-page playback experience into a rock-steady, width-adaptive 3-row transport deck while automatically routing YouTube Shorts into the full `/watch?v=` player—giving Shorts full access to Cadence’s per-channel speed rules, `10s/30s/60s` replay/skip capsules, real-time remaining duration, and end-of-video autoplay protection.
- **Target Audience / Persona**: Daily YouTube viewers who split-screen lectures, tutorials, live streams, and podcasts across varied window sizes, want instant multi-interval seeking and 1-click channel rule pinning below the player, and prefer standard horizontal playback controls over YouTube’s vertical Shorts feed.
- **Key Value**: Zero native YouTube button dislocation at any browser width, consistent muscle memory for every speed and seek button, 1-click channel rule management without opening the popup, and frictionless Shorts-to-Watch conversion.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Watching & Adjusting Speed Across Any Window Width (Issue #18)**:
   - Opening any `/watch?v=...` video injects the 3-Row Transport Deck cleanly between `#player` and `#title`. YouTube’s `#top-row` (`#owner` + `#actions`) keeps 100% of its native horizontal room.
   - Stepping speeds via `0.75×–2.0×`, `−0.05`, or `+0.05` updates playback immediately without shifting any button’s X-coordinate (`tabular-nums` grid sizers). On VOD videos, `Saves Xm Ys` updates live beside `Reset`; on Live DVR and Live Head streams, `Saves` stays hidden so Row 1’s `−22m · Live in 22m @ 2.0×` or `● Live` pill carries the live timing story cleanly.
   - Resizing the browser down to Tight Split (`~504px`) during a Sponsored Ad or Live DVR catch-up automatically collapses the top-right brand signature from `[Emblem] Cadence - YouTube at your speed` to `[Emblem] Cadence` before any text can touch or overlap, then restores the full tagline as soon as space opens up.
2. **Seeking with Replay & Skip Ahead Capsules (`10s / 30s / 60s`)**:
   - Clicking `60`, `30`, or `10` inside `[↺ 60|30|10]` rewinds playback by that exact interval (clamped at `0:00` on VOD; rewinding from a synced Live Head stream smoothly enters Live DVR mode).
   - Clicking `10`, `30`, or `60` inside `[10|30|60 ↻]` skips forward (if a Live DVR skip reaches within `2s` of the live edge, Cadence syncs cleanly to Live Head at `1.0×`; clicking forward skip while already at Live Head shows the amber `"Stream is currently at live end"` warning).
   - During a pre-roll or mid-roll ad, both capsules dim alongside the speed controls and display `"Skip locked during ad"` if clicked.
3. **1-Click Channel Rule Management from Row 3 Lower Right**:
   - On a channel with **no saved rule**, Row 3 Right displays *`No rule` · `[+ Save 1.25× Rule]`* (or the active Session Override speed) in italics—clicking saves the channel rule immediately to `chrome.storage.local` without opening the popup.
   - On a channel **with a saved rule** (`1.5×`) during a Session Override (`1.75×`), Row 3 Left offers `Reset` (revert to `1.5×`) while Row 3 Right offers *`Rule: 1.5×` · `[Update → 1.75×]`* in warm amber italics to promote the session speed. When no override is active, *`Rule: 1.5×` · `[Clear ×]`* allows 1-click rule removal back to Default.
4. **Automatic YouTube Shorts Conversion (`/shorts/<id>` → `/watch?v=<id>`)**:
   - While **Convert Shorts to Standard Player** is enabled (default `On` in the Popup):
     - Shorts cards and shelf links on YouTube Home, Subscriptions, Search, and Channel pages have their `/shorts/<id>` links rewritten to `/watch?v=<id>` so clicking opens the standard Watch player directly with zero vertical-player flash.
     - Visiting a `/shorts/<id>` URL directly (via bookmark, external link, or address bar) immediately redirects to `/watch?v=<id>` via history replacement (`location.replace`), preserving clean browser **Back** button behavior.
   - Toggling **Convert Shorts to Standard Player** off in the Popup immediately stops redirecting `/shorts/` URLs and restores original `/shorts/<id>` hrefs on visible feed cards without requiring a page reload.

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian precision control deck engineered to look native inside both Dark (`html[dark]`, `#0f0f0f`) and Light (`#ffffff`) YouTube watch pages, paired with the crisp dark-slate (`#0B0F19` / `#111827`) Simulator & Rules Workbench.
- **Color Palette & Semantic States**:
  - *YouTube Dark Surface*: Translucent slate container (`rgba(255, 255, 255, 0.08)`, `1px solid rgba(255, 255, 255, 0.14)`), subtle row hairlines (`rgba(255, 255, 255, 0.07)`), active crimson speed chip (`#DC2626`), emerald VOD time-saved readout (`#34D399`), warm amber session/update accents (`#FDBA74` / `#FDE68A`), and accessible dark-slate warning toasts (`#111827` with `#F59E0B` border).
  - *YouTube Light Surface*: Clean tinted surface (`rgba(15, 23, 42, 0.04)`, `1px solid rgba(15, 23, 42, 0.14)`), crisp `#0F172A` primary text, `#047857` emerald saved-time text (meeting WCAG AA 4.5:1 on light backgrounds), and `#B45309` session/update accents.
- **Typography & Spatial Math**:
  - Strict `font-variant-numeric: tabular-nums` across all multipliers, seek intervals, remaining times, and time-saved counters.
  - Row 2 width budget (`~244px` presets + `~186px` Style B seek capsules = `~430px`) and Row 3 width budget (`~220px` fine controls + saved time + `~124px–184px` italic Rule slot = `~344px–404px`) maintain `50px–80px+` of open center breathing room even inside Tight Split (`504px` outer / `484px` inner).
  - Italic styling on Row 3’s lower-right Rule cluster visually separates standby/potential rule actions from Row 1’s upright active playback telemetry.

### Interactive Feedback & Motion

- **Zero-Jitter Updates**: In-place DOM updates mutate text nodes (`timeEl`, `savedTimeEl`, `ruleSlot`) during playback ticks without rebuilding the toolbar DOM tree, keeping hover states and focus rings uninterrupted.
- **Compositor-Only Toast Feedback**: Player corner notifications (`"Rewound 10s"`, `"Saved Rule · 1.75×"`, `"Converted Short to Watch player"`) and amber lock warnings animate strictly via `opacity` and `transform` (`150ms` cubic-bezier) with `prefers-reduced-motion` support.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Mounting Above `#title` Inside `#above-the-fold` vs. Inside `#top-row`**
  - *Chosen Approach*: Inject `.cadence-watch-bar` as the first child of `ytd-watch-metadata #above-the-fold` (with fallback to `ytd-watch-metadata` before `#title`), styled as a full-width (`width: 100%; box-sizing: border-box`) 3-row block.
  - *Why*: `#above-the-fold` spans 100% of `#primary` without competing with `#owner` or `#actions`, completely eliminating Issue #18’s right-panel overlap and button wrapping across every YouTube mode.
  - *Alternatives Considered*: Mounting inside `#owner` with responsive wrapping (rejected because it still compresses channel names and pushes `#actions` onto a second row).
- **Decision 2 — Dual-Layer Shorts Conversion (Anchor Rewriting + History-Safe `location.replace`)**
  - *Chosen Approach*: Rewrite `<a href*="/shorts/">` attributes (storing original `/shorts/...` URLs in a `data-cadence-orig-shorts-href` attribute so toggling off restores them cleanly) while also intercepting `/shorts/<id>` page loads and `yt-navigate-start` / URL changes via `location.replace('/watch?v=' + id)`.
  - *Why*: Rewriting feed links avoids loading the heavy vertical Shorts DOM altogether when clicking on YouTube, while `location.replace` handles direct external links without trapping the user’s browser Back button in an infinite redirect loop.
  - *Alternatives Considered*: `location.href = ...` push navigation only (rejected because clicking Back from `/watch?v=id` hits `/shorts/id` and immediately bounces forward again).
- **Decision 3 — Omitting "Saved Time" on All Live Broadcasts**
  - *Chosen Approach*: Render `Saves Xm Ys` exclusively when `!isLive && !isAd && Number.isFinite(rawDurationSec) && rawDurationSec > 0`.
  - *Why*: Live streams have an open-ended runtime even when rewound in DVR mode, and Row 1 already surfaces the actionable catch-up countdown (`−22m · Live in 22m @ 2.0×`).

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                 YOUTUBE DOM & MAIN-WORLD PAGE BRIDGE (v1.4.0)                │
│  • Shorts Guard: Rewrites /shorts/<id> feed links <-> /watch?v=<id> &        │
│    intercepts direct / SPA /shorts/ routes via history-safe location.replace │
│  • Seek & Telemetry Engine: Emits rawDurationSec + rawRemainingSec + Live    │
│    DVR state; executes SEEK_BY_SECONDS (-60,-30,-10,+10,+30,+60) safely      │
└───────────────────┬──────────────────────────────────────┬───────────────────┘
                    │ VIDEO_DETECTED / TIME_REMAINING      │ AD / LIVE_HEAD
                    │ (includes rawDurationSec)            │ BLOCKED EVENTS
                    ▼                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│               ISOLATED CONTENT CONTROLLER & STORAGE SYNC                     │
│  • Settings Schema v3: Adds convertShortsToWatch: true (preserves existing   │
│    rules, presets, defaultSpeed, autoRememberManualSpeed, stopAfterVideoEnds)│
│  • Mounts 3-Row .cadence-watch-bar above #title inside #above-the-fold       │
│  • ResizeObserver on Row 1 collapses tagline dynamically before collision    │
└───────┬───────────────────────────┬──────────────────────────┬───────────────┘
        │                           │                          │
        ▼                           ▼                          ▼
┌──────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│ 3-Row Watch Deck UI  │ │ 1-Click Rule & Options  │ │ Extension Popup &       │
│ • Row 1: Mode + Time │ │ • Save / Update / Clear │ │ Options Surfaces        │
│   + Dynamic Brand    │ │   Rule directly in bar  │ │ • "Convert Shorts to    │
│ • Row 2: Presets +   │ │ • Brand click sends     │ │   Standard Player"      │
│   Style B Capsules   │ │   CADENCE_OPEN_OPTIONS  │ │   toggle (On by default)│
│ • Row 3: ±0.05/Reset │ │   to service worker     │ │ • Updated v1.4.0        │
│   + VOD Saves + Rule │ │                         │ │   bar subtitle & docs   │
└───────┬──────────────┘ └────────────┬────────────┘ └────────────┬────────────┘
        │                             │                           │
        └─────────────────────────────┼───────────────────────────┘
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│            SYNCHRONIZED THREE-SURFACE RELEASE PARITY (v1.4.0)                │
│  ┌────────────────────────┐ ┌──────────────────────┐ ┌─────────────────────┐ │
│  │ Unpacked Extension     │ │ Dynamic .zip & Code  │ │ Interactive Web     │ │
│  │ Bundle & Changelog     │ │ Inspector Generator  │ │ Simulator Workbench │ │
│  └────────────────────────┘ └──────────────────────┘ └─────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Settings Schema Upgrade (`settingsSchemaVersion: 3`)**:
  - Adds `convertShortsToWatch: boolean` defaulting to `true` across fresh installs and existing `v1.3.x` upgrades (via non-destructive migration in background install handler, content runtime, options page, and web simulator storage normalizer) without altering any existing user channel rules or presets.
- **Extended Telemetry Payload (`rawDurationSec`)**:
  - Includes total VOD media duration (`rawDurationSec`) alongside `rawRemainingSec` in `TIME_REMAINING_UPDATE` messages so Row 3’s VOD-only `Saves Xm Ys` badge computes exact wall-clock savings (`Math.round(rawDurationSec - rawDurationSec / effectiveSpeed)`) without extra DOM polling.
- **Background Options Opener (`CADENCE_OPEN_OPTIONS`)**:
  - Adds a lightweight message handler in the service worker calling `chrome.runtime.openOptionsPage()` when the user clicks the top-right `Cadence - YouTube at your speed` signature inside the watch-page toolbar.

### Interactive Component & State Mapping

- **Row 2 Replay / Skip Ahead Clicks (`SEEK_BY_SECONDS`)**:
  - If `isAd` is active: blocks seek and triggers `"Skip locked during ad"` on both the floating amber bar toast and player corner toast.
  - If `isLive && isAtLiveHead`: negative deltas (`−10s`, `−30s`, `−60s`) seek backward from `seekableEnd`, flip `liveHeadHysteresisBehind = true`, and emit updated DVR lag + player toast (`"Rewound 30s"`); positive deltas (`+10s`, `+30s`, `+60s`) block and trigger `"Stream is currently at live end"`.
  - If `isLive && !isAtLiveHead` (Live DVR): negative deltas seek further back within `[seekableStart, seekableEnd]`; positive deltas advance `currentTime`, and if the target lands within `≤ 2s` of `seekableEnd`, invoke Cadence’s native `.ytp-live-badge` live-head handoff and `1.0×` clamp (`"Synced to Live · 1.0×"`).
  - If finite VOD: seeks `video.currentTime` clamped to `[0, duration]` (`player.seekTo` + `video.currentTime` fallback), clears any end-of-video hold banner if rewinding away from the end, and updates Row 1 remaining time immediately.
- **Row 3 Italic Rule Slot Clicks**:
  - `+ Save X× Rule`: Persists a custom Channel Rule for `currentChannel` at `effectiveSpeed`, clears `sessionOverride`, updates `Row 1` to `Channel Rule · X×`, switches `Row 3 Right` to *`Rule: X×` · `[Clear ×]`*, and shows `"Saved Rule · X×"`.
  - `Update → Y×`: Updates the existing Channel Rule’s `customSpeed` (setting `presetId: 'custom'`), clears `sessionOverride`, and shows `"Updated Rule · Y×"`.
  - `Clear ×`: Removes the matching Channel Rule from `chrome.storage.local`, clears `sessionOverride`, applies `defaultSpeed`, switches `Row 1` to `Default · Z×` and `Row 3 Right` to *`No rule` · `[+ Save Z× Rule]`*, and shows `"Cleared Rule · Default (Z×)"`.
- **Shorts Conversion Toggle & Simulator Parity**:
  - Toggling **Convert Shorts to Standard Player** in the Extension Popup or Simulator Workbench persists `convertShortsToWatch` immediately. In the Simulator Workbench, watch-page playback renders the exact new 3-Row Transport Deck above the video title, and a **Test Shorts Link (`/shorts/...`)** action in YouTube Home / Browse mode demonstrates live Shorts-to-Watch conversion (when enabled) vs. untransformed Shorts warning/state (when disabled).
