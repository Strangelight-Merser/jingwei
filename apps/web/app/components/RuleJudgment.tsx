import {Link} from 'react-router';
import type {RuleJudgmentResult, ValuationBand} from '../../../../packages/backend/valuation-rule.ts';
import {BAND_JUDGMENTS} from '../../../../packages/backend/valuation-rule.ts';
import {date} from '../lib/format.ts';

export type Judgment = NonNullable<RuleJudgmentResult> & {source_url: string; checked_at: string | null};

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
export function PercentileChart({j, height = 180}: {j: Judgment; height?: number}) {
  const width = 720, pad = 28;
  const pts = j.chart;
  const t0 = Date.parse(pts[0].date), t1 = Date.parse(pts.at(-1)!.date);
  const x = (d: string) => pad + ((Date.parse(d) - t0) / (t1 - t0)) * (width - pad * 2);
  const y = (p: number) => 8 + (1 - p / 100) * (height - 30);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.percentile).toFixed(1)}`).join('');
  const years = [...new Set(pts.map(p => p.date.slice(0, 4)))].filter((_, i, a) => i % 2 === 0 || i === a.length - 1);
  return <svg className="rule-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="沪深300滚动市盈率在近十年中的分位变化">
    {[j.rule.low, j.rule.high, j.rule.extreme].map(v => <g key={v}>
      <line x1={pad} x2={width - pad} y1={y(v)} y2={y(v)} className="rule-chart-guide"/>
      <text x={width - pad + 4} y={y(v) + 4} className="rule-chart-label">{v}</text>
    </g>)}
    <path d={path} className="rule-chart-line"/>
    {j.changes.filter(c => c.from).map(c => <circle key={c.date} cx={x(c.date)} cy={y(c.percentile)} r={3} className={`rule-chart-dot band-${c.to}`}><title>{`${c.date} 改为${BAND_JUDGMENTS[c.to].label}`}</title></circle>)}
    {years.map(yr => { const d = pts.find(p => p.date.startsWith(yr))!.date; return <text key={yr} x={x(d)} y={height - 4} className="rule-chart-label" textAnchor="middle">{yr}</text>; })}
  </svg>;
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

export function RuleJudgment({j, today = new Date()}: {j: Judgment; today?: Date}) {
  const last = j.last_change;
  const age = Math.floor((today.getTime() - Date.parse(`${j.as_of}T00:00:00+08:00`)) / 86_400_000);
  const lastFrom = last.from ? BAND_JUDGMENTS[last.from] : null;
  return <section className="rule-judgment" aria-labelledby="rule-judgment-title">
    <div className="rule-head">
      <small>沪深300 · 本期判断 · 数据截至 {date(j.as_of)}</small>
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
      <Link to="/changes#rule">十年里的 {j.changes.length - 1} 次改判 →</Link>
    </p>
    <p className="rule-note">判断只由公开规则和中证指数官方估值决定，不读取你的资料；不预测涨跌，也不保证收益。<Link to="/changes#rule-method">规则与口径</Link></p>
  </section>;
}
