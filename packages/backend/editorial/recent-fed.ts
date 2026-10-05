import { applyEditorialCopy,EDITORIAL_COPY } from './copy-20261002.ts';
import type { Material, FinanceVersion } from '../../contracts/types.ts';
import { selectFragments,acceptComposition } from '../finance.ts';
// Authored editorial article based on a successfully fetched official release. No model call.
export function recentFedArticle(material:Material,related:FinanceVersion[]):FinanceVersion {
 if(material.url!=='https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm')throw new Error('unexpected_editorial_evidence');
 const ref=selectFragments(material,['target range','Inflation','Economic activity']);
 ref.display_fragments=['2026年9月16日，委员会一致决定将联邦基金利率目标区间上调0.25个百分点，至3.75%—4.00%。（原文译述）','声明称通胀仍偏高，并强调使通胀更及时回到2%目标。（原文译述）','声明称经济稳健扩张，国内支出具韧性，失业率变化不大。（原文译述）'];
 const v=acceptComposition({story_id:'fed-september-2026',topic_key:'global-rates',claim_key:'fed-balance-of-risks',refs:[ref],previous:null,related}, {
 article:{...EDITORIAL_COPY['fed-september-2026'],slug:'fed-september-2026',category:'海外观察',kind:'analysis',sections:EDITORIAL_COPY['fed-september-2026'].sections.map((section,i)=>({...section,...(i<2?{refs:[material.id]}:{})}))},
 interpretation:{topic_key:'global-rates',claim_key:'fed-balance-of-risks',claim:EDITORIAL_COPY['fed-september-2026'].claim,evidence_ids:[material.id],mechanism:['目标利率上调可能影响短期融资定价','借款成本仍受市场预期与合同条件约束'],conditions:['后续通胀与就业数据支持当前风险权衡','实际传导取决于市场预期、银行报价与合同'],alternatives:[],related_story_ids:related.map(v=>v.story_id),previous_claim_version_ids:related.map(v=>v.id)},changes:{kind:'initial',summary:'新政策事件承接2025年就业风险讨论，当前重点转向价格稳定；旧文保留历史时点。',evidence_ids:[material.id]}
 });
 if(!v)throw new Error('editorial_article_not_created');return applyEditorialCopy({...v,origin:'editor',published_at:new Date().toISOString()});
}
