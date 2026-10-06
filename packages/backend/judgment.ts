// Reader-facing rule judgment: bundled official history plus any newer rows this machine fetched.
import {readState, mutateState, type State} from './storage.ts';
import {seedHistory, refreshPeHistory, mergePeHistory, type ValuationHistory} from './valuation-history.ts';
import {evaluateValuationRule, BAND_JUDGMENTS, type RuleAction} from './valuation-rule.ts';
import type {ValuationRuleEvidence, ResearchStance} from '../contracts/research.ts';
import {INDEX_CODES, type IndexCode} from './valuation-indexes.ts';

const STANCE: Record<RuleAction, ResearchStance> = {'加': 'conditional_add', '持': 'maintain_plan', '观察': 'observe', '减': 'conditional_reduce'};

export function currentValuationHistory(state: State, index: IndexCode = '000300'): ValuationHistory {
  const seed = seedHistory(index);
  const stored = index === '000300' ? state.valuation_history : state.valuation_histories?.[index];
  if (!stored) return seed;
  return {...stored, points: mergePeHistory(seed.points, stored.points)};
}

function judgmentFor(state: State, index: IndexCode) {
  const history = currentValuationHistory(state, index);
  const result = evaluateValuationRule(history.points, {index});
  return result && {...result, source_url: history.source_url, checked_at: history.checked_at};
}

export async function judgmentPublication(index: IndexCode = '000300') {
  const state = await readState();
  return judgmentFor(state, index);
}

export async function judgmentOverviewPublication() {
  const state = await readState();
  return {indexes: INDEX_CODES.map(index => judgmentFor(state, index)).filter(result => result !== null)};
}

/** Fetches newer official rows; a failure keeps the last good history and its dates. */
export async function refreshValuationState(fetcher?: typeof fetch) {
  const state = await readState();
  const updates = await Promise.allSettled(INDEX_CODES.map(index => refreshPeHistory(currentValuationHistory(state, index), {fetcher})));
  const refreshed = updates.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  if (refreshed.length) await mutateState(async state => {
    for (const after of refreshed) {
      // Retain only new rows and the 30-day revision window alongside each bundled seed.
      const revisedFrom = new Date(`${seedHistory(after.index_code).points.at(-1)!.date}T00:00:00Z`);
      revisedFrom.setUTCDate(revisedFrom.getUTCDate() - 30);
      const stored = {...after, points: after.points.filter(p => p.date >= revisedFrom.toISOString().slice(0, 10))};
      if (after.index_code === '000300') state.valuation_history = stored;
      else (state.valuation_histories ??= {})[after.index_code] = stored;
    }
  });
  const failures = updates.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
  if (failures.length) throw new AggregateError(failures, 'valuation_refresh_failed');
  return {indexes: refreshed.map(history => ({index_code: history.index_code, rows: history.points.length, last: history.points.at(-1)?.date ?? null}))};
}

/** The rule result as citable research evidence; every number the model may use is in the fragment. */
/** The rule result for one index as citable evidence; the research chain uses CSI 300, the default. */
export function valuationRuleEvidence(state: State, index: IndexCode = '000300'): ValuationRuleEvidence | null {
  const history = currentValuationHistory(state, index);
  const r = evaluateValuationRule(history.points, {index});
  if (!r) return null;
  const j = r.judgment;
  const fromLabel = r.last_change.from ? BAND_JUDGMENTS[r.last_change.from].label : null;
  const text = `数据截至${r.as_of}：${r.index_name}滚动市盈率${r.pe_ttm}倍；${r.window_start}以来，${r.percentile}%的数据日估值不高于当日，处于${j.label}。`
    + `按${r.rule.name}，新增资金“${j.new_money.title}”，已有持仓“${j.held.title}”。`
    + `从当前区间出发的改判边界（已含缓冲）：连续${r.rule.confirm_days}个数据日低于约${r.boundaries.low}倍为偏低区，高于约${r.boundaries.high}倍为偏高区，高于约${r.boundaries.extreme}倍为高位区。`
    + `上次改判在${r.last_change.date}${fromLabel ? `，由${fromLabel}改为${j.label}` : ''}。`;
  return {
    rule_id: r.rule.id, rule_name: r.rule.name, as_of: r.as_of, pe_ttm: r.pe_ttm, percentile: r.percentile, window_start: r.window_start,
    band: r.band, band_label: j.label,
    new_money: {stance: STANCE[j.new_money.action], title: j.new_money.title, text: j.new_money.text},
    held: {stance: STANCE[j.held.action], title: j.held.title, text: j.held.text},
    boundaries: {low: r.boundaries.low, high: r.boundaries.high, extreme: r.boundaries.extreme},
    last_change: {date: r.last_change.date, from_label: fromLabel},
    ref: {article_id: `valuation-rule-${r.rule.id}-${r.as_of}`, revision: 1, source: `中证指数 · ${r.index_name}每日估值（${r.rule.name}）`, url: history.source_url, published_at: '', checked_at: history.checked_at ?? undefined, data_as_of: r.as_of, fragments: [text]},
  };
}
