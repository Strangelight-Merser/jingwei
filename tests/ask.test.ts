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

test('拒绝预测涨跌、承诺收益、超过280字，以及stance正确却改变动作的答案',async()=>{
 for(const answer of ['未来肯定上涨。','明天可能回落。','稳稳赚取收益。','当前可以立即加仓。','所以应该卖出。','当前不追加，但建议买入。','当规则确认高位区，可以加仓。','解释'.repeat(141)]) {
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
  assert.equal(p.ready,false);assert.equal(p.message,has_key?'需在模型设置中授权费用':'需在维护模式配置密钥');
  assert.equal(calls,0);assert.equal(result.record.status,'unavailable');assert.equal(result.record.answer,p.message);assert.equal(result.record.reserved_micro_cny,0);
 }
});

test('费用超过研究共用的剩余预算时拒绝，估算后预算被占用也不会调用provider',async()=>{
 const fake=fixture(await goodOutput()),p=await fake.service.preview(question);
 await mutateState(async state=>{state.budget!.reserved_micro_cny=state.budget!.limit_micro_cny-p.estimate_micro_cny+1;});
 assert.equal((await fake.service.preview(question)).message,'累计额度已用完');
 const result=await fake.service.answer(question,p.quote);assert.equal(fake.calls(),0);assert.equal(result.record.answer,'累计额度已用完');assert.equal(result.record.reserved_micro_cny,0);
});

test('问题变化使旧估算失效；费用网关失败时只保留规则原文',async()=>{
 const fake=fixture(await goodOutput()),p=await fake.service.preview(question);
 await assert.rejects(fake.service.answer('低估也会继续跌吗？',p.quote),/ask_estimate_changed/);assert.equal(fake.calls(),0);
 const service=createAskService({session,model,provider:async()=>{throw Error('budget_exhausted');}}),quote=await service.preview(question);
 const result=await service.answer(question,quote.quote);assert.equal(result.record.answer,'累计额度已用完');assert.equal(result.record.reserved_micro_cny,0);
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

test('片段编号与字段名不进入答案；转述读者看法不算预测；预测本身仍被拒',async()=>{
 const rule=valuationRuleEvidence(await readState())!;
 const fragments=askFragments(rule);
 const out=validateAskOutput({answer:'按片段1，当前新增资金“按原计划，不额外追加”（片段3），stance=maintain_plan。您觉得马上大涨属预测，规则不预测涨跌。',cites:[1,3],stance:rule.new_money.stance},rule,fragments);
 assert.doesNotMatch(out.answer,/片段|stance/);
 assert.throws(()=>validateAskOutput({answer:'马上会大涨，可以加仓。',cites:[1],stance:rule.new_money.stance},rule,fragments));
});

test('引号里转述的读者说法不算预测',async()=>{
 const rule=valuationRuleEvidence(await readState())!;
 const out=validateAskOutput({answer:'规则不预测未来涨跌，所以无法根据“马上要大涨”的判断来操作。当前新增资金按原计划、不额外追加。',cites:[1],stance:rule.new_money.stance},rule,askFragments(rule));
 assert.match(out.answer,/马上要大涨/);
});

test('问经纬按所选指数取证：中证500 的片段与立场来自中证500 的规则；片段说明 v2 缓冲',async()=>{
 const state=await readState();
 const csi500=valuationRuleEvidence(state,'000905')!;
 const fragments=askFragments(csi500);
 assert.match(fragments[0].text,/中证500/);
 assert.doesNotMatch(fragments[0].text,/沪深300/);
 assert.equal(csi500.band,'high');
 assert.match(fragments.at(-1)!.text,/缓冲/);
 assert.equal(valuationRuleEvidence(state)!.rule_id,valuationRuleEvidence(state,'000300')!.rule_id);
});

test('新指数片段携带各自来源与确认长度；恒生科技使用不足十年的已有历史',async()=>{
 const state=await readState();
 for(const [index,name,source,count,unit] of [
  ['NDX','纳斯达克100','蛋卷基金指数估值（第三方，每周）',2,'个周读数'],
  ['HSTECH','恒生科技','蛋卷基金指数估值（第三方，每周）',2,'个周读数'],
  ['000922','中证红利','中证指数官网每日估值',5,'个数据日'],
 ] as const) {
  const rule=valuationRuleEvidence(state,index)!,fragments=askFragments(rule);
  assert.ok(fragments[0].text.includes(name));
  assert.ok(fragments[0].text.includes(source));
  assert.ok(fragments[0].text.includes(`连续${count}${unit}`));
  assert.ok(fragments[5].text.includes(`连续${count}${unit}`));
  const output={answer:`${name}数据来自${source}，当前处于${rule.band_label}，新增资金${rule.new_money.title}；改判需连续${count}${unit}。`,cites:[1,6],stance:rule.new_money.stance};
  assert.equal(validateAskOutput(output,rule,fragments).answer,output.answer);
  const fake=fixture(output),preview=await fake.service.preview(question,index);
  assert.deepEqual(preview.fragments,fragments);
  assert.equal((await fake.service.answer(question,preview.quote,index)).record.status,'answered');
 }
 const hstech=askFragments(valuationRuleEvidence(state,'HSTECH')!);
 assert.match(hstech[0].text,/历史不足10年，按2020-07-27以来的已有数据计算/);
 assert.doesNotMatch(hstech.slice(0,5).map(f=>f.text).join('\n'),/近十年/);
 assert.match(hstech[2].text,/已有历史的中间水平/);
 assert.ok(JSON.parse(askPrompt(question,hstech)).rules.some((r:string)=>r.includes('第三方')&&r.includes('周读数')));
 // A first reading after the window's calendar boundary is not a short history.
 const daily={...valuationRuleEvidence(state,'000922')!,as_of:'2026-10-03',window_start:'2016-10-04'};
 assert.doesNotMatch(askFragments(daily)[0].text,/历史不足10年/);
});

test('4411 实测误拒回归：后置“无法判断”允许风险问答，真正的预测仍拒绝',async()=>{
 const state=await readState();
 const outputs=[
  ['NDX','规则不预测涨跌，所以低估后会不会继续跌，无法判断。当前估值处在近十年的中间水平，新增资金按原计划、不额外追加，已有定投照常进行，已有持仓继续持有。改判条件：连续2个周读数低于约27.27倍，改为偏低区，新增资金可分批新增；连续2个周读数在约35.24至36.9倍之间，改为偏高区，新增资金暂缓新增；连续2个周读数高于约36.9倍，改为高位区，新增资金暂停新增。'],
  ['HSTECH','规则不预测涨跌，所以低估后是否继续跌无法判断。当前估值处于中间区，新增资金按原计划、不额外追加，已有持仓继续持有。改判条件：连续2个周读数低于约22.1倍，改为偏低区，新增资金可分批新增；连续2个周读数在约39.99至46.25倍之间，改为偏高区，新增资金暂缓新增；连续2个周读数高于约46.25倍，改为高位区，新增资金暂停新增。'],
 ] as const;
 for(const [index,answer] of outputs) {
  const rule=valuationRuleEvidence(state,index)!,fragments=askFragments(rule);
  const output={answer,cites:[1,6],stance:rule.new_money.stance};
  assert.equal(validateAskOutput(output,rule,fragments).answer,answer);
  const fake=fixture(output),p=await fake.service.preview('低估也会继续跌吗？',index);
  assert.equal((await fake.service.answer(p.question,p.quote,index)).record.status,'answered');
  for(const forecast of ['低估后会继续跌。','明天会上涨，但低估后是否继续跌无法判断。']) {
   assert.throws(()=>validateAskOutput({...output,answer:forecast},rule,fragments),/ask_forecast_or_promise/);
  }
 }
});

test('新指数校验拒绝错指数、错来源与错确认长度；日数据可说交易日',async()=>{
 const state=await readState();
 for(const [index,answer,error] of [
  ['NDX','恒生指数处于中间区。','ask_index_mismatch'],
  ['HSTECH','纳斯达克100处于中间区。','ask_index_mismatch'],
  ['HSTECH','当前估值来自中证指数官网。','ask_source_mismatch'],
  ['NDX','当前估值来自蛋卷基金官方估值。','ask_source_mismatch'],
  ['NDX','当前估值来自蛋卷基金。','ask_source_mismatch'],
  ['000922','当前估值来自蛋卷基金（第三方）。','ask_source_mismatch'],
  ['NDX','连续2个交易日才改判。','ask_confirmation_mismatch'],
  ['HSTECH','连续5个周读数才改判。','ask_confirmation_mismatch'],
  ['000922','连续2个数据日才改判。','ask_confirmation_mismatch'],
 ] as const) {
  const rule=valuationRuleEvidence(state,index)!;
  assert.throws(()=>validateAskOutput({answer,cites:[1,6],stance:rule.new_money.stance},rule,askFragments(rule)),new RegExp(error));
 }
 const rule=valuationRuleEvidence(state,'000922')!,answer='中证红利数据来自中证指数官网每日估值，改判需连续5个交易日。';
 assert.equal(validateAskOutput({answer,cites:[1,6],stance:rule.new_money.stance},rule,askFragments(rule)).answer,answer);
 const weekly=valuationRuleEvidence(state,'NDX')!,thirdParty='纳斯达克100数据来自蛋卷基金（第三方），并非官方估值。';
 assert.equal(validateAskOutput({answer:thirdParty,cites:[1,6],stance:weekly.new_money.stance},weekly,askFragments(weekly)).answer,thirdParty);
});

test('4411 实测误放回归：恒生科技不能说当前处在近十年的中间水平',async()=>{
 const rule=valuationRuleEvidence(await readState(),'HSTECH')!,fragments=askFragments(rule);
 const output={answer:'当前估值处在近十年的中间水平，已有持仓按原计划继续持有。',cites:[1,3],stance:rule.new_money.stance};
 assert.throws(()=>validateAskOutput(output,rule,fragments),/ask_history_window_mismatch/);
 const corrected={...output,answer:'恒生科技历史不足10年，当前估值处在已有历史的中间水平，已有持仓按原计划继续持有。'};
 assert.equal(validateAskOutput(corrected,rule,fragments).answer,corrected.answer);
});

test('GET 与 POST /ask 对新指数保持取证，跨指数复用报价拒绝且不花费',async()=>{
 const app=Fastify();await registerAskRoutes(app);
 try {
  for(const [index,name] of [['NDX','纳斯达克100'],['HSTECH','恒生科技'],['000922','中证红利']] as const) {
   const p=(await app.inject({url:'/ask?'+new URLSearchParams({question,index})})).json();
   assert.ok(p.fragments[0].text.includes(name));
   const response=await app.inject({method:'POST',url:'/ask',headers:{'x-jingwei-reader':'local'},payload:{question,quote:p.quote,index}});
   assert.equal(response.statusCode,200);
   assert.equal(response.json().record.reserved_micro_cny,0);
   assert.ok(response.json().record.cites[0].text.includes(name));
  }
  const p=(await app.inject({url:'/ask?'+new URLSearchParams({question,index:'NDX'})})).json();
  const stale=await app.inject({method:'POST',url:'/ask',headers:{'x-jingwei-reader':'local'},payload:{question,quote:p.quote,index:'HSTECH'}});
  assert.equal(stale.statusCode,409);assert.equal(stale.json().error,'ask_estimate_changed');
  assert.equal((await readState()).budget!.reserved_micro_cny,0);
 }finally{await app.close();}
});

test('AT：中证1000与科创50低于70%时说明缓冲保留，不误称当前高于七成',async()=>{
 const state=await readState();
 for(const [index,name] of [['000852','中证1000'],['000688','科创50']] as const) {
  const rule={...valuationRuleEvidence(state,index)!,band:'high' as const,band_label:'偏高区',percentile:68.6};
  const fragments=askFragments(rule);
  assert.match(fragments[0].text,/当前分位低于70%，仍保留已确认的偏高区/);
  assert.match(fragments[0].text,/低于第65百分位并连续5个数据日确认/);
  assert.doesNotMatch(fragments[0].text,/估值已高于(?:近十年|已有历史)七成时间/);
  const answer=`${name}数据来自中证指数官网每日估值。当前分位低于70%，仍保留已确认的偏高区；回到中间区需低于第65百分位并连续5个数据日确认。新增资金暂缓新增，已有持仓继续持有。`;
  assert.equal(validateAskOutput({answer,cites:[1,6],stance:rule.new_money.stance},rule,fragments).answer,answer);
  assert.throws(()=>validateAskOutput({answer:`${name}当前估值已高于已有历史七成时间。`,cites:[1,4],stance:rule.new_money.stance},rule,fragments),/ask_buffer_mismatch/);
  if(index==='000688') {
   assert.match(fragments[0].text,/历史不足10年/);
   assert.throws(()=>validateAskOutput({answer:`${name}当前处在近十年的偏高区。`,cites:[1,6],stance:rule.new_money.stance},rule,fragments),/ask_history_window_mismatch/);
  }
 }
});

test('AT：其余五个指数的来源、确认长度和路由取证',async()=>{
 const state=await readState(),app=Fastify();await registerAskRoutes(app);
 try {
  for(const [index,name,source,count,unit] of [
   ['SPX','标普500','蛋卷基金指数估值（第三方，每周）',2,'个周读数'],
   ['HSI','恒生指数','蛋卷基金指数估值（第三方，每周）',2,'个周读数'],
   ['399006','创业板指','蛋卷基金指数估值（第三方，每周）',2,'个周读数'],
   ['000688','科创50','中证指数官网每日估值',5,'个数据日'],
   ['000852','中证1000','中证指数官网每日估值',5,'个数据日'],
  ] as const) {
   const rule=valuationRuleEvidence(state,index)!,fragments=askFragments(rule);
   const answer=`${name}数据来自${source}，当前处于${rule.band_label}，新增资金${rule.new_money.title}，已有持仓${rule.held.title}；改判需连续${count}${unit}。`;
   const fake=fixture({answer,cites:[1,6],stance:rule.new_money.stance}),p=await fake.service.preview(question,index);
   assert.equal((await fake.service.answer(question,p.quote,index)).record.status,'answered');
   const wrong=`${name}改判需连续${count===2?5:2}${unit}。`;
   assert.throws(()=>validateAskOutput({answer:wrong,cites:[1,6],stance:rule.new_money.stance},rule,fragments),/ask_confirmation_mismatch/);
   const preview=(await app.inject({url:'/ask?'+new URLSearchParams({question,index})})).json();
   assert.deepEqual(preview.fragments,fragments);
   const response=await app.inject({method:'POST',url:'/ask',headers:{'x-jingwei-reader':'local'},payload:{question,index,quote:preview.quote}});
   assert.equal(response.statusCode,200);assert.deepEqual(response.json().record.cites,fragments);
  }
 }finally{await app.close();}
});
