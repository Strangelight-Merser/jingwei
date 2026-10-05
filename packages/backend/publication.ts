// One publication reader for homepage, article and topic: no page can trigger generation.
import { readState, type State } from './storage.ts';
import { TOPICS } from '../../industry/topics.ts';
import type { FinanceVersion } from '../contracts/types.ts';
import {marketAvailability,marketCheck} from './market-availability.ts';
import {getPendingFundReviewNotice} from './fund-updates.ts';
import {researchUpdateStatus} from './research-service.ts';
import {evaluateResearchSnapshot} from './fund-research.ts';
import {fundTimeline} from './fund-timeline.ts';
function latestPublished(state:State): FinanceVersion[] {
 const latest=new Map<string,FinanceVersion>();
 for (const v of state.finance_versions) if(v.published_at && (!latest.has(v.story_id)||latest.get(v.story_id)!.version<v.version)) latest.set(v.story_id,v);
 return [...latest.values()];
}
export async function publishedVersions(): Promise<FinanceVersion[]> {
 return latestPublished(await readState());
}
export async function homePublication() {
 const state=await readState();const all=latestPublished(state);const lead=all.find(v=>v.research)??all.find(v=>v.article.operation_view)??all[0];
 const operation=all.find(v=>v.article.operation_view);
 return {latest_change:fundTimeline(state.finance_versions).latest_summary, research_update:researchUpdateStatus(state),research_facts:state.research_state?.latest_snapshot?evaluateResearchSnapshot(state.research_state.latest_snapshot):null,research_data_as_of:state.research_state?.latest_snapshot?.market?.as_of??null,research_source_refs:state.research_state?.latest_snapshot?.refs??[],research_evidence_hash:state.research_state?.latest_snapshot?.evidence_hash??null,market_check:operation?marketCheck(state,operation):null,market_availability:operation?marketAvailability(state,operation):null,lead, background:all.filter(v=>v.article.kind==='background'&&v.interpretation.topic_key==='china-equity-index'), selections:all.filter(v=>v!==lead&&v.article.kind==='analysis'&&v.interpretation.topic_key==='china-equity-index'), topics:TOPICS.filter(t=>t.key==='china-equity-index'), as_of:lead?.as_of, fund_review_notice:getPendingFundReviewNotice(state),progress:undefined };
}
export async function articlePublication(slug:string, number?:number) {
 if(number!==undefined&&(!Number.isInteger(number)||number<1))return null;
 const state=await readState();const published=latestPublished(state);
 const latest=published.find(v=>v.article.slug===slug);if(!latest) return null;
 const all=state.finance_versions.filter(v=>v.story_id===latest.story_id && v.published_at).sort((a,b)=>b.version-a.version);
 const selected=number!==undefined?all.find(v=>v.version===number):latest;
 if(!selected) return null;
 const notice=getPendingFundReviewNotice(state);
 return {latest_change:selected.article.operation_view?fundTimeline(state.finance_versions).entries.find(e=>e.id===selected.id)?.actual_summary:null,research_update:researchUpdateStatus(state),research_facts:state.research_state?.latest_snapshot?evaluateResearchSnapshot(state.research_state.latest_snapshot):null,research_data_as_of:state.research_state?.latest_snapshot?.market?.as_of??null,research_source_refs:state.research_state?.latest_snapshot?.refs??[],research_evidence_hash:state.research_state?.latest_snapshot?.evidence_hash??null,market_check:selected.id===latest.id?marketCheck(state,selected):null,market_availability:selected.id===latest.id?marketAvailability(state,selected):null, version:selected, latest, history:all.filter(v=>v.version<selected.version), fund_review_notice:notice?.published_version_id===selected.id?notice:null,topic:TOPICS.find(t=>t.key===latest.interpretation.topic_key), related:published.filter(v=>v.story_id!==latest.story_id&&v.interpretation.topic_key===latest.interpretation.topic_key) };
}
export async function judgmentChangesPublication(){return fundTimeline((await readState()).finance_versions);}
export async function topicPublication(key:string) {
 const topic=TOPICS.find(t=>t.key===key); if(!topic)return null;
 const state=await readState();
 const all=latestPublished(state).filter(v=>v.interpretation.topic_key===key).sort((a,b)=>b.as_of.localeCompare(a.as_of));
 const latest=all.find(v=>v.article.kind==='analysis');
 const notice=getPendingFundReviewNotice(state);
 return {research_update:researchUpdateStatus(state),research_facts:state.research_state?.latest_snapshot?evaluateResearchSnapshot(state.research_state.latest_snapshot):null,research_data_as_of:state.research_state?.latest_snapshot?.market?.as_of??null,research_source_refs:state.research_state?.latest_snapshot?.refs??[],research_evidence_hash:state.research_state?.latest_snapshot?.evidence_hash??null, topic, current:latest?latest.interpretation.claim:'目前还没有已刊分析。', articles:all, latest, background:all.filter(v=>v.article.kind==='background'), earlier:all.filter(v=>v.article.kind==='analysis').slice(1), as_of:all.map(v=>v.as_of).sort().at(-1), market_check:latest?.article.operation_view?marketCheck(state,latest):null,market_availability:latest?.article.operation_view?marketAvailability(state,latest):null, fund_review_notice:notice?.published_version_id===latest?.id?notice:null };
}
