# Privacy Policy — Cadence for YouTube

**Extension Name:** Cadence — Per-Channel Speed & Playlist Stop for YouTube  
**Effective Date:** October 31, 2026  
**Last Updated:** October 31, 2026  

---

## 1. Summary

**Cadence collects, transmits, sells, or shares zero personal or browsing data.**  
Every setting, category speed profile, and YouTube channel speed rule you configure stays 100% locally on your own computer inside Chrome’s local extension storage (`chrome.storage.local`). Cadence makes no external network requests, embeds no analytics or telemetry SDKs, and executes no remotely hosted code.

---

## 2. Information Stored Locally on Your Device

To perform its single purpose—controlling YouTube playback speeds per channel, providing an in-page watch transport toolbar, converting YouTube Shorts URLs to the standard watch player, and stopping automatic playlist progression at the end of videos—Cadence stores only the following configuration data in **`chrome.storage.local`** on your device:

- **Extension Preferences (`settings`)**: Boolean toggles and numeric defaults you choose in the extension popup or options page (such as per-channel speed activation, end-of-video stop behavior, watch toolbar visibility, Shorts-to-Watch conversion, and default fallback speed).
- **Category Speed Profiles (`presets`)**: Numeric speed multipliers for reusable categories (e.g., *Music `1.0×`*, *Educational `1.5×`*, *Podcast `2.0×`*).
- **Saved Channel Speed Rules (`rules`)**: YouTube channel names, `@handles`, channel IDs, and playback speed preferences for channels where you explicitly click **Save Rule** in the toolbar, popup, or options page.

### User-Initiated Local Backups (JSON Import / Export)
The Options page includes optional **Backup JSON** and **Import JSON** buttons. Exporting creates a `.json` file directly in your local Downloads folder; importing reads a `.json` file you explicitly select from your computer. No data is ever uploaded to any server.

---

## 3. Data We Do Not Collect

Cadence **never** collects, logs, transmits, or accesses:
- Personally identifiable information (names, email addresses, account credentials, or IP addresses)
- Web browsing history outside active YouTube pages, or historical logs of videos watched
- Authentication cookies, session tokens, payment details, or private communications
- Analytics, crash telemetry, keystroke logs, or behavioral tracking metrics

---

## 4. Chrome Permissions & Host Access Justification

Cadence follows Chrome’s **Principle of Least Privilege** and requests only the minimum Manifest V3 permissions required to function on YouTube:

| Permission | Scope | Why It Is Required |
| :--- | :--- | :--- |
| **`storage`** | Local browser storage | Saves your per-channel playback speeds, category presets, and feature toggles locally in `chrome.storage.local` across browser restarts. |
| **`scripting`** | `*://*.youtube.com/*` only | Attaches Cadence’s speed controller and watch-page toolbar to already-open YouTube tabs immediately upon install, update, or popup interaction without forcing a manual page reload. |
| **Host Permission (`*://*.youtube.com/*`)** | YouTube pages only | Reads the active YouTube video’s channel metadata (`channelId`, `@handle`, channel title) and playback state on YouTube pages to apply your configured playback speed, mount the below-video control bar, convert `/shorts/` links to `/watch`, and pause playlist auto-advance when a video ends. |

Cadence does **not** request the `"tabs"` browsing-history permission, `<all_urls>`, cookies, webRequest, or identity permissions.

---

## 5. Third-Party Sharing & Remote Code

- **Zero Third-Party Transfers**: Because no user data ever leaves your browser, no data is sold, rented, or transferred to third parties, advertisers, data brokers, or analytics providers.
- **Zero Remote Code**: All JavaScript, HTML, CSS, and icon assets are packaged statically inside the Chrome Extension archive in strict compliance with Manifest V3 policies.

---

## 6. Chrome Web Store User Data Policy Compliance

Cadence’s handling of browser APIs complies strictly with the [Chrome Web Store Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies/), including the **User Data Privacy** and **Limited Use** requirements. Any page state read from `*://*.youtube.com/*` is processed ephemerally in memory inside your browser tab solely to deliver user-facing playback controls and is never transmitted off your device.

---

## 7. Deleting Your Data

You retain complete control over all local extension data at any time:
1. Remove individual channel rules via the **Clear ×** button in the watch toolbar or the **Remove** button on Cadence’s **Options** page.
2. Uninstalling Cadence from `chrome://extensions` automatically and permanently deletes all data stored in `chrome.storage.local`.

---

## 8. Changes to This Policy & Contact

If Cadence ever introduces optional features that affect local storage or browser permissions, this Privacy Policy and the extension’s versioned changelog will be updated prior to release.

For questions, bug reports, or privacy inquiries, please open an issue in the project’s public GitHub repository.
