import type {FundResearchInput} from '../../packages/backend/fund-research.ts';

/** Isolated provider fixture. This is never registered as a product generator. */
export function fundResearchFixture(input:FundResearchInput,kind:'initial'|'maintain'|'supplement'|'revise'=input.previous?'revise':'initial') {
 const {snapshot,evaluation,previous}=input,ids=snapshot.refs.map(r=>r.article_id),first=ids[0];
 const conditions=Object.entries(evaluation.checks).map(([check,result])=>({key:check,label:check==='user_plan_known'?'原配置计划是否明确':'公开资料与工具条件核查',scope:check==='user_plan_known'?'held':'comparison',check,status:result.status,explanation:result.explanation,refs:result.refs}));
 const text='现有公开资料支持核查市场与工具事实，尚不足以确定个人的资金配置。';
 const position={stance:'not_assessable',summary:'未知个人原配置计划与期限，当前只能完成公开事实核查。',conditions:['user_plan_known'],refs:ids};
 return {
  article:{slug:previous?.article.slug??'csi300-etf-and-share-classes',title:'沪深300工具研究与待核条件',deck:'本次核查保留原数据日期，对已取得的基金字段与市场事实作公开研究。',category:'基金研究',read_minutes:3,kind:'analysis',sections:[{heading:'可用事实',paragraphs:[text],refs:[first],basis:[{kind:'inference',refs:[{article_id:first,fragment_index:0}]}]},{heading:'后续条件',paragraphs:['未取得的条款仍需核实，现有材料不能推出个人加减仓结论。'],refs:[first],basis:[{kind:'inference',refs:[{article_id:first,fragment_index:0}]}]}]},
  interpretation:{topic_key:'china-equity-index',claim_key:'csi300-public-fund-research',claim:kind==='maintain'||kind==='supplement'?previous!.interpretation.claim:text,evidence_ids:ids,mechanism:['工具字段影响比较口径，不能直接推导市场动作。'],conditions:['个人配置仍取决于原计划及适用条件。'],alternatives:[],related_story_ids:[],previous_claim_version_ids:previous?[previous.id]:[]},
  changes:{kind,summary:'本次完成可用公开证据核查，并说明尚未取得的资料。',evidence_ids:ids},
  research:{evaluated_at:snapshot.captured_at,evidence_hash:snapshot.evidence_hash,data_status:evaluation.data_status,coverage:{direction_key:'csi300',label:'沪深300及实际取得的工具证据',direction_selection_supported:false,fund_codes:[...new Set([...snapshot.funds.map(f=>f.code),...(snapshot.fund_series??[]).map(f=>f.code)])]},direction:{summary:text,why:['本次覆盖范围是已有方向，不能代表跨方向筛选。'],refs:ids},candidates:snapshot.funds.map(f=>({code:f.code,summary:'仅比较本次取得的公开字段',differences:['未取得的字段保留未知，不作收益优劣排序。'],refs:ids})),new_money:position,held:{...position},conditions,impact_scope:['comparison'],limitations:evaluation.limitations}
 };
}
