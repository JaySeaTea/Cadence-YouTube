import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  TrendingUp,
} from 'lucide-react';
import {
  SavedTimeByDay,
  SavedTimeDisplayMode,
} from '../types/extension';
import {
  buildSampleSavedTimeByDay,
  estimateStorageFootprintBytes,
  formatSavedDurationCompact,
  formatSavedDurationFull,
  getActivityHeatmapGrid,
  getAlignedFourWeekSeries,
  getDayOfWeekRhythm,
  getEndWeekOffsetForMonth,
  getMonthWeeklySeries,
  getMultiMonthSeries,
  getTodaySavedSec,
  getTrackingStartDateFormatted,
  getWeekDailySeries,
  sumSavedTimeMap,
} from '../utils/savedTimeAnalytics';

interface SavedTimeAnalyticsProps {
  totalTimeSavedSec: number;
  savedTimeByDay: SavedTimeByDay;
  timeSavedSince?: number;
  popupDisplayMode: SavedTimeDisplayMode;
  barDisplayMode: SavedTimeDisplayMode;
  onChangePopupDisplayMode: (mode: SavedTimeDisplayMode) => void;
  onChangeBarDisplayMode: (mode: SavedTimeDisplayMode) => void;
  onResetTimeSaved: () => void;
  onRestoreSampleHistory?: (sampleMap: SavedTimeByDay, totalSec: number, since?: number) => void;
}

type ChartViewMode = 'weekly' | 'four_week' | 'monthly_trend' | 'consistency';

interface DrillDownTrail {
  monthLabel?: string;
  monthOffset?: number;
  weekLabel?: string;
}

const HEATMAP_LEVEL_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-slate-800/70 border-slate-800',
  1: 'bg-emerald-950/90 border-emerald-800/60',
  2: 'bg-emerald-800/80 border-emerald-700/60',
  3: 'bg-emerald-600/90 border-emerald-500/70',
  4: 'bg-emerald-400 border-emerald-300',
};

export const SavedTimeAnalytics: React.FC<SavedTimeAnalyticsProps> = ({
  totalTimeSavedSec,
  savedTimeByDay,
  timeSavedSince,
  popupDisplayMode,
  barDisplayMode,
  onChangePopupDisplayMode,
  onChangeBarDisplayMode,
  onResetTimeSaved,
  onRestoreSampleHistory,
}) => {
  const [chartView, setChartView] = useState<ChartViewMode>('weekly');
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [endWeekOffset, setEndWeekOffset] = useState<number>(0);
  const [trendMonths, setTrendMonths] = useState<6 | 12>(6);
  const [drillTrail, setDrillTrail] = useState<DrillDownTrail>({});

  const [hoveredWeekDayKey, setHoveredWeekDayKey] = useState<string | null>(null);
  const [hoveredMonthWeekIdx, setHoveredMonthWeekIdx] = useState<number | null>(null);
  const [hoveredTrendKey, setHoveredTrendKey] = useState<string | null>(null);
  const [hoveredHeatmapKey, setHoveredHeatmapKey] = useState<string | null>(null);

  const [isResetBoxOpen, setIsResetBoxOpen] = useState<boolean>(false);
  const [resetConfirmInput, setResetConfirmInput] = useState<string>('');
  const [resetSuccessNotice, setResetSuccessNotice] = useState<boolean>(false);

  const todaySec = useMemo(() => getTodaySavedSec(savedTimeByDay), [savedTimeByDay]);
  const sinceDateStr = useMemo(
    () => getTrackingStartDateFormatted(savedTimeByDay, timeSavedSince),
    [savedTimeByDay, timeSavedSince]
  );
  const attributedTotalSec = useMemo(() => sumSavedTimeMap(savedTimeByDay), [savedTimeByDay]);
  const unattributedPriorSec = Math.max(0, totalTimeSavedSec - attributedTotalSec);
  const storageBytes = useMemo(
    () => estimateStorageFootprintBytes(savedTimeByDay),
    [savedTimeByDay]
  );

  const currentWeek = useMemo(
    () => getWeekDailySeries(savedTimeByDay, 0),
    [savedTimeByDay]
  );
  const viewedWeek = useMemo(
    () => getWeekDailySeries(savedTimeByDay, weekOffset),
    [savedTimeByDay, weekOffset]
  );

  const currentCalendarMonth = useMemo(
    () => getMonthWeeklySeries(savedTimeByDay, 0),
    [savedTimeByDay]
  );
  const viewedFourWeek = useMemo(
    () => getAlignedFourWeekSeries(savedTimeByDay, endWeekOffset),
    [savedTimeByDay, endWeekOffset]
  );

  const multiMonth = useMemo(
    () => getMultiMonthSeries(savedTimeByDay, trendMonths),
    [savedTimeByDay, trendMonths]
  );

  const dowRhythm = useMemo(
    () => getDayOfWeekRhythm(savedTimeByDay, 90),
    [savedTimeByDay]
  );

  const heatmap = useMemo(
    () => getActivityHeatmapGrid(savedTimeByDay, 12),
    [savedTimeByDay]
  );

  const weekMaxSec = Math.max(60, ...viewedWeek.points.map((p) => p.seconds));
  const fourWeekMaxSec = Math.max(60, ...viewedFourWeek.points.map((p) => p.seconds));
  const trendMaxSec = Math.max(60, ...multiMonth.map((m) => m.seconds));
  const dowMaxSec = Math.max(60, ...dowRhythm.map((d) => d.avgSec));

  const inspectedWeekDay =
    viewedWeek.points.find((p) => p.dateKey === hoveredWeekDayKey) ||
    viewedWeek.points.find((p) => p.isToday) ||
    viewedWeek.points[viewedWeek.points.length - 1];

  const inspectedMonthWeek =
    viewedFourWeek.points.find((p) => p.weekIndex === hoveredMonthWeekIdx) ||
    viewedFourWeek.points.find((p) => p.isCurrentWeek) ||
    viewedFourWeek.points[viewedFourWeek.points.length - 1];

  const inspectedTrendMonth =
    multiMonth.find((m) => m.monthKey === hoveredTrendKey) ||
    multiMonth[multiMonth.length - 1];

  const allHeatmapCells = useMemo(() => heatmap.weeks.flat(), [heatmap.weeks]);
  const inspectedHeatmapCell =
    allHeatmapCells.find((c) => c.dateKey === hoveredHeatmapKey) ||
    allHeatmapCells.find((c) => c.isToday) ||
    allHeatmapCells[allHeatmapCells.length - 1];

  const peakDow = dowRhythm.reduce(
    (best, cur) => (cur.avgSec > best.avgSec ? cur : best),
    dowRhythm[0]
  );

  const handleExecuteReset = () => {
    if (resetConfirmInput.trim() !== 'Forget Time Saved') return;
    onResetTimeSaved();
    setIsResetBoxOpen(false);
    setResetConfirmInput('');
    setResetSuccessNotice(true);
    window.setTimeout(() => setResetSuccessNotice(false), 3500);
  };

  const handleChartModeChange = (nextMode: ChartViewMode) => {
    setChartView(nextMode);
    setDrillTrail({});
    setHoveredWeekDayKey(null);
    setHoveredMonthWeekIdx(null);
    setHoveredTrendKey(null);
    setHoveredHeatmapKey(null);
  };

  const handleDrillIntoMonth = (monthKey: string, fullLabel: string) => {
    const nextEndWeekOffset = getEndWeekOffsetForMonth(monthKey);
    setEndWeekOffset(nextEndWeekOffset);
    setHoveredTrendKey(null);
    setHoveredMonthWeekIdx(null);
    setDrillTrail({ monthLabel: fullLabel, monthOffset: nextEndWeekOffset });
    setChartView('four_week');
  };

  const handleDrillIntoWeek = (targetOffset: number, rangeLabel: string) => {
    setWeekOffset(targetOffset);
    setHoveredMonthWeekIdx(null);
    setHoveredWeekDayKey(null);
    setDrillTrail((prev) => ({
      ...prev,
      weekLabel: rangeLabel,
    }));
    setChartView('weekly');
  };

  const formatReadoutSample = (mode: SavedTimeDisplayMode) =>
    mode === 'total'
      ? `Saved ${formatSavedDurationCompact(totalTimeSavedSec)}`
      : mode === 'daily'
        ? `Saved ${formatSavedDurationCompact(todaySec)} today`
        : 'Hidden';

  const popupReadoutSample = formatReadoutSample(popupDisplayMode);
  const barReadoutSample = formatReadoutSample(barDisplayMode);

  const readoutOptions = [
    { id: 'total', label: 'Total Time Saved' },
    { id: 'daily', label: 'Daily Time Saved' },
    { id: 'off', label: 'Off' },
  ] as const;

  return (
    <div className="space-y-5 pt-4">
      {/* Row 1: Popup & Below-Video Readout Settings + Reset Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 sm:gap-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-bold tracking-wide text-slate-100">
                Toolbar Popup Readout
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                Bottom-right:{' '}
                <strong
                  className={
                    popupDisplayMode === 'off' ? 'text-slate-500 font-medium' : 'text-emerald-400'
                  }
                >
                  {popupReadoutSample}
                </strong>
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Toolbar Popup Time Saved Display"
              className="inline-flex items-center p-1 bg-[#0B0F19] border border-slate-800 rounded-lg self-start"
            >
              {readoutOptions.map((opt) => {
                const active = popupDisplayMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChangePopupDisplayMode(opt.id)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-slate-800 border border-slate-600/90 text-slate-100 font-semibold'
                        : 'border border-transparent text-slate-400 hover:text-slate-200 font-medium'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-bold tracking-wide text-slate-100">
                Below-Video Bar Readout
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                Before Rule:{' '}
                <strong
                  className={
                    barDisplayMode === 'off' ? 'text-slate-500 font-medium' : 'text-emerald-400'
                  }
                >
                  {barReadoutSample}
                </strong>
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Below-Video Bar Time Saved Display"
              className="inline-flex items-center p-1 bg-[#0B0F19] border border-slate-800 rounded-lg self-start"
            >
              {readoutOptions.map((opt) => {
                const active = barDisplayMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChangeBarDisplayMode(opt.id)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-slate-800 border border-slate-600/90 text-slate-100 font-semibold'
                        : 'border border-transparent text-slate-400 hover:text-slate-200 font-medium'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {!isResetBoxOpen && (
          <div className="flex items-center gap-2 self-start lg:self-end">
            {totalTimeSavedSec === 0 && onRestoreSampleHistory && (
              <button
                type="button"
                onClick={() => {
                  const nextSample = buildSampleSavedTimeByDay(52340);
                  onRestoreSampleHistory(nextSample, 52340);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200 bg-[#0B0F19] border border-emerald-800/60 hover:border-emerald-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Load 6M Sample
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsResetBoxOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-red-400 bg-[#0B0F19] border border-slate-800 hover:border-red-900/60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Reset Counter
            </button>
          </div>
        )}
      </div>

      {resetSuccessNotice && (
        <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-xs rounded-lg">
          <Check className="w-4 h-4 shrink-0" />
          <span>Lifetime and daily saved-time buckets have been reset to 0s.</span>
        </div>
      )}

      {isResetBoxOpen && (
        <div className="p-4 bg-[#0B0F19] border border-red-900/60 rounded-lg space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              Resetting clears both your lifetime counter and historical daily buckets back to zero. Type{' '}
              <span className="font-mono font-semibold text-amber-300 select-all">
                Forget Time Saved
              </span>{' '}
              to confirm:
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={resetConfirmInput}
              onChange={(e) => setResetConfirmInput(e.target.value)}
              placeholder='Type "Forget Time Saved"'
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-[#111827] border border-slate-700 rounded-md text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={resetConfirmInput.trim() !== 'Forget Time Saved'}
                onClick={handleExecuteReset}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsResetBoxOpen(false);
                  setResetConfirmInput('');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row 2: Option B — Merged Hero Total + 4-Column KPI Strip in One Unified Band */}
      <div className="border border-slate-800 rounded-lg bg-[#0B0F19] grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-slate-800">
        {/* Left Anchor: Single Green Lifetime Focal Metric */}
        <div className="xl:col-span-5 p-4 flex flex-col justify-center">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="text-3xl font-extrabold font-mono tabular-nums tracking-tight text-emerald-400">
              {formatSavedDurationFull(totalTimeSavedSec)}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-300 font-medium">
              Since {sinceDateStr}
            </span>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-400 mt-1">
            {heatmap.totalActiveDays} tracked days - {(storageBytes / 1024).toFixed(1)} KB local store
          </div>
          {unattributedPriorSec > 0 && (
            <div className="text-[11px] text-amber-300/90 mt-1">
              Includes {formatSavedDurationFull(unattributedPriorSec)} recorded prior to daily tracking.
            </div>
          )}
        </div>

        {/* Right 4 KPI Columns in Calm High-Contrast Neutral */}
        <div className="xl:col-span-7 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
          <div className="p-3.5 flex flex-col justify-center">
            <div className="text-[11px] font-medium text-slate-400">Today</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-100 mt-0.5">
              {formatSavedDurationFull(todaySec)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5 truncate">
              {currentWeek.dailyAvgSec > 0
                ? `${todaySec >= currentWeek.dailyAvgSec ? '+' : ''}${Math.round(
                    ((todaySec - currentWeek.dailyAvgSec) / currentWeek.dailyAvgSec) * 100
                  )}% vs wk avg`
                : 'Active day'}
            </div>
          </div>

          <div className="p-3.5 flex flex-col justify-center">
            <div className="text-[11px] font-medium text-slate-400">This Week</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-100 mt-0.5">
              {formatSavedDurationCompact(currentWeek.totalSec)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5 truncate">
              {currentWeek.activeDays}d · {formatSavedDurationCompact(currentWeek.dailyAvgSec)}/d
            </div>
          </div>

          <div className="p-3.5 flex flex-col justify-center">
            <div className="text-[11px] font-medium text-slate-400">This Month</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-100 mt-0.5">
              {formatSavedDurationCompact(currentCalendarMonth.totalSec)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5 truncate">
              {currentCalendarMonth.activeDays}d · {formatSavedDurationCompact(currentCalendarMonth.weeklyAvgSec)}/wk
            </div>
          </div>

          <div className="p-3.5 flex flex-col justify-center">
            <div className="text-[11px] font-medium text-slate-400">Streak</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-100 mt-0.5 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{heatmap.currentStreakDays}d</span>
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5 truncate">
              {heatmap.bestDay
                ? `Best: ${formatSavedDurationCompact(heatmap.bestDay.seconds)}`
                : 'No data yet'}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Unified Single-Column Chart Stage with View Dropdown & Click Drill-Down */}
      <div className="border border-slate-800 rounded-lg bg-[#0B0F19] p-4 space-y-4">
        {/* Stage Header: Dropdown Selector + Date/Range Meta + Right Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {chartView === 'weekly' && (
                <BarChart3 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              {chartView === 'four_week' && (
                <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
              )}
              {chartView === 'monthly_trend' && (
                <TrendingUp className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              {chartView === 'consistency' && (
                <Flame className="w-4 h-4 text-emerald-400 shrink-0" />
              )}

              <select
                aria-label="Select Saved Time Graph"
                value={chartView}
                onChange={(e) => handleChartModeChange(e.target.value as ChartViewMode)}
                className="px-2.5 py-1.5 text-sm font-semibold bg-[#111827] border border-slate-700 focus:border-slate-500 rounded-lg text-slate-100 focus:outline-none cursor-pointer transition-colors"
              >
                <option value="weekly">Weekly Breakdown (Daily · Mon–Sun)</option>
                <option value="four_week">4-Week Breakdown (Mon–Sun Weeks)</option>
                <option value="monthly_trend">Long-Term Monthly Trend</option>
                <option value="consistency">12-Week Consistency &amp; Weekday Pace</option>
              </select>
            </div>

            {/* Quiet Breadcrumb + Active Window Summary */}
            <div className="flex items-center gap-2 flex-wrap text-xs font-mono tabular-nums text-slate-400">
              {(drillTrail.monthLabel || drillTrail.weekLabel) && (
                <>
                  <button
                    type="button"
                    onClick={() => handleChartModeChange('monthly_trend')}
                    className="text-slate-300 hover:text-white underline underline-offset-2 cursor-pointer"
                  >
                    Monthly Trend
                  </button>
                  {drillTrail.monthLabel && (
                    <>
                      <span aria-hidden="true">›</span>
                      <button
                        type="button"
                        onClick={() => {
                          const targetOffset = drillTrail.monthOffset ?? 0;
                          setEndWeekOffset(targetOffset);
                          setDrillTrail({
                            monthLabel: drillTrail.monthLabel,
                            monthOffset: targetOffset,
                          });
                          setChartView('four_week');
                        }}
                        className={`cursor-pointer ${
                          chartView === 'four_week'
                            ? 'text-sky-400 font-semibold'
                            : 'text-slate-300 hover:text-white underline underline-offset-2'
                        }`}
                      >
                        {drillTrail.monthLabel}
                      </button>
                    </>
                  )}
                  {drillTrail.weekLabel && chartView === 'weekly' && (
                    <>
                      <span aria-hidden="true">›</span>
                      <span className="text-emerald-400 font-semibold">
                        {drillTrail.weekLabel}
                      </span>
                    </>
                  )}
                  <span className="text-slate-600" aria-hidden="true">
                    |
                  </span>
                </>
              )}

              {chartView === 'weekly' && (
                <span>
                  {viewedWeek.rangeLabel} ·{' '}
                  <strong className="text-slate-200">
                    {formatSavedDurationCompact(viewedWeek.totalSec)}
                  </strong>{' '}
                  total
                </span>
              )}
              {chartView === 'four_week' && (
                <span>
                  {viewedFourWeek.monthLabel} ·{' '}
                  <strong className="text-slate-200">
                    {formatSavedDurationCompact(viewedFourWeek.totalSec)}
                  </strong>{' '}
                  total · Click any week to inspect days
                </span>
              )}
              {chartView === 'monthly_trend' && (
                <span>
                  Last {trendMonths} months ·{' '}
                  <strong className="text-slate-200">
                    {formatSavedDurationCompact(
                      multiMonth.reduce((sum, m) => sum + m.seconds, 0)
                    )}
                  </strong>{' '}
                  total · Click any month to inspect weeks
                </span>
              )}
              {chartView === 'consistency' && (
                <span>
                  Each column = 1 week · Best streak:{' '}
                  <strong className="text-slate-200">{heatmap.longestStreakDays}d</strong>
                </span>
              )}
            </div>
          </div>

          {/* Right Contextual Navigation */}
          <div className="shrink-0">
            {chartView === 'weekly' && (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset((w) => w - 1);
                    setDrillTrail({});
                    setHoveredWeekDayKey(null);
                  }}
                  className="p-1.5 rounded-md border border-slate-800 bg-[#111827] text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Previous week"
                  aria-label="Previous week"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {!viewedWeek.isCurrentWeek && (
                  <button
                    type="button"
                    onClick={() => {
                      setWeekOffset(0);
                      setDrillTrail({});
                      setHoveredWeekDayKey(null);
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-slate-800 bg-[#111827] text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    This Week
                  </button>
                )}
                <button
                  type="button"
                  disabled={weekOffset >= 0}
                  onClick={() => {
                    setWeekOffset((w) => Math.min(0, w + 1));
                    setDrillTrail({});
                    setHoveredWeekDayKey(null);
                  }}
                  className="p-1.5 rounded-md border border-slate-800 bg-[#111827] text-slate-300 hover:bg-slate-800 disabled:opacity-35 disabled:hover:bg-[#111827] transition-colors cursor-pointer disabled:cursor-not-allowed"
                  title="Next week"
                  aria-label="Next week"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {chartView === 'four_week' && (
              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEndWeekOffset((o) => o - 4);
                    setDrillTrail({});
                    setHoveredMonthWeekIdx(null);
                  }}
                  className="p-1.5 rounded-md border border-slate-800 bg-[#111827] text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Previous 4 weeks"
                  aria-label="Previous 4 weeks"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {!viewedFourWeek.isCurrentMonth && (
                  <button
                    type="button"
                    onClick={() => {
                      setEndWeekOffset(0);
                      setDrillTrail({});
                      setHoveredMonthWeekIdx(null);
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-slate-800 bg-[#111827] text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Last 4 Wks
                  </button>
                )}
                <button
                  type="button"
                  disabled={endWeekOffset >= 0}
                  onClick={() => {
                    setEndWeekOffset((o) => Math.min(0, o + 4));
                    setDrillTrail({});
                    setHoveredMonthWeekIdx(null);
                  }}
                  className="p-1.5 rounded-md border border-slate-800 bg-[#111827] text-slate-300 hover:bg-slate-800 disabled:opacity-35 disabled:hover:bg-[#111827] transition-colors cursor-pointer disabled:cursor-not-allowed"
                  title="Next 4 weeks"
                  aria-label="Next 4 weeks"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {chartView === 'monthly_trend' && (
              <div className="inline-flex items-center p-0.5 bg-[#111827] border border-slate-800 rounded-md">
                {([6, 12] as const).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => {
                      setTrendMonths(cnt);
                      setHoveredTrendKey(null);
                    }}
                    className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded transition-colors cursor-pointer ${
                      trendMonths === cnt
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cnt}M
                  </button>
                ))}
              </div>
            )}

            {chartView === 'consistency' && (
              <div className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                <span>0s</span>
                {([0, 1, 2, 3, 4] as const).map((lvl) => (
                  <span
                    key={lvl}
                    className={`w-2.5 h-2.5 rounded-[2px] border ${HEATMAP_LEVEL_CLASSES[lvl]}`}
                  />
                ))}
                <span>Peak</span>
              </div>
            )}
          </div>
        </div>

        {attributedTotalSec === 0 && (
          <div className="px-3 py-2 rounded-md border border-slate-800 bg-[#111827]/70 text-xs text-slate-400">
            {unattributedPriorSec > 0 ? (
              <>
                Daily tracking starts today — play videos above <span className="font-mono text-slate-200">1.0×</span> to populate daily bars while your{' '}
                <span className="font-mono text-amber-300">{formatSavedDurationFull(unattributedPriorSec)}</span> prior total stays preserved above.
              </>
            ) : (
              <>
                No daily savings recorded yet — play videos above <span className="font-mono text-slate-200">1.0×</span> to build your history.
              </>
            )}
          </div>
        )}

        {/* Active Chart Body */}
        {chartView === 'weekly' && (
          <>
            <div
              className="relative pt-5 pb-1"
              onMouseLeave={() => setHoveredWeekDayKey(null)}
            >
              {viewedWeek.dailyAvgSec > 0 && (
                <div
                  aria-hidden="true"
                  className="absolute left-0 right-0 border-t border-dashed border-slate-600/80 pointer-events-none flex justify-end"
                  style={{
                    bottom: `${Math.min(
                      104,
                      Math.max(20, (viewedWeek.dailyAvgSec / weekMaxSec) * 124 + 30)
                    )}px`,
                  }}
                >
                  <span className="-mt-4 px-1 text-[10px] font-mono tabular-nums text-slate-400 bg-[#0B0F19]">
                    avg {formatSavedDurationCompact(viewedWeek.dailyAvgSec)}/day
                  </span>
                </div>
              )}

              <div className="grid grid-cols-7 gap-2.5 items-end h-[164px]">
                {viewedWeek.points.map((pt) => {
                  const barHeightPx = pt.isFuture
                    ? 4
                    : pt.seconds === 0
                      ? 3
                      : Math.max(8, Math.round((pt.seconds / weekMaxSec) * 124));
                  const isHovered = hoveredWeekDayKey === pt.dateKey;
                  const barColorClass = pt.isFuture
                    ? 'bg-slate-800/35 border border-dashed border-slate-700/60'
                    : pt.seconds === 0
                      ? isHovered
                        ? 'bg-slate-600'
                        : 'bg-slate-800/80'
                      : isHovered
                        ? 'bg-emerald-300'
                        : pt.isToday
                          ? 'bg-emerald-400'
                          : 'bg-slate-600/80';

                  return (
                    <button
                      key={pt.dateKey}
                      type="button"
                      onMouseEnter={() => setHoveredWeekDayKey(pt.dateKey)}
                      onMouseLeave={() => setHoveredWeekDayKey(null)}
                      onFocus={() => setHoveredWeekDayKey(pt.dateKey)}
                      onBlur={() => setHoveredWeekDayKey(null)}
                      className="flex flex-col items-center justify-end h-full gap-1.5 cursor-pointer focus:outline-none"
                      aria-label={`${pt.fullDateLabel}: ${formatSavedDurationFull(pt.seconds)}`}
                    >
                      <span
                        className={`text-[10px] font-mono tabular-nums transition-colors ${
                          pt.isFuture
                            ? 'text-transparent'
                            : isHovered
                              ? 'text-slate-100 font-semibold'
                              : pt.isToday
                                ? 'text-emerald-400 font-semibold'
                                : 'text-slate-400'
                        }`}
                      >
                        {pt.seconds > 0 ? formatSavedDurationCompact(pt.seconds) : '0s'}
                      </span>
                      <div className="w-full flex items-end justify-center h-[124px]">
                        <div
                          className={`w-full max-w-[44px] rounded-t-md transition-colors duration-150 ${barColorClass}`}
                          style={{ height: `${barHeightPx}px` }}
                        />
                      </div>
                      <div className="text-center leading-tight">
                        <div
                          className={`text-[11px] font-semibold transition-colors ${
                            pt.isToday
                              ? 'text-emerald-400'
                              : isHovered
                                ? 'text-slate-100'
                                : 'text-slate-400'
                          }`}
                        >
                          {pt.dayShort}
                        </div>
                        <div
                          className={`text-[10px] font-mono tabular-nums transition-colors ${
                            pt.isToday ? 'text-emerald-400/90' : 'text-slate-500'
                          }`}
                        >
                          {pt.dateLabel}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-800/80 text-xs">
              <span className="text-slate-400">
                {inspectedWeekDay
                  ? `${inspectedWeekDay.fullDateLabel}${inspectedWeekDay.isToday ? ' (Today)' : ''}`
                  : 'Hover a day'}
              </span>
              <span className="font-mono font-semibold tabular-nums text-emerald-400">
                {inspectedWeekDay ? formatSavedDurationFull(inspectedWeekDay.seconds) : '0s'} saved
              </span>
            </div>
          </>
        )}

        {chartView === 'four_week' && (
          <>
            <div
              className="relative pt-5 pb-1"
              onMouseLeave={() => setHoveredMonthWeekIdx(null)}
            >
              {viewedFourWeek.weeklyAvgSec > 0 && (
                <div
                  aria-hidden="true"
                  className="absolute left-0 right-0 border-t border-dashed border-slate-600/80 pointer-events-none flex justify-end"
                  style={{
                    bottom: `${Math.min(
                      104,
                      Math.max(20, (viewedFourWeek.weeklyAvgSec / fourWeekMaxSec) * 124 + 30)
                    )}px`,
                  }}
                >
                  <span className="-mt-4 px-1 text-[10px] font-mono tabular-nums text-slate-400 bg-[#0B0F19]">
                    avg {formatSavedDurationCompact(viewedFourWeek.weeklyAvgSec)}/wk
                  </span>
                </div>
              )}

              <div className="grid grid-cols-4 gap-4 items-end h-[164px]">
                {viewedFourWeek.points.map((wk) => {
                  const barHeightPx =
                    wk.seconds === 0
                      ? 4
                      : Math.max(10, Math.round((wk.seconds / fourWeekMaxSec) * 124));
                  const isHovered = hoveredMonthWeekIdx === wk.weekIndex;
                  const isCurrent = Boolean(wk.isCurrentWeek);
                  const barColorClass =
                    wk.seconds === 0
                      ? isHovered
                        ? 'bg-slate-600'
                        : 'bg-slate-800/80'
                      : isHovered
                        ? 'bg-sky-300'
                        : isCurrent
                          ? 'bg-sky-400'
                          : 'bg-slate-600/80';

                  return (
                    <button
                      key={wk.weekIndex}
                      type="button"
                      onClick={() =>
                        handleDrillIntoWeek(wk.weekOffsetFromCurrent ?? 0, wk.rangeLabel)
                      }
                      onMouseEnter={() => setHoveredMonthWeekIdx(wk.weekIndex)}
                      onMouseLeave={() => setHoveredMonthWeekIdx(null)}
                      onFocus={() => setHoveredMonthWeekIdx(wk.weekIndex)}
                      onBlur={() => setHoveredMonthWeekIdx(null)}
                      className="flex flex-col items-center justify-end h-full gap-1.5 cursor-pointer focus:outline-none"
                      title={`Click to view daily breakdown for ${wk.rangeLabel}`}
                      aria-label={`${wk.label} (${wk.rangeLabel}): ${formatSavedDurationFull(
                        wk.seconds
                      )}. Click to inspect daily breakdown.`}
                    >
                      <span
                        className={`text-[10px] font-mono tabular-nums transition-colors ${
                          isHovered
                            ? 'text-slate-100 font-semibold'
                            : isCurrent
                              ? 'text-sky-400 font-semibold'
                              : 'text-slate-400'
                        }`}
                      >
                        {formatSavedDurationCompact(wk.seconds)}
                      </span>
                      <div className="w-full flex items-end justify-center h-[124px]">
                        <div
                          className={`w-full max-w-[60px] rounded-t-md transition-colors duration-150 ${barColorClass}`}
                          style={{ height: `${barHeightPx}px` }}
                        />
                      </div>
                      <div className="text-center leading-tight">
                        <div
                          className={`text-[11px] font-semibold transition-colors ${
                            isCurrent
                              ? 'text-sky-400'
                              : isHovered
                                ? 'text-slate-100'
                                : 'text-slate-400'
                          }`}
                        >
                          {wk.label}
                        </div>
                        <div
                          className={`text-[10px] font-mono tabular-nums truncate max-w-full ${
                            isCurrent ? 'text-sky-400/90' : 'text-slate-500'
                          }`}
                        >
                          {wk.rangeLabel}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-800/80 text-xs">
              <span className="text-slate-400">
                {inspectedMonthWeek
                  ? `${inspectedMonthWeek.label} (${inspectedMonthWeek.rangeLabel}) · ${inspectedMonthWeek.activeDays}/7 active days · Click bar for days`
                  : 'Click a week to inspect days'}
              </span>
              <span className="font-mono font-semibold tabular-nums text-sky-400">
                {inspectedMonthWeek ? formatSavedDurationFull(inspectedMonthWeek.seconds) : '0s'}{' '}
                saved
              </span>
            </div>
          </>
        )}

        {chartView === 'monthly_trend' && (
          <>
            <div
              className="grid gap-2.5 items-end h-[164px] pt-5 pb-1"
              style={{
                gridTemplateColumns: `repeat(${multiMonth.length}, minmax(0, 1fr))`,
              }}
              onMouseLeave={() => setHoveredTrendKey(null)}
            >
              {multiMonth.map((m, idx) => {
                const isLatest = idx === multiMonth.length - 1;
                const isHovered = hoveredTrendKey === m.monthKey;
                const barHeightPx =
                  m.seconds === 0
                    ? 4
                    : Math.max(8, Math.round((m.seconds / trendMaxSec) * 124));
                const barColorClass =
                  m.seconds === 0
                    ? isHovered
                      ? 'bg-slate-600'
                      : 'bg-slate-800/80'
                    : isHovered
                      ? 'bg-amber-300'
                      : isLatest
                        ? 'bg-amber-400'
                        : 'bg-slate-600/80';

                return (
                  <button
                    key={m.monthKey}
                    type="button"
                    onClick={() => handleDrillIntoMonth(m.monthKey, m.fullLabel)}
                    onMouseEnter={() => setHoveredTrendKey(m.monthKey)}
                    onMouseLeave={() => setHoveredTrendKey(null)}
                    onFocus={() => setHoveredTrendKey(m.monthKey)}
                    onBlur={() => setHoveredTrendKey(null)}
                    className="flex flex-col items-center justify-end h-full gap-1.5 cursor-pointer focus:outline-none"
                    title={`Click to view 4-week breakdown for ${m.fullLabel}`}
                    aria-label={`${m.fullLabel}: ${formatSavedDurationFull(
                      m.seconds
                    )}. Click to inspect 4-week breakdown.`}
                  >
                    <span
                      className={`text-[10px] font-mono tabular-nums truncate max-w-full transition-colors ${
                        isHovered
                          ? 'text-slate-100 font-semibold'
                          : isLatest
                            ? 'text-amber-400 font-semibold'
                            : 'text-slate-400'
                      }`}
                    >
                      {m.seconds > 0 ? formatSavedDurationCompact(m.seconds) : '0s'}
                    </span>
                    <div className="w-full flex items-end justify-center h-[124px]">
                      <div
                        className={`w-full max-w-[44px] rounded-t-md transition-colors duration-150 ${barColorClass}`}
                        style={{ height: `${barHeightPx}px` }}
                      />
                    </div>
                    <span
                      className={`text-[11px] font-semibold transition-colors ${
                        isLatest
                          ? 'text-amber-400'
                          : isHovered
                            ? 'text-slate-100'
                            : 'text-slate-400'
                      }`}
                    >
                      {m.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-800/80 text-xs">
              <span className="text-slate-400">
                {inspectedTrendMonth
                  ? `${inspectedTrendMonth.fullLabel} · ${inspectedTrendMonth.activeDays} active days · Click bar for 4-week view`
                  : 'Click a month to inspect weeks'}
              </span>
              <span className="font-mono font-semibold tabular-nums text-amber-300">
                {inspectedTrendMonth
                  ? `${formatSavedDurationCompact(inspectedTrendMonth.seconds)}${
                      inspectedTrendMonth.deltaPercent !== null
                        ? ` (${inspectedTrendMonth.deltaPercent >= 0 ? '+' : ''}${
                            inspectedTrendMonth.deltaPercent
                          }% MoM)`
                        : ''
                    }`
                  : '0s'}
              </span>
            </div>
          </>
        )}

        {chartView === 'consistency' && (
          <div className="space-y-4">
            {/* 12-Week Calendar Grid */}
            <div
              className="space-y-1 overflow-x-auto pb-1"
              onMouseLeave={() => setHoveredHeatmapKey(null)}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 shrink-0" aria-hidden="true" />
                <div className="grid grid-cols-12 gap-1.5 flex-1 min-w-[260px] text-[10px] font-mono text-slate-400">
                  {heatmap.weekMonthLabels.map((lbl, idx) => (
                    <span key={idx} className="truncate">
                      {lbl}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-7 grid grid-rows-7 gap-1.5 text-[10px] font-mono text-slate-500 pt-0.5 shrink-0">
                  <span>Mon</span>
                  <span className="opacity-0">Tue</span>
                  <span>Wed</span>
                  <span className="opacity-0">Thu</span>
                  <span>Fri</span>
                  <span className="opacity-0">Sat</span>
                  <span>Sun</span>
                </div>
                <div className="grid grid-cols-12 gap-1.5 flex-1 min-w-[260px]">
                  {heatmap.weeks.map((weekCol, wIdx) => (
                    <div key={wIdx} className="grid grid-rows-7 gap-1.5">
                      {weekCol.map((cell) => {
                        const hovered = hoveredHeatmapKey === cell.dateKey;
                        return (
                          <button
                            key={cell.dateKey}
                            type="button"
                            disabled={cell.isFuture}
                            onMouseEnter={() => setHoveredHeatmapKey(cell.dateKey)}
                            onMouseLeave={() => setHoveredHeatmapKey(null)}
                            onFocus={() => setHoveredHeatmapKey(cell.dateKey)}
                            onBlur={() => setHoveredHeatmapKey(null)}
                            title={`${cell.label}: ${formatSavedDurationFull(cell.seconds)}`}
                            aria-label={`${cell.label}: ${formatSavedDurationFull(cell.seconds)}`}
                            className={`h-4 w-full rounded-[3px] border transition-transform ${
                              cell.isFuture
                                ? 'bg-transparent border-slate-800/30 opacity-30 cursor-default'
                                : `${HEATMAP_LEVEL_CLASSES[cell.level]} cursor-pointer hover:scale-105`
                            } ${cell.isToday ? 'ring-1 ring-emerald-300' : ''} ${
                              hovered && !cell.isFuture ? 'ring-1 ring-slate-100' : ''
                            }`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 90-Day Weekday Averages */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-300">
                  90-Day Average by Weekday
                </span>
                <span className="font-mono tabular-nums text-slate-400">
                  Peak day:{' '}
                  <strong className="text-emerald-400">
                    {peakDow.label} ({formatSavedDurationCompact(peakDow.avgSec)} avg)
                  </strong>
                </span>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {dowRhythm.map((d) => {
                  const pct = Math.max(6, Math.round((d.avgSec / dowMaxSec) * 100));
                  const isPeak = d.dayIndex === peakDow.dayIndex && d.avgSec > 0;
                  return (
                    <div key={d.dayIndex} className="space-y-1">
                      <div className="h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isPeak ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                        <span
                          className={
                            isPeak ? 'text-emerald-400 font-semibold' : 'text-slate-500'
                          }
                        >
                          {d.label.slice(0, 2)}
                        </span>
                        <span className="text-slate-400">
                          {formatSavedDurationCompact(d.avgSec)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-800/80 text-xs">
              <span className="text-slate-400">
                {inspectedHeatmapCell
                  ? `${inspectedHeatmapCell.label}${inspectedHeatmapCell.isToday ? ' (Today)' : ''}`
                  : 'Hover any square'}
              </span>
              <span className="font-mono font-semibold tabular-nums text-emerald-400">
                {inspectedHeatmapCell
                  ? formatSavedDurationFull(inspectedHeatmapCell.seconds)
                  : '0s'}{' '}
                saved
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
