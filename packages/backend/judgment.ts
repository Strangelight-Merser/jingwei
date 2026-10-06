// Reader-facing rule judgment: bundled official history plus any newer rows this machine fetched.
import {readState, mutateState, type State} from './storage.ts';
import {seedHistory, refreshPeHistory, mergePeHistory, type ValuationHistory} from './valuation-history.ts';
import {evaluateValuationRule, BAND_JUDGMENTS, type RuleAction} from './valuation-rule.ts';
import type {ValuationRuleEvidence, ResearchStance} from '../contracts/research.ts';

const STANCE: Record<RuleAction, ResearchStance> = {'加': 'conditional_add', '持': 'maintain_plan', '观察': 'observe', '减': 'conditional_reduce'};

export function currentValuationHistory(state: State): ValuationHistory {
  const seed = seedHistory();
  const stored = state.valuation_history;
  if (!stored) return seed;
  return {...stored, points: mergePeHistory(seed.points, stored.points)};
}

export async function judgmentPublication() {
  const state = await readState();
  const history = currentValuationHistory(state);
  const result = evaluateValuationRule(history.points);
  return result && {...result, source_url: history.source_url, checked_at: history.checked_at};
}

/** Fetches newer official rows; a failure keeps the last good history and its dates. */
export async function refreshValuationState(fetcher?: typeof fetch) {
  const before = currentValuationHistory(await readState());
  const after = await refreshPeHistory(before, {fetcher});
  // Only rows beyond the bundled seed are stored; the seed ships with every build.
  const seedLast = seedHistory().points.at(-1)!.date;
  const revisedFrom = new Date(`${seedLast}T00:00:00Z`);
  revisedFrom.setUTCDate(revisedFrom.getUTCDate() - 30);
  const keepFrom = revisedFrom.toISOString().slice(0, 10);
  await mutateState(async state => {
    state.valuation_history = {...after, points: after.points.filter(p => p.date >= keepFrom)};
  });
  return {rows: after.points.length, last: after.points.at(-1)?.date ?? null};
}

/** The rule result as citable research evidence; every number the model may use is in the fragment. */
export function valuationRuleEvidence(state: State): ValuationRuleEvidence | null {
  const history = currentValuationHistory(state);
  const r = evaluateValuationRule(history.points);
  if (!r) return null;
  const j = r.judgment;
  const fromLabel = r.last_change.from ? BAND_JUDGMENTS[r.last_change.from].label : null;
  const text = `数据截至${r.as_of}：沪深300滚动市盈率${r.pe_ttm}倍；${r.window_start}以来，${r.percentile}%的数据日估值不高于当日，处于${j.label}。`
    + `按${r.rule.name}，新增资金“${j.new_money.title}”，已有持仓“${j.held.title}”。`
    + `改判边界：连续${r.rule.confirm_days}个数据日低于约${r.boundaries.low}倍为偏低区，高于约${r.boundaries.high}倍为偏高区，高于约${r.boundaries.extreme}倍为高位区。`
    + `上次改判在${r.last_change.date}${fromLabel ? `，由${fromLabel}改为${j.label}` : ''}。`;
  return {
    rule_id: r.rule.id, rule_name: r.rule.name, as_of: r.as_of, pe_ttm: r.pe_ttm, percentile: r.percentile, window_start: r.window_start,
    band: r.band, band_label: j.label,
    new_money: {stance: STANCE[j.new_money.action], title: j.new_money.title, text: j.new_money.text},
    held: {stance: STANCE[j.held.action], title: j.held.title, text: j.held.text},
    boundaries: {low: r.boundaries.low, high: r.boundaries.high, extreme: r.boundaries.extreme},
    last_change: {date: r.last_change.date, from_label: fromLabel},
    ref: {article_id: `valuation-rule-${r.rule.id}-${r.as_of}`, revision: 1, source: `中证指数 · 沪深300每日估值（${r.rule.name}）`, url: history.source_url, published_at: '', checked_at: history.checked_at ?? undefined, data_as_of: r.as_of, fragments: [text]},
  };
}
