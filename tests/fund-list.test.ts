import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FUND_LIST_URL, parseFundList, refreshFundList, seedFundList} from '../packages/backend/fund-list.ts';

test('公开基金种子包含代码、简称、上游类型和取数日期', () => {
  const seed = seedFundList();
  assert.equal(seed.source_url, FUND_LIST_URL);
  assert.ok(Number.isFinite(Date.parse(seed.fetched_at)));
  assert.ok(seed.funds.length > 20_000);
  assert.equal(new Set(seed.funds.map(fund => fund.code)).size, seed.funds.length);
  assert.deepEqual(seed.funds.find(fund => fund.code === '007339'), {code: '007339', name: '易方达沪深300ETF联接C', type: '指数型-股票'});
  assert.deepEqual(parseFundList('var r = [["007339","pinyin","易方达沪深300ETF联接C","指数型-股票","PINYIN"]];'), [seed.funds.find(fund => fund.code === '007339')]);
  // Preserve an unfilled public type as published; do not invent metadata.
  assert.equal(parseFundList('var r = [["000001","","测试基金","",""]];')[0].type, '');
  for (const source of ['alert("run me")', 'var r = [];', 'var r = [["x","","基金","股票",""]];', 'var r = [["000001","","基金","股票",""]]; fetch("https://bad")']) assert.throws(() => parseFundList(source));
});

test('联网更新仅请求公开列表并按代码合并，不改旧种子；失败不丢失离线数据', async () => {
  const current = seedFundList(), now = new Date('2026-10-06T12:00:00Z');
  const original = JSON.stringify(current);
  const fetcher = (async (url, options) => {
    assert.equal(url, FUND_LIST_URL);
    assert.equal(options?.body, undefined);
    assert.equal(options?.method, undefined);
    return new Response('var r = [["007339","p","更新简称","指数型-股票","P"],["999999","p","新增基金","货币型-普通货币","P"]];');
  }) as typeof fetch;
  const updated = await refreshFundList(current, {fetcher, now});
  assert.equal(updated.funds.find(fund => fund.code === '007339')?.name, '更新简称');
  assert.equal(updated.funds.at(-1)?.code, '999999');
  assert.equal(updated.funds.length, current.funds.length + 1);
  assert.equal(updated.fetched_at, now.toISOString());
  assert.equal(JSON.stringify(current), original);
  await assert.rejects(refreshFundList(current, {fetcher: (async () => new Response('', {status: 503})) as typeof fetch}), /fund_list_http_503/);
  assert.equal(JSON.stringify(current), original);
});
