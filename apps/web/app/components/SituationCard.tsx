import{Link}from'react-router';import{useReaderSituation}from'../lib/reader-situation.ts';
import{PLAN_OPTIONS,HOLDING_OPTIONS,PERIOD_OPTIONS,type ReaderSituation}from'../../../../packages/contracts/reader-situation.ts';
import type{FinanceVersion}from'../../../../packages/contracts/types.ts';
import type{Judgment}from'./RuleJudgment.tsx';

/** What the public rule means for this reader's stated situation; it never invents holdings or amounts. */
function readingFor(s:ReaderSituation,j:Judgment|null):{title:string;body:string;rule?:string}{
 const held=['007339','005658','both'].includes(s.holding);
 if(s.holding==='other')return{title:'这项持仓暂不在支持范围',body:'目前只研究沪深300与007339、005658两只联接C类，不对其他基金作持仓判断。上面的判断可作为沪深300方向的参考。'};
 if(s.holding_period==='under7')return{title:'持有不足7天，先看赎回费',body:'两只C类确认持有不足7日，赎回费都是1.50%。估值规则面向长期资金，不适用于几天内的买卖。'};
 if(s.holding_period==='month')return{title:'约1个月的资金，规则不适用',body:'一个月内的价格波动可能远大于估值变化。估值分位适合准备持有一年以上的资金，短期要用的钱不建议放进股票指数基金。'};
 if(!j)return{title:'估值数据暂不可用',body:'官方估值暂未载入，已保存的研究仍可阅读。'};
 const nm=j.judgment.new_money,hd=j.judgment.held;
 if(held){
  const both=s.holding==='both'?'两只跟踪同一指数，同时持有不会分散风险。':'';
  return{title:`你的持仓：${hd.title}`,body:`${hd.text}${both}`,rule:`如果还有新钱：${nm.title}。${nm.text}`};
 }
 if(s.long_plan==='yes')return{title:`你的新增资金：${nm.title}`,body:nm.text,rule:'按规则行事的前提是：这笔钱一年以上不用，且你已定好投入沪深300的比例。'};
 return{title:j.judgment.start,body:`规则对已有计划者的判断是「${nm.title}」。${nm.text}`,rule:'你还没有长期计划。先确定这笔钱多久不用、最多能承受多大下跌（2008年沪深300一年内跌幅超过六成），再按规则决定是否开始。'};
}

export function SituationCard({version,judgment=null}:{version:FinanceVersion;judgment?:Judgment|null}){
 const{situation:s,ready,unavailable}=useReaderSituation();
 if(!ready)return <section className="situation-card"><h2>你的情况</h2><p>正在读取本机选择。</p></section>;
 if(!s||unavailable)return <section className="situation-card"><div><small>你的情况</small><h2>想开始配置，还是复核持仓？</h2><p>选一下计划、持仓和期限，上面的判断会换成对你这种情况的说法。</p></div><Link className="text-link" to="/situation">三个选择，设置我的情况 →</Link></section>;
 const r=readingFor(s,judgment);
 return <section className="situation-card"><div><small>我的情况 · {PLAN_OPTIONS.find(([k])=>k===s.long_plan)?.[1]} · {HOLDING_OPTIONS.find(([k])=>k===s.holding)?.[1]} · {PERIOD_OPTIONS.find(([k])=>k===s.holding_period)?.[1]}</small><h2>{r.title}</h2><p>{r.body}</p>{r.rule&&<p className="situation-rule">{r.rule}</p>}</div><div className="situation-links"><Link to="/compare">比较两只C类费用 →</Link><Link to={`/articles/${version.article.slug}`}>本期解读文章 →</Link><Link to="/situation">修改我的情况</Link></div></section>;
}
