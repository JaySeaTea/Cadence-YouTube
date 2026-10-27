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
    settings: {"enabled":true,"perChannelSpeedEnabled":true,"autoRememberManualSpeed":false,"defaultSpeed":1,"stopAfterVideoEnds":true,"showInPageControlBar":true,"showSpeedToast":true,"settingsSchemaVersion":2},
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
    hidden: true,
  };
  let lastToastedVideoId = null;
  let toastTimeout = null;
  let barMountRetryTimer = null;
  let barMountAttempts = 0;

  function clearBarMountRetry() {
    if (barMountRetryTimer) {
      clearTimeout(barMountRetryTimer);
      barMountRetryTimer = null;
    }
    barMountAttempts = 0;
  }

  function teardownInstance() {
    if (isDestroyed) return;
    isDestroyed = true;
    clearTimeout(toastTimeout);
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
    return Number(speed).toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
  }

  function clampSpeed(val) {
    return Math.round(Math.min(4.0, Math.max(0.25, Number(val) || 1.0)) * 100) / 100;
  }

  function formatRemainingReadout(rawRemainingSec, speed) {
    if (typeof rawRemainingSec !== 'number' || !Number.isFinite(rawRemainingSec) || rawRemainingSec < 0) {
      return '';
    }
    const safeRate = Math.max(0.25, Number(speed) || 1.0);
    const totalSec = Math.max(0, Math.round(rawRemainingSec / safeRate));

    let durationPart = '';
    if (totalSec < 60) {
      durationPart = `${totalSec}s left`;
    } else {
      const totalMins = Math.max(1, Math.round(totalSec / 60));
      if (totalMins < 60) {
        durationPart = `${totalMins}m left`;
      } else {
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        durationPart = mins > 0 ? `${hrs}h ${mins}m left` : `${hrs}h left`;
      }
    }
    return `${durationPart} @ ${formatDisplaySpeed(safeRate)}×`;
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

  function clearSessionOverrideIfMatchesBaseline(meta) {
    if (!meta || !hasActiveSessionOverride(meta.videoId)) return false;
    const baseline = getBaselineSpeedForChannel(meta);
    if (Math.abs(sessionOverride.speed - baseline) < 0.015) {
      sessionOverride = { videoId: null, speed: null };
      return true;
    }
    return false;
  }

  function getEffectiveSpeedForChannel(meta) {
    if (!state.settings.enabled) return 1.0;
    clearSessionOverrideIfMatchesBaseline(meta);
    if (meta && hasActiveSessionOverride(meta.videoId)) {
      return sessionOverride.speed;
    }
    return getBaselineSpeedForChannel(meta);
  }

  function computeCurrentRemainingText() {
    if (
      !currentChannel ||
      currentChannel.isAd ||
      remainingState.hidden ||
      typeof remainingState.rawRemainingSec !== 'number'
    ) {
      return '';
    }
    if (
      remainingState.videoId &&
      currentChannel.videoId &&
      remainingState.videoId !== currentChannel.videoId
    ) {
      return '';
    }
    const effectiveSpeed = getEffectiveSpeedForChannel(currentChannel);
    return formatRemainingReadout(remainingState.rawRemainingSec, effectiveSpeed);
  }

  function updateRemainingReadoutInPlace() {
    const bar = document.getElementById('cadence-owner-bar');
    if (!bar) return;
    const wrapEl = bar.querySelector('.cadence-remaining-wrap');
    const timeEl = bar.querySelector('.cadence-remaining-time');
    if (!wrapEl || !timeEl) return;
    const text = computeCurrentRemainingText();
    timeEl.textContent = text;
    wrapEl.style.display = text ? 'inline-flex' : 'none';
  }

  function pushConfigToBridge(targetSpeed, showOnBadge = true) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    activeSpeed = clampSpeed(targetSpeed);
    postToBridge('CONFIG_UPDATE', {
      enabled: state.settings.enabled,
      perChannelSpeedEnabled: state.settings.perChannelSpeedEnabled,
      stopAfterVideoEnds: state.settings.stopAfterVideoEnds,
      defaultSpeed: Number(state.settings.defaultSpeed) || 1.0,
      targetSpeed: activeSpeed,
    });
    safeSendMessage({
      type: 'CADENCE_UPDATE_BADGE',
      enabled:
        showOnBadge &&
        isWatchLocation() &&
        Boolean(state.settings.enabled && state.settings.perChannelSpeedEnabled),
      speed: showOnBadge && isWatchLocation() ? activeSpeed : null,
    });
  }

  function showPlayerToast(label) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
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
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    const player = document.getElementById('movie_player');
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
    if (!currentChannel) {
      currentChannel = extractDomChannelFallback();
    }
    if (!currentChannel || !currentChannel.videoId) return;

    const cleanSpeed = clampSpeed(nextSpeed);
    const matchedRule = findMatchingRule(currentChannel);
    const baselineSpeed = getBaselineSpeedForChannel(currentChannel);
    const wasOverridden = hasActiveSessionOverride(currentChannel.videoId);

    if (Math.abs(cleanSpeed - baselineSpeed) < 0.015) {
      sessionOverride = {
        videoId: null,
        speed: null,
      };
      pushConfigToBridge(baselineSpeed, true);
      postToBridge('COMMAND', { action: 'SET_SPEED', speed: baselineSpeed });
      renderInPageBar();
      const baselineLabel = matchedRule ? 'Channel Rule' : 'Default';
      showPlayerToast(
        wasOverridden
          ? `Restored ${formatDisplaySpeed(baselineSpeed)}× (${baselineLabel})`
          : `${formatDisplaySpeed(baselineSpeed)}× · ${baselineLabel}`
      );
      return;
    }

    sessionOverride = {
      videoId: currentChannel.videoId,
      speed: cleanSpeed,
    };

    pushConfigToBridge(cleanSpeed, true);
    postToBridge('COMMAND', { action: 'SET_SPEED', speed: cleanSpeed });
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
    if (!currentChannel) {
      currentChannel = extractDomChannelFallback();
    }
    if (!currentChannel) return;

    const matchedRule = findMatchingRule(currentChannel);
    const baselineSpeed = getBaselineSpeedForChannel(currentChannel);
    sessionOverride = {
      videoId: null,
      speed: null,
    };

    pushConfigToBridge(baselineSpeed, true);
    postToBridge('COMMAND', { action: 'SET_SPEED', speed: baselineSpeed });
    renderInPageBar();
    showPlayerToast(
      `Reset to ${formatDisplaySpeed(baselineSpeed)}× (${matchedRule ? 'Channel Rule' : 'Default'})`
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
      if (existing) existing.remove();
      return;
    }

    if (!currentChannel) {
      currentChannel = extractDomChannelFallback();
    }
    if (!state.settings.enabled || !state.settings.showInPageControlBar || !currentChannel) {
      clearBarMountRetry();
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
    const matchedRule = findMatchingRule(currentChannel);
    const baselineSpeed = getBaselineSpeedForChannel(currentChannel);
    const isSessionActive = hasActiveSessionOverride(currentChannel.videoId);
    const effectiveSpeed = getEffectiveSpeedForChannel(currentChannel);
    const modePrefix = isSessionActive ? 'Session' : matchedRule ? 'Rule' : 'Default';
    const tooltip = isSessionActive
      ? `Session override for this video only · Baseline is ${formatDisplaySpeed(baselineSpeed)}×`
      : 'Session-only speed bar · Does not overwrite saved channel rules';
    const initialRemainingText = computeCurrentRemainingText();

    const quickSpeeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    bar.innerHTML = `
      <span class="cadence-bar-label ${isSessionActive ? 'is-session' : ''}" title="${tooltip}">
        ${modePrefix} · <strong>${formatDisplaySpeed(effectiveSpeed)}×</strong>
      </span>
      <div class="cadence-bar-buttons">
        ${quickSpeeds
          .map(
            (spd) => `
          <button type="button" data-speed="${spd}" class="cadence-speed-chip ${Math.abs(effectiveSpeed - spd) < 0.015 ? 'active' : ''}" title="Set ${formatDisplaySpeed(spd)}× for this video session only">
            ${formatDisplaySpeed(spd)}×
          </button>
        `
          )
          .join('')}
      </div>
      <span class="cadence-bar-divider" aria-hidden="true"></span>
      <div class="cadence-bar-Fine">
        <button type="button" data-step="-0.05" class="cadence-step-chip" title="Slow down by 0.05× for this video session">−0.05</button>
        <button type="button" data-step="0.05" class="cadence-step-chip" title="Speed up by 0.05× for this video session">+0.05</button>
        <button type="button" data-action="reset" class="cadence-reset-chip ${isSessionActive ? 'is-active' : ''}" ${!isSessionActive ? 'disabled' : ''} title="Reset to ${matchedRule ? 'channel rule' : 'default'} (${formatDisplaySpeed(baselineSpeed)}×)">Reset</button>
      </div>
      <span class="cadence-remaining-wrap" style="display:${initialRemainingText ? 'inline-flex' : 'none'};">
        <span class="cadence-bar-divider" aria-hidden="true"></span>
        <span class="cadence-remaining-time" title="Real wall-clock time remaining at active playback speed">${initialRemainingText}</span>
      </span>
    `;

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
          if (!hasActiveSessionOverride(currentChannel && currentChannel.videoId)) return;
          resetSessionSpeedFromBar();
        },
        { signal: lifecycleSignal }
      );
    }
  }

  function handleLeftWatchPage() {
    currentChannel = null;
    sessionOverride = { videoId: null, speed: null };
    remainingState = { videoId: null, rawRemainingSec: null, hidden: true };
    lastToastedVideoId = null;
    clearBarMountRetry();

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

    if (!state.settings.enabled || !state.settings.perChannelSpeedEnabled) {
      pushConfigToBridge(1.0, false);
      renderInPageBar();
      return;
    }

    clearSessionOverrideIfMatchesBaseline(currentChannel);
    const rule = findMatchingRule(currentChannel);
    const speed = getEffectiveSpeedForChannel(currentChannel);
    pushConfigToBridge(speed, true);
    renderInPageBar();

    if (
      allowToast &&
      !currentChannel.isAd &&
      !currentChannel.isPreview &&
      currentChannel.videoId &&
      lastToastedVideoId !== currentChannel.videoId
    ) {
      lastToastedVideoId = currentChannel.videoId;
      const presetObj =
        rule && rule.presetId !== 'custom'
          ? state.presets.find((p) => p.id === rule.presetId)
          : null;
      const suffix = presetObj ? ` · ${presetObj.label}` : rule ? ' · Channel Rule' : ' · Default';
      showPlayerToast(`${formatDisplaySpeed(speed)}×${suffix}`);
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
        } else if (type === 'TIME_REMAINING_UPDATE' && payload) {
          remainingState = {
            videoId: payload.videoId || null,
            rawRemainingSec:
              typeof payload.rawRemainingSec === 'number' ? payload.rawRemainingSec : null,
            hidden: Boolean(payload.hidden),
          };
          updateRemainingReadoutInPlace();
        } else if (type === 'NAVIGATION_PREVIEW' && payload && payload.videoId) {
          if (sessionOverride.videoId !== payload.videoId) {
            sessionOverride = { videoId: null, speed: null };
          }
          if (remainingState.videoId !== payload.videoId) {
            remainingState = { videoId: payload.videoId, rawRemainingSec: null, hidden: true };
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
          if (payload.videoId && payload.videoId !== prevVideoId) {
            if (sessionOverride.videoId !== payload.videoId) {
              sessionOverride = { videoId: null, speed: null };
            }
            if (remainingState.videoId !== payload.videoId) {
              remainingState = { videoId: payload.videoId, rawRemainingSec: null, hidden: true };
            }
            barMountAttempts = 0;
            const existingBanner = document.querySelector('.cadence-stopped-banner');
            if (existingBanner) {
              existingBanner.classList.remove('cadence-visible');
            }
          }
          currentChannel = payload;
          applyForCurrentChannel(true);
        } else if (type === 'MANUAL_RATE_CHANGE' && payload) {
          if (!state.settings.enabled) return;
          if (payload && payload.channelName) {
            currentChannel = payload;
          } else if (!currentChannel) {
            currentChannel = extractDomChannelFallback();
          }
          if (!currentChannel) return;

          const cleanManualSpeed = clampSpeed(payload.speed);

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
              pushConfigToBridge(baselineSpeed, true);
              renderInPageBar();
              const baselineLabel = matchedRule ? 'Channel Rule' : 'Default';
              showPlayerToast(
                wasOverridden
                  ? `Restored ${formatDisplaySpeed(baselineSpeed)}× (${baselineLabel})`
                  : `${formatDisplaySpeed(baselineSpeed)}× · ${baselineLabel}`
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
        const video = document.querySelector('video.html5-main-video');
        const liveVideoSpeed = video ? Math.round(video.playbackRate * 100) / 100 : activeSpeed;
        const baseline = getBaselineSpeedForChannel(currentChannel);
        if (
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
        sendResponse({
          channel: currentChannel,
          activeSpeed: liveVideoSpeed || activeSpeed,
          matchedRule: rule,
          baselineSpeed: baseline,
          sessionOverrideSpeed: isSession ? sessionOverride.speed : null,
        });
        return false;
      }
      if (msg && msg.type === 'CADENCE_SET_CHANNEL_SPEED') {
        const targetMeta = msg.channel || currentChannel || extractDomChannelFallback();
        if (targetMeta) {
          currentChannel = targetMeta;
          sessionOverride = { videoId: null, speed: null };
          saveChannelSpeed(targetMeta, msg.speed, msg.presetId || 'custom').then((ok) => {
            if (ok) {
              pushConfigToBridge(msg.speed, true);
              postToBridge('COMMAND', { action: 'SET_SPEED', speed: msg.speed });
              renderInPageBar();
              showPlayerToast(`Saved ${formatDisplaySpeed(msg.speed)}× for ${targetMeta.channelName}`);
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
