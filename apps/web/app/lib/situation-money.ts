import type {ReaderSituation} from '../../../../packages/contracts/reader-situation.ts';
import type {RuleJudgmentResult} from '../../../../packages/backend/valuation-rule.ts';

const money=(n:number)=>n.toLocaleString('zh-CN',{maximumFractionDigits:2});
// Monthly investing is only paused in the extreme band; the high band rules out lump sums, not a running plan.
const MONTHLY:Record<string,string>={low:'照常',mid:'照常',high:'照常，不加大',extreme:'暂停'};

export function situationMoney(s:ReaderSituation,j:RuleJudgmentResult):string|null{
 if(!j||s.holding==='other'||s.holding_period==='under7'||s.holding_period==='month')return null;
 const parts:string[]=[];
 const nm=j.judgment.new_money;
 if(s.monthly_amount&&s.monthly_amount>0)parts.push(`每月 ${money(s.monthly_amount)} 元定投：${MONTHLY[j.band]}`);
 if(s.idle_amount&&s.idle_amount>0)parts.push(`另外 ${money(s.idle_amount)} 元：${j.judgment.label}${j.band==='mid'?'不一次性投入':nm.title}`);
 if(!parts.length)return null;
 return `${s.long_plan==='yes'?'':'若已确定长期配置计划，'}${parts.join('；')}。`;
}
