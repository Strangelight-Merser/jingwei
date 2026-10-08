import {BAND_JUDGMENTS,type RuleJudgmentResult,type ValuationBand} from '../../../../packages/backend/valuation-rule.ts';

export type VisitJudgment=Pick<NonNullable<RuleJudgmentResult>,'as_of'|'rows'|'band'|'pending'|'rule'|'last_change'>;
export type JudgmentVisit={as_of:string;rows:number;band:ValuationBand;pending:{band:ValuationBand;days:number;needed:number}|null};

export function judgmentVisit(j:VisitJudgment):JudgmentVisit{
 return {as_of:j.as_of,rows:j.rows,band:j.band,pending:j.pending?{band:j.pending.band,days:j.pending.days,needed:j.pending.needed}:null};
}

export function readJudgmentVisit(key:string):JudgmentVisit|null{
 const value:unknown=JSON.parse(localStorage.getItem(key)??'null');
 if(!value||typeof value!=='object')return null;
 const v=value as JudgmentVisit;
 const band=(b:unknown)=>typeof b==='string'&&Object.hasOwn(BAND_JUDGMENTS,b);
 if(typeof v.as_of!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.as_of)||!Number.isSafeInteger(v.rows)||v.rows<0||!band(v.band))return null;
 if(v.pending!==null&&(!v.pending||!band(v.pending.band)||!Number.isSafeInteger(v.pending.days)||!Number.isSafeInteger(v.pending.needed)||v.pending.days<1||v.pending.days>=v.pending.needed))return null;
 return v;
}

export function sinceLastVisit(previous:JudgmentVisit|null,current:JudgmentVisit):{text:string;changed:boolean}|null{
 if(!previous)return null;
 const changed=previous.band!==current.band;
 const action=changed?`已由${BAND_JUDGMENTS[previous.band].label}改为${BAND_JUDGMENTS[current.band].label}`:'判断未变';
 const progress=current.pending?`；已有 ${current.pending.days}/${current.pending.needed} 日落在${BAND_JUDGMENTS[current.pending.band].label}`:'';
 return {text:`自上次（${previous.as_of.replaceAll('-','.')}）以来：新增 ${Math.max(0,current.rows-previous.rows)} 个交易日的数据，${action}${progress}。`,changed};
}

export function notifyJudgmentChange(j:VisitJudgment,text:string){
 if(!window.matchMedia('(min-width: 681px)').matches||!('Notification' in window)||Notification.permission!=='granted')return;
 const key=`jingwei.reader.judgment-notified.${j.rule.id}`;
 const change=`${j.last_change.date}:${j.band}`;
 if(localStorage.getItem(key)===change)return;
 new Notification('经纬 · 判断已改变',{body:text,tag:j.rule.id});
 localStorage.setItem(key,change);
}
