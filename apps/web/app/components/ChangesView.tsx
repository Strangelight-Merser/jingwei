import {useState, type ReactNode} from 'react';
import {BAND_JUDGMENTS} from '../../../../packages/backend/valuation-rule.ts';
import {hasReturns, RETURN_INDEX_CODES, VALUATION_INDEXES, type IndexCode} from '../../../../packages/backend/valuation-indexes.ts';
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
    document.getElementById(`rule-change-${day}`)?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll: true});
    document.getElementById(`rule-change-${day}`)?.scrollIntoView({block: 'center', behavior: 'smooth'});
  }

  return <div className="changes-view">
    <header className="changes-head reveal" style={{'--i': 0} as React.CSSProperties}>
      <div>
        <p className="changes-kicker">判断变化</p>
        <h1>{j.index_name} · {j.full_window ? '十年' : ''}判断记录</h1>
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
      <p className="changes-origin">{live ? `其中 ${live} 次发生在软件运行之后，其余为历史回测。` : `${date(j.rule.live_from)} 以前的改判都是用同一规则对历史数据回测得出的，不是当时发布的判断。`}点击曲线上的圆点可定位到下方记录。</p>
    </section>

    <section className="changes-stability reveal" style={{'--i': 3} as React.CSSProperties} aria-labelledby="stability-title">
      <h2 id="stability-title">为什么要设缓冲</h2>
      <p>用同一份数据比较：如果不设缓冲，共改判 <b>{j.stability.v1_changes}</b> 次，其中 <b>{j.stability.v1_quick_reversals}</b> 次在 {j.stability.reversal_days} 天内又改了回去；设了缓冲后改判 <b>{j.stability.changes}</b> 次，{j.stability.reversal_days} 天内又改回去的只有 <b>{j.stability.quick_reversals}</b> 次。缓冲只为减少来回改口{hasReturns(j.index_code) ? '，各区间之后的实际收益见下方回放' : ''}。</p>
    </section>

    <div className="reveal" style={{'--i': 4} as React.CSSProperties}>
      {hasReturns(j.index_code)
        ? <><RuleOutcomes key={'o' + j.index_code} index={j.index_code} outcomes={outcomes}/><ErpLens index={j.index_code}/></>
        : <section className="changes-stability"><h2>各区间之后的收益</h2><p>收益回放与股债对照需要含分红的全收益指数和对应的国债收益率，目前只有{RETURN_INDEX_CODES.map(code => VALUATION_INDEXES[code].name).join('、')}具备。{j.index_name}先给出估值判断和改判记录。</p></section>}
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
                  <span className="changes-tag">{c.origin === 'live' ? '实时' : '历史回测'}{c.full_window ? '' : ' · 不足十年'}</span>
                </button>
              </li>;
            })}
          </ol>
        </div>;
      })}
    </section>

    <details className="changes-method" id="rule-method">
      <summary>规则说明</summary>
      <dl>
        <dt>规则</dt><dd>{j.rule.name}。所有改判都可以用同一份数据复算。</dd>
        <dt>指标</dt><dd>{j.index_name}{j.rule.metric}，来自{j.rule.source_label}（{j.rows.toLocaleString('zh-CN')} {j.rule.unit}，{date(j.history_first)} 至 {date(j.as_of)}）。</dd>
        <dt>分位</dt><dd>近 {j.rule.window_years} 年中，估值不高于当日的{j.rule.frequency === 'weekly' ? '周' : '交易日'}所占比例。数据不足十年时用全部已有数据，且至少 {j.rule.min_years} 年。</dd>
        <dt>分档</dt><dd>{(['low', 'mid', 'high', 'extreme'] as const).map(b => `${BAND_JUDGMENTS[b].label}（${BAND_JUDGMENTS[b].range}）：新增资金${BAND_JUDGMENTS[b].new_money.title}，已有持仓${BAND_JUDGMENTS[b].held.title}`).join('；')}。</dd>
        <dt>确认改判</dt><dd>新分档须连续 {j.rule.confirm_days} {j.rule.unit}成立才改判{j.rule.frequency === 'weekly' ? '（周数据的两个读数约等于日数据的五个交易日）' : ''}。</dd>
        <dt>缓冲（v2）</dt><dd>离开已确认的区间，要比边界再多越过 {j.rule.buffer} 个百分点；例如从中间区升到偏高区要到第 {j.rule.high + j.rule.buffer} 百分位，从偏高区回到中间区要低于第 {j.rule.high - j.rule.buffer} 百分位。</dd>
        <dt>各档天数</dt><dd>偏低区 {j.share_of_days.low}%、中间区 {j.share_of_days.mid}%、偏高区 {j.share_of_days.high}%、高位区 {j.share_of_days.extreme}% 的{j.rule.frequency === 'weekly' ? '周' : '交易日'}。</dd>
      </dl>
    </details>
  </div>;
}
