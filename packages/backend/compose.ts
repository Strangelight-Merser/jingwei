import { readState,mutateState } from './storage.ts';
import { TOPICS } from '../../industry/topics.ts';
import { relatedClaims } from './recall.ts';
import { selectFragments,acceptComposition,inputHash,type ComposeInput } from './finance.ts';
import { composeWithDeepSeek } from './model.ts';
import {compositionIssues} from './finance-quality.ts';
// Called by a worker/editor with a resolved event. New events keep a new story id.
export async function composeEvent(storyId:string,materialIds:string[],topicKey:string,provider:(input:ComposeInput)=>Promise<unknown>=composeWithDeepSeek){
 const state=await readState();const topic=TOPICS.find(t=>t.key===topicKey);if(!topic)throw new Error('unknown_topic');
 const materials=materialIds.map(id=>state.materials.filter(m=>m.id===id).sort((a,b)=>b.revision-a.revision)[0]);
 if(materials.some(m=>!m))throw new Error('material_not_found');
 const refs=materials.map(m=>selectFragments(m,topic.terms));
 const previous=state.finance_versions.filter(v=>v.story_id===storyId).sort((a,b)=>b.version-a.version)[0]??null;
 if(previous?.input_hash===inputHash(refs))return {updated:false,reason:'same_input'};
 const related=[...new Map(materials.flatMap(m=>relatedClaims(m,state.finance_versions)).filter(v=>v.story_id!==storyId).map(v=>[v.id,v])).values()];
 const input:ComposeInput={story_id:storyId,topic_key:topicKey,claim_key:topic.claim_key,refs,previous,related};
 const output=await provider(input);const composed=acceptComposition(input,output);if(!composed)return {updated:false,reason:'maintained'};
 return mutateState(async current=>{
  const last=current.finance_versions.filter(v=>v.story_id===storyId).sort((a,b)=>b.version-a.version)[0]??null;
  if(last?.id!==previous?.id)return {updated:false,reason:'version_changed_during_composition'};
  if(materials.some(m=>current.materials.filter(x=>x.id===m.id).sort((a,b)=>b.revision-a.revision)[0]?.revision!==m.revision))return {updated:false,reason:'source_revised_during_composition'};
  if(current.finance_versions.some(v=>v.article.slug===composed.article.slug&&v.story_id!==composed.story_id))return {updated:false,reason:'article_slug_already_used'};
  current.finance_versions.push(composed);return {updated:true,version:composed.version,id:composed.id,publication:'draft'};
 });
}
export type ReviewOptions={manual_review?:boolean;review_note?:string;review_kind?:'supplement'|'revise';held_action?:'加'|'持'|'减'|'观察';unheld_action?:'加'|'持'|'减'|'观察';held_text?:string;unheld_text?:string;fund_roles?:Record<string,string>};
export async function publishVersion(id:string,options:ReviewOptions={}){
 return mutateState(async state=>{const draft=state.finance_versions.find(v=>v.id===id);if(!draft)throw new Error('version_not_found');if(draft.published_at)return {published:false,reason:'already_published'};
  if(draft.origin==='model'){
   const issues=compositionIssues(draft.input_refs,draft.article,draft.interpretation);
   const error=issues.find(issue=>issue.severity==='error');if(error)throw new Error(error.code);
   if(issues.some(issue=>issue.severity==='review')&&(!options.manual_review||!options.review_note?.trim()))throw new Error('composition_copy_review_required');
  }
  if(state.finance_versions.some(v=>v.story_id===draft.story_id&&v.published_at&&v.version>draft.version)||draft.input_refs.some(r=>state.materials.some(m=>m.id===r.article_id&&m.revision>r.revision)))throw new Error('draft_has_newer_evidence');
  if(draft.review?.required){
   const newer=state.finance_versions.some(v=>v.story_id===draft.story_id&&!v.published_at&&v.version>draft.version&&v.review?.required);
   if(newer)throw new Error('draft_has_newer_evidence');
   if(!options.manual_review)throw new Error('operation_manual_review_required');
   const note=options.review_note?.trim();if(!note||note.length<20||!options.review_kind)throw new Error('operation_review_note_required');
   const view=draft.article.operation_view;if(!view)throw new Error('operation_view_missing');
   const prior=state.finance_versions.find(v=>v.id===draft.previous_version_id)?.article.operation_view;
   const changed=options.held_action&&options.held_action!==prior?.held.action||options.unheld_action&&options.unheld_action!==prior?.unheld.action||options.held_text&&options.held_text!==prior?.held.text||options.unheld_text&&options.unheld_text!==prior?.unheld.text||options.fund_roles&&view.funds.some(f=>options.fund_roles?.[f.code]&&options.fund_roles[f.code]!==prior?.funds.find(p=>p.code===f.code)?.role);
   if(changed&&options.review_kind!=='revise')throw new Error('operation_change_requires_revision');
   if(options.held_action)view.held.action=options.held_action;if(options.unheld_action)view.unheld.action=options.unheld_action;
   if(options.held_text)view.held.text=options.held_text;if(options.unheld_text)view.unheld.text=options.unheld_text;
   for(const fund of view.funds)if(options.fund_roles?.[fund.code])fund.role=options.fund_roles[fund.code];
   view.reason=note;view.reviewed_on=new Date().toISOString().slice(0,10);draft.article.deck=note;
   draft.interpretation.claim=`${note} 已持有：${view.held.action}，${view.held.text} 未持有：${view.unheld.action}，${view.unheld.text}`;
   draft.interpretation.evidence_ids=draft.input_refs.map(ref=>ref.article_id);
   const facts=draft.review.changes.map(c=>`${c.code} ${c.field}：此前${c.old_value}，本次${c.new_value}（原文核查${c.checked_at.slice(0,10)}）。`);
   draft.article.sections=[{heading:'本次重新评估',paragraphs:[note,...facts,...(draft.review.condition_changes??[])],refs:draft.changes.evidence_ids},{heading:'操作参考的适用条件',paragraphs:[view.held.text,view.unheld.text,...draft.interpretation.conditions]},{heading:'反方与后续改判条件',paragraphs:[view.counterargument,...view.change_conditions]}];
   draft.changes.kind=options.review_kind;draft.changes.summary=note;
   draft.review.status='approved';draft.review.reason=note;draft.review.reviewed_at=new Date().toISOString();
  }
  if(options.manual_review&&options.review_note?.trim())draft.editorial_review={note:options.review_note.trim(),reviewed_at:new Date().toISOString()};
  draft.published_at=new Date().toISOString();return {published:true,slug:draft.article.slug,version:draft.version};});
}
