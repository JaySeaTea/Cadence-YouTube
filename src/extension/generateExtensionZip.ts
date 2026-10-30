import JSZip from 'jszip';
import {
  CategoryPreset,
  ChannelRule,
  ExtensionSettings,
} from '../types/extension';
import {
  DEFAULT_PRESETS,
  EXTENSION_VERSION,
  INITIAL_CHANNEL_RULES,
} from '../data/sampleDefaults';

export interface GeneratedExtensionFile {
  path: string;
  language: 'json' | 'javascript' | 'html' | 'css';
  description: string;
  content: string;
}

export function buildExtensionFiles(
  settings: ExtensionSettings,
  presets: CategoryPreset[],
  rules: ChannelRule[]
): GeneratedExtensionFile[] {
  const manifestJson = JSON.stringify(
    {
      manifest_version: 3,
      name: 'Cadence — Per-Channel Speed & Playlist Stop for YouTube',
      short_name: 'Cadence',
      version: EXTENSION_VERSION,
      description:
        'Automatically sets per-channel playback speeds on YouTube, shows real-time remaining duration at speed, and stops playback at the end of every video.',
      permissions: ['storage', 'tabs', 'scripting', 'activeTab'],
      host_permissions: ['*://*.youtube.com/*'],
      background: {
        service_worker: 'background.js',
      },
      action: {
        default_popup: 'popup.html',
        default_title: 'Cadence for YouTube',
        default_icon: {
          '16': 'icons/icon16.png',
          '32': 'icons/icon32.png',
          '48': 'icons/icon48.png',
          '128': 'icons/icon128.png',
        },
      },
      options_page: 'options.html',
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
    },
    null,
    2
  );

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
    /^https?:\\/\\/([a-z0-9-]+\\.)?youtube\\.com\\//i.test(candidateUrl) &&
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

  let config = window.__CADENCE_LAST_CONFIG__ || {
    enabled: true,
    perChannelSpeedEnabled: true,
    hasSessionOverride: false,
    stopAfterVideoEnds: true,
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
  let recentNativeSpeedGestureUntil = 0;
  let lastRemainingEmitAt = 0;
  let lastRemainingSignature = '';
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
  let wasAdPlaying = false;
  let observedPlayerEl = null;
  let playerClassObserver = null;
  let postSpeedVerifyTimer = null;

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

  function markUserNavigationIntent() {
    userInitiatedNavUntil = Date.now() + 4000;
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

  function getUrlVideoId() {
    return parseVideoIdFromHref(location.href);
  }

  function isSupportedWatchPage() {
    return location.pathname.startsWith('/watch');
  }

  function extractCardPreviewHint(target) {
    const watchAnchor = target.closest('a[href*="/watch"]');
    if (!watchAnchor) return null;
    const videoId = parseVideoIdFromHref(watchAnchor.getAttribute('href') || '');
    if (!videoId) return null;

    const card = target.closest(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer, yt-lockup-view-model'
    );

    let handle = '';
    let channelId = '';
    let channelName = '';

    if (card) {
      const channelAnchors = card.querySelectorAll('a[href*="/@"], a[href*="/channel/UC"]');
      for (const chAnchor of channelAnchors) {
        const href = chAnchor.getAttribute('href') || '';
        if (href.includes('/watch')) continue;
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
          '.ytp-next-button, .ytp-prev-button, ytd-playlist-panel-video-renderer, ytd-compact-video-renderer, a[href*="/watch"], .cadence-play-next-btn'
        )
      ) {
        markUserNavigationIntent();
      }
      if (target.closest('.ytp-settings-button, .ytp-settings-menu, .ytp-panel-menu, .ytp-menuitem')) {
        recentNativeSpeedGestureUntil = Date.now() + 4500;
      }
      if (target.closest('.ytp-live-badge')) {
        explicitJumpToLiveUntil = Date.now() + 2800;
        liveHeadHysteresisBehind = false;
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
      if (e.shiftKey && (e.key === '>' || e.key === '<' || e.key === '.' || e.key === ',')) {
        recentNativeSpeedGestureUntil = Date.now() + 2500;
        const activeEl = e.target;
        const isTyping =
          activeEl instanceof HTMLInputElement ||
          activeEl instanceof HTMLTextAreaElement ||
          Boolean(activeEl && activeEl.isContentEditable);
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
    const root = player || document;
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
    return Boolean(
      badge.disabled === true ||
        badge.hasAttribute('disabled') ||
        badge.getAttribute('aria-disabled') === 'true' ||
        badge.classList.contains('ytp-live-badge-is-livehead')
    );
  }

  function isLiveBroadcast(player, video) {
    if (isAdPlaying(player)) return false;

    const root = player || document;
    const liveTimeDisplay = root.querySelector(
      '.ytp-chrome-bottom .ytp-time-display.ytp-live, .ytp-time-display.ytp-live'
    );
    const visibleBadge = getLiveBadgeElement(player);
    if (liveTimeDisplay && visibleBadge) {
      return true;
    }

    const currentVid = getCurrentVideoId(player);
    try {
      if (player && typeof player.getVideoData === 'function') {
        const vd = player.getVideoData();
        if (vd && (!currentVid || !vd.video_id || vd.video_id === currentVid)) {
          if (vd.isLive === true) return true;
        }
      }
      if (player && typeof player.getPlayerResponse === 'function') {
        const resp = player.getPlayerResponse();
        const details = resp && resp.videoDetails;
        if (details && (!currentVid || !details.videoId || details.videoId === currentVid)) {
          if (details.isLive === true) return true;
          const liveMicro =
            resp.microformat &&
            resp.microformat.playerMicroformatRenderer &&
            resp.microformat.playerMicroformatRenderer.liveBroadcastDetails;
          if (liveMicro && liveMicro.isLiveNow === true) return true;
        }
      }
    } catch (_) {}

    if (video && video.readyState >= 1 && !Number.isFinite(video.duration)) {
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
  }

  function applyLiveHeadRateClamp(player, video) {
    isApplyingProgrammatically = true;
    clearTimeout(programmaticTimer);
    lastAppliedSpeed = 1.0;
    try {
      if (player && typeof player.setPlaybackRate === 'function') {
        const pr =
          typeof player.getPlaybackRate === 'function' ? Number(player.getPlaybackRate()) : 1.5;
        if (!Number.isFinite(pr) || pr > 1.01) {
          player.setPlaybackRate(1);
        }
      }
    } catch (_) {}
    if (video && video.playbackRate > 1.01) {
      video.playbackRate = 1.0;
    }
    programmaticTimer = setTimeout(() => {
      isApplyingProgrammatically = false;
    }, 350);
  }

  function syncNativeLiveBadgeOnCatchup(player, video) {
    const now = Date.now();
    if (now < explicitJumpToLiveUntil || now - lastAutoLiveSyncAt < 3500) {
      applyLiveHeadRateClamp(player, video);
      return;
    }
    lastAutoLiveSyncAt = now;
    explicitJumpToLiveUntil = now + 2800;
    catchupMaxLagSec = null;
    catchupActive = false;
    lastCatchupVideoSec = null;
    const badge = getLiveBadgeElement(player);
    if (badge && !isLiveBadgeAtHead(badge)) {
      try {
        badge.click();
      } catch (_) {}
    }
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

    const isPaused = Boolean(video && video.paused);
    const currentVideoSec =
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

    if (ps && Number.isFinite(ps.seekableEnd)) {
      if (!isPaused && lastObservedSeekableEnd !== null && ps.seekableEnd > lastObservedSeekableEnd + 0.25) {
        seekableEndAdvanceCount = Math.min(10, seekableEndAdvanceCount + 1);
        lastSeekableEndWallMs = now;
      }
      lastObservedSeekableEnd = ps.seekableEnd;
    }

    let preAnchorLagSec = null;
    if (liveAnchorWallMs > 0 && liveAnchorWallMs <= now && liveAnchorVideoSec !== null && currentVideoSec !== null) {
      const preExpectedLive = liveAnchorVideoSec + Math.max(0, (now - liveAnchorWallMs) / 1000);
      preAnchorLagSec = Math.max(0, preExpectedLive - currentVideoSec);
    }

    const backwardSeeked =
      lastObservedCurrentTime !== null &&
      currentVideoSec !== null &&
      currentVideoSec < lastObservedCurrentTime - 1.25;

    const forwardSeekedNearHead =
      lastObservedCurrentTime !== null &&
      currentVideoSec !== null &&
      currentVideoSec - lastObservedCurrentTime > 4.5 &&
      (preAnchorLagSec === null || preAnchorLagSec <= 12);

    if (currentVideoSec !== null) {
      lastObservedCurrentTime = currentVideoSec;
    }

    const psIsAtHead =
      ps && typeof ps.isAtLiveHead === 'boolean' ? ps.isAtLiveHead : null;

    let cleanPsLag = null;
    let rawPsLagUninterpolated = null;
    let slidingDvrCapSec = null;
    if (
      !psHasMseCeiling &&
      ps &&
      Number.isFinite(ps.seekableEnd) &&
      Number.isFinite(ps.current) &&
      ps.seekableEnd >= ps.current
    ) {
      const rawPsLag = ps.seekableEnd - ps.current;
      const matchesMseDurationCeiling =
        (mediaDuration !== null &&
          maxBufferedEnd !== null &&
          mediaDuration - maxBufferedEnd > 300 &&
          Math.abs(ps.seekableEnd - mediaDuration) < 30) ||
        (mediaDuration !== null &&
          currentVideoSec !== null &&
          currentVideoSec < 20 &&
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
        if (liveAnchorWallMs === 0 && currentVideoSec !== null) {
          liveAnchorVideoSec = currentVideoSec + cleanPsLag;
          liveAnchorWallMs = now;
        }
      }
    }

    const canTrustHeadSignal =
      !isPaused &&
      (now < explicitJumpToLiveUntil ||
        forwardSeekedNearHead ||
        preAnchorLagSec === null ||
        preAnchorLagSec <= 12 ||
        (seekableEndAdvanceCount >= 2 && cleanPsLag !== null && cleanPsLag <= 10));

    const confirmedAtHead =
      canTrustHeadSignal &&
      (badgeAtHead || (psIsAtHead === true && (uiNegSec === null || uiNegSec <= 10)));

    if (confirmedAtHead) {
      if (currentVideoSec !== null) {
        liveAnchorVideoSec = currentVideoSec;
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
      if (liveAnchorWallMs === 0 && currentVideoSec !== null) {
        liveAnchorVideoSec = currentVideoSec + uiNegSec;
        liveAnchorWallMs = now;
      }
    }

    const psManifestRefreshed =
      !isPaused &&
      cleanPsLag !== null &&
      (resumedAtWallMs === 0 || seekableEndAdvanceCount >= 2);

    let anchorLagSec = null;
    if (liveAnchorWallMs > 0 && liveAnchorVideoSec !== null && currentVideoSec !== null) {
      let expectedLiveVideoSec =
        liveAnchorVideoSec + Math.max(0, (now - liveAnchorWallMs) / 1000);
      if (currentVideoSec > expectedLiveVideoSec + 1.5) {
        liveAnchorVideoSec = currentVideoSec;
        liveAnchorWallMs = now;
        expectedLiveVideoSec = currentVideoSec;
      } else if (
        psManifestRefreshed &&
        Math.abs(expectedLiveVideoSec - currentVideoSec - cleanPsLag) > 5
      ) {
        liveAnchorVideoSec = currentVideoSec + cleanPsLag;
        liveAnchorWallMs = now;
        expectedLiveVideoSec = liveAnchorVideoSec;
      } else if (
        !isPaused &&
        cleanPsLag !== null &&
        cleanPsLag > expectedLiveVideoSec - currentVideoSec + 5
      ) {
        liveAnchorVideoSec = currentVideoSec + cleanPsLag;
        liveAnchorWallMs = now;
        expectedLiveVideoSec = liveAnchorVideoSec;
      } else if (
        slidingDvrCapSec !== null &&
        expectedLiveVideoSec - currentVideoSec > slidingDvrCapSec
      ) {
        expectedLiveVideoSec = currentVideoSec + slidingDvrCapSec;
        liveAnchorVideoSec = expectedLiveVideoSec;
        liveAnchorWallMs = now;
      }
      anchorLagSec = Math.max(0, expectedLiveVideoSec - currentVideoSec);
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
      currentVideoSec !== null &&
      video.seekable &&
      video.seekable.length > 0
    ) {
      try {
        const hlsEnd = video.seekable.end(video.seekable.length - 1);
        if (Number.isFinite(hlsEnd) && hlsEnd >= currentVideoSec) {
          verifiedLagSec = Math.max(0, hlsEnd - currentVideoSec);
          if (liveAnchorWallMs === 0) {
            liveAnchorVideoSec = hlsEnd;
            liveAnchorWallMs = now;
          }
        }
      } catch (_) {}
    }

    if (verifiedLagSec === null) {
      if (isPaused && pausedAtWallMs > 0) {
        const pausedDrift = Math.max(0, (now - pausedAtWallMs) / 1000);
        if (currentVideoSec !== null && liveAnchorWallMs === 0) {
          liveAnchorVideoSec = currentVideoSec + pausedDrift;
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
          currentVideoSec !== null &&
          currentVideoSec < lastCatchupVideoSec - 1.25) ||
        (catchupMaxLagSec !== null && verifiedLagSec - catchupMaxLagSec > 18);

      catchupActive = true;
      if (catchupMaxLagSec === null || largeBackwardJump) {
        catchupMaxLagSec = verifiedLagSec;
      } else if (verifiedLagSec > catchupMaxLagSec) {
        verifiedLagSec = catchupMaxLagSec;
      } else {
        catchupMaxLagSec = verifiedLagSec;
      }
      if (currentVideoSec !== null) {
        lastCatchupVideoSec = currentVideoSec;
      }
    } else {
      catchupMaxLagSec = null;
      catchupActive = false;
      lastCatchupVideoSec = currentVideoSec;
    }

    const wasBehindBeforeTick = liveHeadHysteresisBehind;
    const rawNearHead =
      !isPaused &&
      catchupActive &&
      rawPsLagUninterpolated !== null &&
      rawPsLagUninterpolated <= 9.5;
    const pinnedAtLiveBufferCeiling =
      !isPaused &&
      catchupActive &&
      maxBufferedEnd !== null &&
      currentVideoSec !== null &&
      maxBufferedEnd - currentVideoSec <= 0.65 &&
      verifiedLagSec <= 14;

    if (liveHeadHysteresisBehind) {
      if (
        (!isPaused && (verifiedLagSec <= 9.5 || rawNearHead || pinnedAtLiveBufferCeiling)) ||
        verifiedLagSec <= 2
      ) {
        liveHeadHysteresisBehind = false;
      }
    } else {
      if (verifiedLagSec >= 12 || (isPaused && verifiedLagSec >= 5)) {
        liveHeadHysteresisBehind = true;
      }
    }

    if (wasBehindBeforeTick && !liveHeadHysteresisBehind && !isPaused) {
      syncNativeLiveBadgeOnCatchup(player, video);
      return {
        isAtLiveHead: true,
        dvrLagSec: 0,
        isPaused: false,
      };
    }

    return {
      isAtLiveHead: !liveHeadHysteresisBehind,
      dvrLagSec: Math.round(verifiedLagSec),
      isPaused,
    };
  }

  function maybeRestoreDvrCatchupSpeed() {
    if (!isSupportedWatchPage() || !config.enabled || isApplyingProgrammatically) return;
    const now = Date.now();
    if (now - lastDvrRestoreAt < 400 || dvrRestoreAttempts >= 4) return;

    const player = getMoviePlayer();
    const video = getMainVideo();
    if (!video || video.paused || isAdPlaying(player)) return;
    if (!isLiveBroadcast(player, video)) return;

    const target = Number(config.targetSpeed) || 1.0;
    if (Math.abs(target - 1.0) <= 0.02) return;

    const dvr = measureLiveDvrState(player, video, getCurrentVideoId(player));
    if (!dvr.isAtLiveHead && Math.abs(video.playbackRate - target) > 0.03) {
      lastDvrRestoreAt = now;
      dvrRestoreAttempts += 1;
      applyPlaybackSpeed(target, false, true);
    }
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
    const adActive = isAdPlaying(player);
    if (adActive) {
      const adSig = videoId + '|ad';
      if (!force && adSig === lastRemainingSignature) return;
      lastRemainingEmitAt = now;
      lastRemainingSignature = adSig;
      postToContent('TIME_REMAINING_UPDATE', {
        videoId,
        rawRemainingSec: null,
        playbackRate: 1.0,
        isAd: true,
        isLive: false,
        isAtLiveHead: false,
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
        liveRate = mediaRate < 0.99 ? mediaRate : 1.0;
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
        playbackRate: Math.round(liveRate * 100) / 100,
        isAd: false,
        isLive: true,
        isAtLiveHead: dvr.isAtLiveHead,
        dvrLagSec: dvr.dvrLagSec,
        isPaused: dvr.isPaused,
        hidden: false,
      });
      return;
    }

    wasAtLiveHead = false;
    const rate = mediaRate;
    const invalidDuration = !Number.isFinite(video.duration) || video.duration <= 0;
    const rawRemainingSec = invalidDuration
      ? null
      : Math.max(0, video.duration - video.currentTime);
    const realRemSec = rawRemainingSec === null ? null : Math.max(0, Math.round(rawRemainingSec / rate));
    const realBucket =
      realRemSec === null
        ? 'na'
        : realRemSec < 60
          ? 's' + realRemSec
          : 'm' + Math.round(realRemSec / 60);
    const sig = [videoId, 'vod', realBucket, rate.toFixed(2)].join('|');

    if (!force && sig === lastRemainingSignature) return;
    lastRemainingEmitAt = now;
    lastRemainingSignature = sig;

    postToContent('TIME_REMAINING_UPDATE', {
      videoId,
      rawRemainingSec,
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
    if (liveActive) {
      const dvr = measureLiveDvrState(player, video, getCurrentVideoId(player));
      if (dvr.isAtLiveHead && numericSpeed > 1.01) {
        numericSpeed = 1.0;
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
            player.setPlaybackRate(Number(closestAvail));
          }
        } else if (
          numericSpeed >= 0.25 &&
          numericSpeed <= 2.0 &&
          Math.abs(Math.round(numericSpeed * 4) - numericSpeed * 4) < 0.001
        ) {
          player.setPlaybackRate(numericSpeed);
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
          if ((!nowLive || (nowDvr && !nowDvr.isAtLiveHead)) && !vNow.paused) {
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

  function suppressNativeAutoplayAndPlaylist() {
    if (!config.enabled || !config.stopAfterVideoEnds) return;
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
      try {
        playlistManager.canAutoAdvance_ = false;
      } catch (_) {}
    }
  }

  function checkNearVideoEnd() {
    if (!config.enabled || !config.stopAfterVideoEnds || !isSupportedWatchPage()) return;
    const player = getMoviePlayer();
    const video = getMainVideo();
    if (!video || isAdPlaying(player) || video.loop || isLiveBroadcast(player, video)) return;

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 2.5) return;

    const remaining = duration - video.currentTime;
    const currentVideoId = getCurrentVideoId(player) || 'active';

    if (remaining > 2.5 && heldAtEndVideoId === currentVideoId) {
      heldAtEndVideoId = null;
      window.__CADENCE_HELD_VIDEO_ID__ = null;
    }

    const threshold = Math.max(0.28, 0.24 * (video.playbackRate || 1));
    if (
      !video.paused &&
      remaining > 0 &&
      remaining <= threshold &&
      heldAtEndVideoId !== currentVideoId &&
      Date.now() > userInitiatedNavUntil
    ) {
      heldAtEndVideoId = currentVideoId;
      window.__CADENCE_HELD_VIDEO_ID__ = currentVideoId;
      suppressNativeAutoplayAndPlaylist();
      try {
        if (player && typeof player.pauseVideo === 'function') {
          player.pauseVideo();
        }
      } catch (_) {}
      video.pause();

      postToContent('PLAYBACK_STOPPED', {
        videoId: currentVideoId,
        hasPlaylist: new URLSearchParams(location.search).has('list'),
      });
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
        checkAdTransition();
        checkNearVideoEnd();
        emitTimeRemaining(false);
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'seeked',
      () => {
        dvrRestoreAttempts = 0;
        maybeRestoreDvrCatchupSpeed();
        emitTimeRemaining(true);
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'pause',
      () => {
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
        config = { ...config, ...payload };
        window.__CADENCE_LAST_CONFIG__ = config;
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
          config.targetSpeed = payload.speed;
          window.__CADENCE_LAST_CONFIG__ = config;
          applyPlaybackSpeed(payload.speed);
        } else if (payload.action === 'REPLAY_VIDEO') {
          const video = getMainVideo();
          const player = getMoviePlayer();
          heldAtEndVideoId = null;
          window.__CADENCE_HELD_VIDEO_ID__ = null;
          if (video) {
            video.currentTime = 0;
            video.play().catch(() => {});
          }
          if (player && typeof player.playVideo === 'function') {
            player.playVideo();
          }
          emitTimeRemaining(true);
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
          explicitJumpToLiveUntil = Date.now() + 2800;
          const badge = getLiveBadgeElement(player);
          let jumpedViaBadge = false;
          if (badge && !isLiveBadgeAtHead(badge)) {
            badge.click();
            jumpedViaBadge = true;
          }
          if (video) {
            if (!jumpedViaBadge) {
              let targetEdge = null;
              try {
                if (!psHasMseCeiling && player && typeof player.getProgressState === 'function') {
                  const ps = player.getProgressState();
                  if (ps && Number.isFinite(ps.seekableEnd) && ps.seekableEnd > 0) {
                    targetEdge = ps.seekableEnd;
                  }
                }
              } catch (_) {}
              if (
                targetEdge === null &&
                liveAnchorWallMs > 0 &&
                liveAnchorVideoSec !== null
              ) {
                targetEdge =
                  liveAnchorVideoSec + Math.max(0, (Date.now() - liveAnchorWallMs) / 1000);
              }
              if (targetEdge === null && video.buffered && video.buffered.length > 0) {
                try {
                  targetEdge = video.buffered.end(video.buffered.length - 1);
                } catch (_) {}
              }
              if (targetEdge !== null && Number.isFinite(targetEdge)) {
                const safeEdge = Math.max(0, targetEdge - 0.25);
                liveAnchorVideoSec = safeEdge;
                liveAnchorWallMs = Date.now();
                try {
                  if (player && typeof player.seekTo === 'function') {
                    player.seekTo(safeEdge, true);
                  } else {
                    video.currentTime = safeEdge;
                  }
                } catch (_) {
                  video.currentTime = safeEdge;
                }
              }
            }
            if (video.playbackRate > 1.01) {
              applyLiveHeadRateClamp(player, video);
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
          emitTimeRemaining(true);
          setTimeout(() => emitTimeRemaining(true), 80);
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
      if (!isSupportedWatchPage()) {
        handleNonWatchRoute();
      } else {
        startFastDetectionBurst();
      }
    },
    { signal: bridgeSignal }
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
    checkAdTransition();
    broadcastChannelMetadata(false);
    checkNearVideoEnd();
    maybeRestoreDvrCatchupSpeed();
    emitTimeRemaining(false);
  }, 250);

  window.__CADENCE_PAGE_BRIDGE_CLEANUP__ = () => {
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

  broadcastChannelMetadata(true);
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
    playbackRate: null,
    isAd: false,
    isLive: false,
    isAtLiveHead: false,
    dvrLagSec: null,
    isPaused: false,
    hidden: true,
  };
  let lastToastedVideoId = null;
  let toastTimeout = null;
  let barToastTimeout = null;
  let barToastVisible = false;
  let barToastReason = null;
  let barMountRetryTimer = null;
  let barMountAttempts = 0;

  const WARNING_ICON_SVG =
    '<svg class="cadence-toast-warn-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M8 2.25L14.25 13.25H1.75L8 2.25Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M8 6.5V9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>' +
    '</svg>';

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
    if (!player) return false;
    if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
      return false;
    }
    const video =
      player.querySelector('video.html5-main-video') ||
      document.querySelector('ytd-watch-flexy video.html5-main-video');
    if (video && video.paused) return false;
    const liveTime = player.querySelector(
      '.ytp-chrome-bottom .ytp-time-display.ytp-live, .ytp-time-display.ytp-live'
    );
    const badge = player.querySelector('.ytp-chrome-bottom .ytp-live-badge, .ytp-live-badge');
    if (!liveTime || !(badge instanceof HTMLElement) || badge.hasAttribute('hidden')) {
      return false;
    }
    try {
      const style = window.getComputedStyle(badge);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    } catch (_) {}
    return Boolean(
      badge.disabled === true ||
        badge.hasAttribute('disabled') ||
        badge.getAttribute('aria-disabled') === 'true' ||
        badge.classList.contains('ytp-live-badge-is-livehead')
    );
  }

  function isLiveAtHeadForChannel(meta) {
    if (remainingState.isLive) {
      if (!remainingState.isAtLiveHead) return false;
      if (meta && meta.videoId && remainingState.videoId && meta.videoId !== remainingState.videoId) {
        return false;
      }
      return true;
    }
    if (remainingState.hidden) {
      return isDomLiveHeadFallback();
    }
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
      const effectiveSpeed = getEffectiveSpeedForChannel(currentChannel);
      const liveRate = state.settings.enabled
        ? effectiveSpeed
        : typeof remainingState.playbackRate === 'number' && remainingState.playbackRate > 0
          ? remainingState.playbackRate
          : 1.0;

      if (liveRate > 1.02) {
        const catchUpSec = Math.max(1, Math.round(lagSec / (liveRate - 1.0)));
        const catchUpLabel = formatCompactDuration(catchUpSec);
        const titlePrefix = remainingState.isPaused
          ? \`Paused \${lagLabel} behind live · Resuming at \${formatDisplaySpeed(liveRate)}× catches up in \${catchUpLabel}\`
          : \`\${lagLabel} behind live · Catching up at \${formatDisplaySpeed(liveRate)}×\`;
        return {
          visible: true,
          mode: 'live-catchup',
          text: \`−\${lagLabel} · Live in \${catchUpLabel} @ \${formatDisplaySpeed(liveRate)}×\`,
          title: \`\${titlePrefix} · Click to jump to live edge\`,
          clickable: true,
        };
      }

      return {
        visible: true,
        mode: 'live-behind',
        text: \`\${lagLabel} behind Live\`,
        title: \`\${remainingState.isPaused ? 'Paused · ' : ''}Increase speed above 1× to catch up, or click to jump to live edge\`,
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

  function applyDurationModelToBar(bar, model) {
    if (!bar) return;
    const wrapEl = bar.querySelector('.cadence-remaining-wrap');
    const slotBtn = bar.querySelector('.cadence-remaining-slot');
    const dotEl = bar.querySelector('.cadence-live-dot');
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
    const nextSizer = buildDurationSizerText(model.text);
    if (sizerEl && sizerEl.textContent !== nextSizer) {
      sizerEl.textContent = nextSizer;
    }
    if (timeEl.textContent !== model.text) {
      timeEl.textContent = model.text;
    }
    const nextTitle = model.title || '';
    if (slotBtn.title !== nextTitle) {
      slotBtn.title = nextTitle;
    }
    const shouldDisable = !model.clickable;
    if (slotBtn.disabled !== shouldDisable) {
      slotBtn.disabled = shouldDisable;
    }
    slotBtn.classList.toggle('is-clickable', Boolean(model.clickable));
    slotBtn.classList.toggle('is-live-head', model.mode === 'live-head');

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

  function updateRemainingReadoutInPlace() {
    const bar = document.getElementById('cadence-owner-bar');
    if (!bar) return;
    applyDurationModelToBar(bar, computeDurationSlotModel());
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
    const bar = document.getElementById('cadence-owner-bar');
    if (!toastEl || !bar || !isWatchLocation()) {
      if (toastEl) toastEl.classList.remove('cadence-visible');
      return false;
    }
    const barRect = bar.getBoundingClientRect();
    if (barRect.width === 0 && barRect.height === 0) {
      toastEl.classList.remove('cadence-visible');
      return false;
    }
    const anchorEl = bar.querySelector('.cadence-bar-buttons') || bar;
    const anchorRect = anchorEl.getBoundingClientRect();
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

  function showStoppedBanner(hasPlaylist) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    const player = getWatchPlayerElement();
    if (!player) return;
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
          <button type="button" class="cadence-btn cadence-dismiss-btn">Dismiss</button>
        </div>
      \`;
      banner.querySelector('.cadence-replay-btn').addEventListener(
        'click',
        () => {
          banner.classList.remove('cadence-visible');
          postToBridge('COMMAND', { action: 'REPLAY_VIDEO' });
        },
        { signal: lifecycleSignal }
      );
      banner.querySelector('.cadence-play-next-btn').addEventListener(
        'click',
        () => {
          banner.classList.remove('cadence-visible');
          postToBridge('COMMAND', { action: 'PLAY_NEXT_MANUAL' });
        },
        { signal: lifecycleSignal }
      );
      banner.querySelector('.cadence-dismiss-btn').addEventListener(
        'click',
        () => {
          banner.classList.remove('cadence-visible');
        },
        { signal: lifecycleSignal }
      );
      player.appendChild(banner);
    }

    const textEl = banner.querySelector('.cadence-stopped-text');
    textEl.textContent = hasPlaylist
      ? 'Cadence stopped playback · Playlist auto-advance prevented'
      : 'Cadence stopped playback · Autoplay prevented';
    banner.classList.add('cadence-visible');
  }

  async function saveChannelSpeed(meta, speed, presetId = 'custom') {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return false;
    }
    if (!meta || !meta.channelName) return false;
    const cleanSpeed = clampSpeed(speed);
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
      presetId,
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

    if (liveAtHead && Math.abs(cleanSpeed - 1.0) < 0.015) {
      sessionOverride = { videoId: null, speed: null };
      remainingState.playbackRate = 1.0;
      pushConfigToBridge(1.0, true);
      postToBridge('COMMAND', { action: 'SET_SPEED', speed: 1.0 });
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
    postToBridge('COMMAND', { action: 'SET_SPEED', speed: effectiveResetSpeed });
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

  function renderInPageBar() {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    let existing = document.getElementById('cadence-owner-bar');
    if (existing && existing.getAttribute('data-cadence-instance') !== INSTANCE_TOKEN) {
      existing.remove();
      existing = null;
    }

    if (!isWatchLocation()) {
      clearBarMountRetry();
      hideBarToast(true);
      if (existing) existing.remove();
      return;
    }

    if (!currentChannel) {
      currentChannel = extractDomChannelFallback();
    }
    if (!state.settings.enabled || !state.settings.showInPageControlBar || !currentChannel) {
      clearBarMountRetry();
      hideBarToast(true);
      if (existing) existing.remove();
      return;
    }

    const ownerContainer =
      document.querySelector('ytd-watch-flexy ytd-watch-metadata #owner') ||
      document.querySelector('ytd-watch-metadata #owner') ||
      document.querySelector('#above-the-fold #owner');
    if (!ownerContainer) {
      scheduleBarMountRetryIfNeeded();
      return;
    }
    clearBarMountRetry();

    let bar = existing;
    if (!bar || bar.parentElement !== ownerContainer) {
      if (bar) bar.remove();
      bar = document.createElement('div');
      bar.id = 'cadence-owner-bar';
      bar.className = 'cadence-owner-bar';
      bar.setAttribute('data-cadence-instance', INSTANCE_TOKEN);
      ownerContainer.appendChild(bar);
    }

    clearSessionOverrideIfMatchesBaseline(currentChannel);
    const adActive = isCurrentAdActive();
    const matchedRule = findMatchingRule(currentChannel);
    const baselineSpeed = getBaselineSpeedForChannel(currentChannel);
    const isSessionActive = hasActiveSessionOverride(currentChannel.videoId);
    const effectiveSpeed = getEffectiveSpeedForChannel(currentChannel);
    const liveAtHead = !adActive && isLiveAtHeadForChannel(currentChannel);
    const isLiveRuleClamped =
      !adActive && !isSessionActive && liveAtHead && baselineSpeed > 1.01;
    const isStepUpLiveBlocked = !adActive && liveAtHead && effectiveSpeed + 0.05 > 1.01;
    const liveBlockedTooltip = 'Unavailable while synced at live end — rewind stream to speed up';
    const adBlockedTooltip = 'Speed locked during ad';
    const modePrefix = adActive
      ? 'Ad'
      : isSessionActive
        ? 'Session'
        : matchedRule
          ? 'Rule'
          : 'Default';
    const displayedBarRate = adActive ? 1.0 : effectiveSpeed;
    const tooltip = adActive
      ? isSessionActive
        ? \`Ad playing at 1× · Session \${formatDisplaySpeed(sessionOverride.speed)}× restores automatically after ad\`
        : \`Ad playing at 1× · Speed locked during ad\`
      : isSessionActive
        ? \`Session override for this video only · Baseline is \${formatDisplaySpeed(baselineSpeed)}×\`
        : isLiveRuleClamped
          ? \`Live stream at live end · Saved \${formatDisplaySpeed(baselineSpeed)}× rule is clamped to 1.0× at live edge\`
          : 'Session-only speed bar · Does not overwrite saved channel rules';
    const durationModel = computeDurationSlotModel();

    const quickSpeeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    bar.innerHTML = \`
      <span class="cadence-bar-label \${!adActive && isSessionActive ? 'is-session' : ''}" title="\${tooltip}">
        <span class="cadence-bar-label-sizer" aria-hidden="true">Session · <strong>8.88×</strong></span>
        <span class="cadence-bar-label-text">\${modePrefix} · <strong>\${formatCompactSpeed(displayedBarRate)}×</strong></span>
      </span>
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
      <span class="cadence-bar-divider" aria-hidden="true"></span>
      <div class="cadence-bar-Fine">
        <button type="button" data-step="-0.05" class="cadence-step-chip\${adActive ? ' is-ad-blocked' : ''}"\${adActive ? ' aria-disabled="true"' : ''} title="\${adActive ? adBlockedTooltip : 'Slow down by 0.05× for this video session'}">−0.05</button>
        <button type="button" data-step="0.05" class="cadence-step-chip\${adActive ? ' is-ad-blocked' : isStepUpLiveBlocked ? ' is-live-blocked' : ''}"\${adActive || isStepUpLiveBlocked ? ' aria-disabled="true"' : ''} title="\${adActive ? adBlockedTooltip : isStepUpLiveBlocked ? liveBlockedTooltip : 'Speed up by 0.05× for this video session'}">+0.05</button>
        <button type="button" data-action="reset" class="cadence-reset-chip \${!adActive && isSessionActive ? 'is-active' : ''}\${adActive ? ' is-ad-blocked' : ''}" \${!adActive && !isSessionActive ? 'disabled' : ''}\${adActive ? ' aria-disabled="true"' : ''} title="\${adActive ? adBlockedTooltip : \`Reset to \${matchedRule ? 'channel rule' : 'default'} (\${formatDisplaySpeed(liveAtHead && baselineSpeed > 1.01 ? 1.0 : baselineSpeed)}×)\`}">Reset</button>
      </div>
      <span class="cadence-remaining-wrap" style="display:none;">
        <span class="cadence-bar-divider" aria-hidden="true"></span>
        <button type="button" class="cadence-remaining-slot" disabled>
          <span class="cadence-live-dot" aria-hidden="true" style="display:none;"></span>
          <span class="cadence-remaining-time-grid">
            <span class="cadence-remaining-sizer" aria-hidden="true"></span>
            <span class="cadence-remaining-time"></span>
          </span>
        </button>
      </span>
    \`;

    applyDurationModelToBar(bar, durationModel);

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

    const remainingSlotBtn = bar.querySelector('.cadence-remaining-slot');
    if (remainingSlotBtn) {
      remainingSlotBtn.addEventListener(
        'click',
        () => {
          if (remainingSlotBtn.disabled) return;
          hideBarToast();
          if (
            currentChannel &&
            hasActiveSessionOverride(currentChannel.videoId) &&
            sessionOverride.speed > 1.01
          ) {
            sessionOverride = { videoId: null, speed: null };
          }
          remainingState.isAtLiveHead = true;
          remainingState.dvrLagSec = 0;
          remainingState.isPaused = false;
          remainingState.playbackRate = 1.0;
          const headSpeed = getEffectiveSpeedForChannel(currentChannel);
          pushConfigToBridge(headSpeed, true);
          postToBridge('COMMAND', { action: 'JUMP_TO_LIVE' });
          renderInPageBar();
          showPlayerToast('Jumped to Live · 1.0×');
        },
        { signal: lifecycleSignal }
      );
    }

    if (barToastVisible) {
      positionBarToast();
    }
  }

  function handleLeftWatchPage() {
    currentChannel = null;
    sessionOverride = { videoId: null, speed: null };
    remainingState = {
      videoId: null,
      rawRemainingSec: null,
      playbackRate: null,
      isAd: false,
      isLive: false,
      isAtLiveHead: false,
      dvrLagSec: null,
      isPaused: false,
      hidden: true,
    };
    lastToastedVideoId = null;
    clearBarMountRetry();
    hideBarToast(true);

    const existingBar = document.getElementById('cadence-owner-bar');
    if (existingBar) existingBar.remove();
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
        } else if (type === 'LIVE_CAUGHT_UP') {
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
            if (hadFastRate) {
              showPlayerToast('Caught up to Live · 1.0×');
            }
          }
        } else if (type === 'TIME_REMAINING_UPDATE' && payload) {
          const prevAd = Boolean(remainingState.isAd);
          const prevLiveAtHead = Boolean(remainingState.isLive && remainingState.isAtLiveHead);
          const prevIsLive = Boolean(remainingState.isLive);
          remainingState = {
            videoId: payload.videoId || null,
            rawRemainingSec:
              typeof payload.rawRemainingSec === 'number' ? payload.rawRemainingSec : null,
            playbackRate:
              typeof payload.playbackRate === 'number' ? payload.playbackRate : null,
            isAd: Boolean(payload.isAd),
            isLive: Boolean(payload.isLive),
            isAtLiveHead: Boolean(payload.isAtLiveHead),
            dvrLagSec: typeof payload.dvrLagSec === 'number' ? payload.dvrLagSec : null,
            isPaused: Boolean(payload.isPaused),
            hidden: Boolean(payload.hidden),
          };
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
            if (currentChannel && state.settings.enabled && state.settings.perChannelSpeedEnabled) {
              pushConfigToBridge(getEffectiveSpeedForChannel(currentChannel), true);
            }
            renderInPageBar();
          } else if (prevLiveAtHead && !nowLiveAtHead && remainingState.isLive) {
            if (barToastReason === 'live') hideBarToast();
            if (currentChannel && state.settings.enabled && state.settings.perChannelSpeedEnabled) {
              pushConfigToBridge(getEffectiveSpeedForChannel(currentChannel), true);
            }
            renderInPageBar();
          } else if (prevIsLive !== remainingState.isLive) {
            if (!remainingState.isLive && barToastReason === 'live') hideBarToast();
            if (currentChannel && state.settings.enabled && state.settings.perChannelSpeedEnabled) {
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
          if (remainingState.videoId !== payload.videoId) {
            hideBarToast();
            remainingState = {
              videoId: payload.videoId,
              rawRemainingSec: null,
              playbackRate: null,
              isAd: false,
              isLive: false,
              isAtLiveHead: false,
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
            if (sessionOverride.videoId !== payload.videoId) {
              sessionOverride = { videoId: null, speed: null };
            }
            if (remainingState.videoId !== payload.videoId) {
              remainingState = {
                videoId: payload.videoId,
                rawRemainingSec: null,
                playbackRate: null,
                isAd: Boolean(payload.isAd),
                isLive: false,
                isAtLiveHead: false,
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

          if (state.settings.autoRememberManualSpeed) {
            sessionOverride = { videoId: null, speed: null };
            const matchingPreset = state.presets.find(
              (p) => Math.abs(p.speed - cleanManualSpeed) < 0.01
            );
            const saved = await saveChannelSpeed(
              currentChannel,
              cleanManualSpeed,
              matchingPreset ? matchingPreset.id : 'custom'
            );
            if (!saved) return;
            pushConfigToBridge(cleanManualSpeed, true);
            showPlayerToast(
              \`Remembered \${formatDisplaySpeed(cleanManualSpeed)}× for \${currentChannel.channelName}\`
            );
          } else {
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
          }
        } else if (type === 'PLAYBACK_STOPPED') {
          showStoppedBanner(Boolean(payload && payload.hasPlaylist));
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
          sessionOverride = { videoId: null, speed: null };
          saveChannelSpeed(targetMeta, requestedSpeed, msg.presetId || 'custom').then((ok) => {
            if (ok) {
              const appliedSpeed = getEffectiveSpeedForChannel(targetMeta);
              remainingState.playbackRate = appliedSpeed;
              pushConfigToBridge(appliedSpeed, true);
              postToBridge('COMMAND', { action: 'SET_SPEED', speed: appliedSpeed });
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
      if (changes.settings) state.settings = changes.settings.newValue;
      if (changes.presets) state.presets = changes.presets.newValue;
      if (changes.rules) state.rules = changes.rules.newValue;
      applyForCurrentChannel(false);
    });
  } catch (_) {
    teardownInstance();
    return;
  }

  safeStorageGet(['settings', 'presets', 'rules']).then((stored) => {
    if (!stored || isDestroyed || !isExtensionContextValid()) return;
    if (stored.settings) state.settings = stored.settings;
    if (stored.presets) state.presets = stored.presets;
    if (stored.rules) state.rules = stored.rules;

    postToBridge('CONFIG_UPDATE', {
      enabled: state.settings.enabled,
      perChannelSpeedEnabled: state.settings.perChannelSpeedEnabled,
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

  const contentCss = `.cadence-owner-bar {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.04);
  font-family: Roboto, Arial, sans-serif;
  font-size: 12px;
  color: inherit;
}

html[dark] .cadence-owner-bar {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.14);
  color: #f1f5f9;
}

.cadence-bar-label {
  display: inline-grid;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
  opacity: 0.92;
  font-variant-numeric: tabular-nums;
}

.cadence-bar-label-sizer,
.cadence-bar-label-text {
  grid-area: 1 / 1;
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.cadence-bar-label-sizer {
  visibility: hidden;
  pointer-events: none;
  user-select: none;
}

.cadence-bar-label.is-session strong {
  color: #f97316;
}

html[dark] .cadence-bar-label.is-session strong {
  color: #fdba74;
}

.cadence-bar-buttons,
.cadence-bar-Fine {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.cadence-bar-divider {
  width: 1px;
  height: 14px;
  background: rgba(148, 163, 184, 0.3);
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
  padding: 2px 5px;
  border-radius: 5px;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  cursor: default;
  transition: background 140ms ease, border-color 140ms ease, opacity 140ms ease;
}

.cadence-remaining-slot:disabled {
  opacity: 0.82;
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

.cadence-step-chip,
.cadence-reset-chip {
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: transparent;
  color: inherit;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  transition: background 140ms ease, opacity 140ms ease, border-color 140ms ease;
}

.cadence-step-chip:hover,
.cadence-reset-chip.is-active:hover {
  background: rgba(148, 163, 184, 0.22);
}

.cadence-speed-chip.is-live-blocked:not(.active),
.cadence-step-chip.is-live-blocked,
.cadence-speed-chip.is-ad-blocked,
.cadence-step-chip.is-ad-blocked,
.cadence-reset-chip.is-ad-blocked {
  opacity: 0.42;
}

.cadence-speed-chip.is-live-blocked:not(.active):hover,
.cadence-step-chip.is-live-blocked:hover,
.cadence-speed-chip.is-ad-blocked:hover,
.cadence-step-chip.is-ad-blocked:hover,
.cadence-reset-chip.is-ad-blocked:hover {
  opacity: 0.68;
  background: rgba(245, 158, 11, 0.14);
}

.cadence-reset-chip:disabled {
  opacity: 0.42;
  cursor: default;
}

.cadence-reset-chip.is-active {
  border-color: rgba(220, 38, 38, 0.55);
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
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
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

.cadence-stopped-banner.cadence-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.cadence-stopped-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cadence-btn {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  padding: 5px 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.cadence-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.cadence-play-next-btn {
  background: #dc2626;
  border-color: #dc2626;
}

.cadence-play-next-btn:hover {
  background: #b91c1c;
}
`;

  const popupHtml = `<!doctype html>
<html lang="en" style="color-scheme: dark;">
  <head>
    <meta charset="UTF-8" />
    <title>Cadence for YouTube</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: 356px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #0b0f19;
        color: #f1f5f9;
        padding: 16px;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 12px;
        border-bottom: 1px solid #1e293b;
      }
      .brand-wrap {
        display: inline-flex;
        align-items: baseline;
        gap: 6px;
      }
      .brand { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; color: #f8fafc; }
      .version-meta {
        font-size: 11px;
        font-weight: 500;
        color: #94a3b8;
        font-variant-numeric: tabular-nums;
      }
      .link-btn {
        border: none;
        background: none;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        text-decoration: underline;
      }
      .link-btn:hover { color: #f8fafc; }
      .section {
        padding: 12px 0;
        border-bottom: 1px solid #1e293b;
      }
      .section:last-child { border-bottom: none; padding-bottom: 0; }
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
        gap: 8px;
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
      .speed-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 5px;
      }
      .spd-btn {
        padding: 6px 0;
        border: 1px solid #334155;
        background: #111827;
        color: #e2e8f0;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        font-variant-numeric: tabular-nums;
      }
      .spd-btn:hover { background: #1e293b; }
      .spd-btn.active {
        background: #dc2626;
        border-color: #dc2626;
        color: #ffffff;
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
      .spd-btn.is-blocked:not(.active),
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
      input[type="checkbox"] { width: 16px; height: 16px; accent-color: #dc2626; cursor: pointer; }
      .footer-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .rule-count { font-size: 12px; color: #94a3b8; font-variant-numeric: tabular-nums; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="brand-wrap">
        <span class="brand">Cadence</span>
        <span class="version-meta" id="ext-version"></span>
      </div>
      <button id="open-options" class="link-btn">All Channel Rules</button>
    </div>

    <div class="section" id="active-channel-box">
      <div class="meta-row">
        <span class="kicker" id="channel-status">Active YouTube Tab</span>
        <span class="speed-readout" id="active-speed-readout"></span>
      </div>
      <div class="channel-title" id="channel-name">Open a YouTube video</div>
      <div class="channel-handle" id="channel-handle"></div>
      <div class="popup-toast" id="popup-toast" role="status" aria-live="polite"></div>

      <div class="controls-wrap" id="controls-wrap">
        <div class="preset-grid" id="preset-buttons"></div>
        <div class="speed-grid" id="speed-buttons">
          <button class="spd-btn" data-speed="1">1.0×</button>
          <button class="spd-btn" data-speed="1.25">1.25×</button>
          <button class="spd-btn" data-speed="1.5">1.5×</button>
          <button class="spd-btn" data-speed="1.75">1.75×</button>
          <button class="spd-btn" data-speed="2">2.0×</button>
        </div>
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
          <div class="row-label">Per-Channel Playback Speed</div>
          <div class="row-sub">Auto-apply saved speed on channel load</div>
        </div>
        <input type="checkbox" id="toggle-speed" />
      </div>
      <div class="row">
        <div>
          <div class="row-label">Remember Manual Changes</div>
          <div class="row-sub">Also save YouTube gear-menu speed to rules</div>
        </div>
        <input type="checkbox" id="toggle-remember" />
      </div>
      <div class="row">
        <div>
          <div class="row-label">Stop Playback After Video Ends</div>
          <div class="row-sub">Blocks Up Next, Watch Later &amp; Playlists</div>
        </div>
        <input type="checkbox" id="toggle-stop" />
      </div>
      <div class="row">
        <div>
          <div class="row-label">Show Speed Bar Below Video</div>
          <div class="row-sub">Session-only speed bar &amp; remaining time</div>
        </div>
        <input type="checkbox" id="toggle-bar" />
      </div>
    </div>

    <div class="section footer-row">
      <span class="rule-count" id="saved-summary">0 channels configured</span>
      <span class="version-meta" id="footer-version"></span>
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

  const manifestVersion =
    chrome.runtime && typeof chrome.runtime.getManifest === 'function'
      ? chrome.runtime.getManifest().version
      : '';
  const versionEl = document.getElementById('ext-version');
  const footerVersionEl = document.getElementById('footer-version');
  if (versionEl && manifestVersion) {
    versionEl.textContent = \`· v\${manifestVersion}\`;
  }
  if (footerVersionEl && manifestVersion) {
    footerVersionEl.textContent = \`v\${manifestVersion}\`;
  }

  const stored = await chrome.storage.local.get(['settings', 'rules', 'presets']);
  const settings = stored.settings || {
    enabled: true,
    perChannelSpeedEnabled: true,
    autoRememberManualSpeed: false,
    stopAfterVideoEnds: true,
    showInPageControlBar: true,
    showSpeedToast: true,
    defaultSpeed: 1.0,
    settingsSchemaVersion: 2,
  };
  let rules = Array.isArray(stored.rules) ? stored.rules : [];
  const presets = Array.isArray(stored.presets) && stored.presets.length > 0
    ? stored.presets
    : [
        { id: 'music', label: 'Music', speed: 1.0 },
        { id: 'educational', label: 'Educational', speed: 1.5 },
        { id: 'podcast', label: 'Podcast', speed: 2.0 },
      ];

  const toggleSpeed = document.getElementById('toggle-speed');
  const toggleRemember = document.getElementById('toggle-remember');
  const toggleStop = document.getElementById('toggle-stop');
  const toggleBar = document.getElementById('toggle-bar');
  const summaryEl = document.getElementById('saved-summary');
  const statusEl = document.getElementById('channel-status');
  const readoutEl = document.getElementById('active-speed-readout');
  const channelNameEl = document.getElementById('channel-name');
  const channelHandleEl = document.getElementById('channel-handle');
  const popupToastEl = document.getElementById('popup-toast');
  const controlsWrapEl = document.getElementById('controls-wrap');
  const presetGridEl = document.getElementById('preset-buttons');
  const speedGridEl = document.getElementById('speed-buttons');
  const stepperValEl = document.getElementById('stepper-value');
  const stepDownBtn = document.getElementById('step-down');
  const stepUpBtn = document.getElementById('step-up');
  let popupToastTimer = null;

  function showPopupToast(message) {
    if (!popupToastEl) return;
    popupToastEl.textContent = message;
    popupToastEl.classList.add('visible');
    clearTimeout(popupToastTimer);
    popupToastTimer = setTimeout(() => {
      popupToastEl.classList.remove('visible');
    }, 2400);
  }

  toggleSpeed.checked = Boolean(settings.perChannelSpeedEnabled);
  toggleRemember.checked = Boolean(settings.autoRememberManualSpeed);
  toggleStop.checked = Boolean(settings.stopAfterVideoEnds);
  toggleBar.checked = settings.showInPageControlBar !== false;

  function renderRuleCount() {
    summaryEl.textContent = \`\${rules.length} saved channel \${rules.length === 1 ? 'rule' : 'rules'}\`;
  }
  renderRuleCount();

  async function updateSetting(patch) {
    Object.assign(settings, patch);
    await chrome.storage.local.set({ settings: { ...settings } });
  }

  toggleSpeed.addEventListener('change', () => updateSetting({ perChannelSpeedEnabled: toggleSpeed.checked }));
  toggleRemember.addEventListener('change', () => updateSetting({ autoRememberManualSpeed: toggleRemember.checked }));
  toggleStop.addEventListener('change', () => updateSetting({ stopAfterVideoEnds: toggleStop.checked }));
  toggleBar.addEventListener('change', () => updateSetting({ showInPageControlBar: toggleBar.checked }));

  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
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
                if (!isAd && resp.videoDetails.isLive === true) isLive = true;
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
            if (!isAd) {
              const badge = document.querySelector('.ytp-chrome-bottom .ytp-live-badge, .ytp-live-badge');
              const liveTime = document.querySelector('.ytp-time-display.ytp-live');
              if (badge && liveTime && !badge.hasAttribute('hidden')) {
                isLive = true;
                isAtLiveHead = Boolean(
                  badge.disabled === true ||
                    badge.hasAttribute('disabled') ||
                    badge.getAttribute('aria-disabled') === 'true' ||
                    badge.classList.contains('ytp-live-badge-is-livehead')
                );
              }
              if (isLive && !isAtLiveHead && player && typeof player.getProgressState === 'function') {
                const ps = player.getProgressState();
                if (ps && ps.isAtLiveHead === true && !(video && video.paused)) {
                  isAtLiveHead = true;
                }
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
                p.setPlaybackRate(spd);
              }
            } catch (_) {}
          },
        })
        .catch(() => {});
    }
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
        currentRule && baseline > 1.01
          ? \`Live End (1.0×) · Rule \${formatSpeed(baseline)}×\`
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

    speedGridEl.querySelectorAll('.spd-btn').forEach((btn) => {
      const val = Number(btn.getAttribute('data-speed'));
      const blocked = isAd || (isLive && isAtLiveHead && val > 1.01);
      btn.classList.toggle(
        'active',
        !isAd && sessionOverrideSpeed === null && Math.abs(val - currentSpeed) < 0.015
      );
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
    if (isLive && clean < 0.99) {
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
    renderRuleCount();
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
              p.setPlaybackRate(spd);
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

  speedGridEl.querySelectorAll('.spd-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spd = Number(btn.getAttribute('data-speed'));
      const matchedPreset = presets.find((p) => Math.abs(p.speed - spd) < 0.01);
      assignSpeedFromPopup(spd, matchedPreset ? matchedPreset.id : 'custom');
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

  const sampleDefaultsJson = JSON.stringify(
    {
      presets: DEFAULT_PRESETS,
      rules: INITIAL_CHANNEL_RULES,
    },
    null,
    2
  );

  const optionsHtml = `<!doctype html>
<html lang="en" style="color-scheme: dark;">
  <head>
    <meta charset="UTF-8" />
    <title>Cadence — Channel Rules &amp; Playback Settings</title>
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
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        padding-bottom: 20px;
        margin-bottom: 24px;
        border-bottom: 1px solid #1e293b;
      }
      .title-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin-bottom: 6px;
      }
      h1 { font-size: 24px; font-weight: 700; color: #f8fafc; letter-spacing: -0.01em; }
      .version-meta {
        font-size: 13px;
        font-weight: 500;
        color: #94a3b8;
        font-variant-numeric: tabular-nums;
      }
      .sub { color: #94a3b8; font-size: 14px; max-width: 560px; line-height: 1.5; }
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
      .panel {
        background: #111827;
        border: 1px solid #1e293b;
        border-radius: 10px;
        padding: 20px;
        margin-bottom: 24px;
      }
      .panel-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      h2 { font-size: 16px; font-weight: 600; color: #f8fafc; }
      .count-label { font-size: 12px; color: #94a3b8; font-variant-numeric: tabular-nums; }
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
    </style>
  </head>
  <body>
    <div class="container">
      <div class="top-header">
        <div>
          <div class="title-row">
            <h1>Cadence for YouTube</h1>
            <span id="ext-version" class="version-meta"></span>
          </div>
          <p class="sub">Configure category speed profiles, manage per-channel playback rules, or import and back up your personal subscriptions as JSON.</p>
        </div>
        <div class="toolbar-actions">
          <input type="file" id="import-json-input" accept="application/json,.json" style="display:none;" />
          <button type="button" id="btn-import-json" class="ghost">Import JSON</button>
          <button type="button" id="btn-export-json" class="ghost">Backup JSON</button>
          <button type="button" id="btn-reset-samples" class="ghost">Reset Samples</button>
        </div>
      </div>

      <div id="status-banner" class="status-banner" role="status" aria-live="polite"></div>

      <div class="panel">
        <div class="panel-head">
          <h2>01. Category Speed Profiles</h2>
          <span class="count-label">Applies to linked channels</span>
        </div>
        <div id="presets-list"></div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>02. Saved Channel Speed Rules</h2>
          <span id="rules-count" class="count-label">0 saved</span>
        </div>
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
        <div id="rules-list"></div>
      </div>
    </div>
    <script src="options.js"></script>
  </body>
</html>
`;

  const optionsJs = `(async () => {
  const SAMPLE_DEFAULTS = ${sampleDefaultsJson};

  const manifestVersion =
    chrome.runtime && typeof chrome.runtime.getManifest === 'function'
      ? chrome.runtime.getManifest().version
      : '';
  const versionEl = document.getElementById('ext-version');
  if (versionEl && manifestVersion) {
    versionEl.textContent = \`· v\${manifestVersion}\`;
  }

  let stored = await chrome.storage.local.get(['presets', 'rules']);
  let presets = Array.isArray(stored.presets) && stored.presets.length > 0
    ? stored.presets
    : SAMPLE_DEFAULTS.presets.map((p) => ({ ...p }));
  let rules = Array.isArray(stored.rules)
    ? stored.rules
    : SAMPLE_DEFAULTS.rules.map((r) => ({ ...r }));

  const presetsEl = document.getElementById('presets-list');
  const rulesEl = document.getElementById('rules-list');
  const rulesCountEl = document.getElementById('rules-count');
  const form = document.getElementById('add-rule-form');
  const presetSelectEl = document.getElementById('input-preset');
  const speedInputEl = document.getElementById('input-speed');
  const importInputEl = document.getElementById('import-json-input');
  const importBtnEl = document.getElementById('btn-import-json');
  const exportBtnEl = document.getElementById('btn-export-json');
  const resetBtnEl = document.getElementById('btn-reset-samples');
  const statusBannerEl = document.getElementById('status-banner');
  let statusTimer = null;

  function formatSpeed(val) {
    return Number(val).toFixed(2).replace(/\\.00$/, '.0').replace(/(\\.\\d)0$/, '$1');
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
      });
    });
  }

  function resolveSpeed(rule) {
    if (rule.presetId === 'custom') return rule.customSpeed;
    const found = presets.find((p) => p.id === rule.presetId);
    return found ? found.speed : rule.customSpeed;
  }

  function renderRules() {
    if (rulesCountEl) {
      rulesCountEl.textContent = manifestVersion
        ? \`\${rules.length} saved · v\${manifestVersion}\`
        : \`\${rules.length} saved\`;
    }
    if (rules.length === 0) {
      rulesEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:8px 0;">No channel rules saved yet. Add a channel above or import a JSON backup.</p>';
      return;
    }
    rulesEl.innerHTML = rules
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
    const payload = JSON.stringify({ presets, rules }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cadence-channel-rules.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showStatus(\`Exported \${rules.length} channel \${rules.length === 1 ? 'rule' : 'rules'} to cadence-channel-rules.json\`);
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
        await chrome.storage.local.set({ presets, rules });
        renderPresets();
        renderRules();
        showStatus(\`Imported \${sanitizedRules.length} channel \${sanitizedRules.length === 1 ? 'rule' : 'rules'} (\${rules.length} total saved)\`);
      } else {
        showStatus('No valid channel rules found in selected JSON file.');
      }
    } catch (_) {
      showStatus('Could not parse JSON file. Please select a valid Cadence JSON backup.');
    } finally {
      importInputEl.value = '';
    }
  });

  resetBtnEl.addEventListener('click', async () => {
    presets = SAMPLE_DEFAULTS.presets.map((p) => ({ ...p }));
    rules = SAMPLE_DEFAULTS.rules.map((r) => ({ ...r }));
    await chrome.storage.local.set({ presets, rules });
    renderPresets();
    renderRules();
    showStatus('Reset extension to the 4 starter sample rules.');
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
    if (changes.presets && Array.isArray(changes.presets.newValue)) {
      presets = changes.presets.newValue;
      renderPresets();
    }
    if (changes.rules && Array.isArray(changes.rules.newValue)) {
      rules = changes.rules.newValue;
      renderRules();
    }
  });

  renderPresets();
  renderRules();
})();
`;

  return [
    {
      path: 'manifest.json',
      language: 'json',
      description: `Manifest V3 (v${EXTENSION_VERSION}) running MAIN and ISOLATED scripts at document_start for millisecond speed lock.`,
      content: manifestJson,
    },
    {
      path: 'page-bridge.js',
      language: 'javascript',
      description:
        'MAIN-world bridge with smooth monotonic Live DVR catch-up, automatic native LIVE badge sync, ad-lock guardrails, and zero-lag loadstart enforcement.',
      content: pageBridgeJs,
    },
    {
      path: 'content.js',
      language: 'javascript',
      description:
        'Isolated content script with ad speed locking & post-ad session override restoration, live-end guardrails, and fixed-width compact watch bar.',
      content: contentJs,
    },
    {
      path: 'content.css',
      language: 'css',
      description:
        'Adaptive light/dark styles for the zero-shift fixed-width speed bar, ad/live-blocked indicators, floating amber bar toast, and end-stop banner.',
      content: contentCss,
    },
    {
      path: 'background.js',
      language: 'javascript',
      description:
        'Service worker handling v2 settings migration, instant toolbar badge clearing on non-watch YouTube routes, and open-tab attachment.',
      content: backgroundJs,
    },
    {
      path: 'popup.html',
      language: 'html',
      description:
        'Native dark-mode toolbar popup displaying active version, ad/live status notices, Category Presets, Quick Speeds, and Fine ±0.05× Channel Rules.',
      content: popupHtml,
    },
    {
      path: 'popup.js',
      language: 'javascript',
      description:
        'Popup controller reading manifest version dynamically, enforcing ad and live-end speed guardrails with inline toast feedback, and saving channel rules.',
      content: popupJs,
    },
    {
      path: 'options.html',
      language: 'html',
      description:
        'Full-tab dark-mode Chrome extension options page with dynamic version readout, JSON Import, JSON Backup, and Reset Samples.',
      content: optionsHtml,
    },
    {
      path: 'options.js',
      language: 'javascript',
      description:
        'Options page controller displaying active version and supporting category profiles, per-channel rules, JSON import/export, and sample reset.',
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

  ctx.fillStyle = '#DC2626';
  const left = size * 0.24;
  const top = size * 0.25;
  const bottom = size * 0.75;
  const midX = size * 0.6;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(midX, size * 0.5);
  ctx.lineTo(left, bottom);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#F8FAFC';
  const barWidth = Math.max(2, Math.round(size * 0.11));
  const barX = Math.round(size * 0.67);
  ctx.fillRect(barX, Math.round(top), barWidth, Math.round(bottom - top));

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob || new Blob([], { type: 'image/png' }));
    }, 'image/png');
  });
}

export async function downloadExtensionZip(
  settings: ExtensionSettings,
  presets: CategoryPreset[],
  rules: ChannelRule[]
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

  const archiveBlob = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(archiveBlob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = 'cadence-youtube-extension.zip';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);
}
