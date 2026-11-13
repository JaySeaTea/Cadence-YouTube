(() => {
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
      const match = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{6,24})(?:\/|$)/);
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
      const match = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{6,24})(?:\/|$)/);
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
        const hMatch = href.match(/\/(@[^/?#]+)/);
        if (hMatch && !handle) handle = hMatch[1].toLowerCase();
        const cMatch = href.match(/\/channel\/(UC[^/?#]+)/);
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
    const match = raw.match(/^[-−]\s*(\d+):(\d{2})(?::(\d{2}))?$/);
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
        const handleMatch = href.match(/\/(@[^/?#]+)/);
        if (handleMatch) handle = handleMatch[1].toLowerCase();
        const chMatch = href.match(/\/channel\/(UC[^/?#]+)/);
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
    if (!alreadyHeld || forceBanner) {
      postToContent('PLAYBACK_STOPPED', {
        videoId: currentVideoId,
        hasPlaylist: hasActivePlaylistContext(),
        bankedSavedSec: Math.floor(currentVideoTimeSavedSec),
      });
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
