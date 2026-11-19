(async () => {
  const DEFAULT_PRESETS = [
  {
    "id": "music",
    "label": "Music & Performance",
    "description": "Preserves natural pitch, rhythm, and studio mix timing.",
    "speed": 1
  },
  {
    "id": "educational",
    "label": "Educational & Explainer",
    "description": "Brisk comprehension pace for tutorials, science, and essays.",
    "speed": 1.5
  },
  {
    "id": "podcast",
    "label": "Podcast & Lecture",
    "description": "High-efficiency cadence for long-form conversations and seminars.",
    "speed": 2
  }
];
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAY_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const DEFAULT_SETTINGS = {
    enabled: true,
    perChannelSpeedEnabled: true,
    stopAfterVideoEnds: true,
    showInPageControlBar: true,
    convertShortsToWatch: true,
    disableVideoPreviews: true,
    showWatchLaterRemoveAction: true,
    showSpeedToast: true,
    popupTimeSavedDisplay: 'daily',
    barTimeSavedDisplay: 'daily',
    defaultSpeed: 1.0,
    settingsSchemaVersion: 7
  };

  function isValidDisplayMode(val) {
    return val === 'total' || val === 'daily' || val === 'off';
  }

  function sanitizeSavedTimeByDay(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [k, v] of Object.entries(raw)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      const sec = Math.floor(Number(v) || 0);
      if (Number.isFinite(sec) && sec > 0) {
        out[k] = sec;
      }
    }
    return out;
  }

  function normalizeOptionsSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const prevSchema = Number(src.settingsSchemaVersion) || 1;
    const merged = {
      ...DEFAULT_SETTINGS,
      ...src,
      perChannelSpeedEnabled:
        typeof src.perChannelSpeedEnabled === 'boolean'
          ? src.perChannelSpeedEnabled
          : typeof src.perChannelSpeed === 'boolean'
            ? src.perChannelSpeed
            : DEFAULT_SETTINGS.perChannelSpeedEnabled,
      stopAfterVideoEnds:
        typeof src.stopAfterVideoEnds === 'boolean'
          ? src.stopAfterVideoEnds
          : typeof src.stopAfterVideo === 'boolean'
            ? src.stopAfterVideo
            : DEFAULT_SETTINGS.stopAfterVideoEnds,
      showInPageControlBar:
        typeof src.showInPageControlBar === 'boolean'
          ? src.showInPageControlBar
          : typeof src.showSpeedBar === 'boolean'
            ? src.showSpeedBar
            : DEFAULT_SETTINGS.showInPageControlBar,
      convertShortsToWatch:
        typeof src.convertShortsToWatch === 'boolean'
          ? src.convertShortsToWatch
          : typeof src.convertShorts === 'boolean'
            ? src.convertShorts
            : DEFAULT_SETTINGS.convertShortsToWatch,
      disableVideoPreviews:
        typeof src.disableVideoPreviews === 'boolean'
          ? src.disableVideoPreviews
          : DEFAULT_SETTINGS.disableVideoPreviews,
      showWatchLaterRemoveAction:
        typeof src.showWatchLaterRemoveAction === 'boolean'
          ? src.showWatchLaterRemoveAction
          : DEFAULT_SETTINGS.showWatchLaterRemoveAction,
      popupTimeSavedDisplay:
        prevSchema >= 7 && isValidDisplayMode(src.popupTimeSavedDisplay)
          ? src.popupTimeSavedDisplay
          : 'daily',
      barTimeSavedDisplay:
        prevSchema >= 7 && isValidDisplayMode(src.barTimeSavedDisplay)
          ? src.barTimeSavedDisplay
          : 'daily',
      settingsSchemaVersion: 7,
    };
    delete merged.perChannelSpeed;
    delete merged.stopAfterVideo;
    delete merged.showSpeedBar;
    delete merged.convertShorts;
    delete merged.autoRememberManualSpeed;
    return merged;
  }

  const manifestVersion =
    chrome.runtime && typeof chrome.runtime.getManifest === 'function'
      ? chrome.runtime.getManifest().version
      : '';
  const versionEl = document.getElementById('ext-version');
  if (versionEl && manifestVersion) {
    versionEl.textContent = `· v${manifestVersion}`;
  }

  let stored = await chrome.storage.local.get([
    'settings',
    'presets',
    'rules',
    'totalTimeSavedSec',
    'timeSavedSince',
    'savedTimeByDay',
  ]);
  let settings = normalizeOptionsSettings(stored.settings);
  let presets = Array.isArray(stored.presets) && stored.presets.length > 0
    ? stored.presets
    : DEFAULT_PRESETS.map((p) => ({ ...p }));
  let rules = Array.isArray(stored.rules) ? stored.rules : [];
  let totalTimeSavedSec = Math.max(0, Math.floor(Number(stored.totalTimeSavedSec) || 0));
  let savedTimeByDay = sanitizeSavedTimeByDay(stored.savedTimeByDay);
  let timeSavedSince =
    typeof stored.timeSavedSince === 'number' &&
    Number.isFinite(stored.timeSavedSince) &&
    stored.timeSavedSince > 0
      ? stored.timeSavedSince
      : Date.now();

  if (
    !stored.savedTimeByDay ||
    typeof stored.savedTimeByDay !== 'object' ||
    !stored.settings ||
    Number(stored.settings.settingsSchemaVersion) < 7
  ) {
    chrome.storage.local
      .set({ settings, savedTimeByDay, timeSavedSince })
      .catch(() => {});
  }

  // Filter & Pagination State
  let searchQuery = '';
  let filterCategory = 'all';
  let sortBy = 'recent';
  let pageSize = 10;
  let currentPage = 1;

  // Analytics & Panel Expansion State (All 4 start collapsed)
  const expandedPanels = { '01': false, '02': false, '03': false, '04': false };
  let chartView = 'weekly';
  let weekOffset = 0;
  let endWeekOffset = 0;
  let trendMonths = 6;
  let drillMonthLabel = null;
  let drillWeekLabel = null;
  let activeBarHoverIndex = null;
  let currentBarMetaList = [];
  let currentBarDefaultFooterHtml = '';
  let heatmapMetaMap = {};
  let hoveredHeatDateKey = null;

  // DOM elements
  const expandAllBtnEl = document.getElementById('btn-toggle-expand-all');
  const presetsEl = document.getElementById('presets-list');
  const rulesEl = document.getElementById('rules-list');
  const rulesCountEl = document.getElementById('rules-count');
  const rulesRangeEl = document.getElementById('rules-range');
  const pageButtonsEl = document.getElementById('page-buttons');
  const searchInputEl = document.getElementById('input-rule-search');
  const categoryPillsEl = document.getElementById('category-pills');
  const sortSelectEl = document.getElementById('select-sort');
  const pageSizeSelectEl = document.getElementById('select-page-size');

  const form = document.getElementById('add-rule-form');
  const presetSelectEl = document.getElementById('input-preset');
  const speedInputEl = document.getElementById('input-speed');
  const importInputEl = document.getElementById('import-json-input');
  const importBtnEl = document.getElementById('btn-import-json');
  const exportBtnEl = document.getElementById('btn-export-json');
  const resetBtnEl = document.getElementById('btn-reset-presets');
  const statusBannerEl = document.getElementById('status-banner');

  const summary01El = document.getElementById('summary-01');
  const summary02El = document.getElementById('summary-02');
  const summary03El = document.getElementById('summary-03');
  const summary04El = document.getElementById('summary-04');

  const toggleSpeedEl = document.getElementById('toggle-speed');
  const toggleStopEl = document.getElementById('toggle-stop');
  const toggleWatchLaterEl = document.getElementById('toggle-watch-later');
  const toggleBarEl = document.getElementById('toggle-bar');
  const toggleShortsEl = document.getElementById('toggle-shorts');
  const togglePreviewsEl = document.getElementById('toggle-previews');

  // Panel 02 DOM
  const popupModeControlsEl = document.getElementById('popup-mode-controls');
  const barModeControlsEl = document.getElementById('bar-mode-controls');
  const previewPopupEl = document.getElementById('preview-popup-readout');
  const previewBarEl = document.getElementById('preview-bar-readout');
  const btnOpenResetEl = document.getElementById('btn-open-reset');
  const resetConfirmBoxEl = document.getElementById('reset-confirm-box');
  const inputConfirmForgetEl = document.getElementById('input-confirm-forget');
  const btnConfirmForgetEl = document.getElementById('btn-confirm-forget');
  const btnCancelForgetEl = document.getElementById('btn-cancel-forget');

  const statSavedValueEl = document.getElementById('stat-saved-value');
  const statSinceLineEl = document.getElementById('stat-since-line');
  const statStoreLineEl = document.getElementById('stat-store-line');
  const statLegacyLineEl = document.getElementById('stat-legacy-line');
  const kpiTodayValEl = document.getElementById('kpi-today-val');
  const kpiTodaySubEl = document.getElementById('kpi-today-sub');
  const kpiWeekValEl = document.getElementById('kpi-week-val');
  const kpiWeekSubEl = document.getElementById('kpi-week-sub');
  const kpiMonthValEl = document.getElementById('kpi-month-val');
  const kpiMonthSubEl = document.getElementById('kpi-month-sub');
  const kpiStreakValEl = document.getElementById('kpi-streak-val');
  const kpiStreakSubEl = document.getElementById('kpi-streak-sub');

  const chartStageEl = document.getElementById('chart-stage');
  const selectChartViewEl = document.getElementById('select-chart-view');
  const chartBreadcrumbEl = document.getElementById('chart-breadcrumb');
  const chartControlsRightEl = document.getElementById('chart-controls-right');
  const chartSubRowEl = document.getElementById('chart-sub-row');
  const chartEmptyNoticeEl = document.getElementById('chart-empty-notice');
  const chartBodyEl = document.getElementById('chart-body');
  const chartFooterEl = document.getElementById('chart-footer');

  let statusTimer = null;

  // Date & Duration helpers (DST-safe Mon–Sun Alignment 1)
  function formatLocalDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseLocalDateKey(key) {
    const parts = String(key || '').split('-').map((n) => parseInt(n, 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date();
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }

  function atLocalMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  function addLocalDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0);
  }

  function getMondayBasedDayIndex(date) {
    return (date.getDay() + 6) % 7;
  }

  function getStartOfMondayWeek(date) {
    return addLocalDays(atLocalMidnight(date), -getMondayBasedDayIndex(date));
  }

  function diffLocalCalendarDays(dateA, dateB) {
    const utcA = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
    const utcB = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
    return Math.round((utcB - utcA) / 86400000);
  }

  function diffLocalCalendarWeeks(mondayA, mondayB) {
    return Math.round(diffLocalCalendarDays(mondayA, mondayB) / 7);
  }

  function formatSpeed(val) {
    return Number(val).toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
  }

  function formatFullSavedTime(sec) {
    const safe = Math.max(0, Math.floor(sec || 0));
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const remS = safe % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${remS}s`;
    if (mins > 0) return `${mins}m ${remS}s`;
    return `${remS}s`;
  }

  function formatCompactSavedTime(sec) {
    const safe = Math.max(0, Math.round(sec || 0));
    if (safe === 0) return '0s';
    if (safe < 60) return `${safe}s`;
    const totalMins = Math.round(safe / 60);
    if (totalMins < 60) return `${totalMins}m`;
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  function formatDateMMDDYYYY(d) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  function getTrackingStartDateFormatted() {
    const positiveKeys = Object.entries(savedTimeByDay)
      .filter(([, val]) => Number(val) > 0)
      .map(([k]) => k)
      .sort();
    let candidate = positiveKeys.length > 0 ? parseLocalDateKey(positiveKeys[0]) : null;
    if (typeof timeSavedSince === 'number' && Number.isFinite(timeSavedSince) && timeSavedSince > 0) {
      const sinceDate = atLocalMidnight(new Date(timeSavedSince));
      if (!candidate || sinceDate.getTime() < candidate.getTime()) {
        candidate = sinceDate;
      }
    }
    return formatDateMMDDYYYY(candidate || new Date());
  }

  function sumSavedTimeMap(byDay) {
    let sum = 0;
    for (const val of Object.values(byDay || {})) {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) sum += Math.floor(n);
    }
    return sum;
  }

  function getTodaySavedSec(now = new Date()) {
    const key = formatLocalDateKey(now);
    return Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
  }

  function estimateStorageBytes(byDay) {
    const txt = JSON.stringify({ savedTimeByDay: byDay || {} });
    try {
      return new Blob([txt]).size;
    } catch (_) {
      return txt.length;
    }
  }

  function getWeekDailySeries(offset = 0, now = new Date()) {
    const todayMid = atLocalMidnight(now);
    const todayKey = formatLocalDateKey(todayMid);
    const currentWeekStart = getStartOfMondayWeek(todayMid);
    const weekStart = addLocalDays(currentWeekStart, offset * 7);
    const weekEnd = addLocalDays(weekStart, 6);
    const points = [];
    let totalSec = 0;
    let elapsedDaysInWeek = 0;
    let activeDays = 0;

    for (let i = 0; i < 7; i++) {
      const d = addLocalDays(weekStart, i);
      const key = formatLocalDateKey(d);
      const isFuture = d.getTime() > todayMid.getTime();
      const sec = isFuture ? 0 : Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
      if (!isFuture) {
        elapsedDaysInWeek += 1;
        totalSec += sec;
        if (sec > 0) activeDays += 1;
      }
      points.push({
        dateKey: key,
        dayShort: WEEKDAY_MON_FIRST[i],
        dateLabel: `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`,
        fullDateLabel: `${WEEKDAY_MON_FIRST[i]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`,
        seconds: sec,
        isToday: key === todayKey,
        isFuture,
      });
    }

    const startStr = `${MONTH_SHORT[weekStart.getMonth()]} ${weekStart.getDate()}`;
    const endStr =
      weekStart.getMonth() === weekEnd.getMonth()
        ? `${weekEnd.getDate()}, ${weekEnd.getFullYear()}`
        : `${MONTH_SHORT[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;

    return {
      points,
      rangeLabel: `${startStr} – ${endStr}`,
      totalSec,
      dailyAvgSec: elapsedDaysInWeek > 0 ? Math.round(totalSec / elapsedDaysInWeek) : 0,
      activeDays,
      isCurrentWeek: offset === 0,
    };
  }

  function getAlignedFourWeekSeries(endOffset = 0, now = new Date()) {
    const todayMid = atLocalMidnight(now);
    const currentWeekStart = getStartOfMondayWeek(todayMid);
    const points = [];
    let totalSec = 0;
    let totalActiveDays = 0;

    for (let i = 0; i < 4; i++) {
      const offset = endOffset - (3 - i);
      const start = addLocalDays(currentWeekStart, offset * 7);
      const end = addLocalDays(start, 6);
      let weekSec = 0;
      let weekActive = 0;
      for (let dOffset = 0; dOffset < 7; dOffset++) {
        const d = addLocalDays(start, dOffset);
        if (d.getTime() <= todayMid.getTime()) {
          const key = formatLocalDateKey(d);
          const sec = Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
          weekSec += sec;
          if (sec > 0) weekActive += 1;
        }
      }
      const rangeLabel =
        start.getMonth() === end.getMonth()
          ? `${MONTH_SHORT[start.getMonth()]} ${start.getDate()}–${end.getDate()}`
          : `${MONTH_SHORT[start.getMonth()]} ${start.getDate()}–${MONTH_SHORT[end.getMonth()]} ${end.getDate()}`;

      points.push({
        weekIndex: i + 1,
        label: `Wk ${i + 1}`,
        rangeLabel,
        seconds: weekSec,
        activeDays: weekActive,
        weekOffsetFromCurrent: offset,
        isCurrentWeek: offset === 0,
      });
      totalSec += weekSec;
      totalActiveDays += weekActive;
    }

    const windowStart = addLocalDays(currentWeekStart, (endOffset - 3) * 7);
    const windowEnd = addLocalDays(currentWeekStart, endOffset * 7 + 6);
    const startStr = `${MONTH_SHORT[windowStart.getMonth()]} ${windowStart.getDate()}`;
    const endStr = `${MONTH_SHORT[windowEnd.getMonth()]} ${windowEnd.getDate()}, ${windowEnd.getFullYear()}`;

    return {
      points,
      monthLabel: `${startStr} – ${endStr}`,
      totalSec,
      weeklyAvgSec: Math.round(totalSec / 4),
      activeDays: totalActiveDays,
      isCurrentMonth: endOffset === 0,
    };
  }

  function getEndWeekOffsetForMonth(monthKey, now = new Date()) {
    const parts = String(monthKey || '').split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (Number.isNaN(y) || Number.isNaN(m)) return 0;
    if (y === now.getFullYear() && m === now.getMonth()) return 0;
    const currentWeekStart = getStartOfMondayWeek(atLocalMidnight(now));
    const lastDayOfTargetMonth = new Date(y, m + 1, 0, 0, 0, 0, 0);
    const targetWeekStart = getStartOfMondayWeek(lastDayOfTargetMonth);
    return Math.min(0, diffLocalCalendarWeeks(currentWeekStart, targetWeekStart));
  }

  function getMultiMonthSeries(monthCount = 6, now = new Date()) {
    const safeCount = Math.max(1, monthCount);
    const raw = [];
    for (let offset = -(safeCount - 1); offset <= 0; offset++) {
      const start = new Date(now.getFullYear(), now.getMonth() + offset, 1, 0, 0, 0, 0);
      const y = start.getFullYear();
      const m = start.getMonth();
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      let secTotal = 0;
      let activeDays = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const sec = Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
        secTotal += sec;
        if (sec > 0) activeDays += 1;
      }
      raw.push({
        monthKey: `${y}-${String(m + 1).padStart(2, '0')}`,
        shortLabel: MONTH_SHORT[m],
        fullLabel: `${MONTH_SHORT[m]} ${y}`,
        seconds: secTotal,
        activeDays,
      });
    }
    return raw.map((item, idx) => {
      if (idx === 0 || raw[idx - 1].seconds <= 0) {
        return { ...item, deltaPercent: null };
      }
      const prev = raw[idx - 1].seconds;
      return { ...item, deltaPercent: Math.round(((item.seconds - prev) / prev) * 100) };
    });
  }

  function getCurrentMonthKpiSummary(now = new Date()) {
    const y = now.getFullYear();
    const m = now.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    let totalSec = 0;
    let activeDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day, 0, 0, 0, 0);
      if (d.getTime() > atLocalMidnight(now).getTime()) break;
      const key = formatLocalDateKey(d);
      const sec = Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
      totalSec += sec;
      if (sec > 0) activeDays += 1;
    }
    return { totalSec, activeDays };
  }

  function getDayOfWeekRhythm(lookbackDays = 90, now = new Date()) {
    const todayMid = atLocalMidnight(now);
    const sums = new Array(7).fill(0);
    const counts = new Array(7).fill(0);
    for (let offset = 0; offset < lookbackDays; offset++) {
      const d = addLocalDays(todayMid, -offset);
      const key = formatLocalDateKey(d);
      const idx = getMondayBasedDayIndex(d);
      sums[idx] += Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
      counts[idx] += 1;
    }
    return WEEKDAY_MON_FIRST.map((label, dayIndex) => ({
      dayIndex,
      label,
      totalSec: sums[dayIndex],
      avgSec: counts[dayIndex] > 0 ? Math.round(sums[dayIndex] / counts[dayIndex]) : 0,
    }));
  }

  function getActivityHeatmapGrid(numWeeks = 12, now = new Date()) {
    const todayMid = atLocalMidnight(now);
    const todayKey = formatLocalDateKey(todayMid);
    const currentWeekStart = getStartOfMondayWeek(todayMid);
    const gridStart = addLocalDays(currentWeekStart, -(numWeeks - 1) * 7);

    let maxDaySec = 0;
    for (let w = 0; w < numWeeks; w++) {
      for (let r = 0; r < 7; r++) {
        const d = addLocalDays(gridStart, w * 7 + r);
        if (d.getTime() > todayMid.getTime()) continue;
        const sec = Math.max(0, Math.floor(Number(savedTimeByDay[formatLocalDateKey(d)]) || 0));
        if (sec > maxDaySec) maxDaySec = sec;
      }
    }

    const weeks = [];
    const weekMonthLabels = [];
    let prevLabeledMonth = -1;
    for (let w = 0; w < numWeeks; w++) {
      const col = [];
      const colStartDate = addLocalDays(gridStart, w * 7);
      const colMonth = colStartDate.getMonth();
      if (colMonth !== prevLabeledMonth) {
        weekMonthLabels.push(MONTH_SHORT[colMonth]);
        prevLabeledMonth = colMonth;
      } else {
        weekMonthLabels.push('');
      }
      for (let r = 0; r < 7; r++) {
        const d = addLocalDays(gridStart, w * 7 + r);
        const key = formatLocalDateKey(d);
        const isFuture = d.getTime() > todayMid.getTime();
        const sec = isFuture ? 0 : Math.max(0, Math.floor(Number(savedTimeByDay[key]) || 0));
        let level = 0;
        if (!isFuture && sec > 0 && maxDaySec > 0) {
          const ratio = sec / maxDaySec;
          if (ratio >= 0.72) level = 4;
          else if (ratio >= 0.46) level = 3;
          else if (ratio >= 0.22) level = 2;
          else level = 1;
        }
        col.push({
          dateKey: key,
          label: `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
          seconds: sec,
          level,
          isToday: key === todayKey,
          isFuture,
        });
      }
      weeks.push(col);
    }

    const allEntries = Object.entries(savedTimeByDay)
      .map(([dateKey, val]) => ({ dateKey, seconds: Math.max(0, Math.floor(Number(val) || 0)) }))
      .filter((entry) => entry.seconds > 0)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    let bestDay = null;
    for (const entry of allEntries) {
      if (!bestDay || entry.seconds > bestDay.seconds) {
        const d = parseLocalDateKey(entry.dateKey);
        bestDay = {
          dateKey: entry.dateKey,
          label: `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`,
          seconds: entry.seconds,
        };
      }
    }

    let currentStreakDays = 0;
    for (let back = 0; back < 3650; back++) {
      const d = addLocalDays(todayMid, -back);
      const sec = Math.max(0, Math.floor(Number(savedTimeByDay[formatLocalDateKey(d)]) || 0));
      if (sec > 0) {
        currentStreakDays += 1;
      } else if (back === 0) {
        continue;
      } else {
        break;
      }
    }

    let longestStreakDays = 0;
    let running = 0;
    let prevTime = null;
    for (const entry of allEntries) {
      const t = parseLocalDateKey(entry.dateKey).getTime();
      if (prevTime !== null && Math.round((t - prevTime) / 86400000) === 1) {
        running += 1;
      } else {
        running = 1;
      }
      if (running > longestStreakDays) longestStreakDays = running;
      prevTime = t;
    }

    return {
      weeks,
      weekMonthLabels,
      currentStreakDays,
      longestStreakDays,
      bestDay,
      totalActiveDays: allEntries.length,
    };
  }

  function normalizeHandle(raw, fallbackName = '') {
    const cleaned = String(raw || '').trim();
    if (cleaned) {
      const urlMatch = cleaned.match(/\/(@[^/?#]+)/);
      if (urlMatch) return urlMatch[1].toLowerCase();
      return cleaned.startsWith('@') ? cleaned.toLowerCase() : '@' + cleaned.toLowerCase().replace(/\s+/g, '');
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

  // Panel collapse / expand controls
  function syncPanelDom(panelId) {
    const sectionEl = document.querySelector(`section.panel[data-panel="${panelId}"]`);
    const btnEl = document.querySelector(`button[data-panel-toggle="${panelId}"]`);
    if (!sectionEl || !btnEl) return;
    const isExpanded = Boolean(expandedPanels[panelId]);
    sectionEl.classList.toggle('is-expanded', isExpanded);
    btnEl.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    const lblEl = btnEl.querySelector('.panel-toggle-label');
    if (lblEl) lblEl.textContent = isExpanded ? 'Collapse' : 'Expand';
  }

  function syncExpandAllBtn() {
    if (!expandAllBtnEl) return;
    const allExpanded = Object.values(expandedPanels).every(Boolean);
    expandAllBtnEl.textContent = allExpanded ? 'Collapse All' : 'Expand All';
  }

  document.querySelectorAll('button[data-panel-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pid = btn.getAttribute('data-panel-toggle');
      if (!pid) return;
      expandedPanels[pid] = !expandedPanels[pid];
      syncPanelDom(pid);
      syncExpandAllBtn();
    });
  });

  if (expandAllBtnEl) {
    expandAllBtnEl.addEventListener('click', () => {
      const allExpanded = Object.values(expandedPanels).every(Boolean);
      const next = !allExpanded;
      Object.keys(expandedPanels).forEach((pid) => {
        expandedPanels[pid] = next;
        syncPanelDom(pid);
      });
      syncExpandAllBtn();
    });
  }

  Object.keys(expandedPanels).forEach(syncPanelDom);
  syncExpandAllBtn();

  function renderCollapsedSummaries() {
    if (summary01El) {
      const enabledCount = [
        Boolean(settings.stopAfterVideoEnds),
        settings.convertShortsToWatch !== false,
        settings.disableVideoPreviews !== false,
        Boolean(settings.perChannelSpeedEnabled),
        settings.showInPageControlBar !== false,
        settings.showWatchLaterRemoveAction !== false,
      ].filter(Boolean).length;
      const stopTxt = settings.stopAfterVideoEnds ? 'On' : 'Off';
      const barTxt = settings.showInPageControlBar !== false ? 'Shown' : 'Hidden';
      summary01El.textContent = `${enabledCount}/6 features active · Stop after end: ${stopTxt} · Control bar: ${barTxt}`;
    }

    if (summary02El) {
      const totalStr = formatCompactSavedTime(totalTimeSavedSec);
      const todayStr = formatCompactSavedTime(getTodaySavedSec());
      const pMode = settings.popupTimeSavedDisplay || 'daily';
      const bMode = settings.barTimeSavedDisplay || 'daily';
      const pLabel = pMode === 'total' ? 'Total' : pMode === 'daily' ? 'Daily' : 'Off';
      const bLabel = bMode === 'total' ? 'Total' : bMode === 'daily' ? 'Daily' : 'Off';
      summary02El.innerHTML = `<span class="text-emerald">${totalStr}</span> total · <span class="text-emerald">${todayStr}</span> today · Popup: ${pLabel} · Bar: ${bLabel}`;
    }

    if (summary03El) {
      summary03El.textContent = presets
        .map((p) => `${p.id === 'podcast' ? 'Podcast' : p.label} ${formatSpeed(p.speed)}×`)
        .join(' · ');
    }

    if (summary04El) {
      if (rules.length === 0) {
        summary04El.textContent = 'No channel rules saved yet — add or import JSON rules';
      } else {
        const preview = rules
          .slice(0, 3)
          .map((r) => `${r.channelName} (${formatSpeed(resolveSpeed(r))}×)`)
          .join(', ');
        const extra = rules.length > 3 ? ` +${rules.length - 3} more` : '';
        summary04El.textContent = `${rules.length} ${rules.length === 1 ? 'channel' : 'channels'} · ${preview}${extra}`;
      }
    }
  }

  function renderToggles() {
    if (toggleStopEl) toggleStopEl.checked = Boolean(settings.stopAfterVideoEnds);
    if (toggleShortsEl) toggleShortsEl.checked = settings.convertShortsToWatch !== false;
    if (togglePreviewsEl) togglePreviewsEl.checked = settings.disableVideoPreviews !== false;
    if (toggleSpeedEl) toggleSpeedEl.checked = Boolean(settings.perChannelSpeedEnabled);
    if (toggleBarEl) toggleBarEl.checked = settings.showInPageControlBar !== false;
    if (toggleWatchLaterEl) toggleWatchLaterEl.checked = settings.showWatchLaterRemoveAction !== false;
    renderCollapsedSummaries();
  }

  const SETTING_STATUS_LABELS = {
    stopAfterVideoEnds: 'Stop Playback After Video Ends',
    convertShortsToWatch: 'Convert Shorts to Standard Player',
    disableVideoPreviews: 'Disable Video Previews',
    perChannelSpeedEnabled: 'Per-Channel Playback Speed',
    showInPageControlBar: 'Show Speed Bar Below Video',
    showWatchLaterRemoveAction: 'Show "Remove from Watch Later" on Video End',
    popupTimeSavedDisplay: 'Toolbar Popup Readout',
    barTimeSavedDisplay: 'Below-Video Bar Readout',
  };

  async function updateSetting(key, val) {
    settings[key] = val;
    settings.settingsSchemaVersion = 7;
    await chrome.storage.local.set({ settings });
    renderToggles();
    renderTimeSavedAnalytics();
    showStatus(`Updated ${SETTING_STATUS_LABELS[key] || key}: ${typeof val === 'boolean' ? (val ? 'Enabled' : 'Disabled') : val}`);
  }

  if (toggleStopEl) toggleStopEl.addEventListener('change', () => updateSetting('stopAfterVideoEnds', toggleStopEl.checked));
  if (toggleShortsEl) toggleShortsEl.addEventListener('change', () => updateSetting('convertShortsToWatch', toggleShortsEl.checked));
  if (togglePreviewsEl) togglePreviewsEl.addEventListener('change', () => updateSetting('disableVideoPreviews', togglePreviewsEl.checked));
  if (toggleSpeedEl) toggleSpeedEl.addEventListener('change', () => updateSetting('perChannelSpeedEnabled', toggleSpeedEl.checked));
  if (toggleBarEl) toggleBarEl.addEventListener('change', () => updateSetting('showInPageControlBar', toggleBarEl.checked));
  if (toggleWatchLaterEl) toggleWatchLaterEl.addEventListener('change', () => updateSetting('showWatchLaterRemoveAction', toggleWatchLaterEl.checked));

  if (popupModeControlsEl) {
    popupModeControlsEl.querySelectorAll('button[data-popup-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-popup-mode');
        if (isValidDisplayMode(mode)) updateSetting('popupTimeSavedDisplay', mode);
      });
    });
  }

  if (barModeControlsEl) {
    barModeControlsEl.querySelectorAll('button[data-bar-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-bar-mode');
        if (isValidDisplayMode(mode)) updateSetting('barTimeSavedDisplay', mode);
      });
    });
  }

  function setBarFooterHighlight(idx) {
    activeBarHoverIndex = idx;
    if (!chartBodyEl) return;
    chartBodyEl.querySelectorAll('.bar-col[data-bar-index]').forEach((colEl) => {
      const cIdx = Number(colEl.getAttribute('data-bar-index'));
      colEl.classList.toggle('is-hovered', idx !== null && cIdx === idx);
    });
    if (!chartFooterEl) return;
    const inspectEl = chartFooterEl.querySelector('#chart-footer-inspect');
    if (!inspectEl) return;
    if (idx !== null && currentBarMetaList[idx]) {
      inspectEl.className = 'chart-footer-inspect';
      inspectEl.textContent = currentBarMetaList[idx].footerText;
    } else {
      inspectEl.className = 'chart-footer-muted';
      inspectEl.textContent = currentBarDefaultFooterHtml;
    }
  }

  function bindBarHoverHandlers(defaultFooterText) {
    currentBarDefaultFooterHtml = defaultFooterText;
    activeBarHoverIndex = null;
    if (!chartBodyEl) return;
    chartBodyEl.querySelectorAll('.bar-col[data-bar-index]').forEach((colEl) => {
      const idx = Number(colEl.getAttribute('data-bar-index'));
      colEl.addEventListener('mouseenter', () => setBarFooterHighlight(idx));
      colEl.addEventListener('focus', () => setBarFooterHighlight(idx));
      colEl.addEventListener('mouseleave', () => setBarFooterHighlight(null));
      colEl.addEventListener('blur', () => setBarFooterHighlight(null));
      colEl.addEventListener('click', () => {
        const item = currentBarMetaList[idx];
        if (item && typeof item.onClick === 'function') item.onClick();
      });
    });
  }

  if (chartStageEl) {
    chartStageEl.addEventListener('mouseleave', () => {
      if (chartView !== 'consistency') {
        setBarFooterHighlight(null);
      } else {
        hoveredHeatDateKey = null;
        const inspectEl = chartFooterEl ? chartFooterEl.querySelector('#chart-footer-inspect') : null;
        if (inspectEl) {
          inspectEl.className = 'chart-footer-muted';
          inspectEl.textContent = 'Hover any day square for date total · Click a bar in Trend or 4-Week History to drill down';
        }
        chartStageEl.querySelectorAll('.rhythm-row.is-hovered').forEach((r) => r.classList.remove('is-hovered'));
      }
    });
  }

  function renderChartStage() {
    if (!chartBodyEl || !chartFooterEl || !chartControlsRightEl || !chartSubRowEl || !chartBreadcrumbEl) return;
    const now = new Date();
    const todaySec = getTodaySavedSec(now);
    const attributedTotalSec = sumSavedTimeMap(savedTimeByDay);
    const unattributedPriorSec = Math.max(0, totalTimeSavedSec - attributedTotalSec);

    if (selectChartViewEl && selectChartViewEl.value !== chartView) {
      selectChartViewEl.value = chartView;
    }

    if (chartEmptyNoticeEl) {
      if (attributedTotalSec === 0) {
        chartEmptyNoticeEl.style.display = 'block';
        chartEmptyNoticeEl.textContent = unattributedPriorSec > 0
          ? `Daily breakdown starts collecting from today (${formatCompactSavedTime(unattributedPriorSec)} was recorded prior to v1.7.1 without per-day buckets, so earlier days appear blank instead of guessing past dates).`
          : 'No daily playback acceleration recorded yet. Speed up any YouTube video (>1.0×) and your daily, weekly, and monthly bars will populate automatically.';
      } else {
        chartEmptyNoticeEl.style.display = 'none';
      }
    }

    // Breadcrumbs
    let crumbsHtml = '';
    if (chartView === 'four_week' && drillMonthLabel) {
      crumbsHtml = `
        <button type="button" class="crumb-btn" data-crumb="trend">Monthly Trend</button>
        <span>›</span>
        <span class="crumb-current">${drillMonthLabel}</span>
      `;
    } else if (chartView === 'weekly' && drillWeekLabel) {
      crumbsHtml = drillMonthLabel
        ? `
          <button type="button" class="crumb-btn" data-crumb="trend">Monthly Trend</button>
          <span>›</span>
          <button type="button" class="crumb-btn" data-crumb="four_week">${drillMonthLabel}</button>
          <span>›</span>
          <span class="crumb-current">${drillWeekLabel}</span>
        `
        : `
          <button type="button" class="crumb-btn" data-crumb="four_week">4-Week History</button>
          <span>›</span>
          <span class="crumb-current">${drillWeekLabel}</span>
        `;
    }
    chartBreadcrumbEl.innerHTML = crumbsHtml;
    chartBreadcrumbEl.querySelectorAll('button[data-crumb]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dest = btn.getAttribute('data-crumb');
        if (dest === 'trend') {
          chartView = 'monthly_trend';
          drillMonthLabel = null;
          drillWeekLabel = null;
        } else if (dest === 'four_week') {
          chartView = 'four_week';
          drillWeekLabel = null;
        }
        renderChartStage();
      });
    });

    if (chartView === 'weekly') {
      const summary = getWeekDailySeries(weekOffset, now);
      const maxSec = Math.max(1, ...summary.points.map((p) => p.seconds));
      chartControlsRightEl.innerHTML = `
        <span class="chart-hint-inline">${summary.rangeLabel}</span>
        <div class="nav-capsule">
          <button type="button" class="nav-step-btn" id="btn-prev-week" title="Previous week">&lt;</button>
          <button type="button" class="nav-period-btn" id="btn-curr-week" ${weekOffset === 0 ? 'disabled' : ''}>${weekOffset === 0 ? 'This Week' : 'Current'}</button>
          <button type="button" class="nav-step-btn" id="btn-next-week" ${weekOffset >= 0 ? 'disabled' : ''} title="Next week">&gt;</button>
        </div>
      `;
      chartSubRowEl.innerHTML = `<span>7 daily bars · Mon–Sun</span><span>${summary.activeDays}/7 active days</span>`;

      currentBarMetaList = summary.points.map((pt) => ({
        footerText: pt.isFuture
          ? `${pt.fullDateLabel} — Upcoming`
          : `${pt.fullDateLabel} — ${formatFullSavedTime(pt.seconds)} saved${pt.isToday ? ' · Today' : ''}`,
        onClick: null,
      }));

      chartBodyEl.innerHTML = `
        <div class="bar-plot" style="grid-template-columns: repeat(7, minmax(0, 1fr));">
          ${summary.points.map((pt, idx) => {
            const pct = pt.seconds > 0 ? Math.max(8, Math.round((pt.seconds / maxSec) * 100)) : 4;
            const fillColor = pt.isToday
              ? 'rgba(52, 211, 153, 0.92)'
              : pt.seconds > 0
                ? 'rgba(52, 211, 153, 0.72)'
                : pt.isFuture
                  ? 'rgba(30, 41, 59, 0.45)'
                  : 'rgba(51, 65, 85, 0.65)';
            return `
              <button type="button" class="bar-col is-non-interactive ${pt.isToday ? 'is-current-emerald' : ''}" data-bar-index="${idx}" aria-label="${pt.fullDateLabel}: ${formatCompactSavedTime(pt.seconds)}">
                <span class="bar-top-val">${pt.seconds > 0 ? formatCompactSavedTime(pt.seconds) : '—'}</span>
                <span class="bar-track"><span class="bar-fill" style="height:${pct}%;background:${fillColor};"></span></span>
                <span class="bar-axis">
                  <span class="bar-axis-main">${pt.dayShort}</span>
                  <span class="bar-axis-sub">${pt.dateLabel}</span>
                </span>
              </button>
            `;
          }).join('')}
        </div>
      `;

      chartFooterEl.innerHTML = `
        <span id="chart-footer-inspect" class="chart-footer-muted">Hover any bar for exact day breakdown</span>
        <span class="chart-footer-stats">Week total: <strong>${formatFullSavedTime(summary.totalSec)}</strong> · Daily avg: <strong>${formatCompactSavedTime(summary.dailyAvgSec)}</strong></span>
      `;
      bindBarHoverHandlers('Hover any bar for exact day breakdown');

      const prevBtn = document.getElementById('btn-prev-week');
      const currBtn = document.getElementById('btn-curr-week');
      const nextBtn = document.getElementById('btn-next-week');
      if (prevBtn) prevBtn.addEventListener('click', () => { weekOffset -= 1; drillWeekLabel = null; renderChartStage(); });
      if (currBtn) currBtn.addEventListener('click', () => { weekOffset = 0; drillMonthLabel = null; drillWeekLabel = null; renderChartStage(); });
      if (nextBtn) nextBtn.addEventListener('click', () => { if (weekOffset < 0) { weekOffset += 1; drillWeekLabel = null; renderChartStage(); } });
    } else if (chartView === 'four_week') {
      const summary = getAlignedFourWeekSeries(endWeekOffset, now);
      const maxSec = Math.max(1, ...summary.points.map((p) => p.seconds));
      chartControlsRightEl.innerHTML = `
        <span class="chart-hint-inline">${summary.monthLabel}</span>
        <div class="nav-capsule">
          <button type="button" class="nav-step-btn" id="btn-prev-4wk" title="Earlier 4 weeks">&lt;</button>
          <button type="button" class="nav-period-btn" id="btn-curr-4wk" ${endWeekOffset === 0 ? 'disabled' : ''}>${endWeekOffset === 0 ? 'Last 4 Wks' : 'Latest 4 Wks'}</button>
          <button type="button" class="nav-step-btn" id="btn-next-4wk" ${endWeekOffset >= 0 ? 'disabled' : ''} title="Later 4 weeks">&gt;</button>
        </div>
      `;
      chartSubRowEl.innerHTML = `<span>4 consecutive Mon–Sun calendar weeks · Click any bar to inspect its 7 days</span><span>${summary.activeDays} active days</span>`;

      currentBarMetaList = summary.points.map((wk) => ({
        footerText: `${wk.label} (${wk.rangeLabel}) — ${formatFullSavedTime(wk.seconds)} across ${wk.activeDays} ${wk.activeDays === 1 ? 'day' : 'days'} · Click to inspect days`,
        onClick: () => {
          weekOffset = typeof wk.weekOffsetFromCurrent === 'number' ? wk.weekOffsetFromCurrent : 0;
          drillWeekLabel = `${wk.label} (${wk.rangeLabel})`;
          chartView = 'weekly';
          renderChartStage();
        },
      }));

      chartBodyEl.innerHTML = `
        <div class="bar-plot" style="grid-template-columns: repeat(4, minmax(0, 1fr));">
          ${summary.points.map((wk, idx) => {
            const pct = wk.seconds > 0 ? Math.max(10, Math.round((wk.seconds / maxSec) * 100)) : 5;
            const fillColor = wk.isCurrentWeek
              ? 'rgba(56, 189, 248, 0.92)'
              : wk.seconds > 0
                ? 'rgba(56, 189, 248, 0.72)'
                : 'rgba(51, 65, 85, 0.65)';
            return `
              <button type="button" class="bar-col ${wk.isCurrentWeek ? 'is-current-sky' : ''}" data-bar-index="${idx}" aria-label="${wk.label} (${wk.rangeLabel}): ${formatCompactSavedTime(wk.seconds)}">
                <span class="bar-top-val">${wk.seconds > 0 ? formatCompactSavedTime(wk.seconds) : '—'}</span>
                <span class="bar-track"><span class="bar-fill" style="height:${pct}%;background:${fillColor};"></span></span>
                <span class="bar-axis">
                  <span class="bar-axis-main">${wk.label}</span>
                  <span class="bar-axis-sub">${wk.rangeLabel}</span>
                </span>
              </button>
            `;
          }).join('')}
        </div>
      `;

      chartFooterEl.innerHTML = `
        <span id="chart-footer-inspect" class="chart-footer-muted">Hover or click any week bar to drill down into daily bars</span>
        <span class="chart-footer-stats">4-week total: <strong>${formatFullSavedTime(summary.totalSec)}</strong> · Avg: <strong>${formatCompactSavedTime(summary.weeklyAvgSec)}/wk</strong></span>
      `;
      bindBarHoverHandlers('Hover or click any week bar to drill down into daily bars');

      const prev4Btn = document.getElementById('btn-prev-4wk');
      const curr4Btn = document.getElementById('btn-curr-4wk');
      const next4Btn = document.getElementById('btn-next-4wk');
      if (prev4Btn) prev4Btn.addEventListener('click', () => { endWeekOffset -= 4; drillMonthLabel = null; renderChartStage(); });
      if (curr4Btn) curr4Btn.addEventListener('click', () => { endWeekOffset = 0; drillMonthLabel = null; renderChartStage(); });
      if (next4Btn) next4Btn.addEventListener('click', () => { if (endWeekOffset < 0) { endWeekOffset = Math.min(0, endWeekOffset + 4); drillMonthLabel = null; renderChartStage(); } });
    } else if (chartView === 'monthly_trend') {
      const series = getMultiMonthSeries(trendMonths, now);
      const maxSec = Math.max(1, ...series.map((m) => m.seconds));
      const totalWindowSec = series.reduce((acc, m) => acc + m.seconds, 0);
      chartControlsRightEl.innerHTML = `
        <span class="chart-hint-inline">Click any month bar to drill down</span>
        <div class="segmented-control">
          <button type="button" class="seg-btn ${trendMonths === 6 ? 'active' : ''}" id="btn-trend-6m">6M</button>
          <button type="button" class="seg-btn ${trendMonths === 12 ? 'active' : ''}" id="btn-trend-12m">12M</button>
        </div>
      `;
      chartSubRowEl.innerHTML = `<span>Last ${trendMonths} calendar months</span><span>${formatFullSavedTime(totalWindowSec)} window total</span>`;

      currentBarMetaList = series.map((m) => {
        const deltaText = m.deltaPercent !== null ? ` (${m.deltaPercent >= 0 ? '+' : ''}${m.deltaPercent}% vs prev mo)` : '';
        return {
          footerText: `${m.fullLabel} — ${formatFullSavedTime(m.seconds)} across ${m.activeDays} days${deltaText} · Click for 4-week view`,
          onClick: () => {
            endWeekOffset = getEndWeekOffsetForMonth(m.monthKey, now);
            drillMonthLabel = m.fullLabel;
            drillWeekLabel = null;
            chartView = 'four_week';
            renderChartStage();
          },
        };
      });

      chartBodyEl.innerHTML = `
        <div class="bar-plot" style="grid-template-columns: repeat(${series.length}, minmax(0, 1fr));">
          ${series.map((m, idx) => {
            const pct = m.seconds > 0 ? Math.max(8, Math.round((m.seconds / maxSec) * 100)) : 4;
            const isCurr = idx === series.length - 1;
            const fillColor = isCurr
              ? 'rgba(251, 191, 36, 0.92)'
              : m.seconds > 0
                ? 'rgba(251, 191, 36, 0.62)'
                : 'rgba(51, 65, 85, 0.65)';
            return `
              <button type="button" class="bar-col ${isCurr ? 'is-current-amber' : ''}" data-bar-index="${idx}" aria-label="${m.fullLabel}: ${formatCompactSavedTime(m.seconds)}">
                <span class="bar-top-val">${m.seconds > 0 ? formatCompactSavedTime(m.seconds) : '—'}</span>
                <span class="bar-track"><span class="bar-fill" style="height:${pct}%;background:${fillColor};"></span></span>
                <span class="bar-axis">
                  <span class="bar-axis-main">${m.shortLabel}</span>
                </span>
              </button>
            `;
          }).join('')}
        </div>
      `;

      chartFooterEl.innerHTML = `
        <span id="chart-footer-inspect" class="chart-footer-muted">Click any month bar to open its 4-week breakdown</span>
        <span class="chart-footer-stats">${trendMonths}-month total: <strong>${formatFullSavedTime(totalWindowSec)}</strong></span>
      `;
      bindBarHoverHandlers('Click any month bar to open its 4-week breakdown');

      const btn6 = document.getElementById('btn-trend-6m');
      const btn12 = document.getElementById('btn-trend-12m');
      if (btn6) btn6.addEventListener('click', () => { trendMonths = 6; renderChartStage(); });
      if (btn12) btn12.addEventListener('click', () => { trendMonths = 12; renderChartStage(); });
    } else {
      // Consistency: 12-week Heatmap + 90-day Weekday Pace
      const heatmap = getActivityHeatmapGrid(12, now);
      const rhythm = getDayOfWeekRhythm(90, now);
      const maxRhythmAvg = Math.max(1, ...rhythm.map((d) => d.avgSec));
      const peakRhythmDay = rhythm.reduce((best, cur) => (cur.avgSec > best.avgSec ? cur : best), rhythm[0]);

      chartControlsRightEl.innerHTML = `
        <span class="legend-scale">
          <span>Less</span>
          <span class="legend-box" style="background:#111827;"></span>
          <span class="legend-box" style="background:rgba(6,78,59,0.8);"></span>
          <span class="legend-box" style="background:rgba(4,120,87,0.85);"></span>
          <span class="legend-box" style="background:rgba(16,185,129,0.88);"></span>
          <span class="legend-box" style="background:#34d399;"></span>
          <span>More</span>
        </span>
      `;
      chartSubRowEl.innerHTML = `
        <span>12-week daily heatmap (Mon–Sun rows) + 90-day weekday averages</span>
        <span>Current streak: ${heatmap.currentStreakDays}d · Longest: ${heatmap.longestStreakDays}d</span>
      `;

      heatmapMetaMap = {};
      for (let w = 0; w < heatmap.weeks.length; w++) {
        for (let r = 0; r < 7; r++) {
          const cell = heatmap.weeks[w][r];
          heatmapMetaMap[cell.dateKey] = cell;
        }
      }

      const monthRowHtml = `
        <div class="heatmap-months">
          <span></span>
          ${heatmap.weekMonthLabels.map((lbl) => `<span>${lbl}</span>`).join('')}
        </div>
      `;

      const rowIndices = [0, 1, 2, 3, 4, 5, 6];
      const heatRowsHtml = rowIndices.map((r) => `
        <div class="heatmap-row">
          <span class="heatmap-day-label">${r % 2 === 0 ? WEEKDAY_MON_FIRST[r] : ''}</span>
          ${heatmap.weeks.map((weekCol) => {
            const c = weekCol[r];
            const classes = [
              'heat-cell',
              c.isFuture ? 'is-future' : `lvl-${c.level}`,
              c.isToday ? 'is-today' : '',
            ].filter(Boolean).join(' ');
            return `<button type="button" class="${classes}" data-heat-key="${c.dateKey}" aria-label="${c.label}: ${formatCompactSavedTime(c.seconds)}"></button>`;
          }).join('')}
        </div>
      `).join('');

      const rhythmHtml = rhythm.map((d) => {
        const pct = d.avgSec > 0 ? Math.max(4, Math.round((d.avgSec / maxRhythmAvg) * 100)) : 0;
        const isTop = d.dayIndex === peakRhythmDay.dayIndex && d.avgSec > 0;
        return `
          <div class="rhythm-row" data-rhythm-day="${d.dayIndex}">
            <span class="rhythm-day">${d.label}</span>
            <div class="rhythm-bar-bg"><div class="rhythm-bar-fill ${isTop ? 'is-top' : ''}" style="width:${pct}%;"></div></div>
            <span class="rhythm-val">${formatCompactSavedTime(d.avgSec)} / day</span>
          </div>
        `;
      }).join('');

      chartBodyEl.innerHTML = `
        <div class="consistency-grid">
          <div class="heatmap-wrap">
            <div class="heatmap-inner">
              ${monthRowHtml}
              ${heatRowsHtml}
            </div>
          </div>
          <div class="rhythm-panel">
            <div class="rhythm-heading">
              <span>90-Day Weekday Averages</span>
              <span>Peak: <strong style="color:#34d399;">${peakRhythmDay.avgSec > 0 ? peakRhythmDay.label : '—'}</strong></span>
            </div>
            ${rhythmHtml}
          </div>
        </div>
      `;

      chartFooterEl.innerHTML = `
        <span id="chart-footer-inspect" class="chart-footer-muted">Hover any day square for date total · Hover weekday rows to compare</span>
        <span class="chart-footer-stats">${heatmap.bestDay ? `Best day: <strong>${heatmap.bestDay.label}</strong> (${formatCompactSavedTime(heatmap.bestDay.seconds)})` : 'No active days yet'}</span>
      `;

      const inspectEl = chartFooterEl.querySelector('#chart-footer-inspect');
      chartBodyEl.querySelectorAll('button[data-heat-key]').forEach((btn) => {
        btn.addEventListener('mouseenter', () => {
          const k = btn.getAttribute('data-heat-key');
          const cell = heatmapMetaMap[k];
          if (!cell || !inspectEl) return;
          hoveredHeatDateKey = k;
          const d = parseLocalDateKey(k);
          const dow = getMondayBasedDayIndex(d);
          chartBodyEl.querySelectorAll('.rhythm-row').forEach((rEl) => {
            rEl.classList.toggle('is-hovered', Number(rEl.getAttribute('data-rhythm-day')) === dow);
          });
          inspectEl.className = 'chart-footer-inspect';
          inspectEl.textContent = cell.isFuture
            ? `${cell.label} — Upcoming`
            : `${cell.label} — ${formatFullSavedTime(cell.seconds)} saved${cell.isToday ? ' · Today' : ''}`;
        });
        btn.addEventListener('mouseleave', () => {
          hoveredHeatDateKey = null;
          chartBodyEl.querySelectorAll('.rhythm-row.is-hovered').forEach((rEl) => rEl.classList.remove('is-hovered'));
          if (inspectEl) {
            inspectEl.className = 'chart-footer-muted';
            inspectEl.textContent = 'Hover any day square for date total · Hover weekday rows to compare';
          }
        });
      });
    }
  }

  function renderTimeSavedAnalytics() {
    const now = new Date();
    const popupMode = settings.popupTimeSavedDisplay || 'daily';
    const barMode = settings.barTimeSavedDisplay || 'daily';
    const todaySec = getTodaySavedSec(now);
    const attributedTotalSec = sumSavedTimeMap(savedTimeByDay);
    const unattributedPriorSec = Math.max(0, totalTimeSavedSec - attributedTotalSec);

    if (popupModeControlsEl) {
      popupModeControlsEl.querySelectorAll('button[data-popup-mode]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-popup-mode') === popupMode);
      });
    }
    if (barModeControlsEl) {
      barModeControlsEl.querySelectorAll('button[data-bar-mode]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-bar-mode') === barMode);
      });
    }
    if (previewPopupEl) {
      previewPopupEl.innerHTML =
        popupMode === 'off'
          ? 'Hidden'
          : popupMode === 'total'
            ? `Bottom-right: <strong>Saved ${formatCompactSavedTime(totalTimeSavedSec)}</strong>`
            : `Bottom-right: <strong>Saved ${formatCompactSavedTime(todaySec)} today</strong>`;
    }
    if (previewBarEl) {
      previewBarEl.innerHTML =
        barMode === 'off'
          ? 'Hidden'
          : barMode === 'total'
            ? `Before Rule: <strong>Saved ${formatCompactSavedTime(totalTimeSavedSec)}</strong>`
            : `Before Rule: <strong>Saved ${formatCompactSavedTime(todaySec)} today</strong>`;
    }

    const heatmap = getActivityHeatmapGrid(12, now);
    const currentWeek = getWeekDailySeries(0, now);
    const currentMonth = getCurrentMonthKpiSummary(now);
    const bytes = estimateStorageBytes(savedTimeByDay);
    const kb = Math.max(0.1, bytes / 1024).toFixed(1);

    if (statSavedValueEl) statSavedValueEl.textContent = formatFullSavedTime(totalTimeSavedSec);
    if (statSinceLineEl) statSinceLineEl.textContent = `Since ${getTrackingStartDateFormatted()}`;
    if (statStoreLineEl) statStoreLineEl.textContent = `${heatmap.totalActiveDays} tracked days - ${kb} KB local store`;
    if (statLegacyLineEl) {
      if (unattributedPriorSec > 0) {
        statLegacyLineEl.style.display = 'block';
        statLegacyLineEl.textContent = `Includes ${formatCompactSavedTime(unattributedPriorSec)} recorded prior to daily tracking.`;
      } else {
        statLegacyLineEl.style.display = 'none';
      }
    }

    if (kpiTodayValEl) kpiTodayValEl.textContent = formatCompactSavedTime(todaySec);
    if (kpiTodaySubEl) {
      const m = now.getMonth();
      const d = now.getDate();
      kpiTodaySubEl.textContent = todaySec > 0 ? `${MONTH_SHORT[m]} ${d} · Active` : `${MONTH_SHORT[m]} ${d}`;
    }
    if (kpiWeekValEl) kpiWeekValEl.textContent = formatCompactSavedTime(currentWeek.totalSec);
    if (kpiWeekSubEl) kpiWeekSubEl.textContent = `Avg ${formatCompactSavedTime(currentWeek.dailyAvgSec)} / day`;
    if (kpiMonthValEl) kpiMonthValEl.textContent = formatCompactSavedTime(currentMonth.totalSec);
    if (kpiMonthSubEl) kpiMonthSubEl.textContent = `${currentMonth.activeDays} active ${currentMonth.activeDays === 1 ? 'day' : 'days'}`;
    if (kpiStreakValEl) kpiStreakValEl.textContent = `${heatmap.currentStreakDays}d`;
    if (kpiStreakSubEl) {
      kpiStreakSubEl.textContent = heatmap.bestDay
        ? `Best: ${formatCompactSavedTime(heatmap.bestDay.seconds)} (${heatmap.bestDay.label})`
        : 'Longest: 0d';
    }

    renderChartStage();
    renderCollapsedSummaries();
  }

  if (selectChartViewEl) {
    selectChartViewEl.addEventListener('change', () => {
      chartView = selectChartViewEl.value;
      drillMonthLabel = null;
      drillWeekLabel = null;
      renderChartStage();
    });
  }

  btnOpenResetEl.addEventListener('click', () => {
    resetConfirmBoxEl.classList.add('visible');
    inputConfirmForgetEl.value = '';
    btnConfirmForgetEl.disabled = true;
    inputConfirmForgetEl.focus();
  });

  btnCancelForgetEl.addEventListener('click', () => {
    resetConfirmBoxEl.classList.remove('visible');
    inputConfirmForgetEl.value = '';
    btnConfirmForgetEl.disabled = true;
  });

  inputConfirmForgetEl.addEventListener('input', () => {
    btnConfirmForgetEl.disabled = inputConfirmForgetEl.value.trim() !== 'Forget Time Saved';
  });

  btnConfirmForgetEl.addEventListener('click', async () => {
    if (inputConfirmForgetEl.value.trim() !== 'Forget Time Saved') return;
    totalTimeSavedSec = 0;
    savedTimeByDay = {};
    timeSavedSince = Date.now();
    await chrome.storage.local.set({ totalTimeSavedSec: 0, savedTimeByDay: {}, timeSavedSince });
    if (chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      chrome.runtime.sendMessage({ type: 'CADENCE_RESET_TIME_SAVED', timeSavedSince }, () => {});
    }
    renderTimeSavedAnalytics();
    resetConfirmBoxEl.classList.remove('visible');
    inputConfirmForgetEl.value = '';
    btnConfirmForgetEl.disabled = true;
    showStatus(`Lifetime and daily time saved history reset to 0s (since ${getTrackingStartDateFormatted()}).`);
  });

  function syncPresetSelectLabels() {
    if (!presetSelectEl) return;
    const musicSpd = (presets.find((p) => p.id === 'music') || { speed: 1.0 }).speed;
    const eduSpd = (presets.find((p) => p.id === 'educational') || { speed: 1.5 }).speed;
    const podSpd = (presets.find((p) => p.id === 'podcast') || { speed: 2.0 }).speed;
    const opts = presetSelectEl.options;
    if (opts[0]) opts[0].textContent = `Music (${formatSpeed(musicSpd)}×)`;
    if (opts[1]) opts[1].textContent = `Educational (${formatSpeed(eduSpd)}×)`;
    if (opts[2]) opts[2].textContent = `Podcast / Lecture (${formatSpeed(podSpd)}×)`;
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
        (p) => `
      <div class="preset-row">
        <div>
          <strong>${p.label}</strong>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${p.description}</div>
        </div>
        <input type="number" step="0.05" min="0.25" max="4" value="${p.speed}" data-preset-id="${p.id}" style="width:92px;" />
      </div>
    `
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
        renderCollapsedSummaries();
      });
    });
    renderCollapsedSummaries();
  }

  function resolveSpeed(rule) {
    if (rule.presetId === 'custom') return rule.customSpeed;
    const found = presets.find((p) => p.id === rule.presetId);
    return found ? found.speed : rule.customSpeed;
  }

  function getFilteredAndSortedRules() {
    let list = [...rules];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          (r.channelName && r.channelName.toLowerCase().includes(q)) ||
          (r.handle && r.handle.toLowerCase().includes(q))
      );
    }
    if (filterCategory !== 'all') {
      list = list.filter((r) => r.presetId === filterCategory);
    }
    if (sortBy === 'name') {
      list.sort((a, b) => a.channelName.localeCompare(b.channelName));
    } else if (sortBy === 'speed') {
      list.sort((a, b) => resolveSpeed(b) - resolveSpeed(a));
    } else {
      list.sort((a, b) => {
        const da = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const db = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return db - da;
      });
    }
    return list;
  }

  function renderRules() {
    if (rulesCountEl) {
      rulesCountEl.textContent = manifestVersion
        ? `${rules.length} saved · v${manifestVersion}`
        : `${rules.length} saved`;
    }

    const filtered = getFilteredAndSortedRules();
    const totalCount = filtered.length;

    const limit = pageSize === -1 ? totalCount : pageSize;
    const totalPages = limit > 0 ? Math.max(1, Math.ceil(totalCount / limit)) : 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = limit > 0 ? (currentPage - 1) * limit : 0;
    const endIdx = limit > 0 ? Math.min(startIdx + limit, totalCount) : totalCount;
    const visibleRules = filtered.slice(startIdx, endIdx);

    if (rulesRangeEl) {
      if (totalCount === 0) {
        rulesRangeEl.textContent = 'Showing 0–0 of 0 rules';
      } else {
        rulesRangeEl.textContent = `Showing ${startIdx + 1}–${endIdx} of ${totalCount} ${totalCount === 1 ? 'rule' : 'rules'}${rules.length !== totalCount ? ` (${rules.length} total)` : ''}`;
      }
    }

    if (visibleRules.length === 0) {
      if (rules.length === 0) {
        rulesEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:12px 0;">No channel rules saved yet. Add a channel above or import a JSON backup.</p>';
      } else {
        rulesEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:12px 0;">No channel rules match your search or filter.</p>';
      }
    } else {
      rulesEl.innerHTML = visibleRules
        .map(
          (r) => `
        <div class="rule-row">
          <div>
            <strong>${r.channelName}</strong>
            <span style="font-size:12px;color:#94a3b8;margin-left:6px;">${r.handle || ''} · ${r.presetId}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <strong style="font-variant-numeric:tabular-nums;">${formatSpeed(resolveSpeed(r))}×</strong>
            <button type="button" class="row-remove" data-del-id="${r.id}">Remove</button>
          </div>
        </div>
      `
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

    if (pageButtonsEl) {
      if (totalPages <= 1 || pageSize === -1) {
        pageButtonsEl.innerHTML = '';
      } else {
        let btns = '';
        btns += `<button type="button" class="page-btn" id="btn-prev-page" ${currentPage === 1 ? 'disabled' : ''}>Prev</button>`;
        for (let p = 1; p <= totalPages; p++) {
          btns += `<button type="button" class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
        }
        btns += `<button type="button" class="page-btn" id="btn-next-page" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
        pageButtonsEl.innerHTML = btns;

        const prevBtn = pageButtonsEl.querySelector('#btn-prev-page');
        if (prevBtn) {
          prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
              currentPage--;
              renderRules();
            }
          });
        }
        const nextBtn = pageButtonsEl.querySelector('#btn-next-page');
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
              currentPage++;
              renderRules();
            }
          });
        }
        pageButtonsEl.querySelectorAll('button[data-page]').forEach((b) => {
          b.addEventListener('click', () => {
            currentPage = Number(b.getAttribute('data-page')) || 1;
            renderRules();
          });
        });
      }
    }
    renderCollapsedSummaries();
  }

  if (searchInputEl) {
    searchInputEl.addEventListener('input', () => {
      searchQuery = searchInputEl.value;
      currentPage = 1;
      renderRules();
    });
  }

  if (categoryPillsEl) {
    categoryPillsEl.querySelectorAll('button[data-category]').forEach((btn) => {
      btn.addEventListener('click', () => {
        categoryPillsEl.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        filterCategory = btn.getAttribute('data-category') || 'all';
        currentPage = 1;
        renderRules();
      });
    });
  }

  if (sortSelectEl) {
    sortSelectEl.addEventListener('change', () => {
      sortBy = sortSelectEl.value;
      renderRules();
    });
  }

  if (pageSizeSelectEl) {
    pageSizeSelectEl.addEventListener('change', () => {
      const val = pageSizeSelectEl.value;
      pageSize = val === 'all' ? -1 : Number(val) || 10;
      currentPage = 1;
      renderRules();
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
    const payload = JSON.stringify(
      {
        version: manifestVersion || '1.7.1',
        exportedAt: new Date().toISOString(),
        totalTimeSavedSec,
        timeSavedSince,
        savedTimeByDay,
        settings,
        presets,
        rules
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence-backup-v${manifestVersion || '1.7.1'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    showStatus(`Exported ${rules.length} channel ${rules.length === 1 ? 'rule' : 'rules'} to backup JSON`);
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

      if (parsed && typeof parsed.settings === 'object') {
        settings = normalizeOptionsSettings(Object.assign({}, settings, parsed.settings));
        renderToggles();
      }

      if (parsed && typeof parsed.savedTimeByDay === 'object' && parsed.savedTimeByDay !== null && !Array.isArray(parsed.savedTimeByDay)) {
        savedTimeByDay = sanitizeSavedTimeByDay(parsed.savedTimeByDay);
        const daySum = sumSavedTimeMap(savedTimeByDay);
        const incomingTotal =
          typeof parsed.totalTimeSavedSec === 'number' && parsed.totalTimeSavedSec >= 0
            ? Math.floor(parsed.totalTimeSavedSec)
            : daySum;
        totalTimeSavedSec = Math.max(incomingTotal, daySum);
      } else if (parsed && typeof parsed.totalTimeSavedSec === 'number' && parsed.totalTimeSavedSec >= 0) {
        totalTimeSavedSec = Math.floor(parsed.totalTimeSavedSec);
        savedTimeByDay = {};
      }

      if (
        parsed &&
        typeof parsed.timeSavedSince === 'number' &&
        Number.isFinite(parsed.timeSavedSince) &&
        parsed.timeSavedSince > 0
      ) {
        timeSavedSince = Math.floor(parsed.timeSavedSince);
      }

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
            id: typeof item.id === 'string' && item.id ? item.id : `imported-${Date.now()}-${idx}`,
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
      }

      await chrome.storage.local.set({ settings, presets, rules, totalTimeSavedSec, savedTimeByDay, timeSavedSince });
      renderToggles();
      renderTimeSavedAnalytics();
      renderPresets();
      renderRules();
      showStatus(`Imported backup (${rules.length} total channel rules, ${formatFullSavedTime(totalTimeSavedSec)} time saved)`);
    } catch (_) {
      showStatus('Could not parse JSON file. Please select a valid Cadence JSON backup.');
    } finally {
      importInputEl.value = '';
    }
  });

  resetBtnEl.addEventListener('click', async () => {
    presets = DEFAULT_PRESETS.map((p) => ({ ...p }));
    await chrome.storage.local.set({ presets });
    renderPresets();
    renderRules();
    showStatus('Reset category speed profiles to default 1.0× / 1.5× / 2.0×.');
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
    showStatus(`Saved ${channelName} (${formatSpeed(resolveSpeed(newRule))}×)`);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let shouldRenderSaved = false;
    if (changes.settings && typeof changes.settings.newValue === 'object') {
      settings = normalizeOptionsSettings(changes.settings.newValue);
      renderToggles();
      shouldRenderSaved = true;
    }
    if (changes.totalTimeSavedSec && typeof changes.totalTimeSavedSec.newValue === 'number') {
      totalTimeSavedSec = Math.max(0, Math.floor(changes.totalTimeSavedSec.newValue));
      shouldRenderSaved = true;
    }
    if (changes.savedTimeByDay && typeof changes.savedTimeByDay.newValue === 'object') {
      savedTimeByDay = sanitizeSavedTimeByDay(changes.savedTimeByDay.newValue);
      shouldRenderSaved = true;
    }
    if (
      changes.timeSavedSince &&
      typeof changes.timeSavedSince.newValue === 'number' &&
      changes.timeSavedSince.newValue > 0
    ) {
      timeSavedSince = changes.timeSavedSince.newValue;
      shouldRenderSaved = true;
    }
    if (shouldRenderSaved) {
      renderTimeSavedAnalytics();
    }
    if (changes.presets && Array.isArray(changes.presets.newValue)) {
      presets = changes.presets.newValue;
      renderPresets();
    }
    if (changes.rules && Array.isArray(changes.rules.newValue)) {
      rules = changes.rules.newValue;
      renderRules();
    }
  });

  renderToggles();
  renderTimeSavedAnalytics();
  renderPresets();
  renderRules();
})();
