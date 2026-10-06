import {Link} from 'react-router';
import {useState} from 'react';
import type {IndexCode} from '../../../../packages/backend/valuation-indexes.ts';
import type {RuleJudgmentResult, ValuationBand} from '../../../../packages/backend/valuation-rule.ts';
import {BAND_JUDGMENTS} from '../../../../packages/backend/valuation-rule.ts';
import {date} from '../lib/format.ts';

export type Judgment = NonNullable<RuleJudgmentResult> & {source_url: string; checked_at: string | null};
export type JudgmentOverview = {indexes: Judgment[]};

export function IndexOverview({indexes, selected, onSelect}: {indexes: Judgment[]; selected: IndexCode; onSelect: (index: IndexCode) => void}) {
  return <nav className="rule-indexes" aria-label="选择宽基指数">
    {indexes.map(j => <button key={j.index_code} type="button" aria-pressed={selected === j.index_code} onClick={() => onSelect(j.index_code)}>
      <strong>{j.index_name}</strong>
      <span className={`rule-index-band band-${j.band}`}>{j.judgment.label}</span>
      <small>第 {j.percentile} 百分位</small>
      <span className="rule-index-action">{j.judgment.new_money.title}</span>
    </button>)}
  </nav>;
}

export function IndexScopeNote({index}: {index: IndexCode}) {
  return index !== '000300' && <p className="rule-index-note">基金比较和「我的情况」目前仅适用于沪深300。</p>;
}

const BAND_ORDER: ValuationBand[] = ['low', 'mid', 'high', 'extreme'];

/** Horizontal scale 0–100 with the band boundaries and today's position. */
export function PercentileScale({j}: {j: Judgment}) {
  const {low, high, extreme} = j.rule;
  const edges = [0, low, high, extreme, 100];
  return <div className="rule-scale" role="img" aria-label={`当前处于近十年第${j.percentile}百分位，${j.judgment.label}`}>
    <div className="rule-scale-bar">
      {BAND_ORDER.map((band, i) => <span key={band} className={`rule-scale-band band-${band}${band === j.band ? ' is-current' : ''}`} style={{left: `${edges[i]}%`, width: `${edges[i + 1] - edges[i]}%`}}>
        <em>{BAND_JUDGMENTS[band].label}</em>
      </span>)}
      <i className="rule-scale-marker" style={{left: `${j.percentile}%`}}><b>{j.percentile}</b></i>
    </div>
    <div className="rule-scale-ticks">{[low, high, extreme].map(v => <span key={v} style={{left: `${v}%`}}>{v}</span>)}</div>
  </div>;
}

/** Percentile over time with the band boundaries; each confirmed change is a dot. */
export function PercentileChart({j, height = 260, activeDate, onHover, onSelect}: {j: Judgment; height?: number; activeDate: string; onHover: (date: string | null) => void; onSelect: (date: string) => void}) {
  const changes = j.changes.filter(c => c.from);
  const active = changes.find(c => c.date === activeDate);
  const pts = [...new Map([...j.chart, ...changes].map(p => [p.date, p])).values()].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = Date.parse(pts[0].date), t1 = Date.parse(pts.at(-1)!.date);
  const edges = [0, j.rule.low, j.rule.high, j.rule.extreme, 100];
  const last = j.last_change;
  function chart(width: number, narrow: boolean) {
    const pad = 28, right = width - (narrow ? 70 : 92), callout = width - 12;
    const x = (d: string) => pad + ((Date.parse(d) - t0) / (t1 - t0)) * (right - pad);
    const y = (p: number) => 34 + (1 - p / 100) * (height - 64);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.percentile).toFixed(1)}`).join('');
    const years = [...new Set(pts.map(p => p.date.slice(0, 4)))].filter((_, i, a) => i === a.length - 1 || (i % (narrow ? 3 : 2) === 0 && (!narrow || i < a.length - 2)));
    // Nearby changes share touch areas: select by distance to the actual point.
    function changeAt(clientX: number, clientY: number, svg: SVGSVGElement) {
      const rect = svg.getBoundingClientRect();
      const px = (clientX - rect.left) * width / rect.width;
      const py = (clientY - rect.top) * height / rect.height;
      const nearest = changes.map(c => ({date: c.date, distance: Math.hypot(x(c.date) - px, y(c.percentile) - py)})).sort((a, b) => a.distance - b.distance)[0];
      return nearest.distance <= 10 ? nearest.date : null;
    }
    return <svg className={`rule-chart rule-chart-${narrow ? 'mobile' : 'desktop'}`} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${j.index_name}估值分位曲线，圆点为确认改判日`} onMouseMove={event => onHover(changeAt(event.clientX, event.clientY, event.currentTarget))} onMouseLeave={() => onHover(null)} onClick={event => {if (event.detail > 0) {const changeDate = changeAt(event.clientX, event.clientY, event.currentTarget); if (changeDate) onSelect(changeDate);}}}>
      {BAND_ORDER.map((band, i) => <rect key={band} x={pad} y={y(edges[i + 1])} width={right - pad} height={y(edges[i]) - y(edges[i + 1])} className={`rule-chart-band band-${band}`}/>)}
      {[100, j.rule.extreme, j.rule.high, j.rule.low, 0].map(v => <g key={v}>
        <line x1={pad} x2={right} y1={y(v)} y2={y(v)} className="rule-chart-guide"/>
        <text x={pad - 6} y={y(v) + 4} className="rule-chart-label" textAnchor="end">{v}</text>
      </g>)}
      <path d={path} className="rule-chart-line"/>
      {active && <line x1={x(active.date)} x2={x(active.date)} y1={y(100)} y2={y(0)} className="rule-chart-selected-guide"/>}
      <line x1={x(last.date)} x2={x(last.date)} y1={24} y2={y(last.percentile)} className="rule-chart-recent-guide"/>
      <text x={right} y={16} textAnchor="end" className="rule-chart-callout">最近改判 · {date(last.date)}</text>
      {changes.map(c => <a key={c.date} href={`#rule-change-${c.date}`} aria-label={`${date(c.date)}，${BAND_JUDGMENTS[c.from!].label}改为${BAND_JUDGMENTS[c.to].label}，查看记录`} aria-controls={`rule-change-${c.date}`} className={`rule-chart-event${activeDate === c.date ? ' is-active' : ''}`} onFocus={() => onHover(c.date)} onBlur={() => onHover(null)} onClick={event => {event.preventDefault(); if (event.detail === 0) onSelect(c.date);}}>
        <title>{`${date(c.date)}：${BAND_JUDGMENTS[c.from!].label} → ${BAND_JUDGMENTS[c.to].label}；新增资金${BAND_JUDGMENTS[c.to].new_money.title}`}</title>
        <circle cx={x(c.date)} cy={y(c.percentile)} r={9} className="rule-chart-hit"/>
        <circle cx={x(c.date)} cy={y(c.percentile)} r={activeDate === c.date || c.date === last.date ? 5 : 3.5} className={`rule-chart-dot band-${c.to}`}/>
      </a>)}
      <line x1={x(j.as_of)} x2={callout} y1={y(j.percentile)} y2={y(j.percentile)} className="rule-chart-current-guide"/>
      <circle cx={callout} cy={y(j.percentile)} r={4} className="rule-chart-today"/>
      <text x={callout} y={y(j.percentile) + 23} textAnchor="end" className="rule-chart-callout rule-chart-today-label">最新 · {j.percentile}</text>
      {years.map(yr => {const d = pts.find(p => p.date.startsWith(yr))!.date; return <text key={yr} x={x(d)} y={height - 6} className="rule-chart-label" textAnchor={yr === years.at(-1) ? 'end' : 'middle'}>{yr}</text>;})}
    </svg>;
  }
  return <figure className="rule-chart-figure">
    <div className="rule-chart-legend" aria-label="分位区间与新增资金判断">{BAND_ORDER.map((band, i) => <div key={band}><span className={`band-${band}`}>{BAND_JUDGMENTS[band].label} · {edges[i]}–{edges[i + 1]}</span><small>{BAND_JUDGMENTS[band].new_money.title}</small></div>)}</div>
    <p className="rule-chart-hint">曲线是估值分位；圆点是确认改判日。点选或悬停圆点，与下方记录对照。</p>
    {chart(720, false)}{chart(360, true)}
    <figcaption className="rule-chart-detail" aria-live="polite">{active && <><strong>{date(active.date)} · {BAND_JUDGMENTS[active.from!].label} → {BAND_JUDGMENTS[active.to].label}</strong><span>新增资金：{BAND_JUDGMENTS[active.to].new_money.title}；当日 {active.pe_ttm} 倍，第 {active.percentile} 百分位</span></>}</figcaption>
  </figure>;
}

function Action({who, part}: {who: string; part: Judgment['judgment']['new_money']}) {
  return <div className="rule-action">
    <small>{who}</small>
    <strong><span className={`rule-chip chip-${part.action}`}>{part.action}</span>{part.title}</strong>
    <p>{part.text}</p>
  </div>;
}

/** PE range for a band at today's boundaries; the boundaries move as the ten-year window rolls. */
function bandRange(j: Judgment, band: ValuationBand) {
  const {low, high, extreme} = j.boundaries;
  if (band === 'low') return <>低于约 <b>{low}</b> 倍</>;
  if (band === 'mid') return <>在约 <b>{low}</b>–<b>{high}</b> 倍之间</>;
  if (band === 'high') return <>在约 <b>{high}</b>–<b>{extreme}</b> 倍之间</>;
  return <>高于约 <b>{extreme}</b> 倍</>;
}

const STALE_DAYS = 10;

export function RuleJudgment({j: initial, indexes = [initial], today = new Date()}: {j: Judgment; indexes?: Judgment[]; today?: Date}) {
  const [selected, setSelected] = useState<IndexCode>(initial.index_code);
  const j = indexes.find(item => item.index_code === selected) ?? initial;
  const last = j.last_change;
  const age = Math.floor((today.getTime() - Date.parse(`${j.as_of}T00:00:00+08:00`)) / 86_400_000);
  const lastFrom = last.from ? BAND_JUDGMENTS[last.from] : null;
  return <>
    <IndexOverview indexes={indexes} selected={j.index_code} onSelect={setSelected}/>
    <IndexScopeNote index={j.index_code}/>
    <section className="rule-judgment" aria-labelledby="rule-judgment-title">
    <div className="rule-head">
      <small>{j.index_name} · 本期判断 · 数据截至 {date(j.as_of)}</small>
      <h1 id="rule-judgment-title">估值处在近十年{j.judgment.label}，{j.judgment.new_money.title}</h1>
      {age > STALE_DAYS && <p className="rule-pending">官方估值已有 {age} 天没有新数据，判断仍按 {date(j.as_of)} 的数据给出；联网打开应用时会自动补查。</p>}
      <p className="rule-fact">滚动市盈率 <b>{j.pe_ttm}</b> 倍。{date(j.window_start)} 以来，有 <b>{j.percentile}%</b> 的数据日估值不高于当日。</p>
    </div>
    <div className="rule-actions">
      <Action who="新增资金" part={j.judgment.new_money}/>
      <Action who="已有持仓" part={j.judgment.held}/>
    </div>
    <PercentileScale j={j}/>
    <div className="rule-triggers">
      <h2>什么时候会改判</h2>
      <ul>
        {BAND_ORDER.filter(b => b !== j.band).map(b => {
          const next = BAND_JUDGMENTS[b];
          const heldChanges = next.held.title !== j.judgment.held.title;
          return <li key={b}>市盈率连续{j.rule.confirm_days}个数据日{bandRange(j, b)} → {next.label}：新增资金「{next.new_money.title}」{heldChanges && <>，已有持仓「{next.held.title}」</>}</li>;
        })}
      </ul>
      {j.pending && <p className="rule-pending">已有 {j.pending.days}/{j.pending.needed} 个数据日落在{j.pending.judgment.label}，再持续 {j.pending.needed - j.pending.days} 个数据日就会改判。</p>}
    </div>
    <p className="rule-last">
      上次改判：{date(last.date)}{lastFrom ? `，由「${lastFrom.new_money.title}」改为「${j.judgment.new_money.title}」` : ''}（当日第{last.percentile}百分位）。
      <Link to={`/changes?index=${j.index_code}#rule`}>十年里的 {j.changes.length - 1} 次改判 →</Link>
    </p>
    <p className="rule-note">判断只由公开规则和中证指数官方估值决定，不读取你的资料；不预测涨跌，也不保证收益。<Link to={`/changes?index=${j.index_code}#rule-method`}>规则与口径</Link></p>
  </section></>;
}
