import {Link,useLoaderData,useRouteError,isRouteErrorResponse} from 'react-router';
import {readChannelJudgment} from '../lib/rule-card.server.ts';
import {changeDescription} from '../lib/rule-card.ts';
import {number} from '../lib/format.ts';
import {DataDateNotice} from '../components/DataDateNotice.tsx';
import '../embed-rule-card.css';

export async function loader({request}: {request: Request}) {
  return (await readChannelJudgment(request)).card;
}
export function meta() { return [{title: '经纬规则卡'}]; }

export default function EmbedRuleCard() {
  const card = useLoaderData<typeof loader>();
  const b = card.boundaries;
  return <main id="main" className="embed-page">
    <article className="embed-rule-card" aria-label="经纬规则卡">
      <header className="embed-heading"><strong>经纬规则卡</strong><span>数据截至 {card.as_of}</span></header>
      <DataDateNotice asOf={card.as_of}/>
      <div className="embed-current"><div><h1>{card.index.name}</h1><span>{card.index.code}</span></div><strong className={`tone-${card.band}`}>{card.label}</strong></div>
      <p className="embed-metric">滚动市盈率 <b>{number(card.pe_ttm)} 倍</b> · {card.window_label}第 <b>{number(card.percentile)} 百分位</b></p>
      <dl className="embed-actions"><div><dt>新增资金</dt><dd>{card.new_money.title}</dd></div><div><dt>已有持仓</dt><dd>{card.held.title}</dd></div></dl>
      <section className="embed-boundaries"><h2>什么时候改判</h2><dl>
        <div><dt>偏低区 · 分位 &lt; {b.low_percentile}</dt><dd>约 {number(b.low)} 倍以下</dd></div>
        <div><dt>偏高区 · 分位 ≥ {b.high_percentile}</dt><dd>约 {number(b.high)} 倍起</dd></div>
        <div><dt>高位区 · 分位 ≥ {b.extreme_percentile}</dt><dd>约 {number(b.extreme)} 倍起</dd></div>
      </dl><p>连续 {b.confirm_days} {b.unit}处在同一新区间才改判（已含 {b.buffer} 个百分点缓冲）。区间对应的市盈率倍数会随时间小幅变化，以当天的分位为准。</p>
        {card.pending && <p className="embed-pending">{card.pending.label}正在确认：{card.pending.days}/{card.pending.needed} {b.unit}，当前判断尚未改变。</p>}
      </section>
      <section className="embed-last"><h2>上次改判</h2><p>{changeDescription(card.last_change)}</p></section>
      <p className="embed-source">来源：{card.source.name} · 数据截至 {card.as_of}</p>
    </article>
  </main>;
}

export function ErrorBoundary() {
  const error = useRouteError(), unsupported = isRouteErrorResponse(error) && error.status === 404 && error.data === '该指数尚未提供规则卡';
  return <main id="main" className="embed-page"><article className="embed-rule-card"><h1>经纬规则卡</h1><p>{unsupported ? '该指数尚未提供规则卡。' : '未能取得估值判断，连接或资料服务可能暂时不可用。请稍后重新载入。'}</p>{unsupported ? <Link className="embed-retry" to="/embed/rule-card">查看沪深300规则卡 →</Link> : <a className="embed-retry" href="">重新载入 →</a>}<p><Link className="embed-retry" to="/bank" target="_top">返回机构服务 →</Link></p></article></main>;
}
