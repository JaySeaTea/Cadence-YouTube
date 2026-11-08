# Cadence — Live Streams & Live Stream DVR Lockdown Plan

Lock down the below-video watch toolbar for YouTube Live Streams and Live Stream DVR mode, ensuring authoritative broadcast detection, unified "Streaming · [Speed]×" verbiage in Row 1, proper Live Edge vs DVR Behind indicators, automatic speed clamping and catchup notice, and full suppression of VOD-only mechanics (saved time counter and end-of-video auto-stop).

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and confirmed with the user for Live Streams & DVR playback:

- **Confirmed: Row 1 Verbiage on Live Streams ("Streaming · [Speed]×")**:
  - Whenever a Live Stream is detected, Row 1 source readout displays **`Streaming · 1.0×`** (or `Streaming · 1.25×` during DVR catchup) instead of `Channel Rule · 1.0×` or `Default · 1.0×`.
  - **Why**: If a channel has a saved `1.5×` rule, showing "Channel Rule · 1.0×" in Row 1 while Row 3 shows "Rule: 1.5×" is contradictory and confusing. Using `Streaming · [Speed]×` makes it immediately clear that live broadcast rules apply, while Row 3 preserves the saved channel rule for standard VODs.
  - **Tooltip**: `Live stream broadcast · Active playback is 1.0× at live edge (Channel Rule is preserved for regular videos)`.
- **Confirmed: Live Stream Playback Status Display**:
  - When synced at the live edge: display red pulsing dot with `Live` badge (`Synced at live edge`).
  - When behind the live edge (DVR mode): display yellow offset dot with behind-live offset (e.g., `-42s behind Live` or `−12m 30s · Live in 4m 10s @ 1.50×` during catchup) and 1-click jump-to-live edge.
- **Confirmed: Catchup Speed Auto-Revert**:
  - When accelerated playback in DVR mode catches up to the live edge, Cadence automatically clamps speed back to `1.0×` and displays a player toast notification (`Caught up to Live · 1.0×`).
- **Confirmed: Forward Skips & Saved Time Counter**:
  - Forward skip buttons (+10s, +30s, +60s) are visually disabled at the live edge with an informative tooltip (`Stream is currently at live end`).
  - The Row 3 Saved Time counter is completely hidden on Live Streams (both Live Edge and Live DVR) since broadcasts do not have a fixed VOD duration.
- **Root Cause & Fix for Live Streams Breaking**:
  - In earlier versions, `isLiveBroadcast` contained an aggressive early return: `if (v && Number.isFinite(v.duration) && v.duration > 0) return false;`. Under Chrome Media Source Extensions (MSE/DASH), YouTube assigns the sliding buffer length or seekable window duration to `video.duration`. This caused live streams with DVR to be incorrectly classified as standard VODs, activating the saved time counter, allowing skips beyond buffer, and triggering false end-of-video auto-stops.
  - The fix prioritizes authoritative YouTube Player API signals (`player.getVideoData().isLive`, `player.getPlayerResponse().videoDetails.isLive`, `.ytp-time-display.ytp-live`) before any media duration checks.

---

## 1. Overview & Core Concept

- **What It Does**:
  Provides a stable, responsive below-video toolbar experience on YouTube Live Streams and Live DVR broadcasts. Prevents accidental speed runaways at the live edge, allows DVR catchup playback (>1.0×) when behind, gracefully settles back to 1.0× when caught up, uses consistent `Streaming · [Speed]×` status messaging in Row 1, and prevents any VOD end-of-video playlist triggers on live media.
- **Target Audience**:
  YouTube viewers watching real-time broadcasts, webinars, news, gaming, sports, and DVR-shifted live streams who use Cadence for playback speed control.
- **Key Value**:
  Flawless distinction between standard VODs and Live Streams, zero toolbar flickering, harmonious verbiage between Row 1 and Row 3, no spurious saved time calculations on infinite streams, and intuitive live edge status.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Viewing Active Live Stream at Live Edge**:
   - Row 1 displays: Source Readout (**`Streaming · 1.0×`**), vertical divider, and a red-dot `Live` badge.
   - Quick speed chips above 1.0× (+0.05, 1.25×, 1.5×, etc.) are visually disabled with tooltip: `Unavailable while synced at live end — rewind stream to speed up`.
   - Forward skip buttons (+10, +30, +60) are visually disabled with tooltip: `Stream is currently at live end`.
   - Row 3 displays the saved channel rule intact (e.g. `Rule: 1.5×`), preserving the user's VOD preference without conflicting with Row 1.
   - Row 3 Saved Time indicator is hidden.
   - End-of-video auto-stop is completely disarmed.
2. **Rewinding into Live DVR Mode**:
   - User clicks replay `-30s` or uses keyboard `J` / left arrow to scrub backward into DVR buffer.
   - Live badge switches from red `Live` to yellow `-30s behind Live`.
   - Speed buttons up to 2.0× become active, enabling catchup playback.
   - Forward skip buttons become active within the DVR buffer.
3. **Catching Up to Live Edge via Accelerated Playback**:
   - User selects `1.5×` to catch up.
   - Row 1 displays: **`Streaming · 1.50×`** and dynamic catchup progress: e.g., `−45s · Live in 1m 30s @ 1.50×`.
   - When the playback head arrives within 2 seconds of the live edge, Cadence automatically clamps speed back to `1.0×`, seeks smoothly to the live edge, and displays a clean toast: `Caught up to Live · 1.0×`.
   - Row 1 immediately reflects **`Streaming · 1.0×`** and red `Live` badge.
4. **Clicking the Live Badge**:
   - Clicking `-XX behind Live` or `Live in ...` immediately seeks player to the live edge and snaps speed to 1.0×.

### Visual Styling & Component Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│  Row 1 (Top):                                                          │
│  [ Streaming · 1.0× ]  |  [ ● Live ]                 [ Cadence Emblem ]│
├────────────────────────────────────────────────────────────────────────┤
│  Row 2 (Mid):                                                          │
│  [0.75×] [1.0× active] [1.25× (dim)] [1.5× (dim)] ...  [<< 60 30 10] [10 30 60 >> (dim)]│
├────────────────────────────────────────────────────────────────────────┤
│  Row 3 (Bot):                                                          │
│  [-0.05] [+0.05 (dim)] [Reset]                      [ Rule: 1.5× | Clear ]│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Row 1 Verbiage Unified as "Streaming · [Speed]×"**
  - *Chosen Approach*: If `remainingState.isLive` or `isAnyLiveStreamActive()`, display prefix `Streaming · [Speed]×` regardless of whether the channel has a rule or session override.
  - *Why*: Eliminates the direct visual contradiction between Row 1 showing `1.0×` and Row 3 showing the user's saved rule (e.g. `1.5×`). Clearly communicates that live streaming playback is active and governed by broadcast edge constraints.
- **Decision 2: Authoritative Precedence in `isLiveBroadcast`**
  - *Chosen Approach*: Check `player.getVideoData()?.isLive === true` and `player.getPlayerResponse()?.videoDetails?.isLive === true` first. Then check `.ytp-time-display.ytp-live` and `.ytp-live` classes. Never return `false` solely based on finite `video.duration` because MSE sets finite buffer durations on Live DVR.
  - *Why*: Eliminates false negative VOD classifications while preserving strict VOD checks for regular videos (which return `vd.isLive === false`).
- **Decision 3: Total Disarmament of End-of-Video Stop for Live Media**
  - *Chosen Approach*: `resolveEffectiveVodDurationSec` explicitly returns `null` for any video where `isLiveBroadcast(player, video)` is true, or if `video.duration === Infinity`. `triggerEndOfVideoStop` immediately returns `false`.
  - *Why*: Prevents skipping forward in live DVR from triggering playlist stops or pause freezes.
- **Decision 4: Suppression of Saved Time on Live Streams**
  - *Chosen Approach*: Both `computeBridgeSavedTimeModel` in `page-bridge.js` and `computeSavedTimeModel` in `content.js` strictly verify `!isLiveBroadcast(player, video)` and `!remainingState.isLive`.
  - *Why*: Wall-clock broadcast time cannot be "saved" in advance, avoiding nonsensical saved time metrics on live feeds.
- **Decision 5: Live Edge Speed Clamping & Toast Notification**
  - *Chosen Approach*: Clamp speeds >1.01× to 1.0× at live head and emit toast `Caught up to Live · 1.0×` on auto-sync, or `Synced to Live · 1.0×` on manual seek to live head.
  - *Why*: Matches user-confirmed behavior and provides crystal-clear user feedback.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                        YouTube Player DOM                             │
│       (#movie_player, HTML5 <video>, .ytp-time-display.ytp-live)      │
└──────────────────────────────────┬────────────────────────────────────┘
                                   │
                                   ▼
┌───────────────────────────────────────────────────────────────────────┐
│                       MAIN World: page-bridge.js                      │
│  • isLiveBroadcast(): Authoritative API checks (getVideoData.isLive)  │
│  • measureLiveDvrState(): Computes isAtLiveHead, dvrLagSec, catchup   │
│  • syncNativeLiveBadgeOnCatchup(): Clamps to 1.0×, fires LIVE_CAUGHT_UP│
│  • emitTimeRemaining(): Dispatches isLive, isAtLiveHead, dvrLagSec   │
│  • Saved Time & EOF Stop: Completely disabled on live streams         │
└──────────────────────────────────┬────────────────────────────────────┘
                                   │ window.postMessage
                                   ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     ISOLATED World: content.js                        │
│  • modePrefix: 'Streaming' when isLive is true                        │
│  • remainingState: Receives live telemetry & DVR lag                  │
│  • renderInPageBar(): Applies Live Edge vs Live DVR states            │
│  • Forward Skip Buttons: Visually disabled with tooltips at live head │
│  • Saved Time Slot: Hidden on Live Streams                            │
│  • Toast Feedback: Displays 'Caught up to Live · 1.0×'                │
└───────────────────────────────────────────────────────────────────────┘
```

### Verification & Testing Plan

1. **Live Stream Detection & Row 1 Verbiage Test**:
   - Load an active YouTube Live stream on a channel that has a saved `1.5×` channel rule.
   - Verify Row 1 displays **`Streaming · 1.0×`** (NOT "Channel Rule · 1.0×").
   - Verify Row 3 displays `Rule: 1.5×` cleanly without contradiction.
   - Verify tooltip explains live broadcast constraints while noting the channel rule is preserved for VODs.
2. **Saved Time & Auto-Stop Disarmament Test**:
   - Verify saved time counter in Row 3 is completely hidden.
   - Scrub and skip forward rapidly in Live DVR. Confirm auto-stop is never triggered.
3. **Live DVR Scrub & Catchup Test**:
   - Rewind 30s using replay `-30s`.
   - Verify status updates to `-30s behind Live` and forward skip buttons become active.
   - Set speed to 1.5×; verify Row 1 displays `Streaming · 1.50×` with catchup countdown.
   - On reaching live edge, verify speed automatically snaps to 1.0× with `Caught up to Live · 1.0×` toast.
4. **Standard VOD Regression Test**:
   - Load a standard video (finite duration).
   - Verify Row 1 shows `Channel Rule · 1.5×` or `Default · 1.0×` as expected.
   - Verify saved time counter operates normally with `0s saved` baseline at 1.0×.
5. **Build Integrity**:
   - Run `npm run build:extension`, `node --check extension/*.js`, `compile_applet`, and `lint_applet`.
