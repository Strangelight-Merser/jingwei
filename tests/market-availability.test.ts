import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_OPERATION } from '../industry/first-operation.ts';
import type { CollectionRun, FinanceVersion } from '../packages/contracts/types.ts';
import type { State } from '../packages/backend/storage.ts';
import { marketAvailability } from '../packages/backend/market-availability.ts';

function version(): FinanceVersion {
 const article = structuredClone(FIRST_OPERATION);
 article.article.operation_view!.market = {
  as_of: '2026-09-30', close: 4357.62, pe_ttm: 14, pb: 1.4, dividend_yield: 2.2,
  previous_year_end: { pe_ttm: 15, pb: 1.5 }, daily: [],
  source: { article_id: 'non-secret-market-fixture', revision: 1, source: 'Non-secret fixture', url: 'https://www.csindex.com.cn/', published_at: '', data_as_of: '2026-09-30', fragments: ['Non-secret test values, not a new real market observation.'] },
 };
 return article;
}
function state(collection_runs: CollectionRun[] = []): State {
 return { finance_versions: [version()], materials: [], events: [], tasks: [], collection_runs,
  budget: { id: 'preserved-ledger', limit_micro_cny: 10000000, reserved_micro_cny: 171322, approved_at: '2026-10-02', reservations: [] } };
}
function run(id: string, finished_at: string, errors: string[], source = 'csi300-market'): CollectionRun {
 return { id, started_at: finished_at, finished_at, sources: [{ source, discovered: 0, stored: 0, revised: 0, errors }] };
}

test('只有最近一次市场核查失败才提示保留已核实日期', () => {
 const current = state([run('failed', '2026-10-02T16:00:00Z', ['market_source_timeout'])]);
 assert.deepEqual(marketAvailability(current, current.finance_versions[0]), {
  status: 'check_failed', data_as_of: '2026-09-30', checked_at: '2026-10-02T16:00:00Z',
  message: '最近一次资料核查未完成，仍展示2026-09-30已核实资料；原判断保留，等待复核。',
 });
});

test('按市场来源实际完成时间找最新项，忽略数组乱序与其它来源失败', () => {
 const current = state([
  run('new-market-failed', '2026-10-02T16:00:00Z', ['timeout']),
  run('old-market-ok', '2026-10-02T15:00:00Z', []),
  run('later-fund-failed', '2026-10-02T17:00:00Z', ['fund_source_failed'], 'csi300-products'),
 ]);
 assert.equal(marketAvailability(current, current.finance_versions[0])!.checked_at, '2026-10-02T16:00:00Z');
 const mixed = run('mixed-sources', '2026-10-02T18:00:00Z', []);
 mixed.sources.push({ source: 'csi300-products', discovered: 0, stored: 0, revised: 0, errors: ['fund_source_failed'] });
 current.collection_runs.push(mixed);
 assert.equal(marketAvailability(current, current.finance_versions[0]), null);
});

test('失败后的成功取消提示，即使休市仍返回同一个行情日期', () => {
 const current = state([
  run('failed', '2026-10-02T16:00:00Z', ['timeout']),
  run('success', '2026-10-03T16:00:00Z', []),
 ]);
 assert.equal(marketAvailability(current, current.finance_versions[0], '2026-10-07T12:00:00Z'), null);
 assert.equal(current.finance_versions[0].article.operation_view!.market!.as_of, '2026-09-30');
});

test('没有市场版本、没有市场核查或只有其它来源错误时均无市场失效提示', () => {
 const current = state([run('fund-only', '2026-10-02T16:00:00Z', ['failed'], 'csi300-products')]);
 assert.equal(marketAvailability(current, current.finance_versions[0]), null);
 current.collection_runs = [];
 assert.equal(marketAvailability(current, current.finance_versions[0], '2030-01-01T00:00:00Z'), null);
 current.collection_runs.push(run('market-failed', '2026-10-02T16:00:00Z', ['failed']));
 delete current.finance_versions[0].article.operation_view!.market;
 assert.equal(marketAvailability(current, current.finance_versions[0]), null);
 delete current.finance_versions[0].article.operation_view;
 assert.equal(marketAvailability(current, current.finance_versions[0]), null);
});

test('读取失败提示不修改原动作、证据、版本、预算或待审状态', () => {
 const current = state([run('failed', '2026-10-02T16:00:00Z', ['timeout'])]);
 const before = JSON.stringify(current);
 marketAvailability(current, current.finance_versions[0]);
 assert.equal(JSON.stringify(current), before);
 assert.equal(current.finance_versions.length, 1);
 assert.equal(current.finance_versions[0].review, undefined);
});
