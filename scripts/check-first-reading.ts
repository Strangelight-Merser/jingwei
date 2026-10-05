import {writeFile} from 'node:fs/promises';
const endpoint='http://127.0.0.1:9232';
const browserInfo=await(await fetch(endpoint+'/json/version')).json();
async function connect(url:string){
 const ws=new WebSocket(url);await new Promise<void>(r=>ws.addEventListener('open',()=>r(),{once:true}));
 let seq=0;const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
 ws.addEventListener('message',e=>{const d=JSON.parse(String(e.data)),p=pending.get(d.id);if(p){pending.delete(d.id);d.error?p.reject(new Error(d.error.message)):p.resolve(d.result);}});
 const command=(method:string,params:object={})=>new Promise<any>((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 async function evaluate(expression:string){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('page_expression_failed:'+expression.slice(0,90));return r.result.value;}
 async function navigate(path:string){await command('Page.navigate',{url:'http://127.0.0.1:4410'+path});for(let i=0;i<40;i++){if(await evaluate('document.readyState==="complete"&&location.pathname+location.search==='+JSON.stringify(path)))break;await new Promise(r=>setTimeout(r,100));}await evaluate('document.fonts.ready.then(()=>true)');await new Promise(r=>setTimeout(r,180));}
 return {ws,command,evaluate,navigate};
}
const browser=await connect(browserInfo.webSocketDebuggerUrl);
const {browserContextId}=await browser.command('Target.createBrowserContext');
const {targetId}=await browser.command('Target.createTarget',{url:'about:blank',browserContextId});
const target=(await(await fetch(endpoint+'/json')).json()).find((t:{id:string})=>t.id===targetId);
const page=await connect(target.webSocketDebuggerUrl);await page.command('Page.enable');
const checks:any[]=[];
const record=async(name:string,expression:string)=>{const result=await page.evaluate(expression);checks.push({check:name,result});if(name.endsWith("_link")&&(!result.open||result.top<0||result.top>60))throw new Error("anchor_target_not_in_view:"+name);return result;};
const shot=async(name:string)=>{const r=await page.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL('../evidence/'+name,import.meta.url),Buffer.from(r.data,'base64'));};
for(const width of [1440,390,320]){
 await page.command('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:width<760});await page.navigate('/');
 await record('first_reading_'+width,'({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.querySelector(".operation-view h1")?.innerText,stance:document.querySelector(".operation-actions>div:last-child h2")?.innerText,condition:document.querySelector(".operation-actions>div:last-child>p")?.innerText,next:document.querySelector(".first-reading")?.innerText,top:document.querySelector(".first-reading")?.getBoundingClientRect().top,fields:document.querySelectorAll("input,select,textarea").length,articleVersion:document.querySelector(".operation-kicker time")?.innerText})');
 if(width!==320)await shot('首次阅读_首页_'+(width===1440?'桌面':'手机')+'.png');
}
await page.command('Emulation.setDeviceMetricsOverride',{width:390,height:1050,deviceScaleFactor:1,mobile:true});await page.navigate('/');
await page.evaluate('localStorage.setItem("jingwei.saved.articles","[]");window.dispatchEvent(new Event("jingwei:saved-changed"))');await new Promise(r=>setTimeout(r,80));
await page.evaluate('document.querySelector(".first-reading-links>a").click()');await new Promise(r=>setTimeout(r,150));
await record('first_reader_fund_link','({open:document.querySelector("#fund-comparison").open,top:document.querySelector("#fund-comparison").getBoundingClientRect().top,focus:document.activeElement?.id,CService:document.querySelector(".fund-table-wrap").innerText.includes("C类概要销售服务年费率"),CRedemption:document.querySelector(".fund-table-wrap").innerText.includes("C类赎回费")})');
await page.evaluate('history.back()');await new Promise(r=>setTimeout(r,500));await page.evaluate('document.querySelectorAll(".first-reading-links>a")[1].click()');await new Promise(r=>setTimeout(r,150));
await record('first_reader_condition_link','({open:document.querySelector(".operation-review").open,top:document.querySelector("#judgment-change-conditions").getBoundingClientRect().top,focus:document.activeElement?.id,originalEvidence:document.querySelector(".operation-review").innerText.includes("沪深300同样本盈利")})');
await page.evaluate('document.querySelector(".first-reading .save").click()');await new Promise(r=>setTimeout(r,80));await record('optional_save','({label:document.querySelector(".first-reading .save").innerText,pressed:document.querySelector(".first-reading .save").getAttribute("aria-pressed")})');
await page.navigate('/saved');await record('saved_latest_entry','({count:document.querySelectorAll(".saved-item").length,href:document.querySelector(".saved-item h2 a")?.getAttribute("href")})');await page.evaluate('document.querySelector(".saved-item .save").click()');
const report={checked_at:new Date().toISOString(),browser:'existing isolated Chrome; temporary profile',scope:'links/layout verification; no human 30-second usability test',checks};
await writeFile(new URL('../evidence/首次阅读_真实Chrome核查.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.command('Target.disposeBrowserContext',{browserContextId});page.ws.close();browser.ws.close();
