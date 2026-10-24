import JSZip from 'jszip';
import {
  CategoryPreset,
  ChannelRule,
  ExtensionSettings,
} from '../types/extension';
import {
  DEFAULT_PRESETS,
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
      version: '1.1.0',
      description:
        'Automatically sets per-channel playback speeds on YouTube and stops playback at the end of every video, including Watch Later and playlists.',
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
          run_at: 'document_idle',
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
`;

  const pageBridgeJs = `(() => {
  if (window.__CADENCE_PAGE_BRIDGE_V2__) {
    window.postMessage({ source: 'CADENCE_ISOLATED_CONTENT', type: 'COMMAND', payload: { action: 'FORCE_DETECT' } }, '*');
    return;
  }
  window.__CADENCE_PAGE_BRIDGE_V2__ = true;

  let config = {
    enabled: true,
    perChannelSpeedEnabled: true,
    stopAfterVideoEnds: true,
    targetSpeed: 1.0,
  };

  let isApplyingProgrammatically = false;
  let programmaticTimer = null;
  let lastAppliedSpeed = 1.0;
  let lastDetectedKey = '';
  let heldAtEndVideoId = null;
  let userInitiatedNavUntil = 0;

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

  document.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (
        target.closest(
          '.ytp-next-button, .ytp-prev-button, ytd-playlist-panel-video-renderer, ytd-compact-video-renderer, a[href*="/watch"], a[href*="/live/"], .cadence-play-next-btn'
        )
      ) {
        markUserNavigationIntent();
      }
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.shiftKey && (e.key === 'N' || e.key === 'n' || e.key === 'P' || e.key === 'p')) {
        markUserNavigationIntent();
      }
    },
    true
  );

  function getMoviePlayer() {
    return document.getElementById('movie_player');
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

  function isSupportedWatchOrLivePage() {
    return (
      location.pathname.startsWith('/watch') ||
      location.pathname.startsWith('/live')
    );
  }

  function getCurrentVideoId(player) {
    const params = new URLSearchParams(location.search);
    if (params.get('v')) return params.get('v');
    if (location.pathname.startsWith('/live/')) {
      const seg = location.pathname.split('/live/')[1];
      if (seg) return seg.split(/[/?#]/)[0];
    }
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

  function extractChannelMetadata() {
    if (!isSupportedWatchOrLivePage()) {
      return null;
    }
    const player = getMoviePlayer();
    const adActive = isAdPlaying(player);
    let videoId = getCurrentVideoId(player);
    let channelId = '';
    let channelName = '';
    let handle = '';
    let title = '';
    let isLive = location.pathname.startsWith('/live');

    try {
      if (player && typeof player.getPlayerResponse === 'function') {
        const resp = player.getPlayerResponse();
        if (resp && resp.videoDetails) {
          videoId = resp.videoDetails.videoId || videoId;
          channelId = resp.videoDetails.channelId || '';
          channelName = resp.videoDetails.author || '';
          title = resp.videoDetails.title || '';
          isLive = Boolean(resp.videoDetails.isLiveContent) || isLive;
        }
      }
      if ((!channelName || !videoId) && player && typeof player.getVideoData === 'function') {
        const vd = player.getVideoData();
        if (vd) {
          videoId = vd.video_id || videoId;
          channelName = channelName || vd.author || '';
          title = title || vd.title || '';
        }
      }
    } catch (_) {}

    const ownerLink =
      document.querySelector('ytd-watch-flexy ytd-watch-metadata #owner ytd-channel-name a[href]') ||
      document.querySelector('ytd-watch-flexy ytd-video-owner-renderer ytd-channel-name a[href]') ||
      document.querySelector('ytd-watch-metadata #owner ytd-channel-name a[href]') ||
      document.querySelector('#owner ytd-channel-name a[href]');

    if (ownerLink) {
      const href = ownerLink.getAttribute('href') || '';
      const handleMatch = href.match(/\\/(@[^/?#]+)/);
      if (handleMatch) handle = handleMatch[1].toLowerCase();
      const chMatch = href.match(/\\/channel\\/(UC[^/?#]+)/);
      if (chMatch && !channelId) channelId = chMatch[1];
      const domText = (ownerLink.textContent || '').trim();
      if (domText && !adActive) channelName = domText;
    }

    if (!channelId) {
      const metaCh = document.querySelector('ytd-watch-flexy meta[itemprop="channelId"], meta[itemprop="channelId"]');
      if (metaCh) channelId = metaCh.getAttribute('content') || '';
    }

    if (!channelName) {
      const authorLink = document.querySelector('ytd-watch-flexy span[itemprop="author"] link[itemprop="name"]');
      if (authorLink) channelName = authorLink.getAttribute('content') || '';
    }

    if (!videoId || (!channelName && !channelId && !handle)) {
      return null;
    }

    const video = getMainVideo();
    return {
      videoId,
      channelId,
      channelName,
      handle,
      title,
      isAd: adActive,
      isLive,
      currentRate: video ? Number(video.playbackRate.toFixed(2)) : 1.0,
      hasPlaylist: new URLSearchParams(location.search).has('list'),
      listId: new URLSearchParams(location.search).get('list') || '',
    };
  }

  function applyPlaybackSpeed(speed) {
    const numericSpeed = Math.min(4.0, Math.max(0.25, Math.round(Number(speed) * 100) / 100 || 1.0));
    const player = getMoviePlayer();
    const video = getMainVideo();
    if (!video || isAdPlaying(player)) return;

    isApplyingProgrammatically = true;
    clearTimeout(programmaticTimer);
    lastAppliedSpeed = numericSpeed;

    try {
      if (
        player &&
        typeof player.setPlaybackRate === 'function' &&
        numericSpeed >= 0.25 &&
        numericSpeed <= 2.0 &&
        Math.abs(Math.round(numericSpeed * 20) - numericSpeed * 20) < 0.001
      ) {
        player.setPlaybackRate(numericSpeed);
      }
    } catch (_) {}

    if (Math.abs(video.playbackRate - numericSpeed) > 0.008) {
      video.playbackRate = numericSpeed;
    }

    programmaticTimer = setTimeout(() => {
      isApplyingProgrammatically = false;
    }, 450);
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
    if (!config.enabled || !config.stopAfterVideoEnds) return;
    const player = getMoviePlayer();
    const video = getMainVideo();
    if (!video || isAdPlaying(player) || video.loop) return;

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 2.5) return;

    const remaining = duration - video.currentTime;
    const currentVideoId = getCurrentVideoId(player) || 'active';

    if (remaining > 2.5 && heldAtEndVideoId === currentVideoId) {
      heldAtEndVideoId = null;
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

  function bindVideoListeners() {
    const video = getMainVideo();
    if (!video || video.__cadenceBoundV2) return;
    video.__cadenceBoundV2 = true;

    video.addEventListener('timeupdate', checkNearVideoEnd);
    video.addEventListener('loadedmetadata', () => {
      heldAtEndVideoId = null;
      broadcastChannelMetadata(true);
      if (config.enabled && config.perChannelSpeedEnabled) {
        setTimeout(() => applyPlaybackSpeed(config.targetSpeed), 120);
      }
      suppressNativeAutoplayAndPlaylist();
    });

    video.addEventListener('play', () => {
      suppressNativeAutoplayAndPlaylist();
      if (config.enabled && config.perChannelSpeedEnabled) {
        const player = getMoviePlayer();
        if (!isAdPlaying(player) && Math.abs(video.playbackRate - config.targetSpeed) > 0.015) {
          applyPlaybackSpeed(config.targetSpeed);
        }
      }
    });

    video.addEventListener('ratechange', () => {
      const player = getMoviePlayer();
      if (isApplyingProgrammatically || isAdPlaying(player)) return;
      const newRate = Math.round(video.playbackRate * 100) / 100;
      if (Math.abs(newRate - lastAppliedSpeed) >= 0.03) {
        lastAppliedSpeed = newRate;
        const meta = extractChannelMetadata();
        if (meta) {
          postToContent('MANUAL_RATE_CHANGE', { ...meta, speed: newRate });
        }
      }
    });
  }

  function broadcastChannelMetadata(force = false) {
    bindVideoListeners();
    suppressNativeAutoplayAndPlaylist();
    const meta = extractChannelMetadata();
    if (!meta) return;
    const key = [meta.videoId, meta.channelId, meta.handle, meta.channelName, meta.isAd].join('|');
    if (force || key !== lastDetectedKey) {
      lastDetectedKey = key;
      postToContent('VIDEO_DETECTED', meta);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'CADENCE_ISOLATED_CONTENT') {
      return;
    }
    const { type, payload = {} } = event.data;
    if (type === 'CONFIG_UPDATE') {
      config = { ...config, ...payload };
      suppressNativeAutoplayAndPlaylist();
      if (config.enabled && config.perChannelSpeedEnabled && typeof payload.targetSpeed === 'number') {
        applyPlaybackSpeed(payload.targetSpeed);
      }
    } else if (type === 'COMMAND') {
      if (payload.action === 'SET_SPEED') {
        config.targetSpeed = payload.speed;
        applyPlaybackSpeed(payload.speed);
      } else if (payload.action === 'REPLAY_VIDEO') {
        const video = getMainVideo();
        const player = getMoviePlayer();
        heldAtEndVideoId = null;
        if (video) {
          video.currentTime = 0;
          video.play().catch(() => {});
        }
        if (player && typeof player.playVideo === 'function') {
          player.playVideo();
        }
      } else if (payload.action === 'PLAY_NEXT_MANUAL') {
        markUserNavigationIntent();
        const player = getMoviePlayer();
        if (player && typeof player.nextVideo === 'function') {
          player.nextVideo();
        } else {
          const nextBtn = document.querySelector('.ytp-next-button');
          if (nextBtn instanceof HTMLElement) nextBtn.click();
        }
      } else if (payload.action === 'FORCE_DETECT') {
        broadcastChannelMetadata(true);
      }
    }
  });

  window.addEventListener('yt-navigate-finish', () => {
    heldAtEndVideoId = null;
    setTimeout(() => broadcastChannelMetadata(true), 120);
    setTimeout(() => broadcastChannelMetadata(true), 700);
  });

  window.addEventListener('yt-page-data-updated', () => {
    setTimeout(() => broadcastChannelMetadata(true), 120);
  });

  setInterval(() => {
    broadcastChannelMetadata(false);
    checkNearVideoEnd();
  }, 250);

  broadcastChannelMetadata(true);
})();
`;

  const contentJs = `(() => {
  if (window.__CADENCE_CONTENT_SCRIPT_V2__) return;
  window.__CADENCE_CONTENT_SCRIPT_V2__ = true;

  let state = {
    settings: ${JSON.stringify(settings)},
    presets: ${JSON.stringify(presets)},
    rules: ${JSON.stringify(rules)},
  };

  let currentChannel = null;
  let activeSpeed = 1.0;
  let toastTimeout = null;

  function normalizeText(str) {
    return (str || '').trim().toLowerCase();
  }

  function formatDisplaySpeed(speed) {
    return Number(speed).toFixed(2).replace(/\\.00$/, '.0').replace(/(\\.\\d)0$/, '$1');
  }

  function postToBridge(type, payload) {
    window.postMessage(
      {
        source: 'CADENCE_ISOLATED_CONTENT',
        type,
        payload,
      },
      '*'
    );
  }

  // Direct DOM reader inside ISOLATED world so channel detection works immediately even before MAIN bridge responds
  function extractDomChannelFallback() {
    if (!location.pathname.startsWith('/watch') && !location.pathname.startsWith('/live')) {
      return null;
    }
    let videoId = new URLSearchParams(location.search).get('v') || '';
    if (!videoId && location.pathname.startsWith('/live/')) {
      const seg = location.pathname.split('/live/')[1];
      if (seg) videoId = seg.split(/[/?#]/)[0];
    }
    const flexy = document.querySelector('ytd-watch-flexy');
    if (!videoId && flexy) {
      videoId = flexy.getAttribute('video-id') || '';
    }

    const ownerLink =
      document.querySelector('ytd-watch-flexy ytd-watch-metadata #owner ytd-channel-name a[href]') ||
      document.querySelector('ytd-watch-flexy ytd-video-owner-renderer ytd-channel-name a[href]') ||
      document.querySelector('ytd-watch-metadata #owner ytd-channel-name a[href]') ||
      document.querySelector('#owner ytd-channel-name a[href]');

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

    if (!channelId) {
      const metaCh = document.querySelector('ytd-watch-flexy meta[itemprop="channelId"], meta[itemprop="channelId"]');
      if (metaCh) channelId = metaCh.getAttribute('content') || '';
    }

    if (!channelName) {
      const authorMeta = document.querySelector('ytd-watch-flexy span[itemprop="author"] link[itemprop="name"]');
      if (authorMeta) channelName = authorMeta.getAttribute('content') || '';
    }

    if (!channelName && !handle && !channelId) {
      return null;
    }

    return {
      videoId: videoId || 'active',
      channelId,
      channelName: channelName || handle,
      handle,
      isAd: false,
      isLive: location.pathname.startsWith('/live'),
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

  function pushConfigToBridge(targetSpeed) {
    activeSpeed = Math.round(Number(targetSpeed) * 100) / 100 || 1.0;
    postToBridge('CONFIG_UPDATE', {
      enabled: state.settings.enabled,
      perChannelSpeedEnabled: state.settings.perChannelSpeedEnabled,
      stopAfterVideoEnds: state.settings.stopAfterVideoEnds,
      targetSpeed: activeSpeed,
    });
    chrome.runtime
      .sendMessage({
        type: 'CADENCE_UPDATE_BADGE',
        enabled: state.settings.enabled && state.settings.perChannelSpeedEnabled,
        speed: activeSpeed,
      })
      .catch(() => {});
  }

  function showPlayerToast(label) {
    if (!state.settings.enabled || !state.settings.showSpeedToast) return;
    const player = document.getElementById('movie_player');
    if (!player) return;

    let toast = player.querySelector('.cadence-player-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'cadence-player-toast';
      player.appendChild(toast);
    }
    toast.textContent = label;
    toast.classList.add('cadence-visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('cadence-visible');
    }, 1800);
  }

  function showStoppedBanner(hasPlaylist) {
    const player = document.getElementById('movie_player');
    if (!player) return;
    let banner = player.querySelector('.cadence-stopped-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'cadence-stopped-banner';
      banner.innerHTML = \`
        <span class="cadence-stopped-text"></span>
        <div class="cadence-stopped-actions">
          <button type="button" class="cadence-btn cadence-replay-btn">Replay</button>
          <button type="button" class="cadence-btn cadence-play-next-btn">Play Next</button>
          <button type="button" class="cadence-btn cadence-dismiss-btn">Dismiss</button>
        </div>
      \`;
      banner.querySelector('.cadence-replay-btn').addEventListener('click', () => {
        banner.classList.remove('cadence-visible');
        postToBridge('COMMAND', { action: 'REPLAY_VIDEO' });
      });
      banner.querySelector('.cadence-play-next-btn').addEventListener('click', () => {
        banner.classList.remove('cadence-visible');
        postToBridge('COMMAND', { action: 'PLAY_NEXT_MANUAL' });
      });
      banner.querySelector('.cadence-dismiss-btn').addEventListener('click', () => {
        banner.classList.remove('cadence-visible');
      });
      player.appendChild(banner);
    }

    const textEl = banner.querySelector('.cadence-stopped-text');
    textEl.textContent = hasPlaylist
      ? 'Cadence stopped playback · Playlist auto-advance prevented'
      : 'Cadence stopped playback · Autoplay prevented';
    banner.classList.add('cadence-visible');
  }

  async function saveChannelSpeed(meta, speed, presetId = 'custom') {
    if (!meta || !meta.channelName) return;
    const cleanSpeed = Math.round(Math.min(4.0, Math.max(0.25, Number(speed))) * 100) / 100;
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
    await chrome.storage.local.set({ rules: nextRules });
    renderInPageBar();
  }

  function renderInPageBar() {
    const existing = document.getElementById('cadence-owner-bar');
    if (!currentChannel) {
      currentChannel = extractDomChannelFallback();
    }
    if (!state.settings.enabled || !state.settings.showInPageControlBar || !currentChannel) {
      if (existing) existing.remove();
      return;
    }

    const ownerContainer =
      document.querySelector('ytd-watch-flexy ytd-watch-metadata #owner') ||
      document.querySelector('ytd-watch-metadata #owner') ||
      document.querySelector('#above-the-fold #owner');
    if (!ownerContainer) return;

    let bar = existing;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'cadence-owner-bar';
      bar.className = 'cadence-owner-bar';
      ownerContainer.appendChild(bar);
    }

    const matchedRule = findMatchingRule(currentChannel);
    const resolved = state.settings.perChannelSpeedEnabled
      ? resolveSpeedForRule(matchedRule)
      : 1.0;

    const quickSpeeds = [1.0, 1.25, 1.5, 1.75, 2.0];
    bar.innerHTML = \`
      <span class="cadence-bar-label" title="Cadence Per-Channel Speed">
        \${matchedRule ? 'Saved' : 'Default'} · <strong>\${formatDisplaySpeed(resolved)}×</strong>
      </span>
      <div class="cadence-bar-buttons">
        \${quickSpeeds
          .map(
            (spd) => \`
          <button type="button" data-speed="\${spd}" class="cadence-speed-chip \${Math.abs(resolved - spd) < 0.015 ? 'active' : ''}">
            \${formatDisplaySpeed(spd)}×
          </button>
        \`
          )
          .join('')}
      </div>
    \`;

    bar.querySelectorAll('.cadence-speed-chip').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const chosen = Number(btn.getAttribute('data-speed'));
        const matchingPreset = state.presets.find((p) => Math.abs(p.speed - chosen) < 0.01);
        await saveChannelSpeed(
          currentChannel,
          chosen,
          matchingPreset ? matchingPreset.id : 'custom'
        );
        pushConfigToBridge(chosen);
        showPlayerToast(\`Saved \${formatDisplaySpeed(chosen)}× for \${currentChannel.channelName}\`);
      });
    });
  }

  function applyForCurrentChannel(showToast = false) {
    if (!currentChannel) {
      currentChannel = extractDomChannelFallback();
    }
    if (!currentChannel) return;

    if (!state.settings.enabled || !state.settings.perChannelSpeedEnabled) {
      pushConfigToBridge(1.0);
      renderInPageBar();
      return;
    }

    const rule = findMatchingRule(currentChannel);
    const speed = resolveSpeedForRule(rule);
    pushConfigToBridge(speed);
    renderInPageBar();

    if (showToast && !currentChannel.isAd) {
      const presetObj =
        rule && rule.presetId !== 'custom'
          ? state.presets.find((p) => p.id === rule.presetId)
          : null;
      const suffix = presetObj ? \` · \${presetObj.label}\` : rule ? ' · Channel Rule' : ' · Default';
      showPlayerToast(\`\${formatDisplaySpeed(speed)}×\${suffix}\`);
    }
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'CADENCE_MAIN_BRIDGE') {
      return;
    }
    const { type, payload } = event.data;
    if (type === 'VIDEO_DETECTED' && payload) {
      const prevVideoId = currentChannel ? currentChannel.videoId : null;
      currentChannel = payload;
      const existingBanner = document.querySelector('.cadence-stopped-banner');
      if (existingBanner && prevVideoId !== currentChannel.videoId) {
        existingBanner.classList.remove('cadence-visible');
      }
      applyForCurrentChannel(prevVideoId !== currentChannel.videoId);
    } else if (type === 'MANUAL_RATE_CHANGE' && payload) {
      if (!state.settings.enabled || !state.settings.autoRememberManualSpeed) return;
      currentChannel = payload;
      const matchingPreset = state.presets.find((p) => Math.abs(p.speed - payload.speed) < 0.01);
      await saveChannelSpeed(payload, payload.speed, matchingPreset ? matchingPreset.id : 'custom');
      activeSpeed = payload.speed;
      chrome.runtime
        .sendMessage({
          type: 'CADENCE_UPDATE_BADGE',
          enabled: true,
          speed: payload.speed,
        })
        .catch(() => {});
      showPlayerToast(\`Remembered \${formatDisplaySpeed(payload.speed)}× for \${payload.channelName}\`);
    } else if (type === 'PLAYBACK_STOPPED') {
      showStoppedBanner(Boolean(payload && payload.hasPlaylist));
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'CADENCE_GET_ACTIVE_CHANNEL') {
      if (!currentChannel || !currentChannel.channelName) {
        currentChannel = extractDomChannelFallback();
      }
      const video = document.querySelector('video.html5-main-video');
      const liveVideoSpeed = video ? Math.round(video.playbackRate * 100) / 100 : activeSpeed;
      const rule = findMatchingRule(currentChannel);
      sendResponse({
        channel: currentChannel,
        activeSpeed: liveVideoSpeed || activeSpeed,
        matchedRule: rule,
      });
      return false;
    }
    if (msg && msg.type === 'CADENCE_SET_CHANNEL_SPEED') {
      const targetMeta = msg.channel || currentChannel || extractDomChannelFallback();
      if (targetMeta) {
        currentChannel = targetMeta;
        saveChannelSpeed(targetMeta, msg.speed, msg.presetId || 'custom').then(() => {
          pushConfigToBridge(msg.speed);
          postToBridge('COMMAND', { action: 'SET_SPEED', speed: msg.speed });
          showPlayerToast(\`Saved \${formatDisplaySpeed(msg.speed)}× for \${targetMeta.channelName}\`);
          sendResponse({ ok: true });
        });
        return true;
      }
      sendResponse({ ok: false });
      return false;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.settings) state.settings = changes.settings.newValue;
    if (changes.presets) state.presets = changes.presets.newValue;
    if (changes.rules) state.rules = changes.rules.newValue;
    applyForCurrentChannel(false);
  });

  chrome.storage.local.get(['settings', 'presets', 'rules']).then((stored) => {
    if (stored.settings) state.settings = stored.settings;
    if (stored.presets) state.presets = stored.presets;
    if (stored.rules) state.rules = stored.rules;
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
  align-items: center;
  gap: 8px;
  margin-left: 12px;
  padding: 4px 10px;
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
  white-space: nowrap;
  opacity: 0.9;
  font-variant-numeric: tabular-nums;
}

.cadence-bar-buttons {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cadence-speed-chip {
  border: none;
  background: transparent;
  color: inherit;
  padding: 3px 7px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  transition: background 140ms ease, color 140ms ease;
}

.cadence-speed-chip:hover {
  background: rgba(148, 163, 184, 0.22);
}

.cadence-speed-chip.active {
  background: #dc2626;
  color: #ffffff;
}

.cadence-player-toast {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 65;
  padding: 7px 12px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f8fafc;
  font-family: Roboto, Arial, sans-serif;
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 150ms ease, transform 150ms ease;
}

.cadence-player-toast.cadence-visible {
  opacity: 1;
  transform: translateY(0);
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
      .brand { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; color: #f8fafc; }
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
      <span class="brand">Cadence</span>
      <button id="open-options" class="link-btn">All Channel Rules</button>
    </div>

    <div class="section" id="active-channel-box">
      <div class="meta-row">
        <span class="kicker" id="channel-status">Active YouTube Tab</span>
        <span class="speed-readout" id="active-speed-readout"></span>
      </div>
      <div class="channel-title" id="channel-name">Open a YouTube video or live stream</div>
      <div class="channel-handle" id="channel-handle"></div>

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
          <span class="stepper-label">Fine Speed Stepper</span>
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
          <div class="row-sub">Save speed when adjusted in YouTube player</div>
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
          <div class="row-sub">Quick speed buttons beside Subscribe</div>
        </div>
        <input type="checkbox" id="toggle-bar" />
      </div>
    </div>

    <div class="section footer-row">
      <span class="rule-count" id="saved-summary">0 channels configured</span>
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

  const stored = await chrome.storage.local.get(['settings', 'rules', 'presets']);
  const settings = stored.settings || {
    enabled: true,
    perChannelSpeedEnabled: true,
    autoRememberManualSpeed: true,
    stopAfterVideoEnds: true,
    showInPageControlBar: true,
    showSpeedToast: true,
    defaultSpeed: 1.0,
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
  const controlsWrapEl = document.getElementById('controls-wrap');
  const presetGridEl = document.getElementById('preset-buttons');
  const speedGridEl = document.getElementById('speed-buttons');
  const stepperValEl = document.getElementById('stepper-value');
  const stepDownBtn = document.getElementById('step-down');
  const stepUpBtn = document.getElementById('step-up');

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

  // Fallback MAIN-world reader if tab was opened prior to extension install/reload
  async function probeTabDirectlyWithScripting(tabId) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] }).catch(() => {});
      await chrome.scripting.executeScript({ target: { tabId }, files: ['page-bridge.js'], world: 'MAIN' }).catch(() => {});
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          const player = document.getElementById('movie_player');
          const video = document.querySelector('video.html5-main-video');
          let videoId = new URLSearchParams(location.search).get('v') || '';
          if (!videoId && location.pathname.startsWith('/live/')) {
            const seg = location.pathname.split('/live/')[1];
            if (seg) videoId = seg.split(/[/?#]/)[0];
          }
          let channelId = '';
          let channelName = '';
          let handle = '';

          try {
            if (player && typeof player.getPlayerResponse === 'function') {
              const resp = player.getPlayerResponse();
              if (resp && resp.videoDetails) {
                videoId = resp.videoDetails.videoId || videoId;
                channelId = resp.videoDetails.channelId || '';
                channelName = resp.videoDetails.author || '';
              }
            }
            if (!channelName && player && typeof player.getVideoData === 'function') {
              const vd = player.getVideoData();
              if (vd) {
                videoId = vd.video_id || videoId;
                channelName = vd.author || '';
              }
            }
          } catch (_) {}

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
            if (txt) channelName = txt;
          }

          if (!channelName && !handle && !channelId) return null;
          return {
            channel: {
              videoId: videoId || 'active',
              channelId,
              channelName: channelName || handle,
              handle,
            },
            activeSpeed: video ? Math.round(video.playbackRate * 100) / 100 : 1.0,
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
      /^https?:\\/\\/([a-z0-9-]+\\.)?youtube\\.com\\/(watch|live)/i.test(tab.url)
  );

  if (!isYouTubeVideoUrl) {
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
  let currentRule = findRuleForChannel(activeChannel);
  let currentSpeed = Number(detected.activeSpeed) || 1.0;

  // If a rule already exists and tab had not yet applied it, resolve and apply immediately
  if (currentRule && settings.enabled && settings.perChannelSpeedEnabled) {
    const resolvedRuleSpeed =
      currentRule.presetId === 'custom'
        ? Number(currentRule.customSpeed)
        : Number((presets.find((p) => p.id === currentRule.presetId) || {}).speed || currentRule.customSpeed);
    if (resolvedRuleSpeed && Math.abs(currentSpeed - resolvedRuleSpeed) > 0.02) {
      currentSpeed = resolvedRuleSpeed;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        args: [currentSpeed],
        func: (spd) => {
          const p = document.getElementById('movie_player');
          const v = document.querySelector('video.html5-main-video');
          try {
            if (p && typeof p.setPlaybackRate === 'function' && spd <= 2.0 && Math.abs(Math.round(spd * 20) - spd * 20) < 0.001) {
              p.setPlaybackRate(spd);
            }
          } catch (_) {}
          if (v) v.playbackRate = spd;
        },
      }).catch(() => {});
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
    statusEl.textContent = currentRule ? 'Saved Channel Rule' : 'Detected Channel · Default';
    readoutEl.textContent = \`\${formatSpeed(currentSpeed)}×\`;
    stepperValEl.textContent = \`\${formatSpeed(currentSpeed)}×\`;

    presetGridEl.querySelectorAll('.preset-btn').forEach((btn) => {
      const pid = btn.getAttribute('data-preset-id');
      const pspd = Number(btn.getAttribute('data-speed'));
      const isSelected =
        currentRule &&
        currentRule.presetId === pid &&
        Math.abs(currentSpeed - pspd) < 0.02;
      btn.classList.toggle('active', Boolean(isSelected));
    });

    speedGridEl.querySelectorAll('.spd-btn').forEach((btn) => {
      const val = Number(btn.getAttribute('data-speed'));
      btn.classList.toggle('active', Math.abs(val - currentSpeed) < 0.015);
    });
  }

  async function assignSpeedFromPopup(newSpeed, presetId) {
    const clean = Math.round(Math.min(4.0, Math.max(0.25, Number(newSpeed) || 1.0)) * 100) / 100;
    currentSpeed = clean;

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
          const p = document.getElementById('movie_player');
          const v = document.querySelector('video.html5-main-video');
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
          if (v) v.playbackRate = spd;
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
      h1 { font-size: 24px; font-weight: 700; margin-bottom: 6px; color: #f8fafc; letter-spacing: -0.01em; }
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
          <h1>Cadence for YouTube</h1>
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
      rulesCountEl.textContent = \`\${rules.length} saved\`;
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
      description:
        'Manifest V3 (v1.1.0) declaring scripting, activeTab, storage, and tabs permissions plus MAIN-world and ISOLATED content scripts.',
      content: manifestJson,
    },
    {
      path: 'page-bridge.js',
      language: 'javascript',
      description:
        'Runs in YouTube MAIN world using structured window.postMessage envelopes to read #movie_player metadata across /watch and /live pages and stop playlist auto-advance.',
      content: pageBridgeJs,
    },
    {
      path: 'content.js',
      language: 'javascript',
      description:
        'Isolated content script with direct DOM channel fallback, structured postMessage sync, watch-page speed bar, and live popup messaging.',
      content: contentJs,
    },
    {
      path: 'content.css',
      language: 'css',
      description:
        'Clean light/dark adaptive styles for the YouTube below-video speed bar and end-of-video stop banner.',
      content: contentCss,
    },
    {
      path: 'background.js',
      language: 'javascript',
      description:
        'Service worker that non-destructively merges starter sample rules and proactively attaches Cadence to already-open YouTube tabs without refreshing.',
      content: backgroundJs,
    },
    {
      path: 'popup.html',
      language: 'html',
      description:
        'Native dark-mode toolbar popup featuring Category Presets, Quick Speeds (1.0×–2.0×), and a Fine ±0.05× Stepper.',
      content: popupHtml,
    },
    {
      path: 'popup.js',
      language: 'javascript',
      description:
        'Popup controller with instant chrome.scripting live tab probe fallback so active YouTube tabs are always detected on the first click.',
      content: popupJs,
    },
    {
      path: 'options.html',
      language: 'html',
      description:
        'Full-tab dark-mode Chrome extension options page with JSON Import, JSON Backup, and Reset Samples controls.',
      content: optionsHtml,
    },
    {
      path: 'options.js',
      language: 'javascript',
      description:
        'Options page controller supporting category profile editing, per-channel rules, JSON import/export, and sample reset.',
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
