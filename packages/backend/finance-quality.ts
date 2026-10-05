import type {Article,Interpretation,SourceRef} from '../contracts/types.ts';

export type CompositionIssue={code:string;path:string;detail:string;severity:'error'|'review'};
const years=(text:string)=>[...new Set(text.match(/\b(?:19|20)\d{2}\b/g)??[])];
const dates=(text:string)=>[...new Set([...text.matchAll(/\b((?:19|20)\d{2})[年-](\d{1,2})[月-](\d{1,2})(?:日|(?=T)|\b)/g)].map(match=>`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`))];
const investmentAction=/(应当|应该|可以|值得|适合|建议|支持|因此|所以|据此).{0,10}(买入|加仓|增持|追加|开仓|减仓|卖出|继续持有)/;
const deniedAction=/(不能|不足以|不应|不宜|不支持|并不|不构成).{0,24}(买入|加仓|增持|追加|开仓|减仓|卖出|继续持有)/;
const feeMaterial=(ref:SourceRef)=>/基金|fund/i.test(ref.source+' '+ref.url)&&/费率|服务费|赎回|申购|redemption|subscription|management fee/i.test(ref.fragments.join(' '));
function validDate(value:string){
 if(!value)return true;
 if(!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))return false;
 const date=new Date(value),calendar=new Date(value.slice(0,10)+'T00:00:00Z');
 return Number.isFinite(date.valueOf())&&calendar.toISOString().slice(0,10)===value.slice(0,10);
}

// Small, inspectable checks for known mistakes. A valid binding does not prove entailment.
export function compositionIssues(refs:SourceRef[],article:Article,interpretation:Interpretation):CompositionIssue[]{
 const issues:CompositionIssue[]=[];
 const add=(code:string,path:string,detail:string,severity:'error'|'review'='error')=>issues.push({code,path,detail,severity});
 const sources=new Map(refs.map(ref=>[ref.article_id,ref]));
 for(const ref of refs)for(const field of ['published_at','data_as_of'] as const)if(ref[field]&&!validDate(ref[field]!))add('invalid_evidence_date',`input_refs.${ref.article_id}.${field}`,'来源日期不是有效ISO日期；未知日期须留空。');
 const checkYears=(text:string,fragments:string[],path:string)=>{
  const available=new Set(years(fragments.join(' ')));
  const missing=years(text).filter(year=>!available.has(year));
  if(missing.length)add('evidence_year_mismatch',path,`句中年份${missing.join('、')}未出现在所绑定的原文片段；需补原文或收窄表述。`);
  const availableDates=new Set(dates(fragments.join(' '))),missingDates=dates(text).filter(date=>!availableDates.has(date));
  if(missingDates.length)add('evidence_date_mismatch',path,`具体日期${missingDates.join('、')}未见于所绑定片段或来源日期，不得以生成/核查日期补填。`);
 };
 const checkAction=(text:string,ids:string[],path:string)=>{
  if(!deniedAction.test(text)&&investmentAction.test(text)&&ids.length&&ids.every(id=>sources.has(id)&&feeMaterial(sources.get(id)!)))add('fund_terms_cannot_support_market_action',path,'基金费用/赎回材料不能单独支持市场买卖方向。');
 };
 checkYears(article.title+' '+article.deck,refs.flatMap(ref=>[...ref.fragments,ref.published_at,ref.data_as_of??'']),'article.title/deck');
 checkAction(interpretation.claim,interpretation.evidence_ids,'interpretation.claim');
 for(const [sectionIndex,section] of article.sections.entries()){
  const sectionPath=`article.sections[${sectionIndex}]`;
  if(!section.refs?.length)add('missing_section_evidence',sectionPath+'.refs','段落组没有就地原文来源。');
  if(!section.basis||section.basis.length!==section.paragraphs.length)add('missing_paragraph_basis',sectionPath+'.basis','每段需逐一标明事实/推断/行动与原文片段位置。');
  for(const [paragraphIndex,text] of section.paragraphs.entries()){
   const path=`${sectionPath}.paragraphs[${paragraphIndex}]`,basis=section.basis?.[paragraphIndex];
   const fragments:string[]=[];const ids:string[]=[];
   if(basis){
    if(!basis.refs.length)add('missing_paragraph_evidence',path,'这段没有分析所依据的原文片段。');
    for(const binding of basis.refs){
     const source=sources.get(binding.article_id);
     if(!source||!Number.isInteger(binding.fragment_index)||binding.fragment_index<0||binding.fragment_index>=source.fragments.length){add('invalid_fragment_reference',path,'绑定的来源或原文片段位置不存在。');continue;}
     if(!section.refs?.includes(binding.article_id))add('section_evidence_binding_mismatch',path,'段落片段来源没有在就地refs中列出。');
     fragments.push(source.fragments[binding.fragment_index],source.published_at,source.data_as_of??'');ids.push(binding.article_id);
    }
   }else for(const id of section.refs??[]){const source=sources.get(id);if(source){fragments.push(...source.fragments,source.published_at,source.data_as_of??'');ids.push(id);}}
   if(!basis||basis.kind==='fact')checkYears(text,fragments,path);
   if(basis?.kind==='action')checkAction(text,ids,path);
   if(/声明没有|报告没有|原文没有|未预设/.test(text))add('absence_claim_needs_full_text',path,'选段未提到不能证明整份原文没有；需核对全文或改说这些材料不足以确定。','review');
   if(/本文将|本文旨在|本篇将|我们将|编辑将为|系统将为|模型生成|因果链标签/.test(text))add('editorial_self_description',path,'正文应直接讲事实与含义，避免介绍编辑或生成过程。','review');
  }
 }
 return issues;
}
