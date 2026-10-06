import {useState} from 'react';
import {Link} from 'react-router';
import {estimateFundCosts,FUND_COST_TERMS,type FundCostComparison} from '../../../../packages/backend/fund-cost.ts';

export function meta(){return [{title:'两只C类费用比较 · 经纬'}];}
const money=(n:number)=>n.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});

function ResultTable({result:r}:{result:FundCostComparison}){
 return <table className="cost-table">
  <caption>销售服务费 + 赎回费 · 元</caption>
  <thead><tr><th>费用项目</th>{r.funds.map(f=><th key={f.code}>{f.code==='007339'?'易方达C':'华夏C'}<small>{f.code}</small></th>)}</tr></thead>
  <tbody>{[['销售服务费','service_fee_yuan'],['赎回费','redemption_fee_yuan'],['两项合计','total_fee_yuan']].map(([label,key])=><tr key={key}><th>{label}</th>{r.funds.map(f=><td key={f.code}>{money(f[key as 'service_fee_yuan'])}</td>)}</tr>)}</tbody>
 </table>;
}

export default function Compare(){
 const [amount,setAmount]=useState(''),[days,setDays]=useState(''),[result,setResult]=useState<FundCostComparison|null>(null),[error,setError]=useState('');
 function calculate(event:React.FormEvent){
  event.preventDefault();
  try{const r=estimateFundCosts({amount:Number(amount),holding_days:Number(days)});setResult(r);setError('');}
  catch{setResult(null);setError('请输入大于0的金额，以及大于0的整数持有天数。');}
 }
 return <main id="main" className="reader-page comparison-page">
  <p className="eyebrow">同一指数 · 两只C类</p>
  <h1>这笔钱，两只基金的费用差多少？</h1>
  <p className="reader-intro">易方达007339与华夏005658都跟踪沪深300。填入金额和持有天数，看看销售服务费与赎回费的差别。</p>
  <form onSubmit={calculate} noValidate className="cost-form">
   <label>投入金额（元）<input type="number" inputMode="decimal" name="amount" min="0.01" step="0.01" value={amount} onChange={e=>{setAmount(e.target.value);setResult(null);}} placeholder="如 10000"/></label>
   <label>持有天数（自然日）<input type="number" inputMode="numeric" name="holding_days" min="1" step="1" value={days} onChange={e=>{setDays(e.target.value);setResult(null);}} placeholder="如 7"/></label>
   <button type="submit">算算费用差</button>
  </form>
  {error&&<p className="cost-error" role="alert">{error}</p>}
  {result&&<section className="cost-result" aria-live="polite">
   <h2>{result.difference.total_fee_yuan===0?'按你的金额和天数，两只的这两项费用相同':<>按你的金额和天数，007339 比 005658 少交约 <strong>{money(result.difference.total_fee_yuan)} 元</strong></>}</h2>
   <p>{money(result.amount)} 元 · {result.holding_days} 天</p>
   <ResultTable result={result}/>
  </section>}
  <p className="reader-note">仅按固定费率估算，实际以渠道为准。</p>
  <details className="research-sources cost-method">
   <summary>计算口径与官方来源</summary>
   <h2>怎么算</h2>
   <p>假设这笔钱的持仓价值和赎回金额不变，销售服务费按金额 × 年费率 × 天数 ÷ 365 估算。分项先四舍五入到分，再合计和相减；实际每日计提按当年天数计算。</p>
   <p>天数请以购买渠道确认的持有自然日为准，申请买入与卖出的日期间隔可能不同。两只C类持有不足7日的赎回费均为1.50%，达到7日时，原资料概要列示为0。</p>
   <p>销售服务费已经从基金资产中扣除，不要从净值收益里重复扣一次。管理费、托管费及其他费用未计入。</p>
   <p>渠道优惠、费率调整与持有超过一年后的停止收费安排会影响实际费用；超过365天的结果也只是假设全程费率不变的演算。基金是否适合你，还要结合计划与持仓判断。</p>
   <h2>费率来自哪里</h2>
   {FUND_COST_TERMS.map(f=><div className="cost-terms" key={f.code}>
    <h3>{f.name}<small>{f.code}</small></h3>
    <p>资料列示的销售服务年费率：{(f.annual_service_rate*100).toFixed(2)}%。</p>
    {f.sources.map(s=><p key={s.url+s.pdf_page}><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><small>发布日期 {s.published_at} · 第{s.pdf_page}页</small></p>)}
   </div>)}
  </details>
  <div className="reader-actions"><Link to="/">回到首页判断 →</Link><Link to="/situation">修改我的情况 →</Link></div>
 </main>;
}
