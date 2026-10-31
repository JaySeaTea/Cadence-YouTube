(() => {
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
    settings: {"enabled":true,"perChannelSpeedEnabled":true,"autoRememberManualSpeed":false,"defaultSpeed":1,"stopAfterVideoEnds":true,"showInPageControlBar":true,"showSpeedToast":true,"convertShortsToWatch":true,"settingsSchemaVersion":3},
    presets: [{"id":"music","label":"Music & Performance","description":"Preserves natural pitch, rhythm, and studio mix timing.","speed":1},{"id":"educational","label":"Educational & Explainer","description":"Brisk comprehension pace for tutorials, science, and essays.","speed":1.5},{"id":"podcast","label":"Podcast & Lecture","description":"High-efficiency cadence for long-form conversations and seminars.","speed":2}],
    rules: [{"id":"rule-velvet-room","channelName":"Velvet Room Sessions","handle":"@velvetroomsessions","channelId":"UC8velvetRoomMusic01","presetId":"music","customSpeed":1,"updatedAt":"2026-10-23"},{"id":"rule-orbital-lab","channelName":"Orbital Mechanics Lab","handle":"@orbitalmechanics","channelId":"UC4orbitalLabEdu02","presetId":"educational","customSpeed":1.5,"updatedAt":"2026-10-23"},{"id":"rule-longform-archive","channelName":"The Longform Archive","handle":"@longformarchive","channelId":"UC9longformPod03","presetId":"podcast","customSpeed":2,"updatedAt":"2026-10-23"},{"id":"rule-systems-craft","channelName":"Systems Craft","handle":"@systemscraft","channelId":"UC2systemsCraft04","presetId":"educational","customSpeed":1.5,"updatedAt":"2026-10-23"}],
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
  let toastTimeout = null;
  let barToastTimeout = null;
  let barToastVisible = false;
  let barToastReason = null;
  let barMountRetryTimer = null;
  let barMountAttempts = 0;
  let barResizeObserver = null;

  const WARNING_ICON_SVG =
    '<svg class="cadence-toast-warn-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
    '<path d="M8 2.25L14.25 13.25H1.75L8 2.25Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M8 6.5V9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>' +
    '</svg>';

  const CADENCE_EMBLEM_SVG =
    '<svg class="cadence-brand-emblem" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
    '<rect x="0.75" y="0.75" width="18.5" height="18.5" rx="4.5" fill="#0F172A" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>' +
    '<path d="M5.2 5.1L12.5 10L5.2 14.9V5.1Z" fill="#EF4444"/>' +
    '<rect x="13.7" y="5.1" width="2" height="9.8" rx="0.8" fill="#F8FAFC"/>' +
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
    return Number(speed).toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
  }

  function formatCompactSpeed(speed) {
    return String(Math.round((Number(speed) || 1.0) * 100) / 100);
  }

  function buildDurationSizerText(text) {
    if (!text) return '';
    return String(text)
      .replace(/@\s*[\d.]+×$/, '@ 8.88×')
      .replace(/\b\d([sm])\b/g, '88$1')
      .replace(/\d/g, '8');
  }

  function clampSpeed(val) {
    return Math.round(Math.min(4.0, Math.max(0.25, Number(val) || 1.0)) * 100) / 100;
  }

  function formatCompactDuration(rawSec) {
    const safeSec = Math.max(0, Math.round(Number(rawSec) || 0));
    if (safeSec < 60) {
      return `${safeSec}s`;
    }
    const totalMins = Math.max(1, Math.round(safeSec / 60));
    if (totalMins < 60) {
      return `${totalMins}m`;
    }
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  function formatExactMinutesSeconds(rawSec) {
    const safeSec = Math.max(0, Math.round(Number(rawSec) || 0));
    if (safeSec < 60) {
      return `${safeSec}s`;
    }
    const mins = Math.floor(safeSec / 60);
    const secs = safeSec % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
    }
    return secs > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${mins}m`;
  }

  function formatRemainingReadout(rawRemainingSec, speed) {
    if (typeof rawRemainingSec !== 'number' || !Number.isFinite(rawRemainingSec) || rawRemainingSec < 0) {
      return '';
    }
    const safeRate = Math.max(0.25, Number(speed) || 1.0);
    const totalSec = Math.max(0, Math.round(rawRemainingSec / safeRate));
    return `${formatCompactDuration(totalSec)} left @ ${formatDisplaySpeed(safeRate)}×`;
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
    const m = location.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/);
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
      const handleMatch = href.match(/\/(@[^/?#]+)/);
      if (handleMatch) handle = handleMatch[1].toLowerCase();
      const chMatch = href.match(/\/channel\/(UC[^/?#]+)/);
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
    const curTimeEl = liveTime.querySelector('.ytp-time-current');
    if (curTimeEl) {
      const rawTxt = (curTimeEl.textContent || '').trim();
      if (/^[-−]\s*\d+:\d{2}/.test(rawTxt)) {
        return false;
      }
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

  function isAnyLiveStreamActive() {
    if (remainingState.isLive) return true;
    const player = getWatchPlayerElement();
    if (!player) return false;
    const liveTime = player.querySelector(
      '.ytp-chrome-bottom .ytp-time-display.ytp-live, .ytp-time-display.ytp-live'
    );
    const badge = player.querySelector('.ytp-chrome-bottom .ytp-live-badge, .ytp-live-badge');
    return Boolean(liveTime && badge instanceof HTMLElement && !badge.hasAttribute('hidden'));
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
          ? `Paused ${lagLabel} behind live · Resuming at ${formatDisplaySpeed(liveRate)}× catches up in ${catchUpLabel}`
          : `${lagLabel} behind live · Catching up at ${formatDisplaySpeed(liveRate)}×`;
        return {
          visible: true,
          mode: 'live-catchup',
          text: `−${lagLabel} · Live in ${catchUpLabel} @ ${formatDisplaySpeed(liveRate)}×`,
          title: `${titlePrefix} · Click to jump to live edge`,
          clickable: true,
        };
      }

      return {
        visible: true,
        mode: 'live-behind',
        text: `${lagLabel} behind Live`,
        title: `${remainingState.isPaused ? 'Paused · ' : ''}Increase speed above 1× to catch up, or click to jump to live edge`,
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

    let durationSec =
      typeof remainingState.rawDurationSec === 'number' &&
      Number.isFinite(remainingState.rawDurationSec) &&
      remainingState.rawDurationSec > 0
        ? remainingState.rawDurationSec
        : null;

    if (durationSec === null) {
      const video =
        document.querySelector('ytd-watch-flexy video.html5-main-video') ||
        document.querySelector('#movie_player video.html5-main-video') ||
        document.querySelector('video.html5-main-video');
      if (video && Number.isFinite(video.duration) && video.duration > 0) {
        durationSec = video.duration;
      }
    }

    if (durationSec === null || durationSec < 5) {
      return { visible: false, tone: 'neutral', text: '', title: '' };
    }

    const effectiveSpeed = Math.max(0.25, getEffectiveSpeedForChannel(currentChannel) || 1.0);
    const realTotalSec = Math.round(durationSec / effectiveSpeed);
    const deltaSec = Math.round(durationSec - realTotalSec);

    if (Math.abs(deltaSec) < 3) {
      return {
        visible: true,
        tone: 'neutral',
        text: '0s saved',
        title: 'Playing at standard 1.0× speed',
      };
    }

    if (deltaSec > 0) {
      return {
        visible: true,
        tone: 'saved',
        text: `Saves ${formatExactMinutesSeconds(deltaSec)}`,
        title: `Total wall-clock time saved on this video at ${formatDisplaySpeed(effectiveSpeed)}×`,
      };
    }

    return {
      visible: true,
      tone: 'slower',
      text: `+${formatExactMinutesSeconds(Math.abs(deltaSec))}`,
      title: `Adds ${formatExactMinutesSeconds(Math.abs(deltaSec))} to total video duration at ${formatDisplaySpeed(effectiveSpeed)}×`,
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

  function ensureBarResizeObserver(bar) {
    disconnectBarResizeObserver();
    if (!bar || typeof ResizeObserver === 'undefined') return;
    barResizeObserver = new ResizeObserver(() => {
      syncRow1BrandCollapse(bar);
    });
    barResizeObserver.observe(bar);
    const rowTop = bar.querySelector('.cadence-row-top');
    const leftEl = bar.querySelector('.cadence-row-top-left');
    if (rowTop) barResizeObserver.observe(rowTop);
    if (leftEl) barResizeObserver.observe(leftEl);
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
  }

  function computeBarUiModeSignature() {
    if (!currentChannel) return 'none';
    const adActive = isCurrentAdActive();
    const liveAtHead = !adActive && isLiveAtHeadForChannel(currentChannel);
    const dvrUnsupported =
      !adActive && Boolean(remainingState.isLive && remainingState.isDvrSupported === false);
    const isSessionActive = hasActiveSessionOverride(currentChannel.videoId);
    const matchedRule = findMatchingRule(currentChannel);
    const effectiveSpeed = getEffectiveSpeedForChannel(currentChannel);
    const displayedBarRate = adActive ? 1.0 : effectiveSpeed;
    return [
      adActive ? 'ad' : liveAtHead ? 'live-head' : remainingState.isLive ? 'live-dvr' : 'vod',
      dvrUnsupported ? 'nodvr' : 'dvr',
      formatCompactSpeed(displayedBarRate),
      isSessionActive ? 'session' : matchedRule ? 'rule' : 'default',
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

    toastEl.style.left = `${clampedLeft}px`;
    toastEl.style.top = `${targetTop}px`;
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

    toastEl.innerHTML = `${WARNING_ICON_SVG}<span class="cadence-bar-toast-text"></span>`;
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
      toast.innerHTML = `${WARNING_ICON_SVG}<span></span>`;
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
      banner.innerHTML = `
        <span class="cadence-stopped-text"></span>
        <div class="cadence-stopped-actions">
          <button type="button" class="cadence-btn cadence-replay-btn">Replay</button>
          <button type="button" class="cadence-btn cadence-play-next-btn">Play Next</button>
          <button type="button" class="cadence-btn cadence-dismiss-btn">Dismiss</button>
        </div>
      `;
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
      handle: meta.handle || '@' + meta.channelName.toLowerCase().replace(/\s+/g, ''),
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
        `Cleared Rule · Default ${formatDisplaySpeed(fallbackSpeed)}×`
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
    showPlayerToast(delta < 0 ? `Replay ${Math.abs(delta)}s` : `Skip +${delta}s`);
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
          ? `Restored ${formatDisplaySpeed(effectiveBaseline)}× (${baselineLabel})`
          : `${formatDisplaySpeed(effectiveBaseline)}× · ${baselineLabel}`
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
      ? `Rule ${formatDisplaySpeed(baselineSpeed)}× unchanged`
      : 'This video only';
    showPlayerToast(`Session ${formatDisplaySpeed(cleanSpeed)}× · ${suffix}`);
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
      `Reset to ${formatDisplaySpeed(effectiveResetSpeed)}× (${matchedRule ? 'Channel Rule' : 'Default'})`
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

    let bar = existing;
    if (!bar || bar.parentElement !== mountPoint.container) {
      if (bar) bar.remove();
      bar = document.createElement('div');
      bar.id = 'cadence-watch-bar';
      bar.className = 'cadence-watch-bar';
      bar.setAttribute('data-cadence-instance', INSTANCE_TOKEN);
      if (mountPoint.beforeNode && mountPoint.beforeNode.parentElement === mountPoint.container) {
        mountPoint.container.insertBefore(bar, mountPoint.beforeNode);
      } else {
        mountPoint.container.prepend(bar);
      }
    } else if (
      mountPoint.beforeNode &&
      mountPoint.beforeNode.parentElement === mountPoint.container &&
      bar.nextElementSibling !== mountPoint.beforeNode &&
      bar !== mountPoint.beforeNode
    ) {
      mountPoint.container.insertBefore(bar, mountPoint.beforeNode);
    }

    clearSessionOverrideIfMatchesBaseline(currentChannel);
    const adActive = isCurrentAdActive();
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
      : isSessionActive
        ? 'Session Override'
        : matchedRule
          ? 'Channel Rule'
          : 'Default';
    const displayedBarRate = adActive ? 1.0 : effectiveSpeed;
    const tooltip = adActive
      ? isSessionActive
        ? `Ad playing at 1× · Session ${formatDisplaySpeed(sessionOverride.speed)}× restores automatically after ad`
        : 'Ad playing at 1× · Controls paused until ad ends'
      : isSessionActive
        ? `Session override for this video only · Baseline is ${formatDisplaySpeed(baselineSpeed)}×`
        : isLiveRuleClamped
          ? `Live stream at live end · Saved ${formatDisplaySpeed(baselineSpeed)}× rule is clamped to 1.0× at live edge`
          : 'Session-only transport deck · Use Row 3 right to save or update channel rules';

    const durationModel = computeDurationSlotModel();
    const savedTimeModel = computeSavedTimeModel();

    let ruleSlotHtml = '';
    if (!matchedRule) {
      const saveTargetRate = adActive ? baselineSpeed : effectiveSpeed;
      ruleSlotHtml = `
        <span class="cadence-rule-status">No rule</span>
        <button type="button" data-rule-action="save" class="cadence-rule-action-btn${adActive ? ' is-ad-blocked' : ''}"${adActive ? ' aria-disabled="true"' : ''} title="${adActive ? adBlockedTooltip : `Save ${formatDisplaySpeed(saveTargetRate)}× as a Rule for ${currentChannel.channelName || 'this channel'}`}">
          <span class="cadence-rule-plus" aria-hidden="true">+</span>
          <span>Save ${formatDisplaySpeed(saveTargetRate)}× Rule</span>
        </button>
      `;
    } else if (isSessionActive && !adActive) {
      ruleSlotHtml = `
        <span class="cadence-rule-status">Rule: ${formatDisplaySpeed(ruleResolvedSpeed)}×</span>
        <button type="button" data-rule-action="update" class="cadence-rule-action-btn is-update" title="${`Update ${currentChannel.channelName || 'channel'} Rule from ${formatDisplaySpeed(ruleResolvedSpeed)}× to ${formatDisplaySpeed(effectiveSpeed)}×`}">
          <span>Update → ${formatDisplaySpeed(effectiveSpeed)}×</span>
        </button>
      `;
    } else {
      ruleSlotHtml = `
        <span class="cadence-rule-status">Rule: ${formatDisplaySpeed(ruleResolvedSpeed)}×</span>
        <button type="button" data-rule-action="clear" class="cadence-rule-action-btn${adActive ? ' is-ad-blocked' : ''}"${adActive ? ' aria-disabled="true"' : ''} title="${adActive ? adBlockedTooltip : 'Clear saved Rule and revert to Default speed'}">
          <span>Clear</span>
          <span class="cadence-rule-clear-x" aria-hidden="true">×</span>
        </button>
      `;
    }

    const quickSpeeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    const replaySteps = [-60, -30, -10];
    const skipSteps = [10, 30, 60];
    const seekBackwardBlocked = adActive || dvrUnsupported;
    const seekForwardBlocked = adActive || liveAtHead || dvrUnsupported;

    bar.setAttribute('data-bar-ui-mode', computeBarUiModeSignature());

    bar.innerHTML = `
      <span class="cadence-brand-sizer" aria-hidden="true">
        ${CADENCE_EMBLEM_SVG}
        <span class="cadence-brand-name">Cadence</span>
        <span class="cadence-brand-tagline">- YouTube at your speed</span>
      </span>

      <div class="cadence-row-top">
        <div class="cadence-row-top-left">
          <span class="cadence-source-readout ${adActive || isSessionActive ? 'is-highlighted' : ''}" title="${tooltip}">
            <span>${modePrefix} ·</span>
            <span class="cadence-rate-grid">
              <span class="cadence-rate-sizer" aria-hidden="true">8.88×</span>
              <strong class="cadence-rate-value">${formatCompactSpeed(displayedBarRate)}×</strong>
            </span>
          </span>
          ${
            adActive
              ? `
          <span class="cadence-bar-divider" aria-hidden="true"></span>
          <span class="cadence-ad-paused-note">Controls paused until ad ends</span>
          `
              : `
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
          `
          }
        </div>

        <button type="button" class="cadence-brand-btn" title="Cadence - YouTube at your speed (Click to open All Channel Rules)">
          ${CADENCE_EMBLEM_SVG}
          <span class="cadence-brand-name">Cadence</span>
          <span class="cadence-brand-tagline">- YouTube at your speed</span>
        </button>
      </div>

      <div class="cadence-row-mid">
        <div class="cadence-bar-buttons">
          ${quickSpeeds
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
                  : `Set ${formatDisplaySpeed(spd)}× for this video session only`;
              return `
            <button type="button" data-speed="${spd}" class="${chipClasses}"${isDisabledVisual ? ' aria-disabled="true"' : ''} title="${chipTitle}">
              ${formatDisplaySpeed(spd)}×
            </button>
          `;
            })
            .join('')}
        </div>

        <div class="cadence-seek-group">
          <div class="cadence-seek-capsule${adActive ? ' is-ad-blocked' : dvrUnsupported ? ' is-live-blocked' : ''}">
            <span class="cadence-seek-icon-cell" title="Replay seconds" aria-hidden="true">${REPLAY_ICON_SVG}</span>
            ${replaySteps
              .map(
                (sec) => `
              <button type="button" data-seek="${sec}" class="cadence-seek-btn"${seekBackwardBlocked ? ' aria-disabled="true"' : ''} title="${adActive ? adSkipBlockedTooltip : dvrUnsupported ? dvrUnsupportedTooltip : `Replay ${Math.abs(sec)} seconds`}">${Math.abs(sec)}</button>
            `
              )
              .join('')}
          </div>
          <div class="cadence-seek-capsule${adActive ? ' is-ad-blocked' : liveAtHead || dvrUnsupported ? ' is-live-blocked' : ''}">
            ${skipSteps
              .map(
                (sec) => `
              <button type="button" data-seek="${sec}" class="cadence-seek-btn"${seekForwardBlocked ? ' aria-disabled="true"' : ''} title="${adActive ? adSkipBlockedTooltip : dvrUnsupported ? dvrUnsupportedTooltip : liveAtHead ? 'Stream is currently at live end' : `Skip ahead ${sec} seconds`}">${sec}</button>
            `
              )
              .join('')}
            <span class="cadence-seek-icon-cell" title="Skip ahead seconds" aria-hidden="true">${SKIP_ICON_SVG}</span>
          </div>
        </div>
      </div>

      <div class="cadence-row-bot">
        <div class="cadence-fine-group">
          <button type="button" data-step="-0.05" class="cadence-step-chip${adActive ? ' is-ad-blocked' : ''}"${adActive ? ' aria-disabled="true"' : ''} title="${adActive ? adBlockedTooltip : 'Decrease playback speed by 0.05× for this video session'}">−0.05</button>
          <button type="button" data-step="0.05" class="cadence-step-chip${adActive ? ' is-ad-blocked' : isStepUpLiveBlocked ? ' is-live-blocked' : ''}"${adActive || isStepUpLiveBlocked ? ' aria-disabled="true"' : ''} title="${adActive ? adBlockedTooltip : isStepUpLiveBlocked ? liveBlockedTooltip : 'Increase playback speed by 0.05× for this video session'}">+0.05</button>
          <button type="button" data-action="reset" class="cadence-reset-chip ${!adActive && isSessionActive ? 'is-active' : ''}${adActive ? ' is-ad-blocked' : ''}" ${!adActive && !isSessionActive ? 'disabled' : ''}${adActive ? ' aria-disabled="true"' : ''} title="${adActive ? adBlockedTooltip : `Reset session override to ${matchedRule ? 'Rule' : 'Default'} (${formatDisplaySpeed(liveAtHead && baselineSpeed > 1.01 ? 1.0 : baselineSpeed)}×)`}">Reset</button>
          <span class="cadence-saved-time" style="display:none;"></span>
        </div>

        <div class="cadence-rule-slot">
          ${ruleSlotHtml}
        </div>
      </div>
    `;

    if (!adActive) {
      applyDurationModelToBar(bar, durationModel);
    }
    applySavedTimeModelToBar(bar, savedTimeModel);
    ensureBarResizeObserver(bar);
    syncRow1BrandCollapse(bar);

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
                  ? `Updated Rule → ${formatDisplaySpeed(targetRate)}×`
                  : `Saved ${formatDisplaySpeed(targetRate)}× Rule`
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
          ? `Rule ${formatDisplaySpeed(getBaselineSpeedForChannel(currentChannel))}× unchanged`
          : 'This video only';
        showPlayerToast(`Session ${formatDisplaySpeed(speed)}× · ${suffix}`);
      } else {
        const presetObj =
          rule && rule.presetId !== 'custom'
            ? state.presets.find((p) => p.id === rule.presetId)
            : null;
        const suffix = presetObj ? ` · ${presetObj.label}` : rule ? ' · Channel Rule' : ' · Default';
        showPlayerToast(`${formatDisplaySpeed(speed)}×${suffix}`);
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
                showPlayerToast(`Restored Session ${formatDisplaySpeed(restoredSpeed)}×`);
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
          remainingState = {
            videoId: payload.videoId || null,
            rawRemainingSec:
              typeof payload.rawRemainingSec === 'number' ? payload.rawRemainingSec : null,
            rawDurationSec:
              typeof payload.rawDurationSec === 'number' ? payload.rawDurationSec : null,
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
                rawDurationSec: null,
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
              `Remembered ${formatDisplaySpeed(cleanManualSpeed)}× for ${currentChannel.channelName}`
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
                  ? `Restored ${formatDisplaySpeed(effectiveBaseline)}× (${baselineLabel})`
                  : `${formatDisplaySpeed(effectiveBaseline)}× · ${baselineLabel}`
              );
            } else {
              sessionOverride = {
                videoId: activeVid,
                speed: cleanManualSpeed,
              };
              pushConfigToBridge(sessionOverride.speed, true);
              renderInPageBar();
              const suffix = matchedRule
                ? `Rule ${formatDisplaySpeed(baselineSpeed)}× unchanged`
                : 'This video only';
              showPlayerToast(
                `Session ${formatDisplaySpeed(sessionOverride.speed)}× · ${suffix}`
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
              showPlayerToast(`Saved ${formatDisplaySpeed(requestedSpeed)}× for ${targetMeta.channelName}`);
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

      if (maybeRedirectShortsInContent()) return;

      postToBridge('CONFIG_UPDATE', {
        enabled: state.settings.enabled,
        perChannelSpeedEnabled: state.settings.perChannelSpeedEnabled,
        convertShortsToWatch: state.settings.convertShortsToWatch !== false,
        hasSessionOverride: Boolean(
          currentChannel && hasActiveSessionOverride(currentChannel.videoId)
        ),
        stopAfterVideoEnds: state.settings.stopAfterVideoEnds,
        defaultSpeed: Number(state.settings.defaultSpeed) || 1.0,
        targetSpeed: activeSpeed,
      });
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

    if (maybeRedirectShortsInContent()) return;

    postToBridge('CONFIG_UPDATE', {
      enabled: state.settings.enabled,
      perChannelSpeedEnabled: state.settings.perChannelSpeedEnabled,
      convertShortsToWatch: state.settings.convertShortsToWatch !== false,
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
