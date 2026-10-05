import { readState,mutateState } from './storage.ts';
import { syncCandidates,identifyEvent } from './events.ts';
import { setupWaitingReason,sessionState,PRICE_POLICY } from './budget.ts';
import { composeEvent,publishVersion,type ReviewOptions } from './compose.ts';
import { composeWithDeepSeek } from './model.ts';
import type { ComposeInput } from './finance.ts';
import {getPendingFundReviewNotice} from './fund-updates.ts';
import {compositionIssues} from './finance-quality.ts';
import { SOURCES } from '../../industry/sources.ts';
export async function updateQueue(){return mutateState(async state=>syncCandidates(state));}
export async function pipelineSnapshot(){
 const state=await readState();const setupReason=await setupWaitingReason();
 return {session:sessionState(),budget:state.budget?{limit_cny:state.budget.limit_micro_cny/1e6,reserved_cny:state.budget.reserved_micro_cny/1e6,requests:state.budget.reservations.length}:null,pricing:PRICE_POLICY,sources:SOURCES.map(({id,name})=>({id,name})),events:state.events,materials:state.materials.filter(m=>!state.materials.some(n=>n.id===m.id&&n.revision>m.revision)).map(m=>({id:m.id,title:m.title,url:m.url,date:m.published_at,revision:m.revision,ready:identifyEvent(m).ready,reason:identifyEvent(m).reason})),tasks:state.tasks.map(task=>({...task,waiting_reason:task.status==='pending'&&task.waiting_reason!=='interrupted'&&state.events.find(e=>e.id===task.event_id)?.status==='identified'?setupReason??task.waiting_reason:task.waiting_reason})),drafts:state.finance_versions.filter(v=>!v.published_at),fund_review:getPendingFundReviewNotice(state),last_collection:state.collection_runs.at(-1)??null};
}
export async function processTask(id:string,provider?:(input:ComposeInput)=>Promise<unknown>){
 const waiting=await setupWaitingReason();
 const task=await mutateState(async state=>{
  const task=state.tasks.find(t=>t.id===id);if(!task)throw new Error('task_not_found');
  const event=state.events.find(e=>e.id===task.event_id)!;
  if(task.status==='draft'||task.status==='done')return null;
  if(task.status==='running')throw new Error('task_busy');
  const reason=event.status==='identified'?waiting:event.status;
  if(reason){task.status='pending';task.waiting_reason=reason;task.updated_at=new Date().toISOString();return null;}
  task.status='running';task.waiting_reason=null;task.updated_at=new Date().toISOString();return {...task,story_id:event.story_id,topic_key:event.topic_key!};
 });
 if(!task){const stored=(await readState()).tasks.find(t=>t.id===id);return {processed:false,reason:stored?.waiting_reason??'already_processed'};}
 try{
  const result=await composeEvent(task.story_id,task.material_ids,task.topic_key,provider??(input=>composeWithDeepSeek(input,task.id)));
  await mutateState(async state=>{const stored=state.tasks.find(t=>t.id===id)!;stored.status=result.updated?'draft':'done';stored.version_id='id' in result?result.id!:null;stored.waiting_reason=result.updated?null:'reason' in result?(result.reason??null):null;stored.updated_at=new Date().toISOString();});return {processed:true,...result};
 }catch(e){const known=e instanceof Error?e.message:'';const reason=/^(budget_exhausted|pricing_verification_failed|input_too_large|model_output_truncated|empty_model_output|invalid_model_json|model_http_\d+|model_setup_required|invalid_model_structure|unknown_evidence_reference|unknown_related_claim|article_entry_must_remain_stable|existing_event_requires_comparison|new_event_requires_initial_version|original_evidence_required|no_relevant_original_fragments|claim_change_requires_revision|unstable_topic_or_claim_key|invalid_evidence_date|evidence_year_mismatch|evidence_date_mismatch|fund_terms_cannot_support_market_action|missing_section_evidence|missing_paragraph_basis|missing_paragraph_evidence|invalid_fragment_reference|section_evidence_binding_mismatch)$/.test(known)?known:'generation_failed';
  await mutateState(async state=>{const stored=state.tasks.find(t=>t.id===id)!;stored.status=['budget_exhausted','pricing_verification_failed','model_setup_required'].includes(reason)?'pending':'failed';stored.waiting_reason=reason;stored.updated_at=new Date().toISOString();});return {processed:false,reason};
 }
}
export async function processNext(sourceIds?:string[],provider?:(input:ComposeInput)=>Promise<unknown>){await updateQueue();const state=await readState();const task=state.tasks.find(t=>t.status==='pending'&&state.events.find(e=>e.id===t.event_id)?.status==='identified'&&(!sourceIds||t.material_ids.some(id=>state.materials.some(m=>m.id===id&&sourceIds.includes(m.source_id)))));return task?processTask(task.id,provider):{processed:false,reason:'no_ready_task'};}
export async function publishDraft(id:string,options:ReviewOptions={}){const result=await publishVersion(id,options);await mutateState(async s=>{for(const t of s.tasks.filter(t=>t.version_id===id)){t.status='done';t.waiting_reason='published';t.updated_at=new Date().toISOString();}});return result;}

export async function editDraft(id:string,edits:{title:string;deck:string;paragraphs:string[][]}){
 return mutateState(async state=>{
  const draft=state.finance_versions.find(v=>v.id===id);
  if(!draft||draft.published_at||draft.origin!=='model'||draft.review?.required)throw Error('draft_edit_not_available');
  if(edits.paragraphs.length!==draft.article.sections.length||edits.paragraphs.some((p,i)=>p.length!==draft.article.sections[i].paragraphs.length))throw Error('invalid_draft_edits');
  const article={...draft.article,title:edits.title,deck:edits.deck,sections:draft.article.sections.map((s,i)=>({...s,paragraphs:edits.paragraphs[i]}))};
  const issue=compositionIssues(draft.input_refs,article,draft.interpretation).find(i=>i.severity==='error');if(issue)throw Error(issue.code);
  draft.article=article;draft.editorial_edited_at=new Date().toISOString();delete draft.editorial_review;return {saved:true};
 });
}
