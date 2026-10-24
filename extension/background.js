const INITIAL_STATE = {
  "settings": {
    "enabled": true,
    "perChannelSpeedEnabled": true,
    "autoRememberManualSpeed": true,
    "defaultSpeed": 1,
    "stopAfterVideoEnds": true,
    "showInPageControlBar": true,
    "showSpeedToast": true
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

async function injectIntoExistingYouTubeTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*'] });
    for (const tab of tabs) {
      if (!tab.id) continue;
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
  if (!existing.settings) nextPayload.settings = INITIAL_STATE.settings;
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'CADENCE_UPDATE_BADGE') {
    const tabId = (sender.tab && sender.tab.id) || message.tabId;
    if (tabId) {
      const text = message.enabled && message.speed ? formatBadgeSpeed(message.speed) : '';
      chrome.action.setBadgeText({ tabId, text }).catch(() => {});
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#DC2626' }).catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
