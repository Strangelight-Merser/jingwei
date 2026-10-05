import{Link}from'react-router';import{useReaderSituation}from'../lib/reader-situation.ts';
import{PLAN_OPTIONS,HOLDING_OPTIONS,PERIOD_OPTIONS}from'../../../../packages/contracts/reader-situation.ts';
import type{FinanceVersion}from'../../../../packages/contracts/types.ts';
import{date}from'../lib/format.ts';
export function SituationCard({version}:{version:FinanceVersion}){
 const{situation:s,ready,unavailable}=useReaderSituation();const view=version.article.operation_view;
 if(!ready)return <section className="situation-card"><h2>你的阅读情境</h2><p>正在读取本机选择；公共研究可以继续阅读。</p></section>;
 if(!s||unavailable)return <section className="situation-card"><div><small>你的阅读情境</small><h2>想找基金，还是复核持仓？</h2><p>选一下计划、持仓和期限，让下面的研究对应你的情况。也可以直接读公共研究。</p></div><Link className="text-link" to="/situation">三个选择，设置我的情况 →</Link></section>;
 const held=['007339','005658','both'].includes(s.holding);let title='先把计划和持有期确认下来',body='目前没有足够信息把公共判断直接套到你的情况。可以先比较费用，再阅读判断的依据。';
 if(s.holding==='other'){title='这项持仓暂不在支持范围';body='当前只研究沪深300与007339、005658两只联接C类，不对其他基金作持仓判断。公共研究仍可作为背景阅读。';}
 else if(s.holding_period==='under7'){title='先核对短期赎回成本';body='若确认的收费持有期不足7日，两只C类概要均列示1.50%赎回费。准备持有的天数不等于已确认收费天数，先看费用估算与原文条款。';}
 else if(held&&s.long_plan==='yes'){title='先复核这项持仓的原条件';body='有长期计划不等于原条件仍成立。先核对资金用途、仓位范围、原依据及当前缺口，再决定是否沿用计划。';}
 else if(held){title='先确认这笔持仓的用途和期限';body='尚未确认长期计划，本期“原条件仍成立”的持仓判断不能直接套用。先核对原条件，再比较这只基金的费用与赎回限制。';}
 else if(s.holding==='none'){title=s.long_plan==='yes'?'先核对新增资金的依据':'先比较工具，再决定是否配置';body='两只基金承接同一指数，费用差不能证明应该买入。首次配置的方向、仓位与资金用途仍需确认；本产品尚不能替你完成配置决策。';}
 return <section className="situation-card"><div><small>我的情况 · {PLAN_OPTIONS.find(([k])=>k===s.long_plan)?.[1]} · {HOLDING_OPTIONS.find(([k])=>k===s.holding)?.[1]} · {PERIOD_OPTIONS.find(([k])=>k===s.holding_period)?.[1]}</small><h2>{title}</h2><p>{body}</p>{view&&s.holding!=='other'&&<p className="reader-note">对应本期{version.origin==='editor'?'历史人工研究':'研究'}（{date(view.reviewed_on)}）的{held?'已有持仓':'新增资金'}段落，尚未按你的情况形成新判断。</p>}</div><div className="situation-links"><Link to={`/articles/${version.article.slug}#judgment-change-conditions`}>核对适用条件 →</Link><Link to="/compare">比较两只C类费用 →</Link><Link to="/situation">修改我的情况</Link></div></section>;
}
