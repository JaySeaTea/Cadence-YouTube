# Seamless Extension Reload & Orphaned Context Lifecycle Fix (v1.1.1)

This update eliminates the `Uncaught (in promise) Error: Extension context invalidated` warning shown on Chrome's Extensions page whenever Cadence is reloaded, removed, or replaced while YouTube watch tabs are already open—ensuring clean listener teardown and zero-error hot-reloading.

## User Review & Critical Decisions

> [!IMPORTANT]
> When an unpacked Chrome extension is removed or reloaded while a YouTube video tab is open, Chrome invalidates the old content script's extension APIs (`chrome.runtime` and `chrome.storage`), but leaves its `window` message listeners alive in that tab. When the newly loaded extension attaches and broadcasts to the open tab, the orphaned script wakes up and calls `chrome.runtime.sendMessage(...)`, which throws **synchronously** before `.catch()` can run. Adding synchronous context validation and automatic listener self-teardown prevents any invalidated script from executing again.

- **Confirmed Context — Extension Replacement Flow**: You removed the previous unpacked extension and loaded the updated folder while a YouTube watch tab was open (`watch?v=...`).
- **Confirmed Behavior — Non-Fatal Warning Badge**: The newly loaded extension continues running normally, and the fix only needs to eliminate the uncaught promise rejection and ensure clean handover of in-page controls across updates.

---

## 1. Overview & Core Concept

- **What It Does**: Hardens Cadence's Manifest V3 content script, main-world player bridge, and in-page UI bars so that reloading, disabling, or replacing the extension while YouTube tabs are open cleanly retires stale script instances without throwing Chrome runtime errors.
- **Target Audience / Persona**: Chrome extension users updating or reloading Cadence across active browser sessions with multiple open YouTube video, playlist, or live-stream tabs.
- **Key Value**: Keeps Chrome's Extensions card completely free of `Errors` badges during updates while guaranteeing that below-video speed chips and end-of-video banners always stay bound to the newly active extension instance.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Zero-Error Hot Reload / Folder Swap**: Whether you click **Reload (↻)** on Chrome's Extensions page or remove an older unpacked build and load a new folder while watching YouTube, stale script listeners silently detach themselves on the very next event tick without logging errors.
  2. **Uninterrupted In-Page Controls**: The newly loaded extension immediately takes ownership of the below-video speed bar and end-of-video stop banner on already-open YouTube tabs, replacing any stale button listeners so clicking a speed preset (`1.0×`–`2.0×`) saves cleanly to Chrome storage without needing a page refresh.
  3. **Synchronized Distribution Packages**: Both the standalone unpacked extension bundle in the repository and the web workbench's `.zip` exporter ship the updated `v1.1.1` runtime scripts.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Existing dark-studio aesthetic across the web workbench, Chrome toolbar popup, and full-tab Options page remains preserved without visual clutter.
  - *Color Palette & Mood*: Deep cool slate canvas (`--background`: `#0B0F19`), elevated dark slate surfaces (`--card`: `#111827`) with `1px` borders (`#1E293B`), crisp light slate text (`#F1F5F9` primary, `#94A3B8` muted), and crimson active states (`--accent`: `#DC2626`).
  - *Typography & Hierarchy*: `Plus Jakarta Sans` display headings, `Public Sans` body copy, and `JetBrains Mono` (`tabular-nums`) for speed multipliers and rule counters.
  - *Component Styling & Layout*: Single-elevation dark panels, single-line controls, and unboxed metadata separated by middle dots (`·`).
- **Interactive Feedback & Motion**:
  - Instant `≤150ms` playback rate updates and player toast feedback on active YouTube tabs immediately after an extension reload, with zero console noise or extension error flags.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Synchronous Context Validation + `try/catch` Wrappers Around All Chrome APIs**
  - *Chosen Approach*: Gate every `chrome.runtime` and `chrome.storage` call behind an explicit `isExtensionContextValid()` check (`Boolean(chrome?.runtime?.id)`) wrapped inside synchronous `try/catch` blocks in addition to Promise `.catch()` handlers.
  - *Why*: In Chromium, calling `chrome.runtime.sendMessage(...)` after an extension context is invalidated throws synchronously rather than returning a rejected Promise—which bypassed `.catch(() => {})` inside `async` event handlers and triggered Chrome's `Uncaught (in promise)` error badge.
  - *Alternatives Considered*: Relying solely on `.catch()` on returned Promises was proven insufficient because the exception occurs before any Promise is created.

- **Decision 2: `AbortController` Self-Teardown for Orphaned Content Scripts**
  - *Chosen Approach*: Register all `window` message listeners in the isolated content script with an `AbortController` signal. The moment an orphaned script detects its `chrome.runtime.id` is no longer valid, it aborts all of its listeners permanently.
  - *Why*: Prevents invalidated scripts from continuing to wake up on every `250ms` player heartbeat or competing with the newly loaded extension instance over DOM elements.
  - *Alternatives Considered*: Requiring users to manually refresh every open YouTube tab after updating the extension was rejected to preserve zero-refresh attachment.

- **Decision 3: Clean DOM Bar & Main-World Bridge Handover**
  - *Chosen Approach*: Expose a clean teardown callback on the `MAIN`-world player bridge so re-injection replaces old timers and listeners cleanly, and re-create in-page speed bar and stop-banner nodes when a fresh isolated script boots so event handlers never point to an invalidated script closure.
  - *Why*: Ensures clicking a speed chip below a YouTube video right after updating the extension always writes to the live extension's storage.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                     Already-Open YouTube Watch / Live Tab                  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ MAIN World Player Bridge                                             │  │
│  │ • Cleanly replaces prior timer/listeners via teardown hook on update │  │
│  │ • Broadcasts VIDEO_DETECTED / MANUAL_RATE_CHANGE via postMessage     │  │
│  └──────────────┬───────────────────────────────────────┬───────────────┘  │
│                 │                                       │                  │
│                 ▼ (Orphaned Instance)                   ▼ (Active v1.1.1)  │
│  ┌──────────────────────────────────┐   ┌───────────────────────────────┐  │
│  │ Previous Content Script Context  │   │ Fresh Content Script Context  │  │
│  │ 1. Checks chrome.runtime?.id     │   │ 1. Validates live runtime.id  │  │
│  │ 2. Detects invalidated context   │   │ 2. Rebinds in-page speed bar  │  │
│  │ 3. Aborts all window listeners   │   │ 3. Safely updates badge &     │  │
│  │ 4. Exits silently (0 errors)     │   │    Chrome local storage       │  │
│  └──────────────────────────────────┘   └───────────────┬───────────────┘  │
└─────────────────────────────────────────────────────────┼──────────────────┘
                                                          │
                                                          ▼
                                          ┌───────────────────────────────┐
                                          │ Background Service Worker     │
                                          │ • Updates tab speed badge     │
                                          │ • Zero Errors on Extensions   │
                                          └───────────────────────────────┘
```

- **Data Model & State**:
  - **Lifecycle State (In-Memory per Content Script Instance)**: Tracks `isDestroyed` flag and `AbortController` instance; checks `chrome.runtime?.id` inside a synchronous `try/catch` before any Chrome API access.
  - **Extension Storage State (`chrome.storage.local`)**: Preserves existing `settings`, `presets`, and `rules` schemas unchanged (`v1.1.1` non-destructively retains any saved user rules in Chrome while shipping the four sample rules in clean builds).

- **Interactive Component & State Mapping**:
  - **Safe Chrome API Helpers (`safeSendMessage`, `safeStorageGet`, `safeStorageSet`)**:
    - Synchronously verify `isExtensionContextValid()`; if invalid or if synchronous invocation throws, trigger `teardownInstance()` and return `null` cleanly instead of throwing inside `async` callbacks.
  - **DOM Control Handover**:
    - On fresh content script initialization, remove any pre-existing below-video speed bar or stopped-playback banner created by a retired instance and immediately render fresh nodes bound to the active extension context.
  - **Main-World Bridge Upgrade Hook**:
    - Store a cleanup disposer in `MAIN` world (`clearInterval` + `removeEventListener`) so re-executing the bridge script during an extension update upgrades the running bridge cleanly before triggering `FORCE_DETECT`.
