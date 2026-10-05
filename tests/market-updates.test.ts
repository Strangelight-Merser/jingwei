import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { FIRST_OPERATION } from '../industry/first-operation.ts';
import type { MarketEvidence, SourceRef } from '../packages/contracts/types.ts';
import type { MarketSnapshot } from '../packages/backend/market-sources.ts';
import type { State } from '../packages/backend/storage.ts';

const dir=process.env.JINGWEI_DATA_DIR!;

const { applyMarketSnapshot, recordMarketSnapshot } = await import('../packages/backend/market-updates.ts');
const { applyFundSnapshots } = await import('../packages/backend/fund-updates.ts');
const { saveState, readState } = await import('../packages/backend/storage.ts');
after(async () => { await rm(dir, { recursive: true, force: true }); });
const clock = '2026-10-02T10:00:00Z';
const source: SourceRef = { article_id: 'non-secret-market-fixture', revision: 1, source: 'Official public fixture', url: 'https://www.csindex.com.cn/#/indices/family/detail?indexCode=000300', published_at: '2026-08-31', fragments: ['Non-secret test fixture; these numbers are not real observations.'] };
const publishedMarket: MarketEvidence = { as_of: '2026-08-31', close: 4500, pe_ttm: 14, pb: 1.4, dividend_yield: 2.2, previous_year_end: { pe_ttm: 15, pb: 1.5 }, daily: [{ date: '2026-08-31', close: 4500 }], source };
function state(): State {
 const publication = structuredClone(FIRST_OPERATION);
 publication.article.operation_view!.market = structuredClone(publishedMarket);
 publication.article.operation_view!.research_conditions = [{ key: 'valuation_claim', label: '年末事实比较', baseline: '2026-08-31：14倍、1.4倍', watch: '新官方资料', trigger: '事实边界变化', automatic: false }];
 return { finance_versions: [publication], materials: [], events: [], tasks: [], collection_runs: [], budget: { id: 'preserved-ledger', limit_micro_cny: 10000000, reserved_micro_cny: 171322, approved_at: '2026-10-02', reservations: [] } };
}

// Explicit synthetic weekday rows; no HTTP or calendar interpolation in production.
function rows(end: string, count: number, finalClose = 4350): MarketSnapshot['daily'] {
 const dates: string[] = [], date = new Date(end);
 while (dates.length < count) { if (![0, 6].includes(date.getUTCDay())) dates.unshift(date.toISOString().slice(0, 10)); date.setUTCDate(date.getUTCDate() - 1); }
 return dates.map((date, i) => ({ date, open: finalClose, high: finalClose, low: finalClose, close: i === dates.length - 1 ? finalClose : 4500, price_change: 0, price_change_pct: 0, pe_ttm: 14 }));
}
function snapshot(pe = 14, pb = 1.4, as_of = '2026-09-30', count = 20, close = 4350): MarketSnapshot {
 return { index_code: '000300', index_name: '沪深300', checked_at: clock, as_of, close,
  valuation: { as_of, pe_static: pe, pe_ttm: pe, pb, dividend_yield_pct: 2.2, prior_year_end: { pe_static: 15, pe_ttm: 15, pb: 1.5 } },
  daily: rows(as_of, count, close),
  sources: [{ kind: 'valuation', url: source.url, as_of }, { kind: 'daily', url: source.url, as_of }, { kind: 'daily_valuation', url: source.url, as_of }],
  warnings: count < 20 ? ['不足20个实际交易日'] : [], hash: createHash('sha256').update(JSON.stringify({as_of, pe, pb, count, close})).digest('hex'),
 };
}

test('同源年末事实边界变化产生待审草稿，动作和刊发版不变', () => {
 const current = state(), original = JSON.stringify(current.finance_versions[0]);
 const result = applyMarketSnapshot(current, snapshot(15), clock);
 assert.equal(result.status, 'draft_created');
 const draft = current.finance_versions.at(-1)!;
 assert.equal(draft.published_at, null); assert.equal(draft.previous_version_id, current.finance_versions[0].id);
 assert.equal(draft.review?.required, true); assert.equal(draft.review?.status, 'pending'); assert.deepEqual(draft.review?.changes, []);
 assert.match(draft.review?.condition_changes?.[0] ?? '', /滚动市盈率15倍已不低于/);
 assert.deepEqual(draft.article.operation_view!.held, current.finance_versions[0].article.operation_view!.held);
 assert.deepEqual(draft.article.operation_view!.unheld, current.finance_versions[0].article.operation_view!.unheld);
 assert.equal(draft.article.operation_view!.market?.as_of, '2026-09-30');
 const marketRef = draft.input_refs.find(ref => ref.article_id === `csi300-market-valuation-2026-09-30-${snapshot(15).hash.slice(0, 12)}`)!;
 assert.equal(marketRef.url, source.url); assert.equal(marketRef.published_at, '');
 assert.equal(marketRef.data_as_of, '2026-09-30'); assert.equal(marketRef.checked_at, clock);
 assert.equal(draft.as_of, '2026-10-02');
 assert.match(draft.article.operation_view!.research_conditions![0].baseline, /2026-09-30.*15倍.*1.4倍.*去年底.*15倍.*1.5倍/);
 assert.match(draft.article.operation_view!.research_conditions![0].baseline, /不再同时低于/);
 assert.equal(JSON.stringify(current.finance_versions[0]), original);
 assert.equal(current.market_observations?.[0].valuation.pe_ttm, 15);
});

test('PB达到年末同样需要重评估；无需PE也越界', () => {
 const current = state();
 assert.equal(applyMarketSnapshot(current, snapshot(14, 1.5)).status, 'draft_created');
 assert.match(current.finance_versions.at(-1)!.review!.condition_changes![0], /市净率1.5倍已不低于/);
});

test('重复、核验时间或日期变化，不在同一条件内不断制造新版本', () => {
 const current = state(); const initial = snapshot();
 assert.equal(applyMarketSnapshot(current, initial).status, 'unchanged');
 assert.equal(applyMarketSnapshot(current, { ...initial, checked_at: '2026-10-03T10:00:00Z' }).status, 'unchanged');
 assert.equal(applyMarketSnapshot(current, snapshot(14, 1.4, '2026-10-05')).status, 'unchanged');
 assert.equal(current.finance_versions.length, 1);
 assert.equal(current.market_observations?.[0].as_of, '2026-10-05');
 assert.equal(current.finance_versions[0].article.operation_view!.market!.as_of, '2026-08-31');
 applyMarketSnapshot(current, snapshot(15, 1.4, '2026-10-06'));
 assert.equal(applyMarketSnapshot(current, snapshot(15.2, 1.4, '2026-10-07')).status, 'unchanged');
 assert.equal(current.finance_versions.length, 2);
});

test('旧日期观察不能回滚最新资料或对待审边界伪造回转', () => {
 const current = state(); applyMarketSnapshot(current, snapshot(15));
 assert.equal(applyMarketSnapshot(current, snapshot(14, 1.4, '2026-09-29')).status, 'unchanged');
 assert.equal(current.market_observations?.[0].as_of, '2026-09-30'); assert.equal(current.finance_versions.length, 2);
 assert.equal(applyMarketSnapshot(current, { ...snapshot(14), checked_at: '2026-10-01T10:00:00Z' }).status, 'unchanged');
 assert.equal(current.market_observations?.[0].valuation.pe_ttm, 15);
 const noObservation = state();
 assert.equal(applyMarketSnapshot(noObservation, snapshot(15, 1.4, '2026-08-28')).status, 'unchanged');
 assert.equal(noObservation.market_observations, undefined);
});

test('待审条件回到原范围仍生成复核，累积保留变化并指向已刊版', () => {
 const current = state(); applyMarketSnapshot(current, snapshot(15));
 const result = applyMarketSnapshot(current, snapshot(14.5, 1.45, '2026-10-05'));
 assert.equal(result.status, 'draft_created');
 const draft = current.finance_versions.at(-1)!;
 assert.equal(draft.version, current.finance_versions[0].version + 2);
 assert.equal(draft.previous_version_id, current.finance_versions[0].id);
 assert.equal(draft.review?.condition_changes?.length, 2);
 assert.match(draft.review!.condition_changes![1], /重新同时低于/);
 assert.match(draft.article.operation_view!.research_conditions![0].baseline, /2026-10-05.*14.5倍.*1.45倍/);
 assert.equal(draft.article.sections.filter(section => section.heading === '待审定：市场判断条件发生变化').length, 1);
 assert.equal(applyMarketSnapshot(current, snapshot(14.5, 1.45, '2026-10-06')).status, 'unchanged');
});

test('同日原文更正采用新hash与独立证据标识，回转也不能被去重遮住', () => {
 const current = state();
 const outside = snapshot(15), inside = snapshot(14.5);
 applyMarketSnapshot(current, outside);
 assert.equal(applyMarketSnapshot(current, inside).status, 'draft_created');
 const draft = current.finance_versions.at(-1)!;
 const originalRef = draft.input_refs.find(ref => ref.article_id === `csi300-market-valuation-2026-09-30-${outside.hash.slice(0, 12)}`)!;
 const correctedRef = draft.input_refs.find(ref => ref.article_id === `csi300-market-valuation-2026-09-30-${inside.hash.slice(0, 12)}`)!;
 assert.ok(originalRef && correctedRef); assert.notEqual(originalRef.article_id, correctedRef.article_id);
 assert.equal(originalRef.fragments.length, 1); assert.equal(correctedRef.fragments.length, 1);
 assert.match(correctedRef.fragments[0], /14.5倍/); assert.doesNotMatch(correctedRef.fragments[0], /滚动市盈率15倍/);
 assert.equal(current.market_observations?.[0].hash, inside.hash);
 assert.equal(applyMarketSnapshot(current, inside).status, 'unchanged');
});

test('市场草稿保留既有未审费率事实、sources和review变化', () => {
 const current = state();
 const fundSource = { ...source, article_id: 'non-secret-fund-fixture', url: 'https://www.efunds.com.cn/fund/007339.shtml', fragments: ['Non-secret fixture: service fee 0.25%.'] };
 applyFundSnapshots(current, [{ code: '007339', checked_at: clock, fields: { service: { value: '0.25%', source: fundSource } } }]);
 const fundDraft = structuredClone(current.finance_versions.at(-1)!);
 const result = applyMarketSnapshot(current, snapshot(15)); assert.equal(result.status, 'draft_created');
 const marketDraft = current.finance_versions.at(-1)!;
 assert.deepEqual(marketDraft.review?.changes, fundDraft.review?.changes);
 assert.equal(marketDraft.article.operation_view!.funds[0].service, '0.25%');
 assert.ok(marketDraft.input_refs.some(ref => ref.article_id === fundSource.article_id));
 assert.ok(marketDraft.article.sections.some(section => section.heading === '待审定：产品事实发生变化'));
 assert.equal(marketDraft.previous_version_id, current.finance_versions[0].id);
 assert.equal(marketDraft.version, fundDraft.version + 1);
 assert.ok(marketDraft.as_of >= fundDraft.as_of);
});

test('20日仅为完整行情背景，严重价格下跌也不自动触发操作草稿', () => {
 const current = state(); const incomplete = applyMarketSnapshot(current, snapshot(14, 1.4, '2026-09-29', 19, 3500));
 assert.equal(incomplete.status, 'unchanged'); assert.equal(incomplete.daily_window.complete, false); assert.equal(incomplete.daily_window.price_change_pct, null);
 const complete = applyMarketSnapshot(current, snapshot(14, 1.4, '2026-09-30', 20, 3500));
 assert.equal(complete.status, 'unchanged'); assert.equal(complete.daily_window.complete, true);
 assert.ok(complete.daily_window.price_change_pct! < -10); assert.equal(current.finance_versions.length, 1);
});

test('不把重复、周末、日期不齐和缺失估值当作新的真实行情', () => {
 const duplicate = snapshot(); duplicate.daily[1].date = duplicate.daily[0].date;
 assert.throws(() => applyMarketSnapshot(state(), duplicate), /invalid_market_daily_window/);
 const weekend = snapshot(); weekend.daily[0].date = '2026-09-05';
 assert.throws(() => applyMarketSnapshot(state(), weekend), /invalid_market_daily_window/);
 const unaligned = snapshot(); unaligned.valuation.as_of = '2026-09-29';
 assert.throws(() => applyMarketSnapshot(state(), unaligned), /invalid_market_snapshot/);
 const invalid = snapshot(); invalid.valuation.pe_ttm = Number.NaN;
 assert.throws(() => applyMarketSnapshot(state(), invalid), /invalid_market_value/);
 const noSource = snapshot(); noSource.sources = [];
 assert.throws(() => applyMarketSnapshot(state(), noSource), /market_original_evidence_required/);
});

test('未刊发市场论点时只存观察，不构造新的操作文章', () => {
 const current = state(); delete current.finance_versions[0].article.operation_view!.market;
 assert.equal(applyMarketSnapshot(current, snapshot(15)).status, 'no_publication');
 assert.equal(current.finance_versions.length, 1); assert.equal(current.market_observations?.length, 1);
});

test('新人工刊发版成为基准，旧待审上下文不污染下一次资料复核', () => {
 const current = state(); applyMarketSnapshot(current, snapshot(15));
 const reviewed = structuredClone(current.finance_versions.at(-1)!); reviewed.id = 'non-secret-reviewed'; reviewed.version++; reviewed.published_at = clock; reviewed.review!.status = 'approved'; current.finance_versions.push(reviewed);
 assert.equal(applyMarketSnapshot(current, snapshot(15.2, 1.4, '2026-10-05')).status, 'unchanged');
 assert.equal(applyMarketSnapshot(current, snapshot(14.5, 1.4, '2026-10-06')).status, 'draft_created');
 assert.equal(current.finance_versions.at(-1)!.previous_version_id, reviewed.id);
 assert.equal(current.finance_versions.at(-1)!.review!.condition_changes!.length, 1);
});

test('实际原子存储保存公开快照和待审稿并保留既有累计预算', async () => {
 const current = state(); await saveState(current);
 assert.equal((await recordMarketSnapshot(snapshot(15))).status, 'draft_created');
 const saved = await readState(); assert.deepEqual(saved.budget, current.budget);
 assert.equal(saved.market_observations?.[0].valuation.pe_ttm, 15); assert.equal(saved.finance_versions.at(-1)!.published_at, null);
 await recordMarketSnapshot(snapshot(15)); assert.equal((await readState()).finance_versions.length, 2);
});
