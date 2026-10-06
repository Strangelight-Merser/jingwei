import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import { homePublication, articlePublication, topicPublication, publishedVersions, judgmentChangesPublication } from '../../../packages/backend/publication.ts';
import { TOPICS } from '../../../industry/topics.ts';
import { z } from 'zod';
import { configureSession,sessionState,clearSession,setupWaitingReason,restoreSavedCredential,removeSavedCredential } from '../../../packages/backend/budget.ts';
import {keychainStore,credentialSupport,type CredentialStore,type CredentialStatus} from '../../../packages/backend/credentials.ts';
import { createSessionUpdater } from '../../worker/src/session-update.ts';
import { pipelineSnapshot,processNext,processTask,publishDraft,editDraft } from '../../../packages/backend/pipeline.ts';
import { collectOnce } from '../../../packages/backend/jobs.ts';
import { mutateState, readState, initializeStorage, PRODUCTION_DATA_DIR, storageConfiguration } from '../../../packages/backend/storage.ts';
import {createResearchService,defaultResearchState,readingResearch} from '../../../packages/backend/research-service.ts';
import {judgmentPublication,judgmentOverviewPublication} from '../../../packages/backend/judgment.ts';
import {isIndexCode} from '../../../packages/backend/valuation-indexes.ts';
export async function startApi({credentialStore=keychainStore,credentialCapability=credentialSupport,port=4411,mode='active',restoreSavedKey,composeProvider,collectSource=collectOnce,researchUpdates=false,researchCollector,researchProvider,valuationRefresh}:{credentialStore?:CredentialStore;credentialCapability?:()=>Promise<CredentialStatus>;port?:number;mode?:'read_only'|'manual_collect'|'active';restoreSavedKey?:boolean;composeProvider?:Parameters<typeof processTask>[1];collectSource?:typeof collectOnce;researchUpdates?:boolean;researchCollector?:NonNullable<Parameters<typeof createResearchService>[0]>['collector'];researchProvider?:NonNullable<Parameters<typeof createResearchService>[0]>['provider'];valuationRefresh?:(()=>Promise<unknown>)|null}={}){
storageConfiguration();await readState(); // The caller determines the directory before the API starts.
const app=Fastify({logger:false});
await (await import('../../../packages/backend/ask.ts')).registerAskRoutes(app);
await (await import('../../../packages/backend/holdings-routes.ts')).registerHoldings(app,{networkChecks:mode==='active'&&process.env.JINGWEI_TEST_MODE!=='1'});
let credentialAccessed=false;
let credentialRecovery:{restored:boolean;error:string|null}|null=null;
const savedRecovery=(await readState()).owner_preferences?.restore_saved_key_on_start===true;
async function restoreCredential(interactive:boolean){credentialAccessed=true;const result=await restoreSavedCredential(interactive,credentialStore);credentialRecovery={restored:result.restored,error:result.error};return result;}
app.get('/health',async()=>({ok:true}));
app.addHook('onRequest',async(req,reply)=>{
 if(['GET','HEAD'].includes(req.method))return;
 // Holdings parsing and check-up only compute from the request body and store nothing.
 if(req.method==='POST'&&['/holdings/parse','/holdings/checkup'].includes(req.url))return;
 if(mode==='read_only')return reply.code(503).send({error:'maintenance_read_only'});
 if(mode==='manual_collect'&&(req.method!=='POST'||req.url!=='/owner/collect'))return reply.code(403).send({error:'manual_collection_only'});
});
app.addHook('onRequest',async(req,reply)=>{if(req.url.startsWith('/owner/')&&req.method==='POST'&&req.headers['x-jingwei-owner']!=='local')return reply.code(403).send({error:'local_owner_request_required'});});
let collecting=false;
async function collectSelected(id:string){if(collecting)throw new Error('collection_busy');collecting=true;try{return await collectSource(id);}finally{collecting=false;}}
const automatic=createSessionUpdater({collect:collectSelected,process:ids=>processNext(ids,composeProvider),publish:publishDraft,ready:setupWaitingReason});
const research=createResearchService({collector:researchCollector,provider:researchProvider,valuation:valuationRefresh});
app.get('/reading/research',async()=>({...await readingResearch(),update:await research.status()}));
app.get('/reading/followed',async()=>({topic_keys:(await readState()).research_state?.followed_topics??[]}));
app.post('/reading/followed',async(req,reply)=>{
 if(req.headers['x-jingwei-reader']!=='local')return reply.code(403).send({error:'local_reading_request_required'});
 const parsed=z.object({topic_key:z.enum(TOPICS.map(t=>t.key) as [string,...string[]]),followed:z.boolean()}).safeParse(req.body);
 if(!parsed.success)return reply.code(400).send({error:'unknown_topic'});
 return mutateState(async state=>{const r=state.research_state??=defaultResearchState();r.followed_topics=r.followed_topics.filter(key=>key!==parsed.data.topic_key);if(parsed.data.followed)r.followed_topics.push(parsed.data.topic_key);return {topic_keys:r.followed_topics};});
});
app.post('/reading/research/check',async(req,reply)=>{if(req.headers['x-jingwei-reader']!=='local')return reply.code(403).send({error:'local_reading_request_required'});void research.check().catch(()=>console.warn('research_collection_failed'));return {accepted:true,status:'checking'};});
app.get('/owner/research/preview',async()=>research.preview());
app.post('/owner/research/process',async(req,reply)=>{const parsed=z.object({expected_hash:z.string().regex(/^[a-f0-9]{64}$/).optional(),expected_previous_id:z.string().nullable().optional(),expected_request_hash:z.string().regex(/^[a-f0-9]{64}$/).optional()}).safeParse(req.body??{});if(!parsed.success)return reply.code(400).send({error:'invalid_research_request'});const started_at=new Date().toISOString();const result=await research.processLatest({explicit:true,...parsed.data});await mutateState(async state=>{const r=state.research_state??=defaultResearchState();r.checks.push({id:'research-'+started_at,started_at,finished_at:new Date().toISOString(),status:result.status,evidence_hash:r.latest_snapshot?.evidence_hash??null,source_errors:r.latest_snapshot?.errors??[],version_id:result.version_id,message:result.message});r.checks=r.checks.slice(-40);});return result;});
app.post('/owner/research/check',async()=>research.check());
app.post('/owner/research/automatic',async(req,reply)=>{const parsed=z.object({enabled:z.boolean(),interval_minutes:z.union([z.literal(60),z.literal(180),z.literal(360),z.literal(1440)]),model_enabled:z.boolean()}).safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'invalid_research_settings'});try{return await research.configure(parsed.data);}catch(e){return reply.code(400).send({error:e instanceof Error?e.message:'research_configuration_failed'});}});
app.get('/owner/state',async()=>({...await pipelineSnapshot(),automatic:automatic.snapshot(),research_update:await research.status(),research_settings:(await readState()).research_state?.settings??defaultResearchState().settings,access_mode:mode,credential_recovery:credentialRecovery,keychain:mode==='active'?(credentialAccessed?await credentialStore.status():await credentialCapability()):{stored:null,available:false,reason:mode==='read_only'?'maintenance_read_only':'manual_collection_only'}}));
app.post('/owner/automatic',async(req,reply)=>{try{return await automatic.configure(req.body);}catch(e){const reason=e instanceof Error?e.message:'';return reply.code(400).send({error:/^(key_required|budget_approval_required|budget_exhausted|automatic_publication_not_authorized|operation_automatic_publication_forbidden)$/.test(reason)?reason:'automatic_configuration_failed'});}});
app.post('/owner/session',async(req,reply)=>{const parsed=z.object({key:z.string().max(500).optional(),limit_cny:z.number().positive().max(1000).optional(),authorize:z.boolean(),save_to_keychain:z.boolean().optional()}).safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'invalid_configuration'});try{const session=await configureSession(parsed.data,credentialStore);if(parsed.data.save_to_keychain)credentialAccessed=true;if(!session.authorized)automatic.stop('budget_approval_required');return session;}catch(e){if(!sessionState().authorized)automatic.stop('budget_approval_required');const error=e instanceof Error?e.message:'';return reply.code(400).send({error:/^(keychain_[a-z_]+|invalid_key|budget_below_reserved)$/.test(error)?error:'invalid_configuration'});}});
app.post('/owner/keychain/restore',async()=>{automatic.stop('budget_approval_required');return restoreCredential(true);});
app.post('/owner/keychain/remove',async(req,reply)=>{automatic.stop('key_required');try{credentialAccessed=true;const removed=await removeSavedCredential(credentialStore);credentialRecovery=null;return removed;}catch(e){return reply.code(400).send({error:e instanceof Error?e.message:'keychain_failed'});}});
app.post('/owner/session/clear',async()=>{automatic.stop('key_required');clearSession();return {cleared:true};});
app.post('/owner/collect',async(req,reply)=>{if(collecting)return reply.code(409).send({error:'collection_busy'});const parsed=z.object({source_id:z.enum(['fed-monetary','nbs-release','csi300-products','csi300-market'])}).safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'unknown_source'});return collectSelected(parsed.data.source_id);});
app.post('/owner/process-next',async()=>processNext(undefined,composeProvider));
app.post('/owner/process',async(req,reply)=>{const parsed=z.object({task_id:z.string().min(1).max(100)}).safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'invalid_task'});return processTask(parsed.data.task_id,composeProvider);});
app.post('/owner/draft',async(req,reply)=>{const parsed=z.object({version_id:z.string().min(1).max(100),title:z.string().min(3).max(80),deck:z.string().min(20).max(2000),paragraphs:z.array(z.array(z.string().min(1).max(6000)).min(1)).min(2).max(20)}).safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'invalid_draft_edits'});try{return await editDraft(parsed.data.version_id,parsed.data);}catch(e){const error=e instanceof Error?e.message:'';return reply.code(409).send({error:/^(draft_edit_not_available|invalid_draft_edits|evidence_year_mismatch|evidence_date_mismatch|missing_paragraph_basis|fund_terms_cannot_support_market_action)$/.test(error)?error:'draft_edit_failed'});}});
app.post('/owner/publish',async(req,reply)=>{const parsed=z.object({version_id:z.string().min(1).max(100),manual_review:z.boolean().optional(),review_note:z.string().min(20).max(2000).optional(),review_kind:z.enum(['supplement','revise']).optional(),held_action:z.enum(['加','持','减','观察']).optional(),unheld_action:z.enum(['加','持','减','观察']).optional(),held_text:z.string().min(12).max(1200).optional(),unheld_text:z.string().min(12).max(1200).optional(),fund_roles:z.record(z.enum(['007339','005658']),z.string().min(2).max(100)).optional()}).safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'invalid_version'});try{return await publishDraft(parsed.data.version_id,parsed.data);}catch(e){const error=e instanceof Error?e.message:'';return reply.code(409).send({error:/^(operation_manual_review_required|operation_review_note_required|operation_change_requires_revision|draft_has_newer_evidence|composition_copy_review_required)$/.test(error)?error:'publication_failed'});}});
app.get('/publication/home',async()=>({...await homePublication(),research_update:await research.status()}));
app.get('/publication/articles',publishedVersions);
app.get('/publication/topics',async()=>TOPICS.filter(t=>t.key==='china-equity-index'));
app.get('/publication/changes',judgmentChangesPublication);
app.get('/publication/judgment',async(req,reply)=>{const index=(req.query as {index?:unknown}).index??'000300';if(!isIndexCode(index))return reply.code(400).send({error:'unknown_index'});return (await judgmentPublication(index))??reply.code(404).send({error:'judgment_unavailable'});});
app.get('/publication/judgments',judgmentOverviewPublication);
await (await import('../../../packages/backend/rule-outcomes-publication.ts')).registerRuleOutcomes(app,{networkChecks:mode==='active'});
await (await import('../../../packages/backend/erp-publication.ts')).registerErp(app,{networkChecks:mode==='active'});
app.get<{Params:{slug:string};Querystring:{version?:string}}>('/publication/articles/:slug',async(req,reply)=>{const v=req.query.version!==undefined?(req.query.version.trim()?Number(req.query.version):NaN):undefined;const result=await articlePublication(req.params.slug,v);return result?{...result,research_update:await research.status()}:reply.code(404).send({error:'article_not_found'});});
app.get<{Params:{key:string}}>('/publication/topics/:key',async(req,reply)=>{const result=await topicPublication(req.params.key);return result?{...result,research_update:await research.status()}:reply.code(404).send({error:'topic_not_found'});});
if(mode==='active'){
 // Only interrupted work is recovered. Startup does not requeue finished work or fetch evidence.
 if((await readState()).tasks.some(t=>t.status==='running'))await mutateState(async state=>{for(const task of state.tasks.filter(t=>t.status==='running')){task.status='pending';task.waiting_reason='interrupted';}});
 // Saving on this machine is the owner's explicit choice to restore on later starts.
 if(restoreSavedKey??savedRecovery)await restoreCredential(false);
}
app.addHook('onClose',async()=>{automatic.stop();research.stop();clearSession();});
await app.listen({host:'127.0.0.1',port});
if(mode==='active'&&researchUpdates)await research.start();
return app;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const mode=process.env.JINGWEI_ENABLE_MUTATIONS==='manual'?'manual_collect':process.env.JINGWEI_ENABLE_MUTATIONS==='false'?'read_only':'active';
 await initializeStorage({dataDir:process.env.JINGWEI_DATA_DIR??PRODUCTION_DATA_DIR,readOnly:mode==='read_only'});
 const app=await startApi({mode});
 console.log('经纬内容 API http://127.0.0.1:4411');
 const shutdown=()=>{void app.close();};
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
