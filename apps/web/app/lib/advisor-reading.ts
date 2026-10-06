import {PLAN_OPTIONS, HOLDING_OPTIONS, PERIOD_OPTIONS, type ReaderSituation} from '../../../../packages/contracts/reader-situation.ts';
import type {PublicRuleJudgment} from './rule-card.ts';
import {situationMoney} from './situation-money.ts';

export function advisorSituationLabel(s: ReaderSituation) {
  return [PLAN_OPTIONS.find(([k]) => k === s.long_plan)![1], HOLDING_OPTIONS.find(([k]) => k === s.holding)![1], PERIOD_OPTIONS.find(([k]) => k === s.holding_period)![1]].join(' · ');
}

/** Applies the existing reader contract and money wording, using no saved reader record. */
export function advisorReading(s: ReaderSituation, j: PublicRuleJudgment) {
  const held = ['007339', '005658', 'both'].includes(s.holding);
  const result = (title: string, paragraphs: string[], money: string | null = null) => ({title, paragraphs, money});
  if (s.holding === 'other') return result('这项持仓暂不在支持范围', [
    '目前只研究沪深300与007339、005658两只联接C类，不对其他基金作持仓判断。当前公共判断仅供了解沪深300方向。',
  ]);
  if (s.holding_period === 'under7') return result('不足7天，先核对赎回费与用钱时间', [
    held ? '这项持仓先核对基金合同中的赎回费。估值规则面向长期资金，不适用于几天内的买卖。' : '几天内要用的钱不适用这条估值规则，不据此给出买入动作。',
  ]);
  if (s.holding_period === 'month') return result('约1个月的资金，规则不适用', [
    '一个月内的价格波动可能远大于估值变化。短期要用的钱不建议放进股票指数基金，这条规则不用于短期买卖。',
  ]);
  if (s.holding_period === 'unknown') return result('先确定这笔钱多久不用', [
    '持有期限还没确定，先确认这笔钱是否至少一年不用。当前公共判断不直接转成这笔钱的投入或持仓动作。',
  ]);
  const nm = j.judgment.new_money, hd = j.judgment.held;
  const money = situationMoney(s, j);
  if (s.long_plan !== 'yes') return result(s.long_plan === 'no' ? '先确定长期计划' : '长期计划还没确定', [
    held ? '已有持仓，但尚未确定长期计划。先明确目标比例、用钱时间与能承受的下跌，再决定持仓安排。' : '先明确用钱时间、配置比例与能承受的下跌，再决定是否开始配置。',
    `规则对已有计划者的判断是：新增资金「${nm.title}」，已有持仓「${hd.title}」。${held ? hd.text : nm.text}`,
    ...(s.holding === 'both' ? ['两只基金跟踪同一指数，同时持有不会分散指数风险。'] : []),
  ], money);
  if (held) return result(`你的持仓：${hd.title}`, [
    hd.text,
    ...(s.holding === 'both' ? ['两只基金跟踪同一指数，同时持有不会分散指数风险。'] : []),
    `如果还有新钱：${nm.title}。${nm.text}`,
  ], money);
  return result(`你的新增资金：${nm.title}`, [
    ...(s.holding === 'unknown' ? ['持仓暂未填写，以下只说明新增资金，不推断你的现有持仓。'] : []),
    nm.text,
    '前提是这笔钱至少一年不用，且已经定好投入沪深300的比例。',
  ], money);
}
