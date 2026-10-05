import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKeychainStore} from '../packages/backend/credentials.ts';

const dir=process.env.JINGWEI_DATA_DIR!;

const {startApi}=await import('../apps/api/src/main.ts');
const {sessionState,reserveCost}=await import('../packages/backend/budget.ts');
after(async()=>{await rm(dir,{recursive:true,force:true});});

test('真实API启动路径自动加载虚拟已保存Key，监听前完成且不授权或开启任务',async()=>{
 const operations:string[]=[];
 const fixture='non-secret-api-startup-fixture';
 const store=createKeychainStore(async operation=>{
  operations.push(operation);
  if(operation==='status')return {stored:true};
  assert.equal(operation,'load'); // No interactive prompt, save, or delete during startup.
  return {key:fixture};
 },'darwin');
 const app=await startApi({credentialStore:store,port:0,mode:'active',restoreSavedKey:true});
 try{
  assert.deepEqual(operations,['load']);
  assert.equal(sessionState().has_key,true);
  assert.equal(sessionState().authorized,false);
  const response=await app.inject({method:'GET',url:'/owner/state'});
  assert.equal(response.statusCode,200);
  const state=response.json();
  assert.equal(state.session.has_key,true);
  assert.equal(state.session.authorized,false);
  assert.equal(state.automatic.enabled,false);
  assert.equal(state.automatic.next_run_at,null);
  assert.equal(state.budget?.requests??0,0);
  for(const query of ['?version=','?version=%20','?version=0','?version=NaN']){
   assert.equal((await app.inject({method:'GET',url:'/publication/articles/csi300-hold-and-fund-choice'+query})).statusCode,404);
  }
  assert.equal(response.body.includes(fixture),false);
  await assert.rejects(reserveCost(1,'startup-must-not-spend'),/model_setup_required/);
 }finally{await app.close();}
});

test('启动非交互恢复被拒时仍提供阅读，不自行保存或弹提示，保留显式恢复入口',async()=>{
 const operations:string[]=[];
 const store=createKeychainStore(async operation=>{
  operations.push(operation);
  if(operation==='status')return {stored:true};
  if(operation==='load')throw new Error('keychain_access_required');
  assert.equal(operation,'load-interactive');
  return {key:'non-secret-explicit-recovery-fixture'};
 },'darwin');
 const app=await startApi({credentialStore:store,port:0,mode:'active',restoreSavedKey:true});
 try{
  assert.deepEqual(operations,['load']);
  assert.equal((await app.inject({method:'GET',url:'/health'})).statusCode,200);
  assert.equal(sessionState().has_key,false);
  const response=await app.inject({method:'POST',url:'/owner/keychain/restore',headers:{'x-jingwei-owner':'local'},payload:{}});
  assert.equal(response.statusCode,200);
  assert.equal(response.json().restored,true);
  assert.equal(response.json().authorized,false);
  assert.deepEqual(operations,['load','load-interactive']);
  assert.equal(response.body.includes('non-secret-explicit-recovery-fixture'),false);
  const state=(await app.inject({method:'GET',url:'/owner/state'})).json();
  assert.equal(state.automatic.enabled,false);
  assert.equal(state.budget?.requests??0,0);
 }finally{await app.close();}
});
