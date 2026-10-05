import './write-env.ts';
import {randomUUID} from 'node:crypto';
import {mutateState} from '../packages/backend/storage.ts';
import {inputHash} from '../packages/backend/finance.ts';
import {CSI300_READING_GUIDE} from '../industry/csi300-reading-guide.ts';

const result=await mutateState(async state=>{
 const existing=state.finance_versions.find(v=>v.story_id===CSI300_READING_GUIDE.story_id&&v.published_at);
 if(existing)return {published:false,reason:'already_published',id:existing.id};
 const next=structuredClone(CSI300_READING_GUIDE),at=new Date().toISOString();
 next.id=randomUUID();next.generated_at=at;next.published_at=at;next.input_hash=inputHash(next.input_refs);
 state.finance_versions.push(next);
 return {published:true,id:next.id,story_id:next.story_id,published_at:at,source_as_of:next.as_of};
});
console.log(JSON.stringify(result));
