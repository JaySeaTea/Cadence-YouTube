# Cadence v1.5.2 — Live DVR Tooltip Stability & Playlist Skip-Ahead Stop Guard

Cadence `v1.5.2` is a targeted patch release resolving two live-playback and playlist edge cases reported against `v1.5.1`: eliminating native tooltip flicker during sub-minute Live DVR countdowns (**Issue #21**) and preventing forward skips or timeline scrubs near the end of a video from bypassing Cadence's End-of-Video Stop in playlists (**Issue #22**).

## User Review & Critical Decisions

> [!IMPORTANT]
> All product behaviors below incorporate your confirmed choices from our clarification step and earlier engineering review:

- **Confirmed Decision 1 — Paused Behind-Live Pill & Two Static Tooltips (#21)**: Whenever a viewer is behind the live broadcast edge and either playing at `≤ 1.0×` **or paused at any speed**, the Row 1 status pill displays the clean lag readout (`42s behind Live`) paired with a static `"Behind live · Increase speed above 1× to catch up, or click to jump to live edge"` tooltip. Only unpaused playback above `1.0×` displays the active catch-up countdown pill (`−42s · Live in 56s @ 1.75×`) paired with a static `"Catching up at 1.75× · Click to jump to live edge"` tooltip.
- **Confirmed Decision 2 — Stop Guard Covers Both Cadence Skip Capsules & Native Seeks (#22)**: With *Stop Playback After Video Ends* enabled, skipping to or past the end of a video—whether via Cadence's `+10s / +30s / +60s` buttons, YouTube's `→` / `L` keyboard shortcuts, or dragging the timeline scrubber to the end—cleanly engages Cadence's End-of-Video Stop and blocks playlist auto-advance.
- **Confirmed Decision 3 — Chrome Web Store Studio Locked at `v1.5.1`**: While the extension runtime, packaged archives, and interactive workspace advance to **`v1.5.2`**, the Promo Frame & Chrome Web Store Screenshot Studio remains explicitly pinned to **`v1.5.1`** so exported store visuals continue matching your pending initial store submission.

---

## 1. Overview & Core Concept

- **What It Does**: Stabilizes hover tooltips on rapidly ticking Live DVR status pills and closes a race window where forward seeks near the end of a playlist video allowed YouTube's internal playlist manager to advance to the next video before Cadence could pause playback.
- **Target Audience / Persona**: Deliberate YouTube viewers who catch up on live streams at accelerated speeds (`1.25×–2.0×`) and watch structured creator courses, lecture series, or Watch Later queues without unwanted auto-advance.
- **Key Value**: Reliable, predictable playback control—hovering to read live catch-up actions never blinks every second, and skipping through closing credits in a playlist stops cleanly on the current video instead of launching the next lecture.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Hovering Over Live DVR Status Under 1 Minute (#21)**:
     - Viewer rewinds a live stream 45 seconds behind the broadcast head and plays at `1.75×`.
     - Row 1's status pill ticks smoothly every second (`−45s · Live in 60s @ 1.75×` → `−44s · Live in 59s @ 1.75×`) using fixed-width tabular sizer geometry so neighboring controls never shift.
     - Hovering the cursor over the pill displays `"Catching up at 1.75× · Click to jump to live edge"` with zero flicker while the visible pill text continues counting down underneath.
     - Pressing Pause switches the pill to `44s behind Live` with the static tooltip `"Behind live · Increase speed above 1× to catch up, or click to jump to live edge"`.
  2. **Skipping Ahead Near the End of a Playlist Video (#22)**:
     - Viewer watches an episode in a Creator Playlist (`list=...`) with *Stop Playback After Video Ends* turned ON.
     - With 35 seconds left, the viewer clicks `+60s` on the Cadence deck (or presses `L` / scrubs to the end of the timeline) to skip outro credits.
     - Instead of rolling over into `index + 1`, playback immediately halts at the end frame, suppresses YouTube's playlist auto-advance, and surfaces the `"Cadence stopped playback · Playlist auto-advance prevented"` overlay with `Replay`, `Play Next`, and `Dismiss` actions.
     - If *Stop Playback After Video Ends* is turned OFF in the toolbar popup, skipping past the end allows YouTube's normal playlist progression as expected.
  3. **Exporting Store Graphics vs. Testing `v1.5.2`**:
     - Header version readouts, manifest metadata, and live simulator testing reflect `v1.5.2`, while the Chrome Web Store Asset Studio explicitly notes and preserves `v1.5.1` store badge parity.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Precision dark-slate broadcast utility console with flat, single-elevation surfaces and zero decorative clutter.
  - *Color Palette & Mood*: 60% deep neutral slate canvas (`#0B0F19` / `#0F172A`), 30% elevated structural cards (`#111827`) with subtle `1px` slate hairline borders, and 10% high-intent crimson (`#DC2626`) for active speed states plus semantic amber (`#D97706`) for behind-live DVR indicators.
  - *Typography & Hierarchy*: `Plus Jakarta Sans` for crisp structural headings and brand wordmark, `Public Sans` for compact UI labels, and `JetBrains Mono` (`tabular-nums`) for all speed multipliers, countdowns, and lag telemetry so digit updates never cause horizontal layout jitter.
  - *Component Styling & Layout*: Full-width 1440px desktop workspace adhering to the strict single-row, three-zone top bar contract (Brand wordmark — concise single-line navigation tabs — primary download action), paired with collision-aware single-line watch-deck controls.

- **Interactive Feedback & Motion**:
  - Micro-interactions settle within `150ms` via opacity and color transitions only (no layout-geometry animation).
  - Hovering over the Row 1 live status pill highlights its border subtly while keeping the native browser tooltip steady across 1-second text ticks.
  - Triggering an end-of-video stop via `+60s` immediately displays the non-intrusive bottom player banner with clear manual `Replay` and `Play Next` escape hatches.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Decouple Live Tooltip Copy from Per-Second Countdown Text + Hover Mutation Guard**
  - *Chosen Approach*: Remove ticking lag/catch-up timestamps from the `title` attribute (creating two time-invariant behind-live tooltip strings) AND add a `:hover` attribute guard on the Row 1 duration slot button that defers redundant `title` writes while hovered unless the underlying slot mode (`live-catchup`, `live-behind`, `live-head`) changes.
  - *Why*: Chromium immediately destroys and recreates native OS tooltips whenever `element.title` mutates under a hovered pointer. Removing ticking numbers eliminates 99% of mutations, and the mode-aware `:hover` guard guarantees stability without touching any other button's tooltip behavior.
  - *Alternatives Considered*: Replacing native `title` with a custom CSS floating tooltip only on Row 1—passed over because it would create inconsistent tooltip styling relative to the rest of the watch deck and risk clipping inside YouTube's theater/fullscreen containers.

- **Decision 2 — Deterministic End-Stop on Forward Skip + Multi-Stage Native Seek Catch**
  - *Chosen Approach*:
    1. When `SEEK_BY_SECONDS` moves forward (`deltaSec > 0`) on a VOD with `stopAfterVideoEnds` enabled, compute the effective stream duration using the smaller of `HTMLVideoElement.duration` and YouTube's `#movie_player.getDuration()`. If `currentTime + deltaSec` lands within `0.6s` of (or beyond) that boundary, execute Cadence's end-of-video stop synchronously (seek to `effectiveDuration - 0.5s`, lock `heldAtEndVideoId`, suppress playlist auto-advance, pause player, and emit `PLAYBACK_STOPPED`).
    2. For native keyboard skips (`→` / `L`) and timeline scrubbing, evaluate the near-end guard immediately inside `seeking` and `seeked` listeners and add a capture-phase `ended` / player-state-`0` safety net (when no manual Next-Video navigation was initiated) that pauses and blocks `yt-playlist-manager` before auto-advance can fire.
  - *Why*: Previously, seeking to `duration - 0.35s` raced a `250ms` timer against `1.5×–2.0×` playback and DASH audio/video chunk boundaries where `#movie_player` reaches state `0` (`ENDED`) up to `0.4s` before `video.duration`. Handling forward skips deterministically eliminates the timer race completely.
  - *Alternatives Considered*: Clamping `+60s` to `duration - 2.0s` and letting the last 2 seconds play out—passed over because users clicking `+60s` at the end of a video expect an immediate stop rather than watching 2 arbitrary seconds of outro silence.

- **Decision 3 — Decoupled Store Asset Version Constant (`v1.5.1`) vs. Runtime Version (`v1.5.2`)**
  - *Chosen Approach*: Advance the runtime extension version constant to `1.5.2` across the packaged extension and interactive workspace while keeping the Chrome Web Store Asset Studio explicitly pinned to `v1.5.1`.
  - *Why*: Protects consistency across your already-recorded promo video and five store screenshots during your 7-day Google 2FA verification window while letting `main` move forward cleanly.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     YouTube Watch Page (Browser Runtime)                     │
│                                                                              │
│  ┌────────────────────────────────────┐    postMessage     ┌───────────────┐ │
│  │   Main-World Player Bridge         │ ─────────────────► │ Isolated-World│ │
│  │                                    │  TIME_REMAINING    │ Watch Deck UI │ │
│  │ • VOD Effective Duration Resolver  │  PLAYBACK_STOPPED  │               │ │
│  │   min(video.duration, getDuration) │ ◄───────────────── │ • Row 1 Slot  │ │
│  │ • Deterministic Forward-Skip Stop  │  SEEK_BY_SECONDS   │   Mode Engine │ │
│  │ • Native Seek / Ended Playlist     │  JUMP_TO_LIVE      │   (2 Static   │ │
│  │   Auto-Advance Interceptor         │                    │    Tooltips + │ │
│  └─────────────────┬──────────────────┘                    │   :hover Safe │ │
│                    │                                       │    Guard)     │ │
│                    ▼                                       └───────┬───────┘ │
│  ┌────────────────────────────────────┐                            │         │
│  │  #movie_player & yt-playlist-mgr   │                            ▼         │
│  │  • pauseVideo() + canAutoAdvance_  │                  ┌──────────────────┐│
│  └────────────────────────────────────┘                  │ End-Stop Overlay ││
│                                                          │ Replay│Play Next ││
│                                                          └──────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
                                       ▲
                                       │ Shared Behavior Parity
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                  Cadence Web Companion & Packaging Studio                    │
│                                                                              │
│  ┌──────────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐ │
│  │ Interactive Watch        │  │ Extension Builder   │  │ Promo & CWS      │ │
│  │ Simulator (v1.5.2)       │  │ & ZIP Exporter      │  │ Asset Studio     │ │
│  │ • Live DVR Pause/Catchup │  │ • Builds v1.5.2     │  │ • Pinned v1.5.1  │ │
│  │ • Playlist +60s & Scrub  │  │   Unpacked + CWS    │  │   Store Graphics │ │
│  └──────────────────────────┘  └─────────────────────┘  └──────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Settings Schema**: Remains at `settingsSchemaVersion: 4` (pure bugfix patch; zero migration or permission changes).
  - **Row 1 Live Slot State**:
    - `live-head`: Synced at live edge (`"Live broadcast · Synced at live edge"`).
    - `live-behind`: Triggered when behind live (`dvrLagSec > 0`) AND (`isPaused === true` OR `liveRate <= 1.02`). Displays `${lagLabel} behind Live` with static tooltip `"Behind live · Increase speed above 1× to catch up, or click to jump to live edge"`.
    - `live-catchup`: Triggered only when behind live AND `!isPaused` AND `liveRate > 1.02`. Displays `−${lagLabel} · Live in ${catchUpLabel} @ ${speed}×` with static tooltip `"Catching up at ${speed}× · Click to jump to live edge"`.
  - **End-of-Video Hold State**:
    - `heldAtEndVideoId`: Tracks the video ID currently held by Cadence so repeated `timeupdate`/`seeked`/`ended` events do not emit duplicate banners, and resets cleanly on backward seeks (`deltaSec < 0`), timeline scrubs earlier than `duration - 2.5s`, `Replay`, or video navigation.

- **Interactive Component & State Mapping**:
  - **Row 1 Live Pill Hover & Pause Transitions**:
    - *Unpaused at `1.75×` behind live*: Pill shows amber dot + ticking catch-up text; `slotBtn.title` stays constant across 1-second updates; `slotBtn` records `data-slot-mode="live-catchup"` and skips redundant `title` writes while `:hover` matches the same mode and speed.
    - *Paused at `1.75×` behind live*: Mode transitions from `live-catchup` → `live-behind`, switching pill text to `${lagLabel} behind Live` and updating the tooltip once to the static Behind Live string.
  - **Forward Skip (`+10s / +30s / +60s`) & Timeline Scrubbing in Playlists**:
    - *Stop After Video Ends = ON*: Forward skip reaching `effectiveDuration - 0.6s` (or native keyboard/timeline scrub reaching the end boundary) invokes a unified `triggerEndOfVideoStop(player, video, currentVideoId)` helper that clamps playhead just inside the final frame (`effectiveDuration - 0.5s`), disables `yt-playlist-manager.canAutoAdvance_`, pauses playback, and renders the stop banner.
    - *Stop After Video Ends = OFF*: Forward skip seeks normally to `duration`, allowing YouTube's playlist controller to advance unimpeded.
    - *Manual "Play Next" Button*: Marks `userInitiatedNavUntil` for `3000ms` so deliberate user clicks on `Play Next` or YouTube's native Next button always advance cleanly without interference.
  - **Interactive Simulator Parity**:
    - Mirrors both the paused-behind-live pill transition/static tooltips and the playlist `+10s/+30s/+60s` + timeline scrub end-stop behavior inside the web simulator so every `v1.5.2` fix can be tested interactively in the preview alongside the built extension package.
