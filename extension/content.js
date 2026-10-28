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
    playbackRate: null,
    isLive: false,
    isAtLiveHead: false,
    dvrLagSec: null,
    isPaused: false,
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

  function isLiveAtHeadForChannel(meta) {
    if (!remainingState.isLive || !remainingState.isAtLiveHead) return false;
    if (meta && meta.videoId && remainingState.videoId && meta.videoId !== remainingState.videoId) {
      return false;
    }
    return true;
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
    if (!currentChannel || currentChannel.isAd || remainingState.hidden) {
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

  function applyDurationModelToBar(bar, model) {
    if (!bar) return;
    const wrapEl = bar.querySelector('.cadence-remaining-wrap');
    const slotBtn = bar.querySelector('.cadence-remaining-slot');
    const dotEl = bar.querySelector('.cadence-live-dot');
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

  function showPlayerToast(label, forceShow = false) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    if (!state.settings.enabled || (!forceShow && !state.settings.showSpeedToast)) return;
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
    const liveAtHead = isLiveAtHeadForChannel(currentChannel);

    if (liveAtHead && cleanSpeed > 1.01) {
      sessionOverride = { videoId: null, speed: null };
      remainingState.playbackRate = 1.0;
      pushConfigToBridge(1.0, true);
      postToBridge('COMMAND', { action: 'SET_SPEED', speed: 1.0 });
      renderInPageBar();
      showPlayerToast('Stream is currently at live end', true);
      return;
    }

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
      postToBridge('COMMAND', { action: 'SET_SPEED', speed: effectiveBaseline });
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
    const isLiveRuleClamped =
      !isSessionActive && isLiveAtHeadForChannel(currentChannel) && baselineSpeed > 1.01;
    const modePrefix = isSessionActive ? 'Session' : matchedRule ? 'Rule' : 'Default';
    const tooltip = isSessionActive
      ? `Session override for this video only · Baseline is ${formatDisplaySpeed(baselineSpeed)}×`
      : isLiveRuleClamped
        ? `Live stream at live end · Saved ${formatDisplaySpeed(baselineSpeed)}× rule is clamped to 1.0× at live edge`
        : 'Session-only speed bar · Does not overwrite saved channel rules';
    const durationModel = computeDurationSlotModel();

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
        <button type="button" data-action="reset" class="cadence-reset-chip ${isSessionActive ? 'is-active' : ''}" ${!isSessionActive ? 'disabled' : ''} title="Reset to ${matchedRule ? 'channel rule' : 'default'} (${formatDisplaySpeed(isLiveAtHeadForChannel(currentChannel) && baselineSpeed > 1.01 ? 1.0 : baselineSpeed)}×)">Reset</button>
      </div>
      <span class="cadence-remaining-wrap" style="display:none;">
        <span class="cadence-bar-divider" aria-hidden="true"></span>
        <button type="button" class="cadence-remaining-slot" disabled>
          <span class="cadence-live-dot" aria-hidden="true" style="display:none;"></span>
          <span class="cadence-remaining-time"></span>
        </button>
      </span>
    `;

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
  }

  function handleLeftWatchPage() {
    currentChannel = null;
    sessionOverride = { videoId: null, speed: null };
    remainingState = {
      videoId: null,
      rawRemainingSec: null,
      playbackRate: null,
      isLive: false,
      isAtLiveHead: false,
      dvrLagSec: null,
      isPaused: false,
      hidden: true,
    };
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
          const prevLiveAtHead = Boolean(remainingState.isLive && remainingState.isAtLiveHead);
          const prevIsLive = Boolean(remainingState.isLive);
          remainingState = {
            videoId: payload.videoId || null,
            rawRemainingSec:
              typeof payload.rawRemainingSec === 'number' ? payload.rawRemainingSec : null,
            playbackRate:
              typeof payload.playbackRate === 'number' ? payload.playbackRate : null,
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
          if (nowLiveAtHead && (!prevLiveAtHead || hasAboveOneOverride || activeSpeed > 1.01)) {
            if (hasAboveOneOverride) {
              sessionOverride = { videoId: null, speed: null };
            }
            if (currentChannel && state.settings.enabled && state.settings.perChannelSpeedEnabled) {
              pushConfigToBridge(getEffectiveSpeedForChannel(currentChannel), true);
            }
            renderInPageBar();
          } else if (prevLiveAtHead && !nowLiveAtHead && remainingState.isLive) {
            if (currentChannel && state.settings.enabled && state.settings.perChannelSpeedEnabled) {
              pushConfigToBridge(getEffectiveSpeedForChannel(currentChannel), true);
            }
            renderInPageBar();
          } else if (prevIsLive !== remainingState.isLive) {
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
            showPlayerToast('Stream is currently at live end', true);
          }
        } else if (type === 'NAVIGATION_PREVIEW' && payload && payload.videoId) {
          if (sessionOverride.videoId !== payload.videoId) {
            sessionOverride = { videoId: null, speed: null };
          }
          if (remainingState.videoId !== payload.videoId) {
            remainingState = {
              videoId: payload.videoId,
              rawRemainingSec: null,
              playbackRate: null,
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
          if (payload.videoId && payload.videoId !== prevVideoId) {
            if (sessionOverride.videoId !== payload.videoId) {
              sessionOverride = { videoId: null, speed: null };
            }
            if (remainingState.videoId !== payload.videoId) {
              remainingState = {
                videoId: payload.videoId,
                rawRemainingSec: null,
                playbackRate: null,
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
          if (isLiveAtHeadForChannel(currentChannel) && cleanManualSpeed > 1.01) {
            sessionOverride = { videoId: null, speed: null };
            remainingState.playbackRate = 1.0;
            pushConfigToBridge(1.0, true);
            postToBridge('COMMAND', { action: 'SET_SPEED', speed: 1.0 });
            renderInPageBar();
            showPlayerToast('Stream is currently at live end', true);
            return;
          }

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
        const video = document.querySelector('video.html5-main-video');
        const baseline = getBaselineSpeedForChannel(currentChannel);
        const liveAtHead = isLiveAtHeadForChannel(currentChannel);
        const liveClampedOrPaused =
          remainingState.isLive && (remainingState.isAtLiveHead || remainingState.isPaused);
        const liveVideoSpeed = liveClampedOrPaused
          ? getEffectiveSpeedForChannel(currentChannel)
          : video
            ? Math.round(video.playbackRate * 100) / 100
            : activeSpeed;
        if (
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
        const reportedSpeed = state.settings.enabled
          ? getEffectiveSpeedForChannel(currentChannel)
          : liveVideoSpeed || activeSpeed;
        sendResponse({
          channel: currentChannel,
          activeSpeed: reportedSpeed,
          matchedRule: rule,
          baselineSpeed: baseline,
          sessionOverrideSpeed: isSession ? sessionOverride.speed : null,
          isLive: Boolean(remainingState.isLive),
          isAtLiveHead: liveAtHead,
        });
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
        showPlayerToast('Stream is currently at live end', true);
        sendResponse({ ok: true });
        return false;
      }
      if (msg && msg.type === 'CADENCE_SET_CHANNEL_SPEED') {
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
            showPlayerToast('Stream is currently at live end', true);
            sendResponse({ ok: false, blockedAtLiveHead: true });
            return false;
          }
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
