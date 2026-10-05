import {MARKET_OPERATION} from './market-operation.ts';
import type {FinanceVersion,SourceRef} from '../packages/contracts/types.ts';
const feeRefs:SourceRef[]=[
 {
  "article_id": "csrc-fund-sales-fees-rule-20251231",
  "revision": 1,
  "source": "证监会 · 2025年第22号公告及正式附件",
  "published_at": "2025-12-31",
  "checked_at": "2026-10-02",
  "url": "https://www.csrc.gov.cn/csrc/c101954/c7606091/content.shtml",
  "fragments": [
   "新规自2026年1月1日施行；存量不符基金有12个月完成调整和系统、文件、销售协议改造。",
   "第11条指数型基金销售服务费上限0.2%/年，非豁免基金持续持有超过一年停止收取。具体基金的渠道、生效与类别安排仍需实施公告。",
   "第7条管理人直销其管理基金不收认申购费和销售服务费；第10条个人指数基金满7日可另行约定赎回费。"
  ]
 },
 {
  "article_id": "efund-csi300-summary-20260811",
  "revision": 1,
  "source": "易方达基金 · C类产品资料概要",
  "published_at": "2026-08-11",
  "url": "https://cdn.efunds.com.cn/owch/data/bulletin/20260811/%E6%98%93%E6%96%B9%E8%BE%BE%E6%B2%AA%E6%B7%B1300%E4%BA%A4%E6%98%93%E5%9E%8B%E5%BC%80%E6%94%BE%E5%BC%8F%E6%8C%87%E6%95%B0%E5%8F%91%E8%B5%B7%E5%BC%8F%E8%AF%81%E5%88%B8%E6%8A%95%E8%B5%84%E5%9F%BA%E9%87%91%E8%81%94%E6%8E%A5%E5%9F%BA%E9%87%91%EF%BC%88%E6%98%93%E6%96%B9%E8%BE%BE%E6%B2%AA%E6%B7%B1300ETF%E8%81%94%E6%8E%A5C%EF%BC%89%E5%9F%BA%E9%87%91%E4%BA%A7%E5%93%81%E8%B5%84%E6%96%99%E6%A6%82%E8%A6%81%E6%9B%B4%E6%96%B020260810205302.pdf",
  "fragments": [
   "2026年8月11日送出概要仍列C类销售服务年费率0.20%，不足7日赎回1.50%、满7日0，综合年化测算0.40%。",
   "概要未单列2026新规实施日、直销代销和超过一年停止计提安排，文件提醒可能滞后。"
  ],
  "checked_at": "2026-10-02"
 },
 {
  "article_id": "chinaamc-csi300-summary-20260529",
  "revision": 1,
  "source": "华夏基金 · C类产品资料概要",
  "published_at": "2026-05-29",
  "url": "https://www.chinaamc.com/upload/resources/file/2026/05/29/cf23b2cbebf8451980704856553c4147.pdf",
  "fragments": [
   "2026年5月29日送出概要列C类销售服务合同年费率0.30%、不含优惠，赎回不足7日1.50%、满7日0，综合年化测算0.50%。",
   "概要可能滞后；基金具体费改实施日、渠道和持有超过一年收费安排未核实。"
  ],
  "checked_at": "2026-10-02"
 }
];
export const FEE_AWARE_OPERATION:FinanceVersion=structuredClone(MARKET_OPERATION);
const v=FEE_AWARE_OPERATION,view=v.article.operation_view!;
v.id='fv-csi300-fee-aware-20261002';v.version=4;v.published_at=null;
v.input_refs=[...v.input_refs.filter(r=>!feeRefs.some(n=>n.article_id===r.article_id)),...feeRefs];
v.article.title='沪深300：估值倍数回落，临时追加先观察';
v.article.deck='9月末PE、PB低于去年底；沪市利润增长提供旁证，沪深300同样本盈利仍未核对。原配置条件成立时维持计划，临时新增先观察。两只联接基金的旧费率须结合2026费改、渠道和持有期重核。';
view.method_version='editorial-evidence-and-conditions-20261002';view.fee_regulation=feeRefs[0];
view.unheld.text='临时起意的新资金先观察。已决定长期配置沪深300的计划内资金，将007339、005658作为同方向工具比较；核清份额、渠道和持有期收费规则后执行原计划，不据旧年费确定长期优先级。';
view.reason='9月30日沪深300滚动PE13.15倍、PB1.36倍，均低于去年底，但未取得长期分位和同样本盈利。沪市半年报净利增长17.6%仅是上市公司旁证，不能写成沪深300盈利已改善。原配置条件仍成立时维持计划，临时追加继续观察；费用规则影响工具选择，不能改变市场方向。';
view.counterargument='沪市扣非利润也增长、9月订单仍在扩张区间，等待所有证据齐全可能错过结构性修复，既定计划不必等完美买点。反过来，倍数下降可能反映盈利前景变弱；PE还剔除亏损股票。缺少指数同样本盈利，既不能直接称便宜，也不能据此减仓。旧概要费率差异亦不能证明长期成本排序。';
for(const f of view.funds){
 f.role='同方向工具候选；实际收费条件待核';
 f.fee_holding_terms='2026费改要求持续持有超过一年停止销售服务费；本基金具体实施与起算安排未核实';
 f.fee_channel_scope='概要合同费率未分渠道；直销、代销实际安排未核实';
 f.fee_effective_from='未核实';f.fee_announcement='本次有限核查未取得对应实施公告，不代表尚未实施';
 f.field_checked_at={trade_status:'2026-10-02'};
 f.fee_context={share_class:'C',investor_scope:'个人投资者；其他范围未核对',channel_scope:f.fee_channel_scope,effective_from:null,holding_terms:f.fee_holding_terms,announcement:null,checked_at:'2026-10-02',verification:'implementation_unverified',unverified:['具体费改生效日','持续持有期起算与存量份额安排','直销和代销收费','ETF联接在本条新规中的具体适用安排']};
}
view.comparison_note='收益来自2026上半年官方报告。各自基准不同，期间差额不是年化跟踪误差。费用数字分别是8月11日、5月29日概要中的合同年费率与综合运作测算，不能线性外推5年、10年或据此算换仓回本期。2026费改涉及持有超过一年停止销售服务费、渠道差异和存量调整窗口；两只具体实施日与适用安排尚未核实。保留概要快照，不承诺当前渠道或未来持续收费；目标ETF费用亦不得重复计提。';
view.gaps=['两只基金费改实施公告、生效日、持有期起算、具体渠道及适用安排','沪深300同样本盈利与长期估值分位','华夏当日赎回状态和可比年化跟踪误差','A/C份额与渠道的期限内实际总成本'];
view.change_conditions=view.change_conditions.map(t=>t.includes('用途、原配置')?'用途、原仓位范围或长期依据改变时，持有条件不成立。费率、持有期、渠道、生效日或实施公告变化时另行复核工具；不由费率变化自动修改市场动作。':t);
const original=v.article.sections;
v.article.sections=original.map(s=>s.heading==='盈利修复，有上市公司材料支持'?{...s,heading:'沪市利润修复，是旁证而非指数盈利'}:s.heading==='先分清配置判断，再选择基金'?{...s,paragraphs:[view.held.text,view.unheld.text,'两只都是沪深300方向的联接工具，不提供新的市场分散。当前材料尚未完成沪深300同样本盈利桥接，持与观察保持原配置边界；本次费用纠正只改变工具比较的适用条件。','两份已读概要分别列销售服务年费率0.20%、0.30%，综合运作年费率测算0.40%、0.50%。这些是对应文档日期的费用快照，不是同渠道、同持有期限下未来持续收取的承诺；不能算成每万元永久每年省10元，更不能据此推算15年费用回本。','已有005658，不因旧概要里微小费差直接换仓。新资金先核对预计期限、A/C份额及购买渠道，再比该期限内适用成本；费用差异不抵消指数风险，也不替代市场判断。']}:s.heading==='下次资料来了，哪些条件要重评'?{...s,paragraphs:[...view.change_conditions,'10月1日至7日上交所休市，10月8日起开市；9月30日是当前最近交易日，不伪造假期净值或今日行情。核查失败时保留旧资料和原判断，标记待复核，不将数据失败当成市场观察信号。','本研究采用编辑证据与条件比较，没有加入20/60均线策略或自动择时。当前价格与估值、基金页面明确字段可免费核查；盈利与需求的同口径桥接仍需编辑工作。'],refs:[...(s.refs??[]),'sse-holiday-20260917']}:s);
v.article.sections.splice(4,0,{heading:'费率新规，改变了长期比较的前提',paragraphs:['证监会新规自2026年1月1日施行，对不符规定的已发售基金给出12个月调整期。一般规定中，指数型基金销售服务费上限为0.2%/年；除规定豁免的基金外，持续持有期限超过一年不得继续收取销售服务费，管理人直销也有不同收费要求。这里的边界是“超过一年”，不是“满一年”。','两只ETF联接的产品概要列基金中基金，具体费改类别、渠道、生效与存量安排仍须基金公司材料确认。本次有限官网核查未取得对应实施公告，不能说尚未实施，也不能仅拿华夏旧0.30%直接判定违规。网页数字和一般法规分别记录。','个人指数型基金持有满7日的赎回费允许另行约定，不能把新规一般赎回费阶梯机械套给这两只。现有概要的满7日零费仍保留为对应日期记录，未来执行以具体生效安排和渠道为准。'],refs:feeRefs.map(r=>r.article_id)});
const holiday:SourceRef={article_id:'sse-holiday-20260917',revision:1,source:'上海证券交易所 · 中秋节、国庆节休市公告',url:'https://www.sse.com.cn/disclosure/announcement/general/c/c_20260915_10832273.shtml',published_at:'2026-09-17',checked_at:'2026-10-02',fragments:['2026年10月1日至7日休市，10月8日起照常开市；9月25日至27日中秋节休市。']};v.input_refs.push(holiday);
v.interpretation.claim='沪深3009月末PE、PB低于去年底，但未证实同样本盈利改善或历史低估。原长期配置条件成立时持，临时新增观察。007339与005658为同方向工具候选；费改生效、渠道和持有期未核清，不据旧年费给长期优先级，也不因小费差换仓。';
v.interpretation.conditions=v.interpretation.conditions.map(c=>c.includes('007339费用优势')?'工具比较须核清份额、渠道、持续持有期与费用实施公告；费用变化不直接修改市场动作':c);
v.interpretation.evidence_ids=v.input_refs.map(r=>r.article_id);
v.changes={kind:'revise',summary:'收窄盈利措辞，纠正旧年费长期推算与无条件工具排序；按2026费改补入渠道、持有期、生效日及公告待核项。持有/观察的市场动作保持原条件。',evidence_ids:[...feeRefs.map(r=>r.article_id),'sse-holiday-20260917']};
