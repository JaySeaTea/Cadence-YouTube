# Session-Only Video Speed Bar & Zero-Lag Navigation Speed Lock (v1.2.0)

This `v1.2.0` batch release separates temporary single-video speed adjustments from permanent Channel Rules and eliminates the 2–3 second playback speed carryover when navigating between YouTube Home, browse feeds, and new videos.

## User Review & Critical Decisions

> [!IMPORTANT]
> Starting in `v1.2.0`, permanent **Channel Rules** are changed only when you intentionally set them in the **Cadence Toolbar Popup** or **All Channel Rules Options Page**. Both the **below-video speed bar** and **YouTube's built-in player gear menu** now adjust speed strictly for the current video session by default—so slowing down a dense lecture or fast speaker never overwrites your saved channel speed.

- **Confirmed Decision — Session-Only Below-Video Bar Controls**: Upgrade the below-video bar beside Subscribe with `0.75×`–`2.0×` quick chips (`0.75×`, `1.0×`, `1.25×`, `1.5×`, `1.75×`, `2.0×`), fine `−0.05×` / `+0.05×` steppers, and a one-click `Reset` action that snaps back to the channel's baseline speed.
- **Confirmed Decision — Player Gear Menu Behavior**: Make YouTube's built-in player speed menu session-only by default (`Remember Manual Changes` turned off by default, while keeping the toggle available in the popup for opt-in use).
- **Confirmed Decision — Toolbar Badge on YouTube Home & Browse Feeds**: Immediately clear the extension toolbar badge (and reset underlying player rate to `1.0×` default) whenever you leave a video for YouTube Home, Search, or Subscriptions.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. Converts Cadence's below-video control bar into a real-time **Session Speed Bar** for the active video only, complete with slower (`0.75×`) and fine-grained (`±0.05×`) controls plus a quick `Reset` back to your saved Channel Rule.
  2. Hooks YouTube's earliest SPA navigation lifecycle events (`pointerdown` card pre-detection, `yt-navigate-start`, `loadstart`, and verified player response matching) so leaving a video immediately clears the toolbar badge and opening any new video applies its Default (`1.0×`) or Channel Rule speed within milliseconds—before audio begins playing.
- **Target Audience / Persona**: Viewers who rely on consistent per-channel defaults across subscriptions, but frequently need to dial speed down or up for a single dense, technical, or fast-talking video without corrupting their saved rules.
- **Key Value**: Gives effortless per-video flexibility right below the player while making channel-to-Home-to-video transitions feel instantaneous and native.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Temporary Slowdown on a Fast Video**: You open an Educational channel with a saved `1.5×` rule. Cadence locks `1.5×` immediately (`Rule · 1.5×`). Halfway through a dense technical segment, you click `1.25×` (or `−0.05×` twice to `1.4×`, or `0.75×`) on the below-video bar. The bar label shifts to `Session · 1.25×` with a `Reset` button; your `1.5×` Channel Rule remains untouched in storage, and the next video from that channel starts back at `1.5×`.
  2. **Returning to YouTube Home**: You click the YouTube logo to return to Home (`/`). The toolbar icon badge immediately clears (`""`), and YouTube's hidden persistent `<video>` element resets to `1.0×` in the background.
  3. **Clicking Into a New Video**: You click a new video thumbnail on Home. Before the first audio frame plays, Cadence resets any prior rate, pre-matches the clicked card's channel metadata (if present) or holds `1.0×` default, and locks the verified Channel Rule speed within milliseconds as the player attaches—never playing 2–3 seconds at the previous video's speed.
  4. **Interactive Web Workbench Parity**: The Web Simulator adds a **YouTube Home** mode alongside `Watch Later`, `Creator Playlist`, `Single Video`, and `Live Stream` so you can test badge clearing, instant video-card click transitions, and the upgraded session-only below-video bar interactively.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Clean dark-studio instrumentation that blends naturally into YouTube's watch metadata row and the dark slate workbench.
  - *Color Palette & Mood*: Deep cool slate canvas (`--background`: `#0B0F19`), dark structural containers (`--card`: `#111827`) with `1px` borders (`#1E293B`), crisp light slate text (`#F1F5F9` primary, `#94A3B8` secondary), and crimson active speed states (`--accent`: `#DC2626`).
  - *Typography & Hierarchy*: `Plus Jakarta Sans` headings, `Public Sans` UI labels, and `JetBrains Mono` (`tabular-nums`) across all speed chips (`0.75×`–`2.0×`), `±0.05×` steppers, and toolbar readouts so widths never jitter when stepping speeds.
  - *Component Styling & Layout*: Compact single-row flex bar beside YouTube's Subscribe button with subtle divider between quick presets and `−`/`+`/`Reset` session controls; zero static pills.
- **Interactive Feedback & Motion**:
  - Immediate `≤100ms` playback rate response on chip or stepper click, paired with a concise top-right player toast (`Session speed 1.25× · Channel rule stays 1.5×` or `Reset to 1.5× channel rule`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Strict Separation Between Session Controls (In-Page) and Rule Controls (Popup & Options)**
  - *Chosen Approach*: Below-video bar interactions and native YouTube gear-menu adjustments update an in-memory `sessionOverrideSpeed` scoped strictly to the current `videoId` without writing to `chrome.storage.local`. Only the Cadence Toolbar Popup and Options Page write persistent Channel Rules (unless the user explicitly turns on `Remember Manual Changes`).
  - *Why*: Eliminates accidental rule overwrites when adapting to a single video's speaker pace or audio quality, while keeping permanent channel assignment one click away in the toolbar popup.
  - *Alternatives Considered*: Adding a "Save vs. Temporary" toggle switch inside the below-video bar was passed over to keep the YouTube watch row compact and single-purpose.

- **Decision 2: Two-Stage Zero-Lag Speed Lock (`yt-navigate-start` Reset + Video-ID-Verified Metadata Burst)**
  - *Chosen Approach*:
    1. Immediately reset player rate to `defaultSpeed` (`1.0×`) and clear the toolbar badge on `yt-navigate-start` and whenever the URL leaves `/watch` or `/live` (backed by tab URL monitoring in the service worker).
    2. Capture pre-navigation channel hints when clicking a video card on YouTube Home/Search/Playlists, run a `40ms` high-frequency metadata check during navigation, and **strictly verify** that player response and `#owner` DOM nodes match the new URL's `videoId` before applying a rule—re-enforcing target speed synchronously on `<video>` `loadstart`, `loadedmetadata`, and `playing`.
  - *Why*: Previously, YouTube's reused `<video>` element kept the prior video's `playbackRate` for 2–3 seconds while the watch page hydrated, and stale `#owner` DOM nodes from the previous video could delay or confuse detection. Resetting on navigation start plus `videoId`-verified burst detection eliminates both stale speed carryover and late switching.
  - *Alternatives Considered*: Waiting for `yt-navigate-finish` was the root cause of the 2–3 second delay because YouTube begins streaming media before full page layout completion.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                        YouTube SPA Lifecycle (v1.2.0)                        │
│                                                                              │
│  [Watch Video A @ 2.0×] ──(Click Home)──▶ [YouTube Home / Browse Feed]       │
│                                            • Reset <video> rate to 1.0×      │
│                                            • Clear Toolbar Badge ("")        │
│                                            • Clear Session Override          │
│                                                       │                      │
│                           (Click Video B Thumbnail)   ▼                      │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Zero-Lag Video Start Pipeline (<50ms)                                  │  │
│  │ 1. Card Click Hint + yt-navigate-start → Pre-lock Default / Rule Speed │  │
│  │ 2. 40ms Burst Poll verifies videoDetails.videoId === URL videoId       │  │
│  │ 3. Enforces target rate on loadstart / loadedmetadata / playing        │  │
│  └───────────────────────────────┬────────────────────────────────────────┘  │
│                                  ▼                                           │
│  ┌──────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ Below-Video Session Bar (Temporary)  │  │ Toolbar Popup & Options Page │  │
│  │ • 0.75×..2.0× chips + ±0.05× + Reset │  │ • Category Presets & Stepper │  │
│  │ • Updates sessionOverrideSpeed ONLY  │  │ • Saves persistent Channel   │  │
│  │ • Never alters saved Channel Rules   │  │   Rules to Chrome Storage    │  │
│  └──────────────────────────────────────┘  └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Ephemeral Video Session State (Per Tab, In-Memory)**:
    - `currentVideoId`: Active YouTube `v=` or `/live/` identifier; changing `currentVideoId` automatically clears `sessionOverrideSpeed`.
    - `baselineSpeed`: Resolved from the matched `ChannelRule` (or `settings.defaultSpeed` `1.0×`).
    - `sessionOverrideSpeed: number | null`: Set when clicking any control in the below-video bar (or YouTube's player gear menu when `autoRememberManualSpeed` is `false`). Clicking `Reset` sets `sessionOverrideSpeed = null` and restores `baselineSpeed`.
  - **Default Extension Settings (`v1.2.0`)**:
    - `autoRememberManualSpeed` defaults to `false` (migrated once via `settingsSchemaVersion: 2` on extension update so existing Chrome installations adopt session-only manual adjustments cleanly).

- **Interactive Component & State Mapping**:
  - **Below-Video Session Bar (`#cadence-owner-bar` & Simulator Bar)**:
    - Displays `Session · X.XX×` when `sessionOverrideSpeed !== null`, or `Rule · X.XX×` / `Default · 1.0×` when at baseline.
    - Clicking `0.75×`, `1.0×`, `1.25×`, `1.5×`, `1.75×`, `2.0×` or `−0.05×` / `+0.05×` sets `sessionOverrideSpeed`, immediately updates `<video>.playbackRate` and the toolbar badge readout for the active tab, and leaves `chrome.storage.local.rules` untouched.
    - Clicking `Reset` clears `sessionOverrideSpeed`, reapplies `baselineSpeed`, and updates the bar and badge immediately.
  - **Toolbar Popup Interaction**:
    - Shows the current active playback speed (noting if a temporary session override is active) and saves permanent Channel Rules (clearing any temporary `sessionOverrideSpeed` so the newly saved rule takes immediate effect).
  - **Browse / Home Route Transition**:
    - Both the `MAIN`-world navigation listener (`yt-navigate-start` / `popstate` / route watcher) and `background.js` (`chrome.tabs.onUpdated`) clear the tab badge and reset playback speed to `defaultSpeed` (`1.0×`) the moment a tab navigates away from `/watch` or `/live`.
