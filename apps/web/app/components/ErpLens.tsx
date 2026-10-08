import {useMemo} from 'react';
import {bundledErp, type ErpPublication} from '../../../../packages/backend/erp.ts';
import type {ReturnIndexCode} from '../../../../packages/backend/valuation-indexes.ts';
import type {OutcomeStats} from '../../../../packages/backend/rule-outcomes.ts';
import './erp.css';

const percent = (value: number | null, places = 1) => value === null ? '无样本' : `${value < 0 ? '−' : ''}${Math.abs(value).toFixed(places)}%`;
const count = (value: number) => value.toLocaleString('zh-CN');

function ErpChart({data}: {data: ErpPublication}) {
  const points = data.chart;
  const min = Math.floor(Math.min(...points.map(p => p.erp_pct)));
  const max = Math.ceil(Math.max(...points.map(p => p.erp_pct)));
  const first = Date.parse(points[0].date), last = Date.parse(points.at(-1)!.date);
  const x = (date: string) => (Date.parse(date) - first) / (last - first) * 100;
  const y = (value: number) => 94 - (value - min) / (max - min) * 88;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(2)},${y(p.erp_pct).toFixed(2)}`).join('');
  return <figure className="erp-chart">
    <div className="erp-chart-area" role="img" aria-label={`${data.index_name} ERP 走势，${points[0].date} 至 ${data.as_of}，最新 ${percent(data.current.erp_pct, 2)}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {[min, (max + min) / 2, max].map(value => <line key={value} x1="0" x2="100" y1={y(value)} y2={y(value)} className="erp-chart-guide"/>)}
        <path d={path} className="erp-chart-line"/>
      </svg>
      {[min, (max + min) / 2, max].map(value => <span key={value} className="erp-chart-tick" style={{top: `${y(value)}%`}}>{value.toFixed(1)}%</span>)}
      <i className="erp-chart-current" style={{top: `${y(data.current.erp_pct)}%`}} aria-hidden="true"/>
    </div>
    <figcaption><span>{points[0].date.slice(0, 4)}</span><span>ERP · 盈利收益率减国债收益率</span><span>{data.as_of.slice(0, 4)}</span></figcaption>
  </figure>;
}

function ReturnCell({stats, title}: {stats: OutcomeStats; title: string}) {
  return <div className="erp-return"><span>{title}</span><strong>{percent(stats.mean)}</strong><small>{count(stats.sample_days)} 个交易日</small></div>;
}

/** Offline official snapshot: no client network dependency and no change to the judgment rule. */
export function ErpLens({index}: {index: ReturnIndexCode}) {
  const data = useMemo(() => bundledErp(index), [index]);
  const now = data.current;
  const low = data.consistency.by_pe_band[0];
  return <section className={`erp-lens tone-${now.erp_group}`} id="erp-lens" aria-labelledby={`erp-title-${index}`}>
    <div className="erp-heading"><p>{data.index_name} · 数据截至 {data.as_of}</p><span className="erp-tag">第二视角</span></div>
    <h2 id={`erp-title-${index}`}>换个角度：股债性价比</h2>
    <p className="erp-conclusion">ERP <strong>{percent(now.erp_pct, 2)}</strong>，{now.full_window ? '近十年' : '已有历史'}第 <strong>{now.percentile}</strong> 百分位，与 PE 规则<strong>{now.consistent ? '一致' : '不一致'}</strong>。</p>
    <p className="erp-comparison">PE：{now.pe_label} <span aria-hidden="true">·</span> ERP：{now.erp_label}</p>
    <p className="erp-why">{now.consistent
      ? <>两个角度给出同样的方向：股票相对自己的十年历史、相对国债，位置一致。</>
      : <>两个角度回答的问题不同：PE 分位看股票相对自己的十年历史贵不贵；ERP 看股票相对国债划不划算——盈利收益率 {percent(100 / now.pe_ttm, 2)} 减去十年期国债 {percent(now.bond_yield_pct, 2)}。国债收益率越低，股票相对债券就显得越便宜。经纬的动作仍按公开的 PE 规则，ERP 作为对照。</>}</p>
    <ErpChart data={data}/>
    <dl className="erp-consistency">
      <div><dt>PE 偏低区时，ERP 也在高位</dt><dd>{percent(low.matching_pct)}</dd><small>{count(low.matching_days)} / {count(low.days)} 天</small></div>
      <div><dt>四个区间的全部对照一致率</dt><dd>{percent(data.consistency.matching_pct)}</dd><small>{count(data.consistency.matching_days)} / {count(data.consistency.compared_days)} 天</small></div>
    </dl>
    <div className="erp-outcomes">
      <h3>ERP 分组之后的含分红收益</h3>
      <p>{data.outcome_conclusion}</p>
      {data.outcomes.map(row => <div key={row.band} className={`erp-outcome-row tone-${row.band}`}>
        <div className="erp-group"><strong>{row.label}</strong><small>分位 {row.range}</small></div>
        <ReturnCell stats={row.one_year} title="1 年均值"/>
        <ReturnCell stats={row.three_year} title="3 年年化均值"/>
      </div>)}
    </div>
    <details className="erp-method"><summary>查看完整统计与来源</summary>
      <p>{data.method}</p>
      <p>{data.consistency.first} 至 {data.consistency.last}，共 {count(data.consistency.compared_days)} 个对照日。PE 历史中 {count(data.pe_days_without_bond)} 天没有同日国债值，不纳入 ERP。</p>
      <table><caption>按当天已确认 PE 区间对照</caption><thead><tr><th scope="col">PE 区间</th><th scope="col">一致日 / 对照日</th><th scope="col">一致率</th></tr></thead><tbody>{data.consistency.by_pe_band.map(row => <tr key={row.band}><th scope="row">{row.label}</th><td>{count(row.matching_days)} / {count(row.days)}</td><td>{percent(row.matching_pct)}</td></tr>)}</tbody></table>
      <p>{data.outcome_method}</p>
      {(['one_year', 'three_year'] as const).map(key => <table key={key}><caption>{key === 'one_year' ? '1 年' : '3 年年化'}全收益分布</caption><thead><tr><th scope="col">ERP 分组</th><th scope="col">均值</th><th scope="col">中位数</th><th scope="col">为正比例</th><th scope="col">天数</th></tr></thead><tbody>{data.outcomes.map(row => <tr key={row.band}><th scope="row">{row.label}</th><td>{percent(row[key].mean)}</td><td>{percent(row[key].median)}</td><td>{percent(row[key].positive_pct)}</td><td>{count(row[key].sample_days)}</td></tr>)}</tbody></table>)}
      <p>国债：<a href={data.bond_source.page_url} target="_blank" rel="noreferrer">{data.bond_source.name} ↗</a>，{data.bond_source.first} 至 {data.bond_source.last}，{count(data.bond_source.rows)} 条，取数日 {data.bond_source.fetched_at.slice(0, 10)}。{data.bond_source.precision}。</p>
      <p><a href={`https://www.csindex.com.cn/#/indices/family/detail?indexCode=${index}`} target="_blank" rel="noreferrer">中证官方滚动市盈率 ↗</a> · <a href={`https://www.csindex.com.cn/#/indices/family/detail?indexCode=${data.total_return_code}`} target="_blank" rel="noreferrer">中证官方全收益指数 ↗</a> · 全收益截至 {data.returns_as_of}。</p>
    </details>
    <p className="erp-note">ERP = 1 / PE − 10 年期国债到期收益率；只作对照，行动仍按 PE 规则。历史收益不保证未来。</p>
  </section>;
}
