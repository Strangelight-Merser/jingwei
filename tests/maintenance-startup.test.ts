import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {startApi} from '../apps/api/src/main.ts';
import {sessionState} from '../packages/backend/budget.ts';
import type {CredentialStore} from '../packages/backend/credentials.ts';

test('显式维护模式只读：启动不改队列/内容、不碰凭据，所有写入口关闭',async()=>{
 const dir=process.env.JINGWEI_DATA_DIR!,file=join(dir,'content.json');const before=await readFile(file);const names=await readdir(dir);let credentialCalls=0;
 const forbidden=async():Promise<never>=>{credentialCalls++;throw Error('credential_must_not_be_accessed');};
 const credentials:CredentialStore={load:forbidden,save:forbidden,remove:forbidden,status:forbidden};
 const app=await startApi({credentialStore:credentials,port:0,mode:'read_only'});
 try{
  assert.equal((await app.inject({url:'/publication/home'})).statusCode,200);
  const state=(await app.inject({url:'/owner/state'})).json();assert.equal(state.access_mode,'read_only');assert.equal(state.session.authorized,false);assert.equal(state.automatic.enabled,false);assert.equal(state.automatic.next_run_at,null);assert.equal(credentialCalls,0);assert.equal(sessionState().has_key,false);
  for(const route of ['/owner/session','/owner/draft','/owner/collect','/owner/process-next','/owner/process','/owner/publish','/owner/automatic','/owner/keychain/restore','/owner/keychain/remove']){
   const response=await app.inject({method:'POST',url:route,headers:{'x-jingwei-owner':'local'},payload:{}});assert.equal(response.statusCode,503);assert.equal(response.json().error,'maintenance_read_only');
  }
 }finally{await app.close();}
 assert.equal(credentialCalls,0);assert.deepEqual(await readFile(file),before);assert.deepEqual(await readdir(dir),names);
});
