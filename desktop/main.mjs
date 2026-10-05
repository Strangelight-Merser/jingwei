import { app, BrowserWindow, Menu, ipcMain, shell, dialog, safeStorage, net } from 'electron';
import { mkdir, readFile, writeFile, rename, rm, access } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequestListener } from '@react-router/node';
import { initializeStorage, initializeState, readState, mutateState } from '../.desktop-build/runtime/packages/backend/storage.js';
import { startApi } from '../.desktop-build/runtime/apps/api/src/main.js';
import { buildResearchSnapshot } from '../.desktop-build/runtime/packages/backend/fund-research.js';
import { defaultResearchState, mergeResearchEvidence } from '../.desktop-build/runtime/packages/backend/research-service.js';
import { collectResearchEvidence } from '../.desktop-build/runtime/packages/backend/fund-evidence.js';

app.setName('经纬');
if(process.env.JINGWEI_DESKTOP_DATA_DIR)app.setPath('userData',path.resolve(process.env.JINGWEI_DESKTOP_DATA_DIR));
const single=app.requestSingleInstanceLock();
let window, api, web, origin, closing=false;
if(!single)app.quit();
else {
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',event=>{if(closing)return;event.preventDefault();closing=true;api?.server.closeAllConnections();const cleanup=Promise.allSettled([api?.close(),web?new Promise(resolve=>{web.close(resolve);web.closeAllConnections();}):Promise.resolve()]);Promise.race([cleanup,new Promise(resolve=>setTimeout(resolve,3000))]).finally(()=>app.exit(0));});
 app.whenReady().then(async()=>{try{await start();}catch(error){console.error('desktop_start_failed',error instanceof Error?error.message:'unknown');await dialog.showMessageBox({type:'error',title:'经纬暂时无法打开',message:'本机阅读数据未能载入。',detail:'已有资料保留。请退出后重新打开；若仍无法启动，请联系提供安装包的人。'});app.quit();}});
}
async function start(){
 const userDir=app.getPath('userData');await mkdir(userDir,{recursive:true});
 const contentDir=path.join(userDir,'content');
 // Only this desktop instance owns this per-user store; recover a lock left by a crash.
 await rm(path.join(contentDir,'content.json.lock'),{recursive:true,force:true});
 await initializeStorage({dataDir:contentDir});
 const seed=JSON.parse(await readFile(path.join(import.meta.dirname,'reading-seed.json'),'utf8'));
 await initializeState(seed);
 // Last-known public facts keep original source dates; no invented checks or model history.
 const evidence=JSON.parse(await readFile(path.join(import.meta.dirname,'public-evidence.json'),'utf8'));
 await mutateState(async state=>{
  const research=state.research_state??=defaultResearchState(),current=research.latest_snapshot;
  const snapshot=buildResearchSnapshot(current?mergeResearchEvidence({...current,fund_series:current.fund_series??[],documents:current.documents??[]},buildResearchSnapshot(evidence)):evidence);
  snapshot.evidence_observed_at=current?.evidence_hash===snapshot.evidence_hash?(current.evidence_observed_at??current.captured_at):new Date().toISOString();
  research.latest_snapshot=snapshot;
  // This imports already verified public material, not a fresh network check or a new judgment.
 });
 const encryptedFile=path.join(userDir,'model-credential.encrypted');
 const capability=async()=>({supported:['darwin','win32'].includes(process.platform),available:['darwin','win32'].includes(process.platform),stored:await access(encryptedFile).then(()=>true,()=>false),error:['darwin','win32'].includes(process.platform)?null:'keychain_unavailable'});
 async function encryption(){if(!['darwin','win32'].includes(process.platform)||!(safeStorage.isAsyncEncryptionAvailable?await safeStorage.isAsyncEncryptionAvailable():safeStorage.isEncryptionAvailable()))throw new Error('keychain_unavailable');}
 const credentials={status:capability,
  async save(key){if(!key.trim()||key.length>500||/[\x00-\x1f\x7f]/.test(key))throw new Error('invalid_key');try{await encryption();const bytes=(safeStorage.encryptStringAsync?await safeStorage.encryptStringAsync(key.trim()):safeStorage.encryptString(key.trim()));const tmp=encryptedFile+'.tmp';await writeFile(tmp,bytes,{mode:0o600});await rename(tmp,encryptedFile);}catch(e){if(e.message==='keychain_unavailable')throw e;throw new Error('keychain_failed');}},
  async load(){const bytes=await readFile(encryptedFile).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!bytes)return null;try{await encryption();const decoded=(safeStorage.decryptStringAsync?await safeStorage.decryptStringAsync(bytes):{result:safeStorage.decryptString(bytes),shouldReEncrypt:false});if(!decoded.result?.trim())throw new Error('keychain_failed');if(decoded.shouldReEncrypt)await this.save(decoded.result);return decoded.result;}catch{throw new Error('keychain_access_required');}},
  async remove(){await rm(encryptedFile,{force:true});}
 };
 // Public free sources use the desktop's native network stack. Model transport is unchanged.
 const researchCollector=async()=>{const previous=(await readState()).research_state?.latest_snapshot;return collectResearchEvidence({priorSnapshots:previous?.funds??[],priorDocuments:previous?.documents??[],fetcher:(input,init)=>net.fetch(input,{...init,credentials:'omit'})});};
 api=await startApi({port:0,mode:'active',credentialStore:credentials,credentialCapability:capability,researchUpdates:true,researchCollector});
 const apiPort=api.server.address().port;
 process.env.JINGWEI_API_URL=`http://127.0.0.1:${apiPort}`;
 process.env.JINGWEI_DESKTOP='1';
 const client=path.join(import.meta.dirname,'../.desktop-build/web/client');
 const build=await import(pathToFileURL(path.join(import.meta.dirname,'../.desktop-build/web/server/index.js')).href);
 const ssr=createRequestListener({build,mode:'production'});
 const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
 web=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url??'/','http://127.0.0.1').pathname);const file=path.resolve(client,'.'+pathname);const info=file.startsWith(client+path.sep)?await stat(file).catch(()=>null):null;if(info?.isFile()){res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');createReadStream(file).pipe(res);return;}ssr(req,res);}catch{res.writeHead(500,{'Content-Type':'text/plain;charset=utf-8'});res.end('文章暂时无法载入');}});
 await new Promise((resolve,reject)=>{web.once('error',reject);web.listen(0,'127.0.0.1',resolve);});
 origin=`http://127.0.0.1:${web.address().port}`;
 const bookmarkFile=path.join(userDir,'bookmarks.json');
 const allowed=event=>event.sender===window?.webContents&&event.senderFrame?.url.startsWith(origin+'/');
 ipcMain.on('reading:read-saved',(event)=>{try{if(!allowed(event))throw new Error();let saved;try{saved=JSON.parse(readFileSync(bookmarkFile,'utf8'));}catch(e){if(e.code==='ENOENT')saved=[];else throw e;}if(!Array.isArray(saved)||saved.some(s=>typeof s!=='string'))throw new Error();event.returnValue={ok:true,slugs:saved};}catch{event.returnValue={ok:false};}});
 ipcMain.on('reading:write-saved',(event,slugs)=>{try{if(!allowed(event)||!Array.isArray(slugs)||slugs.length>2000||slugs.some(s=>typeof s!=='string'||!/^[-a-zA-Z0-9_]{1,160}$/.test(s)))throw new Error();writeFileSync(bookmarkFile+'.tmp',JSON.stringify([...new Set(slugs)]),{mode:0o600});renameSync(bookmarkFile+'.tmp',bookmarkFile);event.returnValue={ok:true};}catch{event.returnValue={ok:false};}});
 window=new BrowserWindow({width:1260,height:900,minWidth:760,minHeight:580,title:'经纬 · 基金研究',backgroundColor:'#f8f6ef',show:false,webPreferences:{preload:path.join(import.meta.dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 window.on('page-title-updated',event=>{event.preventDefault();window.setTitle('经纬 · 基金研究');});
 window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))void shell.openExternal(url);return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/')){event.preventDefault();if(/^https?:\/\//.test(url))void shell.openExternal(url);}});
 const go=route=>window.loadURL(origin+route);
 const menu=[...(process.platform==='darwin'?[{label:'经纬',submenu:[{label:'关于经纬',click:()=>about()}, {type:'separator'}, {role:'hide'}, {role:'hideOthers'}, {role:'unhide'},{type:'separator'},{role:'quit'}]}]:[]),{label:'阅读',submenu:[{label:'首页',accelerator:'CmdOrCtrl+1',click:()=>go('/')},{label:'专题',accelerator:'CmdOrCtrl+2',click:()=>go('/topics')},{label:'搜索文章',accelerator:'CmdOrCtrl+F',click:()=>go('/articles')},{label:'我的收藏',accelerator:'CmdOrCtrl+3',click:()=>go('/saved')},{type:'separator'},{label:'模型与基金研究设置',click:()=>go('/settings/model')},{label:'内容更新与可选 AI 设置',click:()=>go('/settings')},...(process.platform==='darwin'?[]:[{type:'separator'},{role:'quit'}])]}, {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]}, {label:'视图',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}, {label:'帮助',submenu:[{label:'关于经纬',click:()=>about()}]}];
 Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
 await window.loadURL(origin+(process.argv.includes('--model-settings')?'/settings/model':'/'));window.show();
 if(process.env.JINGWEI_DESKTOP_CHECK_DIR){await mkdir(process.env.JINGWEI_DESKTOP_CHECK_DIR,{recursive:true});await writeFile(path.join(process.env.JINGWEI_DESKTOP_CHECK_DIR,'runtime.json'),JSON.stringify({pid:process.pid,platform:process.platform,arch:process.arch,version:app.getVersion(),packaged:app.isPackaged,web:origin,api:`http://127.0.0.1:${apiPort}`,userData:userDir},null,2));}
}
function about(){return dialog.showMessageBox(window,{type:'info',title:'关于经纬',message:`经纬 ${app.getVersion()}`,detail:'财经阅读与有依据的研究。安装后即可阅读、搜索、收藏、比较基金与回看判断，无需密钥。资料保留原日期；联网采集与 AI 解读可在“内容更新”中选择。\n\n数据保存在当前系统用户目录，退出软件后更新停止。使用 AI 解读前须自行设置密钥与费用授权。\n\n包含 AIHOT 的 MIT 授权代码，声明随软件保留。'});}
