import { SavedTimeByDay } from '../types/extension';

export interface DailySeriesPoint {
  dateKey: string;
  dayShort: string;
  dateLabel: string;
  fullDateLabel: string;
  seconds: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface WeekDailySummary {
  points: DailySeriesPoint[];
  rangeLabel: string;
  totalSec: number;
  dailyAvgSec: number;
  activeDays: number;
  isCurrentWeek: boolean;
}

export interface MonthlyWeekPoint {
  weekIndex: number;
  label: string;
  rangeLabel: string;
  seconds: number;
  activeDays: number;
  daysInSlice: number;
  weekOffsetFromCurrent?: number;
  isCurrentWeek?: boolean;
}

export interface MonthWeeklySummary {
  points: MonthlyWeekPoint[];
  monthLabel: string;
  totalSec: number;
  weeklyAvgSec: number;
  activeDays: number;
  isCurrentMonth: boolean;
}

export interface MultiMonthPoint {
  monthKey: string;
  shortLabel: string;
  fullLabel: string;
  seconds: number;
  activeDays: number;
  deltaPercent: number | null;
}

export interface DayOfWeekAverage {
  dayIndex: number; // 0 = Mon .. 6 = Sun
  label: string;
  avgSec: number;
  totalSec: number;
}

export interface HeatmapCell {
  dateKey: string;
  label: string;
  seconds: number;
  level: 0 | 1 | 2 | 3 | 4;
  isToday: boolean;
  isFuture: boolean;
}

export interface ActivityHeatmapSummary {
  weeks: HeatmapCell[][];
  weekMonthLabels: string[];
  currentStreakDays: number;
  longestStreakDays: number;
  bestDay: { dateKey: string; label: string; seconds: number } | null;
  totalActiveDays: number;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseLocalDateKey(key: string): Date {
  const parts = key.split('-').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return new Date();
  }
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
}

export function atLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0);
}

/** 0 = Mon, 6 = Sun */
export function getMondayBasedDayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function getStartOfMondayWeek(date: Date): Date {
  return addLocalDays(atLocalMidnight(date), -getMondayBasedDayIndex(date));
}

/** DST-safe difference in calendar days (dateB - dateA) */
export function diffLocalCalendarDays(dateA: Date, dateB: Date): number {
  const utcA = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const utcB = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

/** DST-safe difference in Monday-aligned weeks (mondayB - mondayA) */
export function diffLocalCalendarWeeks(mondayA: Date, mondayB: Date): number {
  return Math.round(diffLocalCalendarDays(mondayA, mondayB) / 7);
}

export function addSavedTimeDeltaToDayMap(
  byDay: SavedTimeByDay,
  deltaSec: number,
  now: Date = new Date()
): SavedTimeByDay {
  const cleanDelta = Math.max(0, Math.floor(deltaSec));
  if (cleanDelta <= 0) return byDay;
  const key = formatLocalDateKey(now);
  const current = Math.max(0, Math.floor(Number(byDay[key]) || 0));
  return {
    ...byDay,
    [key]: current + cleanDelta,
  };
}

export function sumSavedTimeMap(byDay: SavedTimeByDay): number {
  let sum = 0;
  for (const val of Object.values(byDay)) {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) {
      sum += Math.floor(n);
    }
  }
  return sum;
}

export function getTodaySavedSec(byDay: SavedTimeByDay, now: Date = new Date()): number {
  const key = formatLocalDateKey(now);
  return Math.max(0, Math.floor(Number(byDay[key]) || 0));
}

export function getWeekDailySeries(
  byDay: SavedTimeByDay,
  weekOffset: number = 0,
  now: Date = new Date()
): WeekDailySummary {
  const todayMid = atLocalMidnight(now);
  const todayKey = formatLocalDateKey(todayMid);
  const currentWeekStart = getStartOfMondayWeek(todayMid);
  const weekStart = addLocalDays(currentWeekStart, weekOffset * 7);
  const weekEnd = addLocalDays(weekStart, 6);

  const points: DailySeriesPoint[] = [];
  let totalSec = 0;
  let elapsedDaysInWeek = 0;
  let activeDays = 0;

  for (let i = 0; i < 7; i++) {
    const d = addLocalDays(weekStart, i);
    const key = formatLocalDateKey(d);
    const isFuture = d.getTime() > todayMid.getTime();
    const sec = isFuture ? 0 : Math.max(0, Math.floor(Number(byDay[key]) || 0));
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
    isCurrentWeek: weekOffset === 0,
  };
}

export function getMonthWeeklySeries(
  byDay: SavedTimeByDay,
  monthOffset: number = 0,
  now: Date = new Date()
): MonthWeeklySummary {
  const todayMid = atLocalMidnight(now);
  const targetMonthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 0, 0, 0, 0);
  const year = targetMonthStart.getFullYear();
  const month = targetMonthStart.getMonth();
  const targetMonthEnd = new Date(year, month + 1, 0, 0, 0, 0, 0);
  const daysInMonth = targetMonthEnd.getDate();

  const points: MonthlyWeekPoint[] = [];
  let cursorDay = 1;
  let weekIdx = 1;
  let totalSec = 0;
  let totalActiveDays = 0;

  while (cursorDay <= daysInMonth) {
    const sliceStart = new Date(year, month, cursorDay, 0, 0, 0, 0);
    const dayOfWeekMon = getMondayBasedDayIndex(sliceStart); // 0..6
    const daysUntilSunday = 6 - dayOfWeekMon;
    const endDay = Math.min(daysInMonth, cursorDay + daysUntilSunday);

    let weekSec = 0;
    let weekActive = 0;
    for (let day = cursorDay; day <= endDay; day++) {
      const d = new Date(year, month, day, 0, 0, 0, 0);
      if (d.getTime() <= todayMid.getTime()) {
        const key = formatLocalDateKey(d);
        const sec = Math.max(0, Math.floor(Number(byDay[key]) || 0));
        weekSec += sec;
        if (sec > 0) weekActive += 1;
      }
    }

    const rangeLabel =
      cursorDay === endDay
        ? `${MONTH_SHORT[month]} ${cursorDay}`
        : `${MONTH_SHORT[month]} ${cursorDay}–${endDay}`;

    points.push({
      weekIndex: weekIdx,
      label: `Wk ${weekIdx}`,
      rangeLabel,
      seconds: weekSec,
      activeDays: weekActive,
      daysInSlice: endDay - cursorDay + 1,
    });

    totalSec += weekSec;
    totalActiveDays += weekActive;
    cursorDay = endDay + 1;
    weekIdx += 1;
  }

  const elapsedWeeks = points.filter((wk, idx) => {
    if (monthOffset < 0) return true;
    if (monthOffset > 0) return false;
    // Current month: check if slice start <= today
    const firstDayNum = idx === 0 ? 1 : Number(wk.rangeLabel.split(' ')[1].split('–')[0]) || 1;
    return firstDayNum <= todayMid.getDate();
  }).length;

  return {
    points,
    monthLabel: `${targetMonthStart.toLocaleString('en-US', { month: 'long' })} ${year}`,
    totalSec,
    weeklyAvgSec: elapsedWeeks > 0 ? Math.round(totalSec / elapsedWeeks) : 0,
    activeDays: totalActiveDays,
    isCurrentMonth: monthOffset === 0,
  };
}

/**
 * Rolling 4-week lookback (4 equal 7-day blocks).
 * periodOffset = 0 ends on today (4th week ends today); -1 shifts back 28 days.
 */
export function getRollingFourWeekSeries(
  byDay: SavedTimeByDay,
  periodOffset: number = 0,
  now: Date = new Date()
): MonthWeeklySummary {
  const todayMid = atLocalMidnight(now);
  const windowEnd = addLocalDays(todayMid, periodOffset * 28);
  const windowStart = addLocalDays(windowEnd, -27);

  const points: MonthlyWeekPoint[] = [];
  let totalSec = 0;
  let totalActiveDays = 0;

  for (let w = 0; w < 4; w++) {
    const start = addLocalDays(windowStart, w * 7);
    const end = addLocalDays(start, 6);

    let weekSec = 0;
    let weekActive = 0;
    for (let dOffset = 0; dOffset < 7; dOffset++) {
      const d = addLocalDays(start, dOffset);
      if (d.getTime() <= todayMid.getTime()) {
        const key = formatLocalDateKey(d);
        const sec = Math.max(0, Math.floor(Number(byDay[key]) || 0));
        weekSec += sec;
        if (sec > 0) weekActive += 1;
      }
    }

    const rangeLabel =
      start.getMonth() === end.getMonth()
        ? `${MONTH_SHORT[start.getMonth()]} ${start.getDate()}–${end.getDate()}`
        : `${MONTH_SHORT[start.getMonth()]} ${start.getDate()}–${MONTH_SHORT[end.getMonth()]} ${end.getDate()}`;

    points.push({
      weekIndex: w + 1,
      label: `Wk ${w + 1}`,
      rangeLabel,
      seconds: weekSec,
      activeDays: weekActive,
      daysInSlice: 7,
      isCurrentWeek: periodOffset === 0 && w === 3,
    });

    totalSec += weekSec;
    totalActiveDays += weekActive;
  }

  const startStr = `${MONTH_SHORT[windowStart.getMonth()]} ${windowStart.getDate()}`;
  const endStr = `${MONTH_SHORT[windowEnd.getMonth()]} ${windowEnd.getDate()}, ${windowEnd.getFullYear()}`;

  return {
    points,
    monthLabel: `${startStr} – ${endStr}`,
    totalSec,
    weeklyAvgSec: Math.round(totalSec / 4),
    activeDays: totalActiveDays,
    isCurrentMonth: periodOffset === 0,
  };
}

/**
 * Alignment 1: 4 consecutive Mon–Sun calendar weeks ending at (currentWeekStart + endWeekOffset * 7).
 * Clicking any bar jumps directly to Weekly Breakdown via weekOffsetFromCurrent with 1:1 matching sums.
 */
export function getAlignedFourWeekSeries(
  byDay: SavedTimeByDay,
  endWeekOffset: number = 0,
  now: Date = new Date()
): MonthWeeklySummary {
  const todayMid = atLocalMidnight(now);
  const currentWeekStart = getStartOfMondayWeek(todayMid);

  const points: MonthlyWeekPoint[] = [];
  let totalSec = 0;
  let totalActiveDays = 0;

  for (let i = 0; i < 4; i++) {
    const offset = endWeekOffset - (3 - i);
    const start = addLocalDays(currentWeekStart, offset * 7);
    const end = addLocalDays(start, 6);

    let weekSec = 0;
    let weekActive = 0;
    for (let dOffset = 0; dOffset < 7; dOffset++) {
      const d = addLocalDays(start, dOffset);
      if (d.getTime() <= todayMid.getTime()) {
        const key = formatLocalDateKey(d);
        const sec = Math.max(0, Math.floor(Number(byDay[key]) || 0));
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
      daysInSlice: 7,
      weekOffsetFromCurrent: offset,
      isCurrentWeek: offset === 0,
    });

    totalSec += weekSec;
    totalActiveDays += weekActive;
  }

  const windowStart = addLocalDays(currentWeekStart, (endWeekOffset - 3) * 7);
  const windowEnd = addLocalDays(currentWeekStart, endWeekOffset * 7 + 6);
  const startStr = `${MONTH_SHORT[windowStart.getMonth()]} ${windowStart.getDate()}`;
  const endStr = `${MONTH_SHORT[windowEnd.getMonth()]} ${windowEnd.getDate()}, ${windowEnd.getFullYear()}`;

  return {
    points,
    monthLabel: `${startStr} – ${endStr}`,
    totalSec,
    weeklyAvgSec: Math.round(totalSec / 4),
    activeDays: totalActiveDays,
    isCurrentMonth: endWeekOffset === 0,
  };
}

/**
 * Resolves the Mon–Sun endWeekOffset for clicking a month ("YYYY-MM") in Monthly Trend.
 * Current month snaps to 0 (ending this Mon–Sun week); past months snap to the week containing month-end.
 */
export function getEndWeekOffsetForMonth(
  monthKey: string,
  now: Date = new Date()
): number {
  const [yStr, mStr] = monthKey.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1;
  if (Number.isNaN(y) || Number.isNaN(m)) return 0;

  if (y === now.getFullYear() && m === now.getMonth()) {
    return 0;
  }

  const currentWeekStart = getStartOfMondayWeek(atLocalMidnight(now));
  const lastDayOfTargetMonth = new Date(y, m + 1, 0, 0, 0, 0, 0);
  const targetWeekStart = getStartOfMondayWeek(lastDayOfTargetMonth);
  return Math.min(0, diffLocalCalendarWeeks(currentWeekStart, targetWeekStart));
}

export function getMultiMonthSeries(
  byDay: SavedTimeByDay,
  monthCount: number = 6,
  now: Date = new Date()
): MultiMonthPoint[] {
  const safeCount = Math.max(1, monthCount);
  const raw: Omit<MultiMonthPoint, 'deltaPercent'>[] = [];

  for (let offset = -(safeCount - 1); offset <= 0; offset++) {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1, 0, 0, 0, 0);
    const y = start.getFullYear();
    const m = start.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    let secTotal = 0;
    let activeDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const sec = Math.max(0, Math.floor(Number(byDay[key]) || 0));
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
    const pct = Math.round(((item.seconds - prev) / prev) * 100);
    return { ...item, deltaPercent: pct };
  });
}

export function getDayOfWeekRhythm(
  byDay: SavedTimeByDay,
  lookbackDays: number = 90,
  now: Date = new Date()
): DayOfWeekAverage[] {
  const todayMid = atLocalMidnight(now);
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);

  for (let offset = 0; offset < lookbackDays; offset++) {
    const d = addLocalDays(todayMid, -offset);
    const key = formatLocalDateKey(d);
    const idx = getMondayBasedDayIndex(d);
    sums[idx] += Math.max(0, Math.floor(Number(byDay[key]) || 0));
    counts[idx] += 1;
  }

  return WEEKDAY_MON_FIRST.map((label, dayIndex) => ({
    dayIndex,
    label,
    totalSec: sums[dayIndex],
    avgSec: counts[dayIndex] > 0 ? Math.round(sums[dayIndex] / counts[dayIndex]) : 0,
  }));
}

export function getActivityHeatmapGrid(
  byDay: SavedTimeByDay,
  numWeeks: number = 12,
  now: Date = new Date()
): ActivityHeatmapSummary {
  const todayMid = atLocalMidnight(now);
  const todayKey = formatLocalDateKey(todayMid);
  const currentWeekStart = getStartOfMondayWeek(todayMid);
  const gridStart = addLocalDays(currentWeekStart, -(numWeeks - 1) * 7);

  let maxDaySec = 0;
  for (let w = 0; w < numWeeks; w++) {
    for (let r = 0; r < 7; r++) {
      const d = addLocalDays(gridStart, w * 7 + r);
      if (d.getTime() > todayMid.getTime()) continue;
      const sec = Math.max(0, Math.floor(Number(byDay[formatLocalDateKey(d)]) || 0));
      if (sec > maxDaySec) maxDaySec = sec;
    }
  }

  const weeks: HeatmapCell[][] = [];
  const weekMonthLabels: string[] = [];
  let prevLabeledMonth = -1;

  for (let w = 0; w < numWeeks; w++) {
    const col: HeatmapCell[] = [];
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
      const sec = isFuture ? 0 : Math.max(0, Math.floor(Number(byDay[key]) || 0));
      let level: 0 | 1 | 2 | 3 | 4 = 0;
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

  // Compute streaks & best day across entire map
  const allEntries = Object.entries(byDay)
    .map(([dateKey, val]) => ({ dateKey, seconds: Math.max(0, Math.floor(Number(val) || 0)) }))
    .filter((entry) => entry.seconds > 0)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  let bestDay: { dateKey: string; label: string; seconds: number } | null = null;
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
    const sec = Math.max(0, Math.floor(Number(byDay[formatLocalDateKey(d)]) || 0));
    if (sec > 0) {
      currentStreakDays += 1;
    } else if (back === 0) {
      // Allow today to still be 0 if yesterday was active
      continue;
    } else {
      break;
    }
  }

  let longestStreakDays = 0;
  let running = 0;
  let prevTime: number | null = null;
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

export function getTrackingStartDateFormatted(
  byDay: SavedTimeByDay,
  timeSavedSince?: number | null,
  now: Date = new Date()
): string {
  const keys = Object.entries(byDay)
    .filter(([, val]) => Number(val) > 0)
    .map(([k]) => k)
    .sort();
  let candidateDate: Date | null = keys.length > 0 ? parseLocalDateKey(keys[0]) : null;
  if (
    typeof timeSavedSince === 'number' &&
    Number.isFinite(timeSavedSince) &&
    timeSavedSince > 0
  ) {
    const sinceDate = atLocalMidnight(new Date(timeSavedSince));
    if (!candidateDate || sinceDate.getTime() < candidateDate.getTime()) {
      candidateDate = sinceDate;
    }
  }
  const d = candidateDate || now;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export function formatSavedDurationFull(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function formatSavedDurationCompact(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec || 0));
  if (safe === 0) return '0s';
  if (safe < 60) return `${safe}s`;
  const totalMins = Math.round(safe / 60);
  if (totalMins < 60) return `${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function estimateStorageFootprintBytes(byDay: SavedTimeByDay): number {
  try {
    return new Blob([JSON.stringify({ savedTimeByDay: byDay })]).size;
  } catch {
    return JSON.stringify({ savedTimeByDay: byDay }).length;
  }
}

/**
 * Generates a realistic 180-day (6-month) Option A dataset ending today whose
 * sum reconciles cleanly with targetTotalSec (default 52,340s = 14h 32m 20s).
 */
export function buildSampleSavedTimeByDay(
  targetTotalSec: number = 52340,
  now: Date = new Date()
): SavedTimeByDay {
  const todayMid = atLocalMidnight(now);
  const daysBack = 179;
  const rawWeights: { key: string; weight: number }[] = [];

  const todayTarget = Math.min(940, Math.max(0, targetTotalSec));
  const remainingTarget = Math.max(0, targetTotalSec - todayTarget);

  for (let offset = daysBack; offset >= 1; offset--) {
    const d = addLocalDays(todayMid, -offset);
    const key = formatLocalDateKey(d);
    const dow = getMondayBasedDayIndex(d); // 0=Mon..6=Sun

    // Deterministic pseudo-random wave so the workbench looks identical & natural
    const seed = (offset * 37 + dow * 13 + d.getDate() * 7) % 100;

    // Occasional zero-watch day (~14% of days)
    if (seed < 14 && offset > 3) {
      rawWeights.push({ key, weight: 0 });
      continue;
    }

    // Weekday learning/explainers vs longer weekend podcasts
    const baseByDow = [240, 310, 275, 340, 290, 480, 560][dow];
    // Gentle upward trend over the last 6 months
    const recencyBoost = 0.72 + ((daysBack - offset) / daysBack) * 0.55;
    const variance = 0.65 + (seed / 100) * 0.85;
    rawWeights.push({
      key,
      weight: Math.max(45, Math.round(baseByDow * recencyBoost * variance)),
    });
  }

  const totalWeight = rawWeights.reduce((acc, item) => acc + item.weight, 0);
  const map: SavedTimeByDay = {};
  let allocated = 0;

  if (totalWeight > 0 && remainingTarget > 0) {
    rawWeights.forEach((item, idx) => {
      if (item.weight === 0) return;
      const scaled =
        idx === rawWeights.length - 1
          ? Math.max(0, remainingTarget - allocated)
          : Math.floor((item.weight / totalWeight) * remainingTarget);
      if (scaled > 0) {
        map[item.key] = scaled;
        allocated += scaled;
      }
    });
    // Distribute any minor rounding remainder into yesterday
    const leftover = remainingTarget - allocated;
    if (leftover > 0 && rawWeights.length > 0) {
      const lastNonZero = [...rawWeights].reverse().find((r) => r.weight > 0) || rawWeights[rawWeights.length - 1];
      map[lastNonZero.key] = (map[lastNonZero.key] || 0) + leftover;
    }
  }

  if (todayTarget > 0) {
    map[formatLocalDateKey(todayMid)] = todayTarget;
  }

  return map;
}
