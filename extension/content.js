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
    settings: {"enabled":true,"perChannelSpeedEnabled":true,"autoRememberManualSpeed":true,"defaultSpeed":1,"stopAfterVideoEnds":true,"showInPageControlBar":true,"showSpeedToast":true},
    presets: [{"id":"music","label":"Music & Performance","description":"Preserves natural pitch, rhythm, and studio mix timing.","speed":1},{"id":"educational","label":"Educational & Explainer","description":"Brisk comprehension pace for tutorials, science, and essays.","speed":1.5},{"id":"podcast","label":"Podcast & Lecture","description":"High-efficiency cadence for long-form conversations and seminars.","speed":2}],
    rules: [{"id":"rule-velvet-room","channelName":"Velvet Room Sessions","handle":"@velvetroomsessions","channelId":"UC8velvetRoomMusic01","presetId":"music","customSpeed":1,"updatedAt":"2026-10-23"},{"id":"rule-orbital-lab","channelName":"Orbital Mechanics Lab","handle":"@orbitalmechanics","channelId":"UC4orbitalLabEdu02","presetId":"educational","customSpeed":1.5,"updatedAt":"2026-10-23"},{"id":"rule-longform-archive","channelName":"The Longform Archive","handle":"@longformarchive","channelId":"UC9longformPod03","presetId":"podcast","customSpeed":2,"updatedAt":"2026-10-23"},{"id":"rule-systems-craft","channelName":"Systems Craft","handle":"@systemscraft","channelId":"UC2systemsCraft04","presetId":"educational","customSpeed":1.5,"updatedAt":"2026-10-23"}],
  };

  let currentChannel = null;
  let activeSpeed = 1.0;
  let toastTimeout = null;

  function teardownInstance() {
    if (isDestroyed) return;
    isDestroyed = true;
    clearTimeout(toastTimeout);
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
      const handleMatch = href.match(/\/(@[^/?#]+)/);
      if (handleMatch) handle = handleMatch[1].toLowerCase();
      const chMatch = href.match(/\/channel\/(UC[^/?#]+)/);
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
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
    activeSpeed = Math.round(Number(targetSpeed) * 100) / 100 || 1.0;
    postToBridge('CONFIG_UPDATE', {
      enabled: state.settings.enabled,
      perChannelSpeedEnabled: state.settings.perChannelSpeedEnabled,
      stopAfterVideoEnds: state.settings.stopAfterVideoEnds,
      targetSpeed: activeSpeed,
    });
    safeSendMessage({
      type: 'CADENCE_UPDATE_BADGE',
      enabled: state.settings.enabled && state.settings.perChannelSpeedEnabled,
      speed: activeSpeed,
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
      bar.setAttribute('data-cadence-instance', INSTANCE_TOKEN);
      ownerContainer.appendChild(bar);
    }

    const matchedRule = findMatchingRule(currentChannel);
    const resolved = state.settings.perChannelSpeedEnabled
      ? resolveSpeedForRule(matchedRule)
      : 1.0;

    const quickSpeeds = [1.0, 1.25, 1.5, 1.75, 2.0];
    bar.innerHTML = `
      <span class="cadence-bar-label" title="Cadence Per-Channel Speed">
        ${matchedRule ? 'Saved' : 'Default'} · <strong>${formatDisplaySpeed(resolved)}×</strong>
      </span>
      <div class="cadence-bar-buttons">
        ${quickSpeeds
          .map(
            (spd) => `
          <button type="button" data-speed="${spd}" class="cadence-speed-chip ${Math.abs(resolved - spd) < 0.015 ? 'active' : ''}">
            ${formatDisplaySpeed(spd)}×
          </button>
        `
          )
          .join('')}
      </div>
    `;

    bar.querySelectorAll('.cadence-speed-chip').forEach((btn) => {
      btn.addEventListener(
        'click',
        async () => {
          if (isDestroyed || !isExtensionContextValid()) {
            teardownInstance();
            return;
          }
          const chosen = Number(btn.getAttribute('data-speed'));
          const matchingPreset = state.presets.find((p) => Math.abs(p.speed - chosen) < 0.01);
          const ok = await saveChannelSpeed(
            currentChannel,
            chosen,
            matchingPreset ? matchingPreset.id : 'custom'
          );
          if (!ok) return;
          pushConfigToBridge(chosen);
          showPlayerToast(`Saved ${formatDisplaySpeed(chosen)}× for ${currentChannel.channelName}`);
        },
        { signal: lifecycleSignal }
      );
    });
  }

  function applyForCurrentChannel(showToast = false) {
    if (isDestroyed || !isExtensionContextValid()) {
      teardownInstance();
      return;
    }
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
          const saved = await saveChannelSpeed(
            payload,
            payload.speed,
            matchingPreset ? matchingPreset.id : 'custom'
          );
          if (!saved) return;
          activeSpeed = payload.speed;
          safeSendMessage({
            type: 'CADENCE_UPDATE_BADGE',
            enabled: true,
            speed: payload.speed,
          });
          showPlayerToast(`Remembered ${formatDisplaySpeed(payload.speed)}× for ${payload.channelName}`);
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
          saveChannelSpeed(targetMeta, msg.speed, msg.presetId || 'custom').then((ok) => {
            if (ok) {
              pushConfigToBridge(msg.speed);
              postToBridge('COMMAND', { action: 'SET_SPEED', speed: msg.speed });
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
    const immediateMeta = extractDomChannelFallback();
    if (immediateMeta && !currentChannel) {
      currentChannel = immediateMeta;
      applyForCurrentChannel(false);
    }
    postToBridge('COMMAND', { action: 'FORCE_DETECT' });
  });
})();
