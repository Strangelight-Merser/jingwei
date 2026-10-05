import {writeFile} from 'node:fs/promises';
const endpoint='http://127.0.0.1:9232';
const targets=await(await fetch(endpoint+'/json')).json();
const target=targets.find((t:{type:string})=>t.type==='page');
if(!target)throw new Error('isolated_browser_missing');
async function connect(url:string){
 const ws=new WebSocket(url);await new Promise<void>(r=>ws.addEventListener('open',()=>r(),{once:true}));
 let seq=0;const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
 ws.addEventListener('message',e=>{const d=JSON.parse(String(e.data)),p=pending.get(d.id);if(p){pending.delete(d.id);d.error?p.reject(new Error(d.error.message)):p.resolve(d.result);}});
 const command=(method:string,params:object={})=>new Promise<any>((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 async function evaluate(expression:string){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('page_expression_failed:'+expression.slice(0,90));return r.result.value;}
 async function navigate(path:string){await command('Page.navigate',{url:'http://127.0.0.1:4410'+path});for(let i=0;i<40;i++){if(await evaluate('document.readyState==="complete"&&location.pathname+location.search==='+JSON.stringify(path)))break;await new Promise(r=>setTimeout(r,100));}await evaluate('document.fonts.ready.then(()=>true)');await new Promise(r=>setTimeout(r,180));}
 return {ws,command,evaluate,navigate};
}
const page=await connect(target.webSocketDebuggerUrl);await page.command('Page.enable');
const checks:any[]=[];
const record=async(name:string,expression:string)=>{const result=await page.evaluate(expression);checks.push({check:name,result});if(name.endsWith("_anchor")&&(!result.open||result.targetTop<0||result.targetTop>60))throw new Error("anchor_target_not_in_view:"+name);return result;};
const shot=async(name:string)=>{const r=await page.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL('../evidence/'+name,import.meta.url),Buffer.from(r.data,'base64'));};
for(const width of [1440,390,320]){
 await page.command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:width<760});await page.navigate('/');
 await record('home_'+width,'({width:innerWidth,scroll:document.documentElement.scrollWidth,actions:[...document.querySelectorAll(".operation-actions h2")].map(e=>e.textContent),review:document.querySelector(".operation-kicker time")?.textContent,market:document.querySelector(".market-figure figcaption span")?.textContent,keyFields:document.querySelectorAll("input[name=key]").length,backgroundGuide:[...document.querySelectorAll(".home-reading a")].some(a=>a.getAttribute("href")==="/articles/csi300-etf-and-share-classes"),actionTop:document.querySelector(".operation-actions").getBoundingClientRect().top})');
 if(width!==320)await shot('打磨第二批_首页_'+(width===1440?'桌面':'手机')+'.png');
}
await page.command('Emulation.setDeviceMetricsOverride',{width:390,height:1050,deviceScaleFactor:1,mobile:true});await page.navigate('/');
await page.evaluate('[...document.querySelectorAll(".operation-next a")][0].click()');await new Promise(r=>setTimeout(r,1000));
await record('home_condition_anchor','({open:document.querySelector(".operation-review").open,hash:location.hash,targetTop:document.querySelector("#judgment-change-conditions").getBoundingClientRect().top,focus:document.activeElement?.id,fullNextWatch:document.querySelector(".operation-review").innerText.includes("接下来，看沪深300同样本盈利")})');
await page.evaluate('document.querySelector(".operation-action-link").click()');await new Promise(r=>setTimeout(r,1000));
await record('home_fund_anchor','({open:document.querySelector("#fund-comparison").open,hash:location.hash,targetTop:document.querySelector("#fund-comparison").getBoundingClientRect().top,focus:document.activeElement?.id})');
await page.evaluate('history.back()');await new Promise(r=>setTimeout(r,1000));await record('anchor_browser_back','({hash:location.hash,targetTop:document.querySelector("#judgment-change-conditions").getBoundingClientRect().top})');
await page.evaluate('document.querySelector(".home-reading").scrollIntoView({block:"start",behavior:"instant"})');await new Promise(r=>setTimeout(r,100));await shot('打磨第二批_首页背景入口_手机.png');
await page.command('Emulation.setDeviceMetricsOverride',{width:390,height:1050,deviceScaleFactor:1,mobile:true});await page.navigate('/articles/csi300-hold-and-fund-choice');
await record('article_dates_and_revision','({meta:document.querySelector(".article-meta")?.innerText,revisionFolded:document.querySelector(".revision-notes")?.open===false,revision:document.querySelector(".revision-notes summary")?.innerText,marketCheck:document.querySelector(".market-check-note")?.innerText})');await shot('打磨第二批_文章_手机.png');
await page.evaluate('document.querySelector("#fund-comparison").scrollIntoView({block:"start",behavior:"instant"})');
const stance=await page.evaluate('document.querySelector(".operation-actions").innerText');
const toggleScroll=await page.evaluate('scrollY');
for(const selected of [1,0,1]){await page.evaluate('document.querySelectorAll(".fund-selector button")['+selected+'].click()');await new Promise(r=>setTimeout(r,80));const same=await page.evaluate('document.querySelector(".operation-actions").innerText==='+JSON.stringify(stance));if(!same)throw new Error('fund_toggle_changed_market_stance');}
checks.push({check:'fund_toggle_preserves_market_stance',result:{unchanged:true,toggles:3,scrollBefore:toggleScroll,scrollAfter:await page.evaluate('scrollY')}});
await record('mobile_fund_table','(()=>{const t=document.querySelector(".fund-table-wrap");t.focus({preventScroll:true});t.scrollLeft=t.scrollWidth;window.scrollTo({top:document.querySelector("#fund-comparison").getBoundingClientRect().top+scrollY-20,behavior:"instant"});return {focus:document.activeElement===t,role:t.getAttribute("role"),label:t.getAttribute("aria-label"),client:t.clientWidth,scrollWidth:t.scrollWidth,scrollLeft:t.scrollLeft,hint:document.querySelector(".fund-scroll-hint").innerText,missingImpact:document.body.innerText.includes("无法据此比较跟踪稳定性"),selectedHeaders:[...document.querySelectorAll(".fund-table-wrap thead th")].filter(e=>getComputedStyle(e).display!=="none").map(e=>e.innerText),selectedButtons:[...document.querySelectorAll(".fund-selector button")].filter(e=>e.getAttribute("aria-pressed")==="true").map(e=>e.innerText),commonTerms:!!document.querySelector(".fund-common"),noAFeesInCTable:!document.querySelector(".fund-table-wrap").innerText.includes("A类普通申购费"),CSubscriptionVisible:document.querySelector(".fund-table-wrap").innerText.includes("C类申购费"),differenceSummary:document.querySelector(".fund-difference-summary")?.innerText}})()');await new Promise(r=>setTimeout(r,250));await page.evaluate('window.scrollTo({top:document.querySelector("#fund-comparison").getBoundingClientRect().top+scrollY-20,behavior:"instant"})');await new Promise(r=>setTimeout(r,100));await record('table_visible_capture','({scrollY,top:document.querySelector("#fund-comparison").getBoundingClientRect().top})');await shot('打磨第二批_基金对照_手机.png');
await page.evaluate('document.querySelector("#fund-a-classes summary").click()');await new Promise(r=>setTimeout(r,100));await page.evaluate('document.querySelector("#fund-a-classes").scrollIntoView({block:"start",behavior:"instant"})');
await record('a_classes_separate_fold','({open:document.querySelector("#fund-a-classes").open,classes:[...document.querySelectorAll(".fund-a-terms h3")].map(e=>e.innerText),sourceDates:[...document.querySelectorAll(".fund-a-source")].map(e=>e.innerText),feesOutsideCTable:![...document.querySelectorAll(".fund-table-wrap tbody th")].some(e=>e.innerText.includes("A类")),condition:document.querySelector("#fund-a-classes").innerText.includes("不是推荐持有期限")})');await shot('打磨第二批_A类费用_手机.png');
await page.command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await page.navigate('/articles/csi300-hold-and-fund-choice');
await page.evaluate('window.scrollTo({top:document.querySelector("#fund-comparison").getBoundingClientRect().top+scrollY-20,behavior:"instant"})');await new Promise(r=>setTimeout(r,200));
await record('desktop_fund_columns','({visibleHeaders:[...document.querySelectorAll(".fund-table-wrap thead th")].filter(e=>getComputedStyle(e).display!=="none").map(e=>e.innerText),overflow:document.documentElement.scrollWidth>innerWidth})');await shot('打磨第二批_基金对照_桌面.png');
await page.command('Emulation.setDeviceMetricsOverride',{width:390,height:1050,deviceScaleFactor:1,mobile:true});await page.navigate('/articles/csi300-etf-and-share-classes');
await record('background_guide','({title:document.querySelector("h1")?.innerText,sections:document.querySelectorAll(".prose > section").length,overflow:document.documentElement.scrollWidth>innerWidth,sourceDates:document.querySelector(".article-meta")?.innerText,main:document.querySelector("main")?.innerText.includes("没有给出首次配置"),conceptLine:document.querySelector(".guide-concepts")?.innerText})');await shot('打磨第二批_背景文_手机.png');
await page.evaluate('document.querySelector(".source").open=true');await record('background_source_excerpt','({date:document.querySelector(".source small")?.innerText,excerpt:document.querySelector(".source[open]")?.innerText,sourceCount:document.querySelectorAll(".source").length})');
await page.navigate('/articles/csi300-hold-and-fund-choice?version=4');
await record('history_v4','({latestHint:document.body.innerText.includes("收藏后打开最新版本"),falseFeeCorrection:document.body.innerText.includes("这版费用比较未核清"),earlierLinks:[...document.querySelectorAll(".article-end details a")].map(a=>a.href),meta:document.querySelector(".article-meta")?.innerText})');
await page.evaluate('document.querySelector(".operation-action-link").click()');await new Promise(r=>setTimeout(r,200));await record('history_anchor_preserves_version','({search:location.search,hash:location.hash,oldNotice:document.querySelector(".update-note")?.innerText})');
await page.navigate('/saved');await page.evaluate('localStorage.setItem("jingwei.saved.articles","null");location.reload()');await new Promise(r=>setTimeout(r,350));
await record('malformed_saved_list','({error:document.body.innerText.includes("暂时无法读取收藏"),main:!!document.querySelector("main h1")})');
await page.evaluate('localStorage.setItem("jingwei.saved.articles","[]");location.reload()');await new Promise(r=>setTimeout(r,250));
await page.navigate('/articles/csi300-hold-and-fund-choice');await page.evaluate('document.querySelector(".save").click()');await new Promise(r=>setTimeout(r,80));
await page.navigate('/saved');await record('saved_article','({count:document.querySelectorAll(".saved-item").length,cancel:document.querySelector(".saved-item .save")?.innerText})');
const created=await page.command('Target.createTarget',{url:'http://127.0.0.1:4410/articles/csi300-hold-and-fund-choice'});
const otherTarget=(await(await fetch(endpoint+'/json')).json()).find((t:{id:string})=>t.id===created.targetId);
const other=await connect(otherTarget.webSocketDebuggerUrl);await other.command('Page.enable');await other.navigate('/articles/csi300-hold-and-fund-choice');await other.evaluate('document.querySelector(".save").click()');await new Promise(r=>setTimeout(r,150));
await record('cross_tab_removal','({count:document.querySelectorAll(".saved-item").length,empty:document.body.innerText.includes("暂无可阅读的收藏")})');
await other.evaluate('document.querySelector(".save").click()');await new Promise(r=>setTimeout(r,120));await page.evaluate('document.querySelector(".saved-item .save").click()');await new Promise(r=>setTimeout(r,120));
await record('saved_cancel_focus','({count:document.querySelectorAll(".saved-item").length,focus:document.activeElement?.tagName,notice:document.querySelector("[role=status]")?.innerText})');
await page.command('Target.closeTarget',{targetId:created.targetId});other.ws.close();
await page.navigate('/articles?q='+encodeURIComponent('份额 渠道'));
await record('body_multiword_search','({count:document.querySelectorAll(".article-row").length,input:document.querySelector("input[name=q]")?.value,status:document.querySelector(".results-count")?.innerText})');
for(const term of ['input_hash','implementation_unverified','cdn.efunds.com.cn']){await page.navigate('/articles?q='+encodeURIComponent(term));await record('search_excludes_'+term,'({count:document.querySelectorAll(".article-row").length})');}
await page.navigate('/topics/china-equity-index');await record('topic_scope_and_dates','({dates:document.querySelector(".topic-dates")?.innerText,text:document.querySelector(".current-progress")?.innerText,overflow:document.documentElement.scrollWidth>innerWidth,backgroundGuide:[...document.querySelectorAll("a")].some(a=>a.getAttribute("href")==="/articles/csi300-etf-and-share-classes")})');
for(const query of ['?version=','?version=%20','?version=0','?version=NaN']){const r=await fetch('http://127.0.0.1:4411/publication/articles/csi300-hold-and-fund-choice'+query);checks.push({check:'invalid_version_'+query,result:{status:r.status}});if(r.status!==404)throw new Error('invalid_version_returned_current');}
const report={checked_at:new Date().toISOString(),browser:'isolated existing Chrome; temporary profile',checks};
await writeFile(new URL('../evidence/打磨第二批_真实Chrome核查.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(process.env.JINGWEI_KEEP_CHECK_BROWSER!=='1')await page.command('Browser.close');page.ws.close();
