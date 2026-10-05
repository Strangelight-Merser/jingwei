import {READER_ACTION_OPERATION} from '../../industry/reader-action-operation.ts';
import {CSI300_READING_GUIDE} from '../../industry/csi300-reading-guide.ts';
import { EDITORIAL_COPY } from './editorial/copy-20261002.ts';
import type { FinanceVersion, SourceRef } from '../contracts/types.ts';
const lpr: SourceRef = { article_id:'lpr-20250520', revision:1, source:'中国人民银行 · 上海市委金融办转载', published_at:'2025-05-20T09:00:00+08:00', url:'https://jrj.sh.gov.cn/SCGK194/20250520/e608cbb9883548f0a02b0c90588d73ce.html', fragments:['2025年5月20日：1年期LPR为3.0%，5年期以上LPR为3.5%。'] };
const history: SourceRef = { article_id:'lpr-history-20250520', revision:1, source:'中国银行 · LPR历史报价', published_at:'2025-05-20T09:00:00+08:00', url:'https://www.bankofchina.com/fimarkets/lilv/fd32/201310/t20131031_2591219.html', fragments:['2025-04-21：1年期3.10%，5年期以上3.60%；2025-05-20：1年期3.00%，5年期以上3.50%。'] };
const mortgage: SourceRef = { article_id:'boc-repricing-20241031', revision:1, source:'中国银行', published_at:'2024-10-31T00:00:00+08:00', url:'https://www.boc.cn/pbservice/bi2/202410/t20241031_25186010.html', fragments:['适用范围为该行发放的以LPR浮动利率定价的商业性个人住房贷款。','调整后的重定价周期可选择3个月、6个月或12个月；同一笔贷款存续期内客户仅可申请调整1次。'] };
const june: SourceRef = { article_id:'lpr-20250620', revision:1, source:'全国银行间同业拆借中心', published_at:'2025-06-20T09:00:00+08:00', url:'https://www.chinamoney.com.cn/chinese/rdgz/20250620/3136683.html', fragments:['2025年6月20日：1年期LPR为3.0%，5年期以上LPR为3.5%。'] };
const gdp: SourceRef = { article_id:'nbs-2025-annual', revision:1, source:'国家统计局', published_at:'2026-01-19T10:00:00+08:00', url:'https://www.stats.gov.cn/sj/zxfb/202601/t20260119_1962330.html', fragments:['初步核算，2025年全年GDP按不变价格计算比上年增长5.0%；分季度同比增长5.4%、5.2%、4.8%、4.5%。','全年社会消费品零售总额比上年增长3.7%，12月份同比增长0.9%；全年服务零售额增长5.5%。','全年固定资产投资（不含农户）同比下降3.8%；扣除房地产开发投资下降0.5%。','GDP及其分类项目增长速度按不变价计算；其他指标除特殊说明外按现价计算。'] };
const fed: SourceRef = { article_id:'fomc-20250917', revision:1, source:'Federal Reserve', published_at:'2025-09-17T14:00:00-04:00', url:'https://www.federalreserve.gov/newsevents/pressreleases/monetary20250917a.htm', fragments:['联邦基金利率目标区间下调0.25个百分点至4.00%—4.25%。','就业下行风险上升，通胀有所上行且仍偏高。（声明译述）','委员会继续缩减国债、机构债与机构住房抵押贷款支持证券持有量。（声明译述）'] };
const timestamp = '2026-10-02T03:30:00Z';
function version(id: string, story: string, refs: SourceRef[], article: FinanceVersion['article'], claim: string, topic: string, claimKey: string, conditions: string[], related: string[] = []): FinanceVersion {
 return { id, story_id:story, previous_version_id:null, version:1, as_of:refs.map(r=>r.published_at).sort().at(-1)!, generated_at:timestamp, input_hash:'', input_refs:refs, article, interpretation:{ topic_key:topic, claim_key:claimKey, claim, evidence_ids:refs.map(r=>r.article_id), mechanism:[], conditions, alternatives:[], related_story_ids:related, previous_claim_version_ids:[] }, changes:{ kind:'initial', summary:'依据公开资料进行编辑整理。', evidence_ids:refs.map(r=>r.article_id) }, origin:'editor', published_at:timestamp };
}
function article(slug:string,category:string,kind:FinanceVersion['article']['kind'],decorations:Array<{refs?:string[];chart?:FinanceVersion['article']['sections'][number]['chart']}>):FinanceVersion['article'] {
 const copy=EDITORIAL_COPY[slug];return {slug,category,kind,title:copy.title,deck:copy.deck,read_minutes:copy.read_minutes,sections:copy.sections.map((section,i)=>({...section,...decorations[i]}))};
}
export const SEED:FinanceVersion[] = [
 version('fv-lpr-may-1','lpr-may-2025',[lpr,history,mortgage],article('lpr-and-your-loan','货币政策','analysis',[{refs:['lpr-20250520','lpr-history-20250520'],chart:'rates'},{refs:['boc-repricing-20241031'],chart:'transmission'}]),EDITORIAL_COPY['lpr-and-your-loan'].claim,'rate-transmission','financing-cost-transmission',['采用对应LPR品种定价','银行加点及其他费用未抵消降幅','合同进入重定价期']),
 version('fv-lpr-june-1','lpr-june-2025',[june,lpr],article('lpr-june-unchanged','货币政策','analysis',[{refs:['lpr-20250620','lpr-20250520'],chart:'lpr-comparison'}]),EDITORIAL_COPY['lpr-june-unchanged'].claim,'rate-transmission','financing-cost-transmission',['需要同口径新发放贷款利率','观察重定价进度与借款需求'],['lpr-may-2025']),
 version('fv-mortgage-1','mortgage-mechanism',[mortgage],article('what-is-repricing','背景解释','background',[{},{refs:['boc-repricing-20241031'],chart:'transmission'}]),EDITORIAL_COPY['what-is-repricing'].claim,'rate-transmission','financing-cost-transmission',['限定于适用的浮动利率合同']),
 version('fv-gdp-2025-1','gdp-2025-annual',[gdp],article('growth-and-demand-2025','宏观经济','analysis',[{refs:['nbs-2025-annual'],chart:'gdp'},{refs:['nbs-2025-annual']},{refs:['nbs-2025-annual']}]),EDITORIAL_COPY['growth-and-demand-2025'].claim,'domestic-demand','demand-recovery',['需要保持统计口径一致','初步核算可能被后续修订']),
 version('fv-fed-202509-1','fed-september-2025',[fed],article('fed-september-2025','海外观察','analysis',[{refs:['fomc-20250917']},{refs:['fomc-20250917']}]),EDITORIAL_COPY['fed-september-2025'].claim,'global-rates','fed-balance-of-risks',['后续路径取决于就业与通胀数据']),
 {...READER_ACTION_OPERATION,id:'fv-csi300-editorial-seed-1',version:1,previous_version_id:null,changes:{...READER_ACTION_OPERATION.changes,kind:'initial',summary:'首次整理当前官方资料、费用适用条件与研究判断。'}},
 CSI300_READING_GUIDE
];
