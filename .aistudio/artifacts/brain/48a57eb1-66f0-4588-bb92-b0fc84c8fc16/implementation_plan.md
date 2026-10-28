# Below-Video Toolbar Live-End Notice & Control Feedback (v1.3.4)

Deliver immediate, unmistakable feedback on the below-video speed toolbar whenever a viewer clicks a playback speed above `1.0×` on a live stream synced at the live edge—matching the crisp `"Stream is currently at live end"` amber notice already shown in the toolbar popup across both the Chrome extension and the interactive Live Simulator.

## User Review & Critical Decisions

> [!IMPORTANT]
> All core UX preferences from our clarification step are locked in below. One minor release-version detail is noted with a recommended default before implementation begins.

- **Confirmed — Toolbar Notification Style**: Display `"Stream is currently at live end"` as a **floating amber toast anchored directly to the below-video toolbar**, avoiding any horizontal layout shift or line wrapping in YouTube’s channel row.
- **Confirmed — Dual-Surface Toast Behavior**: Clicking a blocked speed (`> 1.0×`) on the below-video toolbar triggers **both** the toolbar-anchored amber toast and the upper-right video player corner toast (with active watch-player targeting hardened so the player toast never attaches to a hidden hover-preview container).
- **Confirmed — Visual State of `> 1.0×` Buttons at Live End**: Preset speeds above `1.0×` (`1.25×`, `1.5×`, `1.75×`, `2.0×`) and the `+0.05` stepper (whenever stepping up would exceed `1.0×`) appear **subtly dimmed while synced at the live edge**, yet remain **clickable** so pressing them actively surfaces the live-end notice and reinforces `1.0×`.
- **Recommended Default — Patch Version Bump (`v1.3.4`)**: Advance the extension release label from `v1.3.3` to `v1.3.4` across the unpacked extension, exported `.zip` bundle, and simulator workbench footer so reloading on `chrome://extensions` visibly confirms the updated build is active.

---

## 1. Overview & Core Concept

- **What It Does**: Enhances Cadence’s below-video session speed bar during live broadcasts so viewers can immediately tell at a glance which speeds are constrained at the live edge—and receive an eye-level amber `"Stream is currently at live end"` toast right at their cursor whenever they click an above-`1.0×` speed while caught up to live.
- **Target Audience / Persona**: YouTube viewers who move seamlessly between VOD lectures, DVR-rewound live streams (catching up at `1.25×`–`2.0×`), and real-time live broadcasts using the in-page below-video speed bar rather than opening the browser toolbar popup.
- **Key Value**: Eliminates silent or out-of-sight feedback when clicking speeds above `1.0×` below the video player. Viewers get instant visual confirmation right where they clicked, plus consistent dual feedback on the video viewport and 1:1 parity inside the interactive Live Simulator.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Watching a Live Stream Synced at the Live Edge (`Live`)**:
   - The below-video toolbar displays the red `Live` indicator and clamps active playback to `1.0×` (even if the channel has a saved `1.5×` or `2.0×` rule).
   - Speeds `0.75×`, `1.0×`, and `−0.05` render at full contrast (`1.0×` highlighted active in crimson).
   - Speeds `1.25×`, `1.5×`, `1.75×`, `2.0×`, and `+0.05` (while at `1.0×`) appear subtly dimmed with a clear hover explanation (`"Unavailable while synced at live end — rewind stream to speed up"`).
2. **Clicking a Blocked Speed (`> 1.0×` or `+0.05` at `1.0×`) on the Below-Video Toolbar**:
   - Playback remains locked at `1.0×` and any stale session override is cleared.
   - A compact floating amber toast reading `"Stream is currently at live end"` animates smoothly just above the below-video toolbar, right over the speed controls, while the upper-right player corner toast simultaneously confirms `"Stream is currently at live end"`.
   - Both notices auto-dismiss cleanly after ~2.4 seconds without shifting neighboring YouTube Subscribe/Join buttons or wrapping metadata rows.
3. **Selecting a Slower Speed (`< 1.0×`) at the Live Edge**:
   - Clicking `0.75×` or `−0.05` applies immediately as a session speed; because stepping `+0.05` from `0.75×` (`-> 0.80×`) stays below `1.0×`, the `+0.05` button automatically un-dims until playback reaches `1.0×` again, and the stream naturally begins drifting into DVR lag.
4. **Rewinding Behind Live (DVR Catch-Up Mode) & Returning to Live**:
   - As soon as the viewer scrubs back or pauses long enough to enter DVR lag (`−30s · Live in 1m @ 1.5×` or `30s behind Live`), any active live-end notice immediately clears and all `1.25×`–`2.0×` and `+0.05` controls return to full contrast for catch-up playback.
   - Clicking `Live` (either in YouTube’s player chrome or Cadence’s below-video duration slot) jumps back to the live edge, resets speed to `1.0×`, and restores the subtle dimmed state on `> 1.0×` chips.

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian, domain-native YouTube control surface inside the extension and crisp dark-slate developer workbench in the simulator—zero decorative clutter, single-elevation surfaces, and strict `tabular-nums` alignment on all speed multipliers.
- **Color Palette & Contrast**:
  - *Toolbar & Popup Amber Warning Toast*: Deep slate surface (`#111827`) with a translucent amber hairline border (`rgba(245, 158, 11, 0.48)`), warm high-contrast amber text (`#FDE68A`, exceeding WCAG AA 4.5:1 against `#111827`), and a compact amber warning indicator so semantic state is never conveyed by color alone.
  - *Player Corner Warning Variant*: Matching amber-tinted border and warm text accent when the player corner toast surfaces a live-end block, distinguishing a blocked action from routine neutral speed confirmations.
  - *Subtle Dimmed Control State*: Muted opacity (~`0.42` resting, ~`0.65` on hover) on blocked `> 1.0×` buttons in both light and dark YouTube themes, preserving legibility without competing with active `<= 1.0×` choices.
- **Typography & Spatial Composition**:
  - Single-line `whitespace-nowrap` toast copy (`11px`–`12px`, medium weight `500`, `tabular-nums`) anchored `calc(100% + 6px)` above the speed chip group with `z-index` layered cleanly above YouTube’s watch metadata row.

### Interactive Feedback & Motion

- **Compositor-Only Transitions**: Animate only `opacity` and `transform` (`translateY(4px) -> translateY(0)`) within `150ms` using smooth easing; zero layout geometry animation.
- **Repeat-Click Responsiveness**: Clicking multiple dimmed `> 1.0×` chips in succession resets the 2.4-second auto-hide timer cleanly and keeps the floating amber notice steady without flicker.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Floating Anchored Toast vs. Inline Toolbar Expansion**
  - *Chosen Approach*: Absolutely positioned floating amber pill anchored directly above the below-video toolbar (`pointer-events: none`), paired with safe overflow visibility on the toolbar container.
  - *Why*: YouTube’s watch metadata row packs the channel avatar, channel name, Subscribe button, Join/Clip actions, and Cadence’s toolbar into a tight flex container. Expanding text inline inside the bar causes jarring horizontal jumps or forces the entire toolbar onto a second row for 2.4 seconds. A floating anchor delivers zero layout shift right at the user’s focal point.
  - *Alternatives Considered*: Temporarily replacing the preset chip row with warning text (rejected because hiding interactive controls mid-click feels disorienting).
- **Decision 2 — Preserving Active Toolbar Toast Across Live Telemetry Re-Renders**
  - *Chosen Approach*: Track active toolbar toast state (`message` and `expiresAt` timestamp) in memory alongside the timer so any background telemetry tick or speed-clamp re-render of the below-video bar preserves the visible toast seamlessly until its timer elapses.
  - *Why*: During live streams, DVR telemetry updates arrive roughly once per second and clamping speed triggers an immediate toolbar re-render. Storing expiry state prevents background DOM refreshes from prematurely wiping out a freshly triggered notice.
- **Decision 3 — Active Watch-Player Scoping for the Upper-Right Corner Toast**
  - *Chosen Approach*: Resolve the active watch player inside `ytd-watch-flexy` first before falling back to generic player lookup when mounting the upper-right player corner toast.
  - *Why*: YouTube’s SPA keeps hidden inline/hover preview player nodes in the DOM that share the same player ID. Scoping to the active watch container guarantees both the toolbar amber toast and the upper-right video player toast appear reliably together every time.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                     LIVE STREAM AT LIVE EDGE (DVR = 0s)                    │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
          User clicks > 1.0× chip or +0.05 (at 1.0×) on Below-Video Bar
          (or presses Shift + > keyboard shortcut while bar is mounted)
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                  Isolated Content Runtime / Simulator State                │
│  1. Detect liveAtHead && requestedSpeed > 1.01                             │
│  2. Clear sessionOverride -> enforce 1.0× via MAIN-world Page Bridge       │
│  3. Record barToastState { text, expiresAt: now + 2400ms }                 │
│  4. Re-render toolbar with > 1.0× & +0.05 dimmed-clickable modifiers       │
└───────────────────┬────────────────────────────────────┬───────────────────┘
                    │                                    │
                    ▼                                    ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────┐
│   Below-Video Toolbar Surface        │  │   Active Watch Player Surface    │
│  • Floating Amber Toast above chips  │  │  • Scoped to ytd-watch-flexy     │
│    "Stream is currently at live end" │  │  • Upper-right corner toast      │
│  • Preserved across DVR re-renders   │  │    with amber warning styling    │
│  • Auto-clears on rewind / <= 1.0×   │  │  • Auto-hides after timer        │
└──────────────────────────────────────┘  └──────────────────────────────────┘
                    │                                    │
                    └─────────────────┬──────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│             Synchronized Three-Surface Release Parity (v1.3.4)             │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌─────────────────────┐ │
│  │ Unpacked Extension   │ │ Dynamic .zip & Code  │ │ Interactive Web     │ │
│  │ Runtime Bundle       │ │ Inspector Generator  │ │ Simulator Workbench │ │
│  └──────────────────────┘ └──────────────────────┘ └─────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Toolbar Toast Lifecycle State**: Lightweight transient state holding the active warning message, warning flag, expiry timestamp (`expiresAt`), and timeout handle—shared conceptually by both the extension’s content runtime and the React simulator’s workspace state.
- **Dimmed-Control Derivation (Stateless Computed Flag)**:
  - A speed preset chip is marked `is-live-blocked` when `isLive && isAtLiveHead && chipSpeed > 1.01`.
  - The `+0.05` fine-step control is marked `is-live-blocked` when `isLive && isAtLiveHead && effectiveSpeed + 0.05 > 1.01`.
  - Controls retain `type="button"` without native `disabled` attributes, pairing `aria-disabled="true"` with active click listeners.

### Interactive Component & State Mapping

- **Blocked Toolbar Preset / `+0.05` Click at Live End**: Clears any session override, enforces `1.0×` playback rate and toolbar badge, sets the 2.4-second toolbar amber toast state, triggers the amber-accented upper-right player toast, and logs the blocked action in the simulator’s event log.
- **Keyboard Shortcut (`Shift + >`) Block at Live End**: When the MAIN-world bridge blocks a native speed-up shortcut at the live head and notifies the content runtime, both the player corner toast and the below-video toolbar amber toast trigger together if the below-video bar is enabled.
- **Valid `<= 1.0×` Click (`0.75×`, `1.0×`, `−0.05`) or DVR Rewind**: Immediately dismisses any visible live-end toolbar toast, applies the requested speed or DVR catch-up state, and updates button dimming dynamically.
- **SPA Video Navigation / Leaving Watch Page**: Resets toolbar toast state and clears active timers cleanly on route transitions or extension reload teardown.
