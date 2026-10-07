import {Link} from 'react-router';
import type {Checkup, Exposure, Holdings} from '../../../../packages/contracts/holdings.ts';
import {number} from '../lib/format.ts';
import {VALUATION_INDEXES} from '../../../../packages/backend/valuation-indexes.ts';
const INDEX_NAMES: Record<string, string> = Object.fromEntries(Object.entries(VALUATION_INDEXES).map(([code, index]) => [code, index.name]));
const EXPOSURE_LABELS: Record<Exposure, string> = {a_broad: 'A股宽基', a_other_index: 'A股其他指数', a_active: 'A股主动', us_equity: '美股', hk_equity: '港股', overseas_other: '其他境外', bond: '债券', money: '货币', other: '其他'};

export function SavedHoldings({holdings}: {holdings: Holdings}) {
  return <details className="holdings-saved-list"><summary>已保存 {holdings.rows.length} 只持仓</summary>
    <ul>{holdings.rows.map(row => <li key={row.id}><span>{row.input_name}<small>{row.fund ? `${row.fund.code} · ${row.fund.type}` : '未匹配'}</small></span><strong>{number(row.amount)} 元</strong></li>)}</ul>
  </details>;
}

/** Share of the total the rule can judge, as a ring. */
function CoverageRing({share}: {share: number}) {
  const r = 52, c = 2 * Math.PI * r;
  return <svg className="holdings-ring" viewBox="0 0 120 120" role="img" aria-label={`规则覆盖 ${number(share * 100)}%`}>
    <circle cx="60" cy="60" r={r} className="holdings-ring-track"/>
    <circle cx="60" cy="60" r={r} className="holdings-ring-fill" strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 60 60)"/>
    <text x="60" y="58" textAnchor="middle" className="holdings-ring-value">{number(share * 100)}%</text>
    <text x="60" y="78" textAnchor="middle" className="holdings-ring-label">规则覆盖</text>
  </svg>;
}

export function HoldingsCheckup({holdings, checkup}: {holdings: Holdings; checkup: Checkup}) {
  const parts = checkup.by_exposure.filter(part => part.amount > 0);
  const covered = new Map(checkup.covered.map(item => [item.row_id, item]));
  const coveredShare = checkup.total === 0 ? 0 : 1 - checkup.uncovered_share;
  const rows = [...holdings.rows].sort((a, b) => b.amount - a.amount);
  // What the rule says across the covered money: amounts per band, with that band's new-money action.
  const amountOf = new Map(holdings.rows.map(row => [row.id, row.amount]));
  const byBand = (['low', 'mid', 'high', 'extreme'] as const).map(band => {
    const items = checkup.covered.filter(item => item.band === band);
    const amount = items.reduce((sum, item) => sum + (amountOf.get(item.row_id) ?? 0), 0);
    return {band, label: items[0]?.band_label ?? '', title: items[0]?.new_money_title ?? '', amount, share: checkup.total ? amount / checkup.total : 0};
  }).filter(part => part.amount > 0);
  return <div className="holdings-report">
    <section className="holdings-panel holdings-allocation reveal" style={{'--i': 0} as React.CSSProperties} aria-labelledby="allocation-title">
      <h2 id="allocation-title">钱投向了哪里</h2>
      <p className="holdings-total"><strong>{number(checkup.total)}</strong><span>元 · {holdings.rows.length} 只</span></p>
      {parts.length > 0 && <div className="holdings-stack" role="img" aria-label={parts.map(part => `${part.label} ${number(part.share * 100)}%`).join('，')}>
        {parts.map(part => <span key={part.exposure} className={`exposure-${part.exposure}`} style={{flexGrow: part.share}}/>)}
      </div>}
      <ul className="holdings-legend">{parts.map(part => <li key={part.exposure}>
        <i className={`exposure-${part.exposure}`} aria-hidden="true"/><span>{part.label}</span><small>{number(part.amount)} 元</small><strong>{number(part.share * 100)}%</strong>
      </li>)}</ul>
      {checkup.total === 0 && <p className="holdings-muted">所有金额都是 0 元，暂时没有可计算的配置占比。</p>}
    </section>

    <div className="holdings-side">
      <section className="holdings-panel holdings-coverage reveal" style={{'--i': 1} as React.CSSProperties} aria-labelledby="coverage-title">
        <h2 id="coverage-title" className="sr-only">规则覆盖</h2>
        <CoverageRing share={coveredShare}/>
        <p>{checkup.total === 0 ? '总额为 0 元，覆盖占比暂无法计算。' : checkup.covered.length === 0
          ? '这些持仓都不跟踪规则覆盖的指数，估值规则暂时给不出判断。下面仍可看清钱的去向与重复。'
          : `${number(coveredShare * 100)}% 的持仓有规则判断；其余 ${number(checkup.uncovered_share * 100)}% 暂不覆盖，不给判断。`}</p>
        {byBand.length > 0 && <ul className="holdings-bands" aria-label="已覆盖持仓按规则区间">
          {byBand.map(part => <li key={part.band} className={`tone-${part.band}`}>
            <span className="holdings-band">{part.label}</span><span>{part.title}</span><strong>{number(part.amount)} 元</strong><small>{number(part.share * 100)}%</small>
          </li>)}
        </ul>}
      </section>
      {checkup.duplicates.length > 0 && <section className="holdings-panel holdings-duplicates reveal" style={{'--i': 2} as React.CSSProperties} aria-labelledby="duplicates-title">
        <h2 id="duplicates-title">留意重复的方向</h2>
        <ul>{checkup.duplicates.map(duplicate => <li key={duplicate.tracked_index}>
          <p><strong>{duplicate.row_ids.length} 只基金都跟踪{INDEX_NAMES[duplicate.tracked_index] ?? duplicate.tracked_index}</strong>，合计 {number(duplicate.amount)} 元。同时持有不增加分散。</p>
          <small>{duplicate.row_ids.map(id => holdings.rows.find(row => row.id === id)?.input_name).filter(Boolean).join('、')}</small>
        </li>)}</ul>
      </section>}
    </div>

    <section className="holdings-panel holdings-list reveal" style={{'--i': 3} as React.CSSProperties} aria-labelledby="list-title">
      <h2 id="list-title">逐只看</h2>
      <ul>{rows.map(row => {
        const item = covered.get(row.id);
        return <li key={row.id} className={item ? `tone-${item.band}` : 'is-uncovered'}>
          <div className="holdings-list-name"><strong>{row.input_name}</strong><small>{row.fund ? `${row.fund.code} · ${row.fund.type}` : '未匹配公开基金列表'}{row.tracked_index ? ` · 跟踪${INDEX_NAMES[row.tracked_index] ?? row.tracked_index}` : ''}</small></div>
          <span className={`holdings-exposure exposure-${row.exposure}`}>{EXPOSURE_LABELS[row.exposure]}</span>
          <span className="holdings-list-amount">{number(row.amount)} 元</span>
          {item
            ? <Link className="holdings-verdict" to={`/?index=${item.index}#hero-title`}><span className="holdings-band">{item.band_label}</span><span>已有持仓 · <b>{item.held_title}</b></span></Link>
            : <span className="holdings-verdict is-muted">规则暂不覆盖</span>}
        </li>;
      })}</ul>
      {checkup.notes.length > 0 && <ul className="holdings-notes">{checkup.notes.slice(0, 3).map(note => <li key={note}>{note}</li>)}</ul>}
    </section>
  </div>;
}
