import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SEED } from '../packages/backend/seed.ts';
test('保留公共模型输出和usage，便于修复接入错误，不把凭据写入记录',async()=>{
 const dir=process.env.JINGWEI_DATA_DIR!;
 const {configureSession,clearSession}=await import('../packages/backend/budget.ts');
 const {composeWithDeepSeek}=await import('../packages/backend/model.ts');
 const realFetch=globalThis.fetch;let calls=0;
 const price='<table><tr><th>模型</th><th>deepseek-flash</th></tr><tr><td>百万tokens输入</td></tr><tr><td>百万tokens输出</td></tr>'+['0.04元','2元','8元'].map(v=>`<tr><td>高峰时段</td><td>${v}</td></tr>`).join('')+'</table>';
 globalThis.fetch=async()=>new Response(++calls===1?price:JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"output":"public fixture"}'}}],usage:{prompt_tokens:100,completion_tokens:20}}),{status:200});
 try{
  await configureSession({key:'isolated-fake-fixture-key',limit_cny:1,authorize:true});
  const v=SEED[0];const input={story_id:v.story_id,topic_key:v.interpretation.topic_key,claim_key:v.interpretation.claim_key,refs:v.input_refs,previous:v,related:[]};
  assert.deepEqual(await composeWithDeepSeek(input,'fixture-task'),{output:'public fixture'});
  const files=await readdir(join(dir,'model-runs'));assert.equal(files.length,1);
  const stored=await readFile(join(dir,'model-runs',files[0]),'utf8');const run=JSON.parse(stored);
  assert.equal(run.usage.prompt_tokens,100);assert.equal(run.task_id,'fixture-task');assert.match(run.input_hash,/^[a-f0-9]{64}$/);
  assert.equal(run.content,'{"output":"public fixture"}');assert.ok(!stored.includes('isolated-fake-fixture-key'));assert.ok(!stored.includes('Bearer'));
 }finally{globalThis.fetch=realFetch;clearSession();await rm(dir,{recursive:true,force:true});}
});
