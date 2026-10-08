import type {ReaderSituation} from '../../../../packages/contracts/reader-situation.ts';
import {advisorReading, advisorSituationLabel} from '../lib/advisor-reading.ts';
import {changeDescription, type PublicRuleJudgment, type RuleCardData} from '../lib/rule-card.ts';
import {number} from '../lib/format.ts';
import {DataDateNotice} from './DataDateNotice.tsx';

export function AdvisorExplanation({situation, judgment, card}: {situation: ReaderSituation; judgment: PublicRuleJudgment; card: RuleCardData}) {
  const reading = advisorReading(situation, judgment), b = card.boundaries;
  return <article className="advisor-sheet" aria-label="给客户的一页说明">
    <header className="advisor-sheet-heading"><div><p>经纬 · 客户说明</p><h2>{card.index.name}，现在怎样安排</h2></div><span>数据截至<br/><strong>{card.as_of}</strong></span></header>
    <DataDateNotice asOf={card.as_of}/><p className="advisor-situation">{advisorSituationLabel(situation)}</p>
    <section className="advisor-current"><h3>当前判断 <strong>{card.label}</strong></h3><p>滚动市盈率 {number(card.pe_ttm)} 倍 · 第 {number(card.percentile)} 百分位<br/>估值比较窗口：{card.window_start} 至 {card.as_of}</p><dl><div><dt>新增资金</dt><dd>{card.new_money.title}</dd></div><div><dt>已有持仓</dt><dd>{card.held.title}</dd></div></dl></section>
    <section className="advisor-personal"><h3>对你的具体说法</h3><h4>{reading.title}</h4>{reading.money && <p className="advisor-money">{reading.money}</p>}{reading.paragraphs.map(p => <p key={p}>{p}</p>)}</section>
    <section className="advisor-change"><h3>什么时候会改判</h3><p>分位低于 {b.low_percentile} 进入偏低区；{b.low_percentile} 至不足 {b.high_percentile} 为中间区；{b.high_percentile} 至不足 {b.extreme_percentile} 为偏高区；达到 {b.extreme_percentile} 为高位区。上面已按当前区间计入 {b.buffer} 个百分点的缓冲；连续 {b.confirm_days} {b.unit}处在同一新区间才改判。</p><p>当日市盈率边界约为 {number(b.low)} / {number(b.high)} / {number(b.extreme)} 倍，会随时间小幅变化，以当天的分位为准。</p>{card.pending && <p>{card.pending.label}正在确认：{card.pending.days}/{card.pending.needed} {b.unit}，当前判断尚未改变。</p>}<p className="advisor-last-change">上次改判：{changeDescription(card.last_change)}</p></section>
    <section className="advisor-source"><h3>数据来源和日期</h3><p>{card.source.name} · 数据截至 {card.as_of}</p><a href={card.source.url} target="_blank" rel="noreferrer">{card.source.url}</a><p>软件运行前的改判是用同一规则对历史数据回测得出的。</p></section>
    <p className="advisor-suitability">规则不预测涨跌、不保证收益，不替代风险测评与适当性匹配。</p>
  </article>;
}
