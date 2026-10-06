import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PLAN_OPTIONS, HOLDING_OPTIONS, PERIOD_OPTIONS, type ReaderSituation} from '../packages/contracts/reader-situation.ts';
import {judgmentPublication} from '../packages/backend/judgment.ts';
import {BAND_JUDGMENTS, type ValuationBand} from '../packages/backend/valuation-rule.ts';
import {advisorReading, advisorSituationLabel} from '../apps/web/app/lib/advisor-reading.ts';
import {situationMoney} from '../apps/web/app/lib/situation-money.ts';
import {ruleCardData} from '../apps/web/app/lib/rule-card.ts';

const current = (await judgmentPublication())!;
const situation: ReaderSituation = {long_plan: 'yes', holding: 'none', holding_period: 'long', monthly_amount: 1000, idle_amount: 50000};

test('客户说明与公开判断共用数字与动作，四区间金额说法直接复用 situation-money', () => {
  const card = ruleCardData(current, '000300');
  assert.equal(card.pe_ttm, current.pe_ttm);
  assert.equal(card.percentile, current.percentile);
  assert.equal(card.as_of, current.as_of);
  for (const band of Object.keys(BAND_JUDGMENTS) as ValuationBand[]) {
    const judgment = {...current, band, judgment: BAND_JUDGMENTS[band]};
    for (const holding of ['none', '007339', '005658', 'both', 'unknown'] as const) {
      const s = {...situation, holding};
      const reading = advisorReading(s, judgment);
      const held = ['007339', '005658', 'both'].includes(holding);
      assert.equal(reading.title, `你的${held ? '持仓' : '新增资金'}：${held ? judgment.judgment.held.title : judgment.judgment.new_money.title}`);
      assert.ok(reading.paragraphs.includes(held ? judgment.judgment.held.text : judgment.judgment.new_money.text));
      assert.equal(reading.money, situationMoney(s, judgment));
      if (holding === 'both') assert.match(reading.paragraphs.join(''), /同时持有不会分散/);
      if (holding === 'unknown') assert.match(reading.paragraphs.join(''), /不推断你的现有持仓/);
    }
  }
});

test('无计划与未确定计划先补齐计划，金额保留条件，不当作立即投入动作', () => {
  for (const long_plan of ['no', 'unknown'] as const) {
    for (const holding of ['none', '007339', 'both'] as const) {
      const s = {...situation, long_plan, holding};
      const reading = advisorReading(s, current);
      assert.match(reading.title, /计划/);
      assert.match(reading.paragraphs.join(''), /目标比例|配置比例/);
      assert.match(reading.paragraphs.join(''), /规则对已有计划者/);
      assert.match(reading.money!, /^若已确定长期配置计划/);
    }
  }
});

test('其他基金、短期与未知期限不生成金额或个性化交易动作；覆盖契约全部情形', () => {
  for (const [long_plan] of PLAN_OPTIONS) for (const [holding] of HOLDING_OPTIONS) for (const [holding_period] of PERIOD_OPTIONS) {
    const s = {...situation, long_plan, holding, holding_period};
    const reading = advisorReading(s, current);
    assert.ok(reading.title.length && reading.paragraphs.length);
    assert.ok(advisorSituationLabel(s).length);
    if (holding === 'other') {
      assert.match(reading.title, /不在支持范围/);
      assert.equal(reading.money, null);
    } else if (holding_period === 'under7' || holding_period === 'month') {
      assert.match(reading.title, /不足7天|约1个月/);
      assert.equal(reading.money, null);
    } else if (holding_period === 'unknown') {
      assert.match(reading.title, /先确定这笔钱多久不用/);
      assert.equal(reading.money, null);
    }
  }
  assert.equal(advisorReading({...situation, monthly_amount: undefined, idle_amount: undefined}, current).money, null);
  assert.equal(advisorReading({...situation, monthly_amount: 0, idle_amount: 0}, current).money, null);
});
