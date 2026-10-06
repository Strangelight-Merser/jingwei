import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {FundMatch, Holdings, OcrLine} from '../packages/contracts/holdings.ts';
import {parseOcrLines, parseText, matchFund, classify, parseHoldings, buildCheckup, type HoldingJudgments} from '../packages/backend/holdings.ts';
import {validHoldings, parseRequestSchema} from '../packages/backend/holdings-validation.ts';
import {INDEX_CODES} from '../packages/backend/valuation-indexes.ts';
import {seedHistory} from '../packages/backend/valuation-history.ts';
import {evaluateValuationRule} from '../packages/backend/valuation-rule.ts';

const images: OcrLine[][] = await Promise.all([1, 2].map(async n => JSON.parse(await readFile(new URL(`./fixtures/holdings/alipay-${n}.ocr.json`, import.meta.url), 'utf8'))));
const expected = JSON.parse(await readFile(new URL('./fixtures/holdings/alipay.expected.json', import.meta.url), 'utf8')).holdings;
const judgments: HoldingJudgments = {};
for (const index of INDEX_CODES) judgments[index] = evaluateValuationRule(seedHistory(index).points, {index})!;
const holdings = (text: string): Holdings => ({saved_at: '2026-10-06T12:00:00Z', rows: parseHoldings({text}).rows});

test('支付宝两张 OCR fixture：逐项等于 expected，重叠名称保留首个虚构金额', () => {
  assert.deepEqual(parseOcrLines(images), expected);
  assert.deepEqual(parseOcrLines(images.map(image => [...image].reverse())), expected);
  const result = parseHoldings({images});
  assert.deepEqual(result.rows.map(row => ({name: row.input_name, amount: row.amount})), expected);
  assert.deepEqual(result.unread, []);
  assert.equal(new Set(result.rows.map(row => row.id)).size, expected.length);
  assert.equal(result.rows.find(row => row.input_name === '余额宝')?.exposure, 'money');
});

test('坐标配对不拾取收益列、百分比、广告和标签；缺金额保留未读状态', () => {
  const altered = images[0].filter(line => line.text !== '626.01');
  assert.deepEqual(parseOcrLines([altered])[0], {name: expected[0].name, amount: null});
  const result = parseHoldings({images: [altered]});
  assert.deepEqual(result.unread, [expected[0].name]);
  assert.equal(result.rows.some(row => row.amount === 9.15), false);
  assert.equal(result.rows.some(row => /法律|提醒|收益|进阶/.test(row.input_name)), false);
  const line: OcrLine = {text: '某某稳健收益债券A', x: 0.06, y: 0.2, w: 0.4, h: 0.02};
  assert.deepEqual(parseOcrLines([[line, {text: '1,234.56', x: 0.06, y: 0.26, w: 0.12, h: 0.02}]]), [{name: line.text, amount: 1234.56}]);
});

test('粘贴文字支持名称、代码、千分位及全半角；没有金额不臆造', () => {
  assert.deepEqual(parseText('南方纳斯达克100指数（QDII）C １，２３４．５６\n007339 50.00\n007339 90\n余额宝\n'), [
    {name: '南方纳斯达克100指数(QDII)C', amount: 1234.56}, {name: '007339', amount: 50}, {name: '余额宝', amount: null},
  ]);
  assert.deepEqual(parseHoldings({text: '007339\n余额宝 7.28'}).unread, ['007339']);
  assert.deepEqual(parseText('测试基金 -8\n测试基金B 10%').map(row => row.amount), [null, null]);
});

test('真实公开列表容忍简称差异；不补份额、不改指数数字、不强配币种或近似候选', () => {
  const cases = [['007339', '007339'], ['安信新回报灵活配置混合C', '002771'], ['国泰纳斯达克100指数(QDII)', '160213'],
    ['南方纳斯达克100指数(QDII)C', '016453'], ['圆信永丰科技驱动混合C', '024593'], ['英大策略优选混合C', '001608']];
  for (const [name, code] of cases) assert.equal(matchFund(name)?.code, code);
  assert.equal(matchFund('南方中证500ETF联接A')?.code, '160119');
  for (const name of ['不存在的基金C', '999999', '南方纳斯达克200指数(QDII)C', '南方纳斯达克100指数(QDII)', '余额宝', '景顺长城纳斯达克科技市值加权ETF联接(QDII)A']) assert.equal(matchFund(name), null);
  const funds: FundMatch[] = [{code: '000001', name: '某某成长精选混合A', type: '混合型-偏股'}, {code: '000002', name: '某某成长精挑混合A', type: '混合型-偏股'}];
  assert.equal(matchFund('某某成长精远混合A', funds), null);
});

test('分类只覆盖三个原指数；增强、指数变体、境外、货币与债券不套规则', () => {
  for (const [name, code] of [['易方达沪深300ETF联接C', '000300'], ['南方中证500ETF联接A', '000905'], ['华夏上证50ETF联接C', '000016']]) {
    assert.equal(classify(name).covered_index, code);
    assert.equal(classify(name).exposure, 'a_broad');
  }
  for (const name of ['沪深300指数增强C', '中证500信息技术ETF', '沪深300红利ETF', '上证50策略混合A', '中证1000指数C', '余额宝', '某某短债C', '恒生科技ETF联接C', '纳斯达克100指数C']) assert.equal(classify(name).covered_index, null);
  assert.equal(classify('某某美元债券(QDII)C').exposure, 'bond');
  assert.equal(classify('某某海外混合(QDII)A').exposure, 'overseas_other');
  assert.equal(classify('某某混合A').tracked_index, null);
});

test('fixture 组合体检：两只纳斯达克100重复，覆盖占比0，无境外估值判断', () => {
  const result = parseHoldings({images});
  const checkup = buildCheckup({saved_at: '2026-10-06T12:00:00Z', rows: result.rows}, judgments);
  assert.equal(checkup.total, 4067.77);
  assert.deepEqual(checkup.duplicates, [{tracked_index: '纳斯达克100', row_ids: result.rows.slice(1, 3).map(row => row.id), amount: 757.12}]);
  assert.deepEqual(checkup.covered, []);
  assert.equal(checkup.uncovered_share, 1);
  assert.deepEqual(checkup.by_exposure.map(({exposure, amount}) => ({exposure, amount})), [
    {exposure: 'a_active', amount: 2420.36}, {exposure: 'us_equity', amount: 829.64}, {exposure: 'hk_equity', amount: 810.49}, {exposure: 'money', amount: 7.28},
  ]);
  assert.ok(Math.abs(checkup.by_exposure.reduce((sum, group) => sum + group.share, 0) - 1) < 1e-10);
  assert.ok(checkup.notes.length <= 4);
});

test('007339 组合逐行应用各自当前规则，不能用传入 covered_index 扩大覆盖', () => {
  const list = holdings('007339 626.01\n南方中证500ETF联接A 266.13\n华夏上证50ETF联接C 490.99\n余额宝 7.28');
  const checkup = buildCheckup(list, judgments);
  assert.equal(checkup.covered.length, 3);
  for (const row of checkup.covered) {
    const judgment = judgments[row.index]!;
    assert.equal(row.band, judgment.band);
    assert.equal(row.new_money_title, judgment.judgment.new_money.title);
    assert.equal(row.held_title, judgment.judgment.held.title);
  }
  assert.equal(checkup.covered[0].new_money_title, '按原计划，不额外追加');
  assert.equal(checkup.covered[1].new_money_title, '暂缓新增');
  assert.equal(checkup.uncovered_share, 7.28 / 1390.41);
  const fake = holdings('纳斯达克100指数C 490.99');
  fake.rows[0].covered_index = '000300';
  fake.rows[0].exposure = 'a_broad';
  assert.deepEqual(buildCheckup(fake, judgments).covered, []);
  assert.deepEqual(buildCheckup(list, {}).covered, []);
  assert.equal(buildCheckup(list, {}).uncovered_share, 1);
  const empty = buildCheckup({...list, rows: []}, judgments);
  assert.equal(empty.total, 0);
  assert.equal(empty.uncovered_share, 0);
});

test('持仓与OCR输入拒绝无效金额、字段、重复id与错误坐标', () => {
  const value = holdings('007339 626.01');
  assert.equal(validHoldings(value), true);
  for (const amount of [-1, NaN, Infinity, '626.01', null]) assert.equal(validHoldings({...value, rows: [{...value.rows[0], amount}]}), false);
  assert.equal(validHoldings({...value, rows: [value.rows[0], value.rows[0]]}), false);
  assert.equal(validHoldings({...value, saved_at: 'yesterday'}), false);
  assert.equal(validHoldings({...value, secret: true}), false);
  assert.equal(parseRequestSchema.safeParse({images}).success, true);
  assert.equal(parseRequestSchema.safeParse({}).success, false);
  assert.equal(parseRequestSchema.safeParse({images: [[{...images[0][0], x: -0.1}]]}).success, false);
});
