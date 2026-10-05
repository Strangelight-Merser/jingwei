import type {FinanceVersion, SourceRef} from '../contracts/types.ts';

export const FUND_TIMELINE_STORY_ID = 'csi300-fund-selection-20261002';
export type TimelineValue = string | number | boolean | null | TimelineValue[] | {[key:string]:TimelineValue};
export type TimelineDifference = {path:string;old_value:TimelineValue;new_value:TimelineValue};
export type TimelineSourceDifference = {
 article_id:string;kind:'added'|'removed'|'modified';old_ref:SourceRef|null;new_ref:SourceRef|null;
 fields:TimelineDifference[];fragments_changed:boolean;
};
export type TimelineAction = {
 old_action:string|null;new_action:string|null;action_changed:boolean;
 old_text:string|null;new_text:string|null;text_changed:boolean;
};
export type FundTimelineEntry = {
 id:string;story_id:string;version:number;previous_version_id:string|null;compared_version_id:string|null;
 comparison_status:'initial'|'compared'|'previous_missing';origin:FinanceVersion['origin'];origin_label:string;
 dates:{as_of:string;reviewed_on:string|null;generated_at:string;published_at:string};
 recorded_changes:FinanceVersion['changes'];
 trigger_evidence:{status:'not_recorded';message:string};
 stored_review:FinanceVersion['review']|null;
 evaluated_conditions:NonNullable<FinanceVersion['research']>['conditions'];
 summary_consistency:{status:'not_assessed'|'incomplete_match';message:string|null};
 actual_summary:string;
 diff:{actions:{held:TimelineAction;new_money:TimelineAction};conditions:TimelineDifference[];
  reasons:TimelineDifference[];funds:TimelineDifference[];body:TimelineDifference[];
  sources:TimelineSourceDifference[];market:TimelineDifference[];research:TimelineDifference[]};
};
export type FundTimeline = {story_id:string;article_slug:string|null;entries:FundTimelineEntry[];latest_summary:string|null};

// JSON projections exclude technical linkage and collection clocks from judgment differences.
function json(value:unknown):TimelineValue {
 if(value===undefined||value===null)return null;
 if(Array.isArray(value))return value.map(json);
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,json(item)]));
 return value as string|number|boolean;
}
function equal(a:unknown,b:unknown):boolean {
 if(a===b)return true;
 if(a===null||b===null||typeof a!==typeof b)return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
 if(typeof a==='object'){
  const aa=a as Record<string,unknown>,bb=b as Record<string,unknown>;
  const keys=Object.keys(aa);
  return keys.length===Object.keys(bb).length&&keys.every(key=>key in bb&&equal(aa[key],bb[key]));
 }
 return false;
}
function differences(oldValue:unknown,newValue:unknown,path:string):TimelineDifference[] {
 const old=json(oldValue),next=json(newValue);
 if(equal(old,next))return [];
 if(old!==null&&next!==null&&typeof old==='object'&&typeof next==='object'){
  if(Array.isArray(old)&&Array.isArray(next)&&old.length===next.length)
   return old.flatMap((value,index)=>differences(value,next[index],`${path}[${index}]`));
  if(!Array.isArray(old)&&!Array.isArray(next))
   return [...new Set([...Object.keys(old),...Object.keys(next)])].sort().flatMap(key=>differences(old[key],next[key],`${path}.${key}`));
 }
 return [{path,old_value:old,new_value:next}];
}
function omit(value:unknown,excluded:string[]):unknown {
 if(Array.isArray(value))return value.map(item=>omit(item,excluded));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!excluded.includes(key)).map(([key,item])=>[key,omit(item,excluded)]));
 return value;
}
function indexed(items:{code:string}[]|undefined){return Object.fromEntries((items??[]).map(item=>[item.code,item]));}
function action(old: {action:string;text:string}|undefined,next:{action:string;text:string}|undefined,comparable:boolean):TimelineAction {
 return {old_action:old?.action??null,new_action:next?.action??null,action_changed:comparable&&old?.action!==next?.action,
  old_text:old?.text??null,new_text:next?.text??null,text_changed:comparable&&old?.text!==next?.text};
}
function sourceDifferences(old:SourceRef[],next:SourceRef[]):TimelineSourceDifference[] {
 const before=new Map(old.map(ref=>[ref.article_id,ref])),after=new Map(next.map(ref=>[ref.article_id,ref]));
 return [...new Set([...before.keys(),...after.keys()])].sort().flatMap(article_id=>{
  const old_ref=before.get(article_id)??null,new_ref=after.get(article_id)??null;
  const fields=differences(old_ref,new_ref,`input_refs.${article_id}`);
  if(!fields.length)return [];
  return [{article_id,kind:old_ref===null?'added' as const:new_ref===null?'removed' as const:'modified' as const,
   old_ref:structuredClone(old_ref),new_ref:structuredClone(new_ref),fields,
   fragments_changed:!equal(old_ref?.fragments??null,new_ref?.fragments??null)}];
 });
}
function project(version:FinanceVersion|undefined){
 const operation=version?.article.operation_view,research=version?.research;
 return {
  conditions:{change_conditions:operation?.change_conditions,interpretation:version?.interpretation.conditions,
   research_conditions:operation?.research_conditions,held:research?.held.conditions,new_money:research?.new_money.conditions,
   evaluated:omit(research?.conditions,['refs'])},
  reasons:{reason:operation?.reason,counterargument:operation?.counterargument,mechanism:version?.interpretation.mechanism,
   alternatives:omit(version?.interpretation.alternatives,['evidence_ids'])},
  funds:{items:omit(indexed(operation?.funds),['document_date','field_checked_at','checked_at','source_ref_id','announcement']),
   comparison_note:operation?.comparison_note,candidates:omit(research?.candidates,['refs'])},
  body:version?{title:version.article.title,deck:version.article.deck,
   sections:version.article.sections.map(section=>({heading:section.heading,paragraphs:section.paragraphs}))}:undefined,
  // Data dates are shown separately; an unchanged price on a new date is not a new judgment.
  market:operation?.market?omit(operation.market,['as_of','source','daily']):undefined,
  research:version?{claim:version.interpretation.claim,direction:omit(research?.direction,['refs']),
   held:omit(research?.held,['conditions','refs']),new_money:omit(research?.new_money,['conditions','refs']),
   limitations:research?.limitations,gaps:operation?.gaps,next_watch:operation?.next_watch}:undefined
 };
}
function actualSummary(entry:FundTimelineEntry):string {
 if(entry.comparison_status==='initial')return '首版历史记录；可展开当时的判断、正文和来源。';
 if(entry.comparison_status==='previous_missing')return '此前已刊版本未提供，无法核对实际变化。';
 const {diff}=entry,parts:string[]=[];
 for(const [label,item] of [['持有',diff.actions.held],['新增资金',diff.actions.new_money]] as const)
  parts.push(item.action_changed?`${label}动作：${item.old_action??'未记录'} → ${item.new_action??'未记录'}`:`${label}动作仍为${item.new_action??'未记录'}`);
 if(diff.actions.held.text_changed||diff.actions.new_money.text_changed)parts.push('动作适用说明有修改');
 if(diff.conditions.length)parts.push('成立或复核条件有修改');
 if(diff.reasons.length)parts.push('理由或反方解释有修改');
 if(diff.funds.length)parts.push('基金条款或比较说明有修改');
 if(diff.research.length)parts.push('判断或后续关注说明有修改');
 if(diff.body.length)parts.push(`正文改动${diff.body.length}处`);
 const added=diff.sources.filter(s=>s.kind==='added').length,removed=diff.sources.filter(s=>s.kind==='removed').length;
 const modified=diff.sources.filter(s=>s.kind==='modified').length;
 if(added)parts.push(`新增${added}条已存来源`);
 if(removed)parts.push(`移除${removed}条来源`);
 if(modified)parts.push(`修改${modified}条来源记录`);
 if(diff.market.length)parts.push('市场数值快照有变化');
 if(!diff.market.length&&!added&&!removed&&modified)parts.push('未新增来源，市场数值未变');
 return parts.join('；')+'。';
}

/** Public snapshots only. No storage, collection, network or generation is performed. */
export function fundTimeline(versions:FinanceVersion[],storyId=FUND_TIMELINE_STORY_ID):FundTimeline {
 const published=versions.filter(version=>version.story_id===storyId&&version.published_at).sort((a,b)=>a.version-b.version);
 const byId=new Map(published.map(version=>[version.id,version]));
 const entries=published.map(version=>{
  const previous=version.previous_version_id?byId.get(version.previous_version_id):undefined;
  const usablePrevious=previous&&previous.version<version.version?previous:undefined;
  const comparison_status=version.previous_version_id?(usablePrevious?'compared':'previous_missing'):'initial';
  const before=project(usablePrevious),after=project(version),operation=version.article.operation_view;
  const canCompare=comparison_status!=='previous_missing';
  const entry:FundTimelineEntry={id:version.id,story_id:version.story_id,version:version.version,
   previous_version_id:version.previous_version_id,compared_version_id:usablePrevious?.id??null,comparison_status,
   origin:version.origin,origin_label:version.origin==='editor'?'历史人工研究':'已刊模型研究',
   dates:{as_of:version.as_of,reviewed_on:operation?.reviewed_on??null,generated_at:version.generated_at,published_at:version.published_at!},
   recorded_changes:structuredClone(version.changes),
   trigger_evidence:{status:'not_recorded',message:'实际触发证据未记录。来源引用及已存修改说明不等于运行触发记录。'},
   stored_review:structuredClone(version.review??null),evaluated_conditions:structuredClone(version.research?.conditions??[]),
   summary_consistency:{status:'not_assessed',message:null},actual_summary:'',
   diff:{actions:{held:action(usablePrevious?.article.operation_view?.held,operation?.held,comparison_status==='compared'),new_money:action(usablePrevious?.article.operation_view?.unheld,operation?.unheld,comparison_status==='compared')},
    conditions:canCompare?differences(before.conditions,after.conditions,'conditions'):[],
    reasons:canCompare?differences(before.reasons,after.reasons,'reasons'):[],
    funds:canCompare?differences(before.funds,after.funds,'funds'):[],body:canCompare?differences(before.body,after.body,'article'):[],
    sources:canCompare?sourceDifferences(usablePrevious?.input_refs??[],version.input_refs):[],
    market:canCompare?differences(before.market,after.market,'market'):[],research:canCompare?differences(before.research,after.research,'research'):[]}};
  // A stored narrative may repeat a prior addition. Flag only this verifiable claim,
  // without interpreting the narrative as new data or rewriting the historical record.
  if(comparison_status==='compared'&&/(?:加入|补入)A类/.test(version.changes.summary)&&
    !entry.diff.funds.some(item=>item.path.includes('a_class'))&&!entry.diff.sources.some(item=>item.kind==='added'))
   entry.summary_consistency={status:'incomplete_match',message:'已存说明提到加入A类条款，但相对上一版没有新增A类条款或来源；实际差异与说明不完全一致。'};
  entry.actual_summary=actualSummary(entry);
  return entry;
 }).reverse();
 return {story_id:storyId,article_slug:published.at(-1)?.article.slug??null,entries,latest_summary:entries[0]?.actual_summary??null};
}
