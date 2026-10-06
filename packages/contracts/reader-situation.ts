export const PLAN_OPTIONS=[['yes','有长期计划'],['no','没有长期计划'],['unknown','还没确定']] as const;
export const HOLDING_OPTIONS=[['007339','易方达沪深300联接C · 007339'],['005658','华夏沪深300联接C · 005658'],['both','这两只都持有'],['none','目前没有持有'],['other','持有其他基金'],['unknown','暂不填写']] as const;
export const PERIOD_OPTIONS=[['under7','不足7天'],['month','约1个月'],['year','约1年'],['long','3年或更久'],['unknown','还没确定']] as const;
export type ReaderSituation={long_plan:typeof PLAN_OPTIONS[number][0];holding:typeof HOLDING_OPTIONS[number][0];holding_period:typeof PERIOD_OPTIONS[number][0];monthly_amount?:number;idle_amount?:number};
export function validReaderSituation(value:unknown):value is ReaderSituation{
 if(!value||typeof value!=='object')return false;
 const v=value as ReaderSituation;
 const validAmount=(amount:unknown)=>amount===undefined||typeof amount==='number'&&Number.isFinite(amount)&&amount>=0&&amount<=Number.MAX_SAFE_INTEGER;
 return PLAN_OPTIONS.some(([key])=>key===v.long_plan)&&HOLDING_OPTIONS.some(([key])=>key===v.holding)&&PERIOD_OPTIONS.some(([key])=>key===v.holding_period)&&validAmount(v.monthly_amount)&&validAmount(v.idle_amount)&&Object.keys(v).every(key=>['long_plan','holding','holding_period','monthly_amount','idle_amount'].includes(key));
}
export const EMPTY_SITUATION:ReaderSituation={long_plan:'unknown',holding:'unknown',holding_period:'unknown'};
