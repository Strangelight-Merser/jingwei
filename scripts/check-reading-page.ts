import {writeFile} from 'node:fs/promises';
const targets=await(await fetch('http://127.0.0.1:9229/json')).json();
const ws=new WebSocket(targets.find((t:{type:string})=>t.type==='page').webSocketDebuggerUrl);
await new Promise<void>(resolve=>ws.addEventListener('open',()=>resolve(),{once:true}));
let seq=0;const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
ws.addEventListener('message',e=>{const d=JSON.parse(String(e.data));const p=pending.get(d.id);if(p){pending.delete(d.id);d.error?p.reject(new Error(d.error.message)):p.resolve(d.result);}});
function command(method:string,params:object={}){return new Promise<any>((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
await command('Page.enable');
await command('Emulation.setDeviceMetricsOverride',{width:390,height:1500,deviceScaleFactor:1,mobile:true});
await command('Page.navigate',{url:'http://127.0.0.1:4410/'});
for(let i=0;i<20;i++){const r=await command('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});if(r.result.value==='complete')break;await new Promise(resolve=>setTimeout(resolve,200));}
const metric=await command('Runtime.evaluate',{expression:'JSON.stringify({width:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,operationCount:document.querySelectorAll(".operation-view").length,title:document.querySelector("h1")?.textContent})',returnByValue:true});
const data=JSON.parse(metric.result.value);
const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
await writeFile(new URL('../evidence/本期结论_手机.png',import.meta.url),Buffer.from(shot.data,'base64'));
await command('Runtime.evaluate',{expression:'document.querySelector(".operation-comparison").open=true'});
const expanded=await command('Runtime.evaluate',{expression:'JSON.stringify({expanded:document.querySelector(".operation-comparison").open,tableRows:document.querySelectorAll(".operation-comparison tbody tr").length,pageWidth:document.documentElement.scrollWidth,tableViewport:document.querySelector(".fund-table-wrap").clientWidth})',returnByValue:true});
const check={...data,expanded_comparison:JSON.parse(expanded.result.value),checked_at:new Date().toISOString()};
await writeFile(new URL('../evidence/手机视口与展开核查.json',import.meta.url),JSON.stringify(check,null,2));
console.log(JSON.stringify(check));
await command('Browser.close');ws.close();
