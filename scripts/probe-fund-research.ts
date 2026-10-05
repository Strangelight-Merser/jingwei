import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {initializeStorage,initializeState,type State} from '../packages/backend/storage.ts';
import {collectResearchEvidence} from '../packages/backend/fund-evidence.ts';
const dataDir=await mkdtemp(join(tmpdir(),'jingwei-fund-probe-'));
await initializeStorage({dataDir,testMode:true});
// Public seed only. Never copy production state, authorisation or credentials.
const seed=JSON.parse(await readFile(new URL('../desktop/reading-seed.json',import.meta.url),'utf8')) as State;
await initializeState({...seed,budget:null,tasks:[],materials:[],events:[],collection_runs:[]});
const target=resolve(process.argv[2]??'evidence/fund-research-live-20261005');await mkdir(target,{recursive:true});
const result=await collectResearchEvidence({archive_dir:target,priorSnapshots:[]});
await writeFile(join(target,'research-evidence.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({captured_at:result.captured_at,dataDir,funds:result.funds.map(f=>({code:f.code,fields:Object.keys(f.fields)})),series:result.fund_series.map(s=>({code:s.code,days:s.nav.length,as_of:s.ref.data_as_of})),documents:result.documents.map(d=>({code:d.code,title:d.title,published_at:d.published_at,status:d.status})),market:result.market?{as_of:result.market.as_of,close:result.market.close}:null,errors:result.errors},null,2));
