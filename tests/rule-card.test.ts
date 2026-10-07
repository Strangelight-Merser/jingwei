import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startApi} from '../apps/api/src/main.ts';
import {ruleCardData, changeDescription, type PublicRuleJudgment} from '../apps/web/app/lib/rule-card.ts';
import {loader as jsonLoader} from '../apps/web/app/routes/embed-rule-card-json.ts';

test('规则卡 JSON 经真实 publication API 读取，与公开判断的数字、日期、动作逐项一致', async () => {
  const app = await startApi({port: 0, mode: 'read_only', restoreSavedKey: false, valuationRefresh: null});
  const previous = process.env.JINGWEI_API_URL;
  process.env.JINGWEI_API_URL = app.listeningOrigin;
  try {
    const published = (await app.inject({method: 'GET', url: '/publication/judgment'})).json<PublicRuleJudgment>();
    const defaultResponse = await jsonLoader({request: new Request('http://channel/embed/rule-card.json')});
    const response = await jsonLoader({request: new Request('http://channel/embed/rule-card.json?index=000300')});
    const card = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.deepEqual(await defaultResponse.json(), card);
    assert.deepEqual(card, ruleCardData(published, '000300'));
    for (const field of ['as_of', 'pe_ttm', 'percentile', 'window_start', 'band'] as const) assert.equal(card[field], published[field]);
    for (const field of ['low', 'high', 'extreme'] as const) assert.equal(card.boundaries[field], published.boundaries[field]);
    assert.equal(card.boundaries.confirm_days, published.rule.confirm_days);
    assert.equal(card.new_money.title, published.judgment.new_money.title);
    assert.equal(card.held.title, published.judgment.held.title);
    assert.equal(card.last_change.date, published.last_change.date);
    assert.equal(card.last_change.origin, published.changes.find(c => c.date === published.last_change.date)!.origin);
    assert.equal(card.source.url, published.source_url);
    assert.ok(!('chart' in card) && !('changes' in card));
    assert.match(changeDescription(card.last_change), /历史回算|实际观察/);
    for (const [code, name] of [['000905', '中证500'], ['000016', '上证50'], ['399006', '创业板指'], ['HSTECH', '恒生科技']]) {
      const other = await jsonLoader({request: new Request(`http://channel/embed/rule-card.json?index=${code}`)});
      assert.equal(other.status, 200);
      const body = await other.json();
      assert.equal(body.index.name, name);
      if (code === 'HSTECH') {assert.equal(body.window_label, '2020.07.27以来'); assert.match(body.source.name, /蛋卷基金（第三方）/);}
    }
    for (const code of ['999999', '', 'constructor']) {
      const unsupported = await jsonLoader({request: new Request(`http://channel/embed/rule-card.json?index=${code}`)});
      assert.equal(unsupported.status, 404);
      assert.match((await unsupported.json()).error, /尚未提供/);
    }
  } finally {
    if (previous === undefined) delete process.env.JINGWEI_API_URL; else process.env.JINGWEI_API_URL = previous;
    await app.close();
  }
});
