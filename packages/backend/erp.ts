import {seedHistory, type ValuationPoint} from './valuation-history.ts';
import type {TotalReturnPoint} from './total-return-source.ts';
import {TOTAL_RETURN_SEED as CSI300_RETURN, TOTAL_RETURN_SOURCE as CSI300_SOURCE} from './000300-total-return-seed.ts';
import {TOTAL_RETURN_SEED as CSI500_RETURN, TOTAL_RETURN_SOURCE as CSI500_SOURCE} from './000905-total-return-seed.ts';
import {TOTAL_RETURN_SEED as SSE50_RETURN, TOTAL_RETURN_SOURCE as SSE50_SOURCE} from './000016-total-return-seed.ts';
import {VALUATION_INDEXES, type IndexCode} from './valuation-indexes.ts';
import {BAND_JUDGMENTS, VALUATION_RULE, type ValuationBand} from './valuation-rule.ts';
import {calculateRuleOutcomes, confirmedBandDays, OUTCOME_BANDS} from './rule-outcomes.ts';
import {BOND_YIELD_SEED, BOND_YIELD_SOURCE} from './government-bond-yield-seed.ts';

export type BondYieldPoint = {date: string; yield_pct: number};
export type ErpPoint = {date: string; pe_ttm: number; bond_yield_pct: number; erp_pct: number};
export type ErpRankPoint = ErpPoint & {exact: number; percentile: number; window_start: string; full_window: boolean};

export const ERP_GROUPS: Record<ValuationBand, {label: string; range: string}> = {
  low: {label: 'ERP 高位', range: '≥70'},
  mid: {label: 'ERP 中间', range: '30–<70'},
  high: {label: 'ERP 偏低', range: '10–<30'},
  extreme: {label: 'ERP 低位', range: '<10'},
};

export function seedBondYields(): BondYieldPoint[] {
  return BOND_YIELD_SEED.split(',').map(item => {
    const [d, value] = item.split(':');
    return {date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, yield_pct: Number(value)};
  });
}

/** Percent units throughout: 1 / PE becomes 100 / PE before subtracting the bond yield. */
export function dailyErp(pe: ValuationPoint[], bonds: BondYieldPoint[]): ErpPoint[] {
  const yields = new Map(bonds.map(p => [p.date, p.yield_pct]));
  return pe.flatMap(p => {
    const yield_pct = yields.get(p.date);
    return yield_pct === undefined ? [] : [{date: p.date, pe_ttm: p.pe_ttm, bond_yield_pct: yield_pct, erp_pct: 100 / p.pe_ttm - yield_pct}];
  });
}

function yearsBefore(date: string, years: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/** Same trailing window and inclusive rank convention as PE; only same-day observations enter. */
export function erpPercentiles(points: ErpPoint[]): ErpRankPoint[] {
  if (!points.length) return [];
  const result: ErpRankPoint[] = [];
  let start = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (yearsBefore(p.date, VALUATION_RULE.min_years) < points[0].date) continue;
    const cutoff = yearsBefore(p.date, VALUATION_RULE.window_years);
    while (points[start].date < cutoff) start++;
    let count = 0;
    for (let j = start; j <= i; j++) if (points[j].erp_pct <= p.erp_pct) count++;
    const exact = count / (i - start + 1) * 100;
    result.push({...p, exact, percentile: Math.round(exact * 10) / 10, window_start: points[start].date, full_window: cutoff >= points[0].date});
  }
  return result;
}

/** A display comparison: high ERP corresponds to low PE. No ERP confirmation or action rule. */
export function erpGroup(percentile: number): ValuationBand {
  if (percentile >= 70) return 'low';
  if (percentile >= 30) return 'mid';
  if (percentile >= 10) return 'high';
  return 'extreme';
}

export function erpForHistory(pe: ValuationPoint[], bonds: BondYieldPoint[], closes: TotalReturnPoint[]) {
  const daily = dailyErp(pe, bonds);
  const ranks = erpPercentiles(daily);
  const confirmed = new Map(confirmedBandDays(pe).map(p => [p.date, p.band]));
  const compared = ranks.flatMap(p => {
    const pe_band = confirmed.get(p.date);
    return pe_band === undefined ? [] : [{...p, pe_band, erp_group: erpGroup(p.exact)}];
  });
  const latest = compared.at(-1);
  if (!latest) return null;
  const share = (matching: number, n: number) => n ? matching / n * 100 : null;
  const by_pe_band = OUTCOME_BANDS.map(band => {
    const days = compared.filter(p => p.pe_band === band);
    const matching_days = days.filter(p => p.erp_group === band).length;
    return {band, label: BAND_JUDGMENTS[band].label, days: days.length, matching_days, matching_pct: share(matching_days, days.length)};
  });
  const matching_days = compared.filter(p => p.pe_band === p.erp_group).length;
  // Future samples stop at the shared evidence date, even if the return source later appends rows.
  const returns = closes.filter(p => p.date <= latest.date);
  const outcomes = calculateRuleOutcomes(ranks.map(p => ({date: p.date, band: erpGroup(p.exact)})), returns)
    .map(row => ({...row, ...ERP_GROUPS[row.band]}));
  const ordered = (key: 'one_year' | 'three_year') => outcomes.every((row, i) => row[key].mean !== null && (i === 0 || outcomes[i - 1][key].mean! > row[key].mean!));
  const conclusion = outcomes.some(row => row.three_year.mean === null)
    ? '部分 ERP 分组没有完整的 3 年样本，暂不能判断四组是否依次有效。'
    : `3 年年化均值${ordered('three_year') ? '随 ERP 分组从高到低依次降低' : '没有随 ERP 分组从高到低依次降低'}；1 年均值${ordered('one_year') ? '有同样排序' : '没有同样排序'}。`;
  return {
    as_of: latest.date,
    current: {...latest, pe_label: BAND_JUDGMENTS[latest.pe_band].label, erp_label: ERP_GROUPS[latest.erp_group].label, consistent: latest.pe_band === latest.erp_group},
    history_first: daily[0].date, joined_days: daily.length,
    pe_days_without_bond: pe.filter(p => p.date <= latest.date).length - daily.length,
    daily,
    percentiles: ranks,
    chart: ranks.filter((_, i) => i % 5 === 0 || i === ranks.length - 1).map(p => ({date: p.date, erp_pct: p.erp_pct})),
    consistency: {first: compared[0].date, last: latest.date, compared_days: compared.length, matching_days, matching_pct: share(matching_days, compared.length), by_pe_band},
    outcomes, outcome_conclusion: conclusion, returns_as_of: returns.at(-1)?.date ?? null,
    bond_source: BOND_YIELD_SOURCE,
    method: 'ERP = 1 / 滚动市盈率 − 10 年期国债到期收益率。仅匹配同日官方数据，不插值；分位是近十年 ERP 不高于当日的比例，含当日，不足十年用已有数据且至少五年。一致性按当天已确认 PE 区间对照 ERP 分位：偏低区 ↔ ≥70，中间区 ↔ 30–<70，偏高区 ↔ 10–<30，高位区 ↔ <10；ERP 本身不执行五日确认，也不改变 PE 规则。',
    outcome_method: '按当天 ERP 分位分组；复用官方全收益收盘值，持有至 1 / 3 年周年日当日或之后的首个收盘日，年化 =（期末 / 期初）^(1 / 年数) − 1。仅纳入有完整未来窗口且有当日收盘值的样本，包含分红，未扣基金费用；持有期相互重叠，统计的是指数收益。',
  };
}

export type ErpLensData = NonNullable<ReturnType<typeof erpForHistory>>;

const RETURN_SEEDS = {'000300': {data: CSI300_RETURN, source: CSI300_SOURCE}, '000905': {data: CSI500_RETURN, source: CSI500_SOURCE}, '000016': {data: SSE50_RETURN, source: SSE50_SOURCE}};

/** Fixed official snapshot, shared by the API and the offline UI; its date is always displayed. */
export function bundledErp(index: IndexCode) {
  const valuation = seedHistory(index);
  const returns = RETURN_SEEDS[index];
  const closes = returns.data.split(',').map(item => {
    const [d, value] = item.split(':');
    return {date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, close: Number(value)};
  });
  const lens = erpForHistory(valuation.points, seedBondYields(), closes)!;
  return {...lens, index_code: index, index_name: VALUATION_INDEXES[index].name, pe_source_url: valuation.source_url, total_return_code: returns.source.index_code, total_return_source_url: returns.source.url};
}
export type ErpPublication = ReturnType<typeof bundledErp>;
