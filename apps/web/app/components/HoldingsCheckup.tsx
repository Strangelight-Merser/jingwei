import {Link} from 'react-router';
import type {Checkup, Holdings} from '../../../../packages/contracts/holdings.ts';
import {number} from '../lib/format.ts';
const INDEX_NAMES: Record<string, string> = {'000300': '沪深300', '000905': '中证500', '000016': '上证50'};

export function SavedHoldings({holdings}: {holdings: Holdings}) {
  return <details className="holdings-saved-list"><summary>已保存 {holdings.rows.length} 只持仓</summary>
    <ul>{holdings.rows.map(row => <li key={row.id}><span>{row.input_name}<small>{row.fund ? `${row.fund.code} · ${row.fund.type}` : '未匹配'}</small></span><strong>{number(row.amount)} 元</strong></li>)}</ul>
  </details>;
}

export function HoldingsCheckup({holdings, checkup}: {holdings: Holdings; checkup: Checkup}) {
  const parts = checkup.by_exposure.filter(part => part.amount > 0);
  return <div className="holdings-report">
    <section className="holdings-card holdings-allocation" aria-labelledby="allocation-title">
      <h2 id="allocation-title">钱投向了哪里</h2>
      <div className="holdings-total"><small>持仓总额</small><p><strong>{number(checkup.total)}</strong><span>元</span></p></div>
      {parts.length > 0 && <div className="holdings-stack" role="img" aria-label={parts.map(part => `${part.label} ${number(part.share * 100)}%`).join('，')}>
        {parts.map(part => <span key={part.exposure} className={`exposure-${part.exposure}`} style={{width: `${part.share * 100}%`}}/>) }
      </div>}
      <ul className="holdings-legend">{parts.map(part => <li key={part.exposure}>
        <i className={`exposure-${part.exposure}`} aria-hidden="true"/><span>{part.label}</span><strong>{number(part.share * 100)}%</strong><small>{number(part.amount)} 元</small>
      </li>)}</ul>
      {checkup.total === 0 && <p className="holdings-muted">所有金额都是 0 元，暂时没有可计算的配置占比。</p>}
    </section>

    {checkup.duplicates.length > 0 && <section className="holdings-card" aria-labelledby="duplicates-title"><h2 id="duplicates-title">留意重复的方向</h2>
      <ul className="holdings-duplicates">{checkup.duplicates.map(duplicate => <li key={duplicate.tracked_index}>
        <p><strong>{duplicate.row_ids.length} 只基金跟踪{INDEX_NAMES[duplicate.tracked_index] ?? duplicate.tracked_index}</strong>，同时持有不增加分散。</p>
        <small>{duplicate.row_ids.map(id => holdings.rows.find(row => row.id === id)?.input_name).filter(Boolean).join('、')}</small>
      </li>)}</ul>
    </section>}

    <section className="holdings-card" aria-labelledby="covered-title"><h2 id="covered-title">规则能说到哪些持仓</h2>
      <p className="holdings-uncovered">{checkup.total === 0 ? '总额为 0 元，规则覆盖占比暂无法计算。' : `你的持仓中有 ${number(checkup.uncovered_share * 100)}% 不在当前估值规则的覆盖范围内，这部分暂不给出持仓判断。`}</p>
      <ul className="holdings-covered">{checkup.covered.map(item => {
        const row = holdings.rows.find(row => row.id === item.row_id);
        return <li key={item.row_id}>
          <div><h3>{row?.input_name}</h3><p>{item.index_name}{row && ` · ${number(row.amount)} 元`}</p></div>
          <span className={`holdings-band tone-${item.band}`}>{item.band_label}</span>
          <div className="holdings-held"><small>已有持仓</small><strong>{item.held_title}</strong></div>
          <Link to={`/?index=${item.index}#hero-title`}>查看规则 →</Link>
        </li>;
      })}</ul>
      {checkup.notes.length > 0 && <ul className="holdings-notes">{checkup.notes.slice(0, 3).map(note => <li key={note}>{note}</li>)}</ul>}
    </section>
    <SavedHoldings holdings={holdings}/>
  </div>;
}
