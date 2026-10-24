# GitHub Repository Packaging, Clean Sample Defaults & Extension JSON Portability

This update prepares Cadence as a clean, shareable, MIT-licensed repository by resetting the base configuration to starter sample rules, excluding runtime workspace data from version control, adding a ready-to-load standalone Chrome extension package, documenting the project and release history, and adding JSON rule import/export directly inside the Chrome extension's options page.

## User Review & Critical Decisions

> [!IMPORTANT]
> Resetting the workspace clears any personal YouTube subscriptions currently stored in the workbench back to the four original sample channels (`Velvet Room Sessions`, `Orbital Mechanics Lab`, `The Longform Archive`, and `Systems Craft`). Your already-installed Chrome browser extension keeps its own internal Chrome storage untouched, and with the new Chrome options JSON backup button you can export your private channel list directly from Chrome anytime.

- **Confirmed Decision — Workspace Privacy & Reset**: Reset the workspace to the four starter sample rules and ignore local runtime persistence data from Git so personal subscriptions are never committed to GitHub.
- **Confirmed Decision — Chrome Options Portability**: Add JSON rule import and export controls directly to the Chrome extension's full-tab Options page, using the exact same backup format as the web workbench.
- **Confirmed Decision — Open-Source Licensing**: Include standard MIT License terms in the repository documentation and license notice.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the workspace into a complete, self-documented GitHub repository containing both the interactive Dark-Mode Web Workbench and a prebuilt, ready-to-load Chrome Manifest V3 extension seeded strictly with generic sample channels.
- **Target Audience / Persona**: You (syncing across personal machines via `git clone`) as well as any future GitHub visitors who want to load the unpacked Chrome extension immediately or customize their own channel speed profiles privately.
- **Key Value**: Separates public repository code from private YouTube subscription lists, eliminates the need to export a `.zip` before loading the extension on a new machine, and provides clear architectural and setup documentation for future maintenance.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Direct Unpacked Load After Clone**: Anyone cloning the GitHub repository can open Chrome's Extensions manager, enable Developer Mode, and load the standalone unpacked extension bundle directly from the repository—starting cleanly with the four sample channels (`1.0×` Music, `1.5×` Educational, `2.0×` Podcast).
  2. **Private Rule Backup & Restore in Chrome**: Inside Chrome, opening **All Channel Rules** from the Cadence toolbar popup launches the native dark-mode Options page, which now includes **Import JSON**, **Backup JSON**, and **Reset to Samples** actions in its header—matching the web workbench's workflow.
  3. **Clean Web Workbench Reset**: Opening the web studio displays only the four sample channels, includes a one-click **Reset Samples** option alongside JSON import/export in the Channel Rules manager, and keeps any future local workbench testing excluded from Git tracking.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Cohesive dark-studio utility across both the web workbench and Chrome's standalone Options and Popup views.
  - *Color Palette & Mood*: Deep cool slate canvas (`--background`: `#0B0F19`), elevated structural panels (`--card`: `#111827`) with `1px` hairline borders (`#1E293B`), crisp light slate typography (`#F1F5F9` primary, `#94A3B8` secondary), and crimson action accents (`--accent`: `#DC2626`).
  - *Typography & Hierarchy*: `Plus Jakarta Sans` for headings, `Public Sans` for interface controls and prose, and `JetBrains Mono` (`tabular-nums`) for all playback speed multipliers and counts.
  - *Component Styling & Layout*: Single-elevation dark containers with hairline row dividers, single-line action buttons, and unboxed inline metadata separated by middle dots (`·`).
- **Interactive Feedback & Motion**:
  - Immediate inline confirmation status on the Chrome Options page when importing, exporting, or resetting channel rules (`≤150ms`), with instant live synchronization across open YouTube tabs via Chrome storage listeners.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Prebuilt Unpacked Extension Alongside Dynamic Workbench Exporter**
  - *Chosen Approach*: Generate a complete, ready-to-load Manifest V3 extension package (including rendered `16px`, `32px`, `48px`, and `128px` PNG icons and sample defaults) directly in the repository while keeping the web workbench's dynamic `.zip` builder synchronized with the exact same source templates.
  - *Why*: Lets you run `git clone` on any machine and load the unpacked extension into Chrome immediately without running Node or building first, while still allowing interactive customization and `.zip` export from the web UI.
  - *Alternatives Considered*: Relying solely on the browser `.zip` download was passed over because a tracked unpacked extension bundle makes version diffs on GitHub transparent and speeds up local Chrome testing.

- **Decision 2: Shared JSON Backup Schema Across Web Workbench & Chrome Extension**
  - *Chosen Approach*: Use an identical `{ presets, rules }` JSON format for importing and exporting rules in both the Chrome Options page and the web workbench, merging imported channels non-destructively by `@handle` and channel name.
  - *Why*: Allows you to maintain your personal YouTube subscriptions in a private local JSON file outside Git and move rules effortlessly between Chrome browsers or back into the workbench.
  - *Alternatives Considered*: Baking personal channels into tracked defaults was rejected to keep the base repository clean and shareable.

- **Decision 3: Versioned Storage Namespace Reset & Git Exclusion**
  - *Chosen Approach*: Clear persisted runtime data, exclude the local runtime persistence store from Git version control, and rotate the browser storage namespace so cached personal entries from prior sessions do not automatically re-populate the reset workspace.
  - *Why*: Guarantees a clean slate with only the four sample rules both locally and when pushing to GitHub.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                     GitHub Repository (MIT Licensed)                     │
│                                                                          │
│  ┌────────────────────────────┐      ┌────────────────────────────────┐  │
│  │ Project Documentation      │      │ Standalone Unpacked Extension  │  │
│  │ • Architecture & Install   │      │ • Manifest V3 Runtime Scripts  │  │
│  │ • Release Changelog        │      │ • Dark Popup & Options UI      │  │
│  │ • MIT License              │      │ • Pre-rendered 16–128px Icons  │  │
│  └────────────────────────────┘      │ • Seeded w/ 4 Sample Channels  │  │
│                                      └───────────────▲────────────────┘  │
│                                                      │                   │
│  ┌───────────────────────────────────────────────────┴────────────────┐  │
│  │                  Dark-Mode Web Workbench & Simulator               │  │
│  │  • Shared Extension Template Engine (Sample Defaults by Default)   │  │
│  │  • Live YouTube Simulator + Channel Rules Manager                  │  │
│  └───────────────▲───────────────────────────────────▲────────────────┘  │
└──────────────────┼───────────────────────────────────┼───────────────────┘
                   │                                   │
       Git-Ignored │ Runtime Store         Portable    │ JSON Backup
                   ▼                       Schema      ▼
       ┌───────────────────────┐           ┌────────────────────────────┐
       │ Local Browser &       │           │ Private User Rules File    │
       │ Dev Server State      │           │ • Import/Export in Web UI  │
       │ (Never Committed)     │           │ • Import/Export in Chrome  │
       └───────────────────────┘           └────────────────────────────┘
```

- **Data Model & State**:
  - **Base Sample Seed**: Contains strictly the three default category profiles (`Music` at `1.0×`, `Educational` at `1.5×`, `Podcast & Lecture` at `2.0×`) and the four sample channel rules (`@velvetroomsessions`, `@orbitalmechanics`, `@longformarchive`, `@systemscraft`).
  - **Portable Backup Payload**: Standardized JSON object containing `presets` (id, label, description, speed) and `rules` (id, channelName, handle, channelId, presetId, customSpeed, updatedAt), validated and sanitized on import (`0.25×`–`4.0×` speed bounds, normalized `@handle`).

- **Interactive Component & State Mapping**:
  - **Chrome Options JSON Import/Export**:
    - *Export*: Reads current `presets` and `rules` from `chrome.storage.local` → serializes formatted JSON → triggers browser download (`cadence-channel-rules.json`) and displays a brief confirmation notice.
    - *Import*: Opens file picker (`application/json`) → parses and validates incoming `presets` and `rules` → non-destructively merges channels into `chrome.storage.local` (updating matching `@handles` and prepending new channels) → re-renders the rules list and immediately notifies open YouTube tabs via storage change listeners.
    - *Reset to Samples*: Restores the default presets and four sample channel rules in `chrome.storage.local` on click.
  - **Workspace Reset & Git Hygiene**: Purges existing runtime state on the server, adds the runtime data store to Git ignore rules, and advances the client storage key so stale personal subscriptions in local browser storage are cleared rather than re-uploaded.
