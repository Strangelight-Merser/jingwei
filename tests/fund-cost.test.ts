import {test} from 'node:test';
import assert from 'node:assert/strict';
import {estimateFundCosts, FUND_COST_TERMS} from '../packages/backend/fund-cost.ts';

test('费用估算拒绝无效金额和未经确认的非整数持有天数', () => {
  for (const amount of [0, -1, NaN, Infinity, -Infinity]) {
    assert.throws(() => estimateFundCosts({amount, holding_days: 7}), /amount_must_be_positive_finite/);
  }
  for (const holding_days of [0, -1, 6.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => estimateFundCosts({amount: 10000, holding_days}), /holding_days_must_be_positive_integer/);
  }
  assert.throws(() => estimateFundCosts({amount: Number.MAX_VALUE, holding_days: 7}), /amount_out_of_range/);
});

test('六日与七日赎回边界，两只分项合计和差值可直接用显示金额核对', () => {
  const six = estimateFundCosts({amount: 10000, holding_days: 6});
  assert.deepEqual(six.funds.map(f => [f.service_fee_yuan, f.redemption_fee_yuan, f.total_fee_yuan]), [[0.33, 150, 150.33], [0.49, 150, 150.49]]);
  assert.equal(six.difference.total_fee_yuan, 0.16);
  const seven = estimateFundCosts({amount: 10000, holding_days: 7});
  assert.deepEqual(seven.funds.map(f => [f.service_fee_yuan, f.redemption_fee_yuan, f.total_fee_yuan]), [[0.38, 0, 0.38], [0.58, 0, 0.58]]);
  assert.deepEqual(seven.difference, {direction: '005658_minus_007339', service_fee_yuan: 0.2, redemption_fee_yuan: 0, total_fee_yuan: 0.2, actual_total_fee_yuan: null});
  assert.deepEqual(estimateFundCosts({amount: 10000, holding_days: 8}).funds.map(f => f.redemption_fee_yuan), [0, 0]);
});

test('小额可显示零分，但不改变费率档位或声称无实际费用', () => {
  const result = estimateFundCosts({amount: 0.01, holding_days: 6});
  assert.deepEqual(result.funds.map(f => [f.redemption_rate, f.total_fee_yuan, f.actual_total_fee_yuan]), [[0.015, 0, null], [0.015, 0, null]]);
  assert.equal(result.actual_cost_status, 'not_verified');
});

test('持有超过一年只返回当前费率假设和强说明，实际总额及差值保持未知', () => {
  assert.equal(estimateFundCosts({amount: 10000, holding_days: 365}).long_holding, false);
  const result = estimateFundCosts({amount: 10000, holding_days: 366});
  assert.equal(result.long_holding, true);
  assert.equal(result.basis, 'current_contract_rate_static_hypothesis');
  assert.deepEqual(result.funds.map(f => f.actual_total_fee_yuan), [null, null]);
  assert.equal(result.difference.actual_total_fee_yuan, null);
  assert.ok(result.limitations.some(s => /未来适用费率.*未知/.test(s)));
  assert.ok(result.limitations.some(s => /不能作为未来确定总额/.test(s)));
  assert.ok(result.limitations.some(s => /2026.*实施日.*尚未核实/.test(s)));
});

test('证据日期与页码、计提口径及净值不重复扣费说明随结果保留，输出可独立修改', () => {
  const input = {amount: 10000, holding_days: 30};
  const result = estimateFundCosts(input);
  assert.deepEqual(result.funds.map(f => f.sources[0].published_at), ['2026-08-11', '2026-05-29']);
  assert.deepEqual(result.funds.map(f => f.sources[0].pdf_page), [3, 3]);
  assert.deepEqual(result.funds.map(f => f.sources.at(-1)!.pdf_page), [33, 38]);
  assert.equal(result.year_days, 365);
  assert.ok(result.assumptions.some(s => /前一日C类.*当年天数/.test(s)));
  assert.ok(result.assumptions.some(s => /起止.*未核实|未核实.*起止/.test(s)));
  assert.ok(result.limitations.some(s => /不得.*重复扣减/.test(s)));
  result.funds[0].sources[0].published_at = 'changed';
  assert.equal(FUND_COST_TERMS[0].sources[0].published_at, '2026-08-11');
  assert.deepEqual(input, {amount: 10000, holding_days: 30});
  assert.deepEqual(estimateFundCosts(input), estimateFundCosts(input));
});
