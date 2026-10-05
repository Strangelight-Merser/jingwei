import { randomUUID } from 'node:crypto';
import type { FinanceVersion, MarketEvidence, SourceRef } from '../contracts/types.ts';
import type { MarketSnapshot } from './market-sources.ts';
import { FUND_STORY_ID } from './fund-updates.ts';
import { mutateState, type State } from './storage.ts';
import { sha256, stableJson } from './identity.ts';

export type MarketUpdateResult = {
 status: 'unchanged' | 'draft_created' | 'no_publication';
 draft_id: string | null;
 condition_changes: string[];
 daily_window: { trading_days: number; complete: boolean; price_change_pct: number | null };
};

const pendingHeading = '待审定：市场判断条件发生变化';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function validDate(date: string): boolean {
 return datePattern.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

function validateSnapshot(snapshot: MarketSnapshot): void {
 if (snapshot.index_code !== '000300' || !validDate(snapshot.as_of) || !Number.isFinite(Date.parse(snapshot.checked_at)) || snapshot.valuation.as_of !== snapshot.as_of) throw new Error('invalid_market_snapshot');
 const values = [snapshot.close, snapshot.valuation.pe_ttm, snapshot.valuation.pb, snapshot.valuation.prior_year_end.pe_ttm, snapshot.valuation.prior_year_end.pb];
 if (values.some(value => !Number.isFinite(value) || value <= 0) || !Number.isFinite(snapshot.valuation.dividend_yield_pct) || snapshot.valuation.dividend_yield_pct < 0) throw new Error('invalid_market_value');
 if (!snapshot.hash || !snapshot.sources.length || !snapshot.sources.some(source => source.kind === 'valuation') || !snapshot.sources.some(source => source.kind === 'daily')) throw new Error('market_original_evidence_required');
 for (const source of snapshot.sources) {
  let url: URL;
  try { url = new URL(source.url); } catch { throw new Error('invalid_market_source_url'); }
  if (!['https:', 'http:'].includes(url.protocol) || !validDate(source.as_of)) throw new Error('invalid_market_source_url');
 }
 if (!snapshot.daily.length || snapshot.daily.length > 20) throw new Error('invalid_market_daily_window');
 for (let i = 0; i < snapshot.daily.length; i++) {
  const day = snapshot.daily[i];
  // Rows represent actual published sessions, never interpolated calendar days.
  if (!validDate(day.date) || day.date > snapshot.as_of || !Number.isFinite(day.close) || day.close <= 0 || [0, 6].includes(new Date(day.date).getUTCDay()) || i > 0 && snapshot.daily[i - 1].date >= day.date) throw new Error('invalid_market_daily_window');
 }
 const last = snapshot.daily.at(-1)!;
 if (last.date !== snapshot.as_of || last.close !== snapshot.close) throw new Error('market_dates_not_aligned');
}

function dailyWindow(snapshot: MarketSnapshot): MarketUpdateResult['daily_window'] {
 const complete = snapshot.daily.length === 20;
 return { trading_days: snapshot.daily.length, complete, price_change_pct: complete ? (snapshot.daily.at(-1)!.close / snapshot.daily[0].close - 1) * 100 : null };
}

function sourceRefs(snapshot: MarketSnapshot): SourceRef[] {
 return snapshot.sources.map(source => ({
  article_id: `csi300-market-${source.kind}-${source.as_of}-${snapshot.hash.slice(0, 12)}`, revision: 1,
  source: '中证指数有限公司', url: source.url, published_at: '', data_as_of: source.as_of, checked_at: snapshot.checked_at,
  fragments: source.kind === 'valuation'
   ? [`${snapshot.valuation.as_of}沪深300滚动市盈率${snapshot.valuation.pe_ttm}倍，市净率${snapshot.valuation.pb}倍；同源去年底分别为${snapshot.valuation.prior_year_end.pe_ttm}倍、${snapshot.valuation.prior_year_end.pb}倍。`]
   : source.kind === 'daily'
    ? [`${snapshot.as_of}沪深300价格指数收盘${snapshot.close}点；公开行情窗口含${snapshot.daily.length}个实际交易日，不含分红再投资。`]
    : [`${snapshot.as_of}沪深300滚动市盈率${snapshot.valuation.pe_ttm}倍；已按实际行情交易日期对齐，未把非交易日估值行当行情。`]
 }));
}

function mergeRefs(refs: SourceRef[]): SourceRef[] {
 const merged = new Map<string, SourceRef>();
 for (const ref of refs) {
  const previous = merged.get(ref.article_id);
  if (previous && previous.revision > ref.revision) continue;
  merged.set(ref.article_id, previous?.revision === ref.revision ? { ...structuredClone(ref), fragments: [...new Set([...previous.fragments, ...ref.fragments])] } : structuredClone(ref));
 }
 return [...merged.values()];
}

function marketEvidence(snapshot: MarketSnapshot, refs: SourceRef[]): MarketEvidence {
 return {
  as_of: snapshot.as_of, close: snapshot.close,
  pe_ttm: snapshot.valuation.pe_ttm, pb: snapshot.valuation.pb,
  dividend_yield: snapshot.valuation.dividend_yield_pct,
  previous_year_end: { pe_ttm: snapshot.valuation.prior_year_end.pe_ttm, pb: snapshot.valuation.prior_year_end.pb },
  daily: snapshot.daily.map(({ date, close }) => ({ date, close })),
  source: refs.find(ref => ref.article_id.includes('-valuation-'))!,
 };
}

function condition(market: MarketEvidence): boolean {
 return market.pe_ttm < market.previous_year_end.pe_ttm && market.pb < market.previous_year_end.pb;
}

/** Records public market observations and condition changes; never infers or publishes a trade. */
export function applyMarketSnapshot(state: State, snapshot: MarketSnapshot, now = new Date().toISOString()): MarketUpdateResult {
 validateSnapshot(snapshot);
 const daily_window = dailyWindow(snapshot);
 const publication = state.finance_versions.filter(version => version.story_id === FUND_STORY_ID && version.published_at).sort((a, b) => b.version - a.version)[0];
 const previousObservation = state.market_observations?.filter(observation => observation.index_code === snapshot.index_code).sort((a, b) => b.as_of.localeCompare(a.as_of) || b.checked_at.localeCompare(a.checked_at))[0];
 const latestDate = [previousObservation?.as_of, publication?.article.operation_view?.market?.as_of].filter((date): date is string => Boolean(date)).sort().at(-1);
 if (latestDate && snapshot.as_of < latestDate) return { status: 'unchanged', draft_id: null, condition_changes: [], daily_window };
 if (previousObservation?.as_of === snapshot.as_of && Date.parse(snapshot.checked_at) < Date.parse(previousObservation.checked_at)) return { status: 'unchanged', draft_id: null, condition_changes: [], daily_window };
 if (previousObservation?.hash === snapshot.hash) {
  // A successful repeated check is still a check. Refresh only the observation's
  // timestamp; the published article and its immutable evidence retain their dates.
  state.market_observations=state.market_observations?.map(observation=>observation===previousObservation?{...observation,checked_at:snapshot.checked_at}:observation);
  return { status: 'unchanged', draft_id: null, condition_changes: [], daily_window };
 }
 // Keep only the latest complete observation for this index; missing market values are rejected above.
 state.market_observations = [...(state.market_observations ?? []).filter(observation => observation.index_code !== snapshot.index_code), structuredClone(snapshot)];
 if (!publication?.article.operation_view?.market) return { status: 'no_publication', draft_id: null, condition_changes: [], daily_window };
 const refs = sourceRefs(snapshot);
 const nextMarket = marketEvidence(snapshot, refs);
 const latestPending = state.finance_versions.filter(version => version.story_id === FUND_STORY_ID && !version.published_at && version.previous_version_id === publication.id && version.review?.status === 'pending').sort((a, b) => b.version - a.version)[0];
 const previousMarket = previousObservation ? marketEvidence(previousObservation, sourceRefs(previousObservation)) : latestPending?.article.operation_view?.market ?? publication.article.operation_view.market;
 // The boundary is the published factual claim, not an unvalidated risk or return threshold.
 // Date-only changes, daily declines and movements within the same condition do not revise opinions.
 if (condition(previousMarket) === condition(nextMarket)) return { status: 'unchanged', draft_id: null, condition_changes: [], daily_window };
 const inside = condition(nextMarket);
 const failed: string[] = [];
 if (nextMarket.pe_ttm >= nextMarket.previous_year_end.pe_ttm) failed.push(`滚动市盈率${nextMarket.pe_ttm}倍已不低于同源去年底${nextMarket.previous_year_end.pe_ttm}倍`);
 if (nextMarket.pb >= nextMarket.previous_year_end.pb) failed.push(`市净率${nextMarket.pb}倍已不低于同源去年底${nextMarket.previous_year_end.pb}倍`);
 const change = inside
  ? `${nextMarket.as_of}：滚动市盈率${nextMarket.pe_ttm}倍和市净率${nextMarket.pb}倍重新同时低于同源去年底${nextMarket.previous_year_end.pe_ttm}倍和${nextMarket.previous_year_end.pb}倍；此前待评估的边界变化已回转，仍需人工核实，不能自动恢复或增加仓位。`
  : `${nextMarket.as_of}：${failed.join('；')}，此前“PE与PB均低于去年底”的市场条件不再同时成立，需重新评估原论点；这不是自动减仓信号。`;
 const condition_changes = [...new Set([...(latestPending?.review?.condition_changes ?? []), change])];
 // A market assessment must not discard pending product facts or their evidence.
 const context = latestPending ?? publication;
 const draft: FinanceVersion = {
  ...structuredClone(context), id: randomUUID(), previous_version_id: publication.id,
  version: Math.max(...state.finance_versions.filter(version => version.story_id === FUND_STORY_ID).map(version => version.version)) + 1,
  as_of: [publication.as_of, context.as_of, snapshot.checked_at.slice(0, 10), snapshot.as_of].sort().at(-1)!, generated_at: now,
  input_hash: sha256(stableJson({ publication: publication.id, market: snapshot.hash, fund_changes: context.review?.changes ?? [], condition_changes })),
  input_refs: mergeRefs([...context.input_refs, ...refs]), origin: 'editor', published_at: null,
  review: { required: true, status: 'pending', checked_at: snapshot.checked_at, reason: '市场判断条件发生变化；原动作与理由保留为复核上下文，需人工重新评估后审定。', changes: structuredClone(latestPending?.review?.changes ?? []), condition_changes },
  changes: { kind: 'supplement', summary: '市场事实边界变化已形成待审草稿，原操作判断尚未重新审定。', evidence_ids: [...new Set([...context.changes.evidence_ids, ...refs.map(ref => ref.article_id)])] },
 };
 draft.article.operation_view!.market = nextMarket;
 for (const researchCondition of draft.article.operation_view!.research_conditions ?? []) {
  if (researchCondition.key === 'valuation_claim') researchCondition.baseline = `${nextMarket.as_of}：滚动市盈率${nextMarket.pe_ttm}倍，市净率${nextMarket.pb}倍；同源去年底分别为${nextMarket.previous_year_end.pe_ttm}倍、${nextMarket.previous_year_end.pb}倍。${inside ? '两项仍同时低于去年底。' : '两项已不再同时低于去年底，等待重新审定。'}`;
 }
 draft.article.sections = draft.article.sections.filter(section => section.heading !== pendingHeading);
 draft.article.sections.unshift({ heading: pendingHeading, paragraphs: [change, '下文操作动作仍为已刊观点的待评估上下文；这里只更新市场资料，日频走势仅作背景，没有生成或发布新交易判断。'], refs: refs.map(ref => ref.article_id) });
 state.finance_versions.push(draft);
 return { status: 'draft_created', draft_id: draft.id, condition_changes, daily_window };
}

export async function recordMarketSnapshot(snapshot: MarketSnapshot): Promise<MarketUpdateResult> {
 return mutateState(async state => applyMarketSnapshot(state, snapshot));
}
