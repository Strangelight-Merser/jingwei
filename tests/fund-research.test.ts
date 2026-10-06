import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildResearchSnapshot,evaluateResearchSnapshot,composeFundResearch,fundResearchPrompt,type ResearchEvidence} from '../packages/backend/fund-research.ts';
import type {FundSnapshot} from '../packages/backend/fund-updates.ts';
import {FUND_STORY_ID} from '../packages/backend/fund-updates.ts';
import type {SourceRef} from '../packages/contracts/types.ts';
import {SEED} from '../packages/backend/seed.ts';
import {fundResearchFixture} from './helpers/fund-research-output.ts';

const captured_at='2026-10-05T10:00:00Z';
const source=(code:string,field:string,value:string):SourceRef=>({article_id:`fund-${code}-${field}`,revision:1,source:'官方基金产品字段',url:`https://example.com/${code}`,published_at:'',checked_at:captured_at,fragments:[`${code} ${field} = ${value}，本字段核查不代表费用全部适用条件已核实。`]});
function evidence():ResearchEvidence {
 const funds:FundSnapshot[]=(['007339','005658'] as const).map((code,i)=>({code,checked_at:captured_at,fields:{management:{value:'0.15%',source:source(code,'management','0.15%')},custody:{value:'0.05%',source:source(code,'custody','0.05%')},service:{value:i?'0.30%':'0.20%',source:source(code,'service',i?'0.30%':'0.20%')},trade_status:{value:'申购、赎回开放',source:source(code,'trade_status','申购、赎回开放')}}}));
 return {captured_at,refs:[],funds,errors:[],market:{index_code:'000300',index_name:'沪深300',checked_at:captured_at,as_of:'2026-09-30',close:4000,valuation:{as_of:'2026-09-30',pe_static:12,pe_ttm:13,pb:1.2,dividend_yield_pct:3,prior_year_end:{pe_static:13,pe_ttm:14,pb:1.3}},daily:[{date:'2026-09-29',open:3950,high:3990,low:3920,close:3950,price_change:0,price_change_pct:0,pe_ttm:12.9},{date:'2026-09-30',open:3990,high:4010,low:3980,close:4000,price_change:50,price_change_pct:1.26,pe_ttm:13}],sources:[{kind:'daily',url:'https://www.csindex.com.cn/daily',as_of:'2026-09-30'}],warnings:[],hash:'test-hash'},fund_series:[{code:'007339',nav:[{date:'2026-09-28',nav:1},{date:'2026-09-29',nav:1.1},{date:'2026-09-30',nav:1.05}],ref:{article_id:'nav-a',revision:1,source:'官方净值',url:'https://example.com/nav-a',published_at:'',data_as_of:'2026-09-30',fragments:['007339 单位净值 2026-09-28 1；2026-09-29 1.1；2026-09-30 1.05。']}},{code:'005658',nav:[{date:'2026-09-29',nav:2},{date:'2026-09-30',nav:2.04}],ref:{article_id:'nav-b',revision:1,source:'官方净值',url:'https://example.com/nav-b',published_at:'',data_as_of:'2026-09-30',fragments:['005658 单位净值 2026-09-29 2；2026-09-30 2.04。']}}]};
}

test('同证据核查时间与单源错误不改变付费hash；实际字段/净值变化改变hash',()=>{
 const a=evidence(),s=buildResearchSnapshot(a),b=structuredClone(a);b.captured_at='2026-10-06T10:00:00Z';b.errors=['007339:fetch failed'];b.funds.reverse();b.funds.forEach(f=>f.checked_at=b.captured_at);
 assert.equal(s.evidence_hash,buildResearchSnapshot(b).evidence_hash);
 b.funds[0].fields.service!.value='0.40%';assert.notEqual(s.evidence_hash,buildResearchSnapshot(b).evidence_hash);
});
test('确定性指标保留净值口径、共同日期和单项销售服务费，不相加管理托管费用',()=>{
 const e=evaluateResearchSnapshot(buildResearchSnapshot(evidence()));
 assert.equal(e.metrics.find(m=>m.key==='listed_service_fee_difference_pct')!.value,0.1); // sorted code005658 minus007339
 assert.ok(e.metrics.every(m=>!m.key.includes('recurring_fee')));
 assert.equal(e.metrics.find(m=>m.key==='same_date_nav_change_difference_pct')!.value,6.545455); // sorted005658 minus007339 on9/29-9/30
 assert.match(e.metrics.find(m=>m.key==='same_date_nav_change_difference_pct')!.label,/非含分红/);
 assert.equal(e.metrics.find(m=>m.key==='007339_nav_window_drawdown_pct')!.value,-4.545455);
 assert.equal(e.evaluability.new_money.status,'not_assessable');assert.equal(e.evaluability.comparison.status,'partial');assert.equal(e.evaluability.held.status,'partial');
});
test('休市/长时间没有新数据保留实际日期；同日官方修订触发检查',async()=>{
 const s=buildResearchSnapshot(evidence()),v=await composeFundResearch(s,null,async input=>fundResearchFixture(input));assert.ok(v);
 const late={...s,captured_at:'2026-11-05T10:00:00Z'};assert.equal(evaluateResearchSnapshot(late,v).checks.market_available.status,'not_triggered');assert.equal(evaluateResearchSnapshot(late,v).checks.market_changed.status,'not_triggered');
 const revised=structuredClone(s);revised.market!.close=4001;assert.equal(evaluateResearchSnapshot(revised,v).checks.market_changed.status,'triggered');
});
test('暂停赎回和费用变化能触发工具复核，不制造卖出阈值',async()=>{
 const s=buildResearchSnapshot(evidence()),v=await composeFundResearch(s,null,async input=>fundResearchFixture(input));assert.ok(v);
 const next=evidence();next.funds[0].fields.trade_status={value:'申购开放，赎回暂停',source:source('007339','trade_status','申购开放，赎回暂停')};next.funds[0].fields.service={value:'0.25%',source:source('007339','service','0.25%')};
 const e=evaluateResearchSnapshot(buildResearchSnapshot(next),v);assert.equal(e.checks.trade_restriction.status,'triggered');assert.equal(e.checks.fee_terms_changed.status,'triggered');assert.equal(e.evaluability.sell.status,'partial');assert.equal(e.checks.user_plan_known.status,'not_assessable');
});
test('生成真正研究版本和当前operation_view，保护旧稿并同输入费用前跳过',async()=>{
 const s=buildResearchSnapshot(evidence()),old=structuredClone(SEED.filter(v=>v.story_id===FUND_STORY_ID).at(-1)!);const before=JSON.stringify(old);let calls=0;
 const v=await composeFundResearch(s,old,async input=>{calls++;return fundResearchFixture(input);});assert.ok(v);assert.equal(v.version,old.version+1);assert.equal(v.previous_version_id,old.id);assert.equal(v.origin,'model');assert.equal(v.published_at,null);assert.equal(v.as_of,'2026-09-30');assert.equal(v.research.data_status,'partial');assert.equal(v.article.operation_view!.held.action,'无法评估');assert.equal(v.article.operation_view!.funds[0].tracking_error,'未取得本次证据');assert.equal(JSON.stringify(old),before);
 assert.equal(await composeFundResearch(s,v,async()=>{calls++;throw new Error('must not call');}),null);assert.equal(calls,1);
});
test('维持不造新版；模型失败不修改旧日期或版本',async()=>{
 const s=buildResearchSnapshot(evidence()),v=await composeFundResearch(s,null,async input=>fundResearchFixture(input));assert.ok(v);const next=evidence();next.funds[0].fields.service!.value='0.25%';const changed=buildResearchSnapshot(next),before=JSON.stringify(v);
 assert.equal(await composeFundResearch(changed,v,async input=>fundResearchFixture(input,'maintain')),null);
 await assert.rejects(composeFundResearch(changed,v,async()=>{throw new Error('fixture_failure');}),/fixture_failure/);assert.equal(JSON.stringify(v),before);
});
test('缺数据不会变观察；拒绝假数字、未知片段、未经核查条件及固定止损',async()=>{
 const s=buildResearchSnapshot(evidence());
 for(const [mutate,error]of [
  [(raw:any)=>raw.research.new_money.stance='observe','missing_data_is_not_investment_stance'],
  [(raw:any)=>raw.research.candidates[0].differences=['费用为999%'],'unsupported_research_number'],
  [(raw:any)=>raw.research.conditions[0].refs=[{article_id:s.refs[0].article_id,fragment_index:999}],'invalid_research_fragment'],
  [(raw:any)=>raw.research.conditions[0].status='triggered','unchecked_research_condition'],
  [(raw:any)=>raw.research.conditions[0].rule={metric:'close',operator:'lt',value:3000},'unsupported_numeric_investment_rule'],
  [(raw:any)=>raw.research.direction.summary='根据现有行情，沪深300市盈率为13%，该口径已有原文。','unsupported_research_unit'],
  [(raw:any)=>raw.research.direction.summary='沪深300必涨，所以投资者应该直接买入。','unsupported_research_certainty'],
  [(raw:any)=>raw.research.candidates[0].summary='该基金实际成本更低，可省去进一步核查。','unverified_actual_fund_cost']
 ] as const)await assert.rejects(composeFundResearch(s,null,async input=>{const raw=fundResearchFixture(input);mutate(raw);return raw;}),new RegExp(error));
});
test('已有计划的公开条件维护必须说明前提，不能变成未知持仓建议',async()=>{
 const s=buildResearchSnapshot(evidence());
 const v=await composeFundResearch(s,null,async input=>{const out=fundResearchFixture(input);out.research.held.stance='maintain_plan';out.research.held.summary='若已有经过考虑的原配置计划，可先核查计划条件是否仍成立，当前材料不能代替个人评估。';return out;});assert.equal(v!.research.held.stance,'maintain_plan');
 await assert.rejects(composeFundResearch(s,null,async input=>{const out=fundResearchFixture(input);out.research.held.stance='maintain_plan';out.research.held.summary='已有持仓应该继续持有，无需再核查计划。';return out;}),/holding_plan_premise_required/);
});
test('净值日期按北京时间边界，未来/重复/非法日期不接受',()=>{
 const a=evidence();a.captured_at='2026-09-29T16:01:00Z';assert.doesNotThrow(()=>buildResearchSnapshot(a));a.fund_series![0].nav[0].date='2026-02-30';assert.throws(()=>buildResearchSnapshot(a),/research_nav_invalid/);
});
test('当前已采集真实证据可进入专用研究链；仅fixture解释，非真实模型结果',async()=>{
 const input=JSON.parse(await readFile(new URL('../evidence/fund-research-live-20261005/research-evidence.json',import.meta.url),'utf8')) as ResearchEvidence;
 const s=buildResearchSnapshot(input),evaluation=evaluateResearchSnapshot(s),v=await composeFundResearch(s,null,async input=>fundResearchFixture(input));assert.ok(v);assert.equal(s.fund_series!.length,2);assert.ok(s.fund_series!.every(f=>f.nav.length>=150));assert.equal(s.market!.as_of,'2026-09-30');assert.equal(v.as_of,'2026-09-30');assert.ok(evaluation.metrics.some(m=>m.key==='same_date_nav_change_difference_pct'));
 assert.ok(s.refs.every(r=>!input.documents!.some(d=>d.ref.article_id===r.article_id)));const metadata=structuredClone(input);metadata.documents![0].title='发现新公告，不代表已读正文';assert.equal(buildResearchSnapshot(metadata).evidence_hash,s.evidence_hash);
 const prompt=fundResearchPrompt({snapshot:s,evaluation,previous:null});assert.ok(prompt.includes('非分红')||prompt.includes('含分红'));assert.ok(!prompt.includes('Bearer'));
});

// ---- Public valuation rule as evidence: the model explains the rule's stance and cannot change it.
import {valuationRuleEvidence} from '../packages/backend/judgment.ts';
import type {State} from '../packages/backend/storage.ts';
function ruleSnapshot(override?:(rule:NonNullable<ReturnType<typeof valuationRuleEvidence>>)=>void){
 const rule=valuationRuleEvidence({} as State)!;override?.(rule);
 return buildResearchSnapshot({...evidence(),valuation_rule:rule});
}
const followRule=(input:Parameters<typeof fundResearchFixture>[0])=>{
 const out=fundResearchFixture(input),rule=input.snapshot.valuation_rule!,id=rule.ref.article_id;
 out.research.new_money={stance:rule.new_money.stance,summary:`按公开估值规则，新增资金${rule.new_money.title}。`,conditions:['valuation_band'],refs:[id]};
 out.research.held={stance:rule.held.stance,summary:`若已有经过考虑的长期计划，已有持仓${rule.held.title}。`,conditions:['valuation_band','user_plan_known'],refs:[id]};
 return out;
};
test('有规则结果时新增资金与持仓可评估，规则档位作为必查条件',()=>{
 const s=ruleSnapshot(),e=evaluateResearchSnapshot(s);
 assert.equal(e.evaluability.new_money.status,'assessable');assert.equal(e.evaluability.held.status,'assessable');
 assert.equal(e.checks.valuation_band.status,'triggered');
 assert.ok(e.metrics.some(m=>m.key==='pe_ttm_percentile_10y'&&m.value===s.valuation_rule!.percentile));
 assert.ok(s.refs.some(r=>r.article_id===s.valuation_rule!.ref.article_id));
});
test('模型立场与规则不一致时拒绝，一致时刊为规则立场',async()=>{
 const s=ruleSnapshot();
 await assert.rejects(composeFundResearch(s,null,async input=>fundResearchFixture(input)),/stance_must_follow_rule/);
 const v=await composeFundResearch(s,null,async input=>followRule(input));
 assert.ok(v);assert.equal(v.research.new_money.stance,s.valuation_rule!.new_money.stance);
 assert.equal(v.article.operation_view!.unheld.action,'持');assert.equal(v.article.operation_view!.held.action,'持');
});
test('规则档位变化改变证据hash；偏低区允许写“分批买入”，中间区不允许',async()=>{
 const mid=ruleSnapshot(),low=ruleSnapshot(r=>{r.band='low';r.new_money={stance:'conditional_add',title:'可分批新增',text:'可分批新增'};});
 assert.notEqual(mid.evidence_hash,low.evidence_hash);
 const withBuy=(input:Parameters<typeof fundResearchFixture>[0])=>{const out=followRule(input);out.research.direction.summary='估值处在规则偏低区，因此可分批买入。';return out;};
 assert.ok(await composeFundResearch(low,null,async input=>withBuy(input)));
 await assert.rejects(composeFundResearch(mid,null,async input=>withBuy(input)),/unsupported_public_market_action/);
});
