import {Link, useSearchParams} from 'react-router';
import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {VALUATION_INDEXES, type IndexCode} from '../../../../packages/backend/valuation-indexes.ts';
import {BAND_JUDGMENTS, type ValuationBand} from '../../../../packages/backend/valuation-rule.ts';
import type {Judgment} from './RuleJudgment.tsx';
import {date} from '../lib/format.ts';
import {actionText, bufferNote, eachReading, historySpan} from '../lib/rule-wording.ts';
import '../hero.css';

const BANDS: ValuationBand[] = ['low', 'mid', 'high', 'extreme'];
const STALE_DAYS = 10;
const ACTION_TONE: Record<string, ValuationBand> = {'加': 'low', '持': 'mid', '观察': 'high', '减': 'extreme'};

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Eases a displayed number toward `target`; jumps straight there while scrubbing or with reduced motion. */
function useTweened(target: number, instant: boolean) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (instant || reducedMotion()) {from.current = target; setValue(target); return;}
    const start = performance.now(), origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 420);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (target - origin) * eased;
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, instant]);
  return value;
}

/** The confirmed band on a past day: the latest change on or before it. */
function bandOn(j: Judgment, day: string): ValuationBand {
  return (j.changes.find(c => c.date <= day) ?? j.changes.at(-1)!).to;
}

const PICKER_GROUPS: {label: string; markets: string[]}[] = [{label: 'A股', markets: ['cn']}, {label: '美股 · 港股', markets: ['us', 'hk']}];

/** Every covered index, grouped by market; the tone dot shows each one's current band at a glance. */
export function IndexSwitch({indexes, selected, onSelect}: {indexes: Judgment[]; selected: IndexCode; onSelect: (index: IndexCode) => void}) {
  const picker = useRef<HTMLDivElement>(null);
  // On a phone each row scrolls sideways; keep the selected index in view without moving the page.
  useEffect(() => {
    const button = picker.current?.querySelector<HTMLElement>('[aria-selected="true"]'), row = button?.parentElement;
    if (!button || !row || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = button.offsetLeft - (row.clientWidth - button.offsetWidth) / 2;
  }, [selected]);
  return <div ref={picker} className="index-picker" role="tablist" aria-label="选择指数">
    {PICKER_GROUPS.map(group => {
      const items = indexes.filter(j => group.markets.includes(VALUATION_INDEXES[j.index_code].market));
      return items.length > 0 && <div key={group.label} className="index-picker-group">
        <span className="index-picker-label">{group.label}</span>
        <div className="index-picker-row">{items.map(j => <button key={j.index_code} type="button" role="tab" aria-selected={selected === j.index_code} onClick={() => onSelect(j.index_code)}>
          <i className={`tone-dot tone-${j.band}`} aria-hidden="true"/>{j.index_name}
        </button>)}</div>
      </div>;
    })}
  </div>;
}

/** Ten-year percentile with band shading. Dragging or hovering scrubs through history and drives the headline. */
export function ScrubChart({j, scrub, onScrub, selectedChange, onPickChange, tall = false}: {j: Judgment; scrub: number | null; onScrub: (index: number | null) => void; selectedChange?: string | null; onPickChange?: (date: string) => void; tall?: boolean}) {
  const pts = j.chart;
  const t0 = Date.parse(pts[0].date), span = Date.parse(pts.at(-1)!.date) - t0;
  const xs = useMemo(() => pts.map(p => (Date.parse(p.date) - t0) / span), [pts, t0, span]);
  const edges = [0, j.rule.low, j.rule.high, j.rule.extreme, 100];
  const W = 1000, H = 100;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${(xs[i] * W).toFixed(1)},${(H - p.percentile).toFixed(2)}`).join('');
  const changes = j.changes.filter(c => c.from);
  // Year marks sit at 1 January; the first partial year has none.
  const years = [...new Set(pts.map(p => p.date.slice(0, 4)))].filter(y => Date.parse(`${y}-01-01`) >= t0).filter((_, i) => i % 2 === 0);
  const area = useRef<HTMLDivElement>(null);

  function pick(clientX: number) {
    const rect = area.current!.getBoundingClientRect();
    const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) {const mid = (lo + hi) >> 1; if (xs[mid] < r) lo = mid; else hi = mid;}
    onScrub(r - xs[lo] < xs[hi] - r ? lo : hi);
  }
  function key(event: React.KeyboardEvent) {
    const current = scrub ?? pts.length - 1;
    const step = event.shiftKey ? 26 : 1;
    if (event.key === 'ArrowLeft') {onScrub(Math.max(0, current - step)); event.preventDefault();}
    if (event.key === 'ArrowRight') {onScrub(Math.min(pts.length - 1, current + step)); event.preventDefault();}
    if (event.key === 'Escape' || event.key === 'End') onScrub(null);
  }

  // A click near a confirmed change selects it (within about six weeks on the time axis).
  function nearestChange(day: string) {
    const t = Date.parse(day);
    const best = changes.map(c => ({date: c.date, d: Math.abs(Date.parse(c.date) - t)})).sort((a, b) => a.d - b.d)[0];
    return best && best.d <= 45 * 86_400_000 ? best.date : null;
  }
  const at = scrub ?? pts.length - 1;
  const active = pts[at];
  return <figure className="hero-chart">
    <div
      ref={area}
      className={`hero-chart-area${scrub !== null ? ' is-scrubbing' : ''}${tall ? ' is-tall' : ''}`}
      tabIndex={0}
      role="slider"
      aria-label={`${j.index_name}${historySpan(j)}估值分位，左右方向键回看历史`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={active.percentile}
      aria-valuetext={`${date(active.date)}，第 ${active.percentile} 百分位`}
      onPointerDown={event => {event.currentTarget.setPointerCapture(event.pointerId); pick(event.clientX);}}
      onPointerMove={event => {if (event.pointerType === 'mouse' || event.buttons) pick(event.clientX);}}
      onPointerUp={() => {if (onPickChange && scrub !== null) {const near = nearestChange(pts[scrub].date); if (near) onPickChange(near);} onScrub(null);}}
      onPointerLeave={event => {if (event.pointerType === 'mouse') onScrub(null);}}
      onPointerCancel={() => onScrub(null)}
      onKeyDown={key}
      onBlur={() => onScrub(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {BANDS.map((band, i) => <rect key={band} x={0} width={W} y={H - edges[i + 1]} height={edges[i + 1] - edges[i]} className={`hero-chart-band tone-${band}`}/>)}
        {[j.rule.low, j.rule.high, j.rule.extreme].map(v => <line key={v} x1={0} x2={W} y1={H - v} y2={H - v} className="hero-chart-guide"/>)}
        <g key={j.index_code} className="hero-chart-draw"><path d={path} className="hero-chart-line"/></g>
      </svg>
      {changes.map(c => <i key={c.date} className={`hero-chart-change tone-${c.to}${selectedChange === c.date ? ' is-selected' : ''}`} style={{left: `${((Date.parse(c.date) - t0) / span) * 100}%`, top: `${100 - c.percentile}%`}} aria-hidden="true"/>)}
      <span className="hero-chart-cursor" style={{left: `${xs[at] * 100}%`}} aria-hidden="true">
        <i className={`tone-${bandOn(j, active.date)}`} style={{top: `${100 - active.percentile}%`}}/>
      </span>
      {[j.rule.low, j.rule.high, j.rule.extreme].map(v => <span key={v} className="hero-chart-tick" style={{top: `${100 - v}%`}}>{v}</span>)}
    </div>
    <div className="hero-chart-years" aria-hidden="true">{years.map(y => <span key={y} style={{left: `${((Date.parse(`${y}-01-01`) - t0) / span) * 100}%`}}>{y}</span>)}</div>
    <figcaption>{scrub === null ? `拖动或悬停曲线，回看${j.full_window ? '十年里' : '已有历史中'}${eachReading(j)}的位置；圆点是确认改判日。` : `${date(active.date)} · 当时已确认${BAND_JUDGMENTS[bandOn(j, active.date)].label}`}</figcaption>
  </figure>;
}

function bandRange(j: Judgment, band: ValuationBand) {
  const {low, high, extreme} = j.boundaries;
  if (band === 'low') return `${low} 倍以下`;
  if (band === 'mid') return `${low}–${high} 倍`;
  if (band === 'high') return `${high}–${extreme} 倍`;
  return `${extreme} 倍以上`;
}

export function HomeHero({j: initial, indexes = [initial], guide, today = new Date()}: {j: Judgment; indexes?: Judgment[]; guide?: ReactNode; today?: Date}) {
  // ?index= opens a given index (links from holdings and changes) and records the reader's switch,
  // so other parts of the page (问经纬) follow the same index.
  const [search, setSearch] = useSearchParams();
  const requested = indexes.find(item => item.index_code === search.get('index'))?.index_code ?? initial.index_code;
  const [selected, setSelected] = useState<IndexCode>(requested);
  useEffect(() => setSelected(requested), [requested]);
  const [scrub, setScrub] = useState<number | null>(null);
  const j = indexes.find(item => item.index_code === selected) ?? initial;
  useEffect(() => setScrub(null), [j.index_code]);
  const point = scrub === null ? null : j.chart[scrub];
  const percentile = useTweened(point ? point.percentile : j.percentile, point !== null);
  const shownBand = point ? bandOn(j, point.date) : j.band;
  const age = Math.floor((today.getTime() - Date.parse(`${j.as_of}T00:00:00+08:00`)) / 86_400_000);
  const last = j.last_change;
  const lastFrom = last.from ? BAND_JUDGMENTS[last.from] : null;
  const historyWindow = j.full_window ? '近十年里' : `${date(j.window_start)}以来`;

  return <section className="hero" aria-labelledby="hero-title">
    <div className="hero-top reveal" style={{'--i': 0} as React.CSSProperties}>
      <IndexSwitch indexes={indexes} selected={j.index_code} onSelect={index => {setSelected(index); setSearch((prev: URLSearchParams) => {const next = new URLSearchParams(prev); next.set('index', index); return next;}, {replace: true, preventScrollReset: true});}}/>
      <div className="hero-meta">
        <span>数据截至 {date(j.as_of)} · {j.rule.source === 'csi' ? '中证指数官网' : '蛋卷基金（第三方）'}</span>
        {guide}
      </div>
    </div>

    <div className="hero-main reveal" style={{'--i': 1} as React.CSSProperties}>
      <div className="hero-copy">
        <span className={`hero-band tone-${shownBand}`}>{point ? `${date(point.date)} · ` : ''}{BAND_JUDGMENTS[shownBand].label}</span>
        <h1 id="hero-title" className={point ? 'is-past' : ''}>{BAND_JUDGMENTS[shownBand].new_money.title}</h1>
        <div className="hero-figure" aria-live="off">
          <strong>{percentile.toFixed(1)}</strong>
          <span>百分位</span>
        </div>
        <p className="hero-plain">
          {point
            ? <>{date(point.date)}：滚动市盈率 <b>{point.pe_ttm}</b> 倍，处在当时{j.full_window ? '近十年' : '已有历史'}的第 <b>{point.percentile}</b> 百分位。松开或移开回到今天。</>
            : <>{historyWindow}有 <b>{j.percentile}%</b> 的{j.rule.frequency === 'weekly' ? '周读数' : '交易日'}比现在便宜或一样。滚动市盈率 <b>{j.pe_ttm}</b> 倍。</>}
        </p>
        {age > STALE_DAYS + (j.rule.frequency === 'weekly' ? 7 : 0) && <p className="hero-stale">估值已有 {age} 天没有新数据，判断仍按 {date(j.as_of)} 给出；联网打开时会自动补查。</p>}
        {j.index_code !== '000300' && <p className="hero-scope">基金比较和「我的情况」目前只对沪深300。</p>}
      </div>
      <ScrubChart j={j} scrub={scrub} onScrub={setScrub}/>
    </div>

    <div className="hero-actions reveal" style={{'--i': 2} as React.CSSProperties}>
      {([['新增资金', j.judgment.new_money], ['已有持仓', j.judgment.held]] as const).map(([who, part]) => <div key={who} className={`hero-action tone-${ACTION_TONE[part.action]}`}>
        <small>{who}</small>
        <strong><span className="hero-chip">{part.action}</span>{part.title}</strong>
        <p>{who === '新增资金' && bufferNote(j) ? <><span className="hero-buffer-note">{bufferNote(j)}</span>{actionText(j, part.text, true)}</> : actionText(j, part.text, who === '新增资金')}</p>
      </div>)}
    </div>

    <div className="hero-ladder reveal" style={{'--i': 3} as React.CSSProperties}>
      <div className="hero-ladder-head">
        <h2>什么时候会改判</h2>
        <p>连续 {j.rule.confirm_days} {j.rule.unit}落在另一区间才改判；离开当前区间还要多越过 {j.rule.buffer} 个百分点，避免在边界附近反复改口。倍数随{j.full_window ? '十年' : '历史'}窗口移动。</p>
      </div>
      <ol>
        {BANDS.map(band => <li key={band} className={`tone-${band}${band === j.band ? ' is-current' : ''}`} aria-current={band === j.band ? 'true' : undefined}>
          <span className="hero-ladder-name"><i className={`tone-dot tone-${band}`} aria-hidden="true"/>{BAND_JUDGMENTS[band].label}{band === j.band && <em>现在</em>}</span>
          <strong>{bandRange(j, band)}</strong>
          <span>新增资金 · {BAND_JUDGMENTS[band].new_money.title}</span>
          {BAND_JUDGMENTS[band].held.title !== '继续持有' && <span>已有持仓 · {BAND_JUDGMENTS[band].held.title}</span>}
        </li>)}
      </ol>
      {j.pending && <p className="hero-pending">已有 {j.pending.days}/{j.pending.needed} {j.rule.unit}落在{j.pending.judgment.label}，再持续 {j.pending.needed - j.pending.days} {j.rule.unit}就会改判。</p>}
      <p className="hero-last">
        <span>上次改判 {date(last.date)}{lastFrom ? `，${lastFrom.label} → ${j.judgment.label}` : ''}（当日第 {last.percentile} 百分位）</span>
        <Link to={`/changes?index=${j.index_code}#rule`}>{j.full_window ? '十年里' : `${date(j.window_start)}以来`}的 {j.changes.length - 1} 次改判 →</Link>
        <Link to={`/changes?index=${j.index_code}#rule-method`}>规则与口径</Link>
      </p>
    </div>
  </section>;
}
