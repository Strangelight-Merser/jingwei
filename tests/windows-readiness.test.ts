import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
import childProcess from 'node:child_process';
import {promisify} from 'node:util';
import {syncBuiltinESMExports} from 'node:module';
import {createDesktopCredentialStore} from '../packages/backend/credentials.ts';

const main=await readFile(new URL('../desktop/main.mjs',import.meta.url),'utf8');
// Run the entry's pure helpers without importing Electron or starting either server.
const helperSource=main.slice(main.indexOf('export function savedWebPort'),main.indexOf("app.setName")).replaceAll('export function','function');
const helpers=runInNewContext(helperSource+';({savedWebPort,ocrHelperPath,ocrErrorMessage})',{path:path.win32});
test('Windows 中文和空格路径，以及 web-port 的有效整数与无效值',()=>{
 assert.equal(helpers.ocrHelperPath(true,'win32','C:\\Program Files\\经纬\\resources','unused'),'C:\\Program Files\\经纬\\resources\\native\\ocr.ps1');
 assert.equal(helpers.ocrHelperPath(false,'win32','unused','D:\\研发 文件\\经纬\\desktop'),'D:\\研发 文件\\经纬\\native\\ocr.ps1');
 for(const value of ['4410','65535',' 4410\n'])assert.equal(helpers.savedWebPort(value),Number(value));
 for(const value of ['', '1024','65536','4410.5','NaN','Infinity','broken'])assert.equal(helpers.savedWebPort(value),0);
 assert.match(helpers.ocrErrorMessage('ocr_language_unavailable'),/简体中文 OCR.*光学字符识别.*粘贴文字/);
 assert.match(helpers.ocrErrorMessage('ocr_windows_unavailable'),/Windows 10 或 11/);
});

test('Windows 桌面凭据状态、加密保存与恢复、拒绝解密和删除（仅临时假凭据）',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'jingwei-as-credentials-'));
 const file=path.join(directory,'model-credential.encrypted');
 let available=true,deny=false,decryptions=0;
 const encryption={isEncryptionAvailable:()=>available,encryptString:(key:string)=>Buffer.from('encrypted:'+Buffer.from(key).toString('base64')),decryptString:(bytes:Buffer)=>{decryptions++;if(deny)throw Error('fixture-denied');return Buffer.from(bytes.toString().slice(10),'base64').toString();}};
 const store=createDesktopCredentialStore(file,encryption,'win32');
 try{
  assert.deepEqual(await store.status(),{supported:true,available:true,stored:false,error:null});
  assert.equal(decryptions,0);assert.equal(await store.load(),null);
  await store.save(' fixture-only ');
  assert.ok(!(await readFile(file,'utf8')).includes('fixture-only'));
  assert.equal(await store.load(),'fixture-only');
  assert.equal((await store.status()).stored,true);
  available=false;assert.equal((await store.status()).available,false);assert.equal((await store.status()).error,'keychain_unavailable');
  await assert.rejects(store.save('fixture-only'),/keychain_unavailable/);
  await assert.rejects(store.load(),/keychain_access_required/);
  available=true;deny=true;await assert.rejects(store.load(),/keychain_access_required/);
  for(const key of ['', 'bad\nkey','x'.repeat(501)])await assert.rejects(store.save(key),/invalid_key/);
  await store.remove();assert.equal(await store.load(),null);assert.deepEqual(await readdir(directory),[]);
  const unsupported=createDesktopCredentialStore(file,encryption,'linux');
  assert.equal((await unsupported.status()).supported,false);await assert.rejects(unsupported.save('fixture-only'),/keychain_unavailable/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('Windows OCR 的空数组、单行、多行、BOM、错误与临时图片清理',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'jingwei-as-ocr-'));
 let stdout='[]',failed=false;
 const calls:{command:string;args:string[]}[]=[];
 const fakeExec=Object.assign((command:string,args:string[],_options:unknown,callback:(error:Error|null,stdout:string,stderr:string)=>void)=>{
  calls.push({command,args});
  callback(failed?Object.assign(new Error('fixture-failure'),{stdout}):null,stdout,'');
 },{[promisify.custom]:async(command:string,args:string[])=>{calls.push({command,args});if(failed)throw Object.assign(new Error('fixture-failure'),{stdout});return {stdout,stderr:''};}});
 const originalExec=childProcess.execFile;
 childProcess.execFile=fakeExec as unknown as typeof childProcess.execFile;
 syncBuiltinESMExports();
 const {recognizeImage}=await import('../packages/backend/local-ocr.ts');
 const helperPath=path.join(directory,'中文 文件','ocr.ps1');
 const line={text:'虚构基金 12.34',x:0.1,y:0.2,w:0.5,h:0.03};
 try{
  for(const lines of [[],[line],[line,{...line,y:0.4}]]){
   stdout='\uFEFF'+JSON.stringify(lines)+'\r\n';
   assert.deepEqual(await recognizeImage(new Uint8Array([1]),{tempDir:directory,helperPath,platform:'win32'}),lines);
   assert.deepEqual(await readdir(directory),[]);
  }
  assert.deepEqual(calls[0].args.slice(0,7),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helperPath,'-ImagePath']);
  assert.match(calls[0].command,/WindowsPowerShell.*powershell.exe$/);
  for(const code of ['ocr_language_unavailable','ocr_windows_unavailable','ocr_image_too_large']){
   failed=true;stdout=JSON.stringify({error:code});
   await assert.rejects(recognizeImage(new Uint8Array([1]),{tempDir:directory,helperPath,platform:'win32'}),new RegExp(code));
   assert.deepEqual(await readdir(directory),[]);
  }
  failed=false;stdout=JSON.stringify(line);
  await assert.rejects(recognizeImage(new Uint8Array([1]),{tempDir:directory,helperPath,platform:'win32'}),/ocr_invalid_response/);
 }finally{childProcess.execFile=originalExec;syncBuiltinESMExports();await rm(directory,{recursive:true,force:true});}
});

test('Windows 菜单导航、Ctrl 快捷键声明与 Alt 方向键历史',()=>{
 let navigated='',back=0,forward=0,enabled=false;
 const window={loadURL:(url:string)=>{navigated=url;},webContents:{navigationHistory:{canGoBack:()=>enabled,canGoForward:()=>enabled,goBack:()=>back++,goForward:()=>forward++}}};
 const source=main.slice(main.indexOf(' const go=route=>'),main.indexOf(' Menu.setApplicationMenu'));
 const menu=runInNewContext(source+';menu',{window,origin:'http://127.0.0.1:12345',process:{platform:'win32'},about:()=>{}});
 const navigation=menu.find((item:{label:string})=>item.label==='前往').submenu;
 const home=navigation.find((item:{label:string})=>item.label==='今日判断');
 assert.equal(home.accelerator,'CmdOrCtrl+1');home.click();assert.equal(navigated,'http://127.0.0.1:12345/');
 const previous=navigation.find((item:{label:string})=>item.label==='后退'),next=navigation.find((item:{label:string})=>item.label==='前进');
 assert.equal(previous.accelerator,'Alt+Left');assert.equal(next.accelerator,'Alt+Right');
 previous.click();next.click();assert.equal(back+forward,0);
 enabled=true;previous.click();next.click();assert.equal(back,1);assert.equal(forward,1);
 assert.ok(navigation.some((item:{role:string})=>item.role==='quit'));
});

test('PDF 导出通过原 IPC 保存 A4、支持中文路径及取消操作',async()=>{
 let handler:(event:unknown)=>Promise<{ok:boolean;canceled?:boolean}>;
 let canceled=false,printed=0,revealed='',savedPath='';
 const pdf=Buffer.from('fixture-pdf');
 const sender={printToPDF:async(options:unknown)=>{assert.deepEqual(JSON.parse(JSON.stringify(options)),{pageSize:'A4',printBackground:true,preferCSSPageSize:true});printed++;return pdf;}};
 const window={webContents:sender};
 const source=main.slice(main.indexOf(" ipcMain.handle('reading:save-pdf'"),main.indexOf(" ipcMain.on('reading:read-situation'"));
 runInNewContext(source,{window,path:path.win32,app:{getPath:()=> 'C:\\Users\\测试\\Documents'},allowed:(event:{sender:unknown})=>event.sender===sender,
  ipcMain:{handle:(_name:string,callback:typeof handler)=>{handler=callback;}},
  dialog:{showSaveDialog:async()=>({canceled,filePath:'C:\\Users\\测试\\Documents\\经纬说明.pdf'})},
  writeFile:async(file:string,data:Buffer)=>{savedPath=file;assert.equal(data,pdf);},shell:{showItemInFolder:(file:string)=>{revealed=file;}}});
 assert.equal((await handler!({sender:{}})).ok,false);assert.equal(printed,0);
 assert.equal((await handler!({sender})).ok,true);assert.equal(printed,1);assert.equal(revealed,savedPath);assert.match(savedPath,/经纬说明.pdf$/);
 canceled=true;assert.equal((await handler!({sender})).canceled,true);assert.equal(printed,1);
});
