import {useLoaderData} from 'react-router';
import {readChannelJudgment} from '../lib/rule-card.server.ts';
import {changeDescription} from '../lib/rule-card.ts';
import {number} from '../lib/format.ts';
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
      <header className="embed-heading"><strong>经纬规则卡</strong><span>数据日 {card.as_of}</span></header>
      <div className="embed-current"><div><h1>{card.index.name}</h1><span>{card.index.code}</span></div><strong>{card.label}</strong></div>
      <p className="embed-metric">滚动市盈率 <b>{number(card.pe_ttm)} 倍</b> · 近十年第 <b>{number(card.percentile)} 百分位</b></p>
      <dl className="embed-actions"><div><dt>新增资金</dt><dd>{card.new_money.title}</dd></div><div><dt>已有持仓</dt><dd>{card.held.title}</dd></div></dl>
      <section className="embed-boundaries"><h2>什么时候改判</h2><dl>
        <div><dt>偏低区 · 分位 &lt; {b.low_percentile}</dt><dd>约 {number(b.low)} 倍以下</dd></div>
        <div><dt>偏高区 · 分位 ≥ {b.high_percentile}</dt><dd>约 {number(b.high)} 倍起</dd></div>
        <div><dt>高位区 · 分位 ≥ {b.extreme_percentile}</dt><dd>约 {number(b.extreme)} 倍起</dd></div>
      </dl><p>连续 {b.confirm_days} 个数据日处在同一新区间才改判。PE 边界随滚动窗口变化，以实际分位为准。</p>
        {card.pending && <p className="embed-pending">{card.pending.label}正在确认：{card.pending.days}/{card.pending.needed} 个数据日，当前判断尚未改变。</p>}
      </section>
      <section className="embed-last"><h2>上次改判</h2><p>{changeDescription(card.last_change)}</p></section>
      <p className="embed-source">来源：{card.source.name} · 数据截至 {card.as_of}</p>
    </article>
  </main>;
}

export function ErrorBoundary() {
  return <main id="main" className="embed-page"><article className="embed-rule-card"><strong>经纬规则卡</strong><p>该指数的规则判断暂不可用。</p></article></main>;
}
