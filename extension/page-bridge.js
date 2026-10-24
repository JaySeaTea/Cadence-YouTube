(() => {
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
    stopAfterVideoEnds: true,
    targetSpeed: 1.0,
  };

  let isApplyingProgrammatically = false;
  let programmaticTimer = null;
  let heartbeatInterval = null;
  let lastAppliedSpeed = Number(config.targetSpeed) || 1.0;
  let lastDetectedKey = '';
  let heldAtEndVideoId = window.__CADENCE_HELD_VIDEO_ID__ || null;
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
    { capture: true, signal: bridgeSignal }
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.shiftKey && (e.key === 'N' || e.key === 'n' || e.key === 'P' || e.key === 'p')) {
        markUserNavigationIntent();
      }
    },
    { capture: true, signal: bridgeSignal }
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
      const handleMatch = href.match(/\/(@[^/?#]+)/);
      if (handleMatch) handle = handleMatch[1].toLowerCase();
      const chMatch = href.match(/\/channel\/(UC[^/?#]+)/);
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

  function bindVideoListeners() {
    const video = getMainVideo();
    if (!video || video.__cadenceBridgeId === bridgeInstanceId) return;
    video.__cadenceBridgeId = bridgeInstanceId;

    video.addEventListener('timeupdate', checkNearVideoEnd, { signal: bridgeSignal });
    video.addEventListener(
      'loadedmetadata',
      () => {
        heldAtEndVideoId = null;
        window.__CADENCE_HELD_VIDEO_ID__ = null;
        broadcastChannelMetadata(true);
        if (config.enabled && config.perChannelSpeedEnabled) {
          setTimeout(() => applyPlaybackSpeed(config.targetSpeed), 120);
        }
        suppressNativeAutoplayAndPlaylist();
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'play',
      () => {
        suppressNativeAutoplayAndPlaylist();
        if (config.enabled && config.perChannelSpeedEnabled) {
          const player = getMoviePlayer();
          if (!isAdPlaying(player) && Math.abs(video.playbackRate - config.targetSpeed) > 0.015) {
            applyPlaybackSpeed(config.targetSpeed);
          }
        }
      },
      { signal: bridgeSignal }
    );

    video.addEventListener(
      'ratechange',
      () => {
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
      },
      { signal: bridgeSignal }
    );
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
        if (config.enabled && config.perChannelSpeedEnabled && typeof payload.targetSpeed === 'number') {
          applyPlaybackSpeed(payload.targetSpeed);
        }
      } else if (type === 'COMMAND') {
        if (payload.action === 'SET_SPEED') {
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
    },
    { signal: bridgeSignal }
  );

  window.addEventListener(
    'yt-navigate-finish',
    () => {
      heldAtEndVideoId = null;
      window.__CADENCE_HELD_VIDEO_ID__ = null;
      setTimeout(() => broadcastChannelMetadata(true), 120);
      setTimeout(() => broadcastChannelMetadata(true), 700);
    },
    { signal: bridgeSignal }
  );

  window.addEventListener(
    'yt-page-data-updated',
    () => {
      setTimeout(() => broadcastChannelMetadata(true), 120);
    },
    { signal: bridgeSignal }
  );

  heartbeatInterval = setInterval(() => {
    broadcastChannelMetadata(false);
    checkNearVideoEnd();
  }, 250);

  window.__CADENCE_PAGE_BRIDGE_CLEANUP__ = () => {
    try {
      bridgeController.abort();
    } catch (_) {}
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    clearTimeout(programmaticTimer);
  };

  broadcastChannelMetadata(true);
})();
