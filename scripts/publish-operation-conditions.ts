import './write-env.ts';
import {randomUUID} from 'node:crypto';
import {FIRST_OPERATION} from '../industry/first-operation.ts';
import {mutateState} from '../packages/backend/storage.ts';
const result=await mutateState(async state=>{
 const versions=state.finance_versions.filter(v=>v.story_id===FIRST_OPERATION.story_id);
 const prior=versions.filter(v=>v.published_at).sort((a,b)=>b.version-a.version)[0];
 if(!prior)throw new Error('initial_operation_missing');
 if(JSON.stringify(prior.article)===JSON.stringify(FIRST_OPERATION.article))return {published:false,reason:'already_corrected'};
 const at=new Date().toISOString();const next={...structuredClone(FIRST_OPERATION),id:randomUUID(),version:Math.max(...versions.map(v=>v.version))+1,previous_version_id:prior.id,as_of:prior.as_of,generated_at:at,published_at:at,input_hash:prior.input_hash,input_refs:structuredClone(prior.input_refs)};
 next.interpretation.previous_claim_version_ids=[prior.id];
 next.changes={kind:'revise',summary:'明确持有仅适用于原长期配置计划、仓位范围和原依据仍成立；费用研究只支持既定方向的工具选择，不从缺少估值资料推出持有。此次为编辑修正，没有新增市场证据。',evidence_ids:prior.changes.evidence_ids};
 state.finance_versions.push(next);return {published:true,id:next.id,version:next.version,previous_version_id:prior.id,at};
});console.log(JSON.stringify(result));
