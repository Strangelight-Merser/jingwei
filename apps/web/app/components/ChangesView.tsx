import {useState, type ReactNode} from 'react';
import {BAND_JUDGMENTS} from '../../../../packages/backend/valuation-rule.ts';
import type {IndexCode} from '../../../../packages/backend/valuation-indexes.ts';
import type {RuleOutcomesPublication} from '../../../../packages/backend/rule-outcomes-publication.ts';
import type {Judgment} from './RuleJudgment.tsx';
import {IndexSwitch, ScrubChart} from './HomeHero.tsx';
import {RuleOutcomes} from './RuleOutcomes.tsx';
import {ErpLens} from './ErpLens.tsx';
import {date} from '../lib/format.ts';
import '../changes.css';

/** Ten years of one index's rule judgment: headline numbers, the chart, what followed, and every change. */
export function ChangesView({j, indexes, outcomes, onSelectIndex, notices}: {j: Judgment; indexes: Judgment[]; outcomes: RuleOutcomesPublication | null; onSelectIndex: (index: IndexCode) => void; notices?: ReactNode}) {
  const changes = j.changes.filter(c => c.from);
  const years = [...new Set(changes.map(c => c.date.slice(0, 4)))];
  const last = j.last_change;
  const [scrub, setScrub] = useState<number | null>(null);
  const [selected, setSelected] = useState<string>(last.date);
  const live = changes.filter(c => c.origin === 'live').length;

  function pick(day: string) {
    setSelected(day);
    document.getElementById(`rule-change-${day}`)?.scrollIntoView({block: 'center', behavior: 'smooth'});
  }

  return <div className="changes-view">
    <header className="changes-head reveal" style={{'--i': 0} as React.CSSProperties}>
      <div>
        <p className="changes-kicker">判断变化</p>
        <h1>{j.index_name} · 十年判断记录</h1>
      </div>
      <IndexSwitch indexes={indexes} selected={j.index_code} onSelect={onSelectIndex}/>
    </header>

    <dl className="changes-stats reveal" style={{'--i': 1} as React.CSSProperties}>
      <div><dt>改判次数</dt><dd><strong>{changes.length}</strong> 次</dd></div>
      <div><dt>覆盖区间</dt><dd><strong>{j.chart[0].date.slice(0, 4)}–{j.as_of.slice(0, 4)}</strong></dd><small>{date(j.chart[0].date)} 至 {date(j.as_of)}</small></div>
      <div className={`tone-${j.band}`}><dt>当前</dt><dd><span className="changes-band">{j.judgment.label}</span> <strong>{j.percentile}</strong></dd><small>第 {j.percentile} 百分位</small></div>
      <div><dt>最近改判</dt><dd><strong>{date(last.date)}</strong></dd><small>{last.from ? `${BAND_JUDGMENTS[last.from].label} → ` : ''}{BAND_JUDGMENTS[last.to].label}</small></div>
    </dl>

    {notices}
    <section className="changes-chart reveal" style={{'--i': 2} as React.CSSProperties} aria-label="十年分位曲线">
      <ScrubChart j={j} scrub={scrub} onScrub={setScrub} selectedChange={selected} onPickChange={pick} tall/>
      <p className="changes-origin">{live ? `其中 ${live} 次发生在软件运行之后，其余为历史回算。` : `${date(j.rule.live_from)} 以前的改判都是按同一规则对官方历史数据的回算，不是当时发布的判断。`}点击曲线上的圆点可定位到下方记录。</p>
    </section>

    <div className="reveal" style={{'--i': 3} as React.CSSProperties}>
      <RuleOutcomes key={'o' + j.index_code} index={j.index_code} outcomes={outcomes}/>
      <ErpLens index={j.index_code}/>
    </div>

    <section className="changes-log" id="rule" aria-labelledby="changes-log-title">
      <h2 id="changes-log-title">每一次改判</h2>
      {years.map(year => {
        const inYear = changes.filter(c => c.date.startsWith(year));
        return <div key={year} className="changes-year">
          <h3>{year}<small>{inYear.length} 次</small></h3>
          <ol>
            {inYear.map(c => {
              const to = BAND_JUDGMENTS[c.to];
              return <li key={c.date} id={`rule-change-${c.date}`} className={`tone-${c.to}${selected === c.date ? ' is-selected' : ''}`}>
                <button type="button" className="changes-entry" aria-pressed={selected === c.date} onClick={() => setSelected(c.date)}>
                  <span className="changes-dot" aria-hidden="true"/>
                  <span className="changes-date">{date(c.date).slice(5)}{c.date === last.date && <em>最近</em>}</span>
                  <span className="changes-move">{c.from && <span className="changes-from">{BAND_JUDGMENTS[c.from].label}</span>}<span className="changes-arrow" aria-hidden="true">→</span><span className="changes-band">{to.label}</span></span>
                  <span className="changes-action">新增资金 · {to.new_money.title}{to.held.title !== '继续持有' && <> · 持仓 · {to.held.title}</>}</span>
                  <span className="changes-figures">{c.pe_ttm} 倍 · {c.percentile}%</span>
                  <span className="changes-tag">{c.origin === 'live' ? '运行中' : '回算'}{c.full_window ? '' : ' · 不足十年'}</span>
                </button>
              </li>;
            })}
          </ol>
        </div>;
      })}
    </section>

    <details className="changes-method" id="rule-method">
      <summary>规则与口径</summary>
      <dl>
        <dt>规则</dt><dd>{j.rule.name}。所有改判都可以用同一份数据复算。</dd>
        <dt>指标</dt><dd>{j.index_name}{j.rule.metric}，来自中证指数有限公司官网每日估值数据（{j.rows.toLocaleString('zh-CN')} 个数据日，{date(j.history_first)} 至 {date(j.as_of)}）。</dd>
        <dt>分位</dt><dd>近 {j.rule.window_years} 年中，估值不高于当日的数据日所占比例。数据不足十年时用全部已有数据，且至少 {j.rule.min_years} 年。</dd>
        <dt>分档</dt><dd>{(['low', 'mid', 'high', 'extreme'] as const).map(b => `${BAND_JUDGMENTS[b].label}（${BAND_JUDGMENTS[b].range}）：新增资金${BAND_JUDGMENTS[b].new_money.title}，已有持仓${BAND_JUDGMENTS[b].held.title}`).join('；')}。</dd>
        <dt>确认改判</dt><dd>新分档须连续 {j.rule.confirm_days} 个数据日成立才改判，避免在边界附近来回变化。</dd>
        <dt>各档天数</dt><dd>偏低区 {j.share_of_days.low}%、中间区 {j.share_of_days.mid}%、偏高区 {j.share_of_days.high}%、高位区 {j.share_of_days.extreme}% 的数据日。</dd>
      </dl>
    </details>
  </div>;
}
