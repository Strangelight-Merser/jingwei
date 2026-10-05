import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,mkdir,symlink,rm,copyFile,realpath} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createStorage,PRODUCTION_DATA_DIR,type State} from '../packages/backend/storage.ts';

const dir=await mkdtemp(join(tmpdir(),'jingwei-store-isolation-'));
after(()=>rm(dir,{recursive:true,force:true}));
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const fixture=(n=0):State=>({data_version:1,finance_versions:[],materials:[],events:[],tasks:[],collection_runs:[],budget:{id:'non-secret-fixture',limit_micro_cny:10000000,reserved_micro_cny:n,approved_at:'',reservations:[]}});

test('导入和未初始化读取不建目录、写数据或捕获环境路径',async()=>{
 const root=join(dir,'missing-import');
 const module=new URL('../packages/backend/storage.ts',import.meta.url).href;
 const code=`const s=await import(${JSON.stringify(module)});try{await s.readState();process.exit(2);}catch(e){if(e.message!=='storage_not_initialized')throw e;}`;
 const child=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...process.env,JINGWEI_DATA_DIR:root},encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.equal(existsSync(root),false);
});

test('测试拒绝生产目录、其子目录及symlink别名，不能被testMode:false绕过',async()=>{
 for(const path of [PRODUCTION_DATA_DIR,join(PRODUCTION_DATA_DIR,'inside')])await assert.rejects(createStorage({dataDir:path,testMode:false}),/test_production_directory_forbidden/);
 const alias=join(dir,'production-alias');await symlink(PRODUCTION_DATA_DIR,alias);
 await assert.rejects(createStorage({dataDir:alias}),/test_production_directory_forbidden/);
 await assert.rejects(createStorage({dataDir:process.cwd()}),/test_temporary_directory_required/);
});

test('测试预载拒绝显式生产配置，未进入测试模块',()=>{
 const preload=new URL('../scripts/test-env.ts',import.meta.url).href;
 const child=spawnSync(process.execPath,['--import',preload,'--input-type=module','-e','process.exit(7)'],{env:{...process.env,JINGWEI_DATA_DIR:PRODUCTION_DATA_DIR},encoding:'utf8'});
 assert.notEqual(child.status,7);assert.match(child.stderr,/test_production_directory_forbidden/);
});

test('内容文件及备份目录不能通过symlink跳出已确定的临时根',async()=>{
 const source=join(dir,'alias-source');await mkdir(source);const original=Buffer.from(JSON.stringify(fixture()));await writeFile(join(source,'original.json'),original);
 const root=join(dir,'file-alias');await mkdir(root);await symlink(join(source,'original.json'),join(root,'content.json'));
 const reader=await createStorage({dataDir:root});await assert.rejects(reader.readState(),/storage_file_symlink_forbidden/);await assert.rejects(reader.saveState(fixture(1)),/storage_file_symlink_forbidden/);assert.deepEqual(await readFile(join(source,'original.json')),original);
 const writerRoot=join(dir,'backup-alias');const writer=await createStorage({dataDir:writerRoot});await writer.initializeState(fixture());await symlink(source,join(writerRoot,'backups'));
 await assert.rejects(writer.saveState(fixture(1)),/storage_backup_symlink_forbidden/);assert.deepEqual(await readdir(source),['original.json']);assert.deepEqual(await writer.readState(),fixture());
});

test('缺数据读取保持缺失，必须显式初始化；配置后环境变化不会改目标',async()=>{
 const root=join(dir,'explicit');const store=await createStorage({dataDir:root});
 await assert.rejects(store.readState(),/initialize_explicitly/);assert.equal(existsSync(root),false);
 assert.equal(await store.initializeState(fixture()),true);assert.equal(await store.initializeState(fixture(999)),false);
 const old=process.env.JINGWEI_DATA_DIR;
 try{process.env.JINGWEI_DATA_DIR=PRODUCTION_DATA_DIR;await store.saveState(fixture(1));assert.equal((await store.readState()).budget?.reserved_micro_cny,1);}
 finally{process.env.JINGWEI_DATA_DIR=old;}
 assert.equal(store.config().dataDir,await realpath(root));
});

test('写前备份精确字节和版本，有限保留；备份可在新隔离目录恢复',async()=>{
 const root=join(dir,'backup');const store=await createStorage({dataDir:root});await store.initializeState(fixture());
 const original=Buffer.from(JSON.stringify(fixture(),null,'\t')+'\n');await writeFile(join(root,'content.json'),original);
 await store.saveState(fixture(1));
 let names=(await readdir(join(root,'backups'))).filter(n=>n.endsWith('.json')&&!n.endsWith('.meta.json'));
 const file=join(root,'backups',names[0]);assert.deepEqual(await readFile(file),original);
 const meta=JSON.parse(await readFile(file+'.meta.json','utf8'));assert.equal(meta.data_version,1);assert.equal(meta.backup_format,1);assert.equal(meta.sha256,sha(original));
 const recovered=join(dir,'restored');await mkdir(recovered);await copyFile(file,join(recovered,'content.json'));
 const reader=await createStorage({dataDir:recovered,readOnly:true});assert.deepEqual(await reader.readState(),fixture());assert.deepEqual(await readFile(join(recovered,'content.json')),original);
 for(let i=2;i<=8;i++)await store.saveState(fixture(i));
 names=(await readdir(join(root,'backups'))).filter(n=>n.endsWith('.json')&&!n.endsWith('.meta.json'));assert.equal(names.length,5);
 for(const name of names){const bytes=await readFile(join(root,'backups',name));const m=JSON.parse(await readFile(join(root,'backups',name+'.meta.json'),'utf8'));assert.equal(m.sha256,sha(bytes));}
});

test('回调失败、非法状态或备份存储失败都不损原文件',async()=>{
 const root=join(dir,'failure');const store=await createStorage({dataDir:root});await store.initializeState(fixture());const original=await readFile(join(root,'content.json'));
 await assert.rejects(store.mutateState(async s=>{s.materials=[];throw Error('fixture_failure');}),/fixture_failure/);
 await assert.rejects(store.saveState({} as State),/invalid_content_store/);
 await writeFile(join(root,'backups'),'non-secret blocking fixture');
 await assert.rejects(store.saveState(fixture(1)));
 assert.deepEqual(await readFile(join(root,'content.json')),original);assert.equal((await readdir(root)).some(n=>n.endsWith('.tmp')||n.endsWith('.lock')),false);
});

test('只读配置拒绝save/mutate/initialize且不建备份或锁',async()=>{
 const root=join(dir,'read-only');await mkdir(root);await writeFile(join(root,'content.json'),JSON.stringify(fixture()));const store=await createStorage({dataDir:root,readOnly:true});
 const original=await readFile(join(root,'content.json'));assert.deepEqual(await store.readState(),fixture());
 await assert.rejects(store.saveState(fixture(1)),/storage_read_only/);await assert.rejects(store.mutateState(async()=>{}),/storage_read_only/);await assert.rejects(store.initializeState(fixture()),/storage_read_only/);
 assert.deepEqual(await readFile(join(root,'content.json')),original);assert.deepEqual(await readdir(root),['content.json']);
});
