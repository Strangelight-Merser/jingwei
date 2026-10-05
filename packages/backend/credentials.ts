import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';

type Operation='status'|'save'|'load'|'load-interactive'|'delete';
type Reply={stored?:boolean;key?:string;error?:string};
export type CredentialStatus={supported:boolean;available:boolean;stored:boolean|null;error:string|null};
export type CredentialStore={status:()=>Promise<CredentialStatus>;save:(key:string)=>Promise<void>;load:(interactive?:boolean)=>Promise<string|null>;remove:()=>Promise<void>};
type Transport=(operation:Operation,payload?:{key:string})=>Promise<Reply>;
const helper=resolve(import.meta.dirname,'../../.local/bin/jingwei-keychain');
const knownErrors=new Set(['keychain_not_found','keychain_cancelled','keychain_access_required','keychain_failed','keychain_helper_unavailable','invalid_key']);

// Private child-process pipes only. No shell, secret arguments/env, error echo, or stdout logging.
async function transport(operation:Operation,payload?:{key:string}):Promise<Reply>{
 try{await access(helper,constants.X_OK);}catch{throw new Error('keychain_helper_unavailable');}
 return new Promise((resolvePromise,reject)=>{
  const child=spawn(helper,[operation],{stdio:['pipe','pipe','ignore']});
  let bytes=Buffer.alloc(0),settled=false;
  const timeout=setTimeout(()=>{child.kill();finish(new Error('keychain_access_required'));},operation==='status'||operation==='load'?5000:120000);
  function finish(error?:Error,value?:Reply){if(settled)return;settled=true;clearTimeout(timeout);if(error)reject(error);else resolvePromise(value!);}
  child.on('error',()=>finish(new Error('keychain_helper_unavailable')));
  child.stdout.on('data',(chunk:Buffer)=>{if(bytes.length+chunk.length>8192){child.kill();finish(new Error('keychain_failed'));}else bytes=Buffer.concat([bytes,chunk]);});
  child.on('close',()=>{try{const result=JSON.parse(bytes.toString('utf8')) as Reply;bytes.fill(0);if(result.error)finish(new Error(knownErrors.has(result.error)?result.error:'keychain_failed'));else finish(undefined,result);}catch{finish(new Error('keychain_failed'));}});
  child.stdin.on('error',()=>finish(new Error('keychain_failed')));
  child.stdin.end(payload?JSON.stringify(payload):'');
 });
}
export function createKeychainStore(call:Transport=transport,platform:NodeJS.Platform=process.platform):CredentialStore{
 const requireMac=()=>{if(platform!=='darwin')throw new Error('keychain_unavailable');};
 return {
  async status(){if(platform!=='darwin')return {supported:false,available:false,stored:null,error:'keychain_unavailable'};
   try{const result=await call('status');return {supported:true,available:true,stored:result.stored===true,error:null};}
   catch(e){return {supported:true,available:false,stored:null,error:e instanceof Error&&knownErrors.has(e.message)?e.message:'keychain_failed'};}
  },
  async save(key){requireMac();if(!key.trim()||key.length>500||/[\x00-\x1f\x7f]/.test(key))throw new Error('invalid_key');await call('save',{key:key.trim()});},
  async load(interactive=false){requireMac();try{const reply=await call(interactive?'load-interactive':'load');if(!reply.key?.trim()||reply.key.length>500)throw new Error('keychain_failed');return reply.key.trim();}catch(e){if(e instanceof Error&&e.message==='keychain_not_found')return null;throw e;}},
  async remove(){requireMac();await call('delete');}
 };
}
export const keychainStore=createKeychainStore();

// Check the local helper only; never query or read Keychain during an unconfigured startup.
export async function credentialSupport():Promise<CredentialStatus>{
 if(process.platform!=='darwin')return {supported:false,available:false,stored:null,error:'keychain_unavailable'};
 try{await access(helper,constants.X_OK);return {supported:true,available:true,stored:null,error:null};}
 catch{return {supported:true,available:false,stored:null,error:'keychain_helper_unavailable'};}
}
