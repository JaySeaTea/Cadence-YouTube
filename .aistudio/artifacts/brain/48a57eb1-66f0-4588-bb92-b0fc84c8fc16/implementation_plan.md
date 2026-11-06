# Cadence v1.6.0 — Playback & Feed Controls, Real-Time Time Saved & Channel Rules Pagination

Cadence `v1.6.0` is a major feature update delivering three high-impact enhancements:
1. **Disable Embedded YouTube Video Previews (#23)**: Turn off distracting hover auto-play and moving thumbnail previews across Home, Search, Feeds, and Sidebar while preserving focused `/@channel` page trailers (`settingsSchemaVersion: 4 → 5`, defaulting to ON).
2. **Real-Time Per-Video & Global Time Saved (#24)**: Continuously bank genuine wall-clock time saved at `> 1.0×` playback, preserve savings across mid-video speed adjustments on Row 3, append `"You saved {time} with Cadence!"` to End-of-Video stop banners, show a lifetime time-saved badge in the Popup footer, and provide a dedicated Options stat card with an inline `"Forget Time Saved"` confirmation reset and JSON backup/restore.
3. **Paginate, Sort & Filter Saved Channel Rules (#26)**: Keep the Options page clean and scalable with 10/25/50/All page size selection, instant channel name/handle search, preset category filter controls, and multi-criteria sorting (Recently updated, Channel Name A–Z, Speed highest–to–lowest).

---

## User Review & Critical Decisions

> [!IMPORTANT]
> All product behaviors and UI configurations below incorporate your confirmed choices from Phase 1 interview questions and earlier design alignment:

- **Confirmed Decision 1 — #23 Default State & Scope**: `disableVideoPreviews: true` defaults to ON for both new installs and schema-upgraded installs (`settingsSchemaVersion: 4 → 5`). Thumbnail hover previews (video player `#inline-preview-player` / `ytd-video-preview` and animated overlays `#mouseover-overlay` / `ytd-moving-thumbnail-renderer`) are disabled on Home, Search, Feeds, and Sidebar. `/@channel` featured trailers (`ytd-channel-video-player-renderer`) remain completely unblocked.
- **Confirmed Decision 2 — #23 UI Placement**: A 5th toggle is added to the Extension Popup toolbar (`Disable Video Previews`) and mirrored inside a new **Playback & Feed Controls** card on the Options page and web companion.
- **Confirmed Decision 3 — #24 Time Saved Math & Invariants**:
  - Accumulates real wall-clock savings only when `playbackRate > 1.0` (`!paused && !isAd && !isLive`).
  - No negative deltas for `< 1.0×` slowed playback.
  - Never inflates on skips (`+60s`) or timeline scrubs (`dtWall` clamped to $\le 1.5\text{s}$).
  - Credits partial watches continuously (flushed periodically and on tab close/pause/navigation).
  - Row 3 watch bar displays `bankedSaved + max(0, remainingProjectedSaved)` (`Saves Xm Ys`), preserving accrued savings across mid-video speed adjustments.
  - End-of-video banner appends `"You saved {time} with Cadence!"` whenever `bankedSaved ≥ 1s`; omitted cleanly if no accelerated playback was used.
  - Reset flow on the Options page requires exact inline input matching `"Forget Time Saved"` before clearing.
- **Confirmed Decision 4 — #26 Rules Table Pagination, Sorting & Filtering**:
  - **Page Size**: Defaults to 10 rules per page with a selector for 25, 50, or All.
  - **Sorting**: Multi-mode selector with Recently updated (default), Channel Name A to Z, and Speed highest to lowest.
  - **Search & Filter**: Real-time instant search input matching channel name or handle, paired with clean preset category filter buttons (All, Podcast, Lecture, Music, Tutorial, Custom).
- **Confirmed Decision 5 — Chrome Web Store Studio Locked at `v1.5.1`**: All runtime code, manifests, and simulator features advance to **`v1.6.0`**, while the Promo Frame & CWS Screenshot Studio remains locked at **`v1.5.1`** to preserve initial store submission parity.

---

## 1. Overview & Core Concept

- **What It Does**:
  - Silences auto-playing video teasers on browsing surfaces without breaking creator channel pages.
  - Quantifies the viewer's productivity gains with live per-video and cumulative lifetime time-saved metrics.
  - Transforms the All Channel Rules options view into an organized, searchable, and paginated directory.
- **Target Audience / Persona**: High-volume YouTube learners, researchers, and podcast listeners who curate dozens of channel rules and want an intentional, quiet browsing experience with verifiable time savings.
- **Key Value**: Focus and efficiency—no unprompted thumbnail noise, seamless management of large rule lists, and clear validation of hours saved with Cadence.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Browsing YouTube Feeds Without Hover Distractions (#23)**:
   - When hovering over video thumbnails on Home (`/`), Search (`/results`), Subscriptions (`/feed/subscriptions`), or Watch Sidebar (`#secondary`), static thumbnails remain still and quiet.
   - Visiting a creator's dedicated page (e.g. `youtube.com/@mkbhd`) allows the featured channel trailer to play normally.
   - The user can toggle this behavior at any time via the 5th switch in the Toolbar Popup or under "Playback & Feed Controls" on the Options page.
2. **Watching Videos & Accruing Time Saved (#24)**:
   - Starting a 20-minute video at `1.5×`: Row 3 displays `Saves 6m 40s`.
   - After watching 10 wall-clock minutes (consuming 15 minutes of video, banking 5 minutes saved), the viewer switches to `1.0×`:
     - Row 3 continues to display `Saves 5m 00s` (the banked savings are preserved, rather than reverting to 0).
   - When the video reaches the end and stops, the banner reads:
     `Cadence stopped playback · Playlist auto-advance prevented · You saved 5m 00s with Cadence!`
   - If watched entirely at `1.0×` or `0.75×`, no savings line is displayed on the banner.
   - The Extension Popup footer displays `28 saved channel rules · 14h 32m saved`.
   - The Options page displays a lifetime stat card with a `Reset Counter` button. Clicking `Reset Counter` reveals an inline input: `"Type 'Forget Time Saved' to confirm"`. Typing the exact phrase and confirming resets the counter to 0.
3. **Managing Channel Rules with Pagination, Sorting & Search (#26)**:
   - Users with 15–100+ rules see a clean 10-item table with total count (`Showing 1–10 of 42 rules`).
   - Typing into the search bar instantly filters rows by channel title or `@handle`.
   - Clicking category filter buttons (`All`, `Podcasts`, `Lectures`, `Music`, `Tutorials`, `Custom`) narrows the view without reloading.
   - Changing sort order reorganizes rows instantly by recent activity, alphabetical name, or playback speed.
   - Changing page size (`10`, `25`, `50`, `All`) adjusts the table height and paginator controls accordingly.

### Visual Identity & Theme (Frontend Design Standards)

- **Palette**: Deep slate canvas (`#0B0F19` / `#0F172A`), structural card panels (`#111827`) with subtle border hairlines (`#1E293B` / rgba(148,163,184,0.2)), semantic emerald (`#059669` / `#34D399`) for positive time-saved callouts, and cadence crimson (`#DC2626`) for active accents.
- **Typography & Formatting**:
  - `Public Sans` and `Plus Jakarta Sans` for labels and headers.
  - `JetBrains Mono` with `tabular-nums` for all numeric counters, timers, and speed badges.
  - Zero-pill compliance: informational metadata (rule dates, total rule counts, elapsed time) is rendered as clean unboxed text with subtle typographic separators (`·`).
  - Category filters are rendered as segmented interactive button controls (`<button>`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Real-Time Math & Wall-Clock Clamping (#24)**:
  - *Chosen Approach*: Compute `dtWall = min(1.5, (now - lastTickMs) / 1000)` only when `!video.paused && !isAd && !isLive && video.playbackRate > 1.0`. Add `dtWall * (video.playbackRate - 1.0)` to `bankedSavedSec`.
  - *Why*: Immune to clock drift, video skips (`+60s`), scrubbing jumps, and background tab throttling. Mathematically guarantees that time saved reflects genuine viewer time reclaimed.
- **Decision 2 — Dual CSS Injection & Pointer/Media Blocking for Video Previews (#23)**:
  - *Chosen Approach*: Inject targeted CSS rules suppressing `ytd-video-preview`, `#inline-preview-player`, and `ytd-moving-thumbnail-renderer` inside feed containers, scoped by `:not(ytd-channel-video-player-renderer)` and body route markers.
  - *Why*: Instantaneous zero-overhead suppression that prevents network video buffer fetching on hover without breaking Polymer DOM bindings.
- **Decision 3 — Inline Reset Confirmation Modal (#24)**:
  - *Chosen Approach*: An inline confirmation card with text input requiring the exact string `"Forget Time Saved"` before enabling the reset button.
  - *Why*: Adheres strictly to the environment constraint forbidding `window.prompt` / `window.alert` while preventing accidental deletion of lifetime stats.
- **Decision 4 — Client-Side Rules Pagination & Instant Filtering (#26)**:
  - *Chosen Approach*: React/TypeScript state-driven pagination, sorting, and search running directly over the `rules` array in memory.
  - *Why*: Sub-millisecond filter latency with zero network calls, keeping the extension options page responsive regardless of rule count.

---

## 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    YouTube Browsing & Watch Surfaces                         │
│                                                                              │
│  Feed & Search Containers              Watch Page Player                     │
│  ┌─────────────────────────────┐       ┌──────────────────────────────────┐  │
│  │ Thumbnail Hover Previews    │       │ #movie_player & HTMLVideoElement │  │
│  │ (Suppressed via #23 rules)  │       │ • Real-time dtWall integration   │  │
│  └─────────────────────────────┘       │ • Banked + projected saved math  │  │
│                                        └────────────────┬─────────────────┘  │
│                                                         │ TIME_REMAINING_UPDATE
│                                                         │ (bankedSavedSec)   │
│                                                         ▼                    │
│                                        ┌──────────────────────────────────┐  │
│                                        │ Cadence Watch Deck & Stop Banner │  │
│                                        │ • Row 3: Saves Xm Ys             │  │
│                                        │ • End Banner: You saved X with…  │  │
│                                        └────────────────┬─────────────────┘  │
└─────────────────────────────────────────────────────────┼────────────────────┘
                                                          │ Flush increments
                                                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Extension Service Worker & Storage                      │
│                                                                              │
│   chrome.storage.local: {                                                    │
│     settings: { ..., disableVideoPreviews: true, settingsSchemaVersion: 5 }, │
│     totalTimeSavedSec: 52340,                                                │
│     rules: [ ... ], presets: [ ... ]                                         │
│   }                                                                          │
└───────────────────────┬──────────────────────────────────┬───────────────────┘
                        │                                  │
                        ▼                                  ▼
      ┌──────────────────────────────────┐  ┌──────────────────────────────────┐
      │   Extension Popup (popup.html)   │  │   Options Page (options.html)    │
      │   • 5th Toggle: Video Previews   │  │   • Playback & Feed Controls     │
      │   • Footer: X rules · Yh Zm saved│  │   • Lifetime Time Saved Card     │
      └──────────────────────────────────┘  │     (Forget Time Saved reset)    │
                                            │   • Paginated Channel Rules      │
                                            │     (Search, Sort, Category)     │
                                            └──────────────────────────────────┘
```

### Schema & Data Migration (`settingsSchemaVersion: 4 → 5`)
- `ExtensionSettings`: add `disableVideoPreviews: boolean` (default: `true`).
- Storage top-level key: `totalTimeSavedSec: number` (default: `0`).
- Background worker migration: upgrades existing version 4 settings to version 5 with `disableVideoPreviews: true` and initializes `totalTimeSavedSec: 0` if missing.
- Backup / Import JSON: includes `totalTimeSavedSec` alongside `settings`, `presets`, and `rules`.

---

## 5. Verification Plan

1. **Compilation & Syntax**: Run `npm run build:extension`, `node --check` across all generated extension scripts, `lint_applet` (`tsc --noEmit`), and `compile_applet` (`vite build`).
2. **Issue #23 Verification**:
   - Verify thumbnail hover on Home, Search, and Watch Sidebar does not trigger auto-play video or animated frame cycling.
   - Verify `/@channel` pages still allow featured trailers to play.
   - Verify toggle state is preserved across Popup and Options page.
3. **Issue #24 Verification**:
   - Verify `bankedSavedSec` accrues during `> 1.0×` playback and remains stable when dropping to `1.0×`.
   - Verify End-of-Video banner appends savings when $\ge 1\text{s}$ and omits when $< 1\text{s}$.
   - Verify Popup footer reflects total rules and hours/minutes saved.
   - Verify Options page reset flow requires typing `"Forget Time Saved"`.
4. **Issue #26 Verification**:
   - Verify rules table pagination displays 10 per page by default, switching correctly to 25, 50, and All.
   - Verify search input matches channel names and `@handles`.
   - Verify sorting toggles between Recent, Alphabetical, and Speed.
   - Verify category filter buttons filter to matching preset categories.

---

## 6. Implementation & Verification Status

- [x] **Schema v5 Migration**: `settingsSchemaVersion: 5` initialized with `disableVideoPreviews: true` and `totalTimeSavedSec`.
- [x] **#23 Disable Video Previews**: Built 5th toggle into Extension Popup, Content Script CSS suppressor targeting hover previews across Home/Search/Sidebar while exempting `/@channel` trailers, and mirrored in Options Page Panel 01.
- [x] **#24 Real-Time Time Saved**: Implemented continuous wall-clock bank tracking (`dtWall * (rate - 1.0)` for `rate > 1.0`), watch deck Row 3 accrued math (`bankedSaved + max(0, remainingProjected)`), End-of-Video stop banner (`" · You saved {time} with Cadence!"`), Popup footer (`{rules} rules · {timeSaved} saved`), and Options Panel 02 Lifetime Time Saved card with typed `"Forget Time Saved"` confirmation reset.
- [x] **#26 Channel Rules Pagination & Filter Toolbar**: Built Options Panel 04 with 10/25/50/All page size selection, multi-criteria sorting (Recently updated, Channel Name A–Z, Speed highest to lowest), instant search by channel name or handle, and preset category filter pills.
- [x] **CWS Snapshot Locked**: Preserved Promo Frame and CWS Screenshot Studio locked at `v1.5.1`.
- [x] **Build & Lint Verification**: Successfully executed `npm run build:extension` (generating `CWS.zip` 59.6 KB), validated JS syntax on all 5 extension files, and passed `tsc --noEmit` + `vite build` with 0 errors.

