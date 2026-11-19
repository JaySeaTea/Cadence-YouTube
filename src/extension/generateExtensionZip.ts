import JSZip from 'jszip';
import {
  CategoryPreset,
  ChannelRule,
  ExtensionSettings,
} from '../types/extension';
import {
  DEFAULT_PRESETS,
  DEFAULT_SETTINGS,
  EXTENSION_VERSION,
} from '../data/sampleDefaults';

export interface GeneratedExtensionFile {
  path: string;
  language: 'json' | 'javascript' | 'html' | 'css';
  description: string;
  content: string;
}

export type ExtensionTarget = 'chrome' | 'firefox';

export function buildExtensionFiles(
  settings: ExtensionSettings,
  presets: CategoryPreset[],
  rules: ChannelRule[],
  target: ExtensionTarget = 'chrome'
): GeneratedExtensionFile[] {
  const manifestBase = {
    manifest_version: 3,
    name: 'Cadence — YouTube Speed Controller & Autoplay Stop',
    short_name: 'Cadence',
    version: EXTENSION_VERSION,
    description:
      'Automatically save YouTube playback speeds per channel, stop playlist autoplay, and watch Shorts in the standard video player.',
    permissions: ['storage', 'scripting'],
    host_permissions: ['*://*.youtube.com/*'],
    action: {
      default_popup: 'popup.html',
      default_title: 'Cadence - YouTube at your speed',
      default_icon: {
        '16': 'icons/icon16.png',
        '32': 'icons/icon32.png',
        '48': 'icons/icon48.png',
        '128': 'icons/icon128.png',
      },
    },
    icons: {
      '16': 'icons/icon16.png',
      '32': 'icons/icon32.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
    content_scripts: [
      {
        matches: ['*://*.youtube.com/*'],
        js: ['page-bridge.js'],
        world: 'MAIN',
        run_at: 'document_start',
      },
      {
        matches: ['*://*.youtube.com/*'],
        js: ['content.js'],
        css: ['content.css'],
        run_at: 'document_start',
      },
    ],
  };

  const manifestObj =
    target === 'firefox'
      ? {
          ...manifestBase,
          background: {
            scripts: ['background.js'],
          },
          options_ui: {
            page: 'options.html',
            open_in_tab: true,
          },
          browser_specific_settings: {
            gecko: {
              id: 'cadence-youtube@jayseatea.github.io',
              strict_min_version: '128.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {
          ...manifestBase,
          minimum_chrome_version: '111',
          background: {
            service_worker: 'background.js',
          },
          options_page: 'options.html',
        };

  const manifestJson = JSON.stringify(manifestObj, null, 2);

  const initialSeed = JSON.stringify(
    {
      settings,
      presets,
      rules,
    },
    null,
    2
  );

  const backgroundJs = `const INITIAL_STATE = ${initialSeed};

function formatBadgeSpeed(speed) {
  const num = Number(speed);
  if (!Number.isFinite(num) || num <= 0) return '';
  return num.toFixed(2).replace(/\\.00$/, '.0').replace(/(\\.\\d)0$/, '$1') + 'x';
}

function isYouTubeWatchUrl(url) {
  return (
    typeof url === 'string' &&
    /^https?:\\/\\/([a-z0-9-]+\\.)?youtube\\.com\\/watch/i.test(url)
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
  return \`\${y}-\${m}-\${d}\`;
}

function isValidDisplayMode(val) {
  return val === 'total' || val === 'daily' || val === 'off';
}

function sanitizeSavedTimeByDay(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(k)) continue;
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
    /^https?:\\/\\/([a-z0-9-]+\\.)?youtube\\.com\\//i.test(candidateUrl) &&
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
`;

  const pageBridgeJs = `(() => {
  if (typeof window.__CADENCE_PAGE_BRIDGE_CLEANUP__ === 'function') {
    try {
      window.__CADENCE_PAGE_BRIDGE_CLEANUP__();
    } catch (_) {}
  }

  const bridgeController = new AbortController();
  const bridgeSignal = bridgeController.signal;
  const bridgeInstanceId = Symbol('cadenceBridge');

  let hasReceivedConfig = Boolean(window.__CADENCE_LAST_CONFIG__);
  let config = window.__CADENCE_LAST_CONFIG__ || {
    enabled: true,
    perChannelSpeedEnabled: true,
    hasSessionOverride: false,
    stopAfterVideoEnds: true,
    convertShortsToWatch: true,
    disableVideoPreviews: true,
    showWatchLaterRemoveAction: true,
    defaultSpeed: 1.0,
    targetSpeed: 1.0,
  };

  let isApplyingProgrammatically = false;
  let programmaticTimer = null;
  let heartbeatInterval = null;
  let fastBurstInterval = null;
  let lastAppliedSpeed = Number(config.targetSpeed) || 1.0;
  let lastDetectedKey = '';
  let lockedVideoId = '';
  let wasOnWatchPage = false;
  let pendingCardHint = null;
  let heldAtEndVideoId = window.__CADENCE_HELD_VIDEO_ID__ || null;
  let userInitiatedNavUntil = 0;
  let replayGraceUntil = 0;
  let recentNativeSpeedGestureUntil = 0;
  let lastRemainingEmitAt = 0;
  let lastRemainingSignature = '';
  let lastShortsLinkSyncAt = 0;
  let liveStateVideoId = '';
  let liveHeadHysteresisBehind = false;
  let wasAtLiveHead = false;
  let liveAnchorVideoSec = null;
  let liveAnchorWallMs = 0;
  let pausedAtWallMs = 0;
  let resumedAtWallMs = 0;
  let lastObservedCurrentTime = null;
  let lastObservedSeekableEnd = null;
  let lastSeekableEndWallMs = 0;
  let seekableEndAdvanceCount = 0;
  let explicitJumpToLiveUntil = 0;
  let recentBackwardSeekUntil = 0;
  let pendingSeekTargetPlayheadSec = null;
  let pendingSeekUntil = 0;
  let psHasMseCeiling = false;
  let lastCleanPsLagSec = null;
  let lastCleanPsLagAt = 0;
  let lastUiNegativeLagSec = null;
  let lastUiNegativeLagAt = 0;
  let catchupMaxLagSec = null;
  let catchupActive = false;
  let lastCatchupVideoSec = null;
  let lastAutoLiveSyncAt = 0;
  let lastDvrRestoreAt = 0;
  let dvrRestoreAttempts = 0;
  let nonDvrSlowActiveSince = 0;
  let lastNonDvrSlowMediaTime = null;
  let lastNonDvrSlowStreamTime = null;
  let lastNonDvrSlowWallMs = 0;
  let lastNonDvrCatchupAt = 0;
  let nonDvrSubOneRuleClamped = false;
  let wasAdPlaying = false;
  let observedPlayerEl = null;
  let playerClassObserver = null;
  let postSpeedVerifyTimer = null;
  let playlistSuppressedByCadence = false;
  let progressBarDragActive = false;

  let currentVideoTimeSavedSec = 0;
  let unflushedTimeSavedDeltaSec = 0;
  let lastSavedTickWallMs = 0;
  let lastSavedTickVideoSec = null;
  let lastTimeSavedFlushAt = 0;
  let currentSavedTrackingVideoId = '';

  function resetCurrentVideoTimeSaved() {
    flushTimeSavedDelta();
    currentVideoTimeSavedSec = 0;
    unflushedTimeSavedDeltaSec = 0;
    lastSavedTickWallMs = 0;
    lastSavedTickVideoSec = null;
  }

  function ensurePerVideoSavedTimeBoundary(videoId) {
    if (!videoId) return;
    if (currentSavedTrackingVideoId && currentSavedTrackingVideoId !== videoId) {
      resetCurrentVideoTimeSaved();
    }
    currentSavedTrackingVideoId = videoId;
  }

  function trackTimeSavedTick() {
    const player = getMoviePlayer();
    const video = getMainVideo();
    const vid = getCurrentVideoId(player);
    if (vid) {
      ensurePerVideoSavedTimeBoundary(vid);
    }
    if (!video || video.paused || isAdPlaying(player) || isLiveBroadcast(player, video)) {
      lastSavedTickWallMs = Date.now();
      lastSavedTickVideoSec = video ? video.currentTime : null;
      return;
    }
    const now = Date.now();
    if (lastSavedTickWallMs > 0) {
      const dtWall = (now - lastSavedTickWallMs) / 1000;
      const cur = video.currentTime;
      const dtVideo = lastSavedTickVideoSec !== null ? Math.max(0, cur - lastSavedTickVideoSec) : 0;
      if (dtWall > 0.05 && dtWall <= 1.5 && dtVideo > 0.02 && dtVideo <= 3.0) {
        const rate = Number(video.playbackRate) || 1.0;
        if (rate > 1.005) {
          const delta = dtWall * (rate - 1.0);
          if (delta > 0) {
            currentVideoTimeSavedSec += delta;
            unflushedTimeSavedDeltaSec += delta;
          }
        }
      }
    }
    lastSavedTickWallMs = now;
    lastSavedTickVideoSec = video.currentTime;

    if (now - lastTimeSavedFlushAt > 5000) {
      flushTimeSavedDelta();
    }
  }

  function flushTimeSavedDelta() {
    lastTimeSavedFlushAt = Date.now();
    if (unflushedTimeSavedDeltaSec >= 0.5) {
      const toSend = Math.round(unflushedTimeSavedDeltaSec);
      if (toSend >= 1) {
        postToContent('TIME_SAVED_DELTA', { deltaSec: toSend });
        unflushedTimeSavedDeltaSec -= toSend;
      }
    }
  }

  function isChannelTrailerVideo(el) {
    if (!el || typeof el.closest !== 'function') return false;
    return Boolean(el.closest('ytd-channel-video-player-renderer, #c4-player'));
  }

  function isPreviewVideoElement(video) {
    if (!video || video.nodeName !== 'VIDEO') return false;
    if (isChannelTrailerVideo(video)) return false;
    if (
      typeof video.closest === 'function' &&
      video.closest(
        'ytd-video-preview, #inline-preview-player, #video-preview-container, ytd-moving-thumbnail-renderer, yt-animated-thumbnail-view-model, yt-thumbnail-hover-overlay-view-model, yt-lockup-view-model, ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, #mouseover-overlay'
      )
    ) {
      return true;
    }
    const watchPlayer = getMoviePlayer();
    if (watchPlayer && watchPlayer.contains(video)) return false;
    if (typeof video.closest === 'function' && video.closest('ytd-watch-flexy #movie_player, #ytd-player #movie_player, ytd-shorts')) {
      return false;
    }
    return !isSupportedWatchPage();
  }

  function stopPreviewVideoElement(video) {
    if (!video) return;
    try {
      video.autoplay = false;
      video.muted = true;
      if (!video.paused) {
        video.pause();
      }
    } catch (_) {}
  }

  function suppressInlinePreviewPlayerIfNeeded() {
    if (!config.enabled || config.disableVideoPreviews === false) return;
    const inlinePlayers = document.querySelectorAll('ytd-video-preview #inline-preview-player, #inline-preview-player');
    for (const inlinePlayer of inlinePlayers) {
      if (isChannelTrailerVideo(inlinePlayer)) continue;
      if (typeof inlinePlayer.mute === 'function') {
        try {
          inlinePlayer.mute();
        } catch (_) {}
      }
      if (typeof inlinePlayer.pauseVideo === 'function') {
        try {
          inlinePlayer.pauseVideo();
        } catch (_) {}
      }
    }
    const previewVideos = document.querySelectorAll(
      'ytd-video-preview video, #inline-preview-player video, #video-preview-container video, yt-lockup-view-model video, ytd-video-renderer video, ytd-moving-thumbnail-renderer video, yt-animated-thumbnail-view-model video'
    );
    for (const previewVideo of previewVideos) {
      if (isPreviewVideoElement(previewVideo)) {
        stopPreviewVideoElement(previewVideo);
      }
    }
  }

  function postToContent(type, payload) {
    window.postMessage(
      {
        source: 'CADENCE_MAIN_BRIDGE',
        type,
        payload,
      },
      '*'
    );
  }

  function setPlaylistAutoAdvanceFlag(playlistManager, allow) {
    if (!playlistManager) return;
    const targets = [
      playlistManager,
      playlistManager.polymerController,
      playlistManager.inst,
    ];
    for (const target of targets) {
      if (target && typeof target === 'object') {
        try {
          if ('canAutoAdvance_' in target || target === playlistManager) {
            target.canAutoAdvance_ = allow;
          }
        } catch (_) {}
      }
    }
  }

  function restorePlaylistAutoAdvanceIfNeeded() {
    if (!playlistSuppressedByCadence) return;
    playlistSuppressedByCadence = false;
    const playlistManager = document.querySelector('yt-playlist-manager');
    setPlaylistAutoAdvanceFlag(playlistManager, true);
  }

  function markUserNavigationIntent() {
    userInitiatedNavUntil = Date.now() + 4000;
    restorePlaylistAutoAdvanceIfNeeded();
  }

  function parseVideoIdFromHref(rawHref) {
    if (!rawHref) return '';
    try {
      const parsed = new URL(rawHref, location.origin);
      if (parsed.pathname.startsWith('/watch')) {
        return parsed.searchParams.get('v') || '';
      }
    } catch (_) {}
    return '';
  }

  function parseShortsIdFromHref(rawHref) {
    if (!rawHref) return '';
    try {
      const parsed = new URL(rawHref, location.origin);
      const match = parsed.pathname.match(/^\\/shorts\\/([a-zA-Z0-9_-]{6,24})(?:\\/|$)/);
      if (match && match[1]) {
        return match[1];
      }
    } catch (_) {}
    return '';
  }

  function buildWatchUrlFromShortsHref(rawHref) {
    if (!rawHref) return '';
    try {
      const parsed = new URL(rawHref, location.origin);
      const match = parsed.pathname.match(/^\\/shorts\\/([a-zA-Z0-9_-]{6,24})(?:\\/|$)/);
      if (!match || !match[1]) return '';
      const nextParams = new URLSearchParams();
      nextParams.set('v', match[1]);
      const tVal = parsed.searchParams.get('t');
      if (tVal) nextParams.set('t', tVal);
      return '/watch?' + nextParams.toString();
    } catch (_) {}
    return '';
  }

  function shouldConvertShorts() {
    return Boolean(hasReceivedConfig && config.enabled && config.convertShortsToWatch !== false);
  }

  function maybeRedirectCurrentShortsRoute() {
    if (!shouldConvertShorts()) return false;
    const watchTarget = buildWatchUrlFromShortsHref(location.href);
    if (!watchTarget) return false;
    location.replace(watchTarget);
    return true;
  }

  function syncShortsLinksInDom(force = false) {
    if (!hasReceivedConfig) return;
    const now = Date.now();
    if (!force && now - lastShortsLinkSyncAt < 900) return;
    lastShortsLinkSyncAt = now;

    if (shouldConvertShorts()) {
      const shortsAnchors = document.querySelectorAll('a[href*="/shorts/"]');
      for (const anchor of shortsAnchors) {
        const currentHref = anchor.getAttribute('href') || '';
        const watchHref = buildWatchUrlFromShortsHref(currentHref);
        if (!watchHref) continue;
        if (!anchor.hasAttribute('data-cadence-orig-shorts-href')) {
          anchor.setAttribute('data-cadence-orig-shorts-href', currentHref);
        }
        anchor.setAttribute('href', watchHref);
      }
    } else {
      const rewrittenAnchors = document.querySelectorAll('a[data-cadence-orig-shorts-href]');
      for (const anchor of rewrittenAnchors) {
        const origHref = anchor.getAttribute('data-cadence-orig-shorts-href');
        if (origHref) {
          anchor.setAttribute('href', origHref);
        }
        anchor.removeAttribute('data-cadence-orig-shorts-href');
      }
    }
  }

  function getUrlVideoId() {
    return parseVideoIdFromHref(location.href);
  }

  function isSupportedWatchPage() {
    return location.pathname.startsWith('/watch');
  }

  function extractCardPreviewHint(target) {
    const watchAnchor = target.closest(
      'a[href*="/watch"], a[href*="/shorts/"], a[data-cadence-orig-shorts-href]'
    );
    if (!watchAnchor) return null;
    const rawHref = watchAnchor.getAttribute('href') || '';
    const origShortsHref = watchAnchor.getAttribute('data-cadence-orig-shorts-href') || '';
    const videoId =
      parseVideoIdFromHref(rawHref) ||
      parseShortsIdFromHref(rawHref) ||
      parseShortsIdFromHref(origShortsHref);
    if (!videoId) return null;

    const card = target.closest(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer, yt-lockup-view-model'
    );

    let handle = '';
    let channelId = '';
    let channelName = '';

    if (card) {
      const channelAnchors = card.querySelectorAll('a[href*="/@"], a[href*="/channel/UC"]');
      for (const chAnchor of channelAnchors) {
        const href = chAnchor.getAttribute('href') || '';
        if (href.includes('/watch') || href.includes('/shorts/')) continue;
        const hMatch = href.match(/\\/(@[^/?#]+)/);
        if (hMatch && !handle) handle = hMatch[1].toLowerCase();
        const cMatch = href.match(/\\/channel\\/(UC[^/?#]+)/);
        if (cMatch && !channelId) channelId = cMatch[1];
        const txt = (chAnchor.textContent || '').trim();
        if (txt && !channelName) channelName = txt;
      }

      if (!channelName) {
        const nameEl = card.querySelector(
          'ytd-channel-name #text, .yt-content-metadata-view-model__metadata-row span'
        );
        if (nameEl) {
          const txt = (nameEl.textContent || '').trim();
          if (txt && !txt.includes('views') && !txt.includes('ago')) {
            channelName = txt;
          }
        }
      }
    }

    return {
      videoId,
      channelId,
      handle,
      channelName,
      expiresAt: Date.now() + 5000,
    };
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (
        target.closest(
          '.ytp-next-button, .ytp-prev-button, ytd-playlist-panel-video-renderer, ytd-compact-video-renderer, a[href*="/watch"], a[href*="/shorts/"], a[data-cadence-orig-shorts-href], .cadence-play-next-btn'
        )
      ) {
        markUserNavigationIntent();
      }
      if (target.closest('.ytp-settings-button, .ytp-settings-menu, .ytp-panel-menu, .ytp-menuitem')) {
        recentNativeSpeedGestureUntil = Date.now() + 4500;
      }
      if (target.closest('.ytp-live-badge')) {
        explicitJumpToLiveUntil = Date.now() + 2800;
        recentBackwardSeekUntil = 0;
        pendingSeekTargetPlayheadSec = null;
        pendingSeekUntil = 0;
        liveHeadHysteresisBehind = false;
      }

      if (
        e.button === 0 &&
        config.enabled &&
        config.stopAfterVideoEnds &&
        isSupportedWatchPage() &&
        Date.now() > userInitiatedNavUntil &&
        target.closest('.ytp-progress-bar, .ytp-progress-bar-container')
      ) {
        const player = getMoviePlayer();
        const video = getMainVideo();
        if (video && !isAdPlaying(player) && !video.loop && !isLiveBroadcast(player, video)) {
          progressBarDragActive = true;
          const barEl =
            target.closest('.ytp-progress-bar') ||
            (player && player.querySelector('.ytp-progress-bar'));
          const effectiveDur = resolveEffectiveVodDurationSec(player, video);
          if (barEl && effectiveDur !== null && effectiveDur > 2.5) {
            const rect = barEl.getBoundingClientRect();
            if (rect.width > 40) {
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              if (ratio * effectiveDur >= effectiveDur - 0.65) {
                progressBarDragActive = false;
                e.preventDefault();
                e.stopPropagation();
                triggerEndOfVideoStop(player, video, Math.max(0, effectiveDur - 0.55), true);
                return;
              }
            }
          }
        }
      }

      if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        const hint = extractCardPreviewHint(target);
        if (hint) {
          pendingCardHint = hint;
          if (!isSupportedWatchPage()) {
            postToContent('NAVIGATION_PREVIEW', hint);
            startFastDetectionBurst();
          }
        }
      }
    },
    { capture: true, signal: bridgeSignal }
  );

  function handleProgressBarReleaseAtEnd(e) {
    const wasDraggingBar = progressBarDragActive;
    progressBarDragActive = false;
    if (
      e.button !== 0 ||
      !config.enabled ||
      !config.stopAfterVideoEnds ||
      !isSupportedWatchPage() ||
      Date.now() <= userInitiatedNavUntil
    ) {
      return;
    }
    const player = getMoviePlayer();
    const video = getMainVideo();
    if (!player || !video || isAdPlaying(player) || video.loop || isLiveBroadcast(player, video)) {
      return;
    }
    if (!Number.isFinite(video.duration) || video.duration === Infinity) {
      return;
    }
    const target = e.target instanceof Element ? e.target : null;
    const isPlayerScrubbing =
      wasDraggingBar ||
      player.classList.contains('ytp-progress-bar-drag') ||
      player.classList.contains('ytp-scrubbing-mode') ||
      Boolean(target && target.closest('.ytp-progress-bar, .ytp-progress-bar-container'));
    if (!isPlayerScrubbing) {
      return;
    }
    const barEl = player.querySelector('.ytp-progress-bar');
    const effectiveDur = resolveEffectiveVodDurationSec(player, video);
    if (!barEl || effectiveDur === null || effectiveDur <= 2.5) return;
    const rect = barEl.getBoundingClientRect();
    if (rect.width <= 40) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (ratio * effectiveDur >= effectiveDur - 0.85) {
      triggerEndOfVideoStop(player, video, Math.max(0, effectiveDur - 0.55), true);
      setTimeout(() => {
        const pNow = getMoviePlayer();
        const vNow = getMainVideo();
        const durNow = resolveEffectiveVodDurationSec(pNow, vNow);
        if (vNow && durNow !== null && durNow > 2.5) {
          triggerEndOfVideoStop(pNow, vNow, Math.max(0, durNow - 0.55), true);
        }
      }, 45);
    }
  }

  document.addEventListener('pointerup', handleProgressBarReleaseAtEnd, {
    capture: true,
    signal: bridgeSignal,
  });

  document.addEventListener('mouseup', handleProgressBarReleaseAtEnd, {
    capture: true,
    signal: bridgeSignal,
  });

  document.addEventListener(
    'pointercancel',
    () => {
      progressBarDragActive = false;
    },
    { capture: true, signal: bridgeSignal }
  );

  document.addEventListener(
    'click',
    (e) => {
      const rawTarget = e.target instanceof Element ? e.target : null;
      if (
        rawTarget &&
        rawTarget.closest('.ytp-settings-button, .ytp-settings-menu, .ytp-panel-menu, .ytp-menuitem')
      ) {
        recentNativeSpeedGestureUntil = Date.now() + 4500;
      }
      if (rawTarget && rawTarget.closest('.ytp-live-badge')) {
        explicitJumpToLiveUntil = Date.now() + 2800;
        recentBackwardSeekUntil = 0;
        pendingSeekTargetPlayheadSec = null;
        pendingSeekUntil = 0;
        liveHeadHysteresisBehind = false;
        const p = getMoviePlayer();
        const v = getMainVideo();
        if (v && v.playbackRate > 1.01) {
          applyLiveHeadRateClamp(p, v);
        }
        setTimeout(() => {
          const pNow = getMoviePlayer();
          const vNow = getMainVideo();
          if (vNow && isLiveBroadcast(pNow, vNow) && vNow.playbackRate > 1.01) {
            applyLiveHeadRateClamp(pNow, vNow);
          }
          emitTimeRemaining(true);
        }, 65);
        setTimeout(() => emitTimeRemaining(true), 240);
      }
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
        return;
      }
      const target = rawTarget;
      if (!target) return;

      if (
        shouldConvertShorts() &&
        !target.closest('button, yt-icon-button, #menu, ytd-menu-renderer')
      ) {
        const shortsAnchor = target.closest(
          'a[data-cadence-orig-shorts-href], a[href*="/shorts/"]'
        );
        if (shortsAnchor) {
          const rawShortsHref =
            shortsAnchor.getAttribute('data-cadence-orig-shorts-href') ||
            shortsAnchor.getAttribute('href') ||
            '';
          const convertedWatchUrl = buildWatchUrlFromShortsHref(rawShortsHref);
          if (convertedWatchUrl) {
            e.preventDefault();
            e.stopPropagation();
            markUserNavigationIntent();
            const hint = extractCardPreviewHint(target);
            if (hint) {
              pendingCardHint = hint;
              postToContent('NAVIGATION_PREVIEW', hint);
            }
            if (location.pathname.startsWith('/shorts/')) {
              location.replace(convertedWatchUrl);
            } else {
              location.assign(convertedWatchUrl);
            }
            return;
          }
        }
      }

      const hint = extractCardPreviewHint(target);
      if (hint) {
        pendingCardHint = hint;
        postToContent('NAVIGATION_PREVIEW', hint);
        startFastDetectionBurst();
        return;
      }

      const homeOrBrowseLink = target.closest(
        'a#logo, ytd-topbar-logo-renderer a, a[href="/"], a[href^="/feed/"], a[href^="/results"]'
      );
      if (homeOrBrowseLink) {
        setTimeout(() => {
          if (!isSupportedWatchPage()) {
            handleNonWatchRoute();
          }
        }, 0);
      }
    },
    { capture: true, signal: bridgeSignal }
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.shiftKey && (e.key === 'N' || e.key === 'n' || e.key === 'P' || e.key === 'p')) {
        markUserNavigationIntent();
      }
      const activeEl = e.target;
      const isTyping =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        Boolean(activeEl && activeEl.isContentEditable);

      if (
        !isTyping &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey &&
        (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L' || e.key === 'End') &&
        config.enabled &&
        config.stopAfterVideoEnds &&
        isSupportedWatchPage() &&
        Date.now() > userInitiatedNavUntil
      ) {
        const player = getMoviePlayer();
        const video = getMainVideo();
        if (video && !isAdPlaying(player) && !video.loop && !isLiveBroadcast(player, video)) {
          const effectiveDur = resolveEffectiveVodDurationSec(player, video);
          if (effectiveDur !== null && effectiveDur > 2.5) {
            let cur = Number.isFinite(video.currentTime) ? video.currentTime : 0;
            const streamCur = readPlayerStreamTimeSec(player);
            if (streamCur !== null && streamCur > cur) {
              cur = streamCur;
            }
            const keyDelta =
              e.key === 'End' ? effectiveDur : e.key === 'l' || e.key === 'L' ? 10 : 5;
            if (cur + keyDelta >= effectiveDur - 0.65) {
              e.preventDefault();
              e.stopPropagation();
              triggerEndOfVideoStop(player, video, Math.max(0, effectiveDur - 0.55), true);
              return;
            }
          }
        }
      }

      if (e.shiftKey && (e.key === '>' || e.key === '<' || e.key === '.' || e.key === ',')) {
        recentNativeSpeedGestureUntil = Date.now() + 2500;
        if (e.key === '<' || e.key === ',') {
          nonDvrSubOneRuleClamped = false;
        }
        if (!isTyping && config.enabled) {
          const player = getMoviePlayer();
          const video = getMainVideo();
          if (isAdPlaying(player)) {
            e.preventDefault();
            e.stopPropagation();
            if (video && Math.abs(video.playbackRate - 1.0) > 0.02) {
              applyLiveHeadRateClamp(player, video);
            }
            postToContent('AD_SPEED_BLOCKED', {
              videoId: getCurrentVideoId(player) || '',
            });
            emitTimeRemaining(true);
            return;
          }
          if ((e.key === '>' || e.key === '.') && video && isLiveBroadcast(player, video)) {
            const dvr = measureLiveDvrState(player, video, getCurrentVideoId(player));
            if (dvr.isAtLiveHead && video.playbackRate >= 0.99) {
              setTimeout(() => {
                const pNow = getMoviePlayer();
                const vNow = getMainVideo();
                if (vNow && isLiveBroadcast(pNow, vNow)) {
                  const dvrNow = measureLiveDvrState(pNow, vNow, getCurrentVideoId(pNow));
                  if (dvrNow.isAtLiveHead) {
                    applyLiveHeadRateClamp(pNow, vNow);
                    postToContent('LIVE_HEAD_SPEED_BLOCKED', {
                      videoId: getCurrentVideoId(pNow) || '',
                      attemptedSpeed: 1.25,
                    });
                    emitTimeRemaining(true);
                  }
                }
              }, 25);
            }
          }
        }
      }
    },
    { capture: true, signal: bridgeSignal }
  );

  function getMoviePlayer() {
    return (
      document.querySelector('ytd-watch-flexy #movie_player') ||
      document.querySelector('#ytd-player #movie_player') ||
      document.getElementById('movie_player')
    );
  }

  function getMainVideo() {
    return (
      document.querySelector('ytd-watch-flexy video.html5-main-video') ||
      document.querySelector('#movie_player video.html5-main-video') ||
      document.querySelector('video.html5-main-video')
    );
  }

  function isAdPlaying(player) {
    if (!player || !player.classList) return false;
    return player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
  }

  function getCurrentVideoId(player) {
    const urlVid = getUrlVideoId();
    if (urlVid) return urlVid;
    const flexy = document.querySelector('ytd-watch-flexy');
    if (flexy && flexy.getAttribute('video-id')) {
      return flexy.getAttribute('video-id');
    }
    try {
      if (player && typeof player.getVideoData === 'function') {
        const vd = player.getVideoData();
        if (vd && vd.video_id) return vd.video_id;
      }
    } catch (_) {}
    return '';
  }

  function getLiveBadgeElement(player) {
    const p = player || getMoviePlayer();
    const root = p || document;
    const badge = root.querySelector('.ytp-chrome-bottom .ytp-live-badge, .ytp-live-badge');
    if (!(badge instanceof HTMLElement)) return null;
    if (badge.hasAttribute('hidden')) return null;
    try {
      const style = window.getComputedStyle(badge);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
    } catch (_) {}
    return badge;
  }

  function isLiveBadgeAtHead(badge) {
    if (!badge) return false;
    if (
      badge.classList.contains('ytp-live-badge-is-livehead') ||
      badge.classList.contains('ytp-livehead')
    ) {
      return true;
    }
    return Boolean(
      (badge.disabled === true ||
        badge.hasAttribute('disabled') ||
        badge.getAttribute('aria-disabled') === 'true') &&
        !badge.hasAttribute('hidden') &&
        badge.offsetParent !== null
    );
  }

  function isLiveBroadcast(player, video) {
    if (isAdPlaying(player)) return false;

    const p = player || getMoviePlayer();
    const v = video || getMainVideo();

    // 1. YouTube Player API authoritative metadata check
    if (p) {
      try {
        if (typeof p.getVideoData === 'function') {
          const vd = p.getVideoData();
          if (vd && typeof vd.isLive === 'boolean') {
            return vd.isLive;
          }
        }
        if (typeof p.getPlayerResponse === 'function') {
          const resp = p.getPlayerResponse();
          const details = resp && resp.videoDetails;
          if (details && typeof details.isLive === 'boolean') {
            const liveMicro =
              resp.microformat &&
              resp.microformat.playerMicroformatRenderer &&
              resp.microformat.playerMicroformatRenderer.liveBroadcastDetails;
            if (liveMicro && liveMicro.isLiveNow === false) {
              return false;
            }
            return details.isLive;
          }
        }
      } catch (_) {}

      // 2. Canonical Player classes and DOM indicators
      if (
        p.classList &&
        (p.classList.contains('ytp-live') || p.classList.contains('ytp-live-mode'))
      ) {
        return true;
      }

      const root = p || document;
      const liveTimeDisplay = root.querySelector(
        '.ytp-chrome-bottom .ytp-time-display.ytp-live, .ytp-time-display.ytp-live'
      );
      if (liveTimeDisplay) return true;

      const badge = root.querySelector('.ytp-chrome-bottom .ytp-live-badge, .ytp-live-badge');
      if (badge instanceof HTMLElement && !badge.hasAttribute('hidden') && badge.offsetParent !== null) {
        return true;
      }
    }

    // 3. Canonical live stream HTML5 media duration (Infinity or NaN after loaded)
    if (v && (v.duration === Infinity || (v.readyState >= 1 && !Number.isFinite(v.duration)))) {
      return true;
    }

    return false;
  }

  function resetLiveTrackingState(videoId = '') {
    liveStateVideoId = videoId;
    liveHeadHysteresisBehind = false;
    wasAtLiveHead = false;
    liveAnchorVideoSec = null;
    liveAnchorWallMs = 0;
    pausedAtWallMs = 0;
    resumedAtWallMs = 0;
    lastObservedCurrentTime = null;
    lastObservedSeekableEnd = null;
    lastSeekableEndWallMs = 0;
    seekableEndAdvanceCount = 0;
    explicitJumpToLiveUntil = 0;
    recentBackwardSeekUntil = 0;
    pendingSeekTargetPlayheadSec = null;
    pendingSeekUntil = 0;
    psHasMseCeiling = false;
    lastCleanPsLagSec = null;
    lastCleanPsLagAt = 0;
    lastUiNegativeLagSec = null;
    lastUiNegativeLagAt = 0;
    catchupMaxLagSec = null;
    catchupActive = false;
    lastCatchupVideoSec = null;
    lastAutoLiveSyncAt = 0;
    dvrRestoreAttempts = 0;
    nonDvrSlowActiveSince = 0;
    lastNonDvrSlowMediaTime = null;
    lastNonDvrSlowStreamTime = null;
    lastNonDvrSlowWallMs = 0;
    nonDvrSubOneRuleClamped = false;
  }

  function readPlayerStreamTimeSec(player, psOverride = null) {
    try {
      if (player && typeof player.getCurrentTime === 'function') {
        const cur = Number(player.getCurrentTime());
        if (Number.isFinite(cur) && cur >= 0) {
          return cur;
        }
      }
    } catch (_) {}
    try {
      const ps =
        psOverride ||
        (player && typeof player.getProgressState === 'function'
          ? player.getProgressState()
          : null);
      if (ps && Number.isFinite(ps.current) && ps.current >= 0) {
        return ps.current;
      }
    } catch (_) {}
    return null;
  }

  function isLiveDvrSupported(player, video, currentVid = '') {
    try {
      if (player && typeof player.getPlayerResponse === 'function') {
        const resp = player.getPlayerResponse();
        const details = resp && resp.videoDetails;
        if (details && (!currentVid || !details.videoId || details.videoId === currentVid)) {
          if (details.isLive === true && details.isLiveDvrEnabled === false) {
            return false;
          }
        }
      }
    } catch (_) {}
    try {
      if (player && typeof player.getProgressState === 'function') {
        const ps = player.getProgressState();
        if (ps && ps.allowSeeking === false) {
          return false;
        }
        if (
          ps &&
          Number.isFinite(ps.seekableStart) &&
          Number.isFinite(ps.seekableEnd) &&
          ps.seekableEnd >= ps.seekableStart &&
          ps.seekableEnd - ps.seekableStart < 6 &&
          (ps.seekableStart > 20 ||
            (video && Number.isFinite(video.currentTime) && video.currentTime > 15))
        ) {
          return false;
        }
      }
    } catch (_) {}
    return true;
  }

  function seekPlayerToLiveEdge(player, video) {
    const badge = getLiveBadgeElement(player);
    let jumpedViaBadge = false;
    if (badge && !isLiveBadgeAtHead(badge)) {
      try {
        badge.click();
        jumpedViaBadge = true;
      } catch (_) {}
    }

    let soughtViaProgress = false;
    try {
      if (!psHasMseCeiling && player && typeof player.getProgressState === 'function') {
        const ps = player.getProgressState();
        if (
          ps &&
          Number.isFinite(ps.seekableEnd) &&
          ps.seekableEnd > 0 &&
          (!jumpedViaBadge ||
            (Number.isFinite(ps.current) && ps.seekableEnd - ps.current > 2))
        ) {
          if (typeof player.seekTo === 'function') {
            const safeStreamEdge = Math.max(0, ps.seekableEnd - 0.25);
            liveAnchorVideoSec = safeStreamEdge;
            liveAnchorWallMs = Date.now();
            player.seekTo(safeStreamEdge, true);
            soughtViaProgress = true;
          }
        }
      }
    } catch (_) {}

    if (!jumpedViaBadge && !soughtViaProgress && video) {
      if (
        liveAnchorWallMs > 0 &&
        liveAnchorVideoSec !== null &&
        player &&
        typeof player.seekTo === 'function'
      ) {
        const expectedEdge =
          liveAnchorVideoSec + Math.max(0, (Date.now() - liveAnchorWallMs) / 1000);
        const safeEdge = Math.max(0, expectedEdge - 0.25);
        liveAnchorVideoSec = safeEdge;
        liveAnchorWallMs = Date.now();
        try {
          player.seekTo(safeEdge, true);
          soughtViaProgress = true;
        } catch (_) {}
      }
      if (!soughtViaProgress && video.buffered && video.buffered.length > 0) {
        try {
          const bufEnd = video.buffered.end(video.buffered.length - 1);
          if (Number.isFinite(bufEnd) && bufEnd > 0) {
            video.currentTime = Math.max(0, bufEnd - 0.25);
          }
        } catch (_) {}
      }
    }
  }

  function applyLiveHeadRateClamp(player, video, clampSubOne = false) {
    isApplyingProgrammatically = true;
    clearTimeout(programmaticTimer);
    lastAppliedSpeed = 1.0;
    try {
      if (player && typeof player.setPlaybackRate === 'function') {
        const pr =
          typeof player.getPlaybackRate === 'function' ? Number(player.getPlaybackRate()) : 1.5;
        if (!Number.isFinite(pr) || pr > 1.01 || (clampSubOne && pr < 0.99)) {
          player.setPlaybackRate(1);
        }
      }
    } catch (_) {}
    if (video && (video.playbackRate > 1.01 || (clampSubOne && video.playbackRate < 0.99))) {
      video.playbackRate = 1.0;
    }
    programmaticTimer = setTimeout(() => {
      isApplyingProgrammatically = false;
    }, 350);
  }

  function handleNonDvrForcedCatchup(player, video) {
    const now = Date.now();
    if (now - lastNonDvrCatchupAt < 1500) return;
    lastNonDvrCatchupAt = now;
    nonDvrSlowActiveSince = 0;
    lastNonDvrSlowMediaTime = null;
    lastNonDvrSlowStreamTime = null;
    lastNonDvrSlowWallMs = 0;
    nonDvrSubOneRuleClamped = true;
    explicitJumpToLiveUntil = now + 2800;
    config.hasSessionOverride = false;
    config.targetSpeed = 1.0;
    window.__CADENCE_LAST_CONFIG__ = config;
    const wasPlayingBefore = Boolean(video && !video.paused);
    seekPlayerToLiveEdge(player, video);
    applyLiveHeadRateClamp(player, video, true);
    if (wasPlayingBefore && video && video.paused) {
      video.play().catch(() => {});
      try {
        if (player && typeof player.playVideo === 'function') {
          player.playVideo();
        }
      } catch (_) {}
    }
    postToContent('NON_DVR_FORCED_CATCHUP', {
      videoId: getCurrentVideoId(player) || '',
    });
    emitTimeRemaining(true);
    setTimeout(() => emitTimeRemaining(true), 90);
  }

  function checkNonDvrSlowForcedCatchup(player, video) {
    if (!isSupportedWatchPage() || !config.enabled || !video) return;
    if (isAdPlaying(player) || !isLiveBroadcast(player, video)) {
      nonDvrSlowActiveSince = 0;
      lastNonDvrSlowMediaTime = null;
      lastNonDvrSlowStreamTime = null;
      lastNonDvrSlowWallMs = 0;
      return;
    }
    const vid = getCurrentVideoId(player) || '';
    if (isLiveDvrSupported(player, video, vid) !== false) {
      nonDvrSlowActiveSince = 0;
      lastNonDvrSlowMediaTime = null;
      lastNonDvrSlowStreamTime = null;
      lastNonDvrSlowWallMs = 0;
      return;
    }

    const now = Date.now();
    const curMedia = Number.isFinite(video.currentTime) ? video.currentTime : null;
    const curStream = readPlayerStreamTimeSec(player);
    const activeRate = Number(video.playbackRate) || 1.0;

    if (activeRate >= 0.99 || nonDvrSubOneRuleClamped) {
      nonDvrSlowActiveSince = 0;
      lastNonDvrSlowMediaTime = curMedia;
      lastNonDvrSlowStreamTime = curStream;
      lastNonDvrSlowWallMs = now;
      return;
    }

    if (nonDvrSlowActiveSince === 0) {
      nonDvrSlowActiveSince = now;
      lastNonDvrSlowMediaTime = curMedia;
      lastNonDvrSlowStreamTime = curStream;
      lastNonDvrSlowWallMs = now;
      return;
    }

    if (video.paused) {
      lastNonDvrSlowWallMs = now;
      return;
    }

    const activeElapsedMs = now - nonDvrSlowActiveSince;
    const dtWallSec =
      lastNonDvrSlowWallMs > 0 ? Math.max(0, (now - lastNonDvrSlowWallMs) / 1000) : 0;

    // 1. Detect YouTube live latency controller snapping playhead forward to live edge
    if (activeElapsedMs > 1400 && dtWallSec < 6) {
      const mediaJumpedForward =
        curMedia !== null &&
        lastNonDvrSlowMediaTime !== null &&
        curMedia - lastNonDvrSlowMediaTime > Math.max(1.5, dtWallSec * 1.05 + 1.25);
      const streamJumpedForward =
        curStream !== null &&
        lastNonDvrSlowStreamTime !== null &&
        curStream - lastNonDvrSlowStreamTime > Math.max(1.8, dtWallSec * 1.05 + 1.5);
      if (mediaJumpedForward || streamJumpedForward) {
        handleNonDvrForcedCatchup(player, video);
        return;
      }
    }

    // 2. Detect MSE SourceBuffer rear eviction gap behind slowed playhead
    if (activeElapsedMs > 2000 && curMedia !== null && video.buffered && video.buffered.length > 0) {
      try {
        const bufStart = video.buffered.start(0);
        if (Number.isFinite(bufStart) && bufStart > curMedia + 0.35) {
          handleNonDvrForcedCatchup(player, video);
          return;
        }
      } catch (_) {}
    }

    lastNonDvrSlowMediaTime = curMedia;
    lastNonDvrSlowStreamTime = curStream;
    lastNonDvrSlowWallMs = now;
  }

  function syncNativeLiveBadgeOnCatchup(player, video) {
    const now = Date.now();
    if (now < explicitJumpToLiveUntil || now - lastAutoLiveSyncAt < 3500) {
      applyLiveHeadRateClamp(player, video);
      return;
    }
    lastAutoLiveSyncAt = now;
    explicitJumpToLiveUntil = now + 2800;
    recentBackwardSeekUntil = 0;
    pendingSeekTargetPlayheadSec = null;
    pendingSeekUntil = 0;
    catchupMaxLagSec = null;
    catchupActive = false;
    lastCatchupVideoSec = null;
    seekPlayerToLiveEdge(player, video);
    applyLiveHeadRateClamp(player, video);
    postToContent('LIVE_CAUGHT_UP', {
      videoId: getCurrentVideoId(player) || '',
    });
  }

  function readNegativeLiveTimeOffsetSec(player) {
    const root = player || document;
    const timeEl = root.querySelector(
      '.ytp-chrome-bottom .ytp-time-display.ytp-live .ytp-time-current, .ytp-time-display.ytp-live .ytp-time-current'
    );
    if (!(timeEl instanceof HTMLElement)) return null;
    try {
      const style = window.getComputedStyle(timeEl);
      if (style.display === 'none' || style.visibility === 'hidden') return null;
    } catch (_) {}
    const raw = (timeEl.textContent || '').trim();
    const match = raw.match(/^[-−]\\s*(\\d+):(\\d{2})(?::(\\d{2}))?$/);
    if (!match) return null;
    if (match[3] !== undefined) {
      return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function measureLiveDvrState(player, video, currentVid) {
    const now = Date.now();
    if (currentVid && currentVid !== liveStateVideoId) {
      resetLiveTrackingState(currentVid);
    }

    const dvrSupported = isLiveDvrSupported(player, video, currentVid);
    const isPaused = Boolean(video && video.paused);
    const rawMediaTimeSec =
      video && Number.isFinite(video.currentTime) ? video.currentTime : null;
    const mediaDuration =
      video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;

    if (isPaused) {
      if (pausedAtWallMs === 0) {
        pausedAtWallMs = now;
      }
      seekableEndAdvanceCount = 0;
    } else if (pausedAtWallMs > 0) {
      resumedAtWallMs = now;
      pausedAtWallMs = 0;
    }

    if (!dvrSupported) {
      catchupMaxLagSec = null;
      catchupActive = false;
      lastCatchupVideoSec = null;
      liveHeadHysteresisBehind = false;
      dvrRestoreAttempts = 0;
      return {
        isAtLiveHead: true,
        dvrLagSec: 0,
        isPaused,
        isDvrSupported: false,
      };
    }

    let maxBufferedEnd = null;
    if (video && video.buffered && video.buffered.length > 0) {
      try {
        const bEnd = video.buffered.end(video.buffered.length - 1);
        if (Number.isFinite(bEnd)) maxBufferedEnd = bEnd;
      } catch (_) {}
    }

    const badge = getLiveBadgeElement(player);
    const badgeAtHead = isLiveBadgeAtHead(badge);
    const uiNegSec = readNegativeLiveTimeOffsetSec(player);

    let ps = null;
    try {
      if (player && typeof player.getProgressState === 'function') {
        ps = player.getProgressState();
      }
    } catch (_) {}

    const rawPlayerStreamSec = readPlayerStreamTimeSec(player, ps);
    let pendingSeekActive = false;
    if (pendingSeekTargetPlayheadSec !== null) {
      if (
        now >= pendingSeekUntil ||
        (rawPlayerStreamSec !== null &&
          Math.abs(rawPlayerStreamSec - pendingSeekTargetPlayheadSec) <= 3.5)
      ) {
        pendingSeekTargetPlayheadSec = null;
        pendingSeekUntil = 0;
      } else {
        pendingSeekActive = true;
      }
    }

    const playheadSec = pendingSeekActive
      ? pendingSeekTargetPlayheadSec
      : rawPlayerStreamSec !== null
        ? rawPlayerStreamSec
        : rawMediaTimeSec;

    if (ps && Number.isFinite(ps.seekableEnd)) {
      if (!isPaused && lastObservedSeekableEnd !== null && ps.seekableEnd > lastObservedSeekableEnd + 0.25) {
        seekableEndAdvanceCount = Math.min(10, seekableEndAdvanceCount + 1);
        lastSeekableEndWallMs = now;
      }
      lastObservedSeekableEnd = ps.seekableEnd;
    }

    let preAnchorLagSec = null;
    if (
      liveAnchorWallMs > 0 &&
      liveAnchorWallMs <= now &&
      liveAnchorVideoSec !== null &&
      playheadSec !== null
    ) {
      const preExpectedLive = liveAnchorVideoSec + Math.max(0, (now - liveAnchorWallMs) / 1000);
      preAnchorLagSec = Math.max(0, preExpectedLive - playheadSec);
    }

    const backwardSeeked =
      lastObservedCurrentTime !== null &&
      playheadSec !== null &&
      playheadSec < lastObservedCurrentTime - 1.25;

    const forwardSeekedNearHead =
      now >= recentBackwardSeekUntil &&
      !pendingSeekActive &&
      lastObservedCurrentTime !== null &&
      playheadSec !== null &&
      playheadSec - lastObservedCurrentTime > 4.5 &&
      (preAnchorLagSec === null || preAnchorLagSec <= 12);

    if (playheadSec !== null) {
      lastObservedCurrentTime = playheadSec;
    }

    const psIsAtHead =
      !pendingSeekActive && ps && typeof ps.isAtLiveHead === 'boolean' ? ps.isAtLiveHead : null;

    let cleanPsLag = null;
    let rawPsLagUninterpolated = null;
    let slidingDvrCapSec = null;
    const effectivePsCurrent = pendingSeekActive
      ? pendingSeekTargetPlayheadSec
      : ps && Number.isFinite(ps.current)
        ? ps.current
        : null;
    if (
      !psHasMseCeiling &&
      ps &&
      Number.isFinite(ps.seekableEnd) &&
      effectivePsCurrent !== null &&
      ps.seekableEnd >= effectivePsCurrent
    ) {
      const rawPsLag = ps.seekableEnd - effectivePsCurrent;
      const matchesMseDurationCeiling =
        (mediaDuration !== null &&
          maxBufferedEnd !== null &&
          mediaDuration - maxBufferedEnd > 300 &&
          Math.abs(ps.seekableEnd - mediaDuration) < 30) ||
        (mediaDuration !== null &&
          rawMediaTimeSec !== null &&
          rawMediaTimeSec < 20 &&
          Math.abs(rawPsLag - 3600) < 45) ||
        (uiNegSec !== null && Math.abs(rawPsLag - uiNegSec) > 300) ||
        (preAnchorLagSec !== null &&
          seekableEndAdvanceCount < 2 &&
          rawPsLag - preAnchorLagSec > 300);

      if (matchesMseDurationCeiling) {
        psHasMseCeiling = true;
      } else {
        rawPsLagUninterpolated = Math.max(0, rawPsLag);
        const segElapsedSec =
          !isPaused && rawPsLagUninterpolated > 10 && lastSeekableEndWallMs > 0
            ? Math.min(4.5, Math.max(0, (now - lastSeekableEndWallMs) / 1000))
            : 0;
        cleanPsLag = rawPsLagUninterpolated + segElapsedSec;
        if (
          Number.isFinite(ps.seekableStart) &&
          ps.seekableStart > 60 &&
          ps.seekableEnd - ps.seekableStart >= 1800
        ) {
          slidingDvrCapSec = ps.seekableEnd - ps.seekableStart;
        }
        if (
          !isPaused ||
          lastCleanPsLagSec === null ||
          Math.abs(cleanPsLag - lastCleanPsLagSec) > 2
        ) {
          lastCleanPsLagSec = cleanPsLag;
          lastCleanPsLagAt = now;
        }
        if (liveAnchorWallMs === 0 && playheadSec !== null) {
          liveAnchorVideoSec = playheadSec + cleanPsLag;
          liveAnchorWallMs = now;
        }
      }
    }

    const canTrustHeadSignal =
      !isPaused &&
      now >= recentBackwardSeekUntil &&
      !pendingSeekActive &&
      (now < explicitJumpToLiveUntil ||
        forwardSeekedNearHead ||
        preAnchorLagSec === null ||
        preAnchorLagSec <= 12 ||
        (seekableEndAdvanceCount >= 2 && cleanPsLag !== null && cleanPsLag <= 10));

    const hasContradictingLag =
      (cleanPsLag !== null && cleanPsLag > 11) ||
      (uiNegSec !== null && uiNegSec > 11) ||
      (preAnchorLagSec !== null && preAnchorLagSec > 12);

    // Note: while cursor is on Cadence toolbar below #movie_player, .ytp-autohide prevents
    // YouTube from updating .ytp-live-badge DOM attributes after programmatic seeks. Never let
    // a stale badgeAtHead override ps.isAtLiveHead === false or a measured DVR lag.
    const headSignalActive =
      now < explicitJumpToLiveUntil
        ? badgeAtHead || psIsAtHead === true || (cleanPsLag !== null && cleanPsLag <= 10)
        : psIsAtHead === true || (psIsAtHead === null && badgeAtHead);

    const confirmedAtHead =
      canTrustHeadSignal &&
      (now < explicitJumpToLiveUntil || !hasContradictingLag) &&
      headSignalActive;

    if (confirmedAtHead) {
      if (playheadSec !== null) {
        liveAnchorVideoSec = playheadSec;
        liveAnchorWallMs = now;
      }
      if (
        ps &&
        Number.isFinite(ps.seekableEnd) &&
        Number.isFinite(ps.current) &&
        ps.seekableEnd - ps.current > 45
      ) {
        psHasMseCeiling = true;
      }
      lastCleanPsLagSec = 0;
      lastCleanPsLagAt = now;
      lastUiNegativeLagSec = 0;
      lastUiNegativeLagAt = now;
      catchupMaxLagSec = null;
      catchupActive = false;
      lastCatchupVideoSec = null;
      liveHeadHysteresisBehind = false;
      dvrRestoreAttempts = 0;
      return {
        isAtLiveHead: true,
        dvrLagSec: 0,
        isPaused: false,
        isDvrSupported: dvrSupported,
      };
    }

    if (uiNegSec !== null) {
      if (
        !isPaused ||
        lastUiNegativeLagSec === null ||
        Math.abs(uiNegSec - lastUiNegativeLagSec) > 2
      ) {
        lastUiNegativeLagSec = uiNegSec;
        lastUiNegativeLagAt = now;
      }
      if (liveAnchorWallMs === 0 && playheadSec !== null) {
        liveAnchorVideoSec = playheadSec + uiNegSec;
        liveAnchorWallMs = now;
      }
    }

    const psManifestRefreshed =
      !isPaused &&
      cleanPsLag !== null &&
      (resumedAtWallMs === 0 || seekableEndAdvanceCount >= 2 || pendingSeekActive);

    let anchorLagSec = null;
    if (liveAnchorWallMs > 0 && liveAnchorVideoSec !== null && playheadSec !== null) {
      let expectedLiveVideoSec =
        liveAnchorVideoSec + Math.max(0, (now - liveAnchorWallMs) / 1000);
      if (playheadSec > expectedLiveVideoSec + 1.5) {
        liveAnchorVideoSec = playheadSec;
        liveAnchorWallMs = now;
        expectedLiveVideoSec = playheadSec;
      } else if (
        psManifestRefreshed &&
        Math.abs(expectedLiveVideoSec - playheadSec - cleanPsLag) > 5
      ) {
        liveAnchorVideoSec = playheadSec + cleanPsLag;
        liveAnchorWallMs = now;
        expectedLiveVideoSec = liveAnchorVideoSec;
      } else if (
        !isPaused &&
        cleanPsLag !== null &&
        cleanPsLag > expectedLiveVideoSec - playheadSec + 5
      ) {
        liveAnchorVideoSec = playheadSec + cleanPsLag;
        liveAnchorWallMs = now;
        expectedLiveVideoSec = liveAnchorVideoSec;
      } else if (
        slidingDvrCapSec !== null &&
        expectedLiveVideoSec - playheadSec > slidingDvrCapSec
      ) {
        expectedLiveVideoSec = playheadSec + slidingDvrCapSec;
        liveAnchorVideoSec = expectedLiveVideoSec;
        liveAnchorWallMs = now;
      }
      anchorLagSec = Math.max(0, expectedLiveVideoSec - playheadSec);
    }

    let verifiedLagSec = null;
    if (psManifestRefreshed) {
      verifiedLagSec = cleanPsLag;
    } else if (
      !isPaused &&
      cleanPsLag !== null &&
      (anchorLagSec === null || cleanPsLag >= anchorLagSec - 4)
    ) {
      verifiedLagSec = cleanPsLag;
    } else if (anchorLagSec !== null) {
      verifiedLagSec = anchorLagSec;
    } else if (lastCleanPsLagSec !== null && lastCleanPsLagAt > 0) {
      verifiedLagSec =
        lastCleanPsLagSec + (isPaused ? Math.max(0, (now - lastCleanPsLagAt) / 1000) : 0);
    } else if (lastUiNegativeLagSec !== null && lastUiNegativeLagAt > 0) {
      verifiedLagSec =
        lastUiNegativeLagSec + (isPaused ? Math.max(0, (now - lastUiNegativeLagAt) / 1000) : 0);
    } else if (
      video &&
      !Number.isFinite(video.duration) &&
      rawMediaTimeSec !== null &&
      video.seekable &&
      video.seekable.length > 0
    ) {
      try {
        const hlsEnd = video.seekable.end(video.seekable.length - 1);
        if (Number.isFinite(hlsEnd) && hlsEnd >= rawMediaTimeSec) {
          verifiedLagSec = Math.max(0, hlsEnd - rawMediaTimeSec);
          if (liveAnchorWallMs === 0 && playheadSec !== null) {
            liveAnchorVideoSec = playheadSec + verifiedLagSec;
            liveAnchorWallMs = now;
          }
        }
      } catch (_) {}
    }

    if (verifiedLagSec === null) {
      if (isPaused && pausedAtWallMs > 0) {
        const pausedDrift = Math.max(0, (now - pausedAtWallMs) / 1000);
        if (playheadSec !== null && liveAnchorWallMs === 0) {
          liveAnchorVideoSec = playheadSec + pausedDrift;
          liveAnchorWallMs = now;
        }
        verifiedLagSec = pausedDrift;
      } else {
        catchupMaxLagSec = null;
        catchupActive = false;
        lastCatchupVideoSec = null;
        liveHeadHysteresisBehind = false;
        return {
          isAtLiveHead: true,
          dvrLagSec: 0,
          isPaused,
          isDvrSupported: dvrSupported,
        };
      }
    }

    const activeMediaRate = isApplyingProgrammatically
      ? lastAppliedSpeed
      : video
        ? Number(video.playbackRate) || 1.0
        : 1.0;

    if (!isPaused && activeMediaRate > 1.01) {
      const largeBackwardJump =
        backwardSeeked ||
        (lastCatchupVideoSec !== null &&
          playheadSec !== null &&
          playheadSec < lastCatchupVideoSec - 1.25) ||
        (catchupMaxLagSec !== null && verifiedLagSec - catchupMaxLagSec > 18);

      catchupActive = true;
      if (catchupMaxLagSec === null || largeBackwardJump) {
        catchupMaxLagSec = verifiedLagSec;
      } else if (verifiedLagSec > catchupMaxLagSec) {
        verifiedLagSec = catchupMaxLagSec;
      } else {
        catchupMaxLagSec = verifiedLagSec;
      }
      if (playheadSec !== null) {
        lastCatchupVideoSec = playheadSec;
      }
    } else {
      catchupMaxLagSec = null;
      catchupActive = false;
      lastCatchupVideoSec = playheadSec;
    }

    const wasBehindBeforeTick = liveHeadHysteresisBehind;
    const rawNearHead =
      !isPaused &&
      catchupActive &&
      rawPsLagUninterpolated !== null &&
      rawPsLagUninterpolated <= 8.5;
    const pinnedAtLiveBufferCeiling =
      !isPaused &&
      catchupActive &&
      maxBufferedEnd !== null &&
      rawMediaTimeSec !== null &&
      maxBufferedEnd - rawMediaTimeSec <= 0.65 &&
      verifiedLagSec <= 14;

    if (liveHeadHysteresisBehind) {
      if (
        now >= recentBackwardSeekUntil &&
        !pendingSeekActive &&
        ((!isPaused &&
          catchupActive &&
          (verifiedLagSec <= 8.5 || rawNearHead || pinnedAtLiveBufferCeiling)) ||
          verifiedLagSec <= 2.5)
      ) {
        liveHeadHysteresisBehind = false;
      }
    } else {
      if (
        now < recentBackwardSeekUntil ||
        verifiedLagSec >= 6 ||
        (isPaused && verifiedLagSec >= 4)
      ) {
        liveHeadHysteresisBehind = true;
      }
    }

    if (wasBehindBeforeTick && !liveHeadHysteresisBehind && !isPaused) {
      syncNativeLiveBadgeOnCatchup(player, video);
      return {
        isAtLiveHead: true,
        dvrLagSec: 0,
        isPaused: false,
        isDvrSupported: dvrSupported,
      };
    }

    return {
      isAtLiveHead: !liveHeadHysteresisBehind,
      dvrLagSec: Math.round(verifiedLagSec),
      isPaused,
      isDvrSupported: dvrSupported,
    };
  }

  function maybeRestoreDvrCatchupSpeed() {
    if (!isSupportedWatchPage() || !config.enabled || isApplyingProgrammatically) return;
    const now = Date.now();
    if (now - lastDvrRestoreAt < 350 || dvrRestoreAttempts >= 5) return;

    const player = getMoviePlayer();
    const video = getMainVideo();
    if (!video || video.paused || isAdPlaying(player)) return;
    if (!isLiveBroadcast(player, video)) return;

    const target = Number(config.targetSpeed) || 1.0;
    if (Math.abs(target - 1.0) <= 0.02) return;

    const dvr = measureLiveDvrState(player, video, getCurrentVideoId(player));
    let playerRateMismatch = false;
    try {
      if (target <= 2.0 && player && typeof player.getPlaybackRate === 'function') {
        const pr = Number(player.getPlaybackRate());
        const avail =
          typeof player.getAvailablePlaybackRates === 'function'
            ? player.getAvailablePlaybackRates()
            : null;
        if (
          Number.isFinite(pr) &&
          Array.isArray(avail) &&
          avail.some((r) => Number(r) > 1.05) &&
          Math.abs(pr - target) > 0.2
        ) {
          playerRateMismatch = true;
        }
      }
    } catch (_) {}

    if (!dvr.isAtLiveHead && (Math.abs(video.playbackRate - target) > 0.03 || playerRateMismatch)) {
      lastDvrRestoreAt = now;
      dvrRestoreAttempts += 1;
      applyPlaybackSpeed(target, false, true);
    }
  }

  function formatExactMinutesSecondsBridge(rawSec) {
    const safeSec = Math.max(0, Math.round(Number(rawSec) || 0));
    if (safeSec < 60) {
      return safeSec + 's';
    }
    const mins = Math.floor(safeSec / 60);
    const secs = safeSec % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return remMins > 0 ? hrs + 'h ' + remMins + 'm' : hrs + 'h';
    }
    return secs > 0 ? mins + 'm ' + String(secs).padStart(2, '0') + 's' : mins + 'm';
  }

  function formatDisplaySpeedBridge(speed) {
    const num = Number(speed);
    if (!Number.isFinite(num)) return '1.0';
    return Number.isInteger(num) ? num.toFixed(1) : parseFloat(num.toFixed(2)).toString();
  }

  function computeBridgeSavedTimeModel(player, video, rate, rawDurationSec, rawRemainingSec) {
    if (
      isAdPlaying(player) ||
      isLiveBroadcast(player, video) ||
      rawDurationSec === null ||
      !Number.isFinite(rawDurationSec) ||
      rawDurationSec < 5
    ) {
      return { visible: false, tone: 'neutral', text: '', title: '' };
    }

    if (rate < 0.99) {
      const realTotalSec = Math.round(rawDurationSec / rate);
      const diffSec = realTotalSec - rawDurationSec;
      return {
        visible: true,
        tone: 'slower',
        text: '+' + formatExactMinutesSecondsBridge(diffSec),
        title:
          'Adds ' +
          formatExactMinutesSecondsBridge(diffSec) +
          ' to total video duration at ' +
          formatDisplaySpeedBridge(rate) +
          '×',
      };
    }

    const banked = Math.max(0, Math.floor(currentVideoTimeSavedSec));
    const rawRem =
      typeof rawRemainingSec === 'number' && Number.isFinite(rawRemainingSec)
        ? rawRemainingSec
        : Math.max(0, rawDurationSec - (video ? video.currentTime : 0));
    const remainingProjected =
      rate > 1.005 ? Math.round((rawRem * (rate - 1.0)) / rate) : 0;
    const totalSaved = Math.round(banked + remainingProjected);

    if (totalSaved < 3) {
      return {
        visible: true,
        tone: 'neutral',
        text: '0s saved',
        title: 'Increase playback speed to unlock Cadence time savings',
      };
    }

    return {
      visible: true,
      tone: 'saved',
      text: 'Saves ' + formatExactMinutesSecondsBridge(totalSaved),
      title:
        'Total potential wall-clock time saved based on previous playback acceleration and potential savings at current playback setting',
    };
  }

  function emitTimeRemaining(force = false) {
    if (!isSupportedWatchPage()) return;
    if (!force && document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (!force && now - lastRemainingEmitAt < 950) return;

    const player = getMoviePlayer();
    const video = getMainVideo();
    if (!video) return;

    const videoId = getCurrentVideoId(player) || '';
    if (videoId) {
      ensurePerVideoSavedTimeBoundary(videoId);
    }
    const adActive = isAdPlaying(player);
    if (adActive) {
      const adSig = videoId + '|ad';
      if (!force && adSig === lastRemainingSignature) return;
      lastRemainingEmitAt = now;
      lastRemainingSignature = adSig;
      postToContent('TIME_REMAINING_UPDATE', {
        videoId,
        rawRemainingSec: null,
        rawDurationSec: null,
        bankedSavedSec: Math.floor(currentVideoTimeSavedSec),
        savedTimeModel: { visible: false, tone: 'neutral', text: '', title: '' },
        playbackRate: 1.0,
        isAd: true,
        isLive: false,
        isAtLiveHead: false,
        isDvrSupported: true,
        dvrLagSec: null,
        isPaused: Boolean(video.paused),
        hidden: true,
      });
      return;
    }

    let playerRate = null;
    try {
      if (player && typeof player.getPlaybackRate === 'function') {
        const pr = Number(player.getPlaybackRate());
        if (Number.isFinite(pr) && pr > 0) playerRate = pr;
      }
    } catch (_) {}
    const mediaRate = Math.max(0.25, Number(video.playbackRate) || 1.0);

    if (isLiveBroadcast(player, video)) {
      const dvr = measureLiveDvrState(player, video, videoId);
      let liveRate = 1.0;
      if (dvr.isAtLiveHead) {
        if ((!wasAtLiveHead || mediaRate > 1.01 || (playerRate !== null && playerRate > 1.01)) && config.enabled) {
          if (mediaRate > 1.01 || (playerRate !== null && playerRate > 1.01)) {
            applyLiveHeadRateClamp(player, video);
          }
        }
        if (dvr.isDvrSupported === false && nonDvrSubOneRuleClamped && mediaRate < 0.99 && config.enabled) {
          applyLiveHeadRateClamp(player, video, true);
          liveRate = 1.0;
        } else {
          liveRate = mediaRate < 0.99 ? mediaRate : 1.0;
        }
      } else {
        if (dvr.isPaused) {
          liveRate = config.enabled
            ? Number(config.targetSpeed) || playerRate || mediaRate
            : playerRate || mediaRate;
        } else if (isApplyingProgrammatically) {
          liveRate = lastAppliedSpeed;
        } else if (Math.abs(mediaRate - 1.0) > 0.02) {
          liveRate = mediaRate;
        } else if (playerRate !== null && Math.abs(playerRate - 1.0) > 0.02) {
          liveRate = playerRate;
        } else {
          liveRate = mediaRate;
        }
      }
      wasAtLiveHead = dvr.isAtLiveHead;

      const lagBucket = dvr.isAtLiveHead
        ? '0'
        : dvr.dvrLagSec < 60
          ? 's' + dvr.dvrLagSec
          : 'm' + Math.round(dvr.dvrLagSec / 60);
      const catchUpSec =
        !dvr.isAtLiveHead && liveRate > 1.02
          ? Math.max(1, Math.round(dvr.dvrLagSec / (liveRate - 1.0)))
          : 0;
      const catchUpBucket =
        catchUpSec === 0
          ? '0'
          : catchUpSec < 60
            ? 's' + catchUpSec
            : 'm' + Math.round(catchUpSec / 60);

      const liveSig = [
        videoId,
        'live',
        dvr.isAtLiveHead ? 'head' : 'behind',
        dvr.isDvrSupported === false ? 'nodvr' : 'dvr',
        lagBucket,
        catchUpBucket,
        dvr.isPaused ? 'p' : 'r',
        liveRate.toFixed(2),
      ].join('|');

      if (!force && liveSig === lastRemainingSignature) return;
      lastRemainingEmitAt = now;
      lastRemainingSignature = liveSig;

      postToContent('TIME_REMAINING_UPDATE', {
        videoId,
        rawRemainingSec: null,
        rawDurationSec: null,
        bankedSavedSec: 0,
        savedTimeModel: { visible: false, tone: 'neutral', text: '', title: '' },
        playbackRate: Math.round(liveRate * 100) / 100,
        isAd: false,
        isLive: true,
        isAtLiveHead: dvr.isAtLiveHead,
        isDvrSupported: dvr.isDvrSupported !== false,
        dvrLagSec: dvr.dvrLagSec,
        isPaused: dvr.isPaused,
        hidden: false,
      });
      return;
    }

    wasAtLiveHead = false;
    const rate = mediaRate;
    const effectiveVodDur = resolveEffectiveVodDurationSec(player, video);
    const invalidDuration = effectiveVodDur === null || !Number.isFinite(effectiveVodDur) || effectiveVodDur <= 0;
    const rawDurationSec = invalidDuration ? null : effectiveVodDur;
    let vodCurSec = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const vodStreamCurSec = readPlayerStreamTimeSec(player);
    if (vodStreamCurSec !== null && vodStreamCurSec > vodCurSec) {
      vodCurSec = vodStreamCurSec;
    }
    const isHeldCurrentVideo = Boolean(videoId && heldAtEndVideoId === videoId);
    const rawRemainingSec = invalidDuration
      ? null
      : isHeldCurrentVideo
        ? 0
        : Math.max(0, rawDurationSec - vodCurSec);
    const realRemSec = rawRemainingSec === null ? null : Math.max(0, Math.round(rawRemainingSec / rate));
    const realBucket =
      realRemSec === null
        ? 'na'
        : realRemSec < 60
          ? 's' + realRemSec
          : 'm' + Math.round(realRemSec / 60);
    const durBucket = rawDurationSec === null ? 'na' : String(Math.round(rawDurationSec));
    const savedTimeModel = computeBridgeSavedTimeModel(
      player,
      video,
      rate,
      rawDurationSec,
      rawRemainingSec
    );
    const sig = [
      videoId,
      'vod',
      isHeldCurrentVideo ? 'held' : 'open',
      realBucket,
      durBucket,
      rate.toFixed(2),
      savedTimeModel.visible ? savedTimeModel.text : 'hidden',
    ].join('|');

    if (!force && sig === lastRemainingSignature) return;
    lastRemainingEmitAt = now;
    lastRemainingSignature = sig;

    postToContent('TIME_REMAINING_UPDATE', {
      videoId,
      rawRemainingSec,
      rawDurationSec,
      bankedSavedSec: Math.floor(currentVideoTimeSavedSec),
      savedTimeModel,
      playbackRate: Math.round(rate * 100) / 100,
      isAd: false,
      isLive: false,
      isAtLiveHead: false,
      dvrLagSec: null,
      isPaused: Boolean(video.paused),
      hidden: invalidDuration,
    });
  }

  function extractChannelMetadata() {
    if (!isSupportedWatchPage()) {
      return null;
    }
    const player = getMoviePlayer();
    const adActive = isAdPlaying(player);
    const urlVideoId = getUrlVideoId();
    let videoId = urlVideoId;
    let channelId = '';
    let channelName = '';
    let handle = '';
    let title = '';

    try {
      if (player && typeof player.getPlayerResponse === 'function') {
        const resp = player.getPlayerResponse();
        const details = resp && resp.videoDetails;
        if (details && details.videoId && (!urlVideoId || details.videoId === urlVideoId)) {
          videoId = details.videoId;
          channelId = details.channelId || '';
          channelName = details.author || '';
          title = details.title || '';
        }
      }
      if ((!channelName || !videoId) && player && typeof player.getVideoData === 'function') {
        const vd = player.getVideoData();
        if (vd && vd.video_id && (!urlVideoId || vd.video_id === urlVideoId)) {
          videoId = vd.video_id;
          channelName = channelName || vd.author || '';
          title = title || vd.title || '';
        }
      }
    } catch (_) {}

    const flexy = document.querySelector('ytd-watch-flexy');
    const flexyVideoId = flexy ? flexy.getAttribute('video-id') || '' : '';
    const domMatchesUrlVideo = !urlVideoId || (flexyVideoId && flexyVideoId === urlVideoId);

    if (domMatchesUrlVideo) {
      if (!videoId && flexyVideoId) {
        videoId = flexyVideoId;
      }

      const ownerLink =
        document.querySelector('ytd-watch-flexy ytd-watch-metadata #owner ytd-channel-name a[href]') ||
        document.querySelector('ytd-watch-flexy ytd-video-owner-renderer ytd-channel-name a[href]') ||
        document.querySelector('ytd-watch-metadata #owner ytd-channel-name a[href]');

      if (ownerLink) {
        const href = ownerLink.getAttribute('href') || '';
        const handleMatch = href.match(/\\/(@[^/?#]+)/);
        if (handleMatch) handle = handleMatch[1].toLowerCase();
        const chMatch = href.match(/\\/channel\\/(UC[^/?#]+)/);
        if (chMatch && !channelId) channelId = chMatch[1];
        const domText = (ownerLink.textContent || '').trim();
        if (domText && !adActive) channelName = domText;
      }

      if (!channelId && flexy) {
        const metaCh = flexy.querySelector('meta[itemprop="channelId"]');
        if (metaCh) channelId = metaCh.getAttribute('content') || '';
      }

      if (!channelName && flexy) {
        const authorLink = flexy.querySelector('span[itemprop="author"] link[itemprop="name"]');
        if (authorLink) channelName = authorLink.getAttribute('content') || '';
      }
    }

    let isPreview = false;
    if (
      videoId &&
      !channelName &&
      !channelId &&
      !handle &&
      pendingCardHint &&
      pendingCardHint.videoId === videoId &&
      pendingCardHint.expiresAt > Date.now() &&
      (pendingCardHint.channelName || pendingCardHint.handle || pendingCardHint.channelId)
    ) {
      channelId = pendingCardHint.channelId || '';
      handle = pendingCardHint.handle || '';
      channelName = pendingCardHint.channelName || pendingCardHint.handle || '';
      isPreview = true;
    }

    if (!videoId || (!channelName && !channelId && !handle)) {
      return null;
    }

    const video = getMainVideo();
    return {
      videoId,
      channelId,
      channelName: channelName || handle,
      handle,
      title,
      isAd: adActive,
      isPreview,
      currentRate: video ? Number(video.playbackRate.toFixed(2)) : 1.0,
      hasPlaylist: new URLSearchParams(location.search).has('list'),
      listId: new URLSearchParams(location.search).get('list') || '',
    };
  }

  function applyPlaybackSpeed(speed, forceResetOnBrowse = false, fromDvrRestore = false) {
    let numericSpeed = Math.min(4.0, Math.max(0.25, Math.round(Number(speed) * 100) / 100 || 1.0));
    const player = getMoviePlayer();
    const video = getMainVideo();
    if (!forceResetOnBrowse && isAdPlaying(player)) return;

    const liveActive = !forceResetOnBrowse && Boolean(video && isLiveBroadcast(player, video));
    let liveDvrState = null;
    if (liveActive) {
      liveDvrState = measureLiveDvrState(player, video, getCurrentVideoId(player));
      if (liveDvrState.isAtLiveHead && numericSpeed > 1.01) {
        numericSpeed = 1.0;
      }
      if (
        liveDvrState.isDvrSupported === false &&
        numericSpeed < 0.99 &&
        nonDvrSubOneRuleClamped
      ) {
        numericSpeed = 1.0;
      }
      if (liveDvrState.isDvrSupported === false) {
        if (numericSpeed < 0.99) {
          if (nonDvrSlowActiveSince === 0) {
            nonDvrSlowActiveSince = Date.now();
          }
          lastNonDvrSlowMediaTime =
            video && Number.isFinite(video.currentTime) ? video.currentTime : null;
          lastNonDvrSlowStreamTime = readPlayerStreamTimeSec(player);
          lastNonDvrSlowWallMs = Date.now();
        } else {
          nonDvrSlowActiveSince = 0;
          lastNonDvrSlowMediaTime = null;
          lastNonDvrSlowStreamTime = null;
          lastNonDvrSlowWallMs = 0;
        }
      }
    }

    if (!fromDvrRestore) {
      dvrRestoreAttempts = 0;
    }

    isApplyingProgrammatically = true;
    clearTimeout(programmaticTimer);
    clearTimeout(postSpeedVerifyTimer);
    lastAppliedSpeed = numericSpeed;

    try {
      if (player && typeof player.setPlaybackRate === 'function') {
        const avail =
          typeof player.getAvailablePlaybackRates === 'function'
            ? player.getAvailablePlaybackRates()
            : null;
        if (Array.isArray(avail) && avail.length > 0) {
          const exactAvail = avail.find((r) => Math.abs(Number(r) - numericSpeed) < 0.01);
          if (exactAvail !== undefined) {
            player.setPlaybackRate(Number(exactAvail));
          } else if (liveActive) {
            const closestAvail = avail.reduce((best, curr) =>
              Math.abs(Number(curr) - numericSpeed) < Math.abs(Number(best) - numericSpeed)
                ? curr
                : best
            );
            if (!(numericSpeed < 0.99 && Number(closestAvail) >= 0.99)) {
              player.setPlaybackRate(Number(closestAvail));
            }
          }
        } else if (
          numericSpeed >= 0.25 &&
          numericSpeed <= 2.0 &&
          Math.abs(Math.round(numericSpeed * 4) - numericSpeed * 4) < 0.001
        ) {
          if (
            !(liveActive && liveDvrState && liveDvrState.isDvrSupported === false && numericSpeed < 0.99)
          ) {
            player.setPlaybackRate(numericSpeed);
          }
        }
      }
    } catch (_) {}

    if (video && Math.abs(video.playbackRate - numericSpeed) > 0.008) {
      video.playbackRate = numericSpeed;
    }

    if (!forceResetOnBrowse) {
      emitTimeRemaining(true);
      postSpeedVerifyTimer = setTimeout(() => {
        const vNow = getMainVideo();
        const pNow = getMoviePlayer();
        if (vNow && !isAdPlaying(pNow)) {
          const nowLive = isLiveBroadcast(pNow, vNow);
          const nowDvr = nowLive ? measureLiveDvrState(pNow, vNow, getCurrentVideoId(pNow)) : null;
          const allowLiveRateEnforce =
            !nowLive ||
            (nowDvr && !nowDvr.isAtLiveHead) ||
            (numericSpeed < 0.99 && !nonDvrSubOneRuleClamped);
          if (allowLiveRateEnforce && !vNow.paused) {
            if (Math.abs(vNow.playbackRate - numericSpeed) > 0.025) {
              vNow.playbackRate = numericSpeed;
            }
          }
          emitTimeRemaining(true);
        }
      }, 90);
    }

    programmaticTimer = setTimeout(() => {
      isApplyingProgrammatically = false;
    }, 350);
  }

  function stopFastDetectionBurst() {
    if (fastBurstInterval) {
      clearInterval(fastBurstInterval);
      fastBurstInterval = null;
    }
  }

  function handleNonWatchRoute() {
    stopFastDetectionBurst();
    heldAtEndVideoId = null;
    window.__CADENCE_HELD_VIDEO_ID__ = null;
    lastRemainingEmitAt = 0;
    lastRemainingSignature = '';
    wasAdPlaying = false;
    resetLiveTrackingState('');
    const defaultSpd = Number(config.defaultSpeed) || 1.0;
    config.targetSpeed = defaultSpd;
    window.__CADENCE_LAST_CONFIG__ = config;
    applyPlaybackSpeed(defaultSpd, true);

    if (wasOnWatchPage || lastDetectedKey !== '' || lockedVideoId !== '') {
      wasOnWatchPage = false;
      lastDetectedKey = '';
      lockedVideoId = '';
      postToContent('LEFT_WATCH_PAGE', { pathname: location.pathname });
    }
  }

  function startFastDetectionBurst() {
    stopFastDetectionBurst();
    let ticks = 0;
    fastBurstInterval = setInterval(() => {
      ticks += 1;
      if (!isSupportedWatchPage()) {
        if (ticks >= 8) {
          handleNonWatchRoute();
        }
        return;
      }
      broadcastChannelMetadata(false);
      const urlVid = getUrlVideoId();
      if ((urlVid && lockedVideoId === urlVid) || ticks >= 65) {
        stopFastDetectionBurst();
      }
    }, 40);
  }

  function resolveEffectiveVodDurationSec(player, video) {
    if (!video || isLiveBroadcast(player, video)) return null;
    if (!Number.isFinite(video.duration) || video.duration === Infinity) return null;
    const candidates = [];
    if (Number.isFinite(video.duration) && video.duration > 0) {
      candidates.push(video.duration);
    }
    try {
      if (player && typeof player.getDuration === 'function') {
        const pDur = Number(player.getDuration());
        if (Number.isFinite(pDur) && pDur > 0) {
          candidates.push(pDur);
        }
      }
    } catch (_) {}
    try {
      if (player && typeof player.getProgressState === 'function') {
        const ps = player.getProgressState();
        if (ps && Number.isFinite(ps.duration) && ps.duration > 0) {
          candidates.push(ps.duration);
        }
      }
    } catch (_) {}
    if (candidates.length === 0) return null;
    return Math.min(...candidates);
  }

  const watchLaterStatusByVideo = new Map();
  const removedWatchLaterVideoIds = new Set();
  let watchLaterInFlightVideoId = '';

  function isWatchLaterRouteOrPanel() {
    try {
      if (new URLSearchParams(location.search).get('list') === 'WL') {
        return true;
      }
      const panel = document.querySelector(
        'ytd-watch-flexy ytd-playlist-panel-renderer:not([hidden]), ytd-playlist-panel-renderer#playlist:not([hidden])'
      );
      if (panel && panel.offsetParent !== null) {
        const wlLink = panel.querySelector('a[href*="list=WL"]');
        if (wlLink) return true;
      }
    } catch (_) {}
    return false;
  }

  function readCookieValue(name) {
    try {
      const target = name + '=';
      const parts = document.cookie ? document.cookie.split(';') : [];
      for (let i = 0; i < parts.length; i++) {
        const trimmed = parts[i].trim();
        if (trimmed.startsWith(target)) {
          return decodeURIComponent(trimmed.slice(target.length));
        }
      }
    } catch (_) {}
    return '';
  }

  function getYtcfgValue(key) {
    try {
      const cfg = window.ytcfg;
      if (!cfg) return undefined;
      if (typeof cfg.get === 'function') {
        return cfg.get(key);
      }
      if (cfg.data_ && typeof cfg.data_ === 'object') {
        return cfg.data_[key];
      }
    } catch (_) {}
    return undefined;
  }

  async function sha1Hex(input) {
    if (!window.crypto || !window.crypto.subtle) return '';
    const encoded = new TextEncoder().encode(input);
    const digest = await window.crypto.subtle.digest('SHA-1', encoded);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  async function buildYouTubeSessionRequestMeta() {
    const loggedIn = getYtcfgValue('LOGGED_IN');
    if (loggedIn === false) {
      return null;
    }
    const primarySid =
      readCookieValue('SAPISID') ||
      readCookieValue('__Secure-3PAPISID') ||
      readCookieValue('__Secure-1PAPISID');
    if (!primarySid) {
      return null;
    }
    const origin = location.origin || 'https://www.youtube.com';
    const ts = Math.floor(Date.now() / 1000);
    const hash = await sha1Hex(ts + ' ' + primarySid + ' ' + origin);
    if (!hash) {
      return null;
    }

    const apiKey = getYtcfgValue('INNERTUBE_API_KEY') || '';
    const context = getYtcfgValue('INNERTUBE_CONTEXT');
    if (!context || typeof context !== 'object') {
      return null;
    }
    const sessionIndex = getYtcfgValue('SESSION_INDEX');
    const visitorData = getYtcfgValue('VISITOR_DATA');
    const delegatedSessionId = getYtcfgValue('DELEGATED_SESSION_ID');

    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'SAPISIDHASH ' + ts + '_' + hash,
      'X-Origin': origin,
      'X-Goog-AuthUser': sessionIndex !== undefined && sessionIndex !== null ? String(sessionIndex) : '0',
    };
    if (visitorData) {
      headers['X-Goog-Visitor-Id'] = String(visitorData);
    }
    if (delegatedSessionId) {
      headers['X-Goog-PageId'] = String(delegatedSessionId);
    }

    return { apiKey, context, headers };
  }

  function findWatchLaterOptionState(rootObj) {
    if (!rootObj || typeof rootObj !== 'object') return null;
    const queue = [rootObj];
    const visited = new WeakSet();
    let inspected = 0;

    while (queue.length > 0 && inspected < 2500) {
      const cur = queue.shift();
      if (!cur || typeof cur !== 'object' || visited.has(cur)) continue;
      visited.add(cur);
      inspected += 1;

      if (
        !Array.isArray(cur) &&
        (cur.playlistId === 'WL' || cur.listId === 'WL') &&
        (typeof cur.containsSelectedVideos === 'string' ||
          typeof cur.toggled === 'boolean' ||
          typeof cur.selected === 'boolean' ||
          typeof cur.isSelected === 'boolean')
      ) {
        return Boolean(
          cur.containsSelectedVideos === 'ALL' ||
            cur.containsSelectedVideos === 'SOME' ||
            cur.toggled === true ||
            cur.selected === true ||
            cur.isSelected === true
        );
      }

      if (Array.isArray(cur)) {
        for (let i = 0; i < cur.length; i++) {
          if (cur[i] && typeof cur[i] === 'object') {
            queue.push(cur[i]);
          }
        }
      } else {
        const keys = Object.keys(cur);
        for (let i = 0; i < keys.length; i++) {
          const val = cur[keys[i]];
          if (val && typeof val === 'object') {
            queue.push(val);
          }
        }
      }
    }
    return null;
  }

  async function checkWatchLaterMembershipOnEnd(videoId) {
    if (!videoId || videoId === 'active' || config.showWatchLaterRemoveAction === false) {
      return;
    }
    if (removedWatchLaterVideoIds.has(videoId)) {
      postToContent('WATCH_LATER_STATUS', {
        videoId,
        inWatchLater: false,
        removed: true,
        error: false,
      });
      return;
    }
    if (isWatchLaterRouteOrPanel()) {
      watchLaterStatusByVideo.set(videoId, { inWatchLater: true, removed: false });
      postToContent('WATCH_LATER_STATUS', {
        videoId,
        inWatchLater: true,
        removed: false,
        error: false,
      });
      return;
    }
    const cached = watchLaterStatusByVideo.get(videoId);
    if (cached) {
      postToContent('WATCH_LATER_STATUS', {
        videoId,
        inWatchLater: Boolean(cached.inWatchLater),
        removed: Boolean(cached.removed),
        error: false,
      });
      return;
    }
    if (watchLaterInFlightVideoId === videoId) return;
    watchLaterInFlightVideoId = videoId;

    try {
      const reqMeta = await buildYouTubeSessionRequestMeta();
      if (!reqMeta) {
        return;
      }
      const endpoint =
        '/youtubei/v1/playlist/get_add_to_playlist' +
        (reqMeta.apiKey ? '?key=' + encodeURIComponent(reqMeta.apiKey) + '&prettyPrint=false' : '?prettyPrint=false');

      const resp = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: reqMeta.headers,
        body: JSON.stringify({
          context: reqMeta.context,
          videoIds: [videoId],
        }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      const optionState = findWatchLaterOptionState(data);
      const inWatchLater = optionState === true;
      watchLaterStatusByVideo.set(videoId, { inWatchLater, removed: false });

      if (getCurrentVideoId(getMoviePlayer()) === videoId && heldAtEndVideoId === videoId) {
        postToContent('WATCH_LATER_STATUS', {
          videoId,
          inWatchLater,
          removed: false,
          error: false,
        });
      }
    } catch (_) {
    } finally {
      if (watchLaterInFlightVideoId === videoId) {
        watchLaterInFlightVideoId = '';
      }
    }
  }

  async function removeVideoFromWatchLater(videoId) {
    const targetId = videoId || getCurrentVideoId(getMoviePlayer()) || '';
    if (!targetId || targetId === 'active') {
      postToContent('WATCH_LATER_STATUS', {
        videoId: targetId,
        inWatchLater: true,
        removed: false,
        error: true,
      });
      return;
    }

    try {
      const reqMeta = await buildYouTubeSessionRequestMeta();
      if (!reqMeta) {
        postToContent('WATCH_LATER_STATUS', {
          videoId: targetId,
          inWatchLater: true,
          removed: false,
          error: true,
        });
        return;
      }
      const endpoint =
        '/youtubei/v1/browse/edit_playlist' +
        (reqMeta.apiKey ? '?key=' + encodeURIComponent(reqMeta.apiKey) + '&prettyPrint=false' : '?prettyPrint=false');

      const resp = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: reqMeta.headers,
        body: JSON.stringify({
          context: reqMeta.context,
          playlistId: 'WL',
          actions: [
            {
              action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID',
              removedVideoId: targetId,
            },
          ],
        }),
      });
      if (!resp.ok) {
        throw new Error('HTTP ' + resp.status);
      }
      const data = await resp.json().catch(() => ({}));
      if (data && data.status === 'STATUS_FAILED') {
        throw new Error('YouTube rejected playlist edit');
      }

      removedWatchLaterVideoIds.add(targetId);
      watchLaterStatusByVideo.set(targetId, { inWatchLater: false, removed: true });
      postToContent('WATCH_LATER_STATUS', {
        videoId: targetId,
        inWatchLater: false,
        removed: true,
        error: false,
      });
    } catch (_) {
      postToContent('WATCH_LATER_STATUS', {
        videoId: targetId,
        inWatchLater: true,
        removed: false,
        error: true,
      });
    }
  }

  function navigateToYouTubeHome() {
    markUserNavigationIntent();
    heldAtEndVideoId = null;
    window.__CADENCE_HELD_VIDEO_ID__ = null;
    const homeLogo = document.querySelector(
      'ytd-topbar-logo-renderer a#logo, a#logo[href="/"], ytd-masthead a[title="YouTube Home"]'
    );
    if (homeLogo instanceof HTMLElement) {
      try {
        homeLogo.click();
        setTimeout(() => {
          if (location.pathname !== '/') {
            location.assign('https://www.youtube.com/');
          }
        }, 180);
        return;
      } catch (_) {}
    }
    location.assign('https://www.youtube.com/');
  }

  function hasActivePlaylistContext() {
    if (new URLSearchParams(location.search).has('list')) return true;
    const playlistPanel = document.querySelector(
      'ytd-watch-flexy ytd-playlist-panel-renderer:not([hidden]), ytd-playlist-panel-renderer#playlist:not([hidden])'
    );
    return Boolean(playlistPanel && playlistPanel.offsetParent !== null);
  }

  function suppressNativeAutoplayAndPlaylist() {
    if (!config.enabled || !config.stopAfterVideoEnds) {
      restorePlaylistAutoAdvanceIfNeeded();
      return;
    }
    const player = getMoviePlayer();
    try {
      if (player && typeof player.setAutonavState === 'function') {
        player.setAutonavState(1);
      }
    } catch (_) {}

    const toggleBtn = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
    if (toggleBtn instanceof HTMLElement) {
      toggleBtn.click();
    }

    const cancelEndscreenBtn = document.querySelector('.ytp-autonav-endscreen-upnext-cancel-button');
    if (cancelEndscreenBtn instanceof HTMLElement && cancelEndscreenBtn.offsetParent !== null) {
      cancelEndscreenBtn.click();
    }

    const playlistManager = document.querySelector('yt-playlist-manager');
    if (playlistManager && Date.now() > userInitiatedNavUntil) {
      setPlaylistAutoAdvanceFlag(playlistManager, false);
      playlistSuppressedByCadence = true;
    }
  }

  function triggerEndOfVideoStop(player, video, seekNearEndTarget = null, forceBanner = false) {
    if (!config.enabled || !config.stopAfterVideoEnds || !isSupportedWatchPage()) return false;
    if (!video || isAdPlaying(player) || video.loop || isLiveBroadcast(player, video)) return false;
    if (!Number.isFinite(video.duration) || video.duration === Infinity) return false;
    if (Date.now() <= userInitiatedNavUntil || Date.now() <= replayGraceUntil) return false;

    const currentVideoId = getCurrentVideoId(player) || 'active';
    const alreadyHeld = heldAtEndVideoId === currentVideoId;
    heldAtEndVideoId = currentVideoId;
    window.__CADENCE_HELD_VIDEO_ID__ = currentVideoId;

    suppressNativeAutoplayAndPlaylist();

    try {
      if (player && typeof player.pauseVideo === 'function') {
        player.pauseVideo();
      }
    } catch (_) {}
    try {
      video.pause();
    } catch (_) {}

    if (
      typeof seekNearEndTarget === 'number' &&
      Number.isFinite(seekNearEndTarget) &&
      seekNearEndTarget >= 0
    ) {
      try {
        if (player && typeof player.seekTo === 'function') {
          player.seekTo(seekNearEndTarget, true);
        } else {
          video.currentTime = seekNearEndTarget;
        }
      } catch (_) {
        try {
          video.currentTime = seekNearEndTarget;
        } catch (__) {}
      }
      try {
        if (player && typeof player.pauseVideo === 'function') {
          player.pauseVideo();
        }
      } catch (_) {}
      try {
        video.pause();
      } catch (_) {}
      setTimeout(() => {
        if (
          heldAtEndVideoId === currentVideoId &&
          Date.now() > userInitiatedNavUntil &&
          Date.now() > replayGraceUntil
        ) {
          suppressNativeAutoplayAndPlaylist();
          const pLater = getMoviePlayer();
          const vLater = getMainVideo();
          try {
            if (pLater && typeof pLater.pauseVideo === 'function') {
              pLater.pauseVideo();
            }
          } catch (_) {}
          if (vLater && !vLater.paused) {
            try {
              vLater.pause();
            } catch (_) {}
          }
          emitTimeRemaining(true);
        }
      }, 60);
    }

    flushTimeSavedDelta();
    const wlEnabled = config.showWatchLaterRemoveAction !== false;
    const wlRemoved = Boolean(currentVideoId && removedWatchLaterVideoIds.has(currentVideoId));
    const wlRoute = wlEnabled && isWatchLaterRouteOrPanel();
    const wlCached = currentVideoId ? watchLaterStatusByVideo.get(currentVideoId) : null;
    const immediateInWl = Boolean(
      wlEnabled && !wlRemoved && (wlRoute || (wlCached && wlCached.inWatchLater))
    );

    if (!alreadyHeld || forceBanner) {
      postToContent('PLAYBACK_STOPPED', {
        videoId: currentVideoId,
        hasPlaylist: hasActivePlaylistContext(),
        bankedSavedSec: Math.floor(currentVideoTimeSavedSec),
        inWatchLater: immediateInWl,
        watchLaterRemoved: wlRemoved,
      });
    }

    if (wlEnabled && !wlRoute && !wlRemoved && currentVideoId && currentVideoId !== 'active') {
      checkWatchLaterMembershipOnEnd(currentVideoId);
    }

    emitTimeRemaining(true);
    return true;
  }

  function checkNearVideoEnd(fromSeekEvent = false) {
    if (!config.enabled || !config.stopAfterVideoEnds || !isSupportedWatchPage()) return;
    if (Date.now() <= replayGraceUntil) return;
    const player = getMoviePlayer();
    const video = getMainVideo();
    if (!video || isAdPlaying(player) || video.loop || isLiveBroadcast(player, video)) return;

    const duration = resolveEffectiveVodDurationSec(player, video);
    if (duration === null || !Number.isFinite(duration) || duration <= 2.5) return;

    const mediaCur = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const streamCur = readPlayerStreamTimeSec(player);
    // Only trust #movie_player stream time over video.currentTime when they agree within 2.5s
    // (avoids stale player.getCurrentTime() at EOF overriding a fresh backward seek or replay to 0:00)
    const alignedStreamCur =
      streamCur !== null && Math.abs(streamCur - mediaCur) <= 2.5 ? streamCur : null;
    let scrubBarCur = null;
    if (
      fromSeekEvent &&
      player &&
      (progressBarDragActive ||
        player.classList.contains('ytp-progress-bar-drag') ||
        player.classList.contains('ytp-scrubbing-mode'))
    ) {
      const barEl = player.querySelector('.ytp-progress-bar');
      if (barEl) {
        const ariaNow = Number(barEl.getAttribute('aria-valuenow'));
        const ariaMax = Number(barEl.getAttribute('aria-valuemax'));
        if (
          Number.isFinite(ariaNow) &&
          Number.isFinite(ariaMax) &&
          ariaMax > 2.5 &&
          Math.abs(ariaMax - duration) <= 5
        ) {
          scrubBarCur = ariaNow;
        }
      }
    }
    const activeCur = Math.max(
      mediaCur,
      alignedStreamCur !== null ? alignedStreamCur : 0,
      scrubBarCur !== null ? scrubBarCur : 0
    );
    const remaining = duration - activeCur;
    const currentVideoId = getCurrentVideoId(player) || 'active';

    if (remaining > 2.5 && heldAtEndVideoId === currentVideoId) {
      heldAtEndVideoId = null;
      window.__CADENCE_HELD_VIDEO_ID__ = null;
    }

    const threshold = Math.max(0.4, 0.32 * (video.playbackRate || 1));
    if (
      (fromSeekEvent
        ? remaining <= 0.85
        : !video.paused && remaining <= threshold) &&
      heldAtEndVideoId !== currentVideoId &&
      Date.now() > userInitiatedNavUntil
    ) {
      const clampTarget = remaining <= 0.12 ? Math.max(0, duration - 0.55) : null;
      triggerEndOfVideoStop(player, video, clampTarget, Boolean(fromSeekEvent));
    }
  }

  function enforceConfiguredSpeedNow() {
    if (!isSupportedWatchPage()) return;
    if (config.enabled && (config.perChannelSpeedEnabled || config.hasSessionOverride)) {
      const player = getMoviePlayer();
      const video = getMainVideo();
      if (video && isLiveBroadcast(player, video)) {
        const dvr = measureLiveDvrState(player, video, getCurrentVideoId(player));
        if (dvr.isAtLiveHead && Number(config.targetSpeed) > 1.01) {
          applyLiveHeadRateClamp(player, video);
          emitTimeRemaining(true);
          return;
        }
        if (
          dvr.isDvrSupported === false &&
          Number(config.targetSpeed) < 0.99 &&
          nonDvrSubOneRuleClamped
        ) {
          applyLiveHeadRateClamp(player, video, true);
          emitTimeRemaining(true);
          return;
        }
      }
      applyPlaybackSpeed(config.targetSpeed);
    }
  }

  function checkAdTransition() {
    if (!isSupportedWatchPage()) {
      wasAdPlaying = false;
      return;
    }
    const player = getMoviePlayer();
    if (!player) return;
    const adNow = isAdPlaying(player);
    if (adNow && !wasAdPlaying) {
      wasAdPlaying = true;
      lastDetectedKey = '';
      const video = getMainVideo();
      if (video && Math.abs(video.playbackRate - 1.0) > 0.02) {
        applyLiveHeadRateClamp(player, video);
      }
      postToContent('AD_STATE_CHANGE', {
        videoId: getCurrentVideoId(player) || '',
        isAd: true,
      });
      emitTimeRemaining(true);
    } else if (!adNow && wasAdPlaying) {
      wasAdPlaying = false;
      lastDetectedKey = '';
      dvrRestoreAttempts = 0;
      postToContent('AD_STATE_CHANGE', {
        videoId: getCurrentVideoId(player) || '',
        isAd: false,
      });
      broadcastChannelMetadata(true);
      enforceConfiguredSpeedNow();
      emitTimeRemaining(true);
      setTimeout(() => {
        if (isSupportedWatchPage() && !isAdPlaying(getMoviePlayer())) {
          enforceConfiguredSpeedNow();
          emitTimeRemaining(true);
        }
      }, 120);
      setTimeout(() => {
        if (isSupportedWatchPage() && !isAdPlaying(getMoviePlayer())) {
          enforceConfiguredSpeedNow();
          emitTimeRemaining(true);
        }
      }, 400);
    }
  }

  function bindPlayerClassObserver() {
    const player = getMoviePlayer();
    if (!player || player === observedPlayerEl) return;
    if (playerClassObserver) {
      try {
        playerClassObserver.disconnect();
      } catch (_) {}
    }
    observedPlayerEl = player;
    playerClassObserver = new MutationObserver(() => {
      checkAdTransition();
    });
    playerClassObserver.observe(player, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  function bindVideoListeners() {
    bindPlayerClassObserver();
    const video = getMainVideo();
    if (!video || video.__cadenceBridgeId === bridgeInstanceId) return;
    video.__cadenceBridgeId = bridgeInstanceId;

    video.addEventListener(
      'timeupdate',
      () => {
        trackTimeSavedTick();
        checkAdTransition();
        checkNearVideoEnd();
        checkNonDvrSlowForcedCatchup(getMoviePlayer(), video);
        emitTimeRemaining(false);
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'seeking',
      () => {
        checkNearVideoEnd(true);
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'seeked',
      () => {
        const pNow = getMoviePlayer();
        const streamNow = readPlayerStreamTimeSec(pNow);
        if (
          pendingSeekTargetPlayheadSec !== null &&
          streamNow !== null &&
          Math.abs(streamNow - pendingSeekTargetPlayheadSec) <= 4
        ) {
          pendingSeekTargetPlayheadSec = null;
          pendingSeekUntil = 0;
        }
        dvrRestoreAttempts = 0;
        checkNearVideoEnd(true);
        checkNonDvrSlowForcedCatchup(pNow, video);
        maybeRestoreDvrCatchupSpeed();
        emitTimeRemaining(true);
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'ended',
      () => {
        const pNow = getMoviePlayer();
        const effectiveDur = resolveEffectiveVodDurationSec(pNow, video);
        if (effectiveDur !== null && effectiveDur > 2.5) {
          triggerEndOfVideoStop(pNow, video, Math.max(0, effectiveDur - 0.55), true);
        }
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'pause',
      () => {
        flushTimeSavedDelta();
        checkNearVideoEnd(true);
        emitTimeRemaining(true);
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'durationchange',
      () => {
        emitTimeRemaining(true);
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'loadstart',
      () => {
        heldAtEndVideoId = null;
        window.__CADENCE_HELD_VIDEO_ID__ = null;
        lastRemainingSignature = '';
        if (!isSupportedWatchPage()) {
          handleNonWatchRoute();
          return;
        }
        const urlVid = getUrlVideoId();
        if (urlVid && urlVid !== liveStateVideoId) {
          resetLiveTrackingState(urlVid);
        }
        if (urlVid && urlVid !== lockedVideoId) {
          resetCurrentVideoTimeSaved();
          const hasMatchingHint =
            pendingCardHint &&
            pendingCardHint.videoId === urlVid &&
            pendingCardHint.expiresAt > Date.now();
          if (!hasMatchingHint) {
            config.targetSpeed = Number(config.defaultSpeed) || 1.0;
            window.__CADENCE_LAST_CONFIG__ = config;
          }
        }
        enforceConfiguredSpeedNow();
        broadcastChannelMetadata(false);
        startFastDetectionBurst();
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'loadedmetadata',
      () => {
        heldAtEndVideoId = null;
        window.__CADENCE_HELD_VIDEO_ID__ = null;
        broadcastChannelMetadata(true);
        enforceConfiguredSpeedNow();
        emitTimeRemaining(true);
        setTimeout(enforceConfiguredSpeedNow, 30);
        suppressNativeAutoplayAndPlaylist();
      },
      { signal: bridgeSignal }
    );

    video.addEventListener('loadeddata', enforceConfiguredSpeedNow, { signal: bridgeSignal });
    video.addEventListener('canplay', enforceConfiguredSpeedNow, { signal: bridgeSignal });

    video.addEventListener(
      'play',
      () => {
        dvrRestoreAttempts = 0;
        suppressNativeAutoplayAndPlaylist();
        enforceConfiguredSpeedNow();
        maybeRestoreDvrCatchupSpeed();
        emitTimeRemaining(true);
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'playing',
      () => {
        enforceConfiguredSpeedNow();
        maybeRestoreDvrCatchupSpeed();
        emitTimeRemaining(false);
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'ratechange',
      () => {
        if (!isSupportedWatchPage()) return;
        const player = getMoviePlayer();
        if (isApplyingProgrammatically) return;
        const newRate = Math.round(video.playbackRate * 100) / 100;
        if (isAdPlaying(player)) {
          if (Math.abs(newRate - 1.0) > 0.02 && config.enabled) {
            applyLiveHeadRateClamp(player, video);
            if (Date.now() <= recentNativeSpeedGestureUntil) {
              postToContent('AD_SPEED_BLOCKED', {
                videoId: getCurrentVideoId(player) || '',
                attemptedSpeed: newRate,
              });
            }
          }
          emitTimeRemaining(true);
          return;
        }

        if (isLiveBroadcast(player, video)) {
          const dvr = measureLiveDvrState(player, video, getCurrentVideoId(player));
          if (dvr.isAtLiveHead && newRate > 1.01 && config.enabled) {
            applyLiveHeadRateClamp(player, video);
            postToContent('LIVE_HEAD_SPEED_BLOCKED', {
              videoId: getCurrentVideoId(player) || '',
              attemptedSpeed: newRate,
            });
            emitTimeRemaining(true);
            return;
          }
          if (dvr.isDvrSupported === false) {
            if (Date.now() <= recentNativeSpeedGestureUntil && newRate < 0.99) {
              nonDvrSubOneRuleClamped = false;
              nonDvrSlowActiveSince = Date.now();
              lastNonDvrSlowMediaTime = Number.isFinite(video.currentTime)
                ? video.currentTime
                : null;
              lastNonDvrSlowStreamTime = readPlayerStreamTimeSec(player);
              lastNonDvrSlowWallMs = Date.now();
            } else if (
              Math.abs(newRate - 1.0) <= 0.03 &&
              Date.now() > recentNativeSpeedGestureUntil &&
              nonDvrSlowActiveSince > 0
            ) {
              if (Date.now() - nonDvrSlowActiveSince > 1200) {
                handleNonDvrForcedCatchup(player, video);
                return;
              }
              const targetSpd = Number(config.targetSpeed) || 1.0;
              if (config.enabled && targetSpd < 0.99 && !nonDvrSubOneRuleClamped) {
                setTimeout(() => applyPlaybackSpeed(targetSpd), 60);
              }
              emitTimeRemaining(true);
              return;
            }
          }
          if (Math.abs(newRate - 1.0) < 0.025 && Date.now() > recentNativeSpeedGestureUntil) {
            emitTimeRemaining(true);
            if (
              !dvr.isAtLiveHead &&
              config.enabled &&
              Math.abs((Number(config.targetSpeed) || 1.0) - 1.0) > 0.025
            ) {
              setTimeout(maybeRestoreDvrCatchupSpeed, 120);
            }
            return;
          }
        }

        emitTimeRemaining(true);
        if (Math.abs(newRate - lastAppliedSpeed) >= 0.025) {
          lastAppliedSpeed = newRate;
          const meta = extractChannelMetadata();
          if (meta && !meta.isPreview) {
            postToContent('MANUAL_RATE_CHANGE', { ...meta, speed: newRate });
          } else {
            const fallbackVideoId = getCurrentVideoId(player) || '';
            if (fallbackVideoId) {
              postToContent('MANUAL_RATE_CHANGE', {
                videoId: fallbackVideoId,
                speed: newRate,
              });
            }
          }
        }
      },
      { signal: bridgeSignal }
    );
  }

  function broadcastChannelMetadata(force = false) {
    bindVideoListeners();
    checkAdTransition();
    if (!isSupportedWatchPage()) {
      handleNonWatchRoute();
      return;
    }
    wasOnWatchPage = true;
    suppressNativeAutoplayAndPlaylist();
    const meta = extractChannelMetadata();
    if (!meta) return;
    if (meta.videoId) {
      ensurePerVideoSavedTimeBoundary(meta.videoId);
    }
    if (!meta.isPreview) {
      lockedVideoId = meta.videoId;
    }
    const key = [
      meta.videoId,
      meta.channelId,
      meta.handle,
      meta.channelName,
      meta.isAd,
      meta.isPreview ? 'preview' : 'verified',
    ].join('|');
    if (force || key !== lastDetectedKey) {
      lastDetectedKey = key;
      postToContent('VIDEO_DETECTED', meta);
      emitTimeRemaining(true);
    }
  }

  window.addEventListener(
    'message',
    (event) => {
      if (event.source !== window || !event.data || event.data.source !== 'CADENCE_ISOLATED_CONTENT') {
        return;
      }
      const { type, payload = {} } = event.data;
      if (type === 'CONFIG_UPDATE') {
        hasReceivedConfig = true;
        config = { ...config, ...payload };
        window.__CADENCE_LAST_CONFIG__ = config;
        if (maybeRedirectCurrentShortsRoute()) {
          return;
        }
        syncShortsLinksInDom(true);
        suppressNativeAutoplayAndPlaylist();
        if (!isSupportedWatchPage()) {
          applyPlaybackSpeed(config.defaultSpeed || 1.0, true);
        } else if (
          config.enabled &&
          (config.perChannelSpeedEnabled || config.hasSessionOverride) &&
          typeof payload.targetSpeed === 'number'
        ) {
          applyPlaybackSpeed(payload.targetSpeed);
        }
      } else if (type === 'COMMAND') {
        if (payload.action === 'SET_SPEED') {
          const requestedSpeed = Number(payload.speed) || 1.0;
          const player = getMoviePlayer();
          const video = getMainVideo();
          if (isAdPlaying(player)) {
            if (payload.fromUserGesture && config.enabled) {
              postToContent('AD_SPEED_BLOCKED', {
                videoId: getCurrentVideoId(player) || '',
                attemptedSpeed: requestedSpeed,
              });
              emitTimeRemaining(true);
              return;
            }
            config.targetSpeed = requestedSpeed;
            window.__CADENCE_LAST_CONFIG__ = config;
            return;
          }
          if (
            payload.fromUserGesture &&
            requestedSpeed > 1.01 &&
            video &&
            isLiveBroadcast(player, video)
          ) {
            const dvr = measureLiveDvrState(player, video, getCurrentVideoId(player));
            if (dvr.isAtLiveHead) {
              config.targetSpeed = 1.0;
              window.__CADENCE_LAST_CONFIG__ = config;
              applyLiveHeadRateClamp(player, video);
              postToContent('LIVE_HEAD_SPEED_BLOCKED', {
                videoId: getCurrentVideoId(player) || '',
                attemptedSpeed: requestedSpeed,
              });
              emitTimeRemaining(true);
              return;
            }
          }
          if (payload.fromUserGesture) {
            nonDvrSubOneRuleClamped = false;
          }
          config.targetSpeed = payload.speed;
          window.__CADENCE_LAST_CONFIG__ = config;
          applyPlaybackSpeed(payload.speed);
        } else if (payload.action === 'SEEK_BY_SECONDS') {
          const deltaSec = Number(payload.deltaSec) || 0;
          if (!deltaSec) return;
          const player = getMoviePlayer();
          const video = getMainVideo();
          if (!video) return;
          const vid = getCurrentVideoId(player) || '';
          if (isAdPlaying(player)) {
            if (config.enabled) {
              postToContent('AD_SKIP_BLOCKED', { videoId: vid, deltaSec });
              emitTimeRemaining(true);
            }
            return;
          }
          if (isLiveBroadcast(player, video)) {
            const dvr = measureLiveDvrState(player, video, vid);
            if (dvr.isDvrSupported === false) {
              postToContent('LIVE_DVR_UNAVAILABLE', { videoId: vid, deltaSec });
              emitTimeRemaining(true);
              return;
            }
            if (dvr.isAtLiveHead && deltaSec > 0) {
              postToContent('LIVE_HEAD_SKIP_BLOCKED', { videoId: vid, deltaSec });
              emitTimeRemaining(true);
              return;
            }
            if (!dvr.isAtLiveHead && deltaSec > 0 && dvr.dvrLagSec - deltaSec <= 2) {
              const nowJump = Date.now();
              explicitJumpToLiveUntil = nowJump + 2800;
              recentBackwardSeekUntil = 0;
              pendingSeekTargetPlayheadSec = null;
              pendingSeekUntil = 0;
              seekPlayerToLiveEdge(player, video);
              applyLiveHeadRateClamp(player, video);
              liveHeadHysteresisBehind = false;
              catchupMaxLagSec = null;
              catchupActive = false;
              lastCatchupVideoSec = null;
              postToContent('LIVE_CAUGHT_UP', { videoId: vid, fromSeek: true });
              emitTimeRemaining(true);
              setTimeout(() => emitTimeRemaining(true), 80);
              return;
            }

            let ps = null;
            try {
              if (player && typeof player.getProgressState === 'function') {
                ps = player.getProgressState();
              }
            } catch (_) {}

            const nowSeek = Date.now();
            const playerStreamSec = readPlayerStreamTimeSec(player, ps);
            const baseStreamSec =
              pendingSeekTargetPlayheadSec !== null && nowSeek < pendingSeekUntil
                ? pendingSeekTargetPlayheadSec
                : playerStreamSec;

            // Keep player.seekTo() strictly in #movie_player's broadcast stream timeline
            // (never mix video.currentTime MSE session offset with ps.seekableStart or player.seekTo).
            if (player && typeof player.seekTo === 'function' && baseStreamSec !== null) {
              const minSeek =
                ps &&
                Number.isFinite(ps.seekableStart) &&
                ps.seekableStart >= 0 &&
                ps.seekableStart <= baseStreamSec + 2
                  ? ps.seekableStart
                  : 0;
              let nextStreamSec = Math.max(minSeek, baseStreamSec + deltaSec);
              if (
                deltaSec > 0 &&
                !psHasMseCeiling &&
                ps &&
                Number.isFinite(ps.seekableEnd) &&
                ps.seekableEnd > baseStreamSec + 1
              ) {
                nextStreamSec = Math.min(Math.max(minSeek, ps.seekableEnd - 0.5), nextStreamSec);
              }

              if (deltaSec < 0) {
                if (liveAnchorWallMs === 0 || dvr.isAtLiveHead) {
                  liveAnchorVideoSec = baseStreamSec;
                  liveAnchorWallMs = nowSeek;
                }
                recentBackwardSeekUntil = nowSeek + 5000;
                explicitJumpToLiveUntil = 0;
                liveHeadHysteresisBehind = true;
                catchupMaxLagSec = null;
              } else if (catchupMaxLagSec !== null) {
                catchupMaxLagSec = Math.max(0, catchupMaxLagSec - deltaSec);
              }

              pendingSeekTargetPlayheadSec = nextStreamSec;
              pendingSeekUntil = nowSeek + 2200;
              lastObservedCurrentTime = nextStreamSec;

              try {
                player.seekTo(nextStreamSec, true);
              } catch (_) {}
            } else {
              // Pure HTMLMediaElement fallback clamped only against video.seekable
              const rawCur = Number.isFinite(video.currentTime) ? video.currentTime : 0;
              let minMedia = 0;
              let maxMedia = null;
              if (video.seekable && video.seekable.length > 0) {
                try {
                  const s0 = video.seekable.start(0);
                  const sEnd = video.seekable.end(video.seekable.length - 1);
                  if (Number.isFinite(s0) && s0 >= 0 && s0 <= rawCur + 2) minMedia = s0;
                  if (!Number.isFinite(video.duration) && Number.isFinite(sEnd) && sEnd >= rawCur) {
                    maxMedia = sEnd;
                  }
                } catch (_) {}
              }
              let nextMedia = Math.max(minMedia, rawCur + deltaSec);
              if (deltaSec > 0 && maxMedia !== null) {
                nextMedia = Math.min(Math.max(minMedia, maxMedia - 0.5), nextMedia);
              }
              if (deltaSec < 0) {
                if (liveAnchorWallMs === 0 || dvr.isAtLiveHead) {
                  liveAnchorVideoSec = rawCur;
                  liveAnchorWallMs = nowSeek;
                }
                recentBackwardSeekUntil = nowSeek + 5000;
                explicitJumpToLiveUntil = 0;
                liveHeadHysteresisBehind = true;
                catchupMaxLagSec = null;
              }
              video.currentTime = nextMedia;
              lastObservedCurrentTime = nextMedia;
            }

            dvrRestoreAttempts = 0;
            if (deltaSec < 0) {
              setTimeout(maybeRestoreDvrCatchupSpeed, 90);
              setTimeout(maybeRestoreDvrCatchupSpeed, 260);
            }
            emitTimeRemaining(true);
            setTimeout(() => emitTimeRemaining(true), 90);
            setTimeout(() => emitTimeRemaining(true), 280);
            return;
          }

          let cur = Number.isFinite(video.currentTime) ? video.currentTime : 0;
          const vodStreamCur = readPlayerStreamTimeSec(player);
          if (vodStreamCur !== null && player && typeof player.seekTo === 'function') {
            cur = vodStreamCur;
          }
          const dur = resolveEffectiveVodDurationSec(player, video);
          if (deltaSec < 0) {
            heldAtEndVideoId = null;
            window.__CADENCE_HELD_VIDEO_ID__ = null;
          }
          if (
            deltaSec > 0 &&
            config.enabled &&
            config.stopAfterVideoEnds &&
            dur !== null &&
            dur > 1.5 &&
            cur + deltaSec >= dur - 0.65
          ) {
            triggerEndOfVideoStop(player, video, Math.max(0, dur - 0.55), true);
            return;
          }
          let targetTime = Math.max(0, cur + deltaSec);
          if (dur !== null) {
            targetTime = Math.min(dur, targetTime);
          }
          try {
            if (player && typeof player.seekTo === 'function') {
              player.seekTo(targetTime, true);
            } else {
              video.currentTime = targetTime;
            }
          } catch (_) {
            video.currentTime = targetTime;
          }
          emitTimeRemaining(true);
          setTimeout(() => emitTimeRemaining(true), 80);
        } else if (payload.action === 'REPLAY_VIDEO') {
          const video = getMainVideo();
          const player = getMoviePlayer();
          const replayVid = getCurrentVideoId(player);
          if (replayVid && !removedWatchLaterVideoIds.has(replayVid)) {
            watchLaterStatusByVideo.delete(replayVid);
          }
          resetCurrentVideoTimeSaved();
          replayGraceUntil = Date.now() + 1400;
          heldAtEndVideoId = null;
          window.__CADENCE_HELD_VIDEO_ID__ = null;
          lastRemainingSignature = '';
          try {
            if (player && typeof player.seekTo === 'function') {
              player.seekTo(0, true);
            }
          } catch (_) {}
          if (video) {
            try {
              video.currentTime = 0;
            } catch (_) {}
            video.play().catch(() => {});
          }
          try {
            if (player && typeof player.playVideo === 'function') {
              player.playVideo();
            }
          } catch (_) {}
          enforceConfiguredSpeedNow();
          emitTimeRemaining(true);
          setTimeout(() => {
            const pLater = getMoviePlayer();
            const vLater = getMainVideo();
            if (vLater && vLater.currentTime > 3) {
              try {
                if (pLater && typeof pLater.seekTo === 'function') {
                  pLater.seekTo(0, true);
                }
              } catch (_) {}
              try {
                vLater.currentTime = 0;
              } catch (_) {}
            }
            if (vLater && vLater.paused) {
              vLater.play().catch(() => {});
              try {
                if (pLater && typeof pLater.playVideo === 'function') {
                  pLater.playVideo();
                }
              } catch (_) {}
            }
            enforceConfiguredSpeedNow();
            emitTimeRemaining(true);
          }, 90);
        } else if (payload.action === 'PLAY_NEXT_MANUAL') {
          markUserNavigationIntent();
          const player = getMoviePlayer();
          if (player && typeof player.nextVideo === 'function') {
            player.nextVideo();
          } else {
            const nextBtn = document.querySelector('.ytp-next-button');
            if (nextBtn instanceof HTMLElement) nextBtn.click();
          }
        } else if (payload.action === 'JUMP_TO_LIVE') {
          const player = getMoviePlayer();
          const video = getMainVideo();
          const vid = getCurrentVideoId(player) || '';
          const shouldClampSubOne =
            Boolean(payload.clampSubOne) || isLiveDvrSupported(player, video, vid) === false;
          explicitJumpToLiveUntil = Date.now() + 2800;
          recentBackwardSeekUntil = 0;
          pendingSeekTargetPlayheadSec = null;
          pendingSeekUntil = 0;
          if (shouldClampSubOne) {
            nonDvrSlowActiveSince = 0;
            lastNonDvrSlowMediaTime = null;
            lastNonDvrSlowStreamTime = null;
            lastNonDvrSlowWallMs = 0;
            nonDvrSubOneRuleClamped = true;
            config.hasSessionOverride = false;
            config.targetSpeed = 1.0;
            window.__CADENCE_LAST_CONFIG__ = config;
          }
          seekPlayerToLiveEdge(player, video);
          if (video) {
            if (video.playbackRate > 1.01 || (shouldClampSubOne && video.playbackRate < 0.99)) {
              applyLiveHeadRateClamp(player, video, shouldClampSubOne);
            }
            if (video.paused) {
              video.play().catch(() => {});
              try {
                if (player && typeof player.playVideo === 'function') {
                  player.playVideo();
                }
              } catch (_) {}
            }
          }
          liveHeadHysteresisBehind = false;
          catchupMaxLagSec = null;
          catchupActive = false;
          lastCatchupVideoSec = null;
          emitTimeRemaining(true);
          setTimeout(() => emitTimeRemaining(true), 80);
        } else if (payload.action === 'REMOVE_FROM_WATCH_LATER') {
          removeVideoFromWatchLater(payload.videoId || '');
        } else if (payload.action === 'GO_TO_YOUTUBE_HOME') {
          navigateToYouTubeHome();
        } else if (payload.action === 'FORCE_DETECT') {
          broadcastChannelMetadata(true);
          emitTimeRemaining(true);
        }
      }
    },
    { signal: bridgeSignal }
  );

  window.addEventListener(
    'yt-navigate-start',
    (e) => {
      heldAtEndVideoId = null;
      window.__CADENCE_HELD_VIDEO_ID__ = null;
      lastRemainingSignature = '';
      const destUrl = (e && e.detail && e.detail.url) || '';
      if (shouldConvertShorts() && destUrl) {
        const redirectedWatch = buildWatchUrlFromShortsHref(destUrl);
        if (redirectedWatch) {
          location.replace(redirectedWatch);
          return;
        }
      }
      const destVid = parseVideoIdFromHref(destUrl) || getUrlVideoId();

      if (destUrl && !destUrl.startsWith('/watch')) {
        handleNonWatchRoute();
        return;
      }

      if (destVid && destVid !== lockedVideoId) {
        const hasMatchingHint =
          pendingCardHint &&
          pendingCardHint.videoId === destVid &&
          pendingCardHint.expiresAt > Date.now();
        if (!hasMatchingHint) {
          config.targetSpeed = Number(config.defaultSpeed) || 1.0;
          window.__CADENCE_LAST_CONFIG__ = config;
          applyPlaybackSpeed(config.targetSpeed);
        }
      }
      startFastDetectionBurst();
    },
    { signal: bridgeSignal }
  );

  window.addEventListener(
    'yt-navigate-finish',
    () => {
      heldAtEndVideoId = null;
      window.__CADENCE_HELD_VIDEO_ID__ = null;
      const navVid = getUrlVideoId();
      if (navVid && !removedWatchLaterVideoIds.has(navVid)) {
        watchLaterStatusByVideo.delete(navVid);
      }
      resetCurrentVideoTimeSaved();
      if (maybeRedirectCurrentShortsRoute()) return;
      syncShortsLinksInDom(true);
      if (!isSupportedWatchPage()) {
        handleNonWatchRoute();
        return;
      }
      broadcastChannelMetadata(true);
      startFastDetectionBurst();
      setTimeout(() => broadcastChannelMetadata(false), 120);
      setTimeout(() => broadcastChannelMetadata(false), 500);
    },
    { signal: bridgeSignal }
  );

  window.addEventListener(
    'yt-page-data-updated',
    () => {
      if (maybeRedirectCurrentShortsRoute()) return;
      syncShortsLinksInDom(true);
      if (!isSupportedWatchPage()) {
        handleNonWatchRoute();
        return;
      }
      broadcastChannelMetadata(true);
    },
    { signal: bridgeSignal }
  );

  window.addEventListener(
    'popstate',
    () => {
      if (maybeRedirectCurrentShortsRoute()) return;
      if (!isSupportedWatchPage()) {
        handleNonWatchRoute();
      } else {
        startFastDetectionBurst();
      }
    },
    { signal: bridgeSignal }
  );

  document.addEventListener(
    'play',
    (event) => {
      if (!config.enabled || config.disableVideoPreviews === false) return;
      const target = event && event.target;
      if (target && target.nodeName === 'VIDEO' && isPreviewVideoElement(target)) {
        stopPreviewVideoElement(target);
      }
    },
    { capture: true, signal: bridgeSignal }
  );

  document.addEventListener(
    'playing',
    (event) => {
      if (!config.enabled || config.disableVideoPreviews === false) return;
      const target = event && event.target;
      if (target && target.nodeName === 'VIDEO' && isPreviewVideoElement(target)) {
        stopPreviewVideoElement(target);
      }
    },
    { capture: true, signal: bridgeSignal }
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'visible' && isSupportedWatchPage()) {
        emitTimeRemaining(true);
      }
    },
    { signal: bridgeSignal }
  );

  window.addEventListener(
    'focus',
    () => {
      if (isSupportedWatchPage()) {
        emitTimeRemaining(true);
      }
    },
    { signal: bridgeSignal }
  );

  heartbeatInterval = setInterval(() => {
    if (maybeRedirectCurrentShortsRoute()) return;
    syncShortsLinksInDom(false);
    suppressInlinePreviewPlayerIfNeeded();
    trackTimeSavedTick();
    checkAdTransition();
    broadcastChannelMetadata(false);
    checkNearVideoEnd();
    checkNonDvrSlowForcedCatchup(getMoviePlayer(), getMainVideo());
    maybeRestoreDvrCatchupSpeed();
    emitTimeRemaining(false);
  }, 250);

  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') {
        flushTimeSavedDelta();
      }
    },
    { signal: bridgeSignal }
  );

  window.addEventListener(
    'beforeunload',
    () => {
      flushTimeSavedDelta();
    },
    { signal: bridgeSignal }
  );

  window.__CADENCE_PAGE_BRIDGE_CLEANUP__ = () => {
    try {
      flushTimeSavedDelta();
    } catch (_) {}
    try {
      bridgeController.abort();
    } catch (_) {}
    if (playerClassObserver) {
      try {
        playerClassObserver.disconnect();
      } catch (_) {}
      playerClassObserver = null;
      observedPlayerEl = null;
    }
    stopFastDetectionBurst();
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    clearTimeout(programmaticTimer);
    clearTimeout(postSpeedVerifyTimer);
  };

  if (!maybeRedirectCurrentShortsRoute()) {
    syncShortsLinksInDom(true);
    broadcastChannelMetadata(true);
  }
})();
`;

  const contentJs = `(() => {
  function isExtensionContextValid() {
    try {
      return Boolean(
        typeof chrome !== 'undefined' &&
          chrome.runtime &&
          typeof chrome.runtime.id === 'string' &&
          chrome.runtime.id.length > 0
      );
    } catch (_) {
      return false;
    }
  }

  if (!isExtensionContextValid()) return;

  const runtimeId = chrome.runtime.id;
  if (
    window.__CADENCE_ACTIVE_RUNTIME_ID__ === runtimeId &&
    typeof window.__CADENCE_CONTENT_PING__ === 'function'
  ) {
    try {
      window.__CADENCE_CONTENT_PING__();
      return;
    } catch (_) {}
  }

  if (typeof window.__CADENCE_CONTENT_TEARDOWN__ === 'function') {
    try {
      window.__CADENCE_CONTENT_TEARDOWN__();
    } catch (_) {}
  }

  const INSTANCE_TOKEN = 'cadence-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const lifecycleController = new AbortController();
  const lifecycleSignal = lifecycleController.signal;
  let isDestroyed = false;

  let state = {
    settings: ${JSON.stringify(settings)},
    presets: ${JSON.stringify(presets)},
    rules: ${JSON.stringify(rules)},
    totalTimeSavedSec: 0,
    savedTimeByDay: {},
  };

  let currentChannel = null;
  let activeSpeed = 1.0;
  let sessionOverride = {
    videoId: null,
    speed: null,
  };
  let remainingState = {
    videoId: null,
    rawRemainingSec: null,
    rawDurationSec: null,
    bankedSavedSec: 0,
    savedTimeModel: { visible: false, tone: 'neutral', text: '', title: '' },
    playbackRate: null,
    isAd: false,
    isLive: false,
    isAtLiveHead: false,
    isDvrSupported: true,
    dvrLagSec: null,
    isPaused: false,
    hidden: true,
  };
  let lastToastedVideoId = null;
  let nonDvrClampedVideoId = null;
  let toastTimeout = null;
  let barToastTimeout = null;
  let barToastVisible = false;
  let barToastReason = null;
  let barMountRetryTimer = null;
  let barMountAttempts = 0;
  let barResizeObserver = null;
  let bannerProtectedUntil = 0;
  let stoppedBannerVideoId = null;
  let watchLaterState = {
    videoId: null,
    status: 'idle',
  };

  function syncPreviewBlockerStyle() {
    const block = Boolean(state.settings && state.settings.enabled && state.settings.disableVideoPreviews !== false);
    let style = document.getElementById('cadence-preview-blocker-style');
    if (block) {
      if (!style) {
        style = document.createElement('style');
        style.id = 'cadence-preview-blocker-style';
        style.textContent =
          'ytd-video-preview, ' +
          '#preview > ytd-video-preview, ' +
          '#inline-preview-player, ' +
          '#video-preview-container, ' +
          'ytd-moving-thumbnail-renderer, ' +
          'yt-animated-thumbnail-view-model, ' +
          'ytd-thumbnail-overlay-loading-preview-renderer, ' +
          'ytd-thumbnail #mouseover-overlay, ' +
          'yt-thumbnail-view-model #mouseover-overlay, ' +
          'yt-thumbnail-hover-overlay-view-model, ' +
          'ytd-browse[page-subtype="history"] ytd-moving-thumbnail-renderer, ' +
          'ytd-browse[page-subtype="history"] yt-animated-thumbnail-view-model, ' +
          'ytd-browse[page-subtype="history"] #mouseover-overlay, ' +
          'ytd-browse[page-subtype="history"] ytd-video-preview, ' +
          'ytd-browse[page-subtype="history"] #inline-preview-player, ' +
          'ytd-browse[page-subtype="history"] #video-preview-container, ' +
          'ytd-moving-thumbnail-renderer img[src*="an_webp"], ' +
          'yt-animated-thumbnail-view-model img[src*="an_webp"], ' +
          'yt-thumbnail-hover-overlay-view-model img[src*="an_webp"], ' +
          '#mouseover-overlay img[src*="an_webp"], ' +
          '#secondary ytd-video-preview, ' +
          '#secondary #inline-preview-player, ' +
          '#secondary #video-preview-container, ' +
          '#secondary ytd-moving-thumbnail-renderer, ' +
          '#secondary yt-animated-thumbnail-view-model, ' +
          '#secondary #mouseover-overlay { ' +
          'display: none !important; ' +
          'pointer-events: none !important; ' +
          'opacity: 0 !important; ' +
          'visibility: hidden !important; ' +
          '}';
        (document.head || document.documentElement).appendChild(style);
      }
    } else if (style) {
      style.remove();
    }
  }

  const WARNING_ICON_SVG =
    '<svg class="cadence-toast-warn-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M8 2.25L14.25 13.25H1.75L8 2.25Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M8 6.5V9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>' +
    '</svg>';

  const CADENCE_EMBLEM_SVG =
    '<svg class="cadence-brand-emblem" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
    '<rect x="0.75" y="0.75" width="18.5" height="18.5" rx="4.5" fill="#0F172A" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>' +
    '<path d="M7.1 4.1L14.3 8.2L7.1 12.3V4.1Z" fill="#EF4444"/>' +
    '<rect x="3.5" y="14.2" width="13" height="2.4" rx="1.2" fill="#F8FAFC"/>' +
    '<path d="M4.7 14.2H9.35V16.6H4.7A1.2 1.2 0 0 1 4.7 14.2Z" fill="#DC2626"/>' +
    '</svg>';

  const REPLAY_ICON_SVG =
    '<svg class="cadence-seek-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>' +
    '<path d="M3 3v5h5"/>' +
    '</svg>';

  const SKIP_ICON_SVG =
    '<svg class="cadence-seek-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>' +
    '<path d="M21 3v5h-5"/>' +
    '</svg>';

  const HOME_ICON_SVG =
    '<svg class="cadence-banner-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 9.5L10 3.5L17 9.5"/>' +
    '<path d="M5.2 8.2V16.5H14.8V8.2"/>' +
    '</svg>';

  const WL_REMOVE_ICON_SVG =
    '<svg class="cadence-banner-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M5 3.5H15V17L10 13.8L5 17V3.5Z"/>' +
    '<path d="M7.5 8.5H12.5"/>' +
    '</svg>';

  const CHECK_ICON_SVG =
    '<svg class="cadence-banner-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4.5 10.5L8.2 14.2L15.5 6.2"/>' +
    '</svg>';

  const CLOSE_ICON_SVG =
    '<svg class="cadence-dismiss-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M4 4L12 12"/>' +
    '<path d="M12 4L4 12"/>' +
    '</svg>';

  function disconnectBarResizeObserver() {
    if (barResizeObserver) {
      try {
        barResizeObserver.disconnect();
      } catch (_) {}
      barResizeObserver = null;
    }
  }

  function clearBarMountRetry() {
    if (barMountRetryTimer) {
      clearTimeout(barMountRetryTimer);
      barMountRetryTimer = null;
    }
    barMountAttempts = 0;
  }

  function hideBarToast(removeDom = false) {
    if (barToastTimeout) {
      clearTimeout(barToastTimeout);
      barToastTimeout = null;
    }
    barToastVisible = false;
    barToastReason = null;
    const existingToast = document.getElementById('cadence-bar-toast');
    if (existingToast) {
      if (removeDom) {
        existingToast.remove();
      } else {
        existingToast.classList.remove('cadence-visible');
      }
    }
  }

  function teardownInstance() {
    if (isDestroyed) return;
    isDestroyed = true;
    clearTimeout(toastTimeout);
    hideBarToast(true);
    clearBarMountRetry();
    disconnectBarResizeObserver();
    try {
      lifecycleController.abort();
    } catch (_) {}
  }

  window.__CADENCE_ACTIVE_RUNTIME_ID__ = runtimeId;
  window.__CADENCE_CONTENT_TEARDOWN__ = teardownInstance;

  function safeSendMessage(payload) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    try {
      const maybePromise = chrome.runtime.sendMessage(payload);
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {});
      }
    } catch (_) {
      teardownInstance();
    }
  }

  async function safeStorageGet(keys) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return null;
    }
    try {
      return await chrome.storage.local.get(keys);
    } catch (_) {
      teardownInstance();
      return null;
    }
  }

  async function safeStorageSet(items) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return false;
    }
    try {
      await chrome.storage.local.set(items);
      return true;
    } catch (_) {
      teardownInstance();
      return false;
    }
  }

  function normalizeText(str) {
    return (str || '').trim().toLowerCase();
  }

  function formatDisplaySpeed(speed) {
    return Number(speed).toFixed(2).replace(/\\.00$/, '.0').replace(/(\\.\\d)0$/, '$1');
  }

  function formatCompactSpeed(speed) {
    return String(Math.round((Number(speed) || 1.0) * 100) / 100);
  }

  function buildDurationSizerText(text) {
    if (!text) return '';
    return String(text)
      .replace(/@\\s*[\\d.]+×$/, '@ 8.88×')
      .replace(/\\b\\d([sm])\\b/g, '88$1')
      .replace(/\\d/g, '8');
  }

  function clampSpeed(val) {
    return Math.round(Math.min(4.0, Math.max(0.25, Number(val) || 1.0)) * 100) / 100;
  }

  function formatCompactDuration(rawSec) {
    const safeSec = Math.max(0, Math.round(Number(rawSec) || 0));
    if (safeSec < 60) {
      return \`\${safeSec}s\`;
    }
    const totalMins = Math.max(1, Math.round(safeSec / 60));
    if (totalMins < 60) {
      return \`\${totalMins}m\`;
    }
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins > 0 ? \`\${hrs}h \${mins}m\` : \`\${hrs}h\`;
  }

  function getLocalDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return \`\${y}-\${m}-\${d}\`;
  }

  function computeGlobalBarSavedModel() {
    const mode = (state.settings && state.settings.barTimeSavedDisplay) || 'daily';
    if (mode === 'off') {
      return { visible: false, text: '', title: '' };
    }
    if (mode === 'total') {
      const totalSec = Math.max(0, Math.floor(Number(state.totalTimeSavedSec) || 0));
      return {
        visible: true,
        text: \`Saved \${formatCompactDuration(totalSec)}\`,
        title: 'Total lifetime time saved — configure in Options → Panel 02',
      };
    }
    const todayKey = getLocalDateKey();
    const byDay =
      state.savedTimeByDay && typeof state.savedTimeByDay === 'object' ? state.savedTimeByDay : {};
    const todaySec = Math.max(0, Math.floor(Number(byDay[todayKey]) || 0));
    return {
      visible: true,
      text: \`Saved \${formatCompactDuration(todaySec)} today\`,
      title: 'Daily time saved today — configure in Options → Panel 02',
    };
  }

  function formatExactMinutesSeconds(rawSec) {
    const safeSec = Math.max(0, Math.round(Number(rawSec) || 0));
    if (safeSec < 60) {
      return \`\${safeSec}s\`;
    }
    const mins = Math.floor(safeSec / 60);
    const secs = safeSec % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return remMins > 0 ? \`\${hrs}h \${remMins}m\` : \`\${hrs}h\`;
    }
    return secs > 0 ? \`\${mins}m \${String(secs).padStart(2, '0')}s\` : \`\${mins}m\`;
  }

  function formatRemainingReadout(rawRemainingSec, speed) {
    if (typeof rawRemainingSec !== 'number' || !Number.isFinite(rawRemainingSec) || rawRemainingSec < 0) {
      return '';
    }
    const safeRate = Math.max(0.25, Number(speed) || 1.0);
    const totalSec = Math.max(0, Math.round(rawRemainingSec / safeRate));
    return \`\${formatCompactDuration(totalSec)} left @ \${formatDisplaySpeed(safeRate)}×\`;
  }

  function isWatchLocation() {
    return location.pathname.startsWith('/watch');
  }

  function maybeRedirectShortsInContent() {
    if (
      !state.settings ||
      state.settings.enabled === false ||
      state.settings.convertShortsToWatch === false
    ) {
      return false;
    }
    const m = location.pathname.match(/^\\/shorts\\/([A-Za-z0-9_-]{6,})/);
    if (!m || !m[1]) return false;
    const params = new URLSearchParams(location.search);
    params.set('v', m[1]);
    params.delete('feature');
    location.replace('/watch?' + params.toString() + (location.hash || ''));
    return true;
  }

  function postToBridge(type, payload) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    window.postMessage(
      {
        source: 'CADENCE_ISOLATED_CONTENT',
        type,
        payload,
      },
      '*'
    );
  }

  window.__CADENCE_CONTENT_PING__ = () => {
    if (!isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    if (maybeRedirectShortsInContent()) return;
    postToBridge('COMMAND', { action: 'FORCE_DETECT' });
  };

  function extractDomChannelFallback() {
    if (!isWatchLocation()) {
      return null;
    }
    const urlVideoId = new URLSearchParams(location.search).get('v') || '';
    const flexy = document.querySelector('ytd-watch-flexy');
    const flexyVideoId = flexy ? flexy.getAttribute('video-id') || '' : '';
    if (urlVideoId && flexyVideoId && flexyVideoId !== urlVideoId) {
      return null;
    }
    const videoId = urlVideoId || flexyVideoId;

    const ownerLink =
      document.querySelector('ytd-watch-flexy ytd-watch-metadata #owner ytd-channel-name a[href]') ||
      document.querySelector('ytd-watch-flexy ytd-video-owner-renderer ytd-channel-name a[href]') ||
      document.querySelector('ytd-watch-metadata #owner ytd-channel-name a[href]');

    let channelName = '';
    let handle = '';
    let channelId = '';

    if (ownerLink) {
      const href = ownerLink.getAttribute('href') || '';
      const handleMatch = href.match(/\\/(@[^/?#]+)/);
      if (handleMatch) handle = handleMatch[1].toLowerCase();
      const chMatch = href.match(/\\/channel\\/(UC[^/?#]+)/);
      if (chMatch) channelId = chMatch[1];
      channelName = (ownerLink.textContent || '').trim();
    }

    if (!channelId && flexy) {
      const metaCh = flexy.querySelector('meta[itemprop="channelId"]');
      if (metaCh) channelId = metaCh.getAttribute('content') || '';
    }

    if (!channelName && flexy) {
      const authorMeta = flexy.querySelector('span[itemprop="author"] link[itemprop="name"]');
      if (authorMeta) channelName = authorMeta.getAttribute('content') || '';
    }

    if (!videoId || (!channelName && !handle && !channelId)) {
      return null;
    }

    return {
      videoId,
      channelId,
      channelName: channelName || handle,
      handle,
      isAd: false,
      hasPlaylist: new URLSearchParams(location.search).has('list'),
    };
  }

  function findMatchingRule(meta) {
    if (!meta) return null;
    const chId = meta.channelId || '';
    const handle = normalizeText(meta.handle);
    const name = normalizeText(meta.channelName);

    return (
      state.rules.find((r) => chId && r.channelId && r.channelId === chId) ||
      state.rules.find((r) => handle && normalizeText(r.handle) === handle) ||
      state.rules.find((r) => name && normalizeText(r.channelName) === name) ||
      null
    );
  }

  function resolveSpeedForRule(rule) {
    if (!rule) return Number(state.settings.defaultSpeed) || 1.0;
    if (rule.presetId === 'custom') return Number(rule.customSpeed) || 1.0;
    const preset = state.presets.find((p) => p.id === rule.presetId);
    return preset ? Number(preset.speed) : Number(rule.customSpeed) || 1.0;
  }

  function getBaselineSpeedForChannel(meta) {
    if (!state.settings.enabled || !state.settings.perChannelSpeedEnabled) {
      return 1.0;
    }
    const rule = findMatchingRule(meta);
    return resolveSpeedForRule(rule);
  }

  function hasActiveSessionOverride(videoId) {
    return Boolean(
      videoId &&
        sessionOverride.videoId === videoId &&
        typeof sessionOverride.speed === 'number'
    );
  }

  function getWatchPlayerElement() {
    return (
      document.querySelector('ytd-watch-flexy #movie_player') ||
      document.querySelector('#ytd-player #movie_player') ||
      document.getElementById('movie_player')
    );
  }

  function isCurrentAdActive() {
    if (!isWatchLocation()) return false;
    if (remainingState.isAd || (currentChannel && currentChannel.isAd)) return true;
    const player = getWatchPlayerElement();
    return Boolean(
      player &&
        player.classList &&
        (player.classList.contains('ad-showing') ||
          player.classList.contains('ad-interrupting'))
    );
  }

  function clearSessionOverrideIfMatchesBaseline(meta) {
    if (!meta || meta.isAd || isCurrentAdActive() || !hasActiveSessionOverride(meta.videoId)) {
      return false;
    }
    const baseline = getBaselineSpeedForChannel(meta);
    if (Math.abs(sessionOverride.speed - baseline) < 0.015) {
      sessionOverride = { videoId: null, speed: null };
      return true;
    }
    return false;
  }

  function isDomLiveHeadFallback() {
    if (!isWatchLocation()) return false;
    const player = getWatchPlayerElement();
    if (!player || !player.classList) {
      return false;
    }
    if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
      return false;
    }
    if (
      !player.classList.contains('ytp-live') &&
      !player.classList.contains('ytp-live-mode') &&
      !player.querySelector('.ytp-chrome-bottom .ytp-time-display.ytp-live, .ytp-time-display.ytp-live')
    ) {
      return false;
    }
    const video =
      player.querySelector('video.html5-main-video') ||
      document.querySelector('ytd-watch-flexy video.html5-main-video');
    if (video && video.paused) return false;

    const curTimeEl = player.querySelector('.ytp-time-display .ytp-time-current');
    if (curTimeEl) {
      const rawTxt = (curTimeEl.textContent || '').trim();
      if (/^[-−]\\s*\\d+:\\d{2}/.test(rawTxt)) {
        return false;
      }
    }
    const badge = player.querySelector('.ytp-chrome-bottom .ytp-live-badge, .ytp-live-badge');
    if (badge instanceof HTMLElement && !badge.hasAttribute('hidden') && badge.offsetParent !== null) {
      return Boolean(
        badge.classList.contains('ytp-live-badge-is-livehead') ||
          badge.classList.contains('ytp-livehead') ||
          badge.disabled === true ||
          badge.hasAttribute('disabled') ||
          badge.getAttribute('aria-disabled') === 'true'
      );
    }
    return false;
  }

  function isLiveAtHeadForChannel(meta) {
    if (remainingState.isLive) {
      if (!remainingState.isAtLiveHead) return false;
      if (meta && meta.videoId && remainingState.videoId && meta.videoId !== remainingState.videoId) {
        return false;
      }
      return true;
    }
    if (remainingState.hidden || isAnyLiveStreamActive()) {
      return isDomLiveHeadFallback();
    }
    return false;
  }

  function isAnyLiveStreamActive() {
    if (remainingState.isLive) return true;
    const player = getWatchPlayerElement();
    if (!player) return false;
    if (
      player.classList &&
      (player.classList.contains('ytp-live') || player.classList.contains('ytp-live-mode'))
    ) {
      return true;
    }
    const liveTime = player.querySelector(
      '.ytp-chrome-bottom .ytp-time-display.ytp-live, .ytp-time-display.ytp-live'
    );
    if (liveTime) return true;
    const liveBadge = player.querySelector('.ytp-chrome-bottom .ytp-live-badge, .ytp-live-badge');
    if (
      liveBadge instanceof HTMLElement &&
      !liveBadge.hasAttribute('hidden') &&
      liveBadge.offsetParent !== null
    ) {
      return true;
    }
    const video = player.querySelector('video.html5-main-video');
    if (video && video.duration === Infinity) return true;
    return false;
  }

  function getConfiguredSpeedForChannel(meta) {
    if (!state.settings.enabled) return 1.0;
    clearSessionOverrideIfMatchesBaseline(meta);
    if (meta && hasActiveSessionOverride(meta.videoId)) {
      return sessionOverride.speed;
    }
    return getBaselineSpeedForChannel(meta);
  }

  function getEffectiveSpeedForChannel(meta) {
    const configured = getConfiguredSpeedForChannel(meta);
    if (isLiveAtHeadForChannel(meta) && configured > 1.01) {
      return 1.0;
    }
    if (
      remainingState.isLive &&
      remainingState.isDvrSupported === false &&
      configured < 0.99 &&
      meta &&
      nonDvrClampedVideoId === meta.videoId &&
      !hasActiveSessionOverride(meta.videoId)
    ) {
      return 1.0;
    }
    return configured;
  }

  function computeDurationSlotModel() {
    if (!currentChannel || isCurrentAdActive() || remainingState.hidden) {
      return { visible: false, mode: 'hidden', text: '', title: '', clickable: false };
    }
    if (
      remainingState.videoId &&
      currentChannel.videoId &&
      remainingState.videoId !== currentChannel.videoId
    ) {
      return { visible: false, mode: 'hidden', text: '', title: '', clickable: false };
    }

    if (remainingState.isLive) {
      const effectiveSpeed = getEffectiveSpeedForChannel(currentChannel);
      const liveRate = state.settings.enabled
        ? effectiveSpeed
        : typeof remainingState.playbackRate === 'number' && remainingState.playbackRate > 0
          ? remainingState.playbackRate
          : 1.0;

      if (remainingState.isDvrSupported === false && liveRate < 0.99) {
        return {
          visible: true,
          mode: 'live-nodvr-slow',
          text: 'Rewind unavailable on this live stream',
          title:
            'Rewind unavailable on this live stream — slowed playback continues until the stream catches up and resets to 1.0× (click to return to 1.0× now)',
          clickable: true,
        };
      }

      if (remainingState.isAtLiveHead) {
        return {
          visible: true,
          mode: 'live-head',
          text: 'Live',
          title: 'Live broadcast · Synced at live edge',
          clickable: false,
        };
      }

      const lagSec = Math.max(1, Number(remainingState.dvrLagSec) || 0);
      const lagLabel = formatCompactDuration(lagSec);

      if (!remainingState.isPaused && liveRate > 1.02) {
        const catchUpSec = Math.max(1, Math.round(lagSec / (liveRate - 1.0)));
        const catchUpLabel = formatCompactDuration(catchUpSec);
        return {
          visible: true,
          mode: 'live-catchup',
          text: \`−\${lagLabel} · Live in \${catchUpLabel} @ \${formatDisplaySpeed(liveRate)}×\`,
          title: \`Catching up at \${formatDisplaySpeed(liveRate)}× · Click to jump to live edge\`,
          clickable: true,
        };
      }

      return {
        visible: true,
        mode: 'live-behind',
        text: \`\${lagLabel} behind Live\`,
        title: 'Behind live · Increase speed above 1× to catch up, or click to jump to live edge',
        clickable: true,
      };
    }

    if (typeof remainingState.rawRemainingSec !== 'number') {
      return { visible: false, mode: 'hidden', text: '', title: '', clickable: false };
    }

    const effectiveSpeed = getEffectiveSpeedForChannel(currentChannel);
    const vodText = formatRemainingReadout(remainingState.rawRemainingSec, effectiveSpeed);
    if (!vodText) {
      return { visible: false, mode: 'hidden', text: '', title: '', clickable: false };
    }

    return {
      visible: true,
      mode: 'vod',
      text: vodText,
      title: 'Real wall-clock time remaining at active playback speed',
      clickable: false,
    };
  }

  function computeSavedTimeModel() {
    // Strictly VOD-only: never show on any Live Stream (neither Live End nor Live DVR) or during Ads
    if (
      !currentChannel ||
      isCurrentAdActive() ||
      remainingState.hidden ||
      remainingState.isLive ||
      isAnyLiveStreamActive()
    ) {
      return { visible: false, tone: 'neutral', text: '', title: '' };
    }
    if (
      remainingState.videoId &&
      currentChannel.videoId &&
      remainingState.videoId !== currentChannel.videoId
    ) {
      return { visible: false, tone: 'neutral', text: '', title: '' };
    }

    const effectiveSpeed = Math.max(0.25, getEffectiveSpeedForChannel(currentChannel) || 1.0);

    // If bridge passed precomputed savedTimeModel and rate matches current effective speed, use it directly
    if (
      remainingState.savedTimeModel &&
      remainingState.savedTimeModel.visible !== undefined &&
      (remainingState.playbackRate === null || Math.abs(remainingState.playbackRate - effectiveSpeed) < 0.02)
    ) {
      return remainingState.savedTimeModel;
    }

    const durationSec =
      typeof remainingState.rawDurationSec === 'number' &&
      Number.isFinite(remainingState.rawDurationSec) &&
      remainingState.rawDurationSec > 0
        ? remainingState.rawDurationSec
        : null;

    if (durationSec === null || durationSec < 5) {
      return remainingState.savedTimeModel || { visible: false, tone: 'neutral', text: '', title: '' };
    }

    if (effectiveSpeed < 0.99) {
      const realTotalSec = Math.round(durationSec / effectiveSpeed);
      const diffSec = realTotalSec - durationSec;
      return {
        visible: true,
        tone: 'slower',
        text: \`+\${formatExactMinutesSeconds(diffSec)}\`,
        title: \`Adds \${formatExactMinutesSeconds(diffSec)} to total video duration at \${formatDisplaySpeed(effectiveSpeed)}×\`,
      };
    }

    const banked = Math.max(0, Number(remainingState.bankedSavedSec) || 0);
    const rawRem =
      typeof remainingState.rawRemainingSec === 'number' &&
      Number.isFinite(remainingState.rawRemainingSec)
        ? remainingState.rawRemainingSec
        : durationSec;
    const remainingProjected =
      effectiveSpeed > 1.005 ? Math.round((rawRem * (effectiveSpeed - 1.0)) / effectiveSpeed) : 0;
    const totalSaved = Math.round(banked + remainingProjected);

    if (totalSaved < 3) {
      return {
        visible: true,
        tone: 'neutral',
        text: '0s saved',
        title: 'Increase playback speed to unlock Cadence time savings',
      };
    }

    return {
      visible: true,
      tone: 'saved',
      text: \`Saves \${formatExactMinutesSeconds(totalSaved)}\`,
      title:
        'Total potential wall-clock time saved based on previous playback acceleration and potential savings at current playback setting',
    };
  }

  function syncRow1BrandCollapse(bar) {
    if (!bar) return;
    const rowTop = bar.querySelector('.cadence-row-top');
    const leftEl = bar.querySelector('.cadence-row-top-left');
    const brandBtn = bar.querySelector('.cadence-brand-btn');
    const sizerEl = bar.querySelector('.cadence-brand-sizer');
    if (!rowTop || !leftEl || !brandBtn) return;

    const availableWidth = rowTop.clientWidth;
    if (availableWidth <= 0) return;

    const leftWidth = Math.ceil(leftEl.getBoundingClientRect().width);
    const fullBrandWidth = Math.ceil(
      (sizerEl && sizerEl.getBoundingClientRect().width) || 206
    );
    const shouldCollapse = leftWidth + fullBrandWidth + 16 > availableWidth;
    brandBtn.classList.toggle('is-tagline-collapsed', shouldCollapse);
  }

  function syncRow3SavedReadoutCollapse(bar) {
    if (!bar) return;
    const rowBot = bar.querySelector('.cadence-row-bot');
    const fineGroup = bar.querySelector('.cadence-fine-group');
    const ruleSlot = bar.querySelector('.cadence-rule-slot');
    const globalWrap = bar.querySelector('.cadence-bar-global-saved-wrap');
    const globalSizer = bar.querySelector('.cadence-global-saved-sizer');
    if (!rowBot || !fineGroup || !ruleSlot) return;

    const model = computeGlobalBarSavedModel();
    if (!model.visible || !globalWrap) {
      rowBot.classList.remove('is-global-saved-hidden');
      return;
    }

    const availableWidth = rowBot.clientWidth;
    if (availableWidth <= 0) return;

    const leftWidth = Math.ceil(fineGroup.getBoundingClientRect().width);
    const ruleWidth = Math.ceil(ruleSlot.getBoundingClientRect().width);
    const sizerWidth = Math.ceil(
      (globalSizer && globalSizer.getBoundingClientRect().width) || 110
    );
    const shouldHide = leftWidth + ruleWidth + sizerWidth + 24 > availableWidth;
    rowBot.classList.toggle('is-global-saved-hidden', shouldHide);
  }

  function ensureBarResizeObserver(bar) {
    disconnectBarResizeObserver();
    if (!bar || typeof ResizeObserver === 'undefined') return;
    barResizeObserver = new ResizeObserver(() => {
      syncRow1BrandCollapse(bar);
      syncRow3SavedReadoutCollapse(bar);
    });
    barResizeObserver.observe(bar);
    const rowTop = bar.querySelector('.cadence-row-top');
    const leftEl = bar.querySelector('.cadence-row-top-left');
    const rowBot = bar.querySelector('.cadence-row-bot');
    const fineGroup = bar.querySelector('.cadence-fine-group');
    const ruleSlot = bar.querySelector('.cadence-rule-slot');
    if (rowTop) barResizeObserver.observe(rowTop);
    if (leftEl) barResizeObserver.observe(leftEl);
    if (rowBot) barResizeObserver.observe(rowBot);
    if (fineGroup) barResizeObserver.observe(fineGroup);
    if (ruleSlot) barResizeObserver.observe(ruleSlot);
  }

  function applyDurationModelToBar(bar, model) {
    if (!bar) return;
    const wrapEl = bar.querySelector('.cadence-remaining-wrap');
    const slotBtn = bar.querySelector('.cadence-remaining-slot');
    const dotEl = bar.querySelector('.cadence-live-dot');
    const warnIconEl = bar.querySelector('.cadence-remaining-warn-icon');
    const sizerEl = bar.querySelector('.cadence-remaining-sizer');
    const timeEl = bar.querySelector('.cadence-remaining-time');
    if (!wrapEl || !slotBtn || !dotEl || !timeEl) return;

    if (!model.visible || !model.text) {
      if (wrapEl.style.display !== 'none') {
        wrapEl.style.display = 'none';
      }
      return;
    }

    if (wrapEl.style.display !== 'inline-flex') {
      wrapEl.style.display = 'inline-flex';
    }
    const nextSizer =
      model.mode === 'live-nodvr-slow' ? model.text : buildDurationSizerText(model.text);
    if (sizerEl && sizerEl.textContent !== nextSizer) {
      sizerEl.textContent = nextSizer;
    }
    if (timeEl.textContent !== model.text) {
      timeEl.textContent = model.text;
    }
    const prevSlotMode = slotBtn.getAttribute('data-slot-mode') || '';
    slotBtn.setAttribute('data-slot-mode', model.mode || '');
    const nextTitle = model.title || '';
    if (slotBtn.title !== nextTitle) {
      const isHoveredSameMode =
        prevSlotMode === model.mode &&
        typeof slotBtn.matches === 'function' &&
        slotBtn.matches(':hover');
      if (isHoveredSameMode) {
        slotBtn.setAttribute('data-pending-title', nextTitle);
      } else {
        slotBtn.removeAttribute('data-pending-title');
        slotBtn.title = nextTitle;
      }
    } else {
      slotBtn.removeAttribute('data-pending-title');
    }
    const shouldDisable = !model.clickable;
    if (slotBtn.disabled !== shouldDisable) {
      slotBtn.disabled = shouldDisable;
    }
    slotBtn.classList.toggle('is-clickable', Boolean(model.clickable));
    slotBtn.classList.toggle('is-live-head', model.mode === 'live-head');
    slotBtn.classList.toggle('is-nodvr-warning', model.mode === 'live-nodvr-slow');

    if (warnIconEl) {
      const wantWarnIcon = model.mode === 'live-nodvr-slow';
      const expectedDisplay = wantWarnIcon ? 'inline-flex' : 'none';
      if (warnIconEl.style.display !== expectedDisplay) {
        warnIconEl.style.display = expectedDisplay;
      }
    }

    if (model.mode === 'live-head') {
      if (dotEl.style.display !== 'inline-block') dotEl.style.display = 'inline-block';
      if (dotEl.className !== 'cadence-live-dot is-head') {
        dotEl.className = 'cadence-live-dot is-head';
      }
    } else if (model.mode === 'live-catchup' || model.mode === 'live-behind') {
      if (dotEl.style.display !== 'inline-block') dotEl.style.display = 'inline-block';
      if (dotEl.className !== 'cadence-live-dot is-behind') {
        dotEl.className = 'cadence-live-dot is-behind';
      }
    } else {
      if (dotEl.style.display !== 'none') dotEl.style.display = 'none';
      if (dotEl.className !== 'cadence-live-dot') {
        dotEl.className = 'cadence-live-dot';
      }
    }
  }

  function applySavedTimeModelToBar(bar, savedModel) {
    if (!bar) return;
    const savedEl = bar.querySelector('.cadence-saved-time');
    if (!savedEl) return;

    if (!savedModel || !savedModel.visible || !savedModel.text) {
      if (savedEl.style.display !== 'none') {
        savedEl.style.display = 'none';
      }
      return;
    }

    if (savedEl.style.display !== 'inline-block') {
      savedEl.style.display = 'inline-block';
    }
    if (savedEl.textContent !== savedModel.text) {
      savedEl.textContent = savedModel.text;
    }
    const nextTitle = savedModel.title || '';
    if (savedEl.title !== nextTitle) {
      savedEl.title = nextTitle;
    }
    savedEl.classList.toggle('is-saved', savedModel.tone === 'saved');
    savedEl.classList.toggle('is-slower', savedModel.tone === 'slower');
  }

  function applyGlobalSavedTimeToBar(bar) {
    if (!bar) return;
    const globalWrap = bar.querySelector('.cadence-bar-global-saved-wrap');
    const globalEl = bar.querySelector('.cadence-bar-global-saved');
    const globalSizer = bar.querySelector('.cadence-global-saved-sizer');
    if (!globalWrap || !globalEl) return;

    const model = computeGlobalBarSavedModel();
    if (!model.visible || !model.text) {
      if (globalWrap.style.display !== 'none') {
        globalWrap.style.display = 'none';
      }
      syncRow3SavedReadoutCollapse(bar);
      return;
    }

    if (globalWrap.style.display !== 'inline-flex') {
      globalWrap.style.display = 'inline-flex';
    }
    if (globalEl.textContent !== model.text) {
      globalEl.textContent = model.text;
    }
    if (globalSizer && globalSizer.textContent !== model.text) {
      globalSizer.textContent = model.text;
    }
    if (globalEl.title !== (model.title || '')) {
      globalEl.title = model.title || '';
    }
    syncRow3SavedReadoutCollapse(bar);
  }

  function computeBarUiModeSignature() {
    if (!currentChannel) return 'none';
    const adActive = isCurrentAdActive();
    const liveStreamActive = !adActive && (remainingState.isLive || isAnyLiveStreamActive());
    const liveAtHead = !adActive && isLiveAtHeadForChannel(currentChannel);
    const dvrUnsupported =
      !adActive && Boolean(remainingState.isLive && remainingState.isDvrSupported === false);
    const isSessionActive = hasActiveSessionOverride(currentChannel.videoId);
    const matchedRule = findMatchingRule(currentChannel);
    const effectiveSpeed = getEffectiveSpeedForChannel(currentChannel);
    const displayedBarRate = adActive ? 1.0 : effectiveSpeed;
    const durMode = adActive ? 'ad' : computeDurationSlotModel().mode;
    return [
      adActive ? 'ad' : liveStreamActive ? (liveAtHead ? 'live-head' : 'live-dvr') : 'vod',
      dvrUnsupported ? 'nodvr' : 'dvr',
      durMode,
      formatCompactSpeed(displayedBarRate),
      liveStreamActive ? 'streaming' : isSessionActive ? 'session' : matchedRule ? 'rule' : 'default',
    ].join('|');
  }

  function updateRemainingReadoutInPlace() {
    const bar = document.getElementById('cadence-watch-bar');
    if (!bar) {
      if (
        isWatchLocation() &&
        state.settings.enabled &&
        state.settings.showInPageControlBar &&
        currentChannel
      ) {
        renderInPageBar();
      }
      return;
    }
    if (bar.getAttribute('data-bar-ui-mode') !== computeBarUiModeSignature()) {
      renderInPageBar();
      return;
    }
    applyDurationModelToBar(bar, computeDurationSlotModel());
    applySavedTimeModelToBar(bar, computeSavedTimeModel());
    applyGlobalSavedTimeToBar(bar);
    syncRow1BrandCollapse(bar);
  }

  function pushConfigToBridge(targetSpeed, showOnBadge = true) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    activeSpeed = clampSpeed(targetSpeed);
    const hasSession = Boolean(
      currentChannel && hasActiveSessionOverride(currentChannel.videoId)
    );
    postToBridge('CONFIG_UPDATE', {
      enabled: state.settings.enabled,
      perChannelSpeedEnabled: state.settings.perChannelSpeedEnabled,
      convertShortsToWatch: state.settings.convertShortsToWatch !== false,
      disableVideoPreviews: state.settings.disableVideoPreviews !== false,
      showWatchLaterRemoveAction: state.settings.showWatchLaterRemoveAction !== false,
      hasSessionOverride: hasSession,
      stopAfterVideoEnds: state.settings.stopAfterVideoEnds,
      defaultSpeed: Number(state.settings.defaultSpeed) || 1.0,
      targetSpeed: activeSpeed,
    });
    safeSendMessage({
      type: 'CADENCE_UPDATE_BADGE',
      enabled:
        showOnBadge &&
        isWatchLocation() &&
        Boolean(
          state.settings.enabled && (state.settings.perChannelSpeedEnabled || hasSession)
        ),
      speed: showOnBadge && isWatchLocation() ? activeSpeed : null,
    });
  }

  function positionBarToast() {
    const toastEl = document.getElementById('cadence-bar-toast');
    const bar = document.getElementById('cadence-watch-bar');
    if (!toastEl || !bar || !isWatchLocation()) {
      if (toastEl) toastEl.classList.remove('cadence-visible');
      return false;
    }
    const barRect = bar.getBoundingClientRect();
    if (barRect.width === 0 && barRect.height === 0) {
      toastEl.classList.remove('cadence-visible');
      return false;
    }
    const anchorRect = barRect;
    const toastWidth = toastEl.offsetWidth || 214;
    const toastHeight = toastEl.offsetHeight || 28;
    const viewportW = window.innerWidth || document.documentElement.clientWidth || 1024;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 768;

    if (barRect.bottom < 48 || barRect.top > viewportH - 12) {
      toastEl.classList.remove('cadence-visible');
      return false;
    }

    const centeredLeft = anchorRect.left + anchorRect.width / 2 - toastWidth / 2;
    const clampedLeft = Math.round(
      Math.max(12, Math.min(viewportW - toastWidth - 12, centeredLeft))
    );
    let targetTop = Math.round(barRect.top - toastHeight - 7);
    if (targetTop < 62) {
      targetTop = Math.round(barRect.bottom + 7);
    }

    toastEl.style.left = \`\${clampedLeft}px\`;
    toastEl.style.top = \`\${targetTop}px\`;
    return true;
  }

  function showBarToast(label, durationMs = 2400, reason = 'live') {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    if (!state.settings.enabled || !state.settings.showInPageControlBar) return;
    if (!document.body) return;

    let toastEl = document.getElementById('cadence-bar-toast');
    if (toastEl && toastEl.getAttribute('data-cadence-instance') !== INSTANCE_TOKEN) {
      toastEl.remove();
      toastEl = null;
    }
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'cadence-bar-toast';
      toastEl.className = 'cadence-bar-toast';
      toastEl.setAttribute('data-cadence-instance', INSTANCE_TOKEN);
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }

    toastEl.innerHTML = \`\${WARNING_ICON_SVG}<span class="cadence-bar-toast-text"></span>\`;
    const textSpan = toastEl.querySelector('.cadence-bar-toast-text');
    if (textSpan) textSpan.textContent = label;

    barToastVisible = true;
    barToastReason = reason;
    const positioned = positionBarToast();
    if (positioned) {
      toastEl.classList.add('cadence-visible');
    }

    clearTimeout(barToastTimeout);
    barToastTimeout = setTimeout(() => {
      barToastVisible = false;
      barToastReason = null;
      toastEl.classList.remove('cadence-visible');
    }, durationMs);
  }

  window.addEventListener(
    'scroll',
    () => {
      if (barToastVisible) {
        const ok = positionBarToast();
        const toastEl = document.getElementById('cadence-bar-toast');
        if (ok && toastEl) toastEl.classList.add('cadence-visible');
      }
    },
    { capture: true, passive: true, signal: lifecycleSignal }
  );

  window.addEventListener(
    'resize',
    () => {
      if (barToastVisible) {
        positionBarToast();
      }
      const bar = document.getElementById('cadence-watch-bar');
      if (bar) syncRow1BrandCollapse(bar);
    },
    { passive: true, signal: lifecycleSignal }
  );

  function showPlayerToast(label, forceShow = false, isWarning = false) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    if (!state.settings.enabled || (!forceShow && !state.settings.showSpeedToast)) return;
    const player = getWatchPlayerElement();
    if (!player) return;

    let toast = player.querySelector('.cadence-player-toast');
    if (toast && toast.getAttribute('data-cadence-instance') !== INSTANCE_TOKEN) {
      toast.remove();
      toast = null;
    }
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'cadence-player-toast';
      toast.setAttribute('data-cadence-instance', INSTANCE_TOKEN);
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      player.appendChild(toast);
    }
    toast.classList.toggle('is-warning', Boolean(isWarning));
    if (isWarning) {
      toast.innerHTML = \`\${WARNING_ICON_SVG}<span></span>\`;
      const span = toast.querySelector('span');
      if (span) span.textContent = label;
    } else {
      toast.textContent = label;
    }
    toast.classList.add('cadence-visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(
      () => {
        toast.classList.remove('cadence-visible');
      },
      isWarning ? 2400 : 1800
    );
  }

  function syncStoppedBannerWatchLaterUi(banner) {
    if (!banner) return;
    const wlBtn = banner.querySelector('.cadence-wl-btn');
    if (!wlBtn) return;

    const featureEnabled = !state.settings || state.settings.showWatchLaterRemoveAction !== false;
    const status = featureEnabled ? watchLaterState.status : 'idle';

    wlBtn.classList.remove('is-removing', 'is-removed', 'is-error');
    if (status === 'idle') {
      wlBtn.hidden = true;
      wlBtn.disabled = false;
      return;
    }

    wlBtn.hidden = false;
    if (status === 'removing') {
      wlBtn.disabled = true;
      wlBtn.classList.add('is-removing');
      wlBtn.innerHTML = \`\${WL_REMOVE_ICON_SVG}<span>Removing…</span>\`;
      wlBtn.title = 'Removing video from Watch Later playlist';
    } else if (status === 'removed') {
      wlBtn.disabled = true;
      wlBtn.classList.add('is-removed');
      wlBtn.innerHTML = \`\${CHECK_ICON_SVG}<span>Removed from Watch Later</span>\`;
      wlBtn.title = 'Removed from your Watch Later playlist';
    } else if (status === 'error') {
      wlBtn.disabled = false;
      wlBtn.classList.add('is-error');
      wlBtn.innerHTML = \`\${WL_REMOVE_ICON_SVG}<span>Retry Remove</span>\`;
      wlBtn.title = 'Could not remove from Watch Later — click to retry';
    } else {
      wlBtn.disabled = false;
      wlBtn.innerHTML = \`\${WL_REMOVE_ICON_SVG}<span>Remove from Watch Later</span>\`;
      wlBtn.title = 'Remove this video from your Watch Later playlist';
    }
  }

  function showStoppedBanner(hasPlaylist, videoId = null) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    const player = getWatchPlayerElement();
    if (!player) return;
    const resolvedVideoId = videoId || (currentChannel && currentChannel.videoId) || stoppedBannerVideoId || null;
    if (resolvedVideoId) {
      stoppedBannerVideoId = resolvedVideoId;
      if (watchLaterState.videoId !== resolvedVideoId) {
        watchLaterState = { videoId: resolvedVideoId, status: 'idle' };
      }
    }

    let banner = player.querySelector('.cadence-stopped-banner');
    if (banner && banner.getAttribute('data-cadence-instance') !== INSTANCE_TOKEN) {
      banner.remove();
      banner = null;
    }
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'cadence-stopped-banner';
      banner.setAttribute('data-cadence-instance', INSTANCE_TOKEN);
      banner.innerHTML = \`
        <span class="cadence-stopped-text"></span>
        <div class="cadence-stopped-actions">
          <button type="button" class="cadence-btn cadence-replay-btn">Replay</button>
          <button type="button" class="cadence-btn cadence-play-next-btn">Play Next</button>
          <button type="button" class="cadence-btn cadence-home-btn" title="Go to YouTube Home">\${HOME_ICON_SVG}<span>YouTube Home</span></button>
          <button type="button" class="cadence-btn cadence-wl-btn" hidden></button>
          <button type="button" class="cadence-btn cadence-dismiss-btn" aria-label="Dismiss" title="Dismiss">\${CLOSE_ICON_SVG}</button>
        </div>
      \`;
      banner.querySelector('.cadence-replay-btn').addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          bannerProtectedUntil = 0;
          banner.classList.remove('cadence-visible');
          postToBridge('COMMAND', { action: 'REPLAY_VIDEO' });
        },
        { signal: lifecycleSignal }
      );
      banner.querySelector('.cadence-play-next-btn').addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          bannerProtectedUntil = 0;
          banner.classList.remove('cadence-visible');
          postToBridge('COMMAND', { action: 'PLAY_NEXT_MANUAL' });
        },
        { signal: lifecycleSignal }
      );
      banner.querySelector('.cadence-home-btn').addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          bannerProtectedUntil = 0;
          banner.classList.remove('cadence-visible');
          postToBridge('COMMAND', { action: 'GO_TO_YOUTUBE_HOME' });
        },
        { signal: lifecycleSignal }
      );
      banner.querySelector('.cadence-wl-btn').addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (watchLaterState.status === 'removing' || watchLaterState.status === 'removed') {
            return;
          }
          const targetVid =
            stoppedBannerVideoId ||
            (currentChannel && currentChannel.videoId) ||
            watchLaterState.videoId ||
            '';
          if (!targetVid) return;
          watchLaterState = { videoId: targetVid, status: 'removing' };
          syncStoppedBannerWatchLaterUi(banner);
          postToBridge('COMMAND', {
            action: 'REMOVE_FROM_WATCH_LATER',
            videoId: targetVid,
          });
        },
        { signal: lifecycleSignal }
      );
      banner.querySelector('.cadence-dismiss-btn').addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          bannerProtectedUntil = 0;
          banner.classList.remove('cadence-visible');
        },
        { signal: lifecycleSignal }
      );
      player.appendChild(banner);
    }

    const textEl = banner.querySelector('.cadence-stopped-text');
    const baseMsg = hasPlaylist
      ? 'Cadence stopped playback · Playlist auto-advance prevented'
      : 'Cadence stopped playback · Autoplay prevented';
    if (typeof remainingState.bankedSavedSec === 'number' && remainingState.bankedSavedSec >= 1) {
      textEl.innerHTML = \`<span>\${baseMsg} · </span><strong class="cadence-stopped-saved">You saved \${formatExactMinutesSeconds(remainingState.bankedSavedSec)} with Cadence!</strong>\`;
    } else {
      textEl.textContent = baseMsg;
    }
    syncStoppedBannerWatchLaterUi(banner);
    bannerProtectedUntil = Date.now() + 900;
    banner.classList.add('cadence-visible');
  }

  async function saveChannelSpeed(meta, speed, presetId = 'custom') {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return false;
    }
    if (!meta || !meta.channelName) return false;
    const cleanSpeed = clampSpeed(speed);
    const matchedPreset =
      presetId !== 'custom'
        ? state.presets.find((p) => p.id === presetId)
        : state.presets.find((p) => Math.abs(Number(p.speed) - cleanSpeed) < 0.01);
    const resolvedPresetId = matchedPreset ? matchedPreset.id : presetId;

    const existingIdx = state.rules.findIndex(
      (r) =>
        (meta.channelId && r.channelId && r.channelId === meta.channelId) ||
        (meta.handle && normalizeText(r.handle) === normalizeText(meta.handle)) ||
        normalizeText(r.channelName) === normalizeText(meta.channelName)
    );

    const updatedRule = {
      id: existingIdx >= 0 ? state.rules[existingIdx].id : 'rule-' + Date.now(),
      channelName: meta.channelName,
      handle: meta.handle || '@' + meta.channelName.toLowerCase().replace(/\\s+/g, ''),
      channelId: meta.channelId || '',
      presetId: resolvedPresetId,
      customSpeed: cleanSpeed,
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    const nextRules = [...state.rules];
    if (existingIdx >= 0) {
      nextRules[existingIdx] = updatedRule;
    } else {
      nextRules.unshift(updatedRule);
    }
    state.rules = nextRules;
    const saved = await safeStorageSet({ rules: nextRules });
    if (saved) {
      renderInPageBar();
    }
    return saved;
  }

  async function clearChannelRule(meta) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return false;
    }
    const matched = findMatchingRule(meta);
    if (!matched) return false;

    const nextRules = state.rules.filter((r) => r.id !== matched.id);
    state.rules = nextRules;
    sessionOverride = { videoId: null, speed: null };
    const saved = await safeStorageSet({ rules: nextRules });
    if (saved && currentChannel) {
      const fallbackSpeed = getEffectiveSpeedForChannel(currentChannel);
      remainingState.playbackRate = fallbackSpeed;
      pushConfigToBridge(fallbackSpeed, true);
      postToBridge('COMMAND', { action: 'SET_SPEED', speed: fallbackSpeed });
      renderInPageBar();
      showPlayerToast(
        \`Cleared Rule · Default \${formatDisplaySpeed(fallbackSpeed)}×\`
      );
    }
    return saved;
  }

  function applySeekFromBar(deltaSec) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    const delta = Number(deltaSec) || 0;
    if (!delta) return;

    if (isCurrentAdActive()) {
      renderInPageBar();
      showBarToast('Skip locked during ad', 2400, 'ad');
      showPlayerToast('Skip locked during ad', true, true);
      return;
    }

    if (!currentChannel) {
      currentChannel = extractDomChannelFallback();
    }
    const liveAtHead = isLiveAtHeadForChannel(currentChannel);
    if (liveAtHead && delta > 0) {
      renderInPageBar();
      showBarToast('Stream is currently at live end', 2400, 'live');
      showPlayerToast('Stream is currently at live end', true, true);
      return;
    }
    if (remainingState.isLive && remainingState.isDvrSupported === false) {
      renderInPageBar();
      showBarToast('Rewind unavailable on this live stream', 2400, 'live');
      showPlayerToast('Rewind unavailable on this live stream', true, true);
      return;
    }

    hideBarToast();
    if (delta < 0) {
      const existingBanner = document.querySelector('.cadence-stopped-banner');
      if (existingBanner) {
        existingBanner.classList.remove('cadence-visible');
      }
    }

    postToBridge('COMMAND', {
      action: 'SEEK_BY_SECONDS',
      deltaSec: delta,
    });
    showPlayerToast(delta < 0 ? \`Replay \${Math.abs(delta)}s\` : \`Skip +\${delta}s\`);
  }

  function applySessionSpeedFromBar(nextSpeed) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    if (isCurrentAdActive()) {
      renderInPageBar();
      showBarToast('Speed locked during ad', 2400, 'ad');
      showPlayerToast('Speed locked during ad', true, true);
      return;
    }
    if (!currentChannel) {
      currentChannel = extractDomChannelFallback();
    }
    if (!currentChannel || !currentChannel.videoId) return;

    const cleanSpeed = clampSpeed(nextSpeed);
    const liveAtHead = isLiveAtHeadForChannel(currentChannel);

    if (liveAtHead && cleanSpeed > 1.01) {
      sessionOverride = { videoId: null, speed: null };
      remainingState.playbackRate = 1.0;
      pushConfigToBridge(1.0, true);
      postToBridge('COMMAND', { action: 'SET_SPEED', speed: 1.0 });
      renderInPageBar();
      showBarToast('Stream is currently at live end', 2400, 'live');
      showPlayerToast('Stream is currently at live end', true, true);
      return;
    }

    hideBarToast();
    nonDvrClampedVideoId = null;

    if (liveAtHead && Math.abs(cleanSpeed - 1.0) < 0.015) {
      if (remainingState.isLive && remainingState.isDvrSupported === false) {
        nonDvrClampedVideoId = currentChannel.videoId;
      }
      sessionOverride = { videoId: null, speed: null };
      remainingState.playbackRate = 1.0;
      pushConfigToBridge(1.0, true);
      postToBridge('COMMAND', { action: 'SET_SPEED', speed: 1.0, fromUserGesture: true });
      renderInPageBar();
      showPlayerToast('1.0× · Live');
      return;
    }

    const matchedRule = findMatchingRule(currentChannel);
    const baselineSpeed = getBaselineSpeedForChannel(currentChannel);
    const wasOverridden = hasActiveSessionOverride(currentChannel.videoId);

    if (Math.abs(cleanSpeed - baselineSpeed) < 0.015) {
      sessionOverride = {
        videoId: null,
        speed: null,
      };
      const effectiveBaseline = getEffectiveSpeedForChannel(currentChannel);
      remainingState.playbackRate = effectiveBaseline;
      pushConfigToBridge(effectiveBaseline, true);
      postToBridge('COMMAND', {
        action: 'SET_SPEED',
        speed: effectiveBaseline,
        fromUserGesture: true,
      });
      renderInPageBar();
      const baselineLabel = matchedRule ? 'Channel Rule' : 'Default';
      showPlayerToast(
        wasOverridden
          ? \`Restored \${formatDisplaySpeed(effectiveBaseline)}× (\${baselineLabel})\`
          : \`\${formatDisplaySpeed(effectiveBaseline)}× · \${baselineLabel}\`
      );
      return;
    }

    sessionOverride = {
      videoId: currentChannel.videoId,
      speed: cleanSpeed,
    };
    remainingState.playbackRate = cleanSpeed;

    pushConfigToBridge(cleanSpeed, true);
    postToBridge('COMMAND', {
      action: 'SET_SPEED',
      speed: cleanSpeed,
      fromUserGesture: true,
    });
    renderInPageBar();

    const suffix = matchedRule
      ? \`Rule \${formatDisplaySpeed(baselineSpeed)}× unchanged\`
      : 'This video only';
    showPlayerToast(\`Session \${formatDisplaySpeed(cleanSpeed)}× · \${suffix}\`);
  }

  function resetSessionSpeedFromBar() {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    if (isCurrentAdActive()) {
      renderInPageBar();
      showBarToast('Speed locked during ad', 2400, 'ad');
      showPlayerToast('Speed locked during ad', true, true);
      return;
    }
    if (!currentChannel) {
      currentChannel = extractDomChannelFallback();
    }
    if (!currentChannel) return;

    hideBarToast();
    const matchedRule = findMatchingRule(currentChannel);
    sessionOverride = {
      videoId: null,
      speed: null,
    };
    const effectiveResetSpeed = getEffectiveSpeedForChannel(currentChannel);
    remainingState.playbackRate = effectiveResetSpeed;

    pushConfigToBridge(effectiveResetSpeed, true);
    postToBridge('COMMAND', {
      action: 'SET_SPEED',
      speed: effectiveResetSpeed,
      fromUserGesture: true,
    });
    renderInPageBar();
    showPlayerToast(
      \`Reset to \${formatDisplaySpeed(effectiveResetSpeed)}× (\${matchedRule ? 'Channel Rule' : 'Default'})\`
    );
  }

  function scheduleBarMountRetryIfNeeded() {
    if (barMountRetryTimer || barMountAttempts >= 25) return;
    barMountRetryTimer = setTimeout(() => {
      barMountRetryTimer = null;
      barMountAttempts += 1;
      renderInPageBar();
    }, 150);
  }

  function resolveWatchBarMountPoint() {
    const aboveTheFold =
      document.querySelector('ytd-watch-flexy ytd-watch-metadata #above-the-fold') ||
      document.querySelector('ytd-watch-metadata #above-the-fold');
    if (aboveTheFold) {
      const titleEl = aboveTheFold.querySelector(':scope > #title') || aboveTheFold.firstElementChild;
      return { container: aboveTheFold, beforeNode: titleEl || null };
    }
    const watchMetadata =
      document.querySelector('ytd-watch-flexy ytd-watch-metadata') ||
      document.querySelector('ytd-watch-metadata');
    if (watchMetadata) {
      const titleEl = watchMetadata.querySelector('#title') || watchMetadata.firstElementChild;
      return { container: watchMetadata, beforeNode: titleEl || null };
    }
    return null;
  }

  function renderInPageBar() {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }

    try {
      // Clean up any legacy v1.3.5 #cadence-owner-bar element on hot-upgrade
    const legacyOwnerBar = document.getElementById('cadence-owner-bar');
    if (legacyOwnerBar) {
      legacyOwnerBar.remove();
    }

    let existing = document.getElementById('cadence-watch-bar');
    if (existing && existing.getAttribute('data-cadence-instance') !== INSTANCE_TOKEN) {
      existing.remove();
      existing = null;
    }

    if (!isWatchLocation()) {
      clearBarMountRetry();
      hideBarToast(true);
      disconnectBarResizeObserver();
      if (existing) existing.remove();
      return;
    }

    if (!currentChannel) {
      currentChannel = extractDomChannelFallback();
    }
    if (!state.settings.enabled || !state.settings.showInPageControlBar || !currentChannel) {
      clearBarMountRetry();
      hideBarToast(true);
      disconnectBarResizeObserver();
      if (existing) existing.remove();
      return;
    }

    const mountPoint = resolveWatchBarMountPoint();
    if (!mountPoint || !mountPoint.container) {
      scheduleBarMountRetryIfNeeded();
      return;
    }
    clearBarMountRetry();

    const bar = document.createElement('div');
    bar.id = 'cadence-watch-bar';
    bar.className = 'cadence-watch-bar';
    bar.setAttribute('data-cadence-instance', INSTANCE_TOKEN);

    clearSessionOverrideIfMatchesBaseline(currentChannel);
    const adActive = isCurrentAdActive();
    const isLiveStream = !adActive && (remainingState.isLive || isAnyLiveStreamActive());
    const matchedRule = findMatchingRule(currentChannel);
    const ruleResolvedSpeed = matchedRule ? resolveSpeedForRule(matchedRule) : null;
    const baselineSpeed = getBaselineSpeedForChannel(currentChannel);
    const isSessionActive = hasActiveSessionOverride(currentChannel.videoId);
    const effectiveSpeed = getEffectiveSpeedForChannel(currentChannel);
    const liveAtHead = !adActive && isLiveAtHeadForChannel(currentChannel);
    const dvrUnsupported =
      !adActive && Boolean(remainingState.isLive && remainingState.isDvrSupported === false);
    const isLiveRuleClamped =
      !adActive && !isSessionActive && liveAtHead && baselineSpeed > 1.01;
    const isStepUpLiveBlocked = !adActive && liveAtHead && effectiveSpeed + 0.05 > 1.01;
    const liveBlockedTooltip = 'Unavailable while synced at live end — rewind stream to speed up';
    const dvrUnsupportedTooltip = 'Rewind unavailable on this live stream';
    const adBlockedTooltip = 'Speed locked during ad';
    const adSkipBlockedTooltip = 'Skip locked during ad';

    const modePrefix = adActive
      ? 'Sponsored Ad'
      : isLiveStream
        ? 'Streaming'
        : isSessionActive
          ? 'Session Override'
          : matchedRule
            ? 'Channel Rule'
            : 'Default';
    const displayedBarRate = adActive ? 1.0 : effectiveSpeed;
    const tooltip = adActive
      ? isSessionActive
        ? \`Ad playing at 1× · Session \${formatDisplaySpeed(sessionOverride.speed)}× restores automatically after ad\`
        : 'Ad playing at 1× · Controls paused until ad ends'
      : isLiveStream
        ? liveAtHead
          ? matchedRule
            ? \`Live stream broadcast · Active playback is 1.0× at live edge (Channel Rule \${formatDisplaySpeed(ruleResolvedSpeed)}× is preserved for regular videos)\`
            : 'Live stream broadcast · Active playback is 1.0× at live broadcast edge'
          : \`Live stream DVR playback · Active playback is \${formatDisplaySpeed(effectiveSpeed)}×\${matchedRule ? \` (Channel Rule \${formatDisplaySpeed(ruleResolvedSpeed)}× preserved for regular videos)\` : ''}\`
        : isSessionActive
          ? matchedRule
            ? \`Session override for this video only · \${currentChannel.channelName || 'Channel'} rule is \${formatDisplaySpeed(ruleResolvedSpeed)}×\`
            : \`Session override for this video only · Default speed is \${formatDisplaySpeed(baselineSpeed)}×\`
          : isLiveRuleClamped
            ? \`Live stream at live end · Saved \${formatDisplaySpeed(baselineSpeed)}× rule is clamped to 1.0× at live edge\`
            : 'Video-specific playback info. Use Cadence controls to change. Use lower-right interactive buttons to set or update Channel Rules.';

    const durationModel = computeDurationSlotModel();
    const savedTimeModel = computeSavedTimeModel();

    let ruleSlotHtml = '';
    if (!matchedRule) {
      const saveTargetRate = adActive ? baselineSpeed : effectiveSpeed;
      ruleSlotHtml = \`
        <span class="cadence-rule-status">No rule</span>
        <button type="button" data-rule-action="save" class="cadence-rule-action-btn\${adActive ? ' is-ad-blocked' : ''}"\${adActive ? ' aria-disabled="true"' : ''} title="\${adActive ? adBlockedTooltip : \`Save \${formatDisplaySpeed(saveTargetRate)}× as a Rule for \${currentChannel.channelName || 'this channel'}\`}">
          <span class="cadence-rule-plus" aria-hidden="true">+</span>
          <span>Save \${formatDisplaySpeed(saveTargetRate)}× Rule</span>
        </button>
      \`;
    } else if (isSessionActive && !adActive) {
      ruleSlotHtml = \`
        <span class="cadence-rule-status">Channel Rule: \${formatDisplaySpeed(ruleResolvedSpeed)}×</span>
        <button type="button" data-rule-action="update" class="cadence-rule-action-btn is-update" title="\${\`Update \${currentChannel.channelName || 'channel'} Rule from \${formatDisplaySpeed(ruleResolvedSpeed)}× to \${formatDisplaySpeed(effectiveSpeed)}×\`}">
          <span>Update → \${formatDisplaySpeed(effectiveSpeed)}×</span>
        </button>
      \`;
    } else {
      ruleSlotHtml = \`
        <span class="cadence-rule-status">Channel Rule: \${formatDisplaySpeed(ruleResolvedSpeed)}×</span>
        <button type="button" data-rule-action="clear" class="cadence-rule-action-btn\${adActive ? ' is-ad-blocked' : ''}"\${adActive ? ' aria-disabled="true"' : ''} title="\${adActive ? adBlockedTooltip : 'Clear saved Rule and revert to Default speed'}">
          <span>Clear</span>
          <span class="cadence-rule-clear-x" aria-hidden="true">×</span>
        </button>
      \`;
    }

    const quickSpeeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    const replaySteps = [-60, -30, -10];
    const skipSteps = [10, 30, 60];
    const seekBackwardBlocked = adActive || dvrUnsupported;
    const seekForwardBlocked = adActive || liveAtHead || dvrUnsupported;

    bar.setAttribute('data-bar-ui-mode', computeBarUiModeSignature());

    bar.innerHTML = \`
      <span class="cadence-brand-sizer" aria-hidden="true">
        \${CADENCE_EMBLEM_SVG}
        <span class="cadence-brand-name">Cadence</span>
        <span class="cadence-brand-sep"></span>
        <span class="cadence-brand-tagline">YOUTUBE AT YOUR SPEED</span>
      </span>

      <div class="cadence-row-top">
        <div class="cadence-row-top-left">
          <span class="cadence-source-readout \${adActive || isSessionActive ? 'is-highlighted' : ''}" title="\${tooltip}">
            <span>\${modePrefix} ·</span>
            <span class="cadence-rate-grid">
              <span class="cadence-rate-sizer" aria-hidden="true">8.88×</span>
              <strong class="cadence-rate-value">\${formatCompactSpeed(displayedBarRate)}×</strong>
            </span>
          </span>
          \${
            adActive
              ? \`
          <span class="cadence-bar-divider" aria-hidden="true"></span>
          <span class="cadence-ad-paused-note">Controls paused until ad ends</span>
          \`
              : \`
          <span class="cadence-remaining-wrap" style="display:none;">
            <span class="cadence-bar-divider" aria-hidden="true"></span>
            <button type="button" class="cadence-remaining-slot" disabled>
              <span class="cadence-live-dot" aria-hidden="true" style="display:none;"></span>
              <span class="cadence-remaining-warn-icon" aria-hidden="true" style="display:none;">\${WARNING_ICON_SVG}</span>
              <span class="cadence-remaining-time-grid">
                <span class="cadence-remaining-sizer" aria-hidden="true"></span>
                <span class="cadence-remaining-time"></span>
              </span>
            </button>
          </span>
          \`
          }
        </div>

        <button type="button" class="cadence-brand-btn" title="Cadence - YouTube at your speed (Click to open All Cadence Options)">
          \${CADENCE_EMBLEM_SVG}
          <span class="cadence-brand-name">Cadence</span>
          <span class="cadence-brand-sep" aria-hidden="true"></span>
          <span class="cadence-brand-tagline">YOUTUBE AT YOUR SPEED</span>
        </button>
      </div>

      <div class="cadence-row-mid">
        <div class="cadence-bar-buttons">
          \${quickSpeeds
            .map((spd) => {
              const isActive = !adActive && Math.abs(effectiveSpeed - spd) < 0.015;
              const isLiveBlocked = !adActive && liveAtHead && spd > 1.01;
              const isDisabledVisual = adActive || isLiveBlocked;
              const chipClasses = [
                'cadence-speed-chip',
                isActive ? 'active' : '',
                adActive ? 'is-ad-blocked' : isLiveBlocked ? 'is-live-blocked' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const chipTitle = adActive
                ? adBlockedTooltip
                : isLiveBlocked
                  ? liveBlockedTooltip
                  : \`Set \${formatDisplaySpeed(spd)}× for this video session only\`;
              return \`
            <button type="button" data-speed="\${spd}" class="\${chipClasses}"\${isDisabledVisual ? ' aria-disabled="true"' : ''} title="\${chipTitle}">
              \${formatDisplaySpeed(spd)}×
            </button>
          \`;
            })
            .join('')}
        </div>

        <div class="cadence-seek-group">
          <div class="cadence-seek-capsule\${adActive ? ' is-ad-blocked' : dvrUnsupported ? ' is-live-blocked' : ''}">
            <span class="cadence-seek-icon-cell" title="Replay seconds" aria-hidden="true">\${REPLAY_ICON_SVG}</span>
            \${replaySteps
              .map(
                (sec) => \`
              <button type="button" data-seek="\${sec}" class="cadence-seek-btn"\${seekBackwardBlocked ? ' aria-disabled="true"' : ''} title="\${adActive ? adSkipBlockedTooltip : dvrUnsupported ? dvrUnsupportedTooltip : \`Replay \${Math.abs(sec)} seconds\`}">\${Math.abs(sec)}</button>
            \`
              )
              .join('')}
          </div>
          <div class="cadence-seek-capsule\${adActive ? ' is-ad-blocked' : liveAtHead || dvrUnsupported ? ' is-live-blocked' : ''}">
            \${skipSteps
              .map(
                (sec) => \`
              <button type="button" data-seek="\${sec}" class="cadence-seek-btn"\${seekForwardBlocked ? ' aria-disabled="true"' : ''} title="\${adActive ? adSkipBlockedTooltip : dvrUnsupported ? dvrUnsupportedTooltip : liveAtHead ? 'Stream is currently at live end' : \`Skip ahead \${sec} seconds\`}">\${sec}</button>
            \`
              )
              .join('')}
            <span class="cadence-seek-icon-cell" title="Skip ahead seconds" aria-hidden="true">\${SKIP_ICON_SVG}</span>
          </div>
        </div>
      </div>

      <div class="cadence-row-bot">
        <span class="cadence-global-saved-sizer" aria-hidden="true"></span>
        <div class="cadence-fine-group">
          <button type="button" data-step="-0.05" class="cadence-step-chip\${adActive ? ' is-ad-blocked' : ''}"\${adActive ? ' aria-disabled="true"' : ''} title="\${adActive ? adBlockedTooltip : 'Decrease playback speed by 0.05× for this video session'}">−0.05</button>
          <button type="button" data-step="0.05" class="cadence-step-chip\${adActive ? ' is-ad-blocked' : isStepUpLiveBlocked ? ' is-live-blocked' : ''}"\${adActive || isStepUpLiveBlocked ? ' aria-disabled="true"' : ''} title="\${adActive ? adBlockedTooltip : isStepUpLiveBlocked ? liveBlockedTooltip : 'Increase playback speed by 0.05× for this video session'}">+0.05</button>
          <button type="button" data-action="reset" class="cadence-reset-chip \${!adActive && isSessionActive ? 'is-active' : ''}\${adActive ? ' is-ad-blocked' : ''}" \${!adActive && !isSessionActive ? 'disabled' : ''}\${adActive ? ' aria-disabled="true"' : ''} title="\${adActive ? adBlockedTooltip : \`Reset session override to \${matchedRule ? 'Rule' : 'Default'} (\${formatDisplaySpeed(liveAtHead && baselineSpeed > 1.01 ? 1.0 : baselineSpeed)}×)\`}">Reset</button>
          <span class="cadence-saved-time" style="display:none;"></span>
        </div>

        <div class="cadence-row-bot-right">
          <span class="cadence-bar-global-saved-wrap" style="display:none;">
            <span class="cadence-bar-global-saved"></span>
            <span class="cadence-row3-sep" aria-hidden="true"></span>
          </span>
          <div class="cadence-rule-slot">
            \${ruleSlotHtml}
          </div>
        </div>
      </div>
    \`;

    if (!adActive) {
      applyDurationModelToBar(bar, durationModel);
    }
    applySavedTimeModelToBar(bar, savedTimeModel);
    applyGlobalSavedTimeToBar(bar);

    const brandBtn = bar.querySelector('.cadence-brand-btn');
    if (brandBtn) {
      brandBtn.addEventListener(
        'click',
        () => {
          safeSendMessage({ type: 'CADENCE_OPEN_OPTIONS' });
        },
        { signal: lifecycleSignal }
      );
    }

    bar.querySelectorAll('.cadence-speed-chip').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const chosen = Number(btn.getAttribute('data-speed'));
          applySessionSpeedFromBar(chosen);
        },
        { signal: lifecycleSignal }
      );
    });

    bar.querySelectorAll('.cadence-seek-btn').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const delta = Number(btn.getAttribute('data-seek')) || 0;
          applySeekFromBar(delta);
        },
        { signal: lifecycleSignal }
      );
    });

    bar.querySelectorAll('.cadence-step-chip').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const delta = Number(btn.getAttribute('data-step')) || 0;
          const base = getEffectiveSpeedForChannel(currentChannel);
          applySessionSpeedFromBar(base + delta);
        },
        { signal: lifecycleSignal }
      );
    });

    const resetBtn = bar.querySelector('.cadence-reset-chip');
    if (resetBtn) {
      resetBtn.addEventListener(
        'click',
        () => {
          if (isCurrentAdActive()) {
            showBarToast('Speed locked during ad', 2400, 'ad');
            showPlayerToast('Speed locked during ad', true, true);
            return;
          }
          if (!hasActiveSessionOverride(currentChannel && currentChannel.videoId)) return;
          resetSessionSpeedFromBar();
        },
        { signal: lifecycleSignal }
      );
    }

    const ruleActionBtn = bar.querySelector('.cadence-rule-action-btn');
    if (ruleActionBtn) {
      ruleActionBtn.addEventListener(
        'click',
        async () => {
          if (isCurrentAdActive()) {
            showBarToast('Speed locked during ad', 2400, 'ad');
            showPlayerToast('Speed locked during ad', true, true);
            return;
          }
          if (!currentChannel) {
            currentChannel = extractDomChannelFallback();
          }
          if (!currentChannel) return;

          const action = ruleActionBtn.getAttribute('data-rule-action');
          if (action === 'clear') {
            await clearChannelRule(currentChannel);
            return;
          }
          if (action === 'save' || action === 'update') {
            const targetRate = clampSpeed(getEffectiveSpeedForChannel(currentChannel));
            sessionOverride = { videoId: null, speed: null };
            const ok = await saveChannelSpeed(currentChannel, targetRate, 'custom');
            if (ok) {
              const applied = getEffectiveSpeedForChannel(currentChannel);
              remainingState.playbackRate = applied;
              pushConfigToBridge(applied, true);
              postToBridge('COMMAND', { action: 'SET_SPEED', speed: applied });
              renderInPageBar();
              showPlayerToast(
                action === 'update'
                  ? \`Updated Rule → \${formatDisplaySpeed(targetRate)}×\`
                  : \`Saved \${formatDisplaySpeed(targetRate)}× Rule\`
              );
            }
          }
        },
        { signal: lifecycleSignal }
      );
    }

    const remainingSlotBtn = bar.querySelector('.cadence-remaining-slot');
    if (remainingSlotBtn) {
      remainingSlotBtn.addEventListener(
        'mouseleave',
        () => {
          const pendingTitle = remainingSlotBtn.getAttribute('data-pending-title');
          if (pendingTitle !== null) {
            remainingSlotBtn.removeAttribute('data-pending-title');
            if (remainingSlotBtn.title !== pendingTitle) {
              remainingSlotBtn.title = pendingTitle;
            }
          }
        },
        { signal: lifecycleSignal }
      );
      remainingSlotBtn.addEventListener(
        'click',
        () => {
          if (remainingSlotBtn.disabled) return;
          hideBarToast();
          const isNoDvrLive = Boolean(
            remainingState.isLive && remainingState.isDvrSupported === false
          );
          if (currentChannel && hasActiveSessionOverride(currentChannel.videoId)) {
            if (sessionOverride.speed > 1.01 || (isNoDvrLive && sessionOverride.speed < 0.99)) {
              sessionOverride = { videoId: null, speed: null };
            }
          }
          if (isNoDvrLive && currentChannel && currentChannel.videoId) {
            nonDvrClampedVideoId = currentChannel.videoId;
          }
          remainingState.isAtLiveHead = true;
          remainingState.dvrLagSec = 0;
          remainingState.isPaused = false;
          remainingState.playbackRate = 1.0;
          const headSpeed = getEffectiveSpeedForChannel(currentChannel);
          pushConfigToBridge(headSpeed, true);
          postToBridge('COMMAND', { action: 'JUMP_TO_LIVE', clampSubOne: isNoDvrLive });
          renderInPageBar();
          showPlayerToast('Jumped to Live · 1.0×');
        },
        { signal: lifecycleSignal }
      );
    }

    // Atomic mount: only attach to the DOM once completely populated and verified
    if (existing && existing.parentElement === mountPoint.container) {
      existing.replaceWith(bar);
    } else {
      if (existing) existing.remove();
      if (mountPoint.beforeNode && mountPoint.beforeNode.parentElement === mountPoint.container) {
        mountPoint.container.insertBefore(bar, mountPoint.beforeNode);
      } else {
        mountPoint.container.prepend(bar);
      }
    }

    ensureBarResizeObserver(bar);
    syncRow1BrandCollapse(bar);
    syncRow3SavedReadoutCollapse(bar);

    if (barToastVisible) {
      positionBarToast();
    }
  } catch (err) {
    const orphan = document.getElementById('cadence-watch-bar');
    if (orphan && orphan.children.length === 0) {
      orphan.remove();
    }
  }
}

  function handleLeftWatchPage() {
    currentChannel = null;
    sessionOverride = { videoId: null, speed: null };
    nonDvrClampedVideoId = null;
    stoppedBannerVideoId = null;
    watchLaterState = { videoId: null, status: 'idle' };
    remainingState = {
      videoId: null,
      rawRemainingSec: null,
      rawDurationSec: null,
      playbackRate: null,
      isAd: false,
      isLive: false,
      isAtLiveHead: false,
      isDvrSupported: true,
      dvrLagSec: null,
      isPaused: false,
      hidden: true,
    };
    lastToastedVideoId = null;
    clearBarMountRetry();
    hideBarToast(true);
    disconnectBarResizeObserver();

    const existingBar = document.getElementById('cadence-watch-bar');
    if (existingBar) existingBar.remove();
    const legacyBar = document.getElementById('cadence-owner-bar');
    if (legacyBar) legacyBar.remove();
    const existingBanner = document.querySelector('.cadence-stopped-banner');
    if (existingBanner) existingBanner.classList.remove('cadence-visible');

    activeSpeed = Number(state.settings.defaultSpeed) || 1.0;
    safeSendMessage({
      type: 'CADENCE_UPDATE_BADGE',
      enabled: false,
      speed: null,
    });
  }

  function applyForCurrentChannel(allowToast = false) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    if (!isWatchLocation()) {
      maybeRedirectShortsInContent();
      handleLeftWatchPage();
      return;
    }
    if (!currentChannel) {
      currentChannel = extractDomChannelFallback();
    }
    if (!currentChannel) return;

    if (
      !state.settings.enabled ||
      (!state.settings.perChannelSpeedEnabled &&
        !hasActiveSessionOverride(currentChannel.videoId))
    ) {
      pushConfigToBridge(1.0, false);
      renderInPageBar();
      return;
    }

    clearSessionOverrideIfMatchesBaseline(currentChannel);
    const adActive = isCurrentAdActive();
    const rule = findMatchingRule(currentChannel);
    const speed = getEffectiveSpeedForChannel(currentChannel);
    pushConfigToBridge(speed, true);
    if (adActive) {
      safeSendMessage({
        type: 'CADENCE_UPDATE_BADGE',
        enabled:
          isWatchLocation() &&
          Boolean(state.settings.enabled && state.settings.perChannelSpeedEnabled),
        speed: isWatchLocation() ? 1.0 : null,
      });
    }
    renderInPageBar();

    if (
      allowToast &&
      !adActive &&
      !currentChannel.isAd &&
      !currentChannel.isPreview &&
      currentChannel.videoId &&
      lastToastedVideoId !== currentChannel.videoId
    ) {
      lastToastedVideoId = currentChannel.videoId;
      if (hasActiveSessionOverride(currentChannel.videoId)) {
        const suffix = rule
          ? \`Rule \${formatDisplaySpeed(getBaselineSpeedForChannel(currentChannel))}× unchanged\`
          : 'This video only';
        showPlayerToast(\`Session \${formatDisplaySpeed(speed)}× · \${suffix}\`);
      } else {
        const presetObj =
          rule && rule.presetId !== 'custom'
            ? state.presets.find((p) => p.id === rule.presetId)
            : null;
        const suffix = presetObj ? \` · \${presetObj.label}\` : rule ? ' · Channel Rule' : ' · Default';
        showPlayerToast(\`\${formatDisplaySpeed(speed)}×\${suffix}\`);
      }
    }
  }

  window.addEventListener(
    'message',
    async (event) => {
      if (isDestroyed || !isExtensionContextValid()) {
        teardownInstance();
        return;
      }
      if (event.source !== window || !event.data || event.data.source !== 'CADENCE_MAIN_BRIDGE') {
        return;
      }
      try {
        const { type, payload } = event.data;
        if (type === 'LEFT_WATCH_PAGE') {
          handleLeftWatchPage();
        } else if (type === 'AD_STATE_CHANGE' && payload) {
          const adNow = Boolean(payload.isAd);
          remainingState.isAd = adNow;
          if (currentChannel) {
            currentChannel = { ...currentChannel, isAd: adNow };
          }
          if (adNow) {
            remainingState.hidden = true;
            if (barToastReason === 'live') {
              hideBarToast();
            }
            safeSendMessage({
              type: 'CADENCE_UPDATE_BADGE',
              enabled:
                isWatchLocation() &&
                Boolean(state.settings.enabled && state.settings.perChannelSpeedEnabled),
              speed: isWatchLocation() ? 1.0 : null,
            });
            renderInPageBar();
          } else {
            if (barToastReason === 'ad') {
              hideBarToast();
            }
            if (!currentChannel) {
              currentChannel = extractDomChannelFallback();
            }
            if (
              currentChannel &&
              state.settings.enabled &&
              (state.settings.perChannelSpeedEnabled ||
                hasActiveSessionOverride(currentChannel.videoId))
            ) {
              const restoredSpeed = getEffectiveSpeedForChannel(currentChannel);
              const restoredSession = hasActiveSessionOverride(currentChannel.videoId);
              remainingState.playbackRate = restoredSpeed;
              pushConfigToBridge(restoredSpeed, true);
              postToBridge('COMMAND', { action: 'SET_SPEED', speed: restoredSpeed });
              renderInPageBar();
              if (restoredSession) {
                showPlayerToast(\`Restored Session \${formatDisplaySpeed(restoredSpeed)}×\`);
              }
            } else {
              renderInPageBar();
            }
          }
        } else if (type === 'AD_SPEED_BLOCKED') {
          remainingState.isAd = true;
          if (currentChannel) {
            currentChannel = { ...currentChannel, isAd: true };
          }
          if (state.settings.enabled) {
            renderInPageBar();
            showBarToast('Speed locked during ad', 2400, 'ad');
            showPlayerToast('Speed locked during ad', true, true);
          }
        } else if (type === 'AD_SKIP_BLOCKED') {
          remainingState.isAd = true;
          if (currentChannel) {
            currentChannel = { ...currentChannel, isAd: true };
          }
          if (state.settings.enabled) {
            renderInPageBar();
            showBarToast('Skip locked during ad', 2400, 'ad');
            showPlayerToast('Skip locked during ad', true, true);
          }
        } else if (type === 'LIVE_HEAD_SKIP_BLOCKED') {
          remainingState.isLive = true;
          remainingState.isAtLiveHead = true;
          if (state.settings.enabled) {
            renderInPageBar();
            showBarToast('Stream is currently at live end', 2400, 'live');
            showPlayerToast('Stream is currently at live end', true, true);
          }
        } else if (type === 'LIVE_DVR_UNAVAILABLE') {
          remainingState.isLive = true;
          remainingState.isDvrSupported = false;
          if (state.settings.enabled) {
            renderInPageBar();
            showBarToast('Rewind unavailable on this live stream', 2400, 'live');
            showPlayerToast('Rewind unavailable on this live stream', true, true);
          }
        } else if (type === 'NON_DVR_FORCED_CATCHUP') {
          sessionOverride = { videoId: null, speed: null };
          const caughtVid =
            (currentChannel && currentChannel.videoId) || (payload && payload.videoId) || null;
          if (caughtVid) {
            nonDvrClampedVideoId = caughtVid;
          }
          remainingState.isLive = true;
          remainingState.isAtLiveHead = true;
          remainingState.isDvrSupported = false;
          remainingState.dvrLagSec = 0;
          remainingState.isPaused = false;
          remainingState.playbackRate = 1.0;
          if (state.settings.enabled) {
            const headSpeed = currentChannel ? getEffectiveSpeedForChannel(currentChannel) : 1.0;
            pushConfigToBridge(headSpeed, Boolean(state.settings.perChannelSpeedEnabled));
            renderInPageBar();
            showPlayerToast('Caught up to Live · 1.0×', true, false);
          }
        } else if (type === 'LIVE_CAUGHT_UP') {
          const fromSeek = Boolean(payload && payload.fromSeek);
          const hadFastRate =
            activeSpeed > 1.01 ||
            Boolean(
              currentChannel &&
                hasActiveSessionOverride(currentChannel.videoId) &&
                sessionOverride.speed > 1.01
            );
          if (
            currentChannel &&
            hasActiveSessionOverride(currentChannel.videoId) &&
            sessionOverride.speed > 1.01
          ) {
            sessionOverride = { videoId: null, speed: null };
          }
          remainingState.isLive = true;
          remainingState.isAtLiveHead = true;
          remainingState.dvrLagSec = 0;
          remainingState.isPaused = false;
          remainingState.playbackRate = 1.0;
          if (state.settings.enabled) {
            const headSpeed = currentChannel ? getEffectiveSpeedForChannel(currentChannel) : 1.0;
            pushConfigToBridge(headSpeed, Boolean(state.settings.perChannelSpeedEnabled));
            renderInPageBar();
            if (fromSeek) {
              showPlayerToast('Synced to Live · 1.0×');
            } else if (hadFastRate) {
              showPlayerToast('Caught up to Live · 1.0×');
            }
          }
        } else if (type === 'TIME_REMAINING_UPDATE' && payload) {
          const prevAd = Boolean(remainingState.isAd);
          const prevLiveAtHead = Boolean(remainingState.isLive && remainingState.isAtLiveHead);
          const prevIsLive = Boolean(remainingState.isLive);
          const prevVideoId = remainingState.videoId;
          const isNewVideo = Boolean(payload.videoId && prevVideoId && payload.videoId !== prevVideoId);
          remainingState = {
            videoId: payload.videoId || null,
            rawRemainingSec:
              typeof payload.rawRemainingSec === 'number' ? payload.rawRemainingSec : null,
            rawDurationSec:
              typeof payload.rawDurationSec === 'number' ? payload.rawDurationSec : null,
            bankedSavedSec: isNewVideo
              ? (typeof payload.bankedSavedSec === 'number' ? payload.bankedSavedSec : 0)
              : (typeof payload.bankedSavedSec === 'number'
                ? payload.bankedSavedSec
                : remainingState.bankedSavedSec || 0),
            savedTimeModel:
              payload.savedTimeModel || {
                visible: false,
                tone: 'neutral',
                text: '',
                title: '',
              },
            playbackRate:
              typeof payload.playbackRate === 'number' ? payload.playbackRate : null,
            isAd: Boolean(payload.isAd),
            isLive: Boolean(payload.isLive),
            isAtLiveHead: Boolean(payload.isAtLiveHead),
            isDvrSupported: payload.isDvrSupported !== false,
            dvrLagSec: typeof payload.dvrLagSec === 'number' ? payload.dvrLagSec : null,
            isPaused: Boolean(payload.isPaused),
            hidden: Boolean(payload.hidden),
          };
          if (
            !remainingState.isLive &&
            typeof remainingState.rawRemainingSec === 'number' &&
            remainingState.rawRemainingSec > 2.5 &&
            Date.now() > bannerProtectedUntil
          ) {
            const existingBanner = document.querySelector('.cadence-stopped-banner');
            if (existingBanner) {
              existingBanner.classList.remove('cadence-visible');
            }
          }
          const nowLiveAtHead = Boolean(remainingState.isLive && remainingState.isAtLiveHead);
          const hasAboveOneOverride = Boolean(
            currentChannel &&
              hasActiveSessionOverride(currentChannel.videoId) &&
              sessionOverride.speed > 1.01
          );
          if (prevAd !== remainingState.isAd) {
            if (!remainingState.isAd && barToastReason === 'ad') {
              hideBarToast();
            }
            if (
              !remainingState.isAd &&
              currentChannel &&
              state.settings.enabled &&
              (state.settings.perChannelSpeedEnabled ||
                hasActiveSessionOverride(currentChannel.videoId))
            ) {
              const restoredSpeed = getEffectiveSpeedForChannel(currentChannel);
              pushConfigToBridge(restoredSpeed, true);
              postToBridge('COMMAND', { action: 'SET_SPEED', speed: restoredSpeed });
            }
            renderInPageBar();
          } else if (nowLiveAtHead && (!prevLiveAtHead || hasAboveOneOverride || activeSpeed > 1.01)) {
            if (hasAboveOneOverride) {
              sessionOverride = { videoId: null, speed: null };
            }
            if (
              currentChannel &&
              state.settings.enabled &&
              (state.settings.perChannelSpeedEnabled ||
                hasActiveSessionOverride(currentChannel.videoId))
            ) {
              const clampedSpeed = getEffectiveSpeedForChannel(currentChannel);
              remainingState.playbackRate = clampedSpeed;
              pushConfigToBridge(clampedSpeed, true);
            }
            renderInPageBar();
          } else if (prevLiveAtHead && !nowLiveAtHead && remainingState.isLive) {
            if (barToastReason === 'live') hideBarToast();
            if (
              currentChannel &&
              state.settings.enabled &&
              (state.settings.perChannelSpeedEnabled ||
                hasActiveSessionOverride(currentChannel.videoId))
            ) {
              const dvrSpeed = getEffectiveSpeedForChannel(currentChannel);
              remainingState.playbackRate = dvrSpeed;
              pushConfigToBridge(dvrSpeed, true);
              if (Math.abs(dvrSpeed - 1.0) > 0.015) {
                postToBridge('COMMAND', { action: 'SET_SPEED', speed: dvrSpeed });
              }
            }
            renderInPageBar();
          } else if (prevIsLive !== remainingState.isLive) {
            if (!remainingState.isLive && barToastReason === 'live') hideBarToast();
            if (
              currentChannel &&
              state.settings.enabled &&
              (state.settings.perChannelSpeedEnabled ||
                hasActiveSessionOverride(currentChannel.videoId))
            ) {
              pushConfigToBridge(getEffectiveSpeedForChannel(currentChannel), true);
            }
            renderInPageBar();
          } else {
            updateRemainingReadoutInPlace();
          }
        } else if (type === 'LIVE_HEAD_SPEED_BLOCKED') {
          if (
            currentChannel &&
            hasActiveSessionOverride(currentChannel.videoId) &&
            sessionOverride.speed > 1.01
          ) {
            sessionOverride = { videoId: null, speed: null };
          }
          remainingState.isLive = true;
          remainingState.isAtLiveHead = true;
          remainingState.playbackRate = 1.0;
          if (state.settings.enabled) {
            pushConfigToBridge(1.0, Boolean(state.settings.perChannelSpeedEnabled));
            renderInPageBar();
            showBarToast('Stream is currently at live end', 2400, 'live');
            showPlayerToast('Stream is currently at live end', true, true);
          }
        } else if (type === 'NAVIGATION_PREVIEW' && payload && payload.videoId) {
          if (sessionOverride.videoId !== payload.videoId) {
            sessionOverride = { videoId: null, speed: null };
          }
          if (nonDvrClampedVideoId && nonDvrClampedVideoId !== payload.videoId) {
            nonDvrClampedVideoId = null;
          }
          if (remainingState.videoId !== payload.videoId) {
            hideBarToast();
            remainingState = {
              videoId: payload.videoId,
              rawRemainingSec: null,
              rawDurationSec: null,
              playbackRate: null,
              isAd: false,
              isLive: false,
              isAtLiveHead: false,
              isDvrSupported: true,
              dvrLagSec: null,
              isPaused: false,
              hidden: true,
            };
          }
          const hasChannelHint = Boolean(
            payload.channelId || payload.handle || payload.channelName
          );
          let previewSpeed = Number(state.settings.defaultSpeed) || 1.0;
          if (!state.settings.enabled || !state.settings.perChannelSpeedEnabled) {
            previewSpeed = 1.0;
          } else if (hasChannelHint) {
            const rule = findMatchingRule(payload);
            previewSpeed = resolveSpeedForRule(rule);
          }
          activeSpeed = clampSpeed(previewSpeed);
          postToBridge('CONFIG_UPDATE', {
            enabled: state.settings.enabled,
            perChannelSpeedEnabled: state.settings.perChannelSpeedEnabled,
            convertShortsToWatch: state.settings.convertShortsToWatch !== false,
            disableVideoPreviews: state.settings.disableVideoPreviews !== false,
            showWatchLaterRemoveAction: state.settings.showWatchLaterRemoveAction !== false,
            stopAfterVideoEnds: state.settings.stopAfterVideoEnds,
            defaultSpeed: Number(state.settings.defaultSpeed) || 1.0,
            targetSpeed: activeSpeed,
          });
          if (isWatchLocation()) {
            safeSendMessage({
              type: 'CADENCE_UPDATE_BADGE',
              enabled: Boolean(state.settings.enabled && state.settings.perChannelSpeedEnabled),
              speed: activeSpeed,
            });
          }
        } else if (type === 'VIDEO_DETECTED' && payload) {
          const prevVideoId = currentChannel ? currentChannel.videoId : null;
          const wasChannelAd = Boolean(currentChannel && currentChannel.isAd);
          if (payload.videoId && payload.videoId !== prevVideoId) {
            hideBarToast();
            stoppedBannerVideoId = payload.videoId;
            watchLaterState = { videoId: payload.videoId, status: 'idle' };
            if (nonDvrClampedVideoId && nonDvrClampedVideoId !== payload.videoId) {
              nonDvrClampedVideoId = null;
            }
            if (sessionOverride.videoId !== payload.videoId) {
              sessionOverride = { videoId: null, speed: null };
            }
            if (remainingState.videoId !== payload.videoId) {
              remainingState = {
                videoId: payload.videoId,
                rawRemainingSec: null,
                rawDurationSec: null,
                bankedSavedSec: 0,
                savedTimeModel: { visible: false, tone: 'neutral', text: '', title: '' },
                playbackRate: null,
                isAd: Boolean(payload.isAd),
                isLive: false,
                isAtLiveHead: false,
                isDvrSupported: true,
                dvrLagSec: null,
                isPaused: false,
                hidden: true,
              };
            }
            barMountAttempts = 0;
            const existingBanner = document.querySelector('.cadence-stopped-banner');
            if (existingBanner) {
              existingBanner.classList.remove('cadence-visible');
            }
          }
          remainingState.isAd = Boolean(payload.isAd);
          if (wasChannelAd && !payload.isAd && barToastReason === 'ad') {
            hideBarToast();
          }
          currentChannel = payload;
          applyForCurrentChannel(true);
        } else if (type === 'MANUAL_RATE_CHANGE' && payload) {
          if (!state.settings.enabled) return;
          if (isCurrentAdActive()) {
            renderInPageBar();
            showBarToast('Speed locked during ad', 2400, 'ad');
            showPlayerToast('Speed locked during ad', true, true);
            return;
          }
          if (payload && payload.channelName) {
            currentChannel = payload;
          } else if (!currentChannel) {
            currentChannel = extractDomChannelFallback();
          }
          if (!currentChannel) return;

          const cleanManualSpeed = clampSpeed(payload.speed);
          if (isLiveAtHeadForChannel(currentChannel) && cleanManualSpeed > 1.01) {
            sessionOverride = { videoId: null, speed: null };
            remainingState.playbackRate = 1.0;
            pushConfigToBridge(1.0, true);
            postToBridge('COMMAND', { action: 'SET_SPEED', speed: 1.0 });
            renderInPageBar();
            showBarToast('Stream is currently at live end', 2400, 'live');
            showPlayerToast('Stream is currently at live end', true, true);
            return;
          }
          hideBarToast();
          if (cleanManualSpeed < 0.99) {
            nonDvrClampedVideoId = null;
          }

          const matchedRule = findMatchingRule(currentChannel);
          const baselineSpeed = getBaselineSpeedForChannel(currentChannel);
          const activeVid = currentChannel.videoId || payload.videoId || 'active';
          const wasOverridden = hasActiveSessionOverride(activeVid);

          if (Math.abs(cleanManualSpeed - baselineSpeed) < 0.015) {
            sessionOverride = { videoId: null, speed: null };
            const effectiveBaseline = getEffectiveSpeedForChannel(currentChannel);
            pushConfigToBridge(effectiveBaseline, true);
            renderInPageBar();
            const baselineLabel = matchedRule ? 'Channel Rule' : 'Default';
            showPlayerToast(
              wasOverridden
                ? \`Restored \${formatDisplaySpeed(effectiveBaseline)}× (\${baselineLabel})\`
                : \`\${formatDisplaySpeed(effectiveBaseline)}× · \${baselineLabel}\`
            );
          } else {
            sessionOverride = {
              videoId: activeVid,
              speed: cleanManualSpeed,
            };
            pushConfigToBridge(sessionOverride.speed, true);
            renderInPageBar();
            const suffix = matchedRule
              ? \`Rule \${formatDisplaySpeed(baselineSpeed)}× unchanged\`
              : 'This video only';
            showPlayerToast(
              \`Session \${formatDisplaySpeed(sessionOverride.speed)}× · \${suffix}\`
            );
          }
        } else if (type === 'TIME_SAVED_DELTA' && payload && payload.deltaSec) {
          safeSendMessage({
            type: 'CADENCE_ADD_TIME_SAVED',
            deltaSec: payload.deltaSec,
          });
        } else if (type === 'PLAYBACK_STOPPED') {
          if (payload && typeof payload.bankedSavedSec === 'number') {
            remainingState.bankedSavedSec = payload.bankedSavedSec;
          }
          const stoppedVid =
            (payload && payload.videoId) || (currentChannel && currentChannel.videoId) || null;
          if (stoppedVid) {
            stoppedBannerVideoId = stoppedVid;
            if (watchLaterState.videoId !== stoppedVid) {
              watchLaterState = { videoId: stoppedVid, status: 'idle' };
            }
          }
          if (state.settings && state.settings.showWatchLaterRemoveAction === false) {
            watchLaterState.status = 'idle';
          } else if (payload && payload.watchLaterRemoved) {
            watchLaterState.status = 'removed';
          } else if (payload && payload.inWatchLater && watchLaterState.status !== 'removed') {
            watchLaterState.status = 'available';
          }
          showStoppedBanner(Boolean(payload && payload.hasPlaylist), stoppedVid);
        } else if (type === 'WATCH_LATER_STATUS' && payload) {
          const eventVid = payload.videoId || null;
          const activeBannerVid =
            stoppedBannerVideoId || (currentChannel && currentChannel.videoId) || null;
          if (eventVid && activeBannerVid && eventVid !== activeBannerVid) {
            return;
          }
          const targetVid = eventVid || activeBannerVid;
          if (state.settings && state.settings.showWatchLaterRemoveAction === false) {
            watchLaterState = { videoId: targetVid, status: 'idle' };
          } else if (payload.removed) {
            watchLaterState = { videoId: targetVid, status: 'removed' };
          } else if (payload.error) {
            watchLaterState = { videoId: targetVid, status: 'error' };
          } else if (payload.inWatchLater) {
            watchLaterState = { videoId: targetVid, status: 'available' };
          } else if (watchLaterState.status !== 'removed') {
            watchLaterState = { videoId: targetVid, status: 'idle' };
          }
          const existingBanner = document.querySelector('.cadence-stopped-banner');
          if (existingBanner) {
            syncStoppedBannerWatchLaterUi(existingBanner);
          }
        }
      } catch (_) {
        if (!isExtensionContextValid()) {
          teardownInstance();
        }
      }
    },
    { signal: lifecycleSignal }
  );

  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (isDestroyed || !isExtensionContextValid()) {
        teardownInstance();
        return false;
      }
      if (msg && msg.type === 'CADENCE_GET_ACTIVE_CHANNEL') {
        if (!isWatchLocation()) {
          sendResponse({ channel: null });
          return false;
        }
        if (!currentChannel || !currentChannel.channelName) {
          currentChannel = extractDomChannelFallback();
        }
        const video =
          document.querySelector('ytd-watch-flexy video.html5-main-video') ||
          document.querySelector('#movie_player video.html5-main-video') ||
          document.querySelector('video.html5-main-video');
        const adActive = isCurrentAdActive();
        const baseline = getBaselineSpeedForChannel(currentChannel);
        const liveAtHead = !adActive && isLiveAtHeadForChannel(currentChannel);
        const liveClampedOrPaused =
          adActive ||
          (remainingState.isLive && (remainingState.isAtLiveHead || remainingState.isPaused));
        const liveVideoSpeed = liveClampedOrPaused
          ? getEffectiveSpeedForChannel(currentChannel)
          : video
            ? Math.round(video.playbackRate * 100) / 100
            : activeSpeed;
        if (
          !adActive &&
          !liveClampedOrPaused &&
          currentChannel &&
          hasActiveSessionOverride(currentChannel.videoId) &&
          Math.abs(liveVideoSpeed - baseline) < 0.015
        ) {
          sessionOverride = { videoId: null, speed: null };
          renderInPageBar();
        } else {
          clearSessionOverrideIfMatchesBaseline(currentChannel);
        }
        const rule = findMatchingRule(currentChannel);
        const isSession = hasActiveSessionOverride(currentChannel && currentChannel.videoId);
        const reportedSpeed = adActive
          ? 1.0
          : state.settings.enabled
            ? getEffectiveSpeedForChannel(currentChannel)
            : liveVideoSpeed || activeSpeed;
        sendResponse({
          channel: currentChannel,
          activeSpeed: reportedSpeed,
          matchedRule: rule,
          baselineSpeed: baseline,
          sessionOverrideSpeed: isSession ? sessionOverride.speed : null,
          isAd: adActive,
          isLive: Boolean(!adActive && (remainingState.isLive || liveAtHead)),
          isAtLiveHead: liveAtHead,
          isDvrSupported: remainingState.isDvrSupported !== false,
        });
        return false;
      }
      if (msg && msg.type === 'CADENCE_ENFORCE_AD_LOCK_NOTICE') {
        remainingState.isAd = true;
        renderInPageBar();
        showBarToast('Speed locked during ad', 2400, 'ad');
        showPlayerToast('Speed locked during ad', true, true);
        sendResponse({ ok: true });
        return false;
      }
      if (msg && msg.type === 'CADENCE_ENFORCE_LIVE_HEAD_LOCK') {
        if (
          currentChannel &&
          hasActiveSessionOverride(currentChannel.videoId) &&
          sessionOverride.speed > 1.01
        ) {
          sessionOverride = { videoId: null, speed: null };
        }
        remainingState.isLive = true;
        remainingState.isAtLiveHead = true;
        remainingState.playbackRate = 1.0;
        pushConfigToBridge(1.0, true);
        postToBridge('COMMAND', { action: 'SET_SPEED', speed: 1.0 });
        renderInPageBar();
        showBarToast('Stream is currently at live end', 2400, 'live');
        showPlayerToast('Stream is currently at live end', true, true);
        sendResponse({ ok: true });
        return false;
      }
      if (msg && msg.type === 'CADENCE_SET_CHANNEL_SPEED') {
        if (isCurrentAdActive()) {
          renderInPageBar();
          showBarToast('Speed locked during ad', 2400, 'ad');
          showPlayerToast('Speed locked during ad', true, true);
          sendResponse({ ok: false, blockedDuringAd: true });
          return false;
        }
        const targetMeta = msg.channel || currentChannel || extractDomChannelFallback();
        if (targetMeta) {
          currentChannel = targetMeta;
          const requestedSpeed = clampSpeed(msg.speed);
          if (isLiveAtHeadForChannel(targetMeta) && requestedSpeed > 1.01) {
            sessionOverride = { videoId: null, speed: null };
            remainingState.playbackRate = 1.0;
            pushConfigToBridge(1.0, true);
            postToBridge('COMMAND', { action: 'SET_SPEED', speed: 1.0 });
            renderInPageBar();
            showBarToast('Stream is currently at live end', 2400, 'live');
            showPlayerToast('Stream is currently at live end', true, true);
            sendResponse({ ok: false, blockedAtLiveHead: true });
            return false;
          }
          hideBarToast();
          nonDvrClampedVideoId = null;
          sessionOverride = { videoId: null, speed: null };
          remainingState.playbackRate = requestedSpeed;
          pushConfigToBridge(requestedSpeed, true);
          postToBridge('COMMAND', {
            action: 'SET_SPEED',
            speed: requestedSpeed,
            fromUserGesture: true,
          });
          renderInPageBar();
          saveChannelSpeed(targetMeta, requestedSpeed, msg.presetId || 'custom').then((ok) => {
            if (ok) {
              const appliedSpeed = getEffectiveSpeedForChannel(targetMeta);
              remainingState.playbackRate = appliedSpeed;
              renderInPageBar();
              showPlayerToast(\`Saved \${formatDisplaySpeed(requestedSpeed)}× for \${targetMeta.channelName}\`);
            }
            try {
              sendResponse({ ok: Boolean(ok) });
            } catch (_) {}
          });
          return true;
        }
        sendResponse({ ok: false });
        return false;
      }
      return false;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (isDestroyed || !isExtensionContextValid()) {
        teardownInstance();
        return;
      }
      if (area !== 'local') return;
      let shouldUpdateBarOnly = false;
      let shouldReapplyChannel = false;

      if (changes.totalTimeSavedSec && typeof changes.totalTimeSavedSec.newValue === 'number') {
        state.totalTimeSavedSec = Math.max(0, Math.floor(changes.totalTimeSavedSec.newValue));
        shouldUpdateBarOnly = true;
      }
      if (changes.savedTimeByDay && typeof changes.savedTimeByDay.newValue === 'object') {
        state.savedTimeByDay = changes.savedTimeByDay.newValue || {};
        shouldUpdateBarOnly = true;
      }

      if (changes.settings) {
        state.settings = changes.settings.newValue;
        syncPreviewBlockerStyle();
        const existingBanner = document.querySelector('.cadence-stopped-banner');
        if (existingBanner) {
          syncStoppedBannerWatchLaterUi(existingBanner);
        }
        shouldReapplyChannel = true;
      }
      if (changes.presets) {
        state.presets = changes.presets.newValue;
        shouldReapplyChannel = true;
      }
      if (changes.rules) {
        state.rules = changes.rules.newValue;
        shouldReapplyChannel = true;
      }

      if (shouldReapplyChannel) {
        if (maybeRedirectShortsInContent()) return;

        postToBridge('CONFIG_UPDATE', {
          enabled: state.settings.enabled,
          perChannelSpeedEnabled: state.settings.perChannelSpeedEnabled,
          convertShortsToWatch: state.settings.convertShortsToWatch !== false,
          disableVideoPreviews: state.settings.disableVideoPreviews !== false,
          showWatchLaterRemoveAction: state.settings.showWatchLaterRemoveAction !== false,
          hasSessionOverride: Boolean(
            currentChannel && hasActiveSessionOverride(currentChannel.videoId)
          ),
          stopAfterVideoEnds: state.settings.stopAfterVideoEnds,
          defaultSpeed: Number(state.settings.defaultSpeed) || 1.0,
          targetSpeed: activeSpeed,
        });
        applyForCurrentChannel(false);
      } else if (shouldUpdateBarOnly) {
        const bar = document.getElementById('cadence-watch-bar');
        if (bar) {
          applyGlobalSavedTimeToBar(bar);
        }
      }
    });
  } catch (_) {
    teardownInstance();
    return;
  }

  safeStorageGet(['settings', 'presets', 'rules', 'totalTimeSavedSec', 'savedTimeByDay']).then((stored) => {
    if (!stored || isDestroyed || !isExtensionContextValid()) return;
    if (stored.settings) state.settings = stored.settings;
    if (stored.presets) state.presets = stored.presets;
    if (stored.rules) state.rules = stored.rules;
    if (typeof stored.totalTimeSavedSec === 'number') {
      state.totalTimeSavedSec = Math.max(0, Math.floor(stored.totalTimeSavedSec));
    }
    if (stored.savedTimeByDay && typeof stored.savedTimeByDay === 'object') {
      state.savedTimeByDay = stored.savedTimeByDay;
    }

    syncPreviewBlockerStyle();

    if (maybeRedirectShortsInContent()) return;

    postToBridge('CONFIG_UPDATE', {
      enabled: state.settings.enabled,
      perChannelSpeedEnabled: state.settings.perChannelSpeedEnabled,
      convertShortsToWatch: state.settings.convertShortsToWatch !== false,
      disableVideoPreviews: state.settings.disableVideoPreviews !== false,
      showWatchLaterRemoveAction: state.settings.showWatchLaterRemoveAction !== false,
      stopAfterVideoEnds: state.settings.stopAfterVideoEnds,
      defaultSpeed: Number(state.settings.defaultSpeed) || 1.0,
      targetSpeed: activeSpeed,
    });

    if (!isWatchLocation()) {
      handleLeftWatchPage();
      return;
    }

    const immediateMeta = extractDomChannelFallback();
    if (immediateMeta && !currentChannel) {
      currentChannel = immediateMeta;
      applyForCurrentChannel(false);
    }
    postToBridge('COMMAND', { action: 'FORCE_DETECT' });
  });
})();
`;

  const contentCss = `.cadence-watch-bar {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  margin: 4px 0 10px 0;
  padding: 7px 10px 6px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.04);
  font-family: Roboto, Arial, sans-serif;
  font-size: 12px;
  color: inherit;
}

.cadence-watch-bar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2.5px;
  background: linear-gradient(
    270deg,
    #dc2626 0%,
    rgba(220, 38, 38, 0.72) 32%,
    rgba(220, 38, 38, 0.14) 68%,
    rgba(220, 38, 38, 0) 100%
  );
  pointer-events: none;
}

html[dark] .cadence-watch-bar {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.14);
  color: #f1f5f9;
}

.cadence-brand-sizer {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  white-space: nowrap;
}

.cadence-row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
}

html[dark] .cadence-row-top {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.cadence-row-top-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  white-space: nowrap;
}

.cadence-source-readout {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  white-space: nowrap;
  opacity: 0.92;
  font-variant-numeric: tabular-nums;
}

.cadence-rate-grid {
  display: inline-grid;
  align-items: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.cadence-rate-sizer,
.cadence-rate-value {
  grid-area: 1 / 1;
  font-weight: 600;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.cadence-rate-sizer {
  visibility: hidden;
  pointer-events: none;
  user-select: none;
}

.cadence-source-readout.is-highlighted .cadence-rate-value {
  color: #ea580c;
}

html[dark] .cadence-source-readout.is-highlighted .cadence-rate-value {
  color: #fdba74;
}

.cadence-ad-paused-note {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: #b45309;
  white-space: nowrap;
}

html[dark] .cadence-ad-paused-note {
  color: rgba(252, 211, 77, 0.92);
}

.cadence-brand-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  padding: 0;
  color: rgba(71, 85, 105, 0.92);
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  transition: color 140ms ease, opacity 140ms ease;
}

html[dark] .cadence-brand-btn {
  color: rgba(203, 213, 225, 0.88);
}

.cadence-brand-btn:hover {
  color: #0f172a;
}

html[dark] .cadence-brand-btn:hover {
  color: #ffffff;
}

.cadence-brand-emblem {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.cadence-brand-name {
  font-weight: 700;
  letter-spacing: -0.015em;
  color: #0f172a;
}

html[dark] .cadence-brand-name {
  color: #f8fafc;
}

.cadence-brand-btn:hover .cadence-brand-name {
  color: inherit;
}

.cadence-brand-sep {
  display: inline-block;
  width: 1.5px;
  height: 12px;
  border-radius: 999px;
  background: #dc2626;
  margin: 0 1px;
  flex-shrink: 0;
}

.cadence-brand-tagline {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  font-style: italic;
  color: #64748b;
}

html[dark] .cadence-brand-tagline {
  color: #94a3b8;
}

.cadence-brand-btn.is-tagline-collapsed .cadence-brand-sep,
.cadence-brand-btn.is-tagline-collapsed .cadence-brand-tagline {
  display: none;
}

.cadence-row-mid {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cadence-row-bot {
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

html[dark] .cadence-row-bot {
  border-top-color: rgba(255, 255, 255, 0.06);
}

.cadence-global-saved-sizer {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  user-select: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  white-space: nowrap;
  padding-right: 16px;
}

.cadence-bar-buttons {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.cadence-fine-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.cadence-row-bot-right {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  flex-shrink: 0;
}

.cadence-bar-global-saved-wrap {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  flex-shrink: 0;
}

.cadence-bar-global-saved {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 500;
  font-style: normal;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  color: #059669;
}

html[dark] .cadence-bar-global-saved {
  color: #34d399;
}

.cadence-row3-sep {
  width: 1px;
  height: 11px;
  background: rgba(148, 163, 184, 0.34);
  flex-shrink: 0;
}

html[dark] .cadence-row3-sep {
  background: rgba(255, 255, 255, 0.16);
}

.cadence-row-bot.is-global-saved-hidden .cadence-bar-global-saved-wrap {
  display: none !important;
}

.cadence-bar-divider {
  width: 1px;
  height: 12px;
  background: rgba(148, 163, 184, 0.34);
  flex-shrink: 0;
}

html[dark] .cadence-bar-divider {
  background: rgba(255, 255, 255, 0.16);
}

.cadence-remaining-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cadence-remaining-slot {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  padding: 1px 5px;
  border-radius: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  cursor: default;
  transition: background 140ms ease, border-color 140ms ease, opacity 140ms ease;
}

.cadence-remaining-slot:disabled {
  opacity: 0.86;
  cursor: default;
}

.cadence-remaining-slot.is-live-head:disabled {
  opacity: 0.96;
  font-weight: 600;
}

.cadence-remaining-slot.is-clickable {
  border-color: rgba(148, 163, 184, 0.34);
  cursor: pointer;
  opacity: 0.96;
}

.cadence-remaining-slot.is-clickable:hover {
  background: rgba(148, 163, 184, 0.2);
  border-color: rgba(220, 38, 38, 0.55);
}

.cadence-remaining-slot.is-nodvr-warning {
  font-family: Roboto, Arial, sans-serif;
  font-weight: 500;
  color: #b45309;
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.38);
  opacity: 1;
}

html[dark] .cadence-remaining-slot.is-nodvr-warning {
  color: #fde68a;
  background: rgba(245, 158, 11, 0.14);
  border-color: rgba(245, 158, 11, 0.44);
}

.cadence-remaining-slot.is-nodvr-warning:hover {
  background: rgba(245, 158, 11, 0.22);
  border-color: rgba(245, 158, 11, 0.65);
}

html[dark] .cadence-remaining-slot.is-nodvr-warning:hover {
  background: rgba(245, 158, 11, 0.24);
  border-color: rgba(251, 191, 36, 0.7);
}

.cadence-remaining-warn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #d97706;
}

html[dark] .cadence-remaining-warn-icon {
  color: #fbbf24;
}

.cadence-remaining-warn-icon .cadence-toast-warn-icon {
  width: 12px;
  height: 12px;
}

.cadence-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex-shrink: 0;
}

.cadence-live-dot.is-head {
  background: #ef4444;
}

.cadence-live-dot.is-behind {
  background: #f59e0b;
}

.cadence-remaining-time-grid {
  display: inline-grid;
  align-items: center;
  font-size: 11px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.cadence-remaining-sizer,
.cadence-remaining-time {
  grid-area: 1 / 1;
  font-size: 11px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.cadence-remaining-sizer {
  visibility: hidden;
  pointer-events: none;
  user-select: none;
}

.cadence-speed-chip {
  border: none;
  background: transparent;
  color: inherit;
  padding: 3px 6px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  transition: background 140ms ease, color 140ms ease, opacity 140ms ease;
}

.cadence-speed-chip:hover {
  background: rgba(148, 163, 184, 0.22);
}

.cadence-speed-chip.active {
  background: #dc2626;
  color: #ffffff;
}

.cadence-seek-group {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.cadence-seek-capsule {
  display: inline-flex;
  align-items: center;
  border-radius: 5px;
  border: 1px solid rgba(148, 163, 184, 0.32);
  background: rgba(15, 23, 42, 0.03);
  overflow: hidden;
  transition: opacity 140ms ease;
}

html[dark] .cadence-seek-capsule {
  border-color: rgba(148, 163, 184, 0.25);
  background: rgba(255, 255, 255, 0.04);
}

.cadence-seek-capsule > * + * {
  border-left: 1px solid rgba(148, 163, 184, 0.24);
}

html[dark] .cadence-seek-capsule > * + * {
  border-left-color: rgba(255, 255, 255, 0.14);
}

.cadence-seek-icon-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 4px;
  opacity: 0.72;
  user-select: none;
}

.cadence-seek-icon {
  width: 12px;
  height: 12px;
  display: block;
}

.cadence-seek-btn {
  border: none;
  background: transparent;
  color: inherit;
  padding: 2px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.cadence-seek-capsule:not(.is-ad-blocked):not(.is-live-blocked) .cadence-seek-btn:hover {
  background: rgba(148, 163, 184, 0.22);
}

html[dark] .cadence-seek-capsule:not(.is-ad-blocked):not(.is-live-blocked) .cadence-seek-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.cadence-step-chip {
  border: 1px solid rgba(148, 163, 184, 0.32);
  background: rgba(15, 23, 42, 0.03);
  color: inherit;
  padding: 2px 6px;
  border-radius: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 500;
  line-height: 1.3;
  cursor: pointer;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  transition: background 140ms ease, opacity 140ms ease, border-color 140ms ease;
}

html[dark] .cadence-step-chip {
  border-color: rgba(148, 163, 184, 0.25);
  background: rgba(255, 255, 255, 0.04);
}

.cadence-reset-chip {
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: transparent;
  color: inherit;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.3;
  cursor: pointer;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  transition: background 140ms ease, opacity 140ms ease, border-color 140ms ease;
}

.cadence-step-chip:hover {
  background: rgba(148, 163, 184, 0.22);
}

html[dark] .cadence-step-chip:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.cadence-reset-chip.is-active {
  border-color: rgba(239, 68, 68, 0.65);
  background: rgba(239, 68, 68, 0.1);
}

.cadence-reset-chip.is-active:hover {
  background: rgba(239, 68, 68, 0.2);
}

.cadence-saved-time {
  margin-left: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  opacity: 0.72;
}

.cadence-saved-time.is-saved {
  color: #059669;
  opacity: 1;
}

html[dark] .cadence-saved-time.is-saved {
  color: #34d399;
}

.cadence-rule-slot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-style: italic;
  white-space: nowrap;
  flex-shrink: 0;
}

.cadence-rule-status {
  font-size: 10.5px;
  opacity: 0.78;
  font-variant-numeric: tabular-nums;
}

.cadence-rule-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 5px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(15, 23, 42, 0.03);
  color: inherit;
  font-family: inherit;
  font-style: italic;
  font-size: 10.5px;
  line-height: 1.3;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  opacity: 0.92;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease, opacity 140ms ease;
}

html[dark] .cadence-rule-action-btn {
  border-color: rgba(148, 163, 184, 0.25);
  background: rgba(255, 255, 255, 0.03);
}

.cadence-rule-action-btn:hover {
  background: rgba(148, 163, 184, 0.2);
  opacity: 1;
}

html[dark] .cadence-rule-action-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.cadence-rule-action-btn.is-update {
  border-color: rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.1);
  color: #b45309;
  opacity: 1;
}

html[dark] .cadence-rule-action-btn.is-update {
  border-color: rgba(251, 191, 36, 0.38);
  background: rgba(245, 158, 11, 0.1);
  color: #fde68a;
}

.cadence-rule-action-btn.is-update:hover {
  background: rgba(245, 158, 11, 0.2);
}

.cadence-rule-plus {
  color: #ef4444;
  font-style: normal;
  font-weight: 700;
}

html[dark] .cadence-rule-plus {
  color: #f87171;
}

.cadence-rule-clear-x {
  font-style: normal;
  opacity: 0.72;
}

.cadence-speed-chip.is-live-blocked:not(.active),
.cadence-step-chip.is-live-blocked,
.cadence-seek-capsule.is-live-blocked,
.cadence-seek-capsule.is-live-blocked .cadence-seek-btn,
.cadence-speed-chip.is-ad-blocked,
.cadence-step-chip.is-ad-blocked,
.cadence-reset-chip.is-ad-blocked,
.cadence-seek-capsule.is-ad-blocked,
.cadence-seek-capsule.is-ad-blocked .cadence-seek-btn,
.cadence-rule-action-btn.is-ad-blocked {
  opacity: 0.42;
  cursor: not-allowed;
}

.cadence-speed-chip.is-live-blocked:not(.active):hover,
.cadence-step-chip.is-live-blocked:hover,
.cadence-speed-chip.is-ad-blocked:hover,
.cadence-step-chip.is-ad-blocked:hover,
.cadence-reset-chip.is-ad-blocked:hover,
.cadence-rule-action-btn.is-ad-blocked:hover {
  opacity: 0.68;
  background: rgba(245, 158, 11, 0.14);
}

.cadence-reset-chip:disabled {
  opacity: 0.42;
  cursor: default;
}

.cadence-toast-warn-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: #f59e0b;
}

.cadence-bar-toast {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2200;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 6px;
  background: #111827;
  border: 1px solid rgba(245, 158, 11, 0.52);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.36);
  color: #fde68a;
  font-family: Roboto, Arial, sans-serif;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.25;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 150ms cubic-bezier(0.16, 1, 0.3, 1),
              transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

.cadence-bar-toast.cadence-visible {
  opacity: 1;
  transform: translateY(0);
}

.cadence-player-toast {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 1200;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f8fafc;
  font-family: Roboto, Arial, sans-serif;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 150ms cubic-bezier(0.16, 1, 0.3, 1),
              transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

.cadence-player-toast.is-warning {
  background: rgba(17, 24, 39, 0.95);
  border-color: rgba(245, 158, 11, 0.52);
  color: #fde68a;
}

.cadence-player-toast.cadence-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .cadence-bar-toast,
  .cadence-player-toast {
    transition: none;
  }
}

.cadence-stopped-banner {
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 68px;
  z-index: 1200;
  overflow: hidden;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 12px 12px 10px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #f8fafc;
  font-family: Roboto, Arial, sans-serif;
  font-size: 13px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(6px);
  transition: opacity 160ms ease, transform 160ms ease;
}

.cadence-stopped-banner::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2.5px;
  background: linear-gradient(
    90deg,
    #dc2626 0%,
    rgba(220, 38, 38, 0.72) 45%,
    rgba(220, 38, 38, 0.16) 80%,
    rgba(220, 38, 38, 0) 100%
  );
  pointer-events: none;
}

.cadence-stopped-banner.cadence-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.cadence-stopped-text {
  flex: 1 1 240px;
  line-height: 1.35;
}

.cadence-stopped-saved {
  color: #34d399;
  font-weight: 700;
  font-size: 13.5px;
}

.cadence-stopped-actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
}

.cadence-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  padding: 5px 9px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.25;
  white-space: nowrap;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease, opacity 140ms ease;
}

.cadence-btn[hidden] {
  display: none;
}

.cadence-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.cadence-banner-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.cadence-home-btn {
  background: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}

.cadence-home-btn:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
}

.cadence-wl-btn {
  background: rgba(30, 41, 59, 0.88);
  border: 1.5px solid rgba(251, 113, 133, 0.82);
  color: #ffe4e6;
}

.cadence-wl-btn:hover:not(:disabled) {
  background: rgba(51, 65, 85, 0.94);
  border-color: #fda4af;
  color: #ffffff;
}

.cadence-wl-btn.is-removing {
  opacity: 0.7;
  cursor: wait;
}

.cadence-wl-btn.is-removed {
  background: rgba(16, 185, 129, 0.16);
  border-color: rgba(52, 211, 153, 0.48);
  color: #6ee7b7;
  cursor: default;
}

.cadence-wl-btn.is-error {
  background: rgba(245, 158, 11, 0.16);
  border-color: rgba(251, 191, 36, 0.52);
  color: #fde68a;
}

.cadence-dismiss-btn {
  padding: 5px 6px;
  margin-left: 2px;
  background: transparent;
  border-color: rgba(255, 255, 255, 0.14);
  color: rgba(226, 232, 240, 0.85);
}

.cadence-dismiss-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}

.cadence-dismiss-icon {
  width: 13px;
  height: 13px;
  display: block;
}
`;

  const popupHtml = `<!doctype html>
<html lang="en" style="color-scheme: dark;">
  <head>
    <meta charset="UTF-8" />
    <title>Cadence - YouTube at your speed</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: 356px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0b0f19;
        color: #f1f5f9;
        padding: 0;
      }
      .header {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        background: #111827;
        padding: 14px 16px 12px;
        border-bottom: 1px solid #1e293b;
      }
      .header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2.5px;
        background: linear-gradient(
          90deg,
          #dc2626 0%,
          rgba(220, 38, 38, 0.72) 45%,
          rgba(220, 38, 38, 0.16) 80%,
          rgba(220, 38, 38, 0) 100%
        );
        pointer-events: none;
      }
      .brand-wrap {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }
      .brand-emblem {
        width: 32px;
        height: 32px;
        flex-shrink: 0;
      }
      .brand-stack {
        display: flex;
        flex-direction: column;
        line-height: 1.15;
      }
      .brand { font-size: 16px; font-weight: 700; letter-spacing: -0.015em; color: #f8fafc; }
      .brand-tagline {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.09em;
        font-style: italic;
        color: #94a3b8;
        margin-top: 2px;
      }
      .header-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .popup-main {
        padding: 16px 16px 8px;
      }
      .version-meta {
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        font-variant-numeric: tabular-nums;
      }
      .footer-left {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .footer-sep {
        color: #475569;
        font-size: 11px;
      }
      .footer-rules-meta {
        font-size: 11px;
        color: #64748b;
        font-variant-numeric: tabular-nums;
      }
      .footer-saved-btn {
        border: none;
        background: none;
        padding: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11.5px;
        font-weight: 600;
        color: #34d399;
        font-variant-numeric: tabular-nums;
        cursor: pointer;
        white-space: nowrap;
        transition: color 0.15s;
      }
      .footer-saved-btn:hover { color: #6ee7b7; }
      .link-btn {
        border: none;
        background: none;
        color: #e2e8f0;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: underline;
        padding: 0;
      }
      .link-btn:hover { color: #ffffff; }
      .now-playing-box {
        position: relative;
        margin: 2px 0 4px;
        padding: 15px 12px 12px;
        border: 1.5px solid #334155;
        border-radius: 8px;
        background: rgba(17, 24, 39, 0.55);
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }
      .now-playing-box.is-active {
        border-color: #dc2626;
        background: rgba(220, 38, 38, 0.05);
      }
      .now-playing-legend {
        position: absolute;
        top: -8px;
        left: 10px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 0 6px;
        background: #0b0f19;
        color: #64748b;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        line-height: 1.3;
        transition: color 0.15s ease;
      }
      .now-playing-box.is-active .now-playing-legend {
        color: #f87171;
      }
      .now-playing-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #475569;
        flex-shrink: 0;
        transition: background-color 0.15s ease;
      }
      .now-playing-box.is-active .now-playing-dot {
        background: #dc2626;
      }
      .section {
        padding: 12px 0 6px;
      }
      .meta-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
      }
      .kicker { font-size: 11px; color: #94a3b8; }
      .speed-readout {
        font-size: 12px;
        font-weight: 700;
        color: #f8fafc;
        font-variant-numeric: tabular-nums;
      }
      .channel-title {
        font-size: 14px;
        font-weight: 600;
        color: #f8fafc;
        word-break: break-word;
      }
      .channel-handle {
        font-size: 11px;
        color: #94a3b8;
        margin-top: 2px;
      }
      .popup-toast {
        display: none;
        margin-top: 8px;
        padding: 6px 9px;
        border-radius: 6px;
        background: #111827;
        border: 1px solid rgba(245, 158, 11, 0.45);
        color: #fde68a;
        font-size: 11px;
        font-weight: 500;
        line-height: 1.35;
      }
      .popup-toast.visible {
        display: block;
      }
      .controls-wrap {
        margin-top: 10px;
        display: none;
        flex-direction: column;
        gap: 10px;
      }
      .preset-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }
      .preset-btn {
        padding: 7px 8px;
        border: 1px solid #334155;
        background: #111827;
        color: #e2e8f0;
        border-radius: 6px;
        text-align: left;
        cursor: pointer;
      }
      .preset-btn:hover { background: #1e293b; }
      .preset-btn.active {
        background: #dc2626;
        border-color: #dc2626;
        color: #ffffff;
      }
      .preset-name { font-size: 11px; font-weight: 500; display: block; }
      .preset-spd {
        font-size: 12px;
        font-weight: 700;
        margin-top: 2px;
        display: block;
        font-variant-numeric: tabular-nums;
      }
      .stepper-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 2px;
      }
      .stepper-label { font-size: 11px; color: #94a3b8; }
      .stepper-controls {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .step-btn {
        padding: 4px 8px;
        border: 1px solid #334155;
        background: #111827;
        color: #e2e8f0;
        border-radius: 5px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        font-variant-numeric: tabular-nums;
      }
      .step-btn:hover { background: #1e293b; }
      .preset-btn.is-blocked:not(.active),
      .step-btn.is-blocked {
        opacity: 0.45;
      }
      .step-val {
        min-width: 48px;
        text-align: center;
        font-size: 12px;
        font-weight: 700;
        color: #f8fafc;
        font-variant-numeric: tabular-nums;
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 0;
      }
      .row-label { font-size: 13px; font-weight: 500; color: #f1f5f9; }
      .row-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
      .switch {
        position: relative;
        display: inline-block;
        width: 42px;
        height: 24px;
        flex-shrink: 0;
      }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider {
        position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
        background-color: #334155; transition: .2s; border-radius: 24px;
      }
      .slider:before {
        position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
        background-color: white; transition: .2s; border-radius: 50%;
      }
      input:checked + .slider { background-color: #dc2626; }
      input:checked + .slider:before { transform: translateX(18px); }
      .footer-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #111827;
        padding: 12px 16px;
        border-top: 1px solid #1e293b;
      }
      .popup-coffee {
        text-decoration: none;
        font-size: 14px;
        opacity: 0.9;
        transition: opacity 0.15s, transform 0.15s;
        display: inline-block;
        line-height: 1;
      }
      .popup-coffee:hover {
        opacity: 1;
        transform: scale(1.15);
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="brand-wrap">
        <svg class="brand-emblem" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="0.75" y="0.75" width="18.5" height="18.5" rx="4.5" fill="#0F172A" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>
          <path d="M7.1 4.1L14.3 8.2L7.1 12.3V4.1Z" fill="#EF4444"/>
          <rect x="3.5" y="14.2" width="13" height="2.4" rx="1.2" fill="#F8FAFC"/>
          <path d="M4.7 14.2H9.35V16.6H4.7A1.2 1.2 0 0 1 4.7 14.2Z" fill="#DC2626"/>
        </svg>
        <div class="brand-stack">
          <span class="brand">Cadence</span>
          <span class="brand-tagline">YOUTUBE AT YOUR SPEED</span>
        </div>
      </div>
      <div class="header-actions">
        <a href="https://buymeacoffee.com/jayseatea" target="_blank" rel="noopener noreferrer" class="popup-coffee" title="Support Cadence on Buy Me a Coffee">☕</a>
        <span class="version-meta" id="header-version"></span>
      </div>
    </div>

    <div class="popup-main">
      <div class="now-playing-box" id="active-channel-box">
        <span class="now-playing-legend"><span class="now-playing-dot" aria-hidden="true"></span>Now Playing</span>
        <div class="meta-row">
          <span class="kicker" id="channel-status">Active YouTube Tab</span>
          <span class="speed-readout" id="active-speed-readout"></span>
        </div>
        <div class="channel-title" id="channel-name">Open a YouTube video</div>
        <div class="channel-handle" id="channel-handle"></div>
        <div class="popup-toast" id="popup-toast" role="status" aria-live="polite"></div>

        <div class="controls-wrap" id="controls-wrap">
          <div class="preset-grid" id="preset-buttons"></div>
          <div class="stepper-row">
            <span class="stepper-label">Channel Rule Fine Stepper</span>
            <div class="stepper-controls">
              <button type="button" class="step-btn" id="step-down">−0.05×</button>
              <span class="step-val" id="stepper-value">1.0×</span>
              <button type="button" class="step-btn" id="step-up">+0.05×</button>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="row">
          <div>
            <div class="row-label">Stop Playback After Video Ends</div>
            <div class="row-sub">Blocks Up Next, Watch Later &amp; Playlists</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-stop" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="row">
          <div>
            <div class="row-label">Convert Shorts to Standard Player</div>
            <div class="row-sub">Auto-redirect /shorts/ &amp; rewrite feed links</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-shorts" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="row">
          <div>
            <div class="row-label">Disable Video Previews</div>
            <div class="row-sub">Blocks hover previews on Home, Search &amp; Feeds</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="toggle-previews" />
            <span class="slider"></span>
          </label>
        </div>
      </div>
    </div>

    <div class="footer-row">
      <div class="footer-left">
        <button type="button" id="open-options" class="link-btn">All Cadence Options</button>
        <span class="footer-sep" aria-hidden="true">·</span>
        <span class="footer-rules-meta" id="footer-rules-count">0 rules</span>
      </div>
      <button type="button" id="footer-saved-time" class="footer-saved-btn" style="display:none;"></button>
    </div>

    <script src="popup.js"></script>
  </body>
</html>
`;

  const popupJs = `(async () => {
  function formatSpeed(val) {
    return Number(val).toFixed(2).replace(/\\.00$/, '.0').replace(/(\\.\\d)0$/, '$1');
  }

  function normalizeText(str) {
    return (str || '').trim().toLowerCase();
  }

  function getLocalDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return \`\${y}-\${m}-\${d}\`;
  }

  function formatCompactSavedDuration(rawSec) {
    const safeSec = Math.max(0, Math.round(Number(rawSec) || 0));
    if (safeSec === 0) return '0s';
    if (safeSec < 60) return \`\${safeSec}s\`;
    const totalMins = Math.round(safeSec / 60);
    if (totalMins < 60) return \`\${totalMins}m\`;
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins > 0 ? \`\${hrs}h \${mins}m\` : \`\${hrs}h\`;
  }

  const manifestVersion =
    chrome.runtime && typeof chrome.runtime.getManifest === 'function'
      ? chrome.runtime.getManifest().version
      : '';
  const headerVersionEl = document.getElementById('header-version');
  if (headerVersionEl && manifestVersion) {
    headerVersionEl.textContent = \`v\${manifestVersion}\`;
  }

  const stored = await chrome.storage.local.get([
    'settings',
    'rules',
    'presets',
    'totalTimeSavedSec',
    'savedTimeByDay',
  ]);
  const settings = stored.settings || {
    enabled: true,
    perChannelSpeedEnabled: true,
    stopAfterVideoEnds: true,
    showInPageControlBar: true,
    convertShortsToWatch: true,
    disableVideoPreviews: true,
    showWatchLaterRemoveAction: true,
    showSpeedToast: true,
    popupTimeSavedDisplay: 'daily',
    barTimeSavedDisplay: 'daily',
    defaultSpeed: 1.0,
    settingsSchemaVersion: 7,
  };
  let rules = Array.isArray(stored.rules) ? stored.rules : [];
  let totalTimeSavedSec = Math.max(0, Math.floor(Number(stored.totalTimeSavedSec) || 0));
  let savedTimeByDay =
    stored.savedTimeByDay && typeof stored.savedTimeByDay === 'object'
      ? stored.savedTimeByDay
      : {};
  const presets = Array.isArray(stored.presets) && stored.presets.length > 0
    ? stored.presets
    : [
        { id: 'music', label: 'Music', speed: 1.0 },
        { id: 'educational', label: 'Educational', speed: 1.5 },
        { id: 'podcast', label: 'Podcast', speed: 2.0 },
      ];

  const toggleStop = document.getElementById('toggle-stop');
  const toggleShorts = document.getElementById('toggle-shorts');
  const togglePreviews = document.getElementById('toggle-previews');
  const activeChannelBoxEl = document.getElementById('active-channel-box');
  const statusEl = document.getElementById('channel-status');
  const readoutEl = document.getElementById('active-speed-readout');
  const channelNameEl = document.getElementById('channel-name');
  const channelHandleEl = document.getElementById('channel-handle');
  const popupToastEl = document.getElementById('popup-toast');
  const controlsWrapEl = document.getElementById('controls-wrap');
  const presetGridEl = document.getElementById('preset-buttons');
  const stepperValEl = document.getElementById('stepper-value');
  const stepDownBtn = document.getElementById('step-down');
  const stepUpBtn = document.getElementById('step-up');
  const footerRulesCountEl = document.getElementById('footer-rules-count');
  const footerSavedBtnEl = document.getElementById('footer-saved-time');
  let popupToastTimer = null;

  function renderFooterMeta() {
    if (footerRulesCountEl) {
      footerRulesCountEl.textContent = \`\${rules.length} \${rules.length === 1 ? 'rule' : 'rules'}\`;
    }
    if (!footerSavedBtnEl) return;
    const mode = settings.popupTimeSavedDisplay || 'daily';
    if (mode === 'off') {
      footerSavedBtnEl.style.display = 'none';
      return;
    }
    footerSavedBtnEl.style.display = 'inline-block';
    if (mode === 'total') {
      footerSavedBtnEl.textContent = \`Saved \${formatCompactSavedDuration(totalTimeSavedSec)}\`;
      footerSavedBtnEl.title = 'Total lifetime time saved — Click to view analytics in Options';
    } else {
      const todaySec = Math.max(0, Math.floor(Number(savedTimeByDay[getLocalDateKey()]) || 0));
      footerSavedBtnEl.textContent = \`Saved \${formatCompactSavedDuration(todaySec)} today\`;
      footerSavedBtnEl.title = 'Daily time saved today — Click to view analytics in Options';
    }
  }

  renderFooterMeta();

  function showPopupToast(message) {
    if (!popupToastEl) return;
    popupToastEl.textContent = message;
    popupToastEl.classList.add('visible');
    clearTimeout(popupToastTimer);
    popupToastTimer = setTimeout(() => {
      popupToastEl.classList.remove('visible');
    }, 2400);
  }

  if (toggleStop) {
    toggleStop.checked = Boolean(settings.stopAfterVideoEnds);
  }
  if (toggleShorts) {
    toggleShorts.checked = settings.convertShortsToWatch !== false;
  }
  if (togglePreviews) {
    togglePreviews.checked = settings.disableVideoPreviews !== false;
  }

  async function updateSetting(patch) {
    Object.assign(settings, patch);
    await chrome.storage.local.set({ settings: { ...settings } });
  }

  if (toggleStop) {
    toggleStop.addEventListener('change', () => updateSetting({ stopAfterVideoEnds: toggleStop.checked }));
  }
  if (toggleShorts) {
    toggleShorts.addEventListener('change', () =>
      updateSetting({ convertShortsToWatch: toggleShorts.checked })
    );
  }
  if (togglePreviews) {
    togglePreviews.addEventListener('change', () =>
      updateSetting({ disableVideoPreviews: togglePreviews.checked })
    );
  }

  const openOptionsBtn = document.getElementById('open-options');
  if (openOptionsBtn) {
    openOptionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }
  if (footerSavedBtnEl) {
    footerSavedBtnEl.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let shouldRenderFooter = false;
    if (changes.settings && typeof changes.settings.newValue === 'object') {
      Object.assign(settings, changes.settings.newValue);
      if (toggleStop) toggleStop.checked = Boolean(settings.stopAfterVideoEnds);
      if (toggleShorts) toggleShorts.checked = settings.convertShortsToWatch !== false;
      if (togglePreviews) togglePreviews.checked = settings.disableVideoPreviews !== false;
      shouldRenderFooter = true;
    }
    if (changes.rules && Array.isArray(changes.rules.newValue)) {
      rules = changes.rules.newValue;
      shouldRenderFooter = true;
    }
    if (changes.totalTimeSavedSec && typeof changes.totalTimeSavedSec.newValue === 'number') {
      totalTimeSavedSec = Math.max(0, Math.floor(changes.totalTimeSavedSec.newValue));
      shouldRenderFooter = true;
    }
    if (changes.savedTimeByDay && typeof changes.savedTimeByDay.newValue === 'object') {
      savedTimeByDay = changes.savedTimeByDay.newValue || {};
      shouldRenderFooter = true;
    }
    if (shouldRenderFooter) {
      renderFooterMeta();
    }
  });

  function findRuleForChannel(meta) {
    if (!meta) return null;
    const chId = meta.channelId || '';
    const handle = normalizeText(meta.handle);
    const name = normalizeText(meta.channelName);
    return (
      rules.find((r) => chId && r.channelId && r.channelId === chId) ||
      rules.find((r) => handle && normalizeText(r.handle) === handle) ||
      rules.find((r) => name && normalizeText(r.channelName) === name) ||
      null
    );
  }

  async function probeTabDirectlyWithScripting(tabId) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] }).catch(() => {});
      await chrome.scripting.executeScript({ target: { tabId }, files: ['page-bridge.js'], world: 'MAIN' }).catch(() => {});
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          const player =
            document.querySelector('ytd-watch-flexy #movie_player') ||
            document.querySelector('#ytd-player #movie_player') ||
            document.getElementById('movie_player');
          const video =
            document.querySelector('ytd-watch-flexy video.html5-main-video') ||
            document.querySelector('#movie_player video.html5-main-video') ||
            document.querySelector('video.html5-main-video');
          const urlVideoId = new URLSearchParams(location.search).get('v') || '';
          let videoId = urlVideoId;
          let channelId = '';
          let channelName = '';
          let handle = '';
          let isAd = Boolean(
            player &&
              player.classList &&
              (player.classList.contains('ad-showing') ||
                player.classList.contains('ad-interrupting'))
          );
          let isLive = false;
          let isAtLiveHead = false;
          let isDvrSupported = true;

          try {
            if (player && typeof player.getPlayerResponse === 'function') {
              const resp = player.getPlayerResponse();
              if (
                resp &&
                resp.videoDetails &&
                resp.videoDetails.videoId &&
                (!urlVideoId || resp.videoDetails.videoId === urlVideoId)
              ) {
                videoId = resp.videoDetails.videoId;
                channelId = resp.videoDetails.channelId || '';
                channelName = resp.videoDetails.author || '';
                if (!isAd && resp.videoDetails.isLive === true) {
                  isLive = true;
                  if (resp.videoDetails.isLiveDvrEnabled === false) {
                    isDvrSupported = false;
                  }
                }
              }
            }
            if (player && typeof player.getVideoData === 'function') {
              const vd = player.getVideoData();
              if (vd && vd.video_id && (!urlVideoId || vd.video_id === urlVideoId)) {
                videoId = vd.video_id;
                if (!channelName) channelName = vd.author || '';
                if (!isAd && vd.isLive === true) isLive = true;
              }
            }
            const hasPlayerLiveClass = Boolean(
              player && player.classList && player.classList.contains('ytp-live')
            );
            if (!hasPlayerLiveClass && video && Number.isFinite(video.duration) && video.duration > 0) {
              isLive = false;
            } else if (!isAd && hasPlayerLiveClass) {
              const badge = document.querySelector('.ytp-chrome-bottom .ytp-live-badge, .ytp-live-badge');
              const liveTime = document.querySelector('.ytp-time-display.ytp-live');
              if (badge && liveTime && !badge.hasAttribute('hidden') && badge.offsetParent !== null) {
                isLive = true;
                isAtLiveHead = Boolean(
                  badge.classList.contains('ytp-live-badge-is-livehead') ||
                    badge.classList.contains('ytp-livehead') ||
                    badge.disabled === true ||
                    badge.hasAttribute('disabled') ||
                    badge.getAttribute('aria-disabled') === 'true'
                );
              }
              if (isLive && player && typeof player.getProgressState === 'function') {
                const ps = player.getProgressState();
                if (ps && ps.allowSeeking === false) {
                  isDvrSupported = false;
                }
                if (!isAtLiveHead && ps && ps.isAtLiveHead === true && !(video && video.paused)) {
                  isAtLiveHead = true;
                }
              }
              if (isLive && !isDvrSupported) {
                isAtLiveHead = true;
              }
            }
          } catch (_) {}

          const flexy = document.querySelector('ytd-watch-flexy');
          const flexyVid = flexy ? flexy.getAttribute('video-id') || '' : '';
          if (!urlVideoId || !flexyVid || flexyVid === urlVideoId) {
            const ownerLink =
              document.querySelector('ytd-watch-flexy ytd-watch-metadata #owner ytd-channel-name a[href]') ||
              document.querySelector('ytd-watch-flexy ytd-video-owner-renderer ytd-channel-name a[href]') ||
              document.querySelector('#owner ytd-channel-name a[href]');

            if (ownerLink) {
              const href = ownerLink.getAttribute('href') || '';
              const hMatch = href.match(/\\/(@[^/?#]+)/);
              if (hMatch) handle = hMatch[1].toLowerCase();
              const cMatch = href.match(/\\/channel\\/(UC[^/?#]+)/);
              if (cMatch && !channelId) channelId = cMatch[1];
              const txt = (ownerLink.textContent || '').trim();
              if (txt && !isAd) channelName = txt;
            }
          }

          if (!channelName && !handle && !channelId) return null;
          const rawRate = video ? Math.round(video.playbackRate * 100) / 100 : 1.0;
          return {
            channel: {
              videoId: videoId || 'active',
              channelId,
              channelName: channelName || handle,
              handle,
            },
            activeSpeed: isAd || (isLive && isAtLiveHead && rawRate > 1.01) ? 1.0 : rawRate,
            isAd,
            isLive,
            isAtLiveHead,
            isDvrSupported,
          };
        },
      });
      if (results && results[0] && results[0].result) {
        return results[0].result;
      }
    } catch (_) {}
    return null;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isYouTubeVideoUrl = Boolean(
    tab &&
      tab.id &&
      tab.url &&
      /^https?:\\/\\/([a-z0-9-]+\\.)?youtube\\.com\\/watch/i.test(tab.url)
  );

  if (!isYouTubeVideoUrl) {
    if (tab && tab.id) {
      chrome.runtime
        .sendMessage({
          type: 'CADENCE_UPDATE_BADGE',
          tabId: tab.id,
          enabled: false,
          speed: null,
        })
        .catch(() => {});
    }
    return;
  }

  let detected = null;
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'CADENCE_GET_ACTIVE_CHANNEL' });
    if (resp && resp.channel && resp.channel.channelName) {
      detected = resp;
    }
  } catch (_) {}

  if (!detected) {
    detected = await probeTabDirectlyWithScripting(tab.id);
  }

  if (!detected || !detected.channel || !detected.channel.channelName) {
    channelNameEl.textContent = 'Loading YouTube channel metadata...';
    return;
  }

  const activeChannel = detected.channel;
  let isAd = Boolean(detected.isAd);
  const isLive = Boolean(!isAd && detected.isLive);
  const isDvrSupported = detected.isDvrSupported !== false;
  let isAtLiveHead = Boolean(!isAd && detected.isLive && detected.isAtLiveHead);
  let currentRule = findRuleForChannel(activeChannel);
  let sessionOverrideSpeed =
    typeof detected.sessionOverrideSpeed === 'number' ? detected.sessionOverrideSpeed : null;
  let currentSpeed = isAd ? 1.0 : Number(detected.activeSpeed) || 1.0;
  if (isLive && isAtLiveHead && currentSpeed > 1.01) {
    currentSpeed = 1.0;
  }

  function resolveRuleBaseline(rule) {
    if (!settings.enabled || !settings.perChannelSpeedEnabled) return 1.0;
    if (!rule) return Number(settings.defaultSpeed) || 1.0;
    if (rule.presetId === 'custom') return Number(rule.customSpeed) || 1.0;
    const found = presets.find((p) => p.id === rule.presetId);
    return found ? Number(found.speed) : Number(rule.customSpeed) || 1.0;
  }

  const initialBaseline = resolveRuleBaseline(currentRule);
  if (
    !isAd &&
    sessionOverrideSpeed !== null &&
    Math.abs(sessionOverrideSpeed - initialBaseline) < 0.015
  ) {
    sessionOverrideSpeed = null;
  }

  if (
    !isAd &&
    !(isLive && isAtLiveHead) &&
    sessionOverrideSpeed === null &&
    currentRule &&
    settings.enabled &&
    settings.perChannelSpeedEnabled
  ) {
    const resolvedRuleSpeed = resolveRuleBaseline(currentRule);
    if (resolvedRuleSpeed && Math.abs(currentSpeed - resolvedRuleSpeed) > 0.02) {
      currentSpeed = resolvedRuleSpeed;
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          args: [currentSpeed],
          func: (spd) => {
            const p =
              document.querySelector('ytd-watch-flexy #movie_player') ||
              document.querySelector('#ytd-player #movie_player') ||
              document.getElementById('movie_player');
            if (p && p.classList && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'))) {
              return;
            }
            const v =
              document.querySelector('ytd-watch-flexy video.html5-main-video') ||
              document.querySelector('#movie_player video.html5-main-video') ||
              document.querySelector('video.html5-main-video');
            if (v) v.playbackRate = spd;
            try {
              if (
                p &&
                typeof p.setPlaybackRate === 'function' &&
                spd <= 2.0 &&
                Math.abs(Math.round(spd * 20) - spd * 20) < 0.001
              ) {
                const avail =
                  typeof p.getAvailablePlaybackRates === 'function'
                    ? p.getAvailablePlaybackRates()
                    : null;
                if (!Array.isArray(avail) || avail.some((r) => Math.abs(Number(r) - spd) < 0.01)) {
                  p.setPlaybackRate(spd);
                }
              }
            } catch (_) {}
          },
        })
        .catch(() => {});
    }
  }

  if (activeChannelBoxEl) {
    activeChannelBoxEl.classList.add('is-active');
  }
  controlsWrapEl.style.display = 'flex';
  channelNameEl.textContent = activeChannel.channelName;
  channelHandleEl.textContent = activeChannel.handle || activeChannel.channelId || '';

  const shortPresetLabels = {
    music: 'Music',
    educational: 'Educational',
    podcast: 'Podcast',
  };

  presetGridEl.innerHTML = presets
    .map(
      (p) => \`
      <button type="button" class="preset-btn" data-preset-id="\${p.id}" data-speed="\${p.speed}">
        <span class="preset-name">\${shortPresetLabels[p.id] || p.label}</span>
        <span class="preset-spd">\${formatSpeed(p.speed)}×</span>
      </button>
    \`
    )
    .join('');

  function renderActiveSpeedUI() {
    currentRule = findRuleForChannel(activeChannel);
    const baseline = resolveRuleBaseline(currentRule);
    if (!isAd && sessionOverrideSpeed !== null && Math.abs(sessionOverrideSpeed - baseline) < 0.015) {
      sessionOverrideSpeed = null;
    }
    if (isAd) {
      statusEl.textContent =
        sessionOverrideSpeed !== null
          ? \`Ad Playing (1.0×) · Session \${formatSpeed(sessionOverrideSpeed)}× queued\`
          : currentRule
            ? \`Ad Playing (1.0×) · Rule \${formatSpeed(baseline)}× queued\`
            : 'Ad Playing · Speed Locked (1.0×)';
      readoutEl.textContent = '1.0×';
      stepperValEl.textContent = '1.0×';
    } else if (isLive && isAtLiveHead) {
      statusEl.textContent =
        !isDvrSupported && currentSpeed < 0.99
          ? 'Rewind Unavailable · Resets to 1.0× on Catch-Up'
          : currentRule && baseline > 1.01
            ? \`Live End (1.0×) · Rule \${formatSpeed(baseline)}×\`
            : !isDvrSupported
              ? 'Live Broadcast · Rewind Disabled'
              : 'Live Broadcast · At Live End';
      readoutEl.textContent = \`\${formatSpeed(currentSpeed)}×\`;
      stepperValEl.textContent = \`\${formatSpeed(currentSpeed)}×\`;
    } else if (sessionOverrideSpeed !== null) {
      statusEl.textContent = currentRule
        ? \`Session Override · Rule is \${formatSpeed(baseline)}×\`
        : \`Session Override · Default \${formatSpeed(baseline)}×\`;
      readoutEl.textContent = \`\${formatSpeed(currentSpeed)}×\`;
      stepperValEl.textContent = \`\${formatSpeed(currentSpeed)}×\`;
    } else {
      statusEl.textContent = currentRule ? 'Saved Channel Rule' : 'Detected Channel · Default';
      readoutEl.textContent = \`\${formatSpeed(currentSpeed)}×\`;
      stepperValEl.textContent = \`\${formatSpeed(currentSpeed)}×\`;
    }

    presetGridEl.querySelectorAll('.preset-btn').forEach((btn) => {
      const pid = btn.getAttribute('data-preset-id');
      const pspd = Number(btn.getAttribute('data-speed'));
      const isSelected =
        !isAd &&
        sessionOverrideSpeed === null &&
        currentRule &&
        currentRule.presetId === pid &&
        Math.abs(currentSpeed - pspd) < 0.02;
      const blocked = isAd || (isLive && isAtLiveHead && pspd > 1.01);
      btn.classList.toggle('active', Boolean(isSelected));
      btn.classList.toggle('is-blocked', Boolean(blocked));
      if (blocked) {
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.removeAttribute('aria-disabled');
      }
    });

    if (stepDownBtn) {
      stepDownBtn.classList.toggle('is-blocked', Boolean(isAd));
      if (isAd) stepDownBtn.setAttribute('aria-disabled', 'true');
      else stepDownBtn.removeAttribute('aria-disabled');
    }
    if (stepUpBtn) {
      const upBlocked = isAd || (isLive && isAtLiveHead && currentSpeed + 0.05 > 1.01);
      stepUpBtn.classList.toggle('is-blocked', Boolean(upBlocked));
      if (upBlocked) stepUpBtn.setAttribute('aria-disabled', 'true');
      else stepUpBtn.removeAttribute('aria-disabled');
    }
  }

  async function assignSpeedFromPopup(newSpeed, presetId) {
    if (isAd) {
      renderActiveSpeedUI();
      showPopupToast('Speed locked during ad');
      chrome.tabs
        .sendMessage(tab.id, { type: 'CADENCE_ENFORCE_AD_LOCK_NOTICE' })
        .catch(() => {});
      return;
    }

    const clean = Math.round(Math.min(4.0, Math.max(0.25, Number(newSpeed) || 1.0)) * 100) / 100;
    if (isLive && isAtLiveHead && clean > 1.01) {
      currentSpeed = 1.0;
      sessionOverrideSpeed = null;
      renderActiveSpeedUI();
      showPopupToast('Stream is currently at live end');
      chrome.tabs
        .sendMessage(tab.id, { type: 'CADENCE_ENFORCE_LIVE_HEAD_LOCK' })
        .catch(() => {});
      chrome.runtime
        .sendMessage({
          type: 'CADENCE_UPDATE_BADGE',
          tabId: tab.id,
          enabled: Boolean(settings.enabled && settings.perChannelSpeedEnabled),
          speed: 1.0,
        })
        .catch(() => {});
      return;
    }

    try {
      const preCheck = await chrome.tabs.sendMessage(tab.id, { type: 'CADENCE_GET_ACTIVE_CHANNEL' });
      if (preCheck && preCheck.isAd) {
        isAd = true;
        currentSpeed = 1.0;
        renderActiveSpeedUI();
        showPopupToast('Speed locked during ad');
        chrome.tabs
          .sendMessage(tab.id, { type: 'CADENCE_ENFORCE_AD_LOCK_NOTICE' })
          .catch(() => {});
        return;
      }
    } catch (_) {}

    currentSpeed = clean;
    sessionOverrideSpeed = null;
    if (isLive && clean < 0.99 && isDvrSupported) {
      isAtLiveHead = false;
    }

    const existingIdx = rules.findIndex(
      (r) =>
        (activeChannel.channelId && r.channelId && r.channelId === activeChannel.channelId) ||
        (activeChannel.handle && normalizeText(r.handle) === normalizeText(activeChannel.handle)) ||
        normalizeText(r.channelName) === normalizeText(activeChannel.channelName)
    );

    const updatedRule = {
      id: existingIdx >= 0 ? rules[existingIdx].id : 'rule-' + Date.now(),
      channelName: activeChannel.channelName,
      handle: activeChannel.handle || '@' + activeChannel.channelName.toLowerCase().replace(/\\s+/g, ''),
      channelId: activeChannel.channelId || '',
      presetId: presetId || 'custom',
      customSpeed: clean,
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    if (existingIdx >= 0) {
      rules[existingIdx] = updatedRule;
    } else {
      rules = [updatedRule, ...rules];
    }

    await chrome.storage.local.set({ rules });
    renderActiveSpeedUI();

    chrome.tabs
      .sendMessage(tab.id, {
        type: 'CADENCE_SET_CHANNEL_SPEED',
        channel: activeChannel,
        speed: clean,
        presetId: presetId || 'custom',
      })
      .catch(() => {});

    chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        args: [clean],
        func: (spd) => {
          const p =
            document.querySelector('ytd-watch-flexy #movie_player') ||
            document.querySelector('#ytd-player #movie_player') ||
            document.getElementById('movie_player');
          if (p && p.classList && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'))) {
            return;
          }
          const v =
            document.querySelector('ytd-watch-flexy video.html5-main-video') ||
            document.querySelector('#movie_player video.html5-main-video') ||
            document.querySelector('video.html5-main-video');
          if (v) v.playbackRate = spd;
          try {
            if (
              p &&
              typeof p.setPlaybackRate === 'function' &&
              spd >= 0.25 &&
              spd <= 2.0 &&
              Math.abs(Math.round(spd * 20) - spd * 20) < 0.001
            ) {
              const avail =
                typeof p.getAvailablePlaybackRates === 'function'
                  ? p.getAvailablePlaybackRates()
                  : null;
              if (!Array.isArray(avail) || avail.some((r) => Math.abs(Number(r) - spd) < 0.01)) {
                p.setPlaybackRate(spd);
              }
            }
          } catch (_) {}
        },
      })
      .catch(() => {});

    chrome.runtime
      .sendMessage({
        type: 'CADENCE_UPDATE_BADGE',
        tabId: tab.id,
        enabled: true,
        speed: clean,
      })
      .catch(() => {});
  }

  presetGridEl.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pid = btn.getAttribute('data-preset-id');
      const spd = Number(btn.getAttribute('data-speed'));
      assignSpeedFromPopup(spd, pid);
    });
  });

  stepDownBtn.addEventListener('click', () => {
    assignSpeedFromPopup(Math.max(0.25, currentSpeed - 0.05), 'custom');
  });

  stepUpBtn.addEventListener('click', () => {
    assignSpeedFromPopup(Math.min(4.0, currentSpeed + 0.05), 'custom');
  });

  renderActiveSpeedUI();
})();
`;

  const defaultPresetsJson = JSON.stringify(DEFAULT_PRESETS, null, 2);

  const optionsHtml = `<!doctype html>
<html lang="en" style="color-scheme: dark;">
  <head>
    <meta charset="UTF-8" />
    <title>Cadence - YouTube at your speed · Options</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0b0f19;
        color: #f1f5f9;
        padding: 36px 24px;
      }
      .container { max-width: 900px; margin: 0 auto; }
      .top-header {
        position: relative;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        padding-bottom: 20px;
        margin-bottom: 24px;
      }
      .top-header::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2.5px;
        border-radius: 999px;
        background: linear-gradient(
          90deg,
          #dc2626 0%,
          rgba(220, 38, 38, 0.72) 45%,
          rgba(220, 38, 38, 0.16) 80%,
          rgba(220, 38, 38, 0) 100%
        );
        pointer-events: none;
      }
      .title-row {
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }
      .title-emblem {
        width: 44px;
        height: 44px;
        flex-shrink: 0;
      }
      .title-stack {
        display: flex;
        flex-direction: column;
      }
      .title-main-line {
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex-wrap: wrap;
      }
      h1 { font-size: 27px; font-weight: 700; color: #f8fafc; letter-spacing: -0.02em; line-height: 1; }
      .title-tagline {
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: 0.11em;
        font-style: italic;
        color: #94a3b8;
        margin-top: 6px;
      }
      .version-meta {
        font-size: 13px;
        font-weight: 500;
        color: #94a3b8;
        font-variant-numeric: tabular-nums;
      }
      .sub { color: #94a3b8; font-size: 14px; max-width: 580px; line-height: 1.5; }
      .toolbar-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .status-banner {
        display: none;
        padding: 10px 14px;
        margin-bottom: 20px;
        border-radius: 8px;
        background: #111827;
        border: 1px solid #334155;
        color: #e2e8f0;
        font-size: 13px;
      }
      .status-banner.visible { display: block; }

      /* Collapsible Panel Chrome (v1.7.1) */
      .panel {
        background: #111827;
        border: 1px solid #1e293b;
        border-radius: 10px;
        margin-bottom: 16px;
        overflow: hidden;
      }
      .panel-header-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 15px 20px;
        background: transparent;
        border: none;
        color: inherit;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }
      .panel-header-btn:hover { background: rgba(30, 41, 59, 0.45); }
      .panel-header-btn:focus-visible { outline: 2px solid #475569; outline-offset: -2px; }
      .panel-header-left {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
        flex: 1;
      }
      .panel-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .panel-icon svg { width: 16px; height: 16px; }
      .panel-icon.icon-red { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.28); color: #f87171; }
      .panel-icon.icon-emerald { background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.28); color: #34d399; }
      .panel-icon.icon-sky { background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.28); color: #38bdf8; }
      .panel-icon.icon-amber { background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.28); color: #fbbf24; }
      .panel-title-wrap { min-width: 0; flex: 1; }
      .panel-title-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
      h2 { font-size: 16px; font-weight: 600; color: #f8fafc; }
      .panel-sub { font-size: 12px; color: #64748b; }
      .panel-summary {
        margin-top: 3px;
        font-size: 12px;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-variant-numeric: tabular-nums;
      }
      .panel.is-expanded .panel-summary { display: none; }
      .text-emerald { color: #34d399; font-weight: 600; }
      .text-muted { color: #64748b; }
      .panel-expand-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 6px;
        border: 1px solid #1e293b;
        background: #0b0f19;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 600;
        flex-shrink: 0;
        transition: color 0.15s, border-color 0.15s;
      }
      .panel-header-btn:hover .panel-expand-pill { color: #f8fafc; border-color: #334155; }
      .panel-chevron { width: 14px; height: 14px; transition: transform 0.15s ease; }
      .panel.is-expanded .panel-chevron { transform: rotate(180deg); }
      .panel-body {
        display: none;
        padding: 18px 20px 20px;
        border-top: 1px solid rgba(30, 41, 59, 0.85);
      }
      .panel.is-expanded .panel-body { display: block; }

      /* Toggle switch styles & grouped separation */
      .options-group {
        background: #0b0f19;
        border: 1px solid #1e293b;
        border-radius: 8px;
        padding: 4px 16px;
      }
      .options-group + .options-group {
        margin-top: 14px;
      }
      .options-group-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 0 8px;
        border-bottom: 1px solid #1e293b;
      }
      .options-group-title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px 0;
        border-top: 1px solid #1e293b;
      }
      .options-group-head + .toggle-row { border-top: none; }
      .toggle-info h3 { font-size: 13px; font-weight: 600; color: #f1f5f9; }
      .toggle-info p { font-size: 12px; color: #94a3b8; margin-top: 2px; }
      .switch {
        position: relative;
        display: inline-block;
        width: 42px;
        height: 24px;
        flex-shrink: 0;
      }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider {
        position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
        background-color: #334155; transition: .2s; border-radius: 24px;
      }
      .slider:before {
        position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
        background-color: white; transition: .2s; border-radius: 50%;
      }
      input:checked + .slider { background-color: #dc2626; }
      input:checked + .slider:before { transform: translateX(18px); }

      /* Panel 02: Dual Readout Bar, Merged Option B Metric Band & Unified Chart Stage */
      .readout-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px 16px;
        padding-bottom: 14px;
        margin-bottom: 14px;
        border-bottom: 1px solid #1e293b;
      }
      .readout-menus-wrap {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 16px;
      }
      .readout-block { display: flex; flex-direction: column; gap: 6px; }
      .readout-head {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .readout-label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #cbd5e1;
      }
      .readout-preview {
        font-size: 11px;
        color: #64748b;
        font-variant-numeric: tabular-nums;
      }
      .readout-preview strong {
        color: #cbd5e1;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 600;
      }
      .segmented-control {
        display: inline-flex;
        padding: 3px;
        border-radius: 7px;
        background: #0b0f19;
        border: 1px solid #1e293b;
        gap: 2px;
      }
      .seg-btn {
        border: 1px solid transparent;
        background: transparent;
        color: #94a3b8;
        padding: 5px 10px;
        border-radius: 5px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: background-color 0.15s, color 0.15s, border-color 0.15s;
      }
      .seg-btn:hover { color: #f8fafc; }
      .seg-btn.active {
        background: #1e293b;
        border-color: #475569;
        color: #f8fafc;
        font-weight: 600;
      }

      .inline-confirm-box {
        margin-bottom: 14px;
        padding: 14px;
        background: #181216;
        border: 1px solid #ef4444;
        border-radius: 8px;
        display: none;
      }
      .inline-confirm-box.visible { display: block; }
      .confirm-prompt { font-size: 12px; color: #fca5a5; font-weight: 600; margin-bottom: 8px; }
      .confirm-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

      .metric-band {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
        background: #0b0f19;
        border: 1px solid #1e293b;
        border-radius: 8px;
        padding: 14px 16px;
        margin-bottom: 14px;
      }
      @media (min-width: 720px) {
        .metric-band { grid-template-columns: 235px minmax(0, 1fr); align-items: center; }
      }
      .hero-meta-kicker {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #94a3b8;
      }
      .stat-val {
        font-size: 26px;
        font-weight: 700;
        color: #34d399;
        font-variant-numeric: tabular-nums;
        line-height: 1.15;
        margin-top: 2px;
      }
      .stat-since { font-size: 12px; font-weight: 500; color: #94a3b8; margin-top: 4px; }
      .stat-sub { font-size: 11px; color: #64748b; margin-top: 2px; font-variant-numeric: tabular-nums; }
      .stat-legacy-note {
        font-size: 11px;
        color: #fbbf24;
        margin-top: 6px;
        line-height: 1.35;
      }

      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        padding-top: 12px;
        border-top: 1px solid #1e293b;
      }
      @media (min-width: 520px) {
        .kpi-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      }
      @media (min-width: 720px) {
        .kpi-grid { padding-top: 0; padding-left: 16px; border-top: none; border-left: 1px solid #1e293b; }
      }
      .kpi-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #94a3b8;
      }
      .kpi-value {
        font-size: 18px;
        font-weight: 700;
        color: #f8fafc;
        font-variant-numeric: tabular-nums;
        margin-top: 3px;
      }
      .kpi-sub { font-size: 11px; color: #64748b; margin-top: 2px; font-variant-numeric: tabular-nums; }

      .chart-stage {
        background: #0b0f19;
        border: 1px solid #1e293b;
        border-radius: 8px;
        padding: 14px 16px;
      }
      .chart-header {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px 14px;
        margin-bottom: 12px;
      }
      .chart-title-block { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .chart-select-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
      }
      .chart-view-select {
        appearance: none;
        background: #111827;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 5px 28px 5px 10px;
        font-size: 13px;
        font-weight: 600;
        color: #f8fafc;
        cursor: pointer;
        outline: none;
        transition: border-color 0.15s ease, background-color 0.15s ease;
      }
      .chart-view-select:hover { border-color: #475569; background: #1e293b; }
      .chart-view-select:focus,
      .chart-view-select:focus-visible { outline: none; border-color: #64748b; }
      .chart-select-chevron {
        position: absolute;
        right: 8px;
        width: 14px;
        height: 14px;
        color: #94a3b8;
        pointer-events: none;
      }
      .chart-breadcrumb {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        color: #64748b;
        flex-wrap: wrap;
      }
      .crumb-btn {
        border: none;
        background: none;
        padding: 0;
        color: #94a3b8;
        font-size: 11px;
        cursor: pointer;
      }
      .crumb-btn:hover { color: #f8fafc; text-decoration: underline; }
      .crumb-current { color: #cbd5e1; font-weight: 600; }
      .chart-controls-right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .chart-hint-inline { font-size: 11px; color: #64748b; font-variant-numeric: tabular-nums; }
      .nav-capsule {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        background: #111827;
        border: 1px solid #1e293b;
        border-radius: 6px;
        padding: 2px;
      }
      .nav-step-btn {
        border: none;
        background: transparent;
        color: #94a3b8;
        padding: 3px 7px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      .nav-step-btn:hover:not(:disabled) { color: #f8fafc; background: #1e293b; }
      .nav-step-btn:disabled { opacity: 0.32; cursor: not-allowed; }
      .nav-period-btn {
        border: none;
        background: transparent;
        color: #cbd5e1;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        min-width: 76px;
        text-align: center;
        cursor: pointer;
      }
      .nav-period-btn:hover:not(:disabled) { color: #ffffff; background: #1e293b; }

      .chart-range-sub {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
        font-size: 11px;
        color: #94a3b8;
        font-variant-numeric: tabular-nums;
      }
      .empty-bucket-notice {
        margin-bottom: 12px;
        padding: 10px 12px;
        border-radius: 7px;
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid #1e293b;
        font-size: 12px;
        line-height: 1.45;
        color: #cbd5e1;
      }

      /* Bar plot layout */
      .bar-plot {
        display: grid;
        gap: 8px;
        align-items: end;
      }
      .bar-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        min-width: 0;
        background: transparent;
        border: none;
        padding: 0;
        color: inherit;
        font-family: inherit;
        cursor: pointer;
      }
      .bar-col.is-non-interactive { cursor: default; }
      .bar-top-val {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10px;
        font-variant-numeric: tabular-nums;
        color: #64748b;
        white-space: nowrap;
        min-height: 14px;
        transition: color 0.12s;
      }
      .bar-track {
        width: 100%;
        height: 120px;
        border-radius: 6px;
        background: rgba(17, 24, 39, 0.72);
        border: 1px solid rgba(30, 41, 59, 0.7);
        display: flex;
        align-items: flex-end;
        padding: 4px;
        transition: border-color 0.12s, background-color 0.12s;
      }
      .bar-col.is-hovered .bar-track {
        border-color: rgba(100, 116, 139, 0.85);
        background: rgba(30, 41, 59, 0.55);
      }
      .bar-col.is-hovered .bar-top-val { color: #f8fafc; }
      .bar-fill {
        width: 100%;
        border-radius: 3px;
        transition: height 0.25s ease, background-color 0.15s ease;
      }
      .bar-axis {
        text-align: center;
        line-height: 1.25;
      }
      .bar-axis-main {
        display: block;
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        transition: color 0.12s;
      }
      .bar-axis-sub {
        display: block;
        font-size: 10px;
        color: #64748b;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .bar-col.is-current-emerald .bar-axis-main { color: #34d399; }
      .bar-col.is-current-sky .bar-axis-main { color: #38bdf8; }
      .bar-col.is-current-amber .bar-axis-main { color: #fbbf24; }
      .bar-col.is-hovered:not(.is-current-emerald):not(.is-current-sky):not(.is-current-amber) .bar-axis-main {
        color: #f8fafc;
      }

      /* Consistency Heatmap + Weekday Pace */
      .consistency-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
      }
      @media (min-width: 720px) {
        .consistency-grid { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); }
      }
      .heatmap-wrap { overflow-x: auto; padding-bottom: 4px; }
      .heatmap-inner { display: inline-flex; flex-direction: column; gap: 4px; min-width: max-content; }
      .heatmap-months {
        display: grid;
        grid-template-columns: 28px repeat(12, 18px);
        gap: 4px;
        font-size: 10px;
        color: #64748b;
        margin-bottom: 2px;
      }
      .heatmap-row {
        display: grid;
        grid-template-columns: 28px repeat(12, 18px);
        gap: 4px;
        align-items: center;
      }
      .heatmap-day-label { font-size: 10px; color: #64748b; }
      .heat-cell {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        border: 1px solid rgba(30, 41, 59, 0.65);
        background: #111827;
        cursor: pointer;
        padding: 0;
        transition: transform 0.1s;
      }
      .heat-cell:hover { transform: scale(1.1); }
      .heat-cell.is-future { border-color: rgba(30, 41, 59, 0.35); background: rgba(17, 24, 39, 0.35); opacity: 0.4; cursor: default; }
      .heat-cell.lvl-1 { background: rgba(6, 78, 59, 0.8); border-color: rgba(6, 95, 70, 0.9); }
      .heat-cell.lvl-2 { background: rgba(4, 120, 87, 0.85); border-color: rgba(5, 150, 105, 0.9); }
      .heat-cell.lvl-3 { background: rgba(16, 185, 129, 0.88); border-color: rgba(52, 211, 153, 0.9); }
      .heat-cell.lvl-4 { background: #34d399; border-color: #6ee7b7; }
      .heat-cell.is-today { box-shadow: 0 0 0 1px rgba(248, 250, 252, 0.85); }
      .legend-scale { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: #64748b; }
      .legend-box { width: 10px; height: 10px; border-radius: 2px; border: 1px solid #1e293b; }

      .rhythm-panel {
        border-top: 1px solid #1e293b;
        padding-top: 12px;
      }
      @media (min-width: 720px) {
        .rhythm-panel { border-top: none; padding-top: 0; border-left: 1px solid #1e293b; padding-left: 16px; }
      }
      .rhythm-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: #94a3b8;
        margin-bottom: 8px;
      }
      .rhythm-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 4px;
        border-radius: 4px;
        font-size: 11px;
      }
      .rhythm-row.is-hovered { background: rgba(30, 41, 59, 0.7); }
      .rhythm-day { width: 28px; color: #94a3b8; font-weight: 500; flex-shrink: 0; }
      .rhythm-bar-bg {
        flex: 1;
        height: 8px;
        border-radius: 4px;
        background: #111827;
        border: 1px solid rgba(30, 41, 59, 0.7);
        overflow: hidden;
      }
      .rhythm-bar-fill { height: 100%; border-radius: 4px; background: rgba(56, 189, 248, 0.72); }
      .rhythm-bar-fill.is-top { background: #34d399; }
      .rhythm-val {
        width: 58px;
        text-align: right;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10.5px;
        font-variant-numeric: tabular-nums;
        color: #cbd5e1;
      }

      .chart-footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(30, 41, 59, 0.85);
        font-size: 11.5px;
        font-variant-numeric: tabular-nums;
      }
      .chart-footer-inspect { color: #cbd5e1; font-weight: 500; }
      .chart-footer-muted { color: #64748b; }
      .chart-footer-stats { color: #64748b; }
      .chart-footer-stats strong { color: #e2e8f0; }

      /* Rows & inputs */
      .preset-row, .rule-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-top: 1px solid #1e293b;
      }
      .preset-row:first-of-type, .rule-row:first-of-type { border-top: none; }
      input[type="text"], input[type="number"], select {
        padding: 7px 10px;
        background: #0b0f19;
        color: #f1f5f9;
        border: 1px solid #334155;
        border-radius: 6px;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }
      .add-form { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
      .add-form input[type="text"] { flex: 1; min-width: 180px; }

      /* Filter & Pagination Controls */
      .filter-toolbar {
        background: #0b0f19;
        border: 1px solid #1e293b;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .filter-row-top {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      .filter-search-input { flex: 1; min-width: 220px; }
      .pill-group { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
      .pill-btn {
        background: #111827;
        color: #94a3b8;
        border: 1px solid #334155;
        padding: 5px 11px;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
      }
      .pill-btn:hover { color: #f8fafc; border-color: #475569; }
      .pill-btn.active { background: #38bdf8; color: #0b0f19; border-color: #38bdf8; }
      .filter-row-bottom {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding-top: 8px;
        border-top: 1px solid #1e293b;
        font-size: 12px;
        color: #94a3b8;
      }
      .sort-controls { display: flex; align-items: center; gap: 8px; }
      .pagination-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid #1e293b;
        font-size: 12px;
        color: #94a3b8;
      }
      .page-btn-group { display: flex; gap: 4px; align-items: center; }
      .page-btn {
        background: #0b0f19;
        color: #cbd5e1;
        border: 1px solid #334155;
        padding: 5px 10px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .page-btn:hover:not(:disabled) { background: #1e293b; color: #fff; }
      .page-btn.active { background: #dc2626; color: #fff; border-color: #dc2626; font-weight: 600; }
      .page-btn:disabled { opacity: 0.35; cursor: not-allowed; }

      /* Buttons */
      button.primary {
        background: #dc2626;
        color: #ffffff;
        border: none;
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      button.primary:hover { background: #ef4444; }
      button.ghost {
        background: #111827;
        color: #cbd5e1;
        border: 1px solid #334155;
        padding: 7px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      button.ghost:hover { color: #f8fafc; background: #1e293b; border-color: #475569; }
      button.row-remove {
        background: transparent;
        color: #94a3b8;
        border: 1px solid #334155;
        padding: 5px 10px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
      }
      button.row-remove:hover { color: #f87171; border-color: #ef4444; }
      button.danger-btn {
        background: #dc2626;
        color: #ffffff;
        border: 1px solid #ef4444;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      button.danger-btn:hover:not(:disabled) { background: #b91c1c; }
      button.danger-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .coffee-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #f59e0b;
        color: #0b0f19;
        font-weight: 700;
        font-size: 12px;
        padding: 7px 12px;
        border-radius: 6px;
        text-decoration: none;
        white-space: nowrap;
        transition: background 0.15s, transform 0.15s;
      }
      .coffee-btn:hover { background: #fbbf24; color: #0b0f19; transform: translateY(-1px); }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="top-header">
        <div>
          <div class="title-row">
            <svg class="title-emblem" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="0.75" y="0.75" width="18.5" height="18.5" rx="4.5" fill="#0F172A" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>
              <path d="M7.1 4.1L14.3 8.2L7.1 12.3V4.1Z" fill="#EF4444"/>
              <rect x="3.5" y="14.2" width="13" height="2.4" rx="1.2" fill="#F8FAFC"/>
              <path d="M4.7 14.2H9.35V16.6H4.7A1.2 1.2 0 0 1 4.7 14.2Z" fill="#DC2626"/>
            </svg>
            <div class="title-stack">
              <div class="title-main-line">
                <h1>Cadence</h1>
                <span id="ext-version" class="version-meta"></span>
              </div>
              <span class="title-tagline">YOUTUBE AT YOUR SPEED</span>
            </div>
          </div>
          <p class="sub">Configure category speed profiles, inspect your daily and monthly time saved analytics, manage per-channel rules, or back up your setup as JSON.</p>
        </div>
        <div class="toolbar-actions">
          <button type="button" id="btn-toggle-expand-all" class="ghost">Expand All</button>
          <input type="file" id="import-json-input" accept="application/json,.json" style="display:none;" />
          <button type="button" id="btn-import-json" class="ghost">Import JSON</button>
          <button type="button" id="btn-export-json" class="ghost">Backup JSON</button>
          <button type="button" id="btn-reset-presets" class="ghost">Reset Presets</button>
          <a href="https://buymeacoffee.com/jayseatea" target="_blank" rel="noopener noreferrer" class="coffee-btn" title="Support Cadence on Buy Me a Coffee">☕ Buy Me a Coffee</a>
        </div>
      </div>

      <div id="status-banner" class="status-banner" role="status" aria-live="polite"></div>

      <!-- Panel 01: Playback & Feed Controls -->
      <section class="panel" data-panel="01">
        <button type="button" class="panel-header-btn" data-panel-toggle="01" aria-expanded="false">
          <span class="panel-header-left">
            <span class="panel-icon icon-red" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
                <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
              </svg>
            </span>
            <span class="panel-title-wrap">
              <span class="panel-title-row">
                <h2>01. Playback &amp; Feed Controls</h2>
                <span class="panel-sub">Global player defaults</span>
              </span>
              <span id="summary-01" class="panel-summary"></span>
            </span>
          </span>
          <span class="panel-expand-pill">
            <span class="panel-toggle-label">Expand</span>
            <svg class="panel-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </button>
        <div class="panel-body">
          <div class="options-group">
            <div class="options-group-head">
              <span class="options-group-title">Quick Playback &amp; Feed Toggles</span>
            </div>
            <div class="toggle-row">
              <div class="toggle-info">
                <h3>Stop Playback After Video Ends</h3>
                <p>Pause when current video completes and prevent autoplay queues, Watch Later, or playlist leaps.</p>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-stop" />
                <span class="slider"></span>
              </label>
            </div>
            <div class="toggle-row">
              <div class="toggle-info">
                <h3>Convert Shorts to Standard Player</h3>
                <p>Automatically redirect vertical Shorts into YouTube's full-featured desktop player and rewrite feed links.</p>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-shorts" />
                <span class="slider"></span>
              </label>
            </div>
            <div class="toggle-row">
              <div class="toggle-info">
                <h3>Disable Video Previews</h3>
                <p>Block autoplay hover previews on Home, Search, and Feeds while keeping channel trailers intact.</p>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-previews" />
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="options-group">
            <div class="options-group-head">
              <span class="options-group-title">Core Cadence &amp; End-of-Video Controls</span>
            </div>
            <div class="toggle-row">
              <div class="toggle-info">
                <h3>Per-Channel Playback Speed</h3>
                <p>Remember and restore custom playback speeds automatically for individual creators.</p>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-speed" />
                <span class="slider"></span>
              </label>
            </div>
            <div class="toggle-row">
              <div class="toggle-info">
                <h3>Show Speed Bar Below Video</h3>
                <p>Mount the full-width Cadence 3-row speed, skip, and rule deck directly above the YouTube player title.</p>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-bar" />
                <span class="slider"></span>
              </label>
            </div>
            <div class="toggle-row">
              <div class="toggle-info">
                <h3>Show &ldquo;Remove from Watch Later&rdquo; on Video End</h3>
                <p>Check your logged-in Watch Later playlist when a video ends so you can remove it directly from the player pop-up.</p>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-watch-later" />
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- Panel 02: Lifetime Time Saved & Analytics -->
      <section class="panel" data-panel="02">
        <button type="button" class="panel-header-btn" data-panel-toggle="02" aria-expanded="false">
          <span class="panel-header-left">
            <span class="panel-icon icon-emerald" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </span>
            <span class="panel-title-wrap">
              <span class="panel-title-row">
                <h2>02. Lifetime Time Saved</h2>
                <span class="panel-sub">Accelerated playback analytics &amp; readout</span>
              </span>
              <span id="summary-02" class="panel-summary"></span>
            </span>
          </span>
          <span class="panel-expand-pill">
            <span class="panel-toggle-label">Expand</span>
            <svg class="panel-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </button>
        <div class="panel-body">
          <div class="readout-toolbar">
            <div class="readout-menus-wrap">
              <div class="readout-block">
                <div class="readout-head">
                  <span class="readout-label">Toolbar Popup Readout</span>
                  <span id="preview-popup-readout" class="readout-preview"></span>
                </div>
                <div class="segmented-control" id="popup-mode-controls" role="group" aria-label="Toolbar Popup Readout">
                  <button type="button" class="seg-btn" data-popup-mode="total">Total Time Saved</button>
                  <button type="button" class="seg-btn" data-popup-mode="daily">Daily Time Saved</button>
                  <button type="button" class="seg-btn" data-popup-mode="off">Off</button>
                </div>
              </div>
              <div class="readout-block">
                <div class="readout-head">
                  <span class="readout-label">Below-Video Bar Readout</span>
                  <span id="preview-bar-readout" class="readout-preview"></span>
                </div>
                <div class="segmented-control" id="bar-mode-controls" role="group" aria-label="Below-Video Bar Readout">
                  <button type="button" class="seg-btn" data-bar-mode="total">Total Time Saved</button>
                  <button type="button" class="seg-btn" data-bar-mode="daily">Daily Time Saved</button>
                  <button type="button" class="seg-btn" data-bar-mode="off">Off</button>
                </div>
              </div>
            </div>
            <button type="button" id="btn-open-reset" class="row-remove">Reset Counter</button>
          </div>

          <div id="reset-confirm-box" class="inline-confirm-box">
            <div class="confirm-prompt">Type "Forget Time Saved" to confirm resetting all lifetime and daily history:</div>
            <div class="confirm-row">
              <input type="text" id="input-confirm-forget" placeholder="Forget Time Saved" style="flex:1;min-width:200px;" autocomplete="off" />
              <button type="button" id="btn-confirm-forget" class="danger-btn" disabled>Confirm Reset</button>
              <button type="button" id="btn-cancel-forget" class="ghost">Cancel</button>
            </div>
          </div>

          <div class="metric-band">
            <div>
              <div class="hero-meta-kicker">Lifetime Time Saved</div>
              <div id="stat-saved-value" class="stat-val">0s</div>
              <div id="stat-since-line" class="stat-since">Since —</div>
              <div id="stat-store-line" class="stat-sub">0 tracked days - 0.1 KB local store</div>
              <div id="stat-legacy-line" class="stat-legacy-note" style="display:none;"></div>
            </div>
            <div class="kpi-grid">
              <div>
                <div class="kpi-label">Today</div>
                <div id="kpi-today-val" class="kpi-value">0s</div>
                <div id="kpi-today-sub" class="kpi-sub">Active session</div>
              </div>
              <div>
                <div class="kpi-label">This Week</div>
                <div id="kpi-week-val" class="kpi-value">0s</div>
                <div id="kpi-week-sub" class="kpi-sub">Avg 0s / day</div>
              </div>
              <div>
                <div class="kpi-label">This Month</div>
                <div id="kpi-month-val" class="kpi-value">0s</div>
                <div id="kpi-month-sub" class="kpi-sub">0 active days</div>
              </div>
              <div>
                <div class="kpi-label">Streak</div>
                <div id="kpi-streak-val" class="kpi-value">0d</div>
                <div id="kpi-streak-sub" class="kpi-sub">Best day —</div>
              </div>
            </div>
          </div>

          <div id="chart-stage" class="chart-stage">
            <div class="chart-header">
              <div class="chart-title-block">
                <div class="chart-select-wrap">
                  <select id="select-chart-view" class="chart-view-select" aria-label="Select Saved Time Graph">
                    <option value="weekly">Weekly Breakdown (Mon–Sun)</option>
                    <option value="four_week">4-Week History (Mon–Sun Weeks)</option>
                    <option value="monthly_trend">Long-Term Monthly Trend</option>
                    <option value="consistency">12-Week Rhythm &amp; Weekday Pace</option>
                  </select>
                  <svg class="chart-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <div id="chart-breadcrumb" class="chart-breadcrumb"></div>
              </div>
              <div id="chart-controls-right" class="chart-controls-right"></div>
            </div>
            <div id="chart-sub-row" class="chart-range-sub"></div>
            <div id="chart-empty-notice" class="empty-bucket-notice" style="display:none;"></div>
            <div id="chart-body"></div>
            <div id="chart-footer" class="chart-footer"></div>
          </div>
        </div>
      </section>

      <!-- Panel 03: Category Speed Profiles -->
      <section class="panel" data-panel="03">
        <button type="button" class="panel-header-btn" data-panel-toggle="03" aria-expanded="false">
          <span class="panel-header-left">
            <span class="panel-icon icon-sky" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>
              </svg>
            </span>
            <span class="panel-title-wrap">
              <span class="panel-title-row">
                <h2>03. Category Speed Profiles</h2>
                <span class="panel-sub">Applies to linked channels</span>
              </span>
              <span id="summary-03" class="panel-summary"></span>
            </span>
          </span>
          <span class="panel-expand-pill">
            <span class="panel-toggle-label">Expand</span>
            <svg class="panel-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </button>
        <div class="panel-body">
          <div id="presets-list"></div>
        </div>
      </section>

      <!-- Panel 04: Saved Channel Speed Rules -->
      <section class="panel" data-panel="04">
        <button type="button" class="panel-header-btn" data-panel-toggle="04" aria-expanded="false">
          <span class="panel-header-left">
            <span class="panel-icon icon-amber" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </span>
            <span class="panel-title-wrap">
              <span class="panel-title-row">
                <h2>04. Saved Channel Speed Rules</h2>
                <span id="rules-count" class="panel-sub">0 saved</span>
              </span>
              <span id="summary-04" class="panel-summary"></span>
            </span>
          </span>
          <span class="panel-expand-pill">
            <span class="panel-toggle-label">Expand</span>
            <svg class="panel-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </button>
        <div class="panel-body">
          <form id="add-rule-form" class="add-form">
            <input type="text" id="input-name" placeholder="Channel name (e.g. Veritasium)" required />
            <input type="text" id="input-handle" placeholder="@handle (optional)" />
            <select id="input-preset">
              <option value="music">Music (1.0×)</option>
              <option value="educational" selected>Educational (1.5×)</option>
              <option value="podcast">Podcast / Lecture (2.0×)</option>
              <option value="custom">Custom Speed</option>
            </select>
            <input type="number" id="input-speed" step="0.05" min="0.25" max="4" value="1.5" style="width: 88px;" />
            <button type="submit" class="primary">Save Channel</button>
          </form>

          <div class="filter-toolbar">
            <div class="filter-row-top">
              <input type="text" id="input-rule-search" class="filter-search-input" placeholder="Search channel name or @handle..." />
              <div class="pill-group" id="category-pills">
                <button type="button" class="pill-btn active" data-category="all">All</button>
                <button type="button" class="pill-btn" data-category="educational">Educational</button>
                <button type="button" class="pill-btn" data-category="podcast">Podcast</button>
                <button type="button" class="pill-btn" data-category="music">Music</button>
                <button type="button" class="pill-btn" data-category="custom">Custom</button>
              </div>
            </div>
            <div class="filter-row-bottom">
              <div class="sort-controls">
                <label for="select-sort">Sort by:</label>
                <select id="select-sort">
                  <option value="recent">Recently updated</option>
                  <option value="name">Channel Name A–Z</option>
                  <option value="speed">Speed (Highest to Lowest)</option>
                </select>
              </div>
              <div class="sort-controls">
                <label for="select-page-size">Show:</label>
                <select id="select-page-size">
                  <option value="10" selected>10 per page</option>
                  <option value="25">25 per page</option>
                  <option value="50">50 per page</option>
                  <option value="all">All rules</option>
                </select>
              </div>
            </div>
          </div>

          <div id="rules-list"></div>

          <div id="pagination-bar" class="pagination-bar">
            <span id="rules-range">Showing 0–0 of 0 rules</span>
            <div class="page-btn-group" id="page-buttons"></div>
          </div>
        </div>
      </section>
    </div>
    <script src="options.js"></script>
  </body>
</html>
`;

  const optionsJs = `(async () => {
  const DEFAULT_PRESETS = ${defaultPresetsJson};
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAY_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const DEFAULT_SETTINGS = {
    enabled: true,
    perChannelSpeedEnabled: true,
    stopAfterVideoEnds: true,
    showInPageControlBar: true,
    convertShortsToWatch: true,
    disableVideoPreviews: true,
    showWatchLaterRemoveAction: true,
    showSpeedToast: true,
    popupTimeSavedDisplay: 'daily',
    barTimeSavedDisplay: 'daily',
    defaultSpeed: 1.0,
    settingsSchemaVersion: 7
  };

  function isValidDisplayMode(val) {
    return val === 'total' || val === 'daily' || val === 'off';
  }

  function sanitizeSavedTimeByDay(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [k, v] of Object.entries(raw)) {
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(k)) continue;
      const sec = Math.floor(Number(v) || 0);
      if (Number.isFinite(sec) && sec > 0) {
        out[k] = sec;
      }
    }
    return out;
  }

  function normalizeOptionsSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const prevSchema = Number(src.settingsSchemaVersion) || 1;
    const merged = {
      ...DEFAULT_SETTINGS,
      ...src,
      perChannelSpeedEnabled:
        typeof src.perChannelSpeedEnabled === 'boolean'
          ? src.perChannelSpeedEnabled
          : typeof src.perChannelSpeed === 'boolean'
            ? src.perChannelSpeed
            : DEFAULT_SETTINGS.perChannelSpeedEnabled,
      stopAfterVideoEnds:
        typeof src.stopAfterVideoEnds === 'boolean'
          ? src.stopAfterVideoEnds
          : typeof src.stopAfterVideo === 'boolean'
            ? src.stopAfterVideo
            : DEFAULT_SETTINGS.stopAfterVideoEnds,
      showInPageControlBar:
        typeof src.showInPageControlBar === 'boolean'
          ? src.showInPageControlBar
          : typeof src.showSpeedBar === 'boolean'
            ? src.showSpeedBar
            : DEFAULT_SETTINGS.showInPageControlBar,
      convertShortsToWatch:
        typeof src.convertShortsToWatch === 'boolean'
          ? src.convertShortsToWatch
          : typeof src.convertShorts === 'boolean'
            ? src.convertShorts
            : DEFAULT_SETTINGS.convertShortsToWatch,
      disableVideoPreviews:
        typeof src.disableVideoPreviews === 'boolean'
          ? src.disableVideoPreviews
          : DEFAULT_SETTINGS.disableVideoPreviews,
      showWatchLaterRemoveAction:
        typeof src.showWatchLaterRemoveAction === 'boolean'
          ? src.showWatchLaterRemoveAction
          : DEFAULT_SETTINGS.showWatchLaterRemoveAction,
      popupTimeSavedDisplay:
        prevSchema >= 7 && isValidDisplayMode(src.popupTimeSavedDisplay)
          ? src.popupTimeSavedDisplay
          : 'daily',
      barTimeSavedDisplay:
        prevSchema >= 7 && isValidDisplayMode(src.barTimeSavedDisplay)
          ? src.barTimeSavedDisplay
          : 'daily',
      settingsSchemaVersion: 7,
    };
    delete merged.perChannelSpeed;
    delete merged.stopAfterVideo;
    delete merged.showSpeedBar;
    delete merged.convertShorts;
    delete merged.autoRememberManualSpeed;
    return merged;
  }

  const manifestVersion =
    chrome.runtime && typeof chrome.runtime.getManifest === 'function'
      ? chrome.runtime.getManifest().version
      : '';
  const versionEl = document.getElementById('ext-version');
  if (versionEl && manifestVersion) {
    versionEl.textContent = \`· v\${manifestVersion}\`;
  }

  let stored = await chrome.storage.local.get([
    'settings',
    'presets',
    'rules',
    'totalTimeSavedSec',
    'timeSavedSince',
    'savedTimeByDay',
  ]);
  let settings = normalizeOptionsSettings(stored.settings);
  let presets = Array.isArray(stored.presets) && stored.presets.length > 0
    ? stored.presets
    : DEFAULT_PRESETS.map((p) => ({ ...p }));
  let rules = Array.isArray(stored.rules) ? stored.rules : [];
  let totalTimeSavedSec = Math.max(0, Math.floor(Number(stored.totalTimeSavedSec) || 0));
  let savedTimeByDay = sanitizeSavedTimeByDay(stored.savedTimeByDay);
  let timeSavedSince =
    typeof stored.timeSavedSince === 'number' &&
    Number.isFinite(stored.timeSavedSince) &&
    stored.timeSavedSince > 0
      ? stored.timeSavedSince
      : Date.now();

  if (
    !stored.savedTimeByDay ||
    typeof stored.savedTimeByDay !== 'object' ||
    !stored.settings ||
    Number(stored.settings.settingsSchemaVersion) < 7
  ) {
    chrome.storage.local
      .set({ settings, savedTimeByDay, timeSavedSince })
      .catch(() => {});
  }

  // Filter & Pagination State
  let searchQuery = '';
  let filterCategory = 'all';
  let sortBy = 'recent';
  let pageSize = 10;
  let currentPage = 1;

  // Analytics & Panel Expansion State (All 4 start collapsed)
  const expandedPanels = { '01': false, '02': false, '03': false, '04': false };
  let chartView = 'weekly';
  let weekOffset = 0;
  let endWeekOffset = 0;
  let trendMonths = 6;
  let drillMonthLabel = null;
  let drillWeekLabel = null;
  let activeBarHoverIndex = null;
  let currentBarMetaList = [];
  let currentBarDefaultFooterHtml = '';
  let heatmapMetaMap = {};
  let hoveredHeatDateKey = null;

  // DOM elements
  const expandAllBtnEl = document.getElementById('btn-toggle-expand-all');
  const presetsEl = document.getElementById('presets-list');
  const rulesEl = document.getElementById('rules-list');
  const rulesCountEl = document.getElementById('rules-count');
  const rulesRangeEl = document.getElementById('rules-range');
  const pageButtonsEl = document.getElementById('page-buttons');
  const searchInputEl = document.getElementById('input-rule-search');
  const categoryPillsEl = document.getElementById('category-pills');
  const sortSelectEl = document.getElementById('select-sort');
  const pageSizeSelectEl = document.getElementById('select-page-size');

  const form = document.getElementById('add-rule-form');
  const presetSelectEl = document.getElementById('input-preset');
  const speedInputEl = document.getElementById('input-speed');
  const importInputEl = document.getElementById('import-json-input');
  const importBtnEl = document.getElementById('btn-import-json');
  const exportBtnEl = document.getElementById('btn-export-json');
  const resetBtnEl = document.getElementById('btn-reset-presets');
  const statusBannerEl = document.getElementById('status-banner');

  const summary01El = document.getElementById('summary-01');
  const summary02El = document.getElementById('summary-02');
  const summary03El = document.getElementById('summary-03');
  const summary04El = document.getElementById('summary-04');

  const toggleSpeedEl = document.getElementById('toggle-speed');
  const toggleStopEl = document.getElementById('toggle-stop');
  const toggleWatchLaterEl = document.getElementById('toggle-watch-later');
  const toggleBarEl = document.getElementById('toggle-bar');
  const toggleShortsEl = document.getElementById('toggle-shorts');
  const togglePreviewsEl = document.getElementById('toggle-previews');

  // Panel 02 DOM
  const popupModeControlsEl = document.getElementById('popup-mode-controls');
  const barModeControlsEl = document.getElementById('bar-mode-controls');
  const previewPopupEl = document.getElementById('preview-popup-readout');
  const previewBarEl = document.getElementById('preview-bar-readout');
  const btnOpenResetEl = document.getElementById('btn-open-reset');
  const resetConfirmBoxEl = document.getElementById('reset-confirm-box');
  const inputConfirmForgetEl = document.getElementById('input-confirm-forget');
  const btnConfirmForgetEl = document.getElementById('btn-confirm-forget');
  const btnCancelForgetEl = document.getElementById('btn-cancel-forget');

  const statSavedValueEl = document.getElementById('stat-saved-value');
  const statSinceLineEl = document.getElementById('stat-since-line');
  const statStoreLineEl = document.getElementById('stat-store-line');
  const statLegacyLineEl = document.getElementById('stat-legacy-line');
  const kpiTodayValEl = document.getElementById('kpi-today-val');
  const kpiTodaySubEl = document.getElementById('kpi-today-sub');
  const kpiWeekValEl = document.getElementById('kpi-week-val');
  const kpiWeekSubEl = document.getElementById('kpi-week-sub');
  const kpiMonthValEl = document.getElementById('kpi-month-val');
  const kpiMonthSubEl = document.getElementById('kpi-month-sub');
  const kpiStreakValEl = document.getElementById('kpi-streak-val');
  const kpiStreakSubEl = document.getElementById('kpi-streak-sub');

  const chartStageEl = document.getElementById('chart-stage');
  const selectChartViewEl = document.getElementById('select-chart-view');
  const chartBreadcrumbEl = document.getElementById('chart-breadcrumb');
  const chartControlsRightEl = document.getElementById('chart-controls-right');
  const chartSubRowEl = document.getElementById('chart-sub-row');
  const chartEmptyNoticeEl = document.getElementById('chart-empty-notice');
  const chartBodyEl = document.getElementById('chart-body');
  const chartFooterEl = document.getElementById('chart-footer');

  let statusTimer = null;

  // Date & Duration helpers (DST-safe Mon–Sun Alignment 1)
  function formatLocalDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return \`\${y}-\${m}-\${d}\`;
  }

  function parseLocalDateKey(key) {
    const parts = String(key || '').split('-').map((n) => parseInt(n, 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date();
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }

  function atLocalMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  function addLocalDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0);
  }

  function getMondayBasedDayIndex(date) {
    return (date.getDay() + 6) % 7;
  }

  function getStartOfMondayWeek(date) {
    return addLocalDays(atLocalMidnight(date), -getMondayBasedDayIndex(date));
  }

  function diffLocalCalendarDays(dateA, dateB) {
    const utcA = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
    const utcB = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
    return Math.round((utcB - utcA) / 86400000);
  }

  function diffLocalCalendarWeeks(mondayA, mondayB) {
    return Math.round(diffLocalCalendarDays(mondayA, mondayB) / 7);
  }

  function formatSpeed(val) {
    return Number(val).toFixed(2).replace(/\\.00$/, '.0').replace(/(\\.\\d)0$/, '$1');
  }

  function formatFullSavedTime(sec) {
    const safe = Math.max(0, Math.floor(sec || 0));
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const remS = safe % 60;
    if (hrs > 0) return \`\${hrs}h \${mins}m \${remS}s\`;
    if (mins > 0) return \`\${mins}m \${remS}s\`;
    return \`\${remS}s\`;
  }

  function formatCompactSavedTime(sec) {
    const safe = Math.max(0, Math.round(sec || 0));
    if (safe === 0) return '0s';
    if (safe < 60) return \`\${safe}s\`;
    const totalMins = Math.round(safe / 60);
    if (totalMins < 60) return \`\${totalMins}m\`;
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins > 0 ? \`\${hrs}h \${mins}m\` : \`\${hrs}h\`;
  }

  function formatDateMMDDYYYY(d) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return \`\${mm}/\${dd}/\${yyyy}\`;
  }

  function getTrackingStartDateFormatted() {
    const positiveKeys = Object.entries(savedTimeByDay)
      .filter(([, val]) => Number(val) > 0)
      .map(([k]) => k)
      .sort();
    let candidate = positiveKeys.length > 0 ? parseLocalDateKey(positiveKeys[0]) : null;
    if (typeof timeSavedSince === 'number' && Number.isFinite(timeSavedSince) && timeSavedSince > 0) {
      const sinceDate = atLocalMidnight(new Date(timeSavedSince));
      if (!candidate || sinceDate.getTime() < candidate.getTime()) {
        candidate = sinceDate;
      }
    }
    return formatDateMMDDYYYY(candidate || new Date());
  }

  function sumSavedTimeMap(byDay) {
    let sum = 0;
    for (const val of Object.values(byDay || {})) {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) sum += Math.floor(n);
    }
    return sum;
  }

  function getTodaySavedSec(now = new Date()) {
    const key = formatLocalDateKey(now);
    return Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
  }

  function estimateStorageBytes(byDay) {
    const txt = JSON.stringify({ savedTimeByDay: byDay || {} });
    try {
      return new Blob([txt]).size;
    } catch (_) {
      return txt.length;
    }
  }

  function getWeekDailySeries(offset = 0, now = new Date()) {
    const todayMid = atLocalMidnight(now);
    const todayKey = formatLocalDateKey(todayMid);
    const currentWeekStart = getStartOfMondayWeek(todayMid);
    const weekStart = addLocalDays(currentWeekStart, offset * 7);
    const weekEnd = addLocalDays(weekStart, 6);
    const points = [];
    let totalSec = 0;
    let elapsedDaysInWeek = 0;
    let activeDays = 0;

    for (let i = 0; i < 7; i++) {
      const d = addLocalDays(weekStart, i);
      const key = formatLocalDateKey(d);
      const isFuture = d.getTime() > todayMid.getTime();
      const sec = isFuture ? 0 : Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
      if (!isFuture) {
        elapsedDaysInWeek += 1;
        totalSec += sec;
        if (sec > 0) activeDays += 1;
      }
      points.push({
        dateKey: key,
        dayShort: WEEKDAY_MON_FIRST[i],
        dateLabel: \`\${MONTH_SHORT[d.getMonth()]} \${d.getDate()}\`,
        fullDateLabel: \`\${WEEKDAY_MON_FIRST[i]}, \${MONTH_SHORT[d.getMonth()]} \${d.getDate()}\`,
        seconds: sec,
        isToday: key === todayKey,
        isFuture,
      });
    }

    const startStr = \`\${MONTH_SHORT[weekStart.getMonth()]} \${weekStart.getDate()}\`;
    const endStr =
      weekStart.getMonth() === weekEnd.getMonth()
        ? \`\${weekEnd.getDate()}, \${weekEnd.getFullYear()}\`
        : \`\${MONTH_SHORT[weekEnd.getMonth()]} \${weekEnd.getDate()}, \${weekEnd.getFullYear()}\`;

    return {
      points,
      rangeLabel: \`\${startStr} – \${endStr}\`,
      totalSec,
      dailyAvgSec: elapsedDaysInWeek > 0 ? Math.round(totalSec / elapsedDaysInWeek) : 0,
      activeDays,
      isCurrentWeek: offset === 0,
    };
  }

  function getAlignedFourWeekSeries(endOffset = 0, now = new Date()) {
    const todayMid = atLocalMidnight(now);
    const currentWeekStart = getStartOfMondayWeek(todayMid);
    const points = [];
    let totalSec = 0;
    let totalActiveDays = 0;

    for (let i = 0; i < 4; i++) {
      const offset = endOffset - (3 - i);
      const start = addLocalDays(currentWeekStart, offset * 7);
      const end = addLocalDays(start, 6);
      let weekSec = 0;
      let weekActive = 0;
      for (let dOffset = 0; dOffset < 7; dOffset++) {
        const d = addLocalDays(start, dOffset);
        if (d.getTime() <= todayMid.getTime()) {
          const key = formatLocalDateKey(d);
          const sec = Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
          weekSec += sec;
          if (sec > 0) weekActive += 1;
        }
      }
      const rangeLabel =
        start.getMonth() === end.getMonth()
          ? \`\${MONTH_SHORT[start.getMonth()]} \${start.getDate()}–\${end.getDate()}\`
          : \`\${MONTH_SHORT[start.getMonth()]} \${start.getDate()}–\${MONTH_SHORT[end.getMonth()]} \${end.getDate()}\`;

      points.push({
        weekIndex: i + 1,
        label: \`Wk \${i + 1}\`,
        rangeLabel,
        seconds: weekSec,
        activeDays: weekActive,
        weekOffsetFromCurrent: offset,
        isCurrentWeek: offset === 0,
      });
      totalSec += weekSec;
      totalActiveDays += weekActive;
    }

    const windowStart = addLocalDays(currentWeekStart, (endOffset - 3) * 7);
    const windowEnd = addLocalDays(currentWeekStart, endOffset * 7 + 6);
    const startStr = \`\${MONTH_SHORT[windowStart.getMonth()]} \${windowStart.getDate()}\`;
    const endStr = \`\${MONTH_SHORT[windowEnd.getMonth()]} \${windowEnd.getDate()}, \${windowEnd.getFullYear()}\`;

    return {
      points,
      monthLabel: \`\${startStr} – \${endStr}\`,
      totalSec,
      weeklyAvgSec: Math.round(totalSec / 4),
      activeDays: totalActiveDays,
      isCurrentMonth: endOffset === 0,
    };
  }

  function getEndWeekOffsetForMonth(monthKey, now = new Date()) {
    const parts = String(monthKey || '').split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (Number.isNaN(y) || Number.isNaN(m)) return 0;
    if (y === now.getFullYear() && m === now.getMonth()) return 0;
    const currentWeekStart = getStartOfMondayWeek(atLocalMidnight(now));
    const lastDayOfTargetMonth = new Date(y, m + 1, 0, 0, 0, 0, 0);
    const targetWeekStart = getStartOfMondayWeek(lastDayOfTargetMonth);
    return Math.min(0, diffLocalCalendarWeeks(currentWeekStart, targetWeekStart));
  }

  function getMultiMonthSeries(monthCount = 6, now = new Date()) {
    const safeCount = Math.max(1, monthCount);
    const raw = [];
    for (let offset = -(safeCount - 1); offset <= 0; offset++) {
      const start = new Date(now.getFullYear(), now.getMonth() + offset, 1, 0, 0, 0, 0);
      const y = start.getFullYear();
      const m = start.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      let secTotal = 0;
      let activeDays = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const key = \`\${y}-\${String(m + 1).padStart(2, '0')}-\${String(day).padStart(2, '0')}\`;
        const sec = Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
        secTotal += sec;
        if (sec > 0) activeDays += 1;
      }
      raw.push({
        monthKey: \`\${y}-\${String(m + 1).padStart(2, '0')}\`,
        shortLabel: MONTH_SHORT[m],
        fullLabel: \`\${MONTH_SHORT[m]} \${y}\`,
        seconds: secTotal,
        activeDays,
      });
    }
    return raw.map((item, idx) => {
      if (idx === 0 || raw[idx - 1].seconds <= 0) {
        return { ...item, deltaPercent: null };
      }
      const prev = raw[idx - 1].seconds;
      return { ...item, deltaPercent: Math.round(((item.seconds - prev) / prev) * 100) };
    });
  }

  function getCurrentMonthKpiSummary(now = new Date()) {
    const y = now.getFullYear();
    const m = now.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let totalSec = 0;
    let activeDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day, 0, 0, 0, 0);
      if (d.getTime() > atLocalMidnight(now).getTime()) break;
      const key = formatLocalDateKey(d);
      const sec = Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
      totalSec += sec;
      if (sec > 0) activeDays += 1;
    }
    return { totalSec, activeDays };
  }

  function getDayOfWeekRhythm(lookbackDays = 90, now = new Date()) {
    const todayMid = atLocalMidnight(now);
    const sums = new Array(7).fill(0);
    const counts = new Array(7).fill(0);
    for (let offset = 0; offset < lookbackDays; offset++) {
      const d = addLocalDays(todayMid, -offset);
      const key = formatLocalDateKey(d);
      const idx = getMondayBasedDayIndex(d);
      sums[idx] += Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
      counts[idx] += 1;
    }
    return WEEKDAY_MON_FIRST.map((label, dayIndex) => ({
      dayIndex,
      label,
      totalSec: sums[dayIndex],
      avgSec: counts[dayIndex] > 0 ? Math.round(sums[dayIndex] / counts[dayIndex]) : 0,
    }));
  }

  function getActivityHeatmapGrid(numWeeks = 12, now = new Date()) {
    const todayMid = atLocalMidnight(now);
    const todayKey = formatLocalDateKey(todayMid);
    const currentWeekStart = getStartOfMondayWeek(todayMid);
    const gridStart = addLocalDays(currentWeekStart, -(numWeeks - 1) * 7);

    let maxDaySec = 0;
    for (let w = 0; w < numWeeks; w++) {
      for (let r = 0; r < 7; r++) {
        const d = addLocalDays(gridStart, w * 7 + r);
        if (d.getTime() > todayMid.getTime()) continue;
        const sec = Math.max(0, Math.floor(Number(savedTimeByDay[formatLocalDateKey(d)]) || 0));
        if (sec > maxDaySec) maxDaySec = sec;
      }
    }

    const weeks = [];
    const weekMonthLabels = [];
    let prevLabeledMonth = -1;
    for (let w = 0; w < numWeeks; w++) {
      const col = [];
      const colStartDate = addLocalDays(gridStart, w * 7);
      const colMonth = colStartDate.getMonth();
      if (colMonth !== prevLabeledMonth) {
        weekMonthLabels.push(MONTH_SHORT[colMonth]);
        prevLabeledMonth = colMonth;
      } else {
        weekMonthLabels.push('');
      }
      for (let r = 0; r < 7; r++) {
        const d = addLocalDays(gridStart, w * 7 + r);
        const key = formatLocalDateKey(d);
        const isFuture = d.getTime() > todayMid.getTime();
        const sec = isFuture ? 0 : Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
        let level = 0;
        if (!isFuture && sec > 0 && maxDaySec > 0) {
          const ratio = sec / maxDaySec;
          if (ratio >= 0.72) level = 4;
          else if (ratio >= 0.46) level = 3;
          else if (ratio >= 0.22) level = 2;
          else level = 1;
        }
        col.push({
          dateKey: key,
          label: \`\${MONTH_SHORT[d.getMonth()]} \${d.getDate()}, \${d.getFullYear()}\`,
          seconds: sec,
          level,
          isToday: key === todayKey,
          isFuture,
        });
      }
      weeks.push(col);
    }

    const allEntries = Object.entries(savedTimeByDay)
      .map(([dateKey, val]) => ({ dateKey, seconds: Math.max(0, Math.floor(Number(val) || 0)) }))
      .filter((entry) => entry.seconds > 0)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    let bestDay = null;
    for (const entry of allEntries) {
      if (!bestDay || entry.seconds > bestDay.seconds) {
        const d = parseLocalDateKey(entry.dateKey);
        bestDay = {
          dateKey: entry.dateKey,
          label: \`\${MONTH_SHORT[d.getMonth()]} \${d.getDate()}\`,
          seconds: entry.seconds,
        };
      }
    }

    let currentStreakDays = 0;
    for (let back = 0; back < 3650; back++) {
      const d = addLocalDays(todayMid, -back);
      const sec = Math.max(0, Math.floor(Number(savedTimeByDay[formatLocalDateKey(d)]) || 0));
      if (sec > 0) {
        currentStreakDays += 1;
      } else if (back === 0) {
        continue;
      } else {
        break;
      }
    }

    let longestStreakDays = 0;
    let running = 0;
    let prevTime = null;
    for (const entry of allEntries) {
      const t = parseLocalDateKey(entry.dateKey).getTime();
      if (prevTime !== null && Math.round((t - prevTime) / 86400000) === 1) {
        running += 1;
      } else {
        running = 1;
      }
      if (running > longestStreakDays) longestStreakDays = running;
      prevTime = t;
    }

    return {
      weeks,
      weekMonthLabels,
      currentStreakDays,
      longestStreakDays,
      bestDay,
      totalActiveDays: allEntries.length,
    };
  }

  function normalizeHandle(raw, fallbackName = '') {
    const cleaned = String(raw || '').trim();
    if (cleaned) {
      const urlMatch = cleaned.match(/\\/(@[^/?#]+)/);
      if (urlMatch) return urlMatch[1].toLowerCase();
      return cleaned.startsWith('@') ? cleaned.toLowerCase() : '@' + cleaned.toLowerCase().replace(/\\s+/g, '');
    }
    return '@' + String(fallbackName || 'channel').toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  }

  function showStatus(message) {
    if (!statusBannerEl) return;
    statusBannerEl.textContent = message;
    statusBannerEl.classList.add('visible');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusBannerEl.classList.remove('visible');
    }, 3600);
  }

  // Panel collapse / expand controls
  function syncPanelDom(panelId) {
    const sectionEl = document.querySelector(\`section.panel[data-panel="\${panelId}"]\`);
    const btnEl = document.querySelector(\`button[data-panel-toggle="\${panelId}"]\`);
    if (!sectionEl || !btnEl) return;
    const isExpanded = Boolean(expandedPanels[panelId]);
    sectionEl.classList.toggle('is-expanded', isExpanded);
    btnEl.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    const lblEl = btnEl.querySelector('.panel-toggle-label');
    if (lblEl) lblEl.textContent = isExpanded ? 'Collapse' : 'Expand';
  }

  function syncExpandAllBtn() {
    if (!expandAllBtnEl) return;
    const allExpanded = Object.values(expandedPanels).every(Boolean);
    expandAllBtnEl.textContent = allExpanded ? 'Collapse All' : 'Expand All';
  }

  document.querySelectorAll('button[data-panel-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pid = btn.getAttribute('data-panel-toggle');
      if (!pid) return;
      expandedPanels[pid] = !expandedPanels[pid];
      syncPanelDom(pid);
      syncExpandAllBtn();
    });
  });

  if (expandAllBtnEl) {
    expandAllBtnEl.addEventListener('click', () => {
      const allExpanded = Object.values(expandedPanels).every(Boolean);
      const next = !allExpanded;
      Object.keys(expandedPanels).forEach((pid) => {
        expandedPanels[pid] = next;
        syncPanelDom(pid);
      });
      syncExpandAllBtn();
    });
  }

  Object.keys(expandedPanels).forEach(syncPanelDom);
  syncExpandAllBtn();

  function renderCollapsedSummaries() {
    if (summary01El) {
      const enabledCount = [
        Boolean(settings.stopAfterVideoEnds),
        settings.convertShortsToWatch !== false,
        settings.disableVideoPreviews !== false,
        Boolean(settings.perChannelSpeedEnabled),
        settings.showInPageControlBar !== false,
        settings.showWatchLaterRemoveAction !== false,
      ].filter(Boolean).length;
      const stopTxt = settings.stopAfterVideoEnds ? 'On' : 'Off';
      const barTxt = settings.showInPageControlBar !== false ? 'Shown' : 'Hidden';
      summary01El.textContent = \`\${enabledCount}/6 features active · Stop after end: \${stopTxt} · Control bar: \${barTxt}\`;
    }

    if (summary02El) {
      const totalStr = formatCompactSavedTime(totalTimeSavedSec);
      const todayStr = formatCompactSavedTime(getTodaySavedSec());
      const pMode = settings.popupTimeSavedDisplay || 'daily';
      const bMode = settings.barTimeSavedDisplay || 'daily';
      const pLabel = pMode === 'total' ? 'Total' : pMode === 'daily' ? 'Daily' : 'Off';
      const bLabel = bMode === 'total' ? 'Total' : bMode === 'daily' ? 'Daily' : 'Off';
      summary02El.innerHTML = \`<span class="text-emerald">\${totalStr}</span> total · <span class="text-emerald">\${todayStr}</span> today · Popup: \${pLabel} · Bar: \${bLabel}\`;
    }

    if (summary03El) {
      summary03El.textContent = presets
        .map((p) => \`\${p.id === 'podcast' ? 'Podcast' : p.label} \${formatSpeed(p.speed)}×\`)
        .join(' · ');
    }

    if (summary04El) {
      if (rules.length === 0) {
        summary04El.textContent = 'No channel rules saved yet — add or import JSON rules';
      } else {
        const preview = rules
          .slice(0, 3)
          .map((r) => \`\${r.channelName} (\${formatSpeed(resolveSpeed(r))}×)\`)
          .join(', ');
        const extra = rules.length > 3 ? \` +\${rules.length - 3} more\` : '';
        summary04El.textContent = \`\${rules.length} \${rules.length === 1 ? 'channel' : 'channels'} · \${preview}\${extra}\`;
      }
    }
  }

  function renderToggles() {
    if (toggleStopEl) toggleStopEl.checked = Boolean(settings.stopAfterVideoEnds);
    if (toggleShortsEl) toggleShortsEl.checked = settings.convertShortsToWatch !== false;
    if (togglePreviewsEl) togglePreviewsEl.checked = settings.disableVideoPreviews !== false;
    if (toggleSpeedEl) toggleSpeedEl.checked = Boolean(settings.perChannelSpeedEnabled);
    if (toggleBarEl) toggleBarEl.checked = settings.showInPageControlBar !== false;
    if (toggleWatchLaterEl) toggleWatchLaterEl.checked = settings.showWatchLaterRemoveAction !== false;
    renderCollapsedSummaries();
  }

  const SETTING_STATUS_LABELS = {
    stopAfterVideoEnds: 'Stop Playback After Video Ends',
    convertShortsToWatch: 'Convert Shorts to Standard Player',
    disableVideoPreviews: 'Disable Video Previews',
    perChannelSpeedEnabled: 'Per-Channel Playback Speed',
    showInPageControlBar: 'Show Speed Bar Below Video',
    showWatchLaterRemoveAction: 'Show "Remove from Watch Later" on Video End',
    popupTimeSavedDisplay: 'Toolbar Popup Readout',
    barTimeSavedDisplay: 'Below-Video Bar Readout',
  };

  async function updateSetting(key, val) {
    settings[key] = val;
    settings.settingsSchemaVersion = 7;
    await chrome.storage.local.set({ settings });
    renderToggles();
    renderTimeSavedAnalytics();
    showStatus(\`Updated \${SETTING_STATUS_LABELS[key] || key}: \${typeof val === 'boolean' ? (val ? 'Enabled' : 'Disabled') : val}\`);
  }

  if (toggleStopEl) toggleStopEl.addEventListener('change', () => updateSetting('stopAfterVideoEnds', toggleStopEl.checked));
  if (toggleShortsEl) toggleShortsEl.addEventListener('change', () => updateSetting('convertShortsToWatch', toggleShortsEl.checked));
  if (togglePreviewsEl) togglePreviewsEl.addEventListener('change', () => updateSetting('disableVideoPreviews', togglePreviewsEl.checked));
  if (toggleSpeedEl) toggleSpeedEl.addEventListener('change', () => updateSetting('perChannelSpeedEnabled', toggleSpeedEl.checked));
  if (toggleBarEl) toggleBarEl.addEventListener('change', () => updateSetting('showInPageControlBar', toggleBarEl.checked));
  if (toggleWatchLaterEl) toggleWatchLaterEl.addEventListener('change', () => updateSetting('showWatchLaterRemoveAction', toggleWatchLaterEl.checked));

  if (popupModeControlsEl) {
    popupModeControlsEl.querySelectorAll('button[data-popup-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-popup-mode');
        if (isValidDisplayMode(mode)) updateSetting('popupTimeSavedDisplay', mode);
      });
    });
  }

  if (barModeControlsEl) {
    barModeControlsEl.querySelectorAll('button[data-bar-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-bar-mode');
        if (isValidDisplayMode(mode)) updateSetting('barTimeSavedDisplay', mode);
      });
    });
  }

  function setBarFooterHighlight(idx) {
    activeBarHoverIndex = idx;
    if (!chartBodyEl) return;
    chartBodyEl.querySelectorAll('.bar-col[data-bar-index]').forEach((colEl) => {
      const cIdx = Number(colEl.getAttribute('data-bar-index'));
      colEl.classList.toggle('is-hovered', idx !== null && cIdx === idx);
    });
    if (!chartFooterEl) return;
    const inspectEl = chartFooterEl.querySelector('#chart-footer-inspect');
    if (!inspectEl) return;
    if (idx !== null && currentBarMetaList[idx]) {
      inspectEl.className = 'chart-footer-inspect';
      inspectEl.textContent = currentBarMetaList[idx].footerText;
    } else {
      inspectEl.className = 'chart-footer-muted';
      inspectEl.textContent = currentBarDefaultFooterHtml;
    }
  }

  function bindBarHoverHandlers(defaultFooterText) {
    currentBarDefaultFooterHtml = defaultFooterText;
    activeBarHoverIndex = null;
    if (!chartBodyEl) return;
    chartBodyEl.querySelectorAll('.bar-col[data-bar-index]').forEach((colEl) => {
      const idx = Number(colEl.getAttribute('data-bar-index'));
      colEl.addEventListener('mouseenter', () => setBarFooterHighlight(idx));
      colEl.addEventListener('focus', () => setBarFooterHighlight(idx));
      colEl.addEventListener('mouseleave', () => setBarFooterHighlight(null));
      colEl.addEventListener('blur', () => setBarFooterHighlight(null));
      colEl.addEventListener('click', () => {
        const item = currentBarMetaList[idx];
        if (item && typeof item.onClick === 'function') item.onClick();
      });
    });
  }

  if (chartStageEl) {
    chartStageEl.addEventListener('mouseleave', () => {
      if (chartView !== 'consistency') {
        setBarFooterHighlight(null);
      } else {
        hoveredHeatDateKey = null;
        const inspectEl = chartFooterEl ? chartFooterEl.querySelector('#chart-footer-inspect') : null;
        if (inspectEl) {
          inspectEl.className = 'chart-footer-muted';
          inspectEl.textContent = 'Hover any day square for date total · Click a bar in Trend or 4-Week History to drill down';
        }
        chartStageEl.querySelectorAll('.rhythm-row.is-hovered').forEach((r) => r.classList.remove('is-hovered'));
      }
    });
  }

  function renderChartStage() {
    if (!chartBodyEl || !chartFooterEl || !chartControlsRightEl || !chartSubRowEl || !chartBreadcrumbEl) return;
    const now = new Date();
    const todaySec = getTodaySavedSec(now);
    const attributedTotalSec = sumSavedTimeMap(savedTimeByDay);
    const unattributedPriorSec = Math.max(0, totalTimeSavedSec - attributedTotalSec);

    if (selectChartViewEl && selectChartViewEl.value !== chartView) {
      selectChartViewEl.value = chartView;
    }

    if (chartEmptyNoticeEl) {
      if (attributedTotalSec === 0) {
        chartEmptyNoticeEl.style.display = 'block';
        chartEmptyNoticeEl.textContent = unattributedPriorSec > 0
          ? \`Daily breakdown starts collecting from today (\${formatCompactSavedTime(unattributedPriorSec)} was recorded prior to v1.7.1 without per-day buckets, so earlier days appear blank instead of guessing past dates).\`
          : 'No daily playback acceleration recorded yet. Speed up any YouTube video (>1.0×) and your daily, weekly, and monthly bars will populate automatically.';
      } else {
        chartEmptyNoticeEl.style.display = 'none';
      }
    }

    // Breadcrumbs
    let crumbsHtml = '';
    if (chartView === 'four_week' && drillMonthLabel) {
      crumbsHtml = \`
        <button type="button" class="crumb-btn" data-crumb="trend">Monthly Trend</button>
        <span>›</span>
        <span class="crumb-current">\${drillMonthLabel}</span>
      \`;
    } else if (chartView === 'weekly' && drillWeekLabel) {
      crumbsHtml = drillMonthLabel
        ? \`
          <button type="button" class="crumb-btn" data-crumb="trend">Monthly Trend</button>
          <span>›</span>
          <button type="button" class="crumb-btn" data-crumb="four_week">\${drillMonthLabel}</button>
          <span>›</span>
          <span class="crumb-current">\${drillWeekLabel}</span>
        \`
        : \`
          <button type="button" class="crumb-btn" data-crumb="four_week">4-Week History</button>
          <span>›</span>
          <span class="crumb-current">\${drillWeekLabel}</span>
        \`;
    }
    chartBreadcrumbEl.innerHTML = crumbsHtml;
    chartBreadcrumbEl.querySelectorAll('button[data-crumb]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dest = btn.getAttribute('data-crumb');
        if (dest === 'trend') {
          chartView = 'monthly_trend';
          drillMonthLabel = null;
          drillWeekLabel = null;
        } else if (dest === 'four_week') {
          chartView = 'four_week';
          drillWeekLabel = null;
        }
        renderChartStage();
      });
    });

    if (chartView === 'weekly') {
      const summary = getWeekDailySeries(weekOffset, now);
      const maxSec = Math.max(1, ...summary.points.map((p) => p.seconds));
      chartControlsRightEl.innerHTML = \`
        <span class="chart-hint-inline">\${summary.rangeLabel}</span>
        <div class="nav-capsule">
          <button type="button" class="nav-step-btn" id="btn-prev-week" title="Previous week">&lt;</button>
          <button type="button" class="nav-period-btn" id="btn-curr-week" \${weekOffset === 0 ? 'disabled' : ''}>\${weekOffset === 0 ? 'This Week' : 'Current'}</button>
          <button type="button" class="nav-step-btn" id="btn-next-week" \${weekOffset >= 0 ? 'disabled' : ''} title="Next week">&gt;</button>
        </div>
      \`;
      chartSubRowEl.innerHTML = \`<span>7 daily bars · Mon–Sun</span><span>\${summary.activeDays}/7 active days</span>\`;

      currentBarMetaList = summary.points.map((pt) => ({
        footerText: pt.isFuture
          ? \`\${pt.fullDateLabel} — Upcoming\`
          : \`\${pt.fullDateLabel} — \${formatFullSavedTime(pt.seconds)} saved\${pt.isToday ? ' · Today' : ''}\`,
        onClick: null,
      }));

      chartBodyEl.innerHTML = \`
        <div class="bar-plot" style="grid-template-columns: repeat(7, minmax(0, 1fr));">
          \${summary.points.map((pt, idx) => {
            const pct = pt.seconds > 0 ? Math.max(8, Math.round((pt.seconds / maxSec) * 100)) : 4;
            const fillColor = pt.isToday
              ? 'rgba(52, 211, 153, 0.92)'
              : pt.seconds > 0
                ? 'rgba(52, 211, 153, 0.72)'
                : pt.isFuture
                  ? 'rgba(30, 41, 59, 0.45)'
                  : 'rgba(51, 65, 85, 0.65)';
            return \`
              <button type="button" class="bar-col is-non-interactive \${pt.isToday ? 'is-current-emerald' : ''}" data-bar-index="\${idx}" aria-label="\${pt.fullDateLabel}: \${formatCompactSavedTime(pt.seconds)}">
                <span class="bar-top-val">\${pt.seconds > 0 ? formatCompactSavedTime(pt.seconds) : '—'}</span>
                <span class="bar-track"><span class="bar-fill" style="height:\${pct}%;background:\${fillColor};"></span></span>
                <span class="bar-axis">
                  <span class="bar-axis-main">\${pt.dayShort}</span>
                  <span class="bar-axis-sub">\${pt.dateLabel}</span>
                </span>
              </button>
            \`;
          }).join('')}
        </div>
      \`;

      chartFooterEl.innerHTML = \`
        <span id="chart-footer-inspect" class="chart-footer-muted">Hover any bar for exact day breakdown</span>
        <span class="chart-footer-stats">Week total: <strong>\${formatFullSavedTime(summary.totalSec)}</strong> · Daily avg: <strong>\${formatCompactSavedTime(summary.dailyAvgSec)}</strong></span>
      \`;
      bindBarHoverHandlers('Hover any bar for exact day breakdown');

      const prevBtn = document.getElementById('btn-prev-week');
      const currBtn = document.getElementById('btn-curr-week');
      const nextBtn = document.getElementById('btn-next-week');
      if (prevBtn) prevBtn.addEventListener('click', () => { weekOffset -= 1; drillWeekLabel = null; renderChartStage(); });
      if (currBtn) currBtn.addEventListener('click', () => { weekOffset = 0; drillMonthLabel = null; drillWeekLabel = null; renderChartStage(); });
      if (nextBtn) nextBtn.addEventListener('click', () => { if (weekOffset < 0) { weekOffset += 1; drillWeekLabel = null; renderChartStage(); } });
    } else if (chartView === 'four_week') {
      const summary = getAlignedFourWeekSeries(endWeekOffset, now);
      const maxSec = Math.max(1, ...summary.points.map((p) => p.seconds));
      chartControlsRightEl.innerHTML = \`
        <span class="chart-hint-inline">\${summary.monthLabel}</span>
        <div class="nav-capsule">
          <button type="button" class="nav-step-btn" id="btn-prev-4wk" title="Earlier 4 weeks">&lt;</button>
          <button type="button" class="nav-period-btn" id="btn-curr-4wk" \${endWeekOffset === 0 ? 'disabled' : ''}>\${endWeekOffset === 0 ? 'Last 4 Wks' : 'Latest 4 Wks'}</button>
          <button type="button" class="nav-step-btn" id="btn-next-4wk" \${endWeekOffset >= 0 ? 'disabled' : ''} title="Later 4 weeks">&gt;</button>
        </div>
      \`;
      chartSubRowEl.innerHTML = \`<span>4 consecutive Mon–Sun calendar weeks · Click any bar to inspect its 7 days</span><span>\${summary.activeDays} active days</span>\`;

      currentBarMetaList = summary.points.map((wk) => ({
        footerText: \`\${wk.label} (\${wk.rangeLabel}) — \${formatFullSavedTime(wk.seconds)} across \${wk.activeDays} \${wk.activeDays === 1 ? 'day' : 'days'} · Click to inspect days\`,
        onClick: () => {
          weekOffset = typeof wk.weekOffsetFromCurrent === 'number' ? wk.weekOffsetFromCurrent : 0;
          drillWeekLabel = \`\${wk.label} (\${wk.rangeLabel})\`;
          chartView = 'weekly';
          renderChartStage();
        },
      }));

      chartBodyEl.innerHTML = \`
        <div class="bar-plot" style="grid-template-columns: repeat(4, minmax(0, 1fr));">
          \${summary.points.map((wk, idx) => {
            const pct = wk.seconds > 0 ? Math.max(10, Math.round((wk.seconds / maxSec) * 100)) : 5;
            const fillColor = wk.isCurrentWeek
              ? 'rgba(56, 189, 248, 0.92)'
              : wk.seconds > 0
                ? 'rgba(56, 189, 248, 0.72)'
                : 'rgba(51, 65, 85, 0.65)';
            return \`
              <button type="button" class="bar-col \${wk.isCurrentWeek ? 'is-current-sky' : ''}" data-bar-index="\${idx}" aria-label="\${wk.label} (\${wk.rangeLabel}): \${formatCompactSavedTime(wk.seconds)}">
                <span class="bar-top-val">\${wk.seconds > 0 ? formatCompactSavedTime(wk.seconds) : '—'}</span>
                <span class="bar-track"><span class="bar-fill" style="height:\${pct}%;background:\${fillColor};"></span></span>
                <span class="bar-axis">
                  <span class="bar-axis-main">\${wk.label}</span>
                  <span class="bar-axis-sub">\${wk.rangeLabel}</span>
                </span>
              </button>
            \`;
          }).join('')}
        </div>
      \`;

      chartFooterEl.innerHTML = \`
        <span id="chart-footer-inspect" class="chart-footer-muted">Hover or click any week bar to drill down into daily bars</span>
        <span class="chart-footer-stats">4-week total: <strong>\${formatFullSavedTime(summary.totalSec)}</strong> · Avg: <strong>\${formatCompactSavedTime(summary.weeklyAvgSec)}/wk</strong></span>
      \`;
      bindBarHoverHandlers('Hover or click any week bar to drill down into daily bars');

      const prev4Btn = document.getElementById('btn-prev-4wk');
      const curr4Btn = document.getElementById('btn-curr-4wk');
      const next4Btn = document.getElementById('btn-next-4wk');
      if (prev4Btn) prev4Btn.addEventListener('click', () => { endWeekOffset -= 4; drillMonthLabel = null; renderChartStage(); });
      if (curr4Btn) curr4Btn.addEventListener('click', () => { endWeekOffset = 0; drillMonthLabel = null; renderChartStage(); });
      if (next4Btn) next4Btn.addEventListener('click', () => { if (endWeekOffset < 0) { endWeekOffset = Math.min(0, endWeekOffset + 4); drillMonthLabel = null; renderChartStage(); } });
    } else if (chartView === 'monthly_trend') {
      const series = getMultiMonthSeries(trendMonths, now);
      const maxSec = Math.max(1, ...series.map((m) => m.seconds));
      const totalWindowSec = series.reduce((acc, m) => acc + m.seconds, 0);
      chartControlsRightEl.innerHTML = \`
        <span class="chart-hint-inline">Click any month bar to drill down</span>
        <div class="segmented-control">
          <button type="button" class="seg-btn \${trendMonths === 6 ? 'active' : ''}" id="btn-trend-6m">6M</button>
          <button type="button" class="seg-btn \${trendMonths === 12 ? 'active' : ''}" id="btn-trend-12m">12M</button>
        </div>
      \`;
      chartSubRowEl.innerHTML = \`<span>Last \${trendMonths} calendar months</span><span>\${formatFullSavedTime(totalWindowSec)} window total</span>\`;

      currentBarMetaList = series.map((m) => {
        const deltaText = m.deltaPercent !== null ? \` (\${m.deltaPercent >= 0 ? '+' : ''}\${m.deltaPercent}% vs prev mo)\` : '';
        return {
          footerText: \`\${m.fullLabel} — \${formatFullSavedTime(m.seconds)} across \${m.activeDays} days\${deltaText} · Click for 4-week view\`,
          onClick: () => {
            endWeekOffset = getEndWeekOffsetForMonth(m.monthKey, now);
            drillMonthLabel = m.fullLabel;
            drillWeekLabel = null;
            chartView = 'four_week';
            renderChartStage();
          },
        };
      });

      chartBodyEl.innerHTML = \`
        <div class="bar-plot" style="grid-template-columns: repeat(\${series.length}, minmax(0, 1fr));">
          \${series.map((m, idx) => {
            const pct = m.seconds > 0 ? Math.max(8, Math.round((m.seconds / maxSec) * 100)) : 4;
            const isCurr = idx === series.length - 1;
            const fillColor = isCurr
              ? 'rgba(251, 191, 36, 0.92)'
              : m.seconds > 0
                ? 'rgba(251, 191, 36, 0.62)'
                : 'rgba(51, 65, 85, 0.65)';
            return \`
              <button type="button" class="bar-col \${isCurr ? 'is-current-amber' : ''}" data-bar-index="\${idx}" aria-label="\${m.fullLabel}: \${formatCompactSavedTime(m.seconds)}">
                <span class="bar-top-val">\${m.seconds > 0 ? formatCompactSavedTime(m.seconds) : '—'}</span>
                <span class="bar-track"><span class="bar-fill" style="height:\${pct}%;background:\${fillColor};"></span></span>
                <span class="bar-axis">
                  <span class="bar-axis-main">\${m.shortLabel}</span>
                </span>
              </button>
            \`;
          }).join('')}
        </div>
      \`;

      chartFooterEl.innerHTML = \`
        <span id="chart-footer-inspect" class="chart-footer-muted">Click any month bar to open its 4-week breakdown</span>
        <span class="chart-footer-stats">\${trendMonths}-month total: <strong>\${formatFullSavedTime(totalWindowSec)}</strong></span>
      \`;
      bindBarHoverHandlers('Click any month bar to open its 4-week breakdown');

      const btn6 = document.getElementById('btn-trend-6m');
      const btn12 = document.getElementById('btn-trend-12m');
      if (btn6) btn6.addEventListener('click', () => { trendMonths = 6; renderChartStage(); });
      if (btn12) btn12.addEventListener('click', () => { trendMonths = 12; renderChartStage(); });
    } else {
      // Consistency: 12-week Heatmap + 90-day Weekday Pace
      const heatmap = getActivityHeatmapGrid(12, now);
      const rhythm = getDayOfWeekRhythm(90, now);
      const maxRhythmAvg = Math.max(1, ...rhythm.map((d) => d.avgSec));
      const peakRhythmDay = rhythm.reduce((best, cur) => (cur.avgSec > best.avgSec ? cur : best), rhythm[0]);

      chartControlsRightEl.innerHTML = \`
        <span class="legend-scale">
          <span>Less</span>
          <span class="legend-box" style="background:#111827;"></span>
          <span class="legend-box" style="background:rgba(6,78,59,0.8);"></span>
          <span class="legend-box" style="background:rgba(4,120,87,0.85);"></span>
          <span class="legend-box" style="background:rgba(16,185,129,0.88);"></span>
          <span class="legend-box" style="background:#34d399;"></span>
          <span>More</span>
        </span>
      \`;
      chartSubRowEl.innerHTML = \`
        <span>12-week daily heatmap (Mon–Sun rows) + 90-day weekday averages</span>
        <span>Current streak: \${heatmap.currentStreakDays}d · Longest: \${heatmap.longestStreakDays}d</span>
      \`;

      heatmapMetaMap = {};
      for (let w = 0; w < heatmap.weeks.length; w++) {
        for (let r = 0; r < 7; r++) {
          const cell = heatmap.weeks[w][r];
          heatmapMetaMap[cell.dateKey] = cell;
        }
      }

      const monthRowHtml = \`
        <div class="heatmap-months">
          <span></span>
          \${heatmap.weekMonthLabels.map((lbl) => \`<span>\${lbl}</span>\`).join('')}
        </div>
      \`;

      const rowIndices = [0, 1, 2, 3, 4, 5, 6];
      const heatRowsHtml = rowIndices.map((r) => \`
        <div class="heatmap-row">
          <span class="heatmap-day-label">\${r % 2 === 0 ? WEEKDAY_MON_FIRST[r] : ''}</span>
          \${heatmap.weeks.map((weekCol) => {
            const c = weekCol[r];
            const classes = [
              'heat-cell',
              c.isFuture ? 'is-future' : \`lvl-\${c.level}\`,
              c.isToday ? 'is-today' : '',
            ].filter(Boolean).join(' ');
            return \`<button type="button" class="\${classes}" data-heat-key="\${c.dateKey}" aria-label="\${c.label}: \${formatCompactSavedTime(c.seconds)}"></button>\`;
          }).join('')}
        </div>
      \`).join('');

      const rhythmHtml = rhythm.map((d) => {
        const pct = d.avgSec > 0 ? Math.max(4, Math.round((d.avgSec / maxRhythmAvg) * 100)) : 0;
        const isTop = d.dayIndex === peakRhythmDay.dayIndex && d.avgSec > 0;
        return \`
          <div class="rhythm-row" data-rhythm-day="\${d.dayIndex}">
            <span class="rhythm-day">\${d.label}</span>
            <div class="rhythm-bar-bg"><div class="rhythm-bar-fill \${isTop ? 'is-top' : ''}" style="width:\${pct}%;"></div></div>
            <span class="rhythm-val">\${formatCompactSavedTime(d.avgSec)} / day</span>
          </div>
        \`;
      }).join('');

      chartBodyEl.innerHTML = \`
        <div class="consistency-grid">
          <div class="heatmap-wrap">
            <div class="heatmap-inner">
              \${monthRowHtml}
              \${heatRowsHtml}
            </div>
          </div>
          <div class="rhythm-panel">
            <div class="rhythm-heading">
              <span>90-Day Weekday Averages</span>
              <span>Peak: <strong style="color:#34d399;">\${peakRhythmDay.avgSec > 0 ? peakRhythmDay.label : '—'}</strong></span>
            </div>
            \${rhythmHtml}
          </div>
        </div>
      \`;

      chartFooterEl.innerHTML = \`
        <span id="chart-footer-inspect" class="chart-footer-muted">Hover any day square for date total · Hover weekday rows to compare</span>
        <span class="chart-footer-stats">\${heatmap.bestDay ? \`Best day: <strong>\${heatmap.bestDay.label}</strong> (\${formatCompactSavedTime(heatmap.bestDay.seconds)})\` : 'No active days yet'}</span>
      \`;

      const inspectEl = chartFooterEl.querySelector('#chart-footer-inspect');
      chartBodyEl.querySelectorAll('button[data-heat-key]').forEach((btn) => {
        btn.addEventListener('mouseenter', () => {
          const k = btn.getAttribute('data-heat-key');
          const cell = heatmapMetaMap[k];
          if (!cell || !inspectEl) return;
          hoveredHeatDateKey = k;
          const d = parseLocalDateKey(k);
          const dow = getMondayBasedDayIndex(d);
          chartBodyEl.querySelectorAll('.rhythm-row').forEach((rEl) => {
            rEl.classList.toggle('is-hovered', Number(rEl.getAttribute('data-rhythm-day')) === dow);
          });
          inspectEl.className = 'chart-footer-inspect';
          inspectEl.textContent = cell.isFuture
            ? \`\${cell.label} — Upcoming\`
            : \`\${cell.label} — \${formatFullSavedTime(cell.seconds)} saved\${cell.isToday ? ' · Today' : ''}\`;
        });
        btn.addEventListener('mouseleave', () => {
          hoveredHeatDateKey = null;
          chartBodyEl.querySelectorAll('.rhythm-row.is-hovered').forEach((rEl) => rEl.classList.remove('is-hovered'));
          if (inspectEl) {
            inspectEl.className = 'chart-footer-muted';
            inspectEl.textContent = 'Hover any day square for date total · Hover weekday rows to compare';
          }
        });
      });
    }
  }

  function renderTimeSavedAnalytics() {
    const now = new Date();
    const popupMode = settings.popupTimeSavedDisplay || 'daily';
    const barMode = settings.barTimeSavedDisplay || 'daily';
    const todaySec = getTodaySavedSec(now);
    const attributedTotalSec = sumSavedTimeMap(savedTimeByDay);
    const unattributedPriorSec = Math.max(0, totalTimeSavedSec - attributedTotalSec);

    if (popupModeControlsEl) {
      popupModeControlsEl.querySelectorAll('button[data-popup-mode]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-popup-mode') === popupMode);
      });
    }
    if (barModeControlsEl) {
      barModeControlsEl.querySelectorAll('button[data-bar-mode]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-bar-mode') === barMode);
      });
    }
    if (previewPopupEl) {
      previewPopupEl.innerHTML =
        popupMode === 'off'
          ? 'Hidden'
          : popupMode === 'total'
            ? \`Bottom-right: <strong>Saved \${formatCompactSavedTime(totalTimeSavedSec)}</strong>\`
            : \`Bottom-right: <strong>Saved \${formatCompactSavedTime(todaySec)} today</strong>\`;
    }
    if (previewBarEl) {
      previewBarEl.innerHTML =
        barMode === 'off'
          ? 'Hidden'
          : barMode === 'total'
            ? \`Before Rule: <strong>Saved \${formatCompactSavedTime(totalTimeSavedSec)}</strong>\`
            : \`Before Rule: <strong>Saved \${formatCompactSavedTime(todaySec)} today</strong>\`;
    }

    const heatmap = getActivityHeatmapGrid(12, now);
    const currentWeek = getWeekDailySeries(0, now);
    const currentMonth = getCurrentMonthKpiSummary(now);
    const bytes = estimateStorageBytes(savedTimeByDay);
    const kb = Math.max(0.1, bytes / 1024).toFixed(1);

    if (statSavedValueEl) statSavedValueEl.textContent = formatFullSavedTime(totalTimeSavedSec);
    if (statSinceLineEl) statSinceLineEl.textContent = \`Since \${getTrackingStartDateFormatted()}\`;
    if (statStoreLineEl) statStoreLineEl.textContent = \`\${heatmap.totalActiveDays} tracked days - \${kb} KB local store\`;
    if (statLegacyLineEl) {
      if (unattributedPriorSec > 0) {
        statLegacyLineEl.style.display = 'block';
        statLegacyLineEl.textContent = \`Includes \${formatCompactSavedTime(unattributedPriorSec)} recorded prior to daily tracking.\`;
      } else {
        statLegacyLineEl.style.display = 'none';
      }
    }

    if (kpiTodayValEl) kpiTodayValEl.textContent = formatCompactSavedTime(todaySec);
    if (kpiTodaySubEl) {
      const m = now.getMonth();
      const d = now.getDate();
      kpiTodaySubEl.textContent = todaySec > 0 ? \`\${MONTH_SHORT[m]} \${d} · Active\` : \`\${MONTH_SHORT[m]} \${d}\`;
    }
    if (kpiWeekValEl) kpiWeekValEl.textContent = formatCompactSavedTime(currentWeek.totalSec);
    if (kpiWeekSubEl) kpiWeekSubEl.textContent = \`Avg \${formatCompactSavedTime(currentWeek.dailyAvgSec)} / day\`;
    if (kpiMonthValEl) kpiMonthValEl.textContent = formatCompactSavedTime(currentMonth.totalSec);
    if (kpiMonthSubEl) kpiMonthSubEl.textContent = \`\${currentMonth.activeDays} active \${currentMonth.activeDays === 1 ? 'day' : 'days'}\`;
    if (kpiStreakValEl) kpiStreakValEl.textContent = \`\${heatmap.currentStreakDays}d\`;
    if (kpiStreakSubEl) {
      kpiStreakSubEl.textContent = heatmap.bestDay
        ? \`Best: \${formatCompactSavedTime(heatmap.bestDay.seconds)} (\${heatmap.bestDay.label})\`
        : 'Longest: 0d';
    }

    renderChartStage();
    renderCollapsedSummaries();
  }

  if (selectChartViewEl) {
    selectChartViewEl.addEventListener('change', () => {
      chartView = selectChartViewEl.value;
      drillMonthLabel = null;
      drillWeekLabel = null;
      renderChartStage();
    });
  }

  btnOpenResetEl.addEventListener('click', () => {
    resetConfirmBoxEl.classList.add('visible');
    inputConfirmForgetEl.value = '';
    btnConfirmForgetEl.disabled = true;
    inputConfirmForgetEl.focus();
  });

  btnCancelForgetEl.addEventListener('click', () => {
    resetConfirmBoxEl.classList.remove('visible');
    inputConfirmForgetEl.value = '';
    btnConfirmForgetEl.disabled = true;
  });

  inputConfirmForgetEl.addEventListener('input', () => {
    btnConfirmForgetEl.disabled = inputConfirmForgetEl.value.trim() !== 'Forget Time Saved';
  });

  btnConfirmForgetEl.addEventListener('click', async () => {
    if (inputConfirmForgetEl.value.trim() !== 'Forget Time Saved') return;
    totalTimeSavedSec = 0;
    savedTimeByDay = {};
    timeSavedSince = Date.now();
    await chrome.storage.local.set({ totalTimeSavedSec: 0, savedTimeByDay: {}, timeSavedSince });
    if (chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      chrome.runtime.sendMessage({ type: 'CADENCE_RESET_TIME_SAVED', timeSavedSince }, () => {});
    }
    renderTimeSavedAnalytics();
    resetConfirmBoxEl.classList.remove('visible');
    inputConfirmForgetEl.value = '';
    btnConfirmForgetEl.disabled = true;
    showStatus(\`Lifetime and daily time saved history reset to 0s (since \${getTrackingStartDateFormatted()}).\`);
  });

  function syncPresetSelectLabels() {
    if (!presetSelectEl) return;
    const musicSpd = (presets.find((p) => p.id === 'music') || { speed: 1.0 }).speed;
    const eduSpd = (presets.find((p) => p.id === 'educational') || { speed: 1.5 }).speed;
    const podSpd = (presets.find((p) => p.id === 'podcast') || { speed: 2.0 }).speed;
    const opts = presetSelectEl.options;
    if (opts[0]) opts[0].textContent = \`Music (\${formatSpeed(musicSpd)}×)\`;
    if (opts[1]) opts[1].textContent = \`Educational (\${formatSpeed(eduSpd)}×)\`;
    if (opts[2]) opts[2].textContent = \`Podcast / Lecture (\${formatSpeed(podSpd)}×)\`;
  }

  presetSelectEl.addEventListener('change', () => {
    const chosen = presets.find((p) => p.id === presetSelectEl.value);
    if (chosen && speedInputEl) {
      speedInputEl.value = String(chosen.speed);
    }
  });

  function renderPresets() {
    syncPresetSelectLabels();
    presetsEl.innerHTML = presets
      .map(
        (p) => \`
      <div class="preset-row">
        <div>
          <strong>\${p.label}</strong>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px;">\${p.description}</div>
        </div>
        <input type="number" step="0.05" min="0.25" max="4" value="\${p.speed}" data-preset-id="\${p.id}" style="width:92px;" />
      </div>
    \`
      )
      .join('');

    presetsEl.querySelectorAll('input[data-preset-id]').forEach((inp) => {
      inp.addEventListener('change', async () => {
        const id = inp.getAttribute('data-preset-id');
        const nextVal = Math.round(Math.min(4, Math.max(0.25, Number(inp.value) || 1.0)) * 100) / 100;
        presets = presets.map((p) => (p.id === id ? { ...p, speed: nextVal } : p));
        await chrome.storage.local.set({ presets });
        syncPresetSelectLabels();
        renderRules();
        renderCollapsedSummaries();
      });
    });
    renderCollapsedSummaries();
  }

  function resolveSpeed(rule) {
    if (rule.presetId === 'custom') return rule.customSpeed;
    const found = presets.find((p) => p.id === rule.presetId);
    return found ? found.speed : rule.customSpeed;
  }

  function getFilteredAndSortedRules() {
    let list = [...rules];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          (r.channelName && r.channelName.toLowerCase().includes(q)) ||
          (r.handle && r.handle.toLowerCase().includes(q))
      );
    }
    if (filterCategory !== 'all') {
      list = list.filter((r) => r.presetId === filterCategory);
    }
    if (sortBy === 'name') {
      list.sort((a, b) => a.channelName.localeCompare(b.channelName));
    } else if (sortBy === 'speed') {
      list.sort((a, b) => resolveSpeed(b) - resolveSpeed(a));
    } else {
      list.sort((a, b) => {
        const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return db - da;
      });
    }
    return list;
  }

  function renderRules() {
    if (rulesCountEl) {
      rulesCountEl.textContent = manifestVersion
        ? \`\${rules.length} saved · v\${manifestVersion}\`
        : \`\${rules.length} saved\`;
    }

    const filtered = getFilteredAndSortedRules();
    const totalCount = filtered.length;

    const limit = pageSize === -1 ? totalCount : pageSize;
    const totalPages = limit > 0 ? Math.max(1, Math.ceil(totalCount / limit)) : 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = limit > 0 ? (currentPage - 1) * limit : 0;
    const endIdx = limit > 0 ? Math.min(startIdx + limit, totalCount) : totalCount;
    const visibleRules = filtered.slice(startIdx, endIdx);

    if (rulesRangeEl) {
      if (totalCount === 0) {
        rulesRangeEl.textContent = 'Showing 0–0 of 0 rules';
      } else {
        rulesRangeEl.textContent = \`Showing \${startIdx + 1}–\${endIdx} of \${totalCount} \${totalCount === 1 ? 'rule' : 'rules'}\${rules.length !== totalCount ? \` (\${rules.length} total)\` : ''}\`;
      }
    }

    if (visibleRules.length === 0) {
      if (rules.length === 0) {
        rulesEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:12px 0;">No channel rules saved yet. Add a channel above or import a JSON backup.</p>';
      } else {
        rulesEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:12px 0;">No channel rules match your search or filter.</p>';
      }
    } else {
      rulesEl.innerHTML = visibleRules
        .map(
          (r) => \`
        <div class="rule-row">
          <div>
            <strong>\${r.channelName}</strong>
            <span style="font-size:12px;color:#94a3b8;margin-left:6px;">\${r.handle || ''} · \${r.presetId}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <strong style="font-variant-numeric:tabular-nums;">\${formatSpeed(resolveSpeed(r))}×</strong>
            <button type="button" class="row-remove" data-del-id="\${r.id}">Remove</button>
          </div>
        </div>
      \`
        )
        .join('');

      rulesEl.querySelectorAll('button[data-del-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-del-id');
          rules = rules.filter((r) => r.id !== id);
          await chrome.storage.local.set({ rules });
          renderRules();
        });
      });
    }

    if (pageButtonsEl) {
      if (totalPages <= 1 || pageSize === -1) {
        pageButtonsEl.innerHTML = '';
      } else {
        let btns = '';
        btns += \`<button type="button" class="page-btn" id="btn-prev-page" \${currentPage === 1 ? 'disabled' : ''}>Prev</button>\`;
        for (let p = 1; p <= totalPages; p++) {
          btns += \`<button type="button" class="page-btn \${p === currentPage ? 'active' : ''}" data-page="\${p}">\${p}</button>\`;
        }
        btns += \`<button type="button" class="page-btn" id="btn-next-page" \${currentPage === totalPages ? 'disabled' : ''}>Next</button>\`;
        pageButtonsEl.innerHTML = btns;

        const prevBtn = pageButtonsEl.querySelector('#btn-prev-page');
        if (prevBtn) {
          prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
              currentPage--;
              renderRules();
            }
          });
        }
        const nextBtn = pageButtonsEl.querySelector('#btn-next-page');
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
              currentPage++;
              renderRules();
            }
          });
        }
        pageButtonsEl.querySelectorAll('button[data-page]').forEach((b) => {
          b.addEventListener('click', () => {
            currentPage = Number(b.getAttribute('data-page')) || 1;
            renderRules();
          });
        });
      }
    }
    renderCollapsedSummaries();
  }

  if (searchInputEl) {
    searchInputEl.addEventListener('input', () => {
      searchQuery = searchInputEl.value;
      currentPage = 1;
      renderRules();
    });
  }

  if (categoryPillsEl) {
    categoryPillsEl.querySelectorAll('button[data-category]').forEach((btn) => {
      btn.addEventListener('click', () => {
        categoryPillsEl.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        filterCategory = btn.getAttribute('data-category') || 'all';
        currentPage = 1;
        renderRules();
      });
    });
  }

  if (sortSelectEl) {
    sortSelectEl.addEventListener('change', () => {
      sortBy = sortSelectEl.value;
      renderRules();
    });
  }

  if (pageSizeSelectEl) {
    pageSizeSelectEl.addEventListener('change', () => {
      const val = pageSizeSelectEl.value;
      pageSize = val === 'all' ? -1 : Number(val) || 10;
      currentPage = 1;
      renderRules();
    });
  }

  function mergeRuleLists(incoming, existing) {
    const merged = [...incoming];
    for (const candidate of existing) {
      const duplicate = merged.some(
        (r) =>
          (candidate.channelId && r.channelId && r.channelId === candidate.channelId) ||
          (candidate.handle && r.handle && r.handle.toLowerCase() === candidate.handle.toLowerCase()) ||
          r.channelName.toLowerCase() === candidate.channelName.toLowerCase()
      );
      if (!duplicate) {
        merged.push(candidate);
      }
    }
    return merged;
  }

  exportBtnEl.addEventListener('click', () => {
    const payload = JSON.stringify(
      {
        version: manifestVersion || '${EXTENSION_VERSION}',
        exportedAt: new Date().toISOString(),
        totalTimeSavedSec,
        timeSavedSince,
        savedTimeByDay,
        settings,
        presets,
        rules
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = \`cadence-backup-v\${manifestVersion || '${EXTENSION_VERSION}'}.json\`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showStatus(\`Exported \${rules.length} channel \${rules.length === 1 ? 'rule' : 'rules'} to backup JSON\`);
  });

  importBtnEl.addEventListener('click', () => {
    importInputEl.click();
  });

  importInputEl.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (parsed && typeof parsed.settings === 'object') {
        settings = normalizeOptionsSettings(Object.assign({}, settings, parsed.settings));
        renderToggles();
      }

      if (parsed && typeof parsed.savedTimeByDay === 'object' && parsed.savedTimeByDay !== null && !Array.isArray(parsed.savedTimeByDay)) {
        savedTimeByDay = sanitizeSavedTimeByDay(parsed.savedTimeByDay);
        const daySum = sumSavedTimeMap(savedTimeByDay);
        const incomingTotal =
          typeof parsed.totalTimeSavedSec === 'number' && parsed.totalTimeSavedSec >= 0
            ? Math.floor(parsed.totalTimeSavedSec)
            : daySum;
        totalTimeSavedSec = Math.max(incomingTotal, daySum);
      } else if (parsed && typeof parsed.totalTimeSavedSec === 'number' && parsed.totalTimeSavedSec >= 0) {
        totalTimeSavedSec = Math.floor(parsed.totalTimeSavedSec);
        savedTimeByDay = {};
      }

      if (
        parsed &&
        typeof parsed.timeSavedSince === 'number' &&
        Number.isFinite(parsed.timeSavedSince) &&
        parsed.timeSavedSince > 0
      ) {
        timeSavedSince = Math.floor(parsed.timeSavedSince);
      }

      const rawRules = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed && parsed.rules)
          ? parsed.rules
          : [];

      const sanitizedRules = rawRules
        .filter((item) => item && typeof item === 'object')
        .map((item, idx) => {
          const channelName = String(item.channelName || 'Unnamed Channel').trim();
          const validPreset =
            item.presetId === 'music' ||
            item.presetId === 'educational' ||
            item.presetId === 'podcast' ||
            item.presetId === 'custom'
              ? item.presetId
              : 'custom';
          return {
            id: typeof item.id === 'string' && item.id ? item.id : \`imported-\${Date.now()}-\${idx}\`,
            channelName,
            handle: normalizeHandle(item.handle, channelName),
            channelId: typeof item.channelId === 'string' ? item.channelId : '',
            presetId: validPreset,
            customSpeed: Math.round(Math.min(4.0, Math.max(0.25, Number(item.customSpeed) || 1.0)) * 100) / 100,
            updatedAt: new Date().toISOString().slice(0, 10),
          };
        });

      if (Array.isArray(parsed && parsed.presets)) {
        presets = presets.map((existingPreset) => {
          const incomingPreset = parsed.presets.find((p) => p && p.id === existingPreset.id);
          if (!incomingPreset) return existingPreset;
          return {
            ...existingPreset,
            speed: Math.round(Math.min(4.0, Math.max(0.25, Number(incomingPreset.speed) || existingPreset.speed)) * 100) / 100,
          };
        });
      }

      if (sanitizedRules.length > 0) {
        rules = mergeRuleLists(sanitizedRules, rules);
      }

      await chrome.storage.local.set({ settings, presets, rules, totalTimeSavedSec, savedTimeByDay, timeSavedSince });
      renderToggles();
      renderTimeSavedAnalytics();
      renderPresets();
      renderRules();
      showStatus(\`Imported backup (\${rules.length} total channel rules, \${formatFullSavedTime(totalTimeSavedSec)} time saved)\`);
    } catch (_) {
      showStatus('Could not parse JSON file. Please select a valid Cadence JSON backup.');
    } finally {
      importInputEl.value = '';
    }
  });

  resetBtnEl.addEventListener('click', async () => {
    presets = DEFAULT_PRESETS.map((p) => ({ ...p }));
    await chrome.storage.local.set({ presets });
    renderPresets();
    renderRules();
    showStatus('Reset category speed profiles to default 1.0× / 1.5× / 2.0×.');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('input-name');
    const handleInput = document.getElementById('input-handle');
    const presetSelect = document.getElementById('input-preset');
    const speedInput = document.getElementById('input-speed');

    const channelName = nameInput.value.trim();
    if (!channelName) return;
    const handle = normalizeHandle(handleInput.value, channelName);
    const cleanSpeed = Math.round(Math.min(4.0, Math.max(0.25, Number(speedInput.value) || 1.0)) * 100) / 100;

    const existingIdx = rules.findIndex(
      (r) =>
        (r.handle && r.handle.toLowerCase() === handle.toLowerCase()) ||
        r.channelName.toLowerCase() === channelName.toLowerCase()
    );

    const newRule = {
      id: existingIdx >= 0 ? rules[existingIdx].id : 'rule-' + Date.now(),
      channelName,
      handle,
      channelId: existingIdx >= 0 ? rules[existingIdx].channelId || '' : '',
      presetId: presetSelect.value,
      customSpeed: cleanSpeed,
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    if (existingIdx >= 0) {
      rules[existingIdx] = newRule;
    } else {
      rules = [newRule, ...rules];
    }

    await chrome.storage.local.set({ rules });
    nameInput.value = '';
    handleInput.value = '';
    renderRules();
    showStatus(\`Saved \${channelName} (\${formatSpeed(resolveSpeed(newRule))}×)\`);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let shouldRenderSaved = false;
    if (changes.settings && typeof changes.settings.newValue === 'object') {
      settings = normalizeOptionsSettings(changes.settings.newValue);
      renderToggles();
      shouldRenderSaved = true;
    }
    if (changes.totalTimeSavedSec && typeof changes.totalTimeSavedSec.newValue === 'number') {
      totalTimeSavedSec = Math.max(0, Math.floor(changes.totalTimeSavedSec.newValue));
      shouldRenderSaved = true;
    }
    if (changes.savedTimeByDay && typeof changes.savedTimeByDay.newValue === 'object') {
      savedTimeByDay = sanitizeSavedTimeByDay(changes.savedTimeByDay.newValue);
      shouldRenderSaved = true;
    }
    if (
      changes.timeSavedSince &&
      typeof changes.timeSavedSince.newValue === 'number' &&
      changes.timeSavedSince.newValue > 0
    ) {
      timeSavedSince = changes.timeSavedSince.newValue;
      shouldRenderSaved = true;
    }
    if (shouldRenderSaved) {
      renderTimeSavedAnalytics();
    }
    if (changes.presets && Array.isArray(changes.presets.newValue)) {
      presets = changes.presets.newValue;
      renderPresets();
    }
    if (changes.rules && Array.isArray(changes.rules.newValue)) {
      rules = changes.rules.newValue;
      renderRules();
    }
  });

  renderToggles();
  renderTimeSavedAnalytics();
  renderPresets();
  renderRules();
})();
`;

  return [
    {
      path: 'manifest.json',
      language: 'json',
      description:
        target === 'firefox'
          ? `Firefox Manifest V3 (v${EXTENSION_VERSION}) with background event scripts, Gecko ID cadence-youtube@jayseatea.github.io (128.0+), and zero data collection declaration.`
          : `Manifest V3 (v${EXTENSION_VERSION}) with minimal storage + scripting permissions, minimum_chrome_version 111, and YouTube host access.`,
      content: manifestJson,
    },
    {
      path: 'page-bridge.js',
      language: 'javascript',
      description:
        'MAIN-world bridge with 10/30/60s transport seek, reversible Shorts link rewriter & history-safe redirect, Live DVR catch-up, and ad-lock guardrails.',
      content: pageBridgeJs,
    },
    {
      path: 'content.js',
      language: 'javascript',
      description:
        'Isolated content script mounting the full-width 3-row below-video control bar above #title with collision-aware brand tagline, VOD saved time, and 1-click italic Rule slot.',
      content: contentJs,
    },
    {
      path: 'content.css',
      language: 'css',
      description:
        'Adaptive light/dark styles for the full-width 3-row below-video control bar above #title, Style B seek capsules, VOD-only saved time, and Style A italic Rule slot.',
      content: contentCss,
    },
    {
      path: 'background.js',
      language: 'javascript',
      description:
        'Service worker handling v4 clean-store schema migration, empty initial rules, options launcher, badge updates, and open-tab attachment.',
      content: backgroundJs,
    },
    {
      path: 'popup.html',
      language: 'html',
      description:
        'Native dark-mode toolbar popup with 4 focused toggles, Category Presets, Quick Speeds, and Fine ±0.05× Channel Rules.',
      content: popupHtml,
    },
    {
      path: 'popup.js',
      language: 'javascript',
      description:
        'Popup controller syncing Shorts conversion & speed bar settings, enforcing ad and live-end speed guardrails, and saving per-channel rules.',
      content: popupJs,
    },
    {
      path: 'options.html',
      language: 'html',
      description:
        'Full-tab dark-mode Chrome extension options page with dynamic version readout, JSON Import, JSON Backup, and Reset Presets.',
      content: optionsHtml,
    },
    {
      path: 'options.js',
      language: 'javascript',
      description:
        'Options page controller displaying active version and supporting category profiles, per-channel rules, JSON import/export, and preset reset.',
      content: optionsJs,
    },
  ];
}

async function renderExtensionIconBlob(size: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new Blob([], { type: 'image/png' });
  }

  const radius = Math.round(size * 0.22);
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#EF4444';
  const left = size * 0.355;
  const top = size * 0.205;
  const bottom = size * 0.615;
  const tipX = size * 0.715;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(tipX, size * 0.41);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.fill();

  const trackX = size * 0.175;
  const trackY = size * 0.71;
  const trackW = size * 0.65;
  const trackH = Math.max(2, size * 0.12);
  const trackR = trackH / 2;
  const fillW = trackW * 0.45;

  const drawPill = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + r, r, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.closePath();
  };

  ctx.save();
  drawPill(trackX, trackY, trackW, trackH, trackR);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#DC2626';
  ctx.fillRect(trackX, trackY, fillW, trackH);
  ctx.restore();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob || new Blob([], { type: 'image/png' }));
    }, 'image/png');
  });
}

async function triggerZipDownload(
  settings: ExtensionSettings,
  presets: CategoryPreset[],
  rules: ChannelRule[],
  filename: string
): Promise<void> {
  const zip = new JSZip();
  const files = buildExtensionFiles(settings, presets, rules);

  for (const file of files) {
    zip.file(file.path, file.content);
  }

  const iconSizes = [16, 32, 48, 128];
  for (const sz of iconSizes) {
    const iconBlob = await renderExtensionIconBlob(sz);
    zip.file(`icons/icon${sz}.png`, iconBlob);
  }

  const archiveBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  const downloadUrl = URL.createObjectURL(archiveBlob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);
}

export async function downloadExtensionZip(
  settings: ExtensionSettings,
  presets: CategoryPreset[],
  rules: ChannelRule[]
): Promise<void> {
  return triggerZipDownload(
    settings,
    presets,
    rules,
    'cadence-youtube-extension.zip'
  );
}

export async function downloadCwsExtensionZip(): Promise<void> {
  return triggerZipDownload(DEFAULT_SETTINGS, DEFAULT_PRESETS, [], 'CWS.zip');
}
