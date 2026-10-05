import { randomUUID } from 'node:crypto';
import { sha256,stableJson } from './identity.ts';
import { z } from 'zod';
import type { SourceRef, FinanceVersion, Material } from '../contracts/types.ts';
import {compositionIssues} from './finance-quality.ts';
// Adapted from AIHOT digestInputsHash: a revised input invalidates the old composition.
export function inputHash(refs:SourceRef[]):string {
 const inputs=[...refs].sort((a,b)=>a.article_id.localeCompare(b.article_id))
   .map(r=>({id:r.article_id,revision:r.revision,at:r.published_at,...(r.data_as_of?{data_as_of:r.data_as_of}:{}),url:r.url,fragments:r.fragments}));
 return sha256(stableJson(inputs));
}
export function selectFragments(material:Material, terms:readonly string[]): SourceRef {
 const tables=material.paragraphs.filter(p=>p.startsWith('Table original:')&&!/\/ June projection \|/.test(p));
 const notes=material.paragraphs.filter(p=>/^Note: Projections|^\d\. For each period|^\d\. The central tendency/.test(p));
 const matched=tables.length?[...tables.slice(0,5),...notes]:material.paragraphs.filter(p=>terms.some(t=>p.toLowerCase().includes(t.toLowerCase())));
 // A title or digest never substitutes for actual evidence paragraphs.
 if(!matched.length)throw new Error('no_relevant_original_fragments');
 return {article_id:material.id,revision:material.revision,source:material.source_id,url:material.url,published_at:material.published_at,fragments:matched.slice(0,tables.length?8:5).map(p=>p.slice(0,tables.length?2000:900))};
}
const section=z.object({heading:z.string().min(1),paragraphs:z.array(z.string().min(1)).min(1),refs:z.array(z.string()).optional(),basis:z.array(z.object({kind:z.enum(['fact','inference','action']),refs:z.array(z.object({article_id:z.string(),fragment_index:z.number().int().min(0)})).min(1)})).optional()});
export const outputSchema=z.object({
 article:z.object({slug:z.string().regex(/^[a-z0-9-]+$/),title:z.string().min(3).max(80),deck:z.string().min(20),category:z.string(),read_minutes:z.number().int().min(1).max(20),kind:z.enum(['analysis','background']),sections:z.array(section).min(2)}),
 interpretation:z.object({topic_key:z.string(),claim_key:z.string(),claim:z.string().min(10),evidence_ids:z.array(z.string()).min(1),mechanism:z.array(z.string()),conditions:z.array(z.string()).min(1),alternatives:z.array(z.object({explanation:z.string(),evidence_ids:z.array(z.string()).min(1)})),related_story_ids:z.array(z.string()),previous_claim_version_ids:z.array(z.string())}),
 changes:z.object({kind:z.enum(['initial','maintain','supplement','revise']),summary:z.string(),evidence_ids:z.array(z.string())})
});
export type ComposeInput={story_id:string;topic_key:string;claim_key:string;refs:SourceRef[];previous:FinanceVersion|null;related:FinanceVersion[]};
export function financePrompt(input:ComposeInput):string {
 const context=(version:FinanceVersion)=>({id:version.id,story_id:version.story_id,article:{slug:version.article.slug},interpretation:{topic_key:version.interpretation.topic_key,claim_key:version.interpretation.claim_key,claim:version.interpretation.claim,conditions:version.interpretation.conditions}});
 const readingInput={...input,refs:input.refs.map(ref=>({...ref,fragments:ref.fragments.map((text,fragment_index)=>({fragment_index,text})),date_note:ref.published_at?'原文发布日期；与数据所属日期分开':'发布日期未知，不得用生成日或核查日补填'})),previous:input.previous?context(input.previous):null,related:input.related.filter(v=>v.interpretation.topic_key===input.topic_key).map(context)};
 const schema=JSON.parse(JSON.stringify(z.toJSONSchema(outputSchema)));
 schema.properties.article.properties.sections.items.required=['heading','paragraphs','refs','basis'];
 return JSON.stringify({task:'依据原文片段写一篇读者能直接阅读的财经文章，与旧观点比较，保持不同事件独立。', rules:[
 '只使用给出的原文片段，区分事实与推断；数字保留时间、单位与口径。经济预测是参与者有条件的预期，不是实际统计结果或政策承诺；利率预测中位数与当前目标区间分别说明。',
 '以具体事实和读者关心的含义开篇，再解释影响机制、成立条件和未知处。其他解释仅在材料支持时写；没有证据则alternatives为空数组。每个引用只用input.refs中的article_id，事实所在段落的section.refs就地列出依据。',
 '每段paragraphs都配一个同顺序的basis：kind为fact（原文事实）、inference（由原文推导且写清条件）或action（读者可以做什么）；refs逐项给article_id和从0起的fragment_index。basis长度必须等于paragraphs长度，所用ID同时列入section.refs。它是证据定位，不在正文展示类型标签。',
 'previous与related只承接旧主张和事件关系，不是当前事实来源。历史事件的具体年份、数字或政策措辞，只有其原文明确列入当前input.refs才可重述。旧稿中的错引、文案或结论不能当作官方原文，不必强行做两时点比较。',
 '片段没有提到某项安排，不能写成整份声明/报告没有该安排；改说这些材料不足以确定，并说明还需什么材料。来源发布日期未知时保留未知；数字的实际期/预测期、年末/全年、样本与单位要写清。',
 '基金份额、服务费、赎回与渠道只支持同方向工具的费用条件比较，不支持买入/追加/卖出的市场判断。分开写原有计划维护、临时新增和工具选择；费用低不等于应加仓。条件不足时给可查的条款与待补证据，不写条件都满足即可买。',
 '文章采用自然、简洁的现代中文；标题和小标题说清具体内容。避免机械单字缩写、宣传口号、拟人比喻、反复使用“不是……而是……”以及生硬的因果链标签。必要专业术语用日常语言解释。保留判断成立的条件，不用空泛免责声明替代分析。',
 '标题优先写核心变化，预测数字注明预测期；导语只保留理解结论必需的两至三个数字。不要把远期每年每项预测抄成一串，用一两个与判断有关的数说明。首次出现PCE等缩写就解释中文含义。直接讲经济事实，不写本文将/编辑旨在；不把温差、上车、转弯等比喻当分析。',
 '只标题摘要不足以分析；重复报道维持，不重新发布。新事实补充，关键条件或结论改变才修正。supplement必须逐字保持previous.interpretation.claim，只在article和机制/条件中补充；若主张实质变化用revise，不能仅为措辞变化造新版。',
 'topic_key与claim_key逐字沿用input值；related事件只作背景，不合并成同一事件。related_story_ids仅使用input.related中的story_id。previous_claim_version_ids仅使用previous.id或input.related中的id，无需引用时留空。',
 '已有事件保留previous.article.slug；有previous时changes.kind不能为initial。无previous的新事件用initial。文章写给普通读者，不介绍后台、生成、版本工程或产品演示。changes.summary具体说明新增证据怎样补充或修正判断。',
 '严格按schema返回article、interpretation、changes这三个顶层字段，不包裹output/result/data或markdown代码块。article.sections用2至4个段落组，paragraphs必须是字符串数组，read_minutes为整数。所有schema要求的数组即使为空也返回，不编造来源或ID。'
 ],schema,input:readingInput});
}
export function acceptComposition(input:ComposeInput,raw:unknown,now=new Date().toISOString()):FinanceVersion|null {
 if(input.previous && input.previous.story_id!==input.story_id)throw new Error('previous_version_must_belong_to_same_event');
 if(!input.refs.length||input.refs.some(r=>!r.fragments.length||!r.fragments.every(f=>f.trim())))throw new Error('original_evidence_required');
 const hash=inputHash(input.refs);if(input.previous?.input_hash===hash)return null;
 const parsed=outputSchema.safeParse(raw);if(!parsed.success)throw new Error('invalid_model_structure');
 const out=parsed.data;const valid=new Set(input.refs.map(r=>r.article_id));
 const used=[...out.interpretation.evidence_ids,...out.changes.evidence_ids,...out.interpretation.alternatives.flatMap(a=>a.evidence_ids),...out.article.sections.flatMap(s=>s.refs??[])];
 if(used.some(id=>!valid.has(id)))throw new Error('unknown_evidence_reference');
 const issue=compositionIssues(input.refs,out.article,out.interpretation).find(issue=>issue.severity==='error');
 if(issue)throw new Error(issue.code);
 if(out.interpretation.topic_key!==input.topic_key||out.interpretation.claim_key!==input.claim_key)throw new Error('unstable_topic_or_claim_key');
 const relatedIds=new Set(input.related.map(v=>v.story_id));const relatedVersions=new Set(input.related.map(v=>v.id));
 if(input.previous)relatedVersions.add(input.previous.id);
 if(out.interpretation.related_story_ids.some(id=>!relatedIds.has(id))||out.interpretation.previous_claim_version_ids.some(id=>!relatedVersions.has(id)))throw new Error('unknown_related_claim');
 if(input.previous && out.article.slug!==input.previous.article.slug)throw new Error('article_entry_must_remain_stable');
 if(input.previous&&out.changes.kind==='initial')throw new Error('existing_event_requires_comparison');
 if(!input.previous&&out.changes.kind!=='initial')throw new Error('new_event_requires_initial_version');
 if(out.changes.kind==='maintain')return null;
 if(input.previous&&out.changes.kind==='supplement'&&out.interpretation.claim!==input.previous.interpretation.claim)throw new Error('claim_change_requires_revision');
 return {id:randomUUID(),story_id:input.story_id,previous_version_id:input.previous?.id??null,version:(input.previous?.version??0)+1,as_of:input.refs.map(r=>r.data_as_of||r.published_at).filter(Boolean).sort().at(-1)??'',generated_at:now,input_hash:hash,input_refs:structuredClone(input.refs),...out,origin:'model',published_at:null};
}
