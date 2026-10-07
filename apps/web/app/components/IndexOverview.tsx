import {Link} from 'react-router';
import {VALUATION_INDEXES} from '../../../../packages/backend/valuation-indexes.ts';
import type {Judgment} from './RuleJudgment.tsx';

const GROUPS: {label: string; markets: string[]}[] = [{label: 'A股', markets: ['cn']}, {label: '美股 · 港股', markets: ['us', 'hk']}];

/** Every covered index on one screen: where each sits in its own history and what the rule says for new money. */
export function IndexOverview({indexes, selected}: {indexes: Judgment[]; selected: string}) {
  return <section className="index-overview reveal" style={{'--i': 4} as React.CSSProperties} aria-labelledby="index-overview-title">
    <div className="index-overview-head">
      <h2 id="index-overview-title">全部指数</h2>
      <p>每个指数和自己近十年的估值比；点开看详情。</p>
    </div>
    {GROUPS.map(group => {
      const items = indexes.filter(j => group.markets.includes(VALUATION_INDEXES[j.index_code].market));
      return items.length > 0 && <div key={group.label} className="index-overview-group">
        <h3>{group.label}</h3>
        <ul>{items.map(j => <li key={j.index_code} className={`tone-${j.band}${j.index_code === selected ? ' is-selected' : ''}`}>
          <Link to={`/?index=${j.index_code}`} onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} aria-current={j.index_code === selected ? 'true' : undefined}>
            <span className="index-overview-name">{j.index_name}<small>{j.rule.source === 'csi' ? '中证' : '蛋卷'} · {j.as_of.slice(5).replace('-', '.')}</small></span>
            <span className="index-overview-track" role="img" aria-label={`第${j.percentile}百分位`}>
              <i className="band-low" style={{width: `${j.rule.low}%`}}/><i className="band-mid" style={{width: `${j.rule.high - j.rule.low}%`}}/><i className="band-high" style={{width: `${j.rule.extreme - j.rule.high}%`}}/><i className="band-extreme" style={{width: `${100 - j.rule.extreme}%`}}/>
              <b style={{left: `${j.percentile}%`}}/>
            </span>
            <span className="index-overview-pct">{j.percentile.toFixed(1)}</span>
            <span className="index-overview-band">{j.judgment.label}</span>
            <span className="index-overview-action">{j.judgment.new_money.title}</span>
          </Link>
        </li>)}</ul>
      </div>;
    })}
  </section>;
}
