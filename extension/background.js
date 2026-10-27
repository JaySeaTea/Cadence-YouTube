const INITIAL_STATE = {
  "settings": {
    "enabled": true,
    "perChannelSpeedEnabled": true,
    "autoRememberManualSpeed": false,
    "defaultSpeed": 1,
    "stopAfterVideoEnds": true,
    "showInPageControlBar": true,
    "showSpeedToast": true,
    "settingsSchemaVersion": 2
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
  "rules": [
    {
      "id": "rule-velvet-room",
      "channelName": "Velvet Room Sessions",
      "handle": "@velvetroomsessions",
      "channelId": "UC8velvetRoomMusic01",
      "presetId": "music",
      "customSpeed": 1,
      "updatedAt": "2026-10-23"
    },
    {
      "id": "rule-orbital-lab",
      "channelName": "Orbital Mechanics Lab",
      "handle": "@orbitalmechanics",
      "channelId": "UC4orbitalLabEdu02",
      "presetId": "educational",
      "customSpeed": 1.5,
      "updatedAt": "2026-10-23"
    },
    {
      "id": "rule-longform-archive",
      "channelName": "The Longform Archive",
      "handle": "@longformarchive",
      "channelId": "UC9longformPod03",
      "presetId": "podcast",
      "customSpeed": 2,
      "updatedAt": "2026-10-23"
    },
    {
      "id": "rule-systems-craft",
      "channelName": "Systems Craft",
      "handle": "@systemscraft",
      "channelId": "UC2systemsCraft04",
      "presetId": "educational",
      "customSpeed": 1.5,
      "updatedAt": "2026-10-23"
    }
  ]
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

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(['settings', 'presets', 'rules']);
  const nextPayload = {};
  if (!existing.settings) {
    nextPayload.settings = {
      ...INITIAL_STATE.settings,
      autoRememberManualSpeed: false,
      settingsSchemaVersion: 2,
    };
  } else if ((existing.settings.settingsSchemaVersion || 1) < 2) {
    nextPayload.settings = {
      ...existing.settings,
      autoRememberManualSpeed: false,
      settingsSchemaVersion: 2,
    };
  }
  if (!existing.presets) nextPayload.presets = INITIAL_STATE.presets;
  if (!Array.isArray(existing.rules)) {
    nextPayload.rules = INITIAL_STATE.rules;
  } else {
    const mergedRules = [...existing.rules];
    for (const seedRule of INITIAL_STATE.rules) {
      const alreadyExists = mergedRules.some(
        (r) =>
          (seedRule.handle &&
            r.handle &&
            r.handle.toLowerCase() === seedRule.handle.toLowerCase()) ||
          r.channelName.toLowerCase() === seedRule.channelName.toLowerCase()
      );
      if (!alreadyExists) {
        mergedRules.push(seedRule);
      }
    }
    nextPayload.rules = mergedRules;
  }
  await chrome.storage.local.set(nextPayload);
  await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
  await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  await injectIntoExistingYouTubeTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
  await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
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
