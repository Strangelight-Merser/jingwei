import { readFile, rename, mkdir, rm, realpath, readdir, open } from 'node:fs/promises';
import { resolve, dirname, basename, join, relative, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import type { FinanceVersion, Material, CandidateEvent, GenerationTask, CollectionRun, BudgetLedger } from '../contracts/types.ts';
import type { MarketSnapshot } from './market-sources.ts';
import type { FundSnapshot } from './fund-updates.ts';
import type {ResearchState} from './research-service.ts';
import type {ValuationHistory} from './valuation-history.ts';
import type {AskRecord} from '../contracts/ask.ts';

export type State = { data_version?:number; owner_preferences?:{restore_saved_key_on_start:boolean}; finance_versions:FinanceVersion[]; materials:Material[]; events:CandidateEvent[]; tasks:GenerationTask[]; collection_runs:CollectionRun[]; budget:BudgetLedger|null; fund_observations?:FundSnapshot[]; market_observations?:MarketSnapshot[];research_state?:ResearchState; valuation_history?:ValuationHistory; valuation_histories?:Partial<Record<'000905'|'000016',ValuationHistory>>; ask_records?:AskRecord[] };
export const PRODUCTION_DATA_DIR = resolve(import.meta.dirname, '../../.data');
export type StorageOptions = { dataDir:string; readOnly?:boolean; testMode?:boolean };
const backupLimit=5;
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const within=(path:string,root:string)=>{const part=relative(root,path);return part===''||(part!=='..'&&!part.startsWith('..'+sep)&&!isAbsolute(part));};

// Resolve existing ancestors too: a symlink to .data is still a production path.
async function canonical(path:string):Promise<string>{
 const suffix:string[]=[];let parent=resolve(path);
 for(;;){try{return join(await realpath(parent),...suffix.reverse());}catch(e){
  if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
  const next=dirname(parent);if(next===parent)throw e;suffix.push(basename(parent));parent=next;
 }}
}
async function checkDirectory(options:StorageOptions){
 if(!options.dataDir?.trim())throw new Error('storage_directory_required');
 const dataDir=await canonical(options.dataDir);
 const testMode=Boolean(options.testMode||process.env.JINGWEI_TEST_MODE==='1'||process.env.NODE_TEST_CONTEXT);
 if(testMode){
  if(within(dataDir,await canonical(PRODUCTION_DATA_DIR)))throw new Error('test_production_directory_forbidden');
  const temporaryRoots=await Promise.all([tmpdir(),'/tmp'].map(canonical));
  if(!temporaryRoots.some(root=>within(dataDir,root)&&dataDir!==root))throw new Error('test_temporary_directory_required');
 }
 return {dataDir,readOnly:Boolean(options.readOnly),testMode};
}
function decode(bytes:Buffer):State{
 const state=JSON.parse(bytes.toString('utf8')) as State;
 if(!state||!Array.isArray(state.finance_versions)||!Array.isArray(state.materials))throw new Error('invalid_content_store');
 return {...state,events:state.events??[],tasks:state.tasks??[],collection_runs:state.collection_runs??[],budget:state.budget??null};
}
async function durableNewFile(path:string,bytes:Buffer|string){
 const file=await open(path,'wx');try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
}

export async function createStorage(options:StorageOptions){
 const config=await checkDirectory(options),file=join(config.dataDir,'content.json'),backups=join(config.dataDir,'backups');
 let pending:Promise<unknown>=Promise.resolve();
 async function guard(write=false){
  const actual=await checkDirectory({...config,testMode:config.testMode});
  if(actual.dataDir!==config.dataDir)throw new Error('storage_directory_changed');
  if(await canonical(file)!==file)throw new Error('storage_file_symlink_forbidden');
  if(write&&config.readOnly)throw new Error('storage_read_only');
  if(write&&await canonical(backups)!==backups)throw new Error('storage_backup_symlink_forbidden');
 }
 async function read():Promise<State>{
  await guard();try{return decode(await readFile(file));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new Error('content_store_missing_initialize_explicitly');throw e;}
 }
 async function prune(){
  const names=(await readdir(backups)).filter(n=>/^content-.*\.json$/.test(n)&&!n.endsWith('.meta.json')).sort().reverse();
  for(const name of names.slice(backupLimit)){await rm(join(backups,name));await rm(join(backups,name+'.meta.json'),{force:true});}
 }
 async function commit(state:State){
  await guard(true);const next=JSON.stringify(state,null,2);decode(Buffer.from(next));
  // Preserve only the content store, never credentials or unrelated runtime files.
  const previous=await readFile(file);const old=decode(previous);
  if(previous.equals(Buffer.from(next)))return;
  await mkdir(backups,{recursive:true});
  const name='content-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()+'.json';
  const snapshot=join(backups,name);await durableNewFile(snapshot,previous);
  if(hash(await readFile(snapshot))!==hash(previous))throw new Error('backup_verification_failed');
  await durableNewFile(snapshot+'.meta.json',JSON.stringify({backup_format:1,data_version:old.data_version??0,sha256:hash(previous),bytes:previous.length,saved_at:new Date().toISOString()},null,2));
  const temp=file+'.'+randomUUID()+'.tmp';
  try{await durableNewFile(temp,next);await rename(temp,file);}finally{await rm(temp,{force:true});}
  // The replacement is committed. Retention failure must not masquerade as a failed write.
  try{await prune();}catch{console.warn('content_backup_retention_cleanup_failed');}
 }
 async function locked<T>(fn:()=>Promise<T>):Promise<T>{
  await guard(true);await mkdir(config.dataDir,{recursive:true});const lock=file+'.lock';let acquired=false;
  for(let i=0;i<100;i++){try{await mkdir(lock);acquired=true;break;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,25));}}
  if(!acquired)throw new Error('content_store_busy');
  try{return await fn();}finally{await rm(lock,{recursive:true,force:true});}
 }
 function serial<T>(fn:()=>Promise<T>):Promise<T>{const work=pending.then(()=>locked(fn));pending=work.then(()=>{},()=>{});return work;}
 return {
  config:()=>({...config}),readState:read,
  initializeState:(initial:State)=>serial(async()=>{try{await read();return false;}catch(e){if(!(e instanceof Error)||e.message!=='content_store_missing_initialize_explicitly')throw e;}
   const bytes=JSON.stringify(initial,null,2);decode(Buffer.from(bytes));await durableNewFile(file,bytes);return true;
  }),
  saveState:(state:State)=>serial(()=>commit(state)),
  mutateState:<T>(fn:(state:State)=>Promise<T>)=>serial(async()=>{const state=await read();const result=await fn(state);await commit(state);return result;})
 };
}

type Store=Awaited<ReturnType<typeof createStorage>>;
let store:Store|null=null;
// Importing this module does not choose a directory, seed data, or touch the filesystem.
export async function initializeStorage(options:StorageOptions){
 const config=await checkDirectory(options);
 if(store){const previous=store.config();if(previous.dataDir!==config.dataDir||previous.readOnly!==config.readOnly)throw new Error('storage_already_initialized');return previous;}
 store=await createStorage(config);return store.config();
}
function current(){if(!store)throw new Error('storage_not_initialized');return store;}
export function storageConfiguration(){return current().config();}
export async function readState(){return current().readState();}
export async function initializeState(initial:State){return current().initializeState(initial);}
export async function saveState(state:State){return current().saveState(state);}
export async function mutateState<T>(fn:(s:State)=>Promise<T>){return current().mutateState(fn);}
