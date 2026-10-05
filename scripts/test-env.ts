import { mkdtemp, mkdir } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorage, initializeStorage, initializeState } from '../packages/backend/storage.ts';
import { SEED } from '../packages/backend/seed.ts';
import { inputHash } from '../packages/backend/finance.ts';

// Runs before test modules. Even a supplied test path is checked before creating a private child.
process.env.JINGWEI_TEST_MODE='1';
const requested=process.env.JINGWEI_DATA_DIR;
let base=tmpdir();
if(requested){base=(await createStorage({dataDir:requested,testMode:true})).config().dataDir;await mkdir(base,{recursive:true});}
const dir=await mkdtemp(join(base,'jingwei-tests-'));
process.env.JINGWEI_DATA_DIR=dir;
await initializeStorage({dataDir:dir,testMode:true});
const now=new Date().toISOString();
await initializeState({data_version:1,finance_versions:SEED.map(v=>({...v,generated_at:now,published_at:now,input_hash:inputHash(v.input_refs)})),materials:[],events:[],tasks:[],collection_runs:[],budget:null});
process.once('exit',()=>rmSync(dir,{recursive:true,force:true}));
