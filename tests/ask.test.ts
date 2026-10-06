import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createAskService, askPrompt, askFragments, validateAskOutput} from '../packages/backend/ask.ts';
import {valuationRuleEvidence} from '../packages/backend/judgment.ts';
import {readState, mutateState} from '../packages/backend/storage.ts';
import {PRICE_POLICY, estimateReservation} from '../packages/backend/budget.ts';
import {modelMessages} from '../packages/backend/model.ts';
import Fastify from 'fastify';
import {registerAskRoutes} from '../packages/backend/ask.ts';

const question='为什么现在不额外追加？';
const session=()=>({has_key:true,authorized:true,model:PRICE_POLICY.model});
const model=()=> 'ready' as const;
beforeEach(async()=>{await mutateState(async state=>{state.ask_records=[];state.budget={id:'ask-test-budget',limit_micro_cny:1_000_000,reserved_micro_cny:0,approved_at:new Date().toISOString(),reservations:[]};});});

// Fake providers exist only here. No credential is configured, loaded, saved, or sent.
function fixture(output:unknown) {
 let calls=0;
 const service=createAskService({session,model,provider:async(prompt,_hash,id)=>{
  calls++;
  const amount=estimateReservation(JSON.stringify(modelMessages(prompt)));
  await mutateState(async state=>{state.budget!.reserved_micro_cny+=amount;state.budget!.reservations.push({id:'fixture-'+id,task_id:id,amount_micro_cny:amount,at:new Date().toISOString(),outcome:'completed'});});
  return output;
 }});
 return {service,calls:()=>calls};
}
async function goodOutput(){const rule=valuationRuleEvidence(await readState())!;return {answer:`当前处于${rule.band_label}，新增资金应按原计划，不额外追加。`,cites:[1],stance:rule.new_money.stance};}

test('正常作答：仅发送问题和规则片段，费用估算与共享模型消息一致，引文和本机记录保留',async()=>{
 const output=await goodOutput();let sent='';
 const fake=fixture(output);
 const wrapped=createAskService({session,model,provider:async(prompt)=>{sent=prompt;return output;}});
 const preview=await fake.service.preview(question);
 const result=await fake.service.answer(question,preview.quote);
 assert.equal(result.record.status,'answered');assert.equal(result.record.answer,output.answer);assert.equal(result.message,'');assert.equal(fake.calls(),1);
 assert.deepEqual(result.record.cites,preview.fragments.filter(f=>f.id===1));
 assert.equal(result.record.reserved_micro_cny,preview.estimate_micro_cny);
 const state=await readState();assert.equal(state.budget!.reserved_micro_cny,preview.estimate_micro_cny);assert.equal(state.ask_records!.length,1);
 const persisted=JSON.parse(await readFile(join(process.env.JINGWEI_DATA_DIR!,'content.json'),'utf8'));
 assert.deepEqual(persisted.ask_records[0],result.record);
 const quote=await wrapped.preview(question);await wrapped.answer(question,quote.quote);
 const payload=JSON.parse(sent);
 assert.deepEqual(Object.keys(payload),['task','rules','question','fragments']);assert.equal(payload.question,question);assert.equal(payload.fragments.length,6);
 assert.equal(preview.estimate_micro_cny,estimateReservation(JSON.stringify(modelMessages(sent))));
 for(const term of ['owner_preferences','finance_versions','reader_situation','budget','session','key','我的情况'])assert.equal(Object.hasOwn(payload,term),false);
 const rule=valuationRuleEvidence(state)!;assert.equal(sent,askPrompt(question,askFragments(rule)));
 for(const band of ['偏低区','中间区','偏高区','高位区'])assert.ok(sent.includes(band));
});

test('立场不一致：丢弃模型文字，返回规则原文并记下已预留费用',async()=>{
 const fake=fixture({...await goodOutput(),answer:'这是不能展示的模型文字。',stance:'conditional_add'});
 const preview=await fake.service.preview(question),result=await fake.service.answer(question,preview.quote);
 assert.equal(result.record.status,'rejected');assert.equal(result.record.answer,'这个问题暂时答不好');assert.deepEqual(result.record.cites,preview.fragments);
 assert.ok(!JSON.stringify(result).includes('不能展示的模型文字'));assert.equal(result.record.reserved_micro_cny,preview.estimate_micro_cny);
});

test('编造数字、单位、中文数字或只在未引用片段出现的数字均拒绝',async()=>{
 for(const [answer,cites] of [['当前分位是99.123%。',[1]],['当前估值48.8倍。',[1]],['需要连续八个数据日确认。',[6]],['需连续5个数据日确认。',[3]],['数据截至2026-09-09。',[1]],['当前估值９９９倍。',[1]],['当前分位1e3%。',[1]]] as [string,number[]][]) {
  const fake=fixture({...await goodOutput(),answer,cites}),preview=await fake.service.preview(question);
  const result=await fake.service.answer(question,preview.quote);assert.equal(result.record.status,'rejected',answer);assert.equal(result.record.answer,'这个问题暂时答不好');
 }
});

test('片段里存在且单位一致的数字可以解释，至少一条且编号有效',async()=>{
 const rule=valuationRuleEvidence(await readState())!;
 const fake=fixture({...await goodOutput(),answer:`当前市盈率${rule.pe_ttm}倍，分位${rule.percentile}%，按原计划，不额外追加。`});
 const preview=await fake.service.preview(question);assert.equal((await fake.service.answer(question,preview.quote)).record.status,'answered');
 for(const cites of [[],[999]]) {
  const bad=fixture({...await goodOutput(),cites}),p=await bad.service.preview(question);
  assert.equal((await bad.service.answer(question,p.quote)).record.status,'rejected');
 }
});

test('拒绝预测涨跌、承诺收益、超过200字，以及stance正确却改变动作的答案',async()=>{
 for(const answer of ['未来肯定上涨。','明天可能回落。','稳稳赚取收益。','当前可以立即加仓。','所以应该卖出。','当前不追加，但建议买入。','当规则确认高位区，可以加仓。','解释'.repeat(101)]) {
  const fake=fixture({...await goodOutput(),answer}),p=await fake.service.preview(question);
  assert.equal((await fake.service.answer(question,p.quote)).record.status,'rejected',answer);
 }
 const fake=fixture({...await goodOutput(),answer:'低估只说明估值位置，无法预测未来涨跌，也不保证收益。',cites:[6]}),p=await fake.service.preview(question);
 assert.equal((await fake.service.answer(question,p.quote)).record.status,'answered');
 const conditional=fixture({...await goodOutput(),answer:'当规则确认偏低区，可以分批新增。',cites:[2,6]}),q=await conditional.service.preview(question);
 assert.equal((await conditional.service.answer(question,q.quote)).record.status,'answered');
});

test('未配置密钥或未授权：不调用provider、不预留费用、不生成预写答案',async()=>{
 for(const has_key of [false,true]) {
  let calls=0;
  const service=createAskService({session:()=>({has_key,authorized:false,model:PRICE_POLICY.model}),model:()=>has_key?'disabled':'unconfigured',provider:async()=>{calls++;throw Error('must_not_call');}});
  const p=await service.preview(question),result=await service.answer(question,p.quote);
  assert.equal(p.ready,false);assert.equal(p.message,has_key?'需在维护模式授权本轮费用':'需在维护模式配置密钥');
  assert.equal(calls,0);assert.equal(result.record.status,'unavailable');assert.equal(result.record.answer,p.message);assert.equal(result.record.reserved_micro_cny,0);
 }
});

test('费用超过研究共用的剩余预算时拒绝，估算后预算被占用也不会调用provider',async()=>{
 const fake=fixture(await goodOutput()),p=await fake.service.preview(question);
 await mutateState(async state=>{state.budget!.reserved_micro_cny=state.budget!.limit_micro_cny-p.estimate_micro_cny+1;});
 assert.equal((await fake.service.preview(question)).message,'本轮剩余额度不足');
 const result=await fake.service.answer(question,p.quote);assert.equal(fake.calls(),0);assert.equal(result.record.answer,'本轮剩余额度不足');assert.equal(result.record.reserved_micro_cny,0);
});

test('问题变化使旧估算失效；费用网关失败时只保留规则原文',async()=>{
 const fake=fixture(await goodOutput()),p=await fake.service.preview(question);
 await assert.rejects(fake.service.answer('低估也会继续跌吗？',p.quote),/ask_estimate_changed/);assert.equal(fake.calls(),0);
 const service=createAskService({session,model,provider:async()=>{throw Error('budget_exhausted');}}),quote=await service.preview(question);
 const result=await service.answer(question,quote.quote);assert.equal(result.record.answer,'本轮剩余额度不足');assert.equal(result.record.reserved_micro_cny,0);
});

test('POST /ask路由：未配置状态、引文历史和拒绝额外个人字段',async()=>{
 const app=Fastify();await registerAskRoutes(app);
 try {
  const p=(await app.inject({url:'/ask?'+new URLSearchParams({question})})).json();assert.equal(p.ready,false);assert.equal(p.message,'需在维护模式配置密钥');
  assert.equal((await app.inject({method:'POST',url:'/ask',payload:{question,quote:p.quote}})).statusCode,403);
  const headers={'x-jingwei-reader':'local'};
  assert.equal((await app.inject({method:'POST',url:'/ask',headers,payload:{question,quote:p.quote,situation:{money:5000}}})).statusCode,400);
  const response=await app.inject({method:'POST',url:'/ask',headers,payload:{question,quote:p.quote}});
  assert.equal(response.statusCode,200);assert.equal(response.json().record.status,'unavailable');
  assert.deepEqual((await app.inject({url:'/owner/ask/history'})).json().records,[response.json().record]);
 }finally{await app.close();}
});

test('风险提示与规则范围不算预测；预测上涨仍被拒',async()=>{
 const rule=valuationRuleEvidence(await readState())!;
 const fragments=askFragments(rule);
 const ok={answer:'估值偏低时仍可能继续下跌，规则也不覆盖盈利变化，所以偏低区只建议长期资金分批投入。',cites:[2,6],stance:rule.new_money.stance};
 assert.equal(validateAskOutput(ok,rule,fragments).answer,ok.answer);
 assert.throws(()=>validateAskOutput({...ok,answer:'偏低区之后通常会反弹上涨。'},rule,fragments),/ask_forecast_or_promise/);
});
