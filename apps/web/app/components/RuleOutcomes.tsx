import type {RuleOutcomesPublication} from '../../../../packages/backend/rule-outcomes-publication.ts';
import type {OutcomeIndex} from '../../../../packages/backend/total-return-source.ts';
import type {OutcomeStats} from '../../../../packages/backend/rule-outcomes.ts';
import './rule-outcomes.css';

const percent = (value: number | null) => value === null ? '—' : `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(1)}%`;
const number = (value: number) => value.toLocaleString('zh-CN');

function FullStats({stats}: {stats: OutcomeStats}) {
  return <><td>{percent(stats.mean)}</td><td>{percent(stats.median)}</td><td>{percent(stats.positive_pct)}</td><td>{number(stats.sample_days)}</td></>;
}

export function RuleOutcomes({index, outcomes}: {index: OutcomeIndex; outcomes: RuleOutcomesPublication | null}) {
  if (!outcomes || outcomes.index_code !== index || !outcomes.bands.some(row => row.three_year.sample_days)) return null;
  const max = Math.max(1, ...outcomes.bands.map(row => Math.abs(row.three_year.mean ?? 0)));
  return <section className="rule-outcomes" id="rule-outcomes" aria-labelledby={`rule-outcomes-title-${index}`}>
    <p className="outcomes-kicker">{outcomes.index_name} · 含分红的全收益指数 · 数据截至 {outcomes.returns_as_of}</p>
    <h2 id={`rule-outcomes-title-${index}`}>历史上，判断之后发生了什么</h2>
    <p className="outcomes-conclusion">{outcomes.conclusion}</p>
    <div className="outcomes-head" aria-hidden="true"><span>当天已确认区间</span><span>之后 3 年年化均值</span><span>3 年为正比例</span><span>之后 1 年均值</span></div>
    <div className="outcomes-rows">
      {outcomes.bands.map(row => <div key={row.band} className={`outcomes-row${outcomes.current_band === row.band ? ' is-current' : ''}`}>
        <div className="outcomes-band"><strong>{row.label}</strong>{outcomes.current_band === row.band && <small>当前区间</small>}</div>
        <div className="outcomes-return"><span className="outcomes-mobile-label">3 年年化均值</span><div className="outcomes-bar"><i className={row.three_year.mean !== null && row.three_year.mean < 0 ? 'is-negative' : ''} style={{width: `${Math.abs(row.three_year.mean ?? 0) / max * 100}%`}}/><strong>{percent(row.three_year.mean)}</strong></div><small>中位数 {percent(row.three_year.median)} · {number(row.three_year.sample_days)} 天</small></div>
        <div className="outcomes-positive"><span className="outcomes-mobile-label">3 年为正比例</span><strong>{percent(row.three_year.positive_pct)}</strong></div>
        <div className="outcomes-short"><span className="outcomes-mobile-label">1 年均值</span><span>{percent(row.one_year.mean)}</span><small>{number(row.one_year.sample_days)} 天</small></div>
      </div>)}
    </div>
    <details className="outcomes-details"><summary>查看 1 年 / 3 年完整统计与计算口径</summary>
      <p>{outcomes.method}仅纳入有完整未来窗口的日期，统计的是指数收益。</p>
      {([['one_year', '之后 1 年'], ['three_year', '之后 3 年']] as const).map(([key, label]) => <table key={key}><caption>{label} · 年化收益</caption><thead><tr><th scope="col">区间</th><th scope="col">均值</th><th scope="col">中位数</th><th scope="col">为正比例</th><th scope="col">样本天数</th></tr></thead><tbody>{outcomes.bands.map(row => <tr key={row.band}><th scope="row">{row.label}</th><FullStats stats={row[key]}/></tr>)}</tbody></table>)}
      <a href={`https://www.csindex.com.cn/#/indices/family/detail?indexCode=${outcomes.total_return_code}`} target="_blank" rel="noreferrer">中证指数官方全收益数据 ↗</a>
    </details>
    <p className="outcomes-note">约一个完整周期；相邻样本的持有期重叠；历史不保证未来。</p>
  </section>;
}
