import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIRST_OPERATION } from '../industry/first-operation.ts';
import type { SourceRef } from '../packages/contracts/types.ts';
import type { State } from '../packages/backend/storage.ts';
import type { FundSnapshot } from '../packages/backend/fund-updates.ts';
const dir=process.env.JINGWEI_DATA_DIR!;

const { applyFundSnapshots, recordFundSnapshots, getPendingFundReviewNotice, normalizeFundValue } = await import('../packages/backend/fund-updates.ts');
const { saveState, readState } = await import('../packages/backend/storage.ts');
after(async () => { await rm(dir, { recursive: true, force: true }); });
const source: SourceRef = { article_id: 'public-fund-fixture', revision: 2, source: 'Official public fixture', url: 'https://www.efunds.com.cn/fund/007339.shtml', published_at: '2026-10-03', fragments: ['Non-secret fixture: revised service fee 0.25%.'] };
const clock = '2026-10-03T09:00:00Z';
function state(): State { return { finance_versions: [structuredClone(FIRST_OPERATION)], materials: [], events: [], tasks: [], collection_runs: [], budget: { id: 'preserved-ledger', limit_micro_cny: 10000000, reserved_micro_cny: 171322, approved_at: '2026-10-02', reservations: [] } }; }
function snapshot(value = '0.25%', checked_at = clock): FundSnapshot { return { code: '007339', checked_at, fields: { service: { value, source: structuredClone(source) } } }; }

test('费率变化生成待审草稿，已发布版本与动作不变，保留来源revision', () => {
 const current = state(); const original = JSON.stringify(current.finance_versions[0]);
 const result = applyFundSnapshots(current, [snapshot()], clock);
 assert.equal(result.status, 'draft_created'); assert.equal(current.finance_versions.length, 2);
 const draft = current.finance_versions[1];
 assert.equal(draft.previous_version_id, FIRST_OPERATION.id); assert.equal(draft.version, 2); assert.equal(draft.published_at, null); assert.equal(draft.origin, 'editor');
 assert.equal(draft.article.slug, FIRST_OPERATION.article.slug); assert.deepEqual(draft.article.operation_view!.held, FIRST_OPERATION.article.operation_view!.held); assert.deepEqual(draft.article.operation_view!.unheld, FIRST_OPERATION.article.operation_view!.unheld);
 assert.equal(draft.article.operation_view!.funds[0].service, '0.25%');
 assert.equal(draft.review?.required, true); assert.equal(draft.review?.status, 'pending');
 assert.equal(draft.input_refs.find(ref => ref.article_id === source.article_id)?.revision, 2);
 assert.equal(JSON.stringify(current.finance_versions[0]), original);
 const notice = getPendingFundReviewNotice(current)!;
 assert.equal(notice.changes[0].old_value, '0.20%'); assert.equal(notice.changes[0].new_value, '0.25%'); assert.equal(notice.changes[0].source.url, source.url);
 assert.ok(!('article' in notice)); assert.ok(!('held' in notice));
});

test('数字精度、空白、来源修订和核验时间不制造观点更新', () => {
 const current = state();
 assert.equal(normalizeFundValue(' ０.２０ % '), normalizeFundValue('0.2%'));
 assert.notEqual(normalizeFundValue('0.2'), normalizeFundValue('0.2%'));
 assert.equal(applyFundSnapshots(current, [snapshot(' 0.200 % ')]).status, 'unchanged');
 const later = snapshot('0.20%', '2026-10-04T09:00:00Z'); later.fields.service!.source = { ...source, revision: 3 };
 assert.equal(applyFundSnapshots(current, [later]).status, 'unchanged'); assert.equal(current.finance_versions.length, 1); assert.equal(getPendingFundReviewNotice(current), null);
});

test('重复输入不重复草稿；缺失字段保留上一观察，不删费率事实', () => {
 const current = state(); const changed = applyFundSnapshots(current, [snapshot()]);
 assert.equal(applyFundSnapshots(current, [snapshot()]).status, 'unchanged');
 assert.equal(applyFundSnapshots(current, [{ code: '007339', checked_at: '2026-10-04', fields: {} }]).status, 'unchanged');
 assert.equal(applyFundSnapshots(current, [snapshot('0.25%', '2026-10-05')]).status, 'unchanged');
 assert.equal(current.finance_versions.length, 2); assert.equal(getPendingFundReviewNotice(current)!.changes[0].new_value, '0.25%');
 assert.equal(changed.draft_id, current.finance_versions[1].id);
});

test('后续字段变化保留未审费用差异，同一故事版本递增并指向已刊版', () => {
 const current = state(); applyFundSnapshots(current, [snapshot()]);
 const next: FundSnapshot = { code: '007339', checked_at: '2026-10-04', fields: { trade_status: { value: '暂停申购，赎回开放', source: { ...source, article_id: 'trade-public-fixture', fragments: ['Non-secret fixture: subscriptions suspended.'] } } } };
 const result = applyFundSnapshots(current, [next]);
 assert.equal(result.status, 'draft_created'); assert.equal(current.finance_versions.at(-1)!.version, 3); assert.equal(current.finance_versions.at(-1)!.previous_version_id, FIRST_OPERATION.id);
 assert.deepEqual(getPendingFundReviewNotice(current)!.changes.map(change => change.field), ['service', 'trade_status']);
 assert.equal(current.finance_versions.at(-1)!.article.operation_view!.funds[0].service, '0.25%');
 assert.equal(current.finance_versions.at(-1)!.input_refs.find(ref => ref.article_id === source.article_id)?.revision, 2);
});

test('仅新文档日期或迟到旧观察不产生事实变化草稿', () => {
 const current = state();
 const document: FundSnapshot = { code: '007339', checked_at: clock, fields: { document_date: { value: '2026-10-03', source } } };
 assert.equal(applyFundSnapshots(current, [document]).status, 'unchanged');
 applyFundSnapshots(current, [snapshot('0.25%', '2026-10-05')]);
 assert.equal(applyFundSnapshots(current, [snapshot('0.20%', '2026-10-04')]).status, 'unchanged'); assert.equal(current.finance_versions.length, 2);
});

test('新事实需原文；无已发布观点不造操作文章', () => {
 const current = state(); const invalid = snapshot(); invalid.fields.service!.source.fragments = [];
 assert.throws(() => applyFundSnapshots(current, [invalid]), /fund_original_evidence_required/);
 assert.throws(() => applyFundSnapshots(current, [snapshot(), snapshot()]), /duplicate_fund_snapshot/);
 current.finance_versions = []; assert.equal(applyFundSnapshots(current, [snapshot()]).status, 'no_publication');
});

test('真实事实回转生成最新复核草稿，而非复用旧hash遮住后来事实', () => {
 const current = state(); applyFundSnapshots(current, [snapshot()]);
 applyFundSnapshots(current, [snapshot('0.30%', '2026-10-04')]);
 assert.equal(applyFundSnapshots(current, [snapshot('0.25%', '2026-10-05')]).status, 'draft_created');
 assert.equal(current.finance_versions.at(-1)!.version, 4); assert.equal(getPendingFundReviewNotice(current)!.changes[0].new_value, '0.25%');
 assert.equal(applyFundSnapshots(current, [snapshot('0.25%', '2026-10-06')]).status, 'unchanged');
 assert.equal(current.finance_versions.length, 4);
});

test('新的人工已刊版替代旧意见后，不公开旧草稿的待审通知', () => {
 const current = state(); applyFundSnapshots(current, [snapshot()]);
 const reviewed = structuredClone(current.finance_versions[1]); reviewed.id = 'reviewed-fixture'; reviewed.version = 3; reviewed.published_at = '2026-10-04'; reviewed.review!.status = 'approved'; current.finance_versions.push(reviewed);
 assert.equal(getPendingFundReviewNotice(current), null);
 assert.equal(applyFundSnapshots(current, [snapshot('0.25%', '2026-10-05')]).status, 'unchanged');
});

test('实际存储走mutateState保留账本，公开观察和草稿可跨读取恢复', async () => {
 const current = state(); await saveState(current);
 const result = await recordFundSnapshots([snapshot()]); assert.equal(result.status, 'draft_created');
 const saved = await readState(); assert.deepEqual(saved.budget, current.budget);
 assert.equal(saved.fund_observations?.[0].fields.service?.value, '0.25%'); assert.equal(saved.finance_versions[1].published_at, null);
 await recordFundSnapshots([snapshot()]); assert.equal((await readState()).finance_versions.length, 2);
});

test('费率数字未变时，首次核实持有条件、渠道、生效日和公告仍需人工复核', () => {
 const current = state(); const publishedFund = current.finance_versions[0].article.operation_view!.funds[0];
 delete publishedFund.fee_holding_terms; delete publishedFund.fee_channel_scope; delete publishedFund.fee_effective_from; delete publishedFund.fee_announcement;
 const ruleSource = { ...structuredClone(source), article_id: 'public-fee-rule-fixture', fragments: ['Non-secret fixture: fee condition applies to stated holding period and distribution channel from 2026-10-03.'] };
 const rules: FundSnapshot = { code: '007339', checked_at: clock, fields: {
  service: { value: '0.20%', source: ruleSource },
  fee_holding_terms: { value: '持有满365日适用公告列明条件', source: ruleSource },
  fee_channel_scope: { value: '仅官网直销渠道', source: ruleSource },
  fee_effective_from: { value: '2026-10-03', source: ruleSource },
  fee_announcement: { value: '费用条件调整公告（隔离测试）', source: ruleSource }
 } };
 const original = JSON.stringify(current.finance_versions[0]); const result = applyFundSnapshots(current, [rules]);
 assert.equal(result.status, 'draft_created'); assert.equal(result.changes.length, 4);
 assert.ok(result.changes.every(change => change.old_value === '未核实')); assert.ok(!result.changes.some(change => change.field === 'service'));
 const draft = current.finance_versions.at(-1)!; assert.equal(draft.review!.status, 'pending'); assert.equal(draft.published_at, null);
 assert.equal(draft.article.operation_view!.funds[0].service, '0.20%'); assert.equal(draft.article.operation_view!.funds[0].fee_channel_scope, '仅官网直销渠道');
 assert.equal(draft.article.operation_view!.funds[0].field_checked_at!.fee_channel_scope, clock);
 assert.ok(!draft.article.sections[0].paragraphs.join('').includes('undefined')); assert.equal(JSON.stringify(current.finance_versions[0]), original);
});

test('新增费用条件保留待审市场条件、来源和原动作，不另作买卖判断', () => {
 const current = state(); const pending = structuredClone(FIRST_OPERATION); pending.id = 'pending-market-fixture'; pending.version = 2; pending.previous_version_id = FIRST_OPERATION.id; pending.published_at = null;
 const marketRef = { ...structuredClone(source), article_id: 'csi300-market-fixture', fragments: ['Non-secret fixture: market evidence awaiting review.'] };
 pending.review = { required: true, status: 'pending', reason: '市场条件待核', checked_at: clock, changes: [], condition_changes: ['估值观察条件发生变化，尚未审定'] };
 pending.input_refs.push(marketRef); pending.article.operation_view!.market = { as_of: '2026-10-02', close: 4000, pe_ttm: 12, pb: 1.2, dividend_yield: 3, previous_year_end: { pe_ttm: 11, pb: 1.1 }, daily: [], source: marketRef };
 pending.article.operation_view!.research_conditions = [{ key: 'fixture-market-condition', label: '估值条件', baseline: '隔离基线', watch: '隔离观察', trigger: '原文变化后人工复核', automatic: false }];
 current.finance_versions.push(pending);
 const rule: FundSnapshot = { code: '007339', checked_at: '2026-10-04', fields: { fee_holding_terms: { value: '持有满730日适用明确公告条件', source } } };
 assert.equal(applyFundSnapshots(current, [rule]).status, 'draft_created'); const draft = current.finance_versions.at(-1)!;
 assert.deepEqual(draft.review!.condition_changes, pending.review.condition_changes); assert.deepEqual(draft.article.operation_view!.market, pending.article.operation_view!.market);
 assert.deepEqual(draft.article.operation_view!.research_conditions, pending.article.operation_view!.research_conditions);
 assert.deepEqual(draft.article.operation_view!.held, FIRST_OPERATION.article.operation_view!.held); assert.deepEqual(draft.article.operation_view!.unheld, FIRST_OPERATION.article.operation_view!.unheld);
 assert.ok(draft.input_refs.some(ref => ref.article_id === marketRef.article_id)); assert.equal(getPendingFundReviewNotice(current)!.condition_sources[0].article_id, marketRef.article_id);
});

test('费用条件生效日实质变化触发草稿，缺字段保留条件及各字段真实核验日期', () => {
 const current = state(); const fund = current.finance_versions[0].article.operation_view!.funds[0];
 fund.fee_effective_from = '2026-01-01'; fund.fee_channel_scope = '所有渠道';
 applyFundSnapshots(current, [snapshot('0.20%', '2026-10-03')]);
 assert.equal(applyFundSnapshots(current, [{ code: '007339', checked_at: '2026-10-04', fields: { document_date: { value: '2026-10-04', source } } }]).status, 'unchanged');
 const dated: FundSnapshot = { code: '007339', checked_at: '2026-10-05', fields: { fee_effective_from: { value: '2026-11-01', source } } };
 assert.equal(applyFundSnapshots(current, [dated]).status, 'draft_created');
 assert.equal(applyFundSnapshots(current, [{ code: '007339', checked_at: '2026-10-06', fields: {} }]).status, 'unchanged');
 const channel: FundSnapshot = { code: '007339', checked_at: '2026-10-07', fields: { fee_channel_scope: { value: '仅直销渠道', source } } };
 assert.equal(applyFundSnapshots(current, [channel]).status, 'draft_created');
 const latest = current.finance_versions.at(-1)!.article.operation_view!.funds[0];
 assert.equal(latest.fee_effective_from, '2026-11-01'); assert.equal(latest.field_checked_at!.service, '2026-10-03'); assert.equal(latest.field_checked_at!.fee_effective_from, '2026-10-05'); assert.equal(latest.field_checked_at!.fee_channel_scope, '2026-10-07');
 assert.equal(fund.fee_effective_from, '2026-01-01'); assert.equal(fund.document_date, FIRST_OPERATION.article.operation_view!.funds[0].document_date);
});
