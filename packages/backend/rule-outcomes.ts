import {BAND_JUDGMENTS, percentileSeries, ruleTimeline, type ValuationBand} from './valuation-rule.ts';
import type {ValuationPoint} from './valuation-history.ts';
import type {TotalReturnPoint} from './total-return-source.ts';

export const OUTCOME_BANDS: ValuationBand[] = ['low', 'mid', 'high', 'extreme'];
export type ConfirmedBandDay = {date: string; band: ValuationBand};
export type OutcomeStats = {mean: number | null; median: number | null; positive_pct: number | null; sample_days: number; first: string | null; last: string | null};
export type BandOutcome = {band: ValuationBand; label: string; one_year: OutcomeStats; three_year: OutcomeStats};

/** Carries the latest confirmed judgment forward, including the days awaiting confirmation. */
export function confirmedBandDays(points: ValuationPoint[]): ConfirmedBandDay[] {
  const series = percentileSeries(points);
  const {changes} = ruleTimeline(series);
  let change = 0;
  return series.map(p => {
    while (change + 1 < changes.length && changes[change + 1].date <= p.date) change++;
    return {date: p.date, band: changes[change].to};
  });
}

function anniversary(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function stats(samples: {date: string; value: number}[]): OutcomeStats {
  if (!samples.length) return {mean: null, median: null, positive_pct: null, sample_days: 0, first: null, last: null};
  const values = samples.map(s => s.value).sort((a, b) => a - b);
  const n = values.length, mid = Math.floor(n / 2);
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / n,
    median: n % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2,
    positive_pct: values.filter(value => value > 0).length / n * 100,
    sample_days: n, first: samples[0].date, last: samples.at(-1)!.date,
  };
}

/**
 * One observation per official close date with a confirmed band. The exit is the first
 * official close on or after the calendar anniversary; CAGR = (exit / entry)^(1 / years) - 1.
 * Missing entry closes and anniversaries beyond the data end have no sample, never a shortened return.
 * All return fields are percentages, before fund fees; these are index outcomes, not strategy NAV.
 */
export function calculateRuleOutcomes(daily: ConfirmedBandDay[], closes: TotalReturnPoint[]): BandOutcome[] {
  const entryPrices = new Map(closes.map(p => [p.date, p.close]));
  const buckets = Object.fromEntries(OUTCOME_BANDS.map(band => [band, {one_year: [] as {date: string; value: number}[], three_year: [] as {date: string; value: number}[]}])) as Record<ValuationBand, {one_year: {date: string; value: number}[]; three_year: {date: string; value: number}[]}>;
  for (const day of daily) {
    const entry = entryPrices.get(day.date);
    if (entry === undefined) continue;
    for (const [years, key] of [[1, 'one_year'], [3, 'three_year']] as const) {
      const target = anniversary(day.date, years);
      // Binary search keeps full-history recalculation small without changing the exit convention.
      let left = 0, right = closes.length;
      while (left < right) {
        const middle = Math.floor((left + right) / 2);
        if (closes[middle].date < target) left = middle + 1; else right = middle;
      }
      const exit = closes[left];
      if (!exit) continue;
      const value = ((exit.close / entry) ** (1 / years) - 1) * 100;
      buckets[day.band][key].push({date: day.date, value});
    }
  }
  return OUTCOME_BANDS.map(band => ({band, label: BAND_JUDGMENTS[band].label, one_year: stats(buckets[band].one_year), three_year: stats(buckets[band].three_year)}));
}

export function outcomeConclusion(bands: BandOutcome[]): string {
  if (bands.some(row => row.three_year.mean === null)) return '部分区间还没有完整的 3 年样本，暂不能判断四个区间是否依次有效。';
  const ordered = (key: 'one_year' | 'three_year') => bands.every((row, i) => i === 0 || (bands[i - 1][key].mean ?? -Infinity) > (row[key].mean ?? Infinity));
  return ordered('three_year')
    ? `3 年年化均值从偏低区到高位区依次降低，支持这段历史中的估值分区${ordered('one_year') ? '。' : '；1 年期没有同样排序。'}`
    : '3 年年化均值没有从偏低区到高位区依次降低，这段历史不支持四个区间完整的收益排序。';
}

export function ruleOutcomesForHistory(points: ValuationPoint[], closes: TotalReturnPoint[]) {
  const daily = confirmedBandDays(points);
  const bands = calculateRuleOutcomes(daily, closes);
  return {
    current_band: daily.at(-1)?.band ?? null,
    judgment_as_of: daily.at(-1)?.date ?? null,
    returns_as_of: closes.at(-1)?.date ?? null,
    history_first: closes[0]?.date ?? null,
    bands, conclusion: outcomeConclusion(bands),
    method: '按当天已确认区间分组，持有至 1 年或 3 年周年日当日或之后的首个官方收盘日；年化 =（期末 / 期初）^(1 / 年数) − 1，包含分红，未扣基金费用。',
  };
}
