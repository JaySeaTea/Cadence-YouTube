(async () => {
  function formatSpeed(val) {
    return Number(val).toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
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
    versionEl.textContent = `· v${manifestVersion}`;
  }
  if (footerVersionEl && manifestVersion) {
    footerVersionEl.textContent = `v${manifestVersion}`;
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
    summaryEl.textContent = `${rules.length} saved channel ${rules.length === 1 ? 'rule' : 'rules'}`;
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
          const player = document.getElementById('movie_player');
          const video = document.querySelector('video.html5-main-video');
          const urlVideoId = new URLSearchParams(location.search).get('v') || '';
          let videoId = urlVideoId;
          let channelId = '';
          let channelName = '';
          let handle = '';
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
                if (resp.videoDetails.isLive === true) isLive = true;
              }
            }
            if (player && typeof player.getVideoData === 'function') {
              const vd = player.getVideoData();
              if (vd && vd.video_id && (!urlVideoId || vd.video_id === urlVideoId)) {
                videoId = vd.video_id;
                if (!channelName) channelName = vd.author || '';
                if (vd.isLive === true) isLive = true;
              }
            }
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
              const hMatch = href.match(/\/(@[^/?#]+)/);
              if (hMatch) handle = hMatch[1].toLowerCase();
              const cMatch = href.match(/\/channel\/(UC[^/?#]+)/);
              if (cMatch && !channelId) channelId = cMatch[1];
              const txt = (ownerLink.textContent || '').trim();
              if (txt) channelName = txt;
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
            activeSpeed: isLive && isAtLiveHead && rawRate > 1.01 ? 1.0 : rawRate,
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
      /^https?:\/\/([a-z0-9-]+\.)?youtube\.com\/watch/i.test(tab.url)
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
  const isLive = Boolean(detected.isLive);
  let isAtLiveHead = Boolean(detected.isLive && detected.isAtLiveHead);
  let currentRule = findRuleForChannel(activeChannel);
  let sessionOverrideSpeed =
    typeof detected.sessionOverrideSpeed === 'number' ? detected.sessionOverrideSpeed : null;
  let currentSpeed = Number(detected.activeSpeed) || 1.0;
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
    sessionOverrideSpeed !== null &&
    Math.abs(sessionOverrideSpeed - initialBaseline) < 0.015
  ) {
    sessionOverrideSpeed = null;
  }

  if (
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
            const p = document.getElementById('movie_player');
            const v = document.querySelector('video.html5-main-video');
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
      (p) => `
      <button type="button" class="preset-btn" data-preset-id="${p.id}" data-speed="${p.speed}">
        <span class="preset-name">${shortPresetLabels[p.id] || p.label}</span>
        <span class="preset-spd">${formatSpeed(p.speed)}×</span>
      </button>
    `
    )
    .join('');

  function renderActiveSpeedUI() {
    currentRule = findRuleForChannel(activeChannel);
    const baseline = resolveRuleBaseline(currentRule);
    if (sessionOverrideSpeed !== null && Math.abs(sessionOverrideSpeed - baseline) < 0.015) {
      sessionOverrideSpeed = null;
    }
    if (isLive && isAtLiveHead) {
      statusEl.textContent =
        currentRule && baseline > 1.01
          ? `Live End (1.0×) · Rule ${formatSpeed(baseline)}×`
          : 'Live Broadcast · At Live End';
    } else if (sessionOverrideSpeed !== null) {
      statusEl.textContent = currentRule
        ? `Session Override · Rule is ${formatSpeed(baseline)}×`
        : `Session Override · Default ${formatSpeed(baseline)}×`;
    } else {
      statusEl.textContent = currentRule ? 'Saved Channel Rule' : 'Detected Channel · Default';
    }
    readoutEl.textContent = `${formatSpeed(currentSpeed)}×`;
    stepperValEl.textContent = `${formatSpeed(currentSpeed)}×`;

    presetGridEl.querySelectorAll('.preset-btn').forEach((btn) => {
      const pid = btn.getAttribute('data-preset-id');
      const pspd = Number(btn.getAttribute('data-speed'));
      const isSelected =
        sessionOverrideSpeed === null &&
        currentRule &&
        currentRule.presetId === pid &&
        Math.abs(currentSpeed - pspd) < 0.02;
      btn.classList.toggle('active', Boolean(isSelected));
    });

    speedGridEl.querySelectorAll('.spd-btn').forEach((btn) => {
      const val = Number(btn.getAttribute('data-speed'));
      btn.classList.toggle(
        'active',
        sessionOverrideSpeed === null && Math.abs(val - currentSpeed) < 0.015
      );
    });
  }

  async function assignSpeedFromPopup(newSpeed, presetId) {
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
      handle: activeChannel.handle || '@' + activeChannel.channelName.toLowerCase().replace(/\s+/g, ''),
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
