import {BAND_JUDGMENTS} from '../../../../packages/backend/valuation-rule.ts';
import {PercentileChart, type Judgment} from './RuleJudgment.tsx';
import {date} from '../lib/format.ts';

/** Every confirmed change of the rule judgment, newest first, with the method spelled out. */
export function RuleRecord({j}: {j: Judgment}) {
  const changes = j.changes.filter(c => c.from);
  const live = changes.filter(c => c.origin === 'live').length;
  return <>
    <section className="rule-record" id="rule">
      <h2>规则判断的每一次改变</h2>
      <p>
        {date(j.history_first)} 起的中证官方估值数据，按同一规则逐日计算，共改判 {changes.length} 次。
        {live ? `其中 ${live} 次发生在软件运行之后。` : `${date(j.rule.live_from)} 以前的改判是按同一规则对历史数据回算，不是当时发布的判断。`}
        回算只说明规则会在什么时候改变判断，不证明照做能获得收益。
      </p>
      <PercentileChart j={j}/>
      <table className="rule-table">
        <thead><tr><th>日期</th><th>改为</th><th>新增资金</th><th className="hide-narrow">已有持仓</th><th className="num">市盈率</th><th className="num">分位</th></tr></thead>
        <tbody>{changes.map(c => {
          const to = BAND_JUDGMENTS[c.to];
          return <tr key={c.date}>
            <td>{date(c.date)}<div className="origin">{c.origin === 'live' ? '软件运行中' : '回算'}{c.full_window ? '' : ' · 不足十年数据'}</div></td>
            <td>{to.label}</td>
            <td>{to.new_money.title}</td>
            <td className="hide-narrow">{to.held.title}</td>
            <td className="num">{c.pe_ttm}</td>
            <td className="num">{c.percentile}</td>
          </tr>;
        })}</tbody>
      </table>
    </section>
    <section className="rule-record rule-method" id="rule-method">
      <h2>规则与口径</h2>
      <dl>
        <dt>规则</dt><dd>{j.rule.name}（{j.rule.id}）。规则在软件中公开，所有改判都可以用同一份数据复算。</dd>
        <dt>指标</dt><dd>沪深300{j.rule.metric}，来自中证指数有限公司官网每日估值数据（{j.rows} 个数据日，{date(j.history_first)} 至 {date(j.as_of)}）。</dd>
        <dt>分位</dt><dd>近 {j.rule.window_years} 年中，估值不高于当日的数据日所占比例。数据不足十年时用全部已有数据，且至少 {j.rule.min_years} 年。</dd>
        <dt>分档</dt><dd>{(['low', 'mid', 'high', 'extreme'] as const).map(b => `${BAND_JUDGMENTS[b].label}（${BAND_JUDGMENTS[b].range}）：新增资金${BAND_JUDGMENTS[b].new_money.title}，已有持仓${BAND_JUDGMENTS[b].held.title}`).join('；')}。</dd>
        <dt>防抖</dt><dd>新分档须连续 {j.rule.confirm_days} 个数据日成立才改判，避免在边界附近来回变化。</dd>
        <dt>各档天数</dt><dd>按日计算，偏低区 {j.share_of_days.low}%、中间区 {j.share_of_days.mid}%、偏高区 {j.share_of_days.high}%、高位区 {j.share_of_days.extreme}% 的数据日。</dd>
        <dt>不包括</dt><dd>盈利增速、利率、个人收入与风险承受能力。估值低不代表不会继续下跌；规则只回答“按估值位置，现在适合怎样安排长期资金”。</dd>
      </dl>
    </section>
  </>;
}
