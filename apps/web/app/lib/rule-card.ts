import type {judgmentPublication} from '../../../../packages/backend/judgment.ts';
import {BAND_JUDGMENTS} from '../../../../packages/backend/valuation-rule.ts';

export type PublicRuleJudgment = NonNullable<Awaited<ReturnType<typeof judgmentPublication>>>;

// Only expose indices with a published judgment. Add another entry when its data is available.
export const CHANNEL_INDICES: Record<string, string> = {'000300': '沪深300', '000905': '中证500', '000016': '上证50'};

/** A compact snapshot of /publication/judgment; values are copied, never recalculated here.
 * PE is in multiples, percentile is 0–100, and dates are YYYY-MM-DD.
 * `band` is the confirmed band. `pending` never replaces it before confirmation.
 * Boundary PEs belong to as_of and move with the rolling window; use percentiles to confirm.
 * `origin` distinguishes a historical recomputation from a change observed by the software.
 */
export function ruleCardData(j: PublicRuleJudgment, indexCode: string) {
  return {
    index: {code: indexCode, name: CHANNEL_INDICES[indexCode]},
    as_of: j.as_of,
    pe_ttm: j.pe_ttm,
    percentile: j.percentile,
    window_start: j.window_start,
    band: j.band,
    label: j.judgment.label,
    new_money: {title: j.judgment.new_money.title, text: j.judgment.new_money.text},
    held: {title: j.judgment.held.title, text: j.judgment.held.text},
    boundaries: {
      low: j.boundaries.low, high: j.boundaries.high, extreme: j.boundaries.extreme,
      // Edges in force for the confirmed band (v2 buffer), matching the PE figures beside them.
      low_percentile: j.boundaries.percentiles?.low ?? j.rule.low, high_percentile: j.boundaries.percentiles?.high ?? j.rule.high, extreme_percentile: j.boundaries.percentiles?.extreme ?? j.rule.extreme,
      confirm_days: j.rule.confirm_days,
    },
    pending: j.pending ? {label: j.pending.judgment.label, days: j.pending.days, needed: j.pending.needed} : null,
    last_change: {
      date: j.last_change.date,
      from: j.last_change.from ? BAND_JUDGMENTS[j.last_change.from].label : null,
      to: BAND_JUDGMENTS[j.last_change.to].label,
      origin: j.changes.find(c => c.date === j.last_change.date)!.origin,
    },
    rule: {
      id: j.rule.id,
      summary: `按近${j.rule.window_years}年滚动市盈率分位划分${j.rule.low}/${j.rule.high}/${j.rule.extreme}四个区间，连续${j.rule.confirm_days}个数据日处在同一新区间才改判。`,
    },
    source: {name: '中证指数 · 每日估值', url: j.source_url, checked_at: j.checked_at},
  };
}

export type RuleCardData = ReturnType<typeof ruleCardData>;

export function changeDescription(c: RuleCardData['last_change']) {
  return `${c.date} · ${c.from ? `${c.from} → ` : ''}${c.to}（${c.origin === 'live' ? '实际观察' : '历史回算'}）`;
}
