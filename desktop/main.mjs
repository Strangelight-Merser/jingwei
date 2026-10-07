import { app, BrowserWindow, Menu, ipcMain, shell, dialog, safeStorage, net } from 'electron';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
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
import { validReaderSituation } from '../.desktop-build/runtime/packages/contracts/reader-situation.js';
import { validHoldings } from '../.desktop-build/runtime/packages/backend/holdings-validation.js';
import { recognizeImage } from '../.desktop-build/runtime/packages/backend/local-ocr.js';
import { createDesktopCredentialStore } from '../.desktop-build/runtime/packages/backend/credentials.js';
import { refreshValuationState, valuationRuleEvidence } from '../.desktop-build/runtime/packages/backend/judgment.js';

export function savedWebPort(value){const port=Number(value);return Number.isInteger(port)&&port>1024&&port<65536?port:0;}
export function ocrHelperPath(packaged,platform,resources,directory){
 return packaged?path.join(resources,'native',platform==='darwin'?'jingwei-ocr':'ocr.ps1'):path.resolve(directory,'..',platform==='darwin'?'.local/bin/jingwei-ocr':'native/ocr.ps1');
}
export function ocrErrorMessage(code){
 return ({ocr_language_unavailable:'Windows 尚未安装简体中文 OCR。请在设置 → 时间和语言 → 语言和区域中添加中文（简体，中国），安装语言选项中的光学字符识别后重试；也可以粘贴文字或手动添加。',ocr_windows_unavailable:'Windows 截图识别暂时不可用。请使用 Windows 10 或 11，重新打开软件后重试；也可以粘贴文字或手动添加。',ocr_image_too_large:'图片尺寸超过系统识别上限，请裁剪成几张后再导入。'})[code]??'截图未能识别，请换一张清晰的图片重试；也可以粘贴文字或手动添加。';
}

app.setName('经纬');
process.env.JINGWEI_EDITOR_MODE='0';
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
 // Open at once on the launch mark; the app replaces it once data and servers are ready.
 const launchedAt=Date.now();
 window=new BrowserWindow({width:1260,height:900,minWidth:760,minHeight:580,title:'经纬 · 基金研究',backgroundColor:'#ffffff',show:false,webPreferences:{preload:path.join(import.meta.dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 window.once('ready-to-show',()=>window.show());
 await window.loadFile(path.join(import.meta.dirname,'splash.html'));
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
  // The bundled valuation rule result is public evidence like the facts above.
  const rule=valuationRuleEvidence(state),withRule=value=>rule?{...value,valuation_rule:rule}:value;
  const snapshot=buildResearchSnapshot(current?mergeResearchEvidence(withRule({...current,fund_series:current.fund_series??[],documents:current.documents??[]}),buildResearchSnapshot(evidence)):withRule(evidence));
  snapshot.evidence_observed_at=current?.evidence_hash===snapshot.evidence_hash?(current.evidence_observed_at??current.captured_at):new Date().toISOString();
  research.latest_snapshot=snapshot;
  // This imports already verified public material, not a fresh network check or a new judgment.
 });
 const encryptedFile=path.join(userDir,'model-credential.encrypted');
 const credentials=createDesktopCredentialStore(encryptedFile,safeStorage);
 const capability=credentials.status;
 // Public free sources use the desktop's native network stack. Model transport is unchanged.
 const researchCollector=async()=>{const previous=(await readState()).research_state?.latest_snapshot;return collectResearchEvidence({priorSnapshots:previous?.funds??[],priorDocuments:previous?.documents??[],fetcher:(input,init)=>net.fetch(input,{...init,credentials:'omit'})});};
 api=await startApi({port:0,mode:'active',credentialStore:credentials,credentialCapability:capability,researchUpdates:true,researchCollector,valuationRefresh:()=>refreshValuationState((input,init)=>net.fetch(input,{...init,credentials:'omit'}))});
 const apiPort=api.server.address().port;
 process.env.JINGWEI_API_URL=`http://127.0.0.1:${apiPort}`;
 process.env.JINGWEI_DESKTOP='1';
 const client=path.join(import.meta.dirname,'../.desktop-build/web/client');
 const build=await import(pathToFileURL(path.join(import.meta.dirname,'../.desktop-build/web/server/index.js')).href);
 const ssr=createRequestListener({build,mode:'production'});
 const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
 web=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url??'/','http://127.0.0.1').pathname);const file=path.resolve(client,'.'+pathname);const info=file.startsWith(client+path.sep)?await stat(file).catch(()=>null):null;if(info?.isFile()){res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');createReadStream(file).pipe(res);return;}ssr(req,res);}catch{res.writeHead(500,{'Content-Type':'text/plain;charset=utf-8'});res.end('文章暂时无法载入');}});
 // Reuse the last port so the page origin, and with it localStorage (reading guide, last visit), survives restarts.
 const portFile=path.join(userDir,'web-port');
 const listen=port=>new Promise((resolve,reject)=>{const fail=error=>{web.off('listening',ok);reject(error);};const ok=()=>{web.off('error',fail);resolve();};web.once('error',fail);web.once('listening',ok);web.listen(port,'127.0.0.1');});
 let lastPort=0;try{lastPort=savedWebPort(readFileSync(portFile,'utf8'));}catch{}
 try{await listen(lastPort);}catch{await listen(0);}
 try{writeFileSync(portFile,String(web.address().port));}catch{}
 origin=`http://127.0.0.1:${web.address().port}`;
 const bookmarkFile=path.join(userDir,'bookmarks.json');
 const allowed=event=>event.sender===window?.webContents&&event.senderFrame?.url.startsWith(origin+'/');
 const situationFile=path.join(userDir,'reader-situation.json');
 const holdingsFile=path.join(userDir,'reader-holdings.json');
 ipcMain.handle('reading:recognize-image',async(event,bytes)=>{if(!allowed(event))throw new Error('ocr_local_request_required');const helperPath=ocrHelperPath(app.isPackaged,process.platform,process.resourcesPath,import.meta.dirname);try{return await recognizeImage(bytes,{tempDir:app.getPath('temp'),helperPath});}catch(error){if(process.platform!=='win32')throw error;throw new Error(ocrErrorMessage(error instanceof Error?error.message:''));}});
 ipcMain.on('reading:read-holdings',event=>{try{if(!allowed(event))throw new Error();let value;try{value=JSON.parse(readFileSync(holdingsFile,'utf8'));}catch(e){if(e.code==='ENOENT')value=null;else throw e;}if(value!==null&&!validHoldings(value))throw new Error();event.returnValue={ok:true,value};}catch{event.returnValue={ok:false};}});
 ipcMain.on('reading:write-holdings',(event,value)=>{try{if(!allowed(event)||value!==null&&!validHoldings(value))throw new Error();writeFileSync(holdingsFile+'.tmp',JSON.stringify(value),{mode:0o600});renameSync(holdingsFile+'.tmp',holdingsFile);event.returnValue={ok:true};}catch{event.returnValue={ok:false};}});
 // Save the advisor sheet as an A4 PDF. The native print panel crashes Electron on macOS 15, so it is not used.
 ipcMain.handle('reading:save-pdf',async event=>{if(!allowed(event))return {ok:false};const {canceled,filePath}=await dialog.showSaveDialog(window,{title:'另存客户说明',defaultPath:path.join(app.getPath('documents'),`经纬客户说明-${new Date().toISOString().slice(0,10)}.pdf`),filters:[{name:'PDF',extensions:['pdf']}]});if(canceled||!filePath)return {ok:false,canceled:true};const data=await event.sender.printToPDF({pageSize:'A4',printBackground:true,preferCSSPageSize:true});await writeFile(filePath,data);shell.showItemInFolder(filePath);return {ok:true};});
 ipcMain.on('reading:read-situation',event=>{try{if(!allowed(event))throw new Error();let value;try{value=JSON.parse(readFileSync(situationFile,'utf8'));}catch(e){if(e.code==='ENOENT')value=null;else throw e;}if(value!==null&&!validReaderSituation(value))throw new Error();event.returnValue={ok:true,value};}catch{event.returnValue={ok:false};}});
 ipcMain.on('reading:write-situation',(event,value)=>{try{if(!allowed(event)||value!==null&&!validReaderSituation(value))throw new Error();writeFileSync(situationFile+'.tmp',JSON.stringify(value),{mode:0o600});renameSync(situationFile+'.tmp',situationFile);event.returnValue={ok:true};}catch{event.returnValue={ok:false};}});
 ipcMain.on('reading:read-saved',(event)=>{try{if(!allowed(event))throw new Error();let saved;try{saved=JSON.parse(readFileSync(bookmarkFile,'utf8'));}catch(e){if(e.code==='ENOENT')saved=[];else throw e;}if(!Array.isArray(saved)||saved.some(s=>typeof s!=='string'))throw new Error();event.returnValue={ok:true,slugs:saved};}catch{event.returnValue={ok:false};}});
 ipcMain.on('reading:write-saved',(event,slugs)=>{try{if(!allowed(event)||!Array.isArray(slugs)||slugs.length>2000||slugs.some(s=>typeof s!=='string'||!/^[-a-zA-Z0-9_]{1,160}$/.test(s)))throw new Error();writeFileSync(bookmarkFile+'.tmp',JSON.stringify([...new Set(slugs)]),{mode:0o600});renameSync(bookmarkFile+'.tmp',bookmarkFile);event.returnValue={ok:true};}catch{event.returnValue={ok:false};}});
 
 window.on('page-title-updated',event=>{event.preventDefault();window.setTitle('经纬 · 基金研究');});
 window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))void shell.openExternal(url);return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/')){event.preventDefault();if(/^https?:\/\//.test(url))void shell.openExternal(url);}});
 const go=route=>window.loadURL(origin+route);
 const menu=[...(process.platform==='darwin'?[{label:'经纬',submenu:[{label:'关于经纬',click:()=>about()}, {type:'separator'}, {role:'hide'}, {role:'hideOthers'}, {role:'unhide'},{type:'separator'},{role:'quit'}]}]:[]),{label:'前往',submenu:[{label:'今日判断',accelerator:'CmdOrCtrl+1',click:()=>go('/')},{label:'我的持仓体检',accelerator:'CmdOrCtrl+2',click:()=>go('/holdings')},{label:'我的情况',click:()=>go('/situation')},{label:'研究',accelerator:'CmdOrCtrl+3',click:()=>go('/compare')},{label:'机构服务',accelerator:'CmdOrCtrl+4',click:()=>go('/bank')},{type:'separator'},{label:'后退',accelerator:process.platform==='win32'?'Alt+Left':'CmdOrCtrl+[',click:()=>{const h=window.webContents.navigationHistory;if(h.canGoBack())h.goBack();}},{label:'前进',accelerator:process.platform==='win32'?'Alt+Right':'CmdOrCtrl+]',click:()=>{const h=window.webContents.navigationHistory;if(h.canGoForward())h.goForward();}},{type:'separator'},{label:'设置',accelerator:'CmdOrCtrl+,',click:()=>go('/settings')},...(process.platform==='darwin'?[]:[{type:'separator'},{role:'quit'}])]}, {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]}, {label:'视图',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}, {label:'帮助',submenu:[{label:'维护模式',type:'checkbox',checked:false,click:item=>{process.env.JINGWEI_EDITOR_MODE=item.checked?'1':'0';go(item.checked?'/maintenance':'/');}},{type:'separator'},{label:'关于经纬',click:()=>about()}]}];
 Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
 // Let the launch mark finish drawing before the first page replaces it.
 const shown=Date.now()-launchedAt;if(shown<1700)await new Promise(resolve=>setTimeout(resolve,1700-shown));
 await window.loadURL(origin+'/');window.show();
 if(process.env.JINGWEI_DESKTOP_CHECK_DIR){await mkdir(process.env.JINGWEI_DESKTOP_CHECK_DIR,{recursive:true});await writeFile(path.join(process.env.JINGWEI_DESKTOP_CHECK_DIR,'runtime.json'),JSON.stringify({pid:process.pid,platform:process.platform,arch:process.arch,version:app.getVersion(),packaged:app.isPackaged,web:origin,api:`http://127.0.0.1:${apiPort}`,userData:userDir},null,2));}
}
function about(){return dialog.showMessageBox(window,{type:'info',title:'关于经纬',message:`经纬 ${app.getVersion()}`,detail:'财经阅读与有依据的研究。安装后即可阅读、选择我的情况、比较费用与回看判断，无需密钥。资料保留原日期；免费核查可在阅读页发起。编辑与模型管理在默认关闭的维护模式中。\n\n数据保存在当前系统用户目录，退出软件后更新停止。使用 AI 解读前须自行设置密钥与费用授权。\n\n包含 AIHOT 的 MIT 授权代码，声明随软件保留。'});}
