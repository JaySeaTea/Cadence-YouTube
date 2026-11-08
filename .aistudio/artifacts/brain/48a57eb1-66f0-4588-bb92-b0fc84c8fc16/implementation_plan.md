# Cadence v1.6.0 Live Stream & Saved Time Stabilization Plan

Stabilize Cadence v1.6.0 by restoring authoritative YouTube Live Stream detection across player API metadata and infinite video durations, completely disarming End-of-Video auto-stop on all live streams, enforcing strict per-video reset of banked saved time on every video ID transition, and stabilizing dynamic time saved calculations.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed in Phase 1:
> - **Live Stream Detection & Auto-Stop Disarmament**: Cadence will authoritatively inspect YouTube player metadata (`player.getVideoData()?.isLive === true`, `player.getPlayerResponse()?.videoDetails?.isLive === true`), live UI elements, and `!Number.isFinite(video.duration)`. Live streams will be strictly immune to End-of-Video auto-stop triggers (both progress bar releases and auto-advance blockers).
> - **Per-Video Saved Time Reset**: Banked saved seconds (`currentVideoTimeSavedSec` in bridge and `remainingState.bankedSavedSec` in content script) will reset to `0` immediately whenever the active video ID changes, eliminating cross-video leakage where a new 1.0× video inherited previous saved time.
> - **Saved Time Formula**: The watch bar will present `Banked Time Watched + Projected Remaining Savings` for VODs, showing `0s saved` at 1.0× baseline and dynamically reflecting savings during accelerated playback.

---

## 1. Overview & Root Cause Analysis

### A. Live Stream Detection Failure
- **Root Cause:** In the previous update, `isLiveBroadcast` was modified to require `p.classList.contains('ytp-live')` as a hard prerequisite. On YouTube desktop, `#movie_player` does not always retain `.ytp-live` at the player root in modern Polymer layouts, especially during initial hydration or DVR seeking. Consequently, `isLiveBroadcast` evaluated to `false`, causing live streams to be treated as standard VODs. This enabled VOD skip-ahead buttons, calculated standard duration, and permitted `triggerEndOfVideoStop` to prematurely stop live playback.
- **Resolution:** Re-establish authoritative multi-source live detection checking `player.getVideoData().isLive === true`, `player.getPlayerResponse().videoDetails.isLive === true`, visible live badges, and `video.duration === Infinity` or non-finite duration. In addition, explicitly disarm `triggerEndOfVideoStop` whenever live indicators are present.

### B. Saved Time Leakage Across Videos
- **Root Cause:** `currentVideoTimeSavedSec` in `page-bridge.js` and `remainingState.bankedSavedSec` in `content.js` were only reset on explicit video transition gates that depended on `lockedVideoId`. When navigating via YouTube's in-page SPF router (`yt-navigate-finish`), the previous video's banked time (e.g. 61 seconds / 1m 01s) was not purged, causing new 1.0× videos to display "Saves 1m 01s".
- **Resolution:** Introduce a dedicated `ensureVideoBoundaryReset(newVideoId)` hook in both `page-bridge.js` and `content.js`. Any time the detected video ID changes, `currentVideoTimeSavedSec` and `remainingState.bankedSavedSec` immediately zero out.

### C. Seeking vs. Saved Time Behavior
- **Root Cause:** When skipping forward, remaining video duration decreases, reducing projected savings. When replaying, remaining duration increases, increasing projected savings.
- **Resolution:** Clarify the calculation so `banked` accurately reflects wall-clock savings already realized, `projected` is computed from current playback rate and remaining playable duration, and at standard `1.0×` playback with zero banked time, the readout displays `0s saved` (or neutral badge) rather than false positive savings.

---

## 2. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MAIN WORLD (page-bridge.js)                           │
│                                                                             │
│  ┌───────────────────────┐         ┌─────────────────────────────────────┐  │
│  │ YouTube Player API    │         │ Authoritative Live & DVR Engine     │  │
│  │ • getVideoData()      │────────▶│ • isLiveBroadcast(player, video)    │  │
│  │ • getPlayerResponse() │         │   - player.getVideoData().isLive    │  │
│  │ • video.duration      │         │   - details.isLive === true         │  │
│  └───────────────────────┘         │   - video.duration === Infinity     │  │
│                                    │   - live badge / live time display  │  │
│                                    └──────────────────┬──────────────────┘  │
│                                                       │                     │
│                                    ┌──────────────────▼──────────────────┐  │
│                                    │ End-of-Video Auto-Stop Shield       │  │
│                                    │ • triggerEndOfVideoStop:            │  │
│                                    │   NEVER triggers if isLiveBroadcast │  │
│                                    │   NEVER triggers if dur === Infinity│  │
│                                    └─────────────────────────────────────┘  │
│                                                       │                     │
│  ┌─────────────────────────────────────────────────┐  │                     │
│  │ Per-Video Saved Time Accrual Loop               │  │                     │
│  │ • On videoId change: reset to 0 immediately     │  │                     │
│  │ • If isLiveBroadcast: zero saved time           │  │                     │
│  │ • If VOD: banked + projected remaining          │  │                     │
│  └────────────────────────┬────────────────────────┘  │                     │
└───────────────────────────┼───────────────────────────┼─────────────────────┘
                            │                           │
                            │ TIME_REMAINING_UPDATE     │
                            ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ISOLATED WORLD (content.js)                              │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Toolbar Presentation & Safeguards                                     │  │
│  │ • isLive: true ──▶ Live toolbar (Live Badge, DVR lag, 1.0× clamp)     │  │
│  │ • isLive: false ──▶ VOD toolbar (Saves time, real duration, skips)    │  │
│  │ • Reset remainingState.bankedSavedSec = 0 on video change             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Step-by-Step Implementation Strategy

### Step 1: Re-anchor Live Stream Detection in `page-bridge.js`
1. Re-implement `isLiveBroadcast(player, video)`:
   - If `isAdPlaying(player)` -> return `false`.
   - Check `player.getVideoData()?.isLive === true`.
   - Check `player.getPlayerResponse()?.videoDetails?.isLive === true`.
   - Check `!Number.isFinite(video?.duration) || video?.duration === Infinity`.
   - Check player element classes (`.ytp-live`, `.ytp-live-mode`) or `.ytp-time-display.ytp-live` or visible `.ytp-live-badge`.
   - If any positive indicator confirms live broadcast and `video.duration` is not a standard finite VOD duration, return `true`.
2. Update `measureLiveDvrState(player, video, currentVid)`:
   - If not live, return clean non-live state.
   - Accurately measure live head position, DVR seekability, and lag seconds.

### Step 2: Auto-Stop Disarmament on Live Streams
1. Update `handleProgressBarReleaseAtEnd(e)`:
   - Check `if (isLiveBroadcast(player, video) || !Number.isFinite(effectiveDur)) return;`
2. Update `triggerEndOfVideoStop(player, video, targetTime, fromScrub)`:
   - Add early return: `if (isLiveBroadcast(player, video) || !video || !Number.isFinite(video.duration)) return;`
   - Disarm any auto-stop timers or banners on live streams.

### Step 3: Zero Cross-Video Saved Time Leakage
1. In `page-bridge.js`:
   - Store `currentVideoId = getCurrentVideoId(player) || getUrlVideoId()`.
   - In `emitTimeRemaining`, `trackTimeSavedTick`, and navigation listeners:
     If `videoId !== currentTrackingVideoId`, call `resetCurrentVideoTimeSaved()` immediately.
   - Ensure `currentVideoTimeSavedSec = 0` on every new video.
2. In `content.js`:
   - In `TIME_REMAINING_UPDATE`: if `payload.videoId !== remainingState.videoId`, reset `remainingState.bankedSavedSec = 0` and clear any previous video's saved time model.
3. In `computeBridgeSavedTimeModel`:
   - If `rate >= 0.99 && rate <= 1.01` and `banked < 3`: return `{ visible: true, tone: 'neutral', text: '0s saved', title: 'Playing at standard 1.0× speed' }`.

### Step 4: Validate Toolbar Presentation for Live vs. VOD
1. Verify live edge toolbar:
   - Speed buttons clamped to `1.0×`.
   - Skip ahead buttons greyed out with tooltip: `"Unavailable while synced at live end — rewind stream to speed up"`.
   - Red live dot / "Live" badge visible.
   - Zero saved time indicator displayed on live streams.
2. Verify VOD toolbar:
   - Instant response on speed changes.
   - Banked time starts at `0s saved` at `1.0×`.
   - Accelerated playback cleanly calculates banked + remaining projected savings.

### Step 5: Build, Test & Lint
1. Re-run `npm run build:extension` with automated syntax and identifier validation.
2. Execute `node --check` across all generated extension scripts.
3. Co-execute `compile_applet` and `lint_applet` to verify TypeScript integrity.
4. Restart dev server and verify.
