import { randomUUID } from 'node:crypto';
import { sha256, stableJson } from './identity.ts';
import { mutateState, type State } from './storage.ts';
import type { FinanceVersion, SourceRef } from '../contracts/types.ts';

export const FUND_STORY_ID = 'csi300-fund-selection-20261002';
export const FUND_FIELDS = ['management', 'custody', 'service', 'total', 'subscription', 'redemption', 'trade_status', 'period_return', 'benchmark_return', 'difference', 'tracking_error', 'benchmark', 'document_date', 'fee_holding_terms', 'fee_channel_scope', 'fee_effective_from', 'fee_announcement'] as const;
export type FundField = typeof FUND_FIELDS[number];
export type FundCode = '007339' | '005658';
export type FundFact = { value: string | number; source: SourceRef };
export type FundSnapshot = { code: FundCode; checked_at: string; fields: Partial<Record<FundField, FundFact>> };
export type FundChange = { code: FundCode; field: FundField; old_value: string; new_value: string; source: SourceRef; checked_at: string };
export type FundReview = { required: true; status: 'pending' | 'approved'; reason: string; checked_at: string; changes: FundChange[] };
type FundState = State & { fund_observations?: FundSnapshot[] };
type ReviewVersion = FinanceVersion & { review?: FundReview };
export type FundUpdateResult = { status: 'unchanged' | 'draft_created' | 'no_publication'; draft_id: string | null; changes: FundChange[] };

const labels: Record<FundField, string> = { management: '管理年费率', custody: '托管年费率', service: '销售服务年费率', total: '概要综合运作年费率', subscription: '申购费', redemption: '赎回费条件', trade_status: '业务状态', period_return: '报告期收益率', benchmark_return: '报告期基准收益率', difference: '相对自身基准差额', tracking_error: '跟踪误差', benchmark: '业绩基准', document_date: '产品资料日期', fee_holding_terms: '费用适用的持有期限', fee_channel_scope: '费用适用渠道', fee_effective_from: '费用条件生效日', fee_announcement: '费用调整公告' };

// Compare fact values, never the retrieval clock or a site's formatting precision.
// Units remain significant: 0.2% and 0.2 are different facts.
export function normalizeFundValue(value: string | number): string {
 return String(value).normalize('NFKC').replace(/\s+/g, '').replace(/[+-]?\d+(?:\.\d+)?/g, number => String(Number(number)));
}

function validateSnapshots(snapshots: FundSnapshot[]): void {
 if (new Set(snapshots.map(snapshot => snapshot.code)).size !== snapshots.length) throw new Error('duplicate_fund_snapshot');
 for (const snapshot of snapshots) {
  if (!['007339', '005658'].includes(snapshot.code) || !Number.isFinite(Date.parse(snapshot.checked_at))) throw new Error('invalid_fund_snapshot');
  for (const field of Object.keys(snapshot.fields)) {
   if (!FUND_FIELDS.includes(field as FundField)) throw new Error('unsupported_fund_field');
   const fact = snapshot.fields[field as FundField];
   if (!fact) continue; // Unreturned fields do not erase previously observed facts.
   if (!String(fact.value).trim() || typeof fact.value === 'number' && !Number.isFinite(fact.value)) throw new Error('empty_fund_fact');
   const ref = fact.source;
   if (!ref || !ref.article_id || !Number.isInteger(ref.revision) || ref.revision < 1 || !ref.source || !ref.fragments?.length || ref.fragments.some(fragment => !fragment.trim())) throw new Error('fund_original_evidence_required');
   let url: URL;
   try { url = new URL(ref.url); } catch { throw new Error('invalid_fund_source_url'); }
   if (!['https:', 'http:'].includes(url.protocol)) throw new Error('invalid_fund_source_url');
  }
 }
}

function latestPublication(state: State): FinanceVersion | undefined {
 return state.finance_versions.filter(version => version.story_id === FUND_STORY_ID && version.published_at).sort((a, b) => b.version - a.version)[0];
}

function deduplicateRefs(refs: SourceRef[]): SourceRef[] {
 const result = new Map<string, SourceRef>();
 for (const ref of refs) {
  const key = ref.article_id;
  const previous = result.get(key);
  if (previous && previous.revision > ref.revision) continue;
  result.set(key, previous?.revision === ref.revision ? { ...ref, fragments: [...new Set([...previous.fragments, ...ref.fragments])] } : structuredClone(ref));
 }
 return [...result.values()];
}

function factHash(snapshots: FundSnapshot[]): string {
 return sha256(stableJson(snapshots.map(snapshot => ({ code: snapshot.code, fields: Object.fromEntries(FUND_FIELDS.flatMap(field => snapshot.fields[field] ? [[field, normalizeFundValue(snapshot.fields[field]!.value)]] : [])) })).sort((a, b) => a.code.localeCompare(b.code))));
}

/** Applies only public facts. It does not call a model, infer a trade, or publish. */
export function applyFundSnapshots(state: State, snapshots: FundSnapshot[], now = new Date().toISOString()): FundUpdateResult {
 validateSnapshots(snapshots);
 const publication = latestPublication(state);
 if (!publication?.article.operation_view) return { status: 'no_publication', draft_id: null, changes: [] };
 const fundState = state as FundState;
 const previousObservations = fundState.fund_observations ?? [];
 const merged = new Map<FundCode, FundSnapshot>(previousObservations.map(snapshot => [snapshot.code, structuredClone(snapshot)]));
 const observedChanges: FundChange[] = [];
 for (const snapshot of snapshots) {
  const current = merged.get(snapshot.code) ?? { code: snapshot.code, checked_at: snapshot.checked_at, fields: {} };
  if (Date.parse(snapshot.checked_at) < Date.parse(current.checked_at)) continue;
  const publishedFund = publication.article.operation_view.funds.find(fund => fund.code === snapshot.code);
  if (!publishedFund) throw new Error('fund_not_in_published_comparison');
  for (const field of FUND_FIELDS) {
   const next = snapshot.fields[field];
   if (!next) continue;
   const old = current.fields[field]?.value ?? publishedFund[field] ?? '未核实';
   if (normalizeFundValue(old) !== normalizeFundValue(next.value)) observedChanges.push({ code: snapshot.code, field, old_value: String(old), new_value: String(next.value), source: structuredClone(next.source), checked_at: snapshot.checked_at });
   current.fields[field] = { ...structuredClone(next), source: { ...structuredClone(next.source), checked_at: next.source.checked_at ?? snapshot.checked_at } };
  }
  current.checked_at = snapshot.checked_at;
  merged.set(snapshot.code, current);
 }
 fundState.fund_observations = [...merged.values()];
 // A newly dated but otherwise identical document is an observation, not a revised opinion.
 const substantive = observedChanges.filter(change => change.field !== 'document_date');
 if (!substantive.length) return { status: 'unchanged', draft_id: null, changes: [] };
 // A second changed field must not hide an earlier still-unreviewed difference.
 const cumulativeChanges: FundChange[] = fundState.fund_observations.flatMap(snapshot => {
  const publishedFund = publication.article.operation_view!.funds.find(fund => fund.code === snapshot.code)!;
  return FUND_FIELDS.flatMap(field => {
   const fact = snapshot.fields[field];
   const old = publishedFund[field] ?? '未核实';
   return fact && field !== 'document_date' && normalizeFundValue(old) !== normalizeFundValue(fact.value) ? [{ code: snapshot.code, field, old_value: String(old), new_value: String(fact.value), source: structuredClone(fact.source), checked_at: fact.source.checked_at ?? snapshot.checked_at }] : [];
  });
 });
 // Reversion to published facts still requires disposal of the pending assessment.
 const changes = cumulativeChanges.length ? cumulativeChanges : substantive;
 const input_hash = factHash(fundState.fund_observations);
 const latestDraft = state.finance_versions.filter(version => version.story_id === FUND_STORY_ID && !version.published_at && (version as ReviewVersion).review?.status === 'pending').sort((a, b) => b.version - a.version)[0];
 if (latestDraft?.input_hash === input_hash) return { status: 'unchanged', draft_id: latestDraft.id, changes: [] };
 const checked_at = snapshots.map(snapshot => snapshot.checked_at).sort().at(-1)!;
 const newRefs = deduplicateRefs(fundState.fund_observations.flatMap(snapshot => Object.values(snapshot.fields).flatMap(fact => fact ? [fact.source] : [])));
 const draft: ReviewVersion = {
  ...structuredClone(latestDraft?.previous_version_id===publication.id?latestDraft:publication),
  id: randomUUID(), previous_version_id: publication.id,
  version: Math.max(...state.finance_versions.filter(version => version.story_id === FUND_STORY_ID).map(version => version.version)) + 1,
  as_of: checked_at.slice(0, 10), generated_at: now, input_hash,
  input_refs: deduplicateRefs([...(latestDraft?.previous_version_id===publication.id?latestDraft.input_refs:publication.input_refs).filter(ref => !newRefs.some(next => next.article_id === ref.article_id)), ...newRefs]),
  origin: 'editor', published_at: null,
  review: { required: true, status: 'pending', reason: '公开产品事实发生变化；原操作判断仅保留为复核上下文，需人工判断维持、补充或修正后审定。', checked_at, changes,condition_changes:structuredClone(latestDraft?.previous_version_id===publication.id?latestDraft.review?.condition_changes??[]:[]) },
  changes: { kind: 'supplement', summary: '产品事实变化已形成重评估草稿，原操作判断尚未重新审定。', evidence_ids: newRefs.map(ref => ref.article_id) }
 };
 for (const fund of draft.article.operation_view!.funds) {
  const snapshot = merged.get(fund.code as FundCode);
  for (const field of FUND_FIELDS) if (snapshot?.fields[field]) {
   const fact = snapshot.fields[field]!;
   fund[field] = String(fact.value);
   fund.field_checked_at ??= {};
   fund.field_checked_at[field] = fact.source.checked_at ?? snapshot.checked_at;
   if(fund.fee_context){
    if(field==='fee_holding_terms')fund.fee_context.holding_terms=String(fact.value);
    if(field==='fee_channel_scope')fund.fee_context.channel_scope=String(fact.value);
    if(field==='fee_effective_from'&&/^\d{4}-\d{2}-\d{2}$/.test(String(fact.value)))fund.fee_context.effective_from=String(fact.value);
    if(field==='fee_announcement')fund.fee_context.announcement=structuredClone(fact.source);
    if(field.startsWith('fee_'))fund.fee_context.checked_at=fact.source.checked_at??snapshot.checked_at;
   }
  }
 }
 draft.article.sections.unshift({ heading: '待审定：产品事实发生变化', paragraphs: changes.map(change => `${change.code}的${labels[change.field]}：比较基准为${change.old_value}，本次原文为${change.new_value}（核验${change.checked_at}）。`).concat('下文动作与理由为此前已发布观点，沿用为待评估上下文，尚未作出新的判断；产品事实表已列入最新观察，需人工判断维持、补充或修正后审定。'), refs: newRefs.map(ref => ref.article_id) });
 state.finance_versions.push(draft);
 return { status: 'draft_created', draft_id: draft.id, changes };
}

export async function recordFundSnapshots(snapshots: FundSnapshot[]): Promise<FundUpdateResult> {
 return mutateState(async state => applyFundSnapshots(state, snapshots));
}

/** Public notice exposes evidence differences only, never the unreviewed trade draft. */
export function getPendingFundReviewNotice(state: State) {
 const publication = latestPublication(state);
 if (!publication) return null;
 const draft = (state.finance_versions as ReviewVersion[]).filter(version => version.story_id === FUND_STORY_ID && !version.published_at && version.previous_version_id === publication.id && version.review?.required && version.review.status === 'pending').sort((a, b) => b.version - a.version)[0];
 if (!draft?.review) return null;
 return { story_id: FUND_STORY_ID, published_version_id: publication.id, status: 'pending' as const, checked_at: draft.review.checked_at, reason: '相关资料有变化，当前操作观点正在重新评估。', changes: structuredClone(draft.review.changes),condition_changes:structuredClone(draft.review.condition_changes??[]),condition_sources:draft.input_refs.filter(r=>r.article_id.startsWith('csi300-market-')) };
}
