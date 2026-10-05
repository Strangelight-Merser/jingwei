import {FEE_AWARE_OPERATION} from './fee-aware-operation.ts';
import type {FinanceVersion,SourceRef} from '../packages/contracts/types.ts';

const efundA:SourceRef={article_id:'efund-csi300-a-summary-20260811',revision:1,source:'易方达基金 · A类产品资料概要',published_at:'2026-08-11',checked_at:'2026-10-03',url:'https://cdn.efunds.com.cn/owch/data/bulletin/20260811/易方达沪深300交易型开放式指数发起式证券投资基金联接基金（易方达沪深300ETF联接A）基金产品资料概要更新.pdf',fragments:['2026年8月10日编制、8月11日送出；A类代码110020。普通申购金额不足100万元1.20%，100万至不足500万元0.80%，500万至不足1000万元0.20%，不少于1000万元每笔1000元；不据特定群体档位假定普通渠道优惠。','A类持有不足7天赎回1.50%，7—364天0.50%，365—729天0.25%，730天及以上0。A类不收销售服务费。','管理费0.15%、托管费0.05%；基金持有目标ETF的部分不重复计提这两项费用。概要的综合年化费用是测算，交易费用和税负按实际发生扣除。']};
const chinaA:SourceRef={article_id:'chinaamc-csi300-prospectus-20260529',revision:1,source:'华夏基金 · 招募说明书费用条款',published_at:'2026-05-29',checked_at:'2026-10-03',url:'https://www.chinaamc.com/upload/resources/file/2026/05/29/a87a41e0ec074fa1bb88aed07257bdba.pdf',fragments:['A类000051前端申购：不足100万元1.20%，100万至不足500万元0.90%，500万至不足1000万元0.60%，不少于1000万元每笔1000元。销售机构可优惠，实际渠道折扣未核实。','A类持有不足7天赎回1.50%，7天至不足1年0.50%，满1年0；C类不收申购费，不足7天赎回1.50%，满7天0。A类不收销售服务费。','管理费、托管费对基金资产扣除目标ETF投资部分后计提。费用比较需结合份额、持有期和适用渠道，不能将概要综合费用当实际全成本保证。']};

export const READER_ACTION_OPERATION:FinanceVersion=structuredClone(FEE_AWARE_OPERATION);
const v=READER_ACTION_OPERATION,o=v.article.operation_view!;
v.id='fv-csi300-reader-action-20261003';v.version=5;v.as_of='2026-10-03';v.published_at=null;
o.reviewed_on='2026-10-03';o.method_version='editorial-evidence-and-conditions-20261003';
o.held.text='已有长期沪深300配置计划，仓位、资金用途和原依据未变时，维持原计划。不凭一项旧费差换基金，换仓还要考虑赎回、申购费用和资金间隔中的波动。';
o.unheld.text='不因单条利润利好临时开仓或追加。没有长期配置计划时，“持”不能作为首次买入指引；首次配置指导尚未完成。';
const nextWatch='接下来，看沪深300同样本盈利与对应日期的估值、需求改善是否扩散，以及基金渠道、持有起算和收费生效公告；这些材料分别影响追加依据和选基金比较。';
o.next_watch=nextWatch;
o.counterargument=o.counterargument.replace('；PE还剔除亏损股票','');
v.article.deck='9月末PE、PB低于去年底，沪深300同样本盈利仍未核对。本期不凭单条利润利好临时追加，也不凭旧单项费差换基金；已有配置者按原条件维护，首次配置指导尚未完成。';
v.input_refs=[...v.input_refs,efundA,chinaA];
for(const r of v.input_refs){
 if(r.article_id==='efund-csi300-summary-20260811'){
  r.checked_at='2026-10-03';r.fragments=['C类007339概要于2026年8月10日编制、8月11日送出：申购费0，销售服务年费率0.20%，持有不足7天赎回1.50%，满7天0。','管理费0.15%、托管费0.05%，对目标ETF投资部分不重复计提；综合运作年化0.40%为概要测算，不能当实际全成本或多年持续收费保证。','本基金具体费改生效、存量衔接、渠道及超过一年停止计提安排仍未核实。'];
 }
 if(r.article_id==='chinaamc-csi300-summary-20260529'){
  r.checked_at='2026-10-03';r.fragments=['C类005658概要于2026年5月28日编制、5月29日送出：申购费0，销售服务年费率0.30%，不足7天赎回1.50%，满7天0。','管理费0.15%、托管费0.05%，计提基数扣除目标ETF投资部分；综合运作年化0.50%仅概要测算，实际渠道优惠与费用执行条件未核齐。','本基金具体费改生效、存量衔接及超过一年免收的落地安排仍未核实，资料送出日不等于收费生效日。'];
 }
}
for(const f of o.funds){
 f.subscription='0（C类，按所列日期资料）';f.redemption='不足7天1.50%；满7天0（不是推荐持有期限）';
 f.a_class=f.code==='007339'?{code:'110020',service:'0',subscription:'不足100万元1.20%；100万—不足500万元0.80%；500万—不足1000万元0.20%；不少于1000万元1000元/笔',redemption:'不足7天1.50%；7—364天0.50%；365—729天0.25%；730天及以上0',document_date:'2026-08-11',source_ref_id:efundA.article_id}:{code:'000051',service:'0',subscription:'不足100万元1.20%；100万—不足500万元0.90%；500万—不足1000万元0.60%；不少于1000万元1000元/笔',redemption:'不足7天1.50%；7天—不足1年0.50%；满1年0',document_date:'2026-05-29',source_ref_id:chinaA.article_id};
}
o.comparison_note='C类概要分别送出于2026-08-11、2026-05-29；A类条款按表内原文日期记录，不代表收费生效日。若适用期间、渠道和规则一致，两C类名义销售服务年费率相差0.10个百分点；实际成本仍需核对。不能一律按“长期A、短期C”选择：易方达A在365—729天仍收0.25%赎回费，华夏A满1年为0；申购档位与渠道优惠也不同，不假定一折。管理/托管仅对扣除目标ETF后的资产计提，0.40%/0.50%为概要综合运作测算，不是实际全成本保证。换仓另有赎回、申购和间隔波动。同期收益使用各自基准，差额不是可比跟踪误差。';
o.gaps=o.gaps.map(g=>g==='A/C份额与渠道的期限内实际总成本'?'实际渠道折扣与所选持有期间的总成本':g);
v.article.sections=v.article.sections.map(s=>s.heading==='先分清配置判断，再选择基金'?{...s,paragraphs:[o.held.text,o.unheld.text,nextWatch,'007339与005658跟踪同一个方向，同时持有不增加方向分散。按各自日期概要，C类服务费0.20%与0.30%；在同一适用期间、渠道和规则下，名义差为0.10个百分点，尚不能据此给无条件优先。','A类也不能一概按长期零赎回费处理：易方达110020持有365—729天仍为0.25%，华夏000051满1年为0。普通申购档位与渠道优惠不同，现有比较不假定一折；具体条款见上方对照和原文。','0.40%与0.50%是概要综合运作测算；两家的管理、托管费均扣除目标ETF部分后计提，不能简单全年相加外推。换基金须同时看赎回、申购与资金间隔的风险。'],refs:[...new Set([...(s.refs??[]),'efund-csi300-summary-20260811','chinaamc-csi300-summary-20260529',efundA.article_id,chinaA.article_id])]}:s);
for(const section of v.article.sections)section.paragraphs=section.paragraphs.map(p=>p.replace('官网说明市盈率剔除亏损股票；',''));
v.interpretation.claim='沪深3009月末估值倍数低于去年底，同样本盈利未证实。已有长期计划且原条件未变时维持；不因单条利润利好临时追加，不凭旧单项费差换基金。首次配置指导尚未完成。两C类及同基金A类按原日期条款比较，实际渠道、费改生效与存量衔接未核齐，不作无条件排序。';
v.interpretation.evidence_ids=v.input_refs.map(r=>r.article_id);
v.changes={kind:'revise',summary:'补清本期可参考动作、首次配置范围与后续材料，加入A类条款及目标ETF计提说明；删除未证实适用于该指数接口的PE口径陈述。市场持/观察及未排序状态不变。',evidence_ids:['efund-csi300-summary-20260811','chinaamc-csi300-summary-20260529',efundA.article_id,chinaA.article_id]};

// The retrieved index values do not verify a particular valuation calculation method.
for(const ref of [...v.input_refs,...(o.market?[o.market.source]:[])]){
 ref.fragments=ref.fragments.map(fragment=>fragment.replace('市盈率计算剔除亏损股票；净资产采用最新一期财报。',''));
 if(ref.display_fragments)ref.display_fragments=ref.display_fragments.map(fragment=>fragment.replace('市盈率计算剔除亏损股票；净资产采用最新一期财报。',''));
}
