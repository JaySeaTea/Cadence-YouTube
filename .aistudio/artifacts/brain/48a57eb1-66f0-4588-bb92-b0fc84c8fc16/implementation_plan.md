# Cadence v1.3.5 — Live DVR Handoff, Ad Speed Lock & Stable Toolbar Geometry

Deliver the **v1.3.5** polish release uniting smooth live DVR catch-up with automatic native YouTube `LIVE` badge activation (**#14, #17**), strict bi-directional playback speed locking during ads with post-ad session override restoration (**#15**), and zero-shift below-video toolbar label geometry when stepping speeds (**#16**).

## User Review & Critical Decisions

> [!IMPORTANT]
> Every product and UX preference from your issue review is locked in below, with one recommended interactive testing convenience added for the Simulator Workbench.

- **Confirmed — Release Scope (`v1.3.5`)**: Bundles Issues **#14**, **#17**, **#15**, and **#16** into a cohesive watch-page & live-stream stability patch (`v1.3.4` → `v1.3.5`) ahead of `v1.4.0` (Shorts Conversion + Skip/Replay) and `v1.5.0` (Watch Later Cleanup).
- **Confirmed — Fixed-Width Speed Readout with Compact Numbers (#16)**: Preserves compact speed formatting (`1.8×`, `1×`, `1.75×` — never padded to `1.80×`) inside a fixed-width `tabular-nums` label slot so clicking `+0.05` / `−0.05` or switching between `Default`, `Rule`, and `Session` never shifts the buttons under the cursor or alters the toolbar border width.
- **Confirmed — Ad Speed Lock & Session Override Restoration (#15)**: Blocks speed adjustments in **both directions** (faster and slower) while an ad is playing, surfaces the exact warning copy **`"Speed locked during ad"`** across the below-video amber toast, upper-right player warning toast, and popup banner, and **automatically restores any active pre-ad Session override** (or saved Channel Rule) the instant a pre-roll or mid-roll ad finishes.
- **Confirmed — True Live-Head Handoff & Native Badge Sync (#14 & #17)**: Smooths YouTube’s 2–5 second DASH segment arrival jitter during accelerated DVR catch-up so the behind-live and catch-up counters tick down monotonically instead of bouncing upward, and triggers YouTube’s native `LIVE` badge handoff upon reaching the live buffer edge so YouTube’s red `LIVE` indicator activates alongside Cadence’s `1.0×` reset.
- **Recommended Default — One-Click Mid-Roll Ad Test in Workbench**: Adds a compact **`Simulate Ad (5s)`** control to the Interactive YouTube Workbench so you can test pre-roll/mid-roll speed locking, `"Speed locked during ad"` toasts, dimmed controls, and post-ad Session override restoration directly in the preview alongside your unpacked extension test.

---

## 1. Overview & Core Concept

- **What It Does**: Eliminates the remaining rough edges in Cadence’s watch-page playback loop—ensuring accelerated live DVR catch-up crosses the finish line cleanly into YouTube’s true live edge, preventing confusing speed clicks during unskippable or mid-roll ads while preserving your session speed across ad breaks, and anchoring the below-video toolbar’s width so rapid `±0.05×` clicks stay rock-steady under your pointer.
- **Target Audience / Persona**: Daily YouTube viewers who rely on Cadence’s below-video toolbar, keyboard shortcuts, and popup to catch up on live broadcasts, fine-tune lecture/podcast speeds in `0.05×` increments, and watch ad-supported videos without losing their temporary session speed after mid-roll breaks.
- **Key Value**: Predictable, zero-jitter control across every playback state (VOD, Live DVR catch-up, Synced Live Head, and Pre/Mid-Roll Ads) with 1:1 parity between the Chrome extension and the Interactive Web Workbench.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Catching Up to Live via Accelerated Playback (#14 & #17)**:
   - While rewound on a live stream and playing above `1.0×` (e.g., `1.5×` or `2.0×`), the below-video duration readout (`−24s · Live in 48s @ 1.5×`) counts down smoothly without jumping upward by 2–4 seconds each time YouTube appends a new DASH media segment.
   - As accelerated playback reaches YouTube’s live buffer horizon (within the live-edge handoff threshold or buffered ceiling), Cadence automatically invokes YouTube’s native live-head resync—activating YouTube’s red **`LIVE`** player badge, snapping Cadence’s indicator to **`● Live`**, clearing any `> 1.0×` session override, and clamping active playback cleanly to `1.0×`.
2. **Attempting Speed Changes During Pre-Roll or Mid-Roll Ads (#15)**:
   - When YouTube enters an ad break (`ad-showing` / `ad-interrupting`), Cadence hides the remaining-time readout and subtly dims all below-video speed chips (`0.75×`–`2.0×`), `−0.05`, `+0.05`, and `Reset` (`aria-disabled="true"`), while keeping them clickable so viewers never wonder why controls stopped responding.
   - Clicking any speed chip, `−0.05`, `+0.05`, `Reset`, Popup speed/preset button, player gear option, or pressing `Shift + >` / `Shift + <` during an ad blocks the change and immediately displays **`"Speed locked during ad"`** via the floating amber toolbar toast and upper-right player warning toast (plus the popup warning banner if clicked from the popup).
   - When the ad ends and the main video resumes, Cadence automatically restores the exact pre-ad **Session override** (e.g., `Session · 1.85×`) or saved **Channel Rule** without requiring the viewer to re-select their speed.
3. **Stepping Speeds with `+0.05` / `−0.05` (#16)**:
   - Clicking `+0.05` repeatedly across `1.75×` → `1.8×` → `1.85×` → `2×` keeps compact numeral formatting while holding the left status label (`Session · 1.8×`, `Rule · 1.5×`, `Default · 1×`) inside a fixed-width `tabular-nums` slot.
   - Neither the `+0.05` / `−0.05` buttons nor the outer toolbar border expand or contract by a single pixel during fine stepping.

### Visual Identity & Theme

- **Aesthetic Direction**: Domain-native YouTube control chrome paired with the crisp dark-slate (`#0B0F19` / `#111827`) engineering workbench—single-elevation surfaces, clean hairline dividers, and zero decorative clutter.
- **Color Palette & Semantic States**:
  - *Ad-Locked & Live-End Warning Surfaces*: High-contrast deep slate toast background (`#111827`), translucent amber border (`rgba(245, 158, 11, 0.52)`), warm amber text (`#FDE68A`, exceeding WCAG AA 4.5:1), and compact amber warning triangle icon so blocked actions are never communicated by color alone.
  - *Dimmed Interactive Controls (`.is-ad-blocked` / `.is-live-blocked`)*: Subdued resting opacity (`0.42`) with subtle warm-amber hover feedback (`0.68` opacity, `rgba(245, 158, 11, 0.14)` tint) across both light and dark YouTube themes.
- **Typography & Spatial Math**:
  - Strict `font-variant-numeric: tabular-nums` across all multipliers and countdowns.
  - Fixed inline label geometry sized to accommodate the widest mode + compact multiplier combination (`Session · 1.75×`, ~`96px` / `9.5ch` inline-flex slot with right-aligned or stable multiplier positioning) so `1.75×` ↔ `1.8×` ↔ `1×` transitions produce `0px` horizontal delta.

### Interactive Feedback & Motion

- **Compositor-Only Transitions**: Warning toasts animate strictly via `opacity` and `transform` (`150ms` cubic-bezier) with full `prefers-reduced-motion` support and zero layout shift.
- **Clean State Recovery**: Any active `"Speed locked during ad"` toast clears automatically the moment the ad finishes and normal video playback resumes.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Guarded Native `.ytp-live-badge` Handoff on Passive Catch-Up (#14 & #17)**
  - *Chosen Approach*: Combine monotonic lag smoothing during active `> 1.01×` playback (ignoring minor `+1s` to `+4.5s` upward segment ticks unless paused or scrubbed backward) with a guarded one-shot `.ytp-live-badge.click()` + `1.0×` clamp as soon as accelerated playback enters YouTube’s live-head buffer threshold (`≤ 9s` verified lag or pinned within `≤ 1.2s` of `buffered.end` near `seekableEnd`).
  - *Why*: YouTube’s HTML5 live player holds a ~6–10 second DASH safety buffer unless explicitly snapped to the live head via its internal live controller. Clicking `.ytp-live-badge` programmatically once at the handoff boundary activates YouTube’s red `LIVE` badge and eliminates residual 6–10s lag oscillations without risking infinite seek loops (`explicitJumpToLiveUntil` cooldown).
  - *Alternatives Considered*: Raw `video.currentTime = seekableEnd` seeking without clicking the native badge (rejected because YouTube’s player chrome leaves the `LIVE` badge gray/inactive unless its internal live-head handler runs).
- **Decision 2 — Non-Destructive Ad State Isolation (#15)**
  - *Chosen Approach*: Track `isAd` explicitly in real-time telemetry (`TIME_REMAINING_UPDATE` and `VIDEO_DETECTED`), freeze `sessionOverride` mutations while `isAd` is true, and trigger an immediate speed re-application (`applyForCurrentChannel` + `SET_SPEED`) on the `isAd: true → false` transition.
  - *Why*: Mid-roll ads share the watch page’s URL `videoId` while temporarily swapping the media stream inside `#movie_player` at `1.0×`. Isolating ad state prevents YouTube’s `1.0×` ad reset from wiping out `sessionOverride` and guarantees custom speeds like `1.85×` resume the instant the creator’s video returns.
- **Decision 3 — Fixed Label Box vs. Decimal Zero-Padding (#16)**
  - *Chosen Approach*: Keep compact human-friendly numbers (`1.8×`, `1×`, `1.75×`) inside a fixed-width `inline-flex` label container (`tabular-nums`, `justify-content: space-between` between mode prefix and multiplier).
  - *Why*: Honors your preference for clean compact numbers while guaranteeing identical outer pixel width across 1-digit (`1×`), 2-digit (`1.8×`), and 3-digit (`1.75×`) speeds.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                   YOUTUBE PLAYER & MAIN-WORLD PAGE BRIDGE                    │
│  • Live DVR Tracker: Monotonic catch-up smoothing + one-shot .ytp-live-badge │
│    click handoff when >1.01× playback reaches live buffer horizon            │
│  • Ad Monitor: Detects ad-showing / ad-interrupting transitions, blocks      │
│    Shift+> / Shift+< & gear rate changes -> emits AD_SPEED_BLOCKED           │
└───────────────────┬──────────────────────────────────────┬───────────────────┘
                    │ TIME_REMAINING_UPDATE (isAd, isLive) │ AD_SPEED_BLOCKED /
                    │ VIDEO_DETECTED                       │ LIVE_HEAD_BLOCKED
                    ▼                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 ISOLATED CONTENT RUNTIME & POPUP CONTROLLER                  │
│  • Preserves sessionOverride { videoId, speed } untouched across ad breaks   │
│  • On isAd (true -> false): Re-applies pre-ad Session override or Rule       │
│  • Intercepts all bar / popup / shortcut speed actions while isAd === true   │
└───────────────┬─────────────────────────────┬────────────────────────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────────┐ ┌────────────────────────────────────────────┐
│  Below-Video Toolbar Surface  │ │  Player Corner & Extension Popup Surfaces  │
│  • Fixed-width compact label  │ │  • Upper-right warning toast:              │
│    ("Session · 1.8×" = 0px Δ) │ │    "Speed locked during ad"                │
│  • All controls dimmed during │ │  • Native red YouTube LIVE badge active    │
│    ads (.is-ad-blocked)       │ │    on both click & accelerated catch-up    │
│  • Floating amber bar toast   │ │  • Popup ad-lock banner & disabled saves   │
└───────────────┬───────────────┘ └─────────────────────┬──────────────────────┘
                │                                       │
                └───────────────────┬───────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│            SYNCHRONIZED THREE-SURFACE RELEASE PARITY (v1.3.5)                │
│  ┌────────────────────────┐ ┌──────────────────────┐ ┌─────────────────────┐ │
│  │ Unpacked Extension     │ │ Dynamic .zip & Code  │ │ Interactive Web     │ │
│  │ Bundle & Changelog     │ │ Inspector Generator  │ │ Simulator Workbench │ │
│  └────────────────────────┘ └──────────────────────┘ └─────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Ad-Aware Telemetry State (`remainingState.isAd`)**: Extends the content runtime’s real-time player state and active-channel popup handshake (`CADENCE_GET_ACTIVE_CHANNEL`) with an explicit boolean `isAd` flag so the below-video bar, keyboard shortcut guard, and Toolbar Popup stay synchronized throughout pre-roll and mid-roll ads.
- **Monotonic Catch-Up Smoothing State**: Tracks the lowest verified lag observed during continuous unpaused `> 1.01×` live catch-up (`minCatchupLagSec`), suppressing transient `+1s` to `+4.5s` DASH segment jumps while immediately resetting if the viewer pauses, drops speed to `≤ 1.0×`, or scrubs backward (`currentTime` jump `< -1.5s`).
- **Pre-Ad Session Persistence**: Keeps `sessionOverride = { videoId, speed }` keyed to the main watch URL’s `videoId` throughout any ad break, re-pushing the resolved speed (`sessionOverride` → `Channel Rule` → `Default`) on ad exit.

### Interactive Component & State Mapping

- **Passive Accelerated Live Catch-Up Completion (#14 & #17)**: When `liveHeadHysteresisBehind` is active and `mediaRate > 1.01` reaches `verifiedLagSec <= 9` (or `buffered.end - currentTime <= 0.8` while `verifiedLagSec <= 13`), `pageBridgeJs` sets `explicitJumpToLiveUntil`, clicks `.ytp-live-badge` if not already at head, clamps playback to `1.0×`, and emits `isAtLiveHead: true, dvrLagSec: 0` so both YouTube’s red `LIVE` badge and Cadence’s `● Live` pill activate together.
- **Ad Speed Attempt Across Any Surface (#15)**: Clicking dimmed toolbar chips/`±0.05`/`Reset`, clicking Popup speed/preset buttons, using the player gear menu, or pressing `Shift + >` / `Shift + <` while `isAd` is active leaves `sessionOverride` and saved rules untouched and displays `"Speed locked during ad"`.
- **Mid-Roll Ad Completion (#15)**: When `isAd` transitions from `true` to `false` (or the 5-second simulated ad completes in the Workbench), any active ad-lock toast clears, controls un-dim, and Cadence immediately re-applies the active `sessionOverride` or Channel Rule to `<video>` and `#movie_player`.
- **Toolbar Fine-Step Clicks (`±0.05×`) (#16)**: Updating speed from `1.75×` → `1.8×` → `1.85×` updates text inside the fixed-width `.cadence-bar-label` container (`tabular-nums`), keeping every button’s X-coordinate stationary.
