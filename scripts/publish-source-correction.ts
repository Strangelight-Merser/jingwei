import './write-env.ts';
import {randomUUID} from 'node:crypto';
import {mutateState} from '../packages/backend/storage.ts';
import {inputHash} from '../packages/backend/finance.ts';

const result=await mutateState(async state=>{
 const versions=state.finance_versions.filter(v=>v.article.slug==='csi300-hold-and-fund-choice');
 const prior=versions.filter(v=>v.published_at).sort((a,b)=>b.version-a.version)[0];
 if(!prior?.article.operation_view)throw new Error('published_operation_missing');
 const unsupported='市盈率计算剔除亏损股票；净资产采用最新一期财报。';
 const next=structuredClone(prior);
 const refs=[...next.input_refs,...(next.article.operation_view!.market?[next.article.operation_view!.market.source]:[])];
 if(!refs.some(r=>r.fragments.some(f=>f.includes(unsupported))))return {published:false,reason:'already_corrected'};
 for(const r of refs){
  r.fragments=r.fragments.map(f=>f.replace(unsupported,''));
  if(r.display_fragments)r.display_fragments=r.display_fragments.map(f=>f.replace(unsupported,''));
 }
 const at=new Date().toISOString();
 next.id=randomUUID();next.previous_version_id=prior.id;next.version=Math.max(...versions.map(v=>v.version))+1;
 next.generated_at=at;next.published_at=at;next.origin='editor';next.input_hash=inputHash(next.input_refs);
 next.interpretation.previous_claim_version_ids=[prior.id];
 next.changes={kind:'revise',summary:'订正原文摘记：删除尚未核实适用于该指数接口的估值计算口径。9月30日数值、原有持仓条件和新增资金先观察的判断均未改变。',evidence_ids:['csi300-official-market-20260930']};
 state.finance_versions.push(next);
 return {published:true,id:next.id,version:next.version,previous_version_id:prior.id,published_at:at,market_data_as_of:next.article.operation_view!.market?.as_of,judgment_changed:false};
});
console.log(JSON.stringify(result));
