import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKeychainStore} from '../packages/backend/credentials.ts';
const dir=process.env.JINGWEI_DATA_DIR!;
const {configureSession,sessionState,clearSession,restoreSavedCredential,removeSavedCredential,reserveCost}=await import('../packages/backend/budget.ts');
const {readState}=await import('../packages/backend/storage.ts');
let saved:string|null=null;const operations:string[]=[];
const store=createKeychainStore(async(operation,payload)=>{
 operations.push(operation);
 if(operation==='status')return {stored:Boolean(saved)};
 if(operation==='save'){saved=payload!.key;return {stored:true};}
 if(operation==='delete'){saved=null;return {stored:false};}
 if(!saved)throw new Error('keychain_not_found');
 return {key:saved};
},'darwin');
after(async()=>{clearSession();await rm(dir,{recursive:true,force:true});});

test('仅用户明确选择且提供本机输入才保存，不能迁移当前内存Key',async()=>{
 await configureSession({key:'non-secret-session-fixture',authorize:false},store);assert.equal(saved,null);
 await assert.rejects(configureSession({authorize:false,save_to_keychain:true},store),/keychain_key_required/);assert.equal(saved,null);
 const result=await configureSession({key:'non-secret-saved-fixture',limit_cny:10,authorize:true,save_to_keychain:true},store);
 assert.equal(result.has_key,true);assert.equal(saved,'non-secret-saved-fixture');assert.ok(!JSON.stringify(result).includes('non-secret-saved-fixture'));
 const status=await store.status();assert.deepEqual(status,{supported:true,available:true,stored:true,error:null});assert.ok(!JSON.stringify(status).includes('fixture'));
 await reserveCost(171322,'non-secret-ledger-fixture');
});
test('模拟应用重启：保存的Key与长期授权一起恢复，累计预留不清零；撤销后重启不再授权',async()=>{
 clearSession();assert.equal(sessionState().has_key,false);
 const restored=await restoreSavedCredential(false,store);assert.equal(restored.has_key,true);assert.equal(restored.restored,true);assert.equal(restored.authorized,true);assert.equal(operations.at(-1),'load');
 const ledger=(await readState()).budget!;assert.equal(ledger.limit_micro_cny,10000000);assert.equal(ledger.reserved_micro_cny,171322);
 await reserveCost(1,'allowed-after-restore');
 await configureSession({authorize:false},store);clearSession();
 assert.equal((await restoreSavedCredential(false,store)).authorized,false);
 await assert.rejects(reserveCost(1,'blocked-after-revoke'),/model_setup_required/);
 const file=await readFile(join(dir,'content.json'),'utf8');assert.ok(!file.includes('non-secret-saved-fixture'));assert.ok(!file.includes('non-secret-session-fixture'));
});
test('移除保存密钥同时清除会话并关闭授权，空存储恢复不会报成功',async()=>{
 await removeSavedCredential(store);assert.equal((await store.status()).stored,false);assert.equal(sessionState().has_key,false);assert.equal(sessionState().authorized,false);
 assert.equal((await restoreSavedCredential(false,store)).restored,false);
});
test('钥匙串不可用或拒绝访问时不落盘回退，不假报已保存',async()=>{
 const unavailable=createKeychainStore(async()=>{throw new Error('keychain_access_required');},'darwin');
 assert.deepEqual(await unavailable.status(),{supported:true,available:false,stored:null,error:'keychain_access_required'});
 const restored=await restoreSavedCredential(false,unavailable);assert.equal(restored.error,'keychain_access_required');assert.equal(restored.authorized,false);
 await assert.rejects(configureSession({key:'never-fallback-fixture',authorize:false,save_to_keychain:true},unavailable),/keychain_access_required/);assert.equal(sessionState().has_key,false);
 const otherPlatform=createKeychainStore(async()=>{throw new Error('should_not_run');},'linux');assert.equal((await otherPlatform.status()).supported,false);await assert.rejects(otherPlatform.save('non-secret'),/keychain_unavailable/);
});
test('撤销付费授权不会因钥匙串保存失败而保留旧授权',async()=>{
 await configureSession({key:'non-secret-revocation-fixture',authorize:true,limit_cny:10},store);
 assert.equal(sessionState().authorized,true);
 const denied=createKeychainStore(async()=>{throw new Error('keychain_access_required');},'darwin');
 await assert.rejects(configureSession({key:'non-secret-replacement-fixture',authorize:false,save_to_keychain:true},denied),/keychain_access_required/);
 assert.equal(sessionState().authorized,false);
 await assert.rejects(reserveCost(1,'revoked-despite-save-failure'),/model_setup_required/);
 assert.equal((await readState()).owner_preferences?.standing_authorization,false);
});
