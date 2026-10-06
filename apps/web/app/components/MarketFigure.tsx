import type {MarketCheck} from '../../../../packages/backend/market-availability.ts';
import {number} from '../lib/format.ts';
import {MarketCheckNote} from './MarketCheckNote.tsx';
import type {MarketEvidence} from '../../../../packages/contracts/types.ts';
export function MarketFigure({market:m,check}:{market:MarketEvidence;check?:MarketCheck|null}){
 const points=m.daily;if(!points.length)return null;
 const values=points.map(p=>p.close),lo=Math.min(...values),hi=Math.max(...values),range=hi-lo||1;
 const path=points.map((p,i)=>`${i?'L':'M'}${48+i/(points.length-1||1)*356},${30+(hi-p.close)/range*115}`).join(' ');
 const first=points[0],last=points.at(-1)!;
 return <figure className="market-figure"><figcaption><strong>{m.pe_ttm<m.previous_year_end.pe_ttm&&m.pb<m.previous_year_end.pb&&last.close<first.close?'回落的价格，下降的估值倍数':'价格走势，与去年底估值对照'}</strong><span>沪深300 · 中证官方资料截至 {m.as_of}</span></figcaption><svg viewBox="0 0 430 190" role="img" aria-label={`最近${points.length}个实际交易日收盘，从${number(first.close)}到${number(last.close)}点。纵轴从${lo.toFixed(0)}点起，非零起点。`}><line x1="48" y1="30" x2="404" y2="30"/><line x1="48" y1="145" x2="404" y2="145"/><text x="1" y="34">{hi.toFixed(0)}</text><text x="1" y="149">{lo.toFixed(0)}</text><path d={path}/><circle cx="404" cy={30+(hi-last.close)/range*115} r="3"/><text x="48" y="171">{first.date.slice(5)}</text><text x="367" y="171">{last.date.slice(5)}</text></svg><div className="market-valuation"><span>滚动市盈率（PE）<b>{number(m.pe_ttm)}</b><small>去年底 {number(m.previous_year_end.pe_ttm)}</small></span><span>市净率（PB）<b>{number(m.pb)}</b><small>去年底 {number(m.previous_year_end.pb)}</small></span></div><p className="market-meaning">PE比较价格与盈利，PB比较价格与净资产。两者是估值倍数，不是收益率。</p><p>最近{points.length}个交易日的价格指数收盘，不含股息。{m.pe_ttm<m.previous_year_end.pe_ttm&&m.pb<m.previous_year_end.pb?'倍数低于去年底，尚不能称历史低估':'两个时点的倍数对照，不能替代历史分位'}。</p><MarketCheckNote check={check}/></figure>;
}
