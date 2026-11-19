const INITIAL_STATE = {
  "settings": {
    "enabled": true,
    "perChannelSpeedEnabled": true,
    "defaultSpeed": 1,
    "stopAfterVideoEnds": true,
    "showInPageControlBar": true,
    "showSpeedToast": true,
    "convertShortsToWatch": true,
    "disableVideoPreviews": true,
    "showWatchLaterRemoveAction": true,
    "popupTimeSavedDisplay": "daily",
    "barTimeSavedDisplay": "daily",
    "settingsSchemaVersion": 7
  },
  "presets": [
    {
      "id": "music",
      "label": "Music & Performance",
      "description": "Preserves natural pitch, rhythm, and studio mix timing.",
      "speed": 1
    },
    {
      "id": "educational",
      "label": "Educational & Explainer",
      "description": "Brisk comprehension pace for tutorials, science, and essays.",
      "speed": 1.5
    },
    {
      "id": "podcast",
      "label": "Podcast & Lecture",
      "description": "High-efficiency cadence for long-form conversations and seminars.",
      "speed": 2
    }
  ],
  "rules": []
};

function formatBadgeSpeed(speed) {
  const num = Number(speed);
  if (!Number.isFinite(num) || num <= 0) return '';
  return num.toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1') + 'x';
}

function isYouTubeWatchUrl(url) {
  return (
    typeof url === 'string' &&
    /^https?:\/\/([a-z0-9-]+\.)?youtube\.com\/watch/i.test(url)
  );
}

async function injectIntoExistingYouTubeTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*'] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      if (tab.url && !isYouTubeWatchUrl(tab.url)) {
        chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(() => {});
      }
      try {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css'],
        });
      } catch (_) {}
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['page-bridge.js'],
          world: 'MAIN',
        });
      } catch (_) {}
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
      } catch (_) {}
    }
  } catch (_) {}
}

const LEGACY_SAMPLE_CHANNEL_IDS = new Set([
  'UC8velvetRoomMusic01',
  'UC4orbitalLabEdu02',
  'UC9longformPod03',
  'UC2systemsCraft04',
]);

function getLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidDisplayMode(val) {
  return val === 'total' || val === 'daily' || val === 'off';
}

function sanitizeSavedTimeByDay(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const sec = Math.floor(Number(v) || 0);
    if (Number.isFinite(sec) && sec > 0) {
      out[k] = sec;
    }
  }
  return out;
}

let savedTimeWriteQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get([
    'settings',
    'presets',
    'rules',
    'totalTimeSavedSec',
    'timeSavedSince',
    'savedTimeByDay',
  ]);
  const nextPayload = {};
  const prevSchemaVersion = (existing.settings && existing.settings.settingsSchemaVersion) || 1;

  if (!existing.settings) {
    const cleanInitialSettings = { ...INITIAL_STATE.settings };
    delete cleanInitialSettings.autoRememberManualSpeed;
    nextPayload.settings = {
      ...cleanInitialSettings,
      convertShortsToWatch:
        typeof cleanInitialSettings.convertShortsToWatch === 'boolean'
          ? cleanInitialSettings.convertShortsToWatch
          : true,
      disableVideoPreviews:
        typeof cleanInitialSettings.disableVideoPreviews === 'boolean'
          ? cleanInitialSettings.disableVideoPreviews
          : true,
      showWatchLaterRemoveAction:
        typeof cleanInitialSettings.showWatchLaterRemoveAction === 'boolean'
          ? cleanInitialSettings.showWatchLaterRemoveAction
          : true,
      popupTimeSavedDisplay: isValidDisplayMode(cleanInitialSettings.popupTimeSavedDisplay)
        ? cleanInitialSettings.popupTimeSavedDisplay
        : 'daily',
      barTimeSavedDisplay: isValidDisplayMode(cleanInitialSettings.barTimeSavedDisplay)
        ? cleanInitialSettings.barTimeSavedDisplay
        : 'daily',
      settingsSchemaVersion: 7,
    };
  } else if (prevSchemaVersion < 7) {
    const migratedSettings = {
      ...INITIAL_STATE.settings,
      ...existing.settings,
      convertShortsToWatch:
        typeof existing.settings.convertShortsToWatch === 'boolean'
          ? existing.settings.convertShortsToWatch
          : true,
      disableVideoPreviews:
        typeof existing.settings.disableVideoPreviews === 'boolean'
          ? existing.settings.disableVideoPreviews
          : true,
      showWatchLaterRemoveAction:
        typeof existing.settings.showWatchLaterRemoveAction === 'boolean'
          ? existing.settings.showWatchLaterRemoveAction
          : true,
      popupTimeSavedDisplay: isValidDisplayMode(existing.settings.popupTimeSavedDisplay)
        ? existing.settings.popupTimeSavedDisplay
        : 'daily',
      barTimeSavedDisplay: isValidDisplayMode(existing.settings.barTimeSavedDisplay)
        ? existing.settings.barTimeSavedDisplay
        : 'daily',
      settingsSchemaVersion: 7,
    };
    delete migratedSettings.autoRememberManualSpeed;
    nextPayload.settings = migratedSettings;
  }

  if (typeof existing.totalTimeSavedSec !== 'number') {
    nextPayload.totalTimeSavedSec = 0;
  }

  if (
    typeof existing.timeSavedSince !== 'number' ||
    !Number.isFinite(existing.timeSavedSince) ||
    existing.timeSavedSince <= 0
  ) {
    nextPayload.timeSavedSince = Date.now();
  }

  if (
    !existing.savedTimeByDay ||
    typeof existing.savedTimeByDay !== 'object' ||
    Array.isArray(existing.savedTimeByDay)
  ) {
    nextPayload.savedTimeByDay = {};
  }

  if (!existing.presets) {
    nextPayload.presets = INITIAL_STATE.presets;
  }

  if (!Array.isArray(existing.rules)) {
    nextPayload.rules = Array.isArray(INITIAL_STATE.rules) ? INITIAL_STATE.rules : [];
  } else if (prevSchemaVersion < 4 && INITIAL_STATE.rules.length === 0) {
    const cleanedRules = existing.rules.filter(
      (r) => !(r && r.channelId && LEGACY_SAMPLE_CHANNEL_IDS.has(r.channelId))
    );
    if (cleanedRules.length !== existing.rules.length) {
      nextPayload.rules = cleanedRules;
    }
  }

  if (Object.keys(nextPayload).length > 0) {
    await chrome.storage.local.set(nextPayload);
  }
  await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' }).catch(() => {});
  await chrome.action.setBadgeTextColor({ color: '#FFFFFF' }).catch(() => {});
  await injectIntoExistingYouTubeTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' }).catch(() => {});
  await chrome.action.setBadgeTextColor({ color: '#FFFFFF' }).catch(() => {});
  await injectIntoExistingYouTubeTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const candidateUrl = changeInfo.url || (tab && tab.url) || '';
  if (!candidateUrl) return;
  if (
    /^https?:\/\/([a-z0-9-]+\.)?youtube\.com\//i.test(candidateUrl) &&
    !isYouTubeWatchUrl(candidateUrl)
  ) {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'CADENCE_OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  if (message && message.type === 'CADENCE_ADD_TIME_SAVED') {
    const delta = Math.max(0, Math.floor(Number(message.deltaSec) || 0));
    if (delta > 0) {
      savedTimeWriteQueue = savedTimeWriteQueue
        .then(async () => {
          const data = await chrome.storage.local.get([
            'totalTimeSavedSec',
            'savedTimeByDay',
            'timeSavedSince',
          ]);
          const current = Math.max(0, Math.floor(Number(data.totalTimeSavedSec) || 0));
          const byDay = sanitizeSavedTimeByDay(data.savedTimeByDay);
          const todayKey = getLocalDateKey();
          byDay[todayKey] = (byDay[todayKey] || 0) + delta;
          const patch = {
            totalTimeSavedSec: current + delta,
            savedTimeByDay: byDay,
          };
          if (
            typeof data.timeSavedSince !== 'number' ||
            !Number.isFinite(data.timeSavedSince) ||
            data.timeSavedSince <= 0
          ) {
            patch.timeSavedSince = Date.now();
          }
          await chrome.storage.local.set(patch);
        })
        .catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }
  if (message && message.type === 'CADENCE_RESET_TIME_SAVED') {
    const resetSince =
      typeof message.timeSavedSince === 'number' &&
      Number.isFinite(message.timeSavedSince) &&
      message.timeSavedSince > 0
        ? message.timeSavedSince
        : Date.now();
    savedTimeWriteQueue = savedTimeWriteQueue
      .then(() =>
        chrome.storage.local.set({
          totalTimeSavedSec: 0,
          savedTimeByDay: {},
          timeSavedSince: resetSince,
        })
      )
      .then(() => {
        sendResponse({
          ok: true,
          totalTimeSavedSec: 0,
          savedTimeByDay: {},
          timeSavedSince: resetSince,
        });
      })
      .catch(() => {
        sendResponse({ ok: false });
      });
    return true; // async
  }
  if (message && message.type === 'CADENCE_UPDATE_BADGE') {
    const tabId = (sender.tab && sender.tab.id) || message.tabId;
    if (tabId) {
      const tabUrl = (sender.tab && sender.tab.url) || '';
      const allowBadge = !tabUrl || isYouTubeWatchUrl(tabUrl);
      const text =
        allowBadge && message.enabled && message.speed ? formatBadgeSpeed(message.speed) : '';
      chrome.action.setBadgeText({ tabId, text }).catch(() => {});
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#DC2626' }).catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
