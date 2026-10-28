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
  let seekableEndAdvanceCount = 0;
  let explicitJumpToLiveUntil = 0;
  let psHasMseCeiling = false;
  let lastCleanPsLagSec = null;
  let lastCleanPsLagAt = 0;
  let lastUiNegativeLagSec = null;
  let lastUiNegativeLagAt = 0;
  let lastDvrRestoreAt = 0;
  let dvrRestoreAttempts = 0;
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
        if (!isTyping && config.enabled && (e.key === '>' || e.key === '.')) {
          const player = getMoviePlayer();
          const video = getMainVideo();
          if (video && isLiveBroadcast(player, video)) {
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
    seekableEndAdvanceCount = 0;
    explicitJumpToLiveUntil = 0;
    psHasMseCeiling = false;
    lastCleanPsLagSec = null;
    lastCleanPsLagAt = 0;
    lastUiNegativeLagSec = null;
    lastUiNegativeLagAt = 0;
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
      if (!isPaused && lastObservedSeekableEnd !== null && ps.seekableEnd > lastObservedSeekableEnd + 0.35) {
        seekableEndAdvanceCount = Math.min(10, seekableEndAdvanceCount + 1);
      }
      lastObservedSeekableEnd = ps.seekableEnd;
    }

    let preAnchorLagSec = null;
    if (liveAnchorWallMs > 0 && liveAnchorVideoSec !== null && currentVideoSec !== null) {
      const preExpectedLive = liveAnchorVideoSec + Math.max(0, (now - liveAnchorWallMs) / 1000);
      preAnchorLagSec = Math.max(0, preExpectedLive - currentVideoSec);
    }

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
        cleanPsLag = Math.max(0, rawPsLag);
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
        liveHeadHysteresisBehind = false;
        return {
          isAtLiveHead: true,
          dvrLagSec: 0,
          isPaused,
        };
      }
    }

    if (liveHeadHysteresisBehind) {
      if ((!isPaused && verifiedLagSec <= 9) || verifiedLagSec <= 2) {
        liveHeadHysteresisBehind = false;
      }
    } else {
      if (verifiedLagSec >= 12 || (isPaused && verifiedLagSec >= 5)) {
        liveHeadHysteresisBehind = true;
      }
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
    if (config.enabled && config.perChannelSpeedEnabled) {
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

  function bindVideoListeners() {
    const video = getMainVideo();
    if (!video || video.__cadenceBridgeId === bridgeInstanceId) return;
    video.__cadenceBridgeId = bridgeInstanceId;

    video.addEventListener(
      'timeupdate',
      () => {
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
        if (isApplyingProgrammatically || isAdPlaying(player)) return;
        const newRate = Math.round(video.playbackRate * 100) / 100;

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
        } else if (config.enabled && config.perChannelSpeedEnabled && typeof payload.targetSpeed === 'number') {
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
    broadcastChannelMetadata(false);
    checkNearVideoEnd();
    maybeRestoreDvrCatchupSpeed();
    emitTimeRemaining(false);
  }, 250);

  window.__CADENCE_PAGE_BRIDGE_CLEANUP__ = () => {
    try {
      bridgeController.abort();
    } catch (_) {}
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
