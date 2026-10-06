import {useState} from 'react';
import {BAND_JUDGMENTS} from '../../../../packages/backend/valuation-rule.ts';
import {PercentileChart, type Judgment} from './RuleJudgment.tsx';
import {date} from '../lib/format.ts';

/** Every confirmed change of the rule judgment, newest first, with the method spelled out. */
export function RuleRecord({j}: {j: Judgment}) {
  const changes = j.changes.filter(c => c.from);
  const live = changes.filter(c => c.origin === 'live').length;
  const years = [...new Set(changes.map(c => c.date.slice(0, 4)))];
  const [selectedDate, setSelectedDate] = useState(j.last_change.date);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const activeDate = hoveredDate ?? selectedDate;
  const last = j.last_change;
  function selectChange(changeDate: string) {
    setSelectedDate(changeDate);
    setHoveredDate(null);
    const row = document.getElementById(`rule-change-${changeDate}`);
    row?.scrollIntoView({block: 'nearest'});
    row?.querySelector('button')?.focus({preventScroll: true});
  }
  return <>
    <section className="rule-record" id="rule">
      <h2>{j.index_name}：十年里，判断怎样改变</h2>
      <p>
        {date(j.chart[0].date)} 至 {date(j.as_of)}，共 {changes.length} 次改判。估值进入新分档，连续 {j.rule.confirm_days} 个数据日才改变判断。
      </p>
      <div className="rule-record-summary">
        <div><small>当前判断 · 数据截至 {date(j.as_of)}</small><strong>{j.judgment.label} · 第 {j.percentile} 百分位</strong><p>新增资金：{j.judgment.new_money.title}</p></div>
        <div><small>最近一次改判 · {date(last.date)}</small><strong>{last.from && `${BAND_JUDGMENTS[last.from].label} → `}{BAND_JUDGMENTS[last.to].label}</strong><button type="button" onClick={() => selectChange(last.date)}>看这次改判 ↓</button></div>
      </div>
      <PercentileChart j={j} activeDate={activeDate} onHover={setHoveredDate} onSelect={selectChange}/>
      <p className="rule-record-origin">{live ? `其中 ${live} 次发生在软件运行之后，其余为历史回算。` : `${date(j.rule.live_from)} 以前的改判为历史回算，保留当日估值和规则结果，不是当时发布的判断。`}</p>
      <table className="rule-table" aria-label="按年份排列的规则改判记录">
        <thead><tr><th scope="col">日期</th><th scope="col">判断变化</th><th scope="col">新增资金</th><th scope="col">已有持仓</th><th scope="col" className="num">市盈率</th><th scope="col" className="num">分位</th></tr></thead>
        {years.map(year => <tbody key={year}>
          <tr className="rule-year"><th scope="colgroup" colSpan={6}>{year} 年 <small>{changes.filter(c => c.date.startsWith(year)).length} 次改判</small></th></tr>
          {changes.filter(c => c.date.startsWith(year)).map(c => {
          const to = BAND_JUDGMENTS[c.to];
          return <tr key={c.date} id={`rule-change-${c.date}`} className={`rule-change${activeDate === c.date ? ' is-active' : ''}`} onMouseMove={() => setHoveredDate(c.date)} onMouseLeave={() => setHoveredDate(null)} onFocus={() => setHoveredDate(c.date)} onBlur={() => setHoveredDate(null)}>
            <td className="rule-change-date"><button type="button" onClick={() => setSelectedDate(c.date)} aria-pressed={selectedDate === c.date}>{date(c.date)}</button>{c.date === last.date && <span className="rule-latest">最近一次</span>}<div className="origin">{c.origin === 'live' ? '软件运行中' : '回算'}{c.full_window ? '' : ' · 不足十年数据'}</div></td>
            <td className="rule-transition">{c.from && <span>{BAND_JUDGMENTS[c.from].label} → </span>}<b className={`band-${c.to}`}>{to.label}</b></td>
            <td className="rule-change-action" data-label="新增资金">{to.new_money.title}</td>
            <td className="rule-change-action" data-label="已有持仓">{to.held.title}</td>
            <td className="num" data-label="市盈率">{c.pe_ttm} 倍</td>
            <td className="num" data-label="分位">{c.percentile}%</td>
          </tr>;
        })}</tbody>)}
      </table>
    </section>
    <section className="rule-record rule-method" id="rule-method">
      <h2>规则与口径</h2>
      <dl>
        <dt>规则</dt><dd>{j.rule.name}。所有改判都可以用同一份数据复算。</dd>
        <dt>指标</dt><dd>{j.index_name}{j.rule.metric}，来自中证指数有限公司官网每日估值数据（{j.rows} 个数据日，{date(j.history_first)} 至 {date(j.as_of)}）。</dd>
        <dt>分位</dt><dd>近 {j.rule.window_years} 年中，估值不高于当日的数据日所占比例。数据不足十年时用全部已有数据，且至少 {j.rule.min_years} 年。</dd>
        <dt>分档</dt><dd>{(['low', 'mid', 'high', 'extreme'] as const).map(b => `${BAND_JUDGMENTS[b].label}（${BAND_JUDGMENTS[b].range}）：新增资金${BAND_JUDGMENTS[b].new_money.title}，已有持仓${BAND_JUDGMENTS[b].held.title}`).join('；')}。</dd>
        <dt>确认改判</dt><dd>新分档须连续 {j.rule.confirm_days} 个数据日成立才改判，避免在边界附近来回变化。</dd>
        <dt>各档天数</dt><dd>按日计算，偏低区 {j.share_of_days.low}%、中间区 {j.share_of_days.mid}%、偏高区 {j.share_of_days.high}%、高位区 {j.share_of_days.extreme}% 的数据日。</dd>
      </dl>
    </section>
  </>;
}
