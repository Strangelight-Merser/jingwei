import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import type {FundMatch, Holdings, OcrLine} from '../packages/contracts/holdings.ts';
import {parseOcrLines, parseText, matchFund, rankFundCandidates, classify, parseHoldings, buildCheckup, type HoldingJudgments} from '../packages/backend/holdings.ts';
import {validHoldings, parseRequestSchema} from '../packages/backend/holdings-validation.ts';
import {INDEX_CODES} from '../packages/backend/valuation-indexes.ts';
import {seedHistory} from '../packages/backend/valuation-history.ts';
import {evaluateValuationRule} from '../packages/backend/valuation-rule.ts';
import {FUND_LIST_SEED} from '../packages/backend/fund-list-seed.ts';
import type {IndexCode} from '../packages/backend/valuation-indexes.ts';

const images: OcrLine[][] = await Promise.all([1, 2].map(async n => JSON.parse(await readFile(new URL(`./fixtures/holdings/alipay-${n}.ocr.json`, import.meta.url), 'utf8'))));
const expected = JSON.parse(await readFile(new URL('./fixtures/holdings/alipay.expected.json', import.meta.url), 'utf8')).holdings;
const judgments: HoldingJudgments = {};
for (const index of INDEX_CODES) judgments[index] = evaluateValuationRule(seedHistory(index).points, {index})!;
/** Older parse assertions compare name and amount; the read fund code is tested on its own. */
const plain = <T extends {code?: string}>(rows: T[]) => rows.map(({code: _code, ...row}) => row);
const holdings = (text: string): Holdings => ({saved_at: '2026-10-06T12:00:00Z', rows: parseHoldings({text}).rows});

test('支付宝两张 OCR fixture：逐项等于 expected，重叠名称保留首个虚构金额', () => {
  assert.deepEqual(plain(parseOcrLines(images)), expected);
  assert.deepEqual(plain(parseOcrLines(images.map(image => [...image].reverse()))), expected);
  const result = parseHoldings({images});
  assert.deepEqual(result.rows.map(row => ({name: row.input_name, amount: row.amount})), expected);
  assert.deepEqual(result.unread, []);
  assert.equal(new Set(result.rows.map(row => row.id)).size, expected.length);
  assert.equal(result.rows.find(row => row.input_name === '余额宝')?.exposure, 'money');
});

test('坐标配对不拾取收益列、百分比、广告和标签；缺金额保留未读状态', () => {
  const altered = images[0].filter(line => line.text !== '626.01');
  assert.deepEqual(plain(parseOcrLines([altered]))[0], {name: expected[0].name, amount: null});
  const result = parseHoldings({images: [altered]});
  assert.deepEqual(result.unread, [expected[0].name]);
  assert.equal(result.rows.some(row => row.amount === 9.15), false);
  assert.equal(result.rows.some(row => /法律|提醒|收益|进阶/.test(row.input_name)), false);
  const line: OcrLine = {text: '某某稳健收益债券A', x: 0.06, y: 0.2, w: 0.4, h: 0.02};
  assert.deepEqual(plain(parseOcrLines([[line, {text: '1,234.56', x: 0.06, y: 0.26, w: 0.12, h: 0.02}]])), [{name: line.text, amount: 1234.56}]);
});

test('粘贴文字支持名称、代码、千分位及全半角；没有金额不臆造', () => {
  assert.deepEqual(plain(parseText('南方纳斯达克100指数（QDII）C １，２３４．５６\n007339 50.00\n007339 90\n余额宝\n')), [
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
  for (const name of ['不存在的基金C', '999999', '南方纳斯达克200指数(QDII)C', '南方纳斯达克100指数(QDII)', '余额宝']) assert.equal(matchFund(name), null);
  const funds: FundMatch[] = [{code: '000001', name: '某某成长精选混合A', type: '混合型-偏股'}, {code: '000002', name: '某某成长精挑混合A', type: '混合型-偏股'}];
  assert.equal(matchFund('某某成长精远混合A', funds), null);
});

test('三个漏配名称与全半角、括号、发起/发起式、人民币及管理人简称唯一对齐', () => {
  const cases = [
    ['景顺长城纳斯达克科技市值加权ETF联接(QDII)A', '017091'],
    ['华泰柏瑞南方东英恒生科技指数ETF联接(QDII)C', '015311'],
    ['易方达沪深300联接C', '007339'],
    ['景顺长城纳斯达克科技市值加权发起式指数联接（ＱＤＩＩ）Ａ人民币', '017091'],
    ['华泰柏瑞基金管理有限公司恒生科技发起指数联接【QDII】C', '015311'],
    ['景顺长城纳斯达克科技市值加权联接(QDII)E', '019118'],
    ['华泰柏瑞南方东英恒生科技指数联接(QDII)I', '022680'],
  ];
  for (const [name, code] of cases) {
    assert.equal(matchFund(name)?.code, code, name);
    const candidates = rankFundCandidates(name);
    assert.equal(candidates[0].code, code);
    assert.ok(candidates[0].score >= 92);
    assert.ok(candidates[0].reasons.some(reason => reason.startsWith('份额类别一致')));
    assert.ok(candidates[0].reasons.some(reason => reason.startsWith('跟踪标的一致')));
  }
  // Eight public funds plus a cash product: the cash product has no single fund code.
  assert.deepEqual(parseHoldings({images}).rows.map(row => row.fund?.code ?? null),
    ['002771', '160213', '016453', null, '017091', '015311', '024593', '015528', '001608']);
});

test('份额 A/C/E/I、管理人、跟踪标的、增强版本与币种为硬约束', () => {
  const funds: FundMatch[] = [
    ...['A', 'C', 'E', 'I'].map((cls, i) => ({code: `99000${i}`, name: `晨岚沪深300ETF联接${cls}`, type: '指数型-股票'})),
    {code: '990010', name: '晴屿沪深300ETF联接C', type: '指数型-股票'},
    {code: '990011', name: '晨岚沪深300红利ETF联接C', type: '指数型-股票'},
    {code: '990012', name: '晨岚沪深300指数增强C', type: '指数型-股票'},
    {code: '990013', name: '晨岚沪深300ETF联接C美元现汇', type: '指数型-海外股票'},
  ];
  for (const [i, cls] of ['A', 'C', 'E', 'I'].entries()) {
    const name = `晨岚沪深300发起联接${cls}`;
    assert.equal(matchFund(name, funds)?.code, `99000${i}`);
    assert.deepEqual(rankFundCandidates(name, funds).map(fund => fund.code), [`99000${i}`]);
    assert.equal(matchFund(name, funds.filter(fund => fund.code !== `99000${i}`)), null);
  }
  assert.equal(matchFund('晨岚沪深300联接', funds), null);
  assert.equal(matchFund('晨岚沪深301联接C', funds), null);
  assert.equal(matchFund('晨岚沪深300等权联接C', funds), null);
  assert.equal(matchFund('晨岚沪深300联接C美元现汇', funds)?.code, '990013');
  assert.equal(matchFund('晨岚沪深300联接C美元现钞', funds), null);
  assert.equal(matchFund('景顺长城纳斯达克科技市值加权联接(QDII)A美元现汇')?.code, '017092');
  assert.equal(matchFund('景顺长城纳斯达克科技市值加权联接(QDII)A', funds), null);
});

test('多个高分/接近候选返回得分与理由；精确写法和低分单候选也不越过确认门槛', () => {
  const funds: FundMatch[] = [
    {code: '990001', name: '晨岚沪深300ETF联接C', type: '指数型-股票'},
    {code: '990002', name: '晨岚沪深300指数C', type: '指数型-股票'},
  ];
  for (const name of ['晨岚沪深300C', funds[0].name]) {
    assert.equal(matchFund(name, funds), null);
    const result = parseHoldings({text: `${name} 1234.56`}, funds);
    assert.equal(result.rows[0].fund, null);
    assert.deepEqual(result.rows[0].candidates?.map(candidate => candidate.code), ['990001', '990002']);
    assert.ok(result.rows[0].candidates!.every(candidate => candidate.score >= 92 && candidate.reasons.length >= 4));
    assert.equal(validHoldings({saved_at: '2026-10-06T12:00:00Z', rows: result.rows}), true);
  }
  const near: FundMatch[] = [
    {code: '990003', name: '安信星河远航优选成长主题混合A', type: '混合型-偏股'},
    {code: '990004', name: '安信星河远航优选成才主题混合A', type: '混合型-偏股'},
  ];
  assert.equal(matchFund('安信星河远航优选成远主题混合A', near), null);
  assert.equal(rankFundCandidates('安信星河远航优选成远主题混合A', near).length, 2);
  const weak: FundMatch[] = [{code: '990005', name: '安信星河远航优选混合A', type: '混合型-偏股'}];
  assert.ok(rankFundCandidates('安信星河远景优选混合A', weak)[0].score < 92);
  assert.equal(matchFund('安信星河远景优选混合A', weak), null);
});

for (const layout of ['tiantian-table', 'bank-cards', 'bank-market-value']) {
  test(`虚构 OCR ${layout}：代码尾缀、右列金额、上方标签、千分位与万元单位`, async () => {
    const fixture: {source: string; lines: OcrLine[]; holdings: {name: string; amount: number}[]} = JSON.parse(await readFile(new URL(`./fixtures/holdings/${layout}.synthetic.json`, import.meta.url), 'utf8'));
    assert.match(fixture.source, /虚构/);
    assert.deepEqual(plain(parseOcrLines([fixture.lines])), fixture.holdings);
    assert.deepEqual(plain(parseOcrLines([[...fixture.lines].reverse()])), fixture.holdings);
    const parsed = parseHoldings({images: [fixture.lines]});
    assert.deepEqual(parsed.rows.map(row => ({name: row.input_name, amount: row.amount})), fixture.holdings);
    assert.deepEqual(parsed.unread, []);
  });
}

test('OCR 歧义留空：同一金额列多值、单行多数字、仅正收益或代码、列边界不明', async () => {
  const {lines}: {lines: OcrLine[]} = JSON.parse(await readFile(new URL('./fixtures/holdings/tiantian-table.synthetic.json', import.meta.url), 'utf8'));
  const firstRow = lines.filter(line => line.y < 0.3);
  const number = firstRow.find(line => line.text === '１，２３４．５６')!;
  for (const changed of [
    firstRow.filter(line => line !== number),
    firstRow.map(line => line === number ? {...line, text: '1,234.56 18.90'} : line),
    firstRow.map(line => line === number ? {...line, text: '100 20'} : line),
    [...firstRow, {...number, text: '2,000.00', y: 0.24}],
    firstRow.map(line => line === number ? {...line, x: 0.745, w: 0.1} : line),
  ]) {
    assert.deepEqual(plain(parseOcrLines([changed])), [{name: '晨岚沪深300ETF联接C', amount: null}]);
    const parsed = parseHoldings({images: [changed]});
    assert.deepEqual(parsed.rows, []);
    assert.deepEqual(parsed.unread, ['晨岚沪深300ETF联接C']);
  }
  const name: OcrLine = {text: '晴屿稳进混合A', x: 0.06, y: 0.2, w: 0.4, h: 0.02};
  assert.deepEqual(plain(parseOcrLines([[name, {text: '990001', x: 0.06, y: 0.23, w: 0.1, h: 0.02}]])), [{name: name.text, amount: null}]);
  assert.deepEqual(plain(parseOcrLines([[{text: '名称/金额', x: 0.06, y: 0.1, w: 0.2, h: 0.02}, name,
    {text: '990001', x: 0.06, y: 0.23, w: 0.1, h: 0.02},
  ]])), [{name: name.text, amount: null}]);
  assert.deepEqual(parseOcrLines([[{text: '持有金额', x: 0.6, y: 0.1, w: 0.2, h: 0.02}, name,
    {text: '990001', x: 0.6, y: 0.2, w: 0.1, h: 0.02},
  ]]), [{name: name.text, amount: null}]);
  assert.deepEqual(parseOcrLines([[name,
    {text: '1,234.56', x: 0.55, y: 0.2, w: 0.15, h: 0.02},
    {text: '18.90', x: 0.8, y: 0.2, w: 0.1, h: 0.02},
  ]]), [{name: name.text, amount: null}]);
  assert.deepEqual(parseOcrLines([[name,
    {text: '持有金额：100 20', x: 0.06, y: 0.24, w: 0.5, h: 0.02},
    {text: '18.90', x: 0.06, y: 0.28, w: 0.1, h: 0.02},
  ]]), [{name: name.text, amount: null}]);
});

test('OCR 名称内部空格不截断指数；粘连尾缀代码移除，标签下六位金额可识别', () => {
  const names = ['晨岚 沪深 300 ETF 联接 C （990001）', '晨岚沪深300ETF联接C990001'];
  for (const text of names) assert.deepEqual(plain(parseOcrLines([[
    {text, x: 0.06, y: 0.2, w: 0.5, h: 0.02},
    {text: '持有金额（元）', x: 0.06, y: 0.24, w: 0.2, h: 0.02},
    {text: '123456', x: 0.06, y: 0.28, w: 0.2, h: 0.02},
  ]])), [{name: '晨岚沪深300ETF联接C', amount: 123456}]);
});

test('分类：所列指数的普通跟踪基金有规则判断；增强、变体、主动、货币与债券不套规则', () => {
  for (const [name, code, exposure] of [
    ['易方达沪深300ETF联接C', '000300', 'a_broad'], ['南方中证500ETF联接A', '000905', 'a_broad'], ['华夏上证50ETF联接C', '000016', 'a_broad'],
    ['南方中证1000ETF联接C', '000852', 'a_broad'], ['某某中证红利指数A', '000922', 'a_other_index'], ['易方达创业板ETF联接C', '399006', 'a_broad'],
    ['华夏科创50ETF联接A', '000688', 'a_broad'], ['南方纳斯达克100指数(QDII)C', 'NDX', 'us_equity'], ['博时标普500ETF联接(QDII)A', 'SPX', 'us_equity'],
    ['华夏恒生ETF联接A', 'HSI', 'hk_equity'], ['华泰柏瑞南方东英恒生科技指数ETF联接(QDII)C', 'HSTECH', 'hk_equity'],
  ] as const) {
    assert.equal(classify(name).covered_index, code, name);
    assert.equal(classify(name).exposure, exposure, name);
  }
  for (const name of ['沪深300指数增强C', '中证500信息技术ETF', '沪深300红利ETF', '上证50策略混合A', '中证红利低波动ETF联接A', '创业板50ETF联接C', '恒生医疗ETF联接A', '纳斯达克科技市值加权ETF联接(QDII)A', '科创100ETF联接A', '余额宝', '某某短债C'])
    assert.equal(classify(name).covered_index, null, name);
  assert.equal(classify('某某美元债券(QDII)C').exposure, 'bond');
  assert.equal(classify('某某海外混合(QDII)A').exposure, 'overseas_other');
  assert.equal(classify('某某混合A').tracked_index, null);
});

test('fixture 组合体检：两只纳斯达克100重复；纳指100与恒生科技跟踪基金有各自的规则判断', () => {
  const result = parseHoldings({images});
  const checkup = buildCheckup({saved_at: '2026-10-06T12:00:00Z', rows: result.rows}, judgments);
  assert.equal(checkup.total, 4067.77);
  assert.deepEqual(checkup.duplicates, [{tracked_index: 'NDX', row_ids: result.rows.slice(1, 3).map(row => row.id), amount: 757.12}]);
  // 纳斯达克科技市值加权 is a different index and stays uncovered.
  assert.deepEqual(checkup.covered.map(row => [result.rows.find(r => r.id === row.row_id)!.input_name, row.index, row.band]), [
    ...result.rows.slice(1, 3).map(r => [r.input_name, 'NDX', judgments.NDX!.band]),
    [result.rows.find(r => /恒生科技/.test(r.input_name))!.input_name, 'HSTECH', judgments.HSTECH!.band],
  ]);
  const coveredAmount = checkup.covered.reduce((sum, row) => sum + result.rows.find(r => r.id === row.row_id)!.amount, 0);
  assert.ok(Math.abs(checkup.uncovered_share - (1 - coveredAmount / checkup.total)) < 1e-12);
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
  assert.equal(checkup.covered[0].new_money_title, '照常定投，不加仓');
  assert.equal(checkup.covered[1].new_money_title, '暂缓新增');
  assert.equal(checkup.uncovered_share, 7.28 / 1390.41);
  const fake = holdings('某某科技主题混合C 490.99');
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

test('截图里读对的基金代码优先于读错的名称（沪 → 泸）', () => {
  const lines = [
    {text: '易方达泸深300联接C 007339', x: 0.06, y: 0.20, w: 0.6, h: 0.02},
    {text: '30,000.00', x: 0.06, y: 0.24, w: 0.2, h: 0.02},
    {text: '华夏沪深300联接C', x: 0.06, y: 0.40, w: 0.5, h: 0.02},
    {text: '005658', x: 0.06, y: 0.425, w: 0.12, h: 0.015},
    {text: '20,000.00', x: 0.06, y: 0.45, w: 0.2, h: 0.02},
  ];
  const {rows} = parseHoldings({images: [lines]});
  const first = rows.find(r => r.input_name.includes('易方达'))!;
  assert.equal(first.fund?.code, '007339');
  assert.equal(first.covered_index, '000300');
  assert.match(first.candidates![0].reasons.join(), /基金代码/);
  const second = rows.find(r => r.input_name.includes('华夏'))!;
  assert.equal(second.fund?.code, '005658');
  assert.equal(parseHoldings({text: '易方达泸深300联接C 007339 1000'}).rows[0].fund?.code, '007339');
});

test('名称里没有类型词的基金，靠下方代码或公开列表名称也能读到', () => {
  const lines = [
    {text: '易方达上证50增强A', x: 0.04, y: 0.46, w: 0.4, h: 0.04},
    {text: '3,210.50', x: 0.74, y: 0.46, w: 0.18, h: 0.05},
    {text: '110003', x: 0.04, y: 0.52, w: 0.12, h: 0.027},
    {text: '某某说明文字', x: 0.04, y: 0.70, w: 0.3, h: 0.04},
  ];
  assert.deepEqual(parseOcrLines([lines]), [{name: '易方达上证50增强A', amount: 3210.5, code: '110003'}]);
});

test('指数增强基金记作其他指数并计入同方向重复，但不套规则', () => {
  const enhanced = classify('易方达上证50增强A', {code: '110003', name: '易方达上证50增强A', type: '指数型-股票'});
  assert.deepEqual(enhanced, {exposure: 'a_other_index', tracked_index: '000016', covered_index: null});
  assert.equal(classify('上证50策略混合A').exposure, 'a_active');
  const checkup = buildCheckup(holdings('易方达上证50增强A 110003 1000\n华夏上证50ETF联接C 2000'), judgments);
  assert.equal(checkup.duplicates[0]?.tracked_index, '000016');
  assert.equal(checkup.covered.length, 1);
  assert.ok(checkup.notes.some(note => note.includes('指数增强')));
});

test('粘贴文字里的基金代码不留在名称里', () => {
  assert.deepEqual(parseText('易方达上证50增强A 110003 1000\n007339 易方达沪深300ETF联接C 2,000\n华夏沪深300联接C(005658) 300'), [
    {name: '易方达上证50增强A', amount: 1000, code: '110003'},
    {name: '易方达沪深300ETF联接C', amount: 2000, code: '007339'},
    {name: '华夏沪深300联接C', amount: 300, code: '005658'},
  ]);
});

test('公开列表中的量化、中证红利增强和恒生指数增强不套规则，保留指数方向', () => {
  for (const [code, index, exposure] of [
    ['005113', '000300', 'a_other_index'], ['005114', '000300', 'a_other_index'],
    ['008682', '000922', 'a_other_index'], ['022903', '000922', 'a_other_index'],
    ['100032', '000922', 'a_other_index'], ['100033', '000922', 'a_other_index'],
    ['025293', 'HSI', 'hk_equity'], ['025294', 'HSI', 'hk_equity'], ['025295', 'HSI', 'hk_equity'],
  ] as const) {
    const fund = FUND_LIST_SEED.funds.find(fund => fund.code === code)!;
    assert.ok(fund, code);
    assert.deepEqual(classify(fund.name, fund), {tracked_index: index, exposure, covered_index: null}, fund.name);
    assert.equal(classify(fund.name).covered_index, null, fund.name);
  }
});

test('科创板50成份完整名称与经核对的纳指ETF、工银科创联接简称得到各自判断', () => {
  const abbreviations = ['159501', '159632', '159660', '159696', '159941', '513100', '513110', '513300', '513870', '022932'];
  const fullNames = FUND_LIST_SEED.funds.filter(fund => /科创板50成份/.test(fund.name) && !/增强/.test(fund.name));
  assert.equal(fullNames.length, 26);
  for (const fund of [...fullNames, ...abbreviations.map(code => FUND_LIST_SEED.funds.find(fund => fund.code === code)!)]) {
    assert.ok(fund);
    const index = /纳指|纳斯达克/.test(fund.name) ? 'NDX' : '000688';
    assert.equal(classify(fund.name, fund).covered_index, index, fund.name);
    assert.equal(classify(fund.name).covered_index, index, fund.name);
  }
  // 科创 and 纳斯达克 without a verified tracker name do not identify a covered index.
  for (const name of ['央企科创ETF融通', '科创ETF', '纳斯达克指数ETF', '纳指科技ETF景顺', '纳指生物科技ETF汇添富'])
    assert.equal(classify(name).covered_index, null, name);
});

test('增强与策略后缀对全部十一项指数一致生效，LOF与交易型普通跟踪基金可以覆盖', () => {
  for (const [name, index] of [
    ['沪深300', '000300'], ['中证500', '000905'], ['上证50', '000016'], ['中证1000', '000852'],
    ['中证红利', '000922'], ['科创板50成份', '000688'], ['创业板指', '399006'],
    ['纳斯达克100', 'NDX'], ['标普500', 'SPX'], ['恒生指数', 'HSI'], ['恒生科技', 'HSTECH'],
  ] as const) {
    for (const suffix of ['指数量化A', '指数增强A', '多因子ETF', 'ETF策略A', '优选指数A', '指数指增A'])
      assert.equal(classify(`${name}${suffix}`).covered_index, null, `${name}${suffix}`);
    for (const suffix of ['LOF', '交易型开放式基金'])
      assert.equal(classify(`${name}${suffix}`).covered_index, index, `${name}${suffix}`);
  }
  for (const name of ['大成标普500等权重指数(QDII)C人民币', '华夏恒生互联网科技业ETF联接(QDII)A', '恒生医疗ETF大成',
    '华泰柏瑞中证红利低波ETF联接A', '创业板50ETF华安', '科创100ETF鹏华', '沪深300ESGETF富国'])
    assert.equal(classify(name).covered_index, null, name);
  // Enhancing a different target must not join the base index's duplicate-holding group.
  for (const name of ['创业板50指数增强A', '创业板综指增强A', '科创板100指数增强A', '沪深300红利指数增强A'])
    assert.equal(INDEX_CODES.includes(classify(name).tracked_index as IndexCode), false, name);
});

test('港股通恒生、恒生科技ETF的简称不等于恒生指数、恒生科技指数', () => {
  for (const [code, target] of [['520940', '恒指港股通'], ['520840', '恒生港股通科技主题']]) {
    const fund = FUND_LIST_SEED.funds.find(fund => fund.code === code)!;
    assert.ok(fund, code);
    assert.deepEqual(classify(fund.name, fund), {exposure: 'hk_equity', tracked_index: target, covered_index: null});
    assert.deepEqual(classify(fund.name), classify(fund.name, fund));
  }
});

test('公开列表全量核查：逐只按已审阅的完整标的名称核对 covered_index', () => {
  const terms = /沪深300|中证500|上证50|中证1000|中证红利|科创|创业板|纳斯达克|纳指|标普|恒生/;
  const funds = FUND_LIST_SEED.funds.filter(fund => terms.test(fund.name.normalize('NFKC')));
  // These are the plain target families in the public list. Strip only packaging/currency/share
  // labels, then compare the remaining full target; do not reuse classify's prefix/strategy gates.
  const families: [IndexCode, string[]][] = [
    ['000300', ['沪深300', '沪深300指数', '沪深300指数发起']],
    ['000905', ['中证500', '中证500指数']], ['000016', ['上证50', '上证50指数']],
    ['000852', ['中证1000']], ['000922', ['中证红利', '中证红利指数']],
    ['000688', ['科创50', '科创50联接', '科创板50', '科创板50指数', '科创板50成份', '科创板50成份指数', '科创板50成份指数发起式']],
    ['399006', ['创业板', '创业板指数', '创业板指数发起式']],
    ['NDX', ['纳斯达克100', '纳斯达克100指数', '纳斯达克100指数发起', '纳斯达克100指数发起式', '纳指100']],
    ['SPX', ['标普500', '标普500指数']], ['HSI', ['恒生', '恒生指数']],
    ['HSTECH', ['恒生科技', '恒生科技指数', '恒生科技指数发起']],
  ];
  const targets = new Map(families.flatMap(([index, names]) => names.map(name => [name, index] as const)));
  const nasdaqAbbreviations = new Set(['159501', '159632', '159660', '159696', '159941', '513100', '513110', '513300', '513870']);
  const counts = Object.fromEntries(INDEX_CODES.map(index => [index, 0]));
  assert.equal(funds.length, 2368);
  for (const fund of funds) {
    const text = fund.name.normalize('NFKC').toUpperCase();
    const target = text.slice(text.search(terms));
    const family = target.includes('ETF') ? target.slice(0, target.indexOf('ETF')) : target
      .replace(/\((?:QDII(?:-LOF)?|LOF|后端|美元现汇|美元现钞|人民币)\)/g, '')
      .replace(/人民币|美元(?:现汇|现钞|汇)?|港币|美钞|美汇|现汇|现钞/g, '').replace(/[A-Z]$/, '');
    const expected = ['520940', '520840'].includes(fund.code) ? null
      : nasdaqAbbreviations.has(fund.code) ? 'NDX' : fund.code === '022932' ? '000688'
      : /指数型/.test(fund.type) ? targets.get(family) ?? null : null;
    assert.equal(classify(fund.name, fund).covered_index, expected, `${fund.code} ${fund.name}`);
    if (expected) counts[expected]++;
  }
  assert.deepEqual(counts, {'000300': 129, '000905': 80, '000016': 36, '000852': 22, '399006': 76,
    '000688': 71, '000922': 27, NDX: 72, SPX: 22, HSI: 19, HSTECH: 58});
});

test('按基金代码导入后，体检使用修正后的覆盖并保留增强基金同方向重复', () => {
  const parsed = holdings('022932 1000\n159501 2000\n008682 3000\n025293 4000\n007801 5000');
  assert.deepEqual(parsed.rows.map(row => row.covered_index), ['000688', 'NDX', null, null, '000922']);
  // Existing stored rows are also reclassified at checkup time.
  for (const row of parsed.rows) row.covered_index = '000300';
  const checkup = buildCheckup(parsed, judgments);
  assert.deepEqual(checkup.covered.map(row => row.index), ['000688', 'NDX', '000922']);
  assert.equal(checkup.duplicates[0]?.tracked_index, '000922');
  assert.equal(checkup.duplicates[0]?.amount, 8000);
  assert.equal(checkup.uncovered_share, 7000 / 15000);
});
