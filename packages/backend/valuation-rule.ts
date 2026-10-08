// Public judgment rule: the stance follows where each index's rolling PE sits in its own
// trailing history. The rule is fixed in advance, so anyone can recompute every change from the data.
import type {ValuationPoint} from './valuation-history.ts';
import {VALUATION_INDEXES, frequencyOf, SOURCE_LABELS, sourceOf, type IndexCode} from './valuation-indexes.ts';

export const VALUATION_RULE = {
  id: 'csi300-pe-ttm-10y-v2',
  name: '沪深300估值分位规则 v2',
  version: 2,
  metric: '滚动市盈率（PE TTM）',
  window_years: 10,
  // Before ten years of official data exist, the window uses all available data, at least five years.
  min_years: 5,
  low: 30,
  high: 70,
  extreme: 90,
  // A boundary must hold for this many consecutive trading days before the judgment changes.
  confirm_days: 5,
  // Weekly histories (蛋卷) confirm over two consecutive weekly readings: about the same week of time.
  confirm_weeks: 2,
  // v2: leaving the confirmed band takes crossing its edge by this many extra percentile points.
  // v1 had no buffer and reversed within weeks about one change in three; see stability in the result.
  buffer: 5,
  // A change undone within this many calendar days counts as a quick reversal in the stability figures.
  reversal_days: 45,
  // Changes dated on or after this day were observed by the running software; earlier ones are recomputed.
  live_from: '2026-10-06',
} as const;

export type ValuationBand = 'low' | 'mid' | 'high' | 'extreme';
export type RuleAction = '加' | '持' | '观察' | '减';
export type BandJudgment = {
  band: ValuationBand;
  label: string;
  range: string;
  new_money: {action: RuleAction; title: string; text: string};
  held: {action: RuleAction; title: string; text: string};
  /** For a reader without a plan or holding who is deciding whether to start. */
  start: string;
};

export const BAND_JUDGMENTS: Record<ValuationBand, BandJudgment> = {
  low: {
    band: 'low', label: '偏低区', range: `低于第${VALUATION_RULE.low}百分位`,
    new_money: {action: '加', title: '可分批新增', text: '估值处在近十年偏低的三成以内。准备长期配置的新增资金，可以分几次投入，不必等待更低点。'},
    held: {action: '持', title: '继续持有', text: '估值偏低时不因短期下跌卖出；已有定投照常继续。'},
    start: '如果决定开始，可以分几次买入建立仓位。',
  },
  mid: {
    band: 'mid', label: '中间区', range: `第${VALUATION_RULE.low}至${VALUATION_RULE.high}百分位`,
    new_money: {action: '持', title: '照常定投，不加仓', text: '估值处在近十年的中间水平。已有定投照常进行；还没有定投的，可以用定投慢慢建仓，不一次性投入。'},
    held: {action: '持', title: '继续持有', text: '估值没有到需要调整的位置，继续持有，不必卖出。'},
    start: '如果决定开始，适合用定投慢慢建立仓位，不一次性投入。',
  },
  high: {
    band: 'high', label: '偏高区', range: `第${VALUATION_RULE.high}至${VALUATION_RULE.extreme}百分位`,
    new_money: {action: '观察', title: '暂缓新增', text: '估值已高于近十年七成时间。新增资金先观察，不在此时一次性买入。'},
    held: {action: '持', title: '继续持有', text: '估值偏高但未到极端位置，已有持仓继续持有，不追加。'},
    start: '如果决定开始，先等待估值回落，或只用很小金额定投。',
  },
  extreme: {
    band: 'extreme', label: '高位区', range: `高于第${VALUATION_RULE.extreme}百分位`,
    new_money: {action: '观察', title: '暂停新增', text: '估值处在近十年最高的一成。新增资金暂停投入。'},
    held: {action: '减', title: '占比过高可减仓', text: '如果这只基金在你的投资里占比明显变大，可以卖出超出的部分，让比例回到你原本能接受的水平；占比不高的继续持有。'},
    start: '现在不适合开始，等估值回到中间区再考虑。',
  },
};

export function bandOf(percentile: number): ValuationBand {
  if (percentile < VALUATION_RULE.low) return 'low';
  if (percentile < VALUATION_RULE.high) return 'mid';
  if (percentile < VALUATION_RULE.extreme) return 'high';
  return 'extreme';
}

function yearsBefore(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export type PercentilePoint = {date: string; pe_ttm: number; percentile: number; exact: number; window_start: string; full_window: boolean};

/**
 * Share of trailing-window days (including today) with PE at or below today's PE, in percent.
 * `exact` decides the band; `percentile` is the same value rounded to one decimal for display,
 * so a day at 29.98 stays in the low band even though it reads as 30.0.
 */
export function percentileSeries(points: ValuationPoint[]): PercentilePoint[] {
  if (!points.length) return [];
  const first = points[0].date;
  const out: PercentilePoint[] = [];
  let start = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (yearsBefore(p.date, VALUATION_RULE.min_years) < first) continue;
    const windowStart = yearsBefore(p.date, VALUATION_RULE.window_years);
    while (points[start].date < windowStart) start++;
    let atOrBelow = 0;
    for (let j = start; j <= i; j++) if (points[j].pe_ttm <= p.pe_ttm) atOrBelow++;
    const exact = (atOrBelow / (i - start + 1)) * 100;
    out.push({
      date: p.date, pe_ttm: p.pe_ttm,
      percentile: Math.round(exact * 10) / 10,
      exact,
      window_start: points[start].date,
      full_window: windowStart >= first,
    });
  }
  return out;
}

export type RuleChange = {
  date: string;
  from: ValuationBand | null;
  to: ValuationBand;
  pe_ttm: number;
  percentile: number;
  full_window: boolean;
};

const EDGES = [VALUATION_RULE.low, VALUATION_RULE.high, VALUATION_RULE.extreme] as const;
const BANDS: ValuationBand[] = ['low', 'mid', 'high', 'extreme'];

/**
 * Percentile edges in force while `current` is the confirmed band: the two edges of the current band
 * move outward by `buffer`; edges further away stay where they are.
 */
export function effectiveEdges(current: ValuationBand | null, buffer: number = VALUATION_RULE.buffer): [number, number, number] {
  const k = current === null ? -1 : BANDS.indexOf(current);
  return EDGES.map((edge, i) => i === k ? edge + buffer : i === k - 1 ? edge - buffer : edge) as [number, number, number];
}

/** The band an exact percentile falls in, given the confirmed band and its buffer. */
export function bandWithBuffer(exact: number, current: ValuationBand | null, buffer: number = VALUATION_RULE.buffer): ValuationBand {
  const [a, b, c] = effectiveEdges(current, buffer);
  return exact < a ? 'low' : exact < b ? 'mid' : exact < c ? 'high' : 'extreme';
}

/** Applies the buffer and the confirmation rule; only a band held for `confirm_days` days becomes the judgment. */
export function ruleTimeline(series: PercentilePoint[], buffer: number = VALUATION_RULE.buffer, confirm: number = VALUATION_RULE.confirm_days) {
  const changes: RuleChange[] = [];
  let confirmed: ValuationBand | null = null;
  let pending: {band: ValuationBand; days: number} | null = null;
  for (const p of series) {
    if (confirmed === null) {
      confirmed = bandOf(p.exact);
      changes.push({date: p.date, from: null, to: confirmed, pe_ttm: p.pe_ttm, percentile: p.percentile, full_window: p.full_window});
      continue;
    }
    const band = bandWithBuffer(p.exact, confirmed, buffer);
    if (band === confirmed) { pending = null; continue; }
    const previous = pending as {band: ValuationBand; days: number} | null;
    pending = previous?.band === band ? {band, days: previous.days + 1} : {band, days: 1};
    if (pending.days >= confirm) {
      changes.push({date: p.date, from: confirmed, to: band, pe_ttm: p.pe_ttm, percentile: p.percentile, full_window: p.full_window});
      confirmed = band;
      pending = null;
    }
  }
  return {changes, confirmed, pending};
}

/** Changes that undo the previous change within `days` calendar days (A → B, then back to A). */
export function quickReversals(changes: RuleChange[], days: number = VALUATION_RULE.reversal_days) {
  let count = 0;
  for (let i = 2; i < changes.length; i++) {
    const prev = changes[i - 1], cur = changes[i];
    if (cur.to === prev.from && Date.parse(cur.date) - Date.parse(prev.date) <= days * 86_400_000) count++;
  }
  return count;
}

/**
 * PE values that mark each band edge in today's trailing window, using the edges in force for the
 * current band (buffered), so the figures shown are the ones that would actually trigger a change.
 */
export function boundaryPe(points: ValuationPoint[], date: string, current: ValuationBand | null = null) {
  const windowStart = yearsBefore(date, VALUATION_RULE.window_years);
  const values = points.filter(p => p.date >= windowStart && p.date <= date).map(p => p.pe_ttm).sort((a, b) => a - b);
  // Smallest PE whose at-or-below share reaches the boundary percentile.
  const at = (pct: number) => values[Math.max(0, Math.ceil((pct / 100) * values.length) - 1)];
  const [low, high, extreme] = effectiveEdges(current);
  return {low: at(low), high: at(high), extreme: at(extreme), percentiles: {low, high, extreme}, window_start: values.length ? windowStart : null};
}

export type RuleJudgmentResult = ReturnType<typeof evaluateValuationRule>;

/**
 * Full public judgment. `live_from` separates changes the running software observed from those
 * recomputed over history with the same rule before the software existed.
 */
export function evaluateValuationRule(points: ValuationPoint[], options: {live_from?: string; index?: IndexCode} = {}) {
  const series = percentileSeries(points);
  const latest = series.at(-1);
  if (!latest) return null;
  const index = options.index ?? '000300';
  const weekly = frequencyOf(index) === 'weekly';
  const confirm = weekly ? VALUATION_RULE.confirm_weeks : VALUATION_RULE.confirm_days;
  const {changes, confirmed, pending} = ruleTimeline(series, VALUATION_RULE.buffer, confirm);
  const band = confirmed!;
  const boundaries = boundaryPe(points, latest.date, band);
  const v1 = ruleTimeline(series, 0, confirm).changes;
  // Downsample daily data to weekly points for the reader's chart; the last point is always included.
  const chart = series.filter((p, i) => weekly || i % 5 === 0 || i === series.length - 1).map(p => ({date: p.date, percentile: p.percentile, pe_ttm: p.pe_ttm}));
  const counts = {low: 0, mid: 0, high: 0, extreme: 0} as Record<ValuationBand, number>;
  for (const p of series) counts[bandOf(p.exact)]++;
  const identity = VALUATION_INDEXES[index];
  return {
    index_code: index,
    index_name: identity.name,
    rule: {...VALUATION_RULE, id: `${identity.rule_prefix}-pe-ttm-10y-v2`, name: `${identity.name}估值分位规则 v2`, confirm_days: confirm,
      /** What one reading is: a trading day (CSI) or a week (蛋卷). */
      unit: weekly ? '周' : '个交易日', frequency: weekly ? 'weekly' as const : 'daily' as const, source: sourceOf(index), source_label: SOURCE_LABELS[sourceOf(index)]},
    as_of: latest.date,
    pe_ttm: latest.pe_ttm,
    percentile: latest.percentile,
    window_start: latest.window_start,
    full_window: latest.full_window,
    raw_band: bandOf(latest.exact),
    band,
    judgment: BAND_JUDGMENTS[band],
    pending: pending ? {...pending, needed: confirm, judgment: BAND_JUDGMENTS[pending.band]} : null,
    boundaries,
    changes: changes.map(c => ({...c, origin: c.date >= (options.live_from ?? VALUATION_RULE.live_from) ? 'live' as const : 'recomputed' as const})).reverse(),
    last_change: changes.at(-1)!,
    history_first: points[0].date,
    rows: points.length,
    share_of_days: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / series.length) * 1000) / 10])) as Record<ValuationBand, number>,
    chart,
    // Why v2 has a buffer: the same data without it, side by side.
    stability: {changes: changes.length - 1, quick_reversals: quickReversals(changes), v1_changes: v1.length - 1, v1_quick_reversals: quickReversals(v1), reversal_days: VALUATION_RULE.reversal_days},
  };
}
