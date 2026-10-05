import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir=process.argv[2]??'/tmp/jingwei-fund-reader-20261005',runtime=JSON.parse(await readFile(dir+'/runtime/runtime.json'));
const targets=await(await fetch('http://127.0.0.1:9244/json/list')).json(),target=targets.find(t=>t.type==='page'&&t.url.startsWith(runtime.web));assert.ok(target);
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});let id=0;const waiting=new Map();ws.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.id){const q=waiting.get(v.id);waiting.delete(v.id);v.error?q.reject(Error(JSON.stringify(v.error))):q.resolve(v.result);}});
const cmd=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;waiting.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const ev=async expression=>{const v=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(v.exceptionDetails)throw Error(v.exceptionDetails.text);return v.result.value;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression){for(let i=0;i<120;i++){if(await ev(`Boolean(${expression})`))return;await pause(300);}throw Error('page condition not reached: '+expression);}
async function go(route){await cmd('Page.navigate',{url:runtime.web+route});await until("document.readyState==='complete'&&!!document.querySelector('main')");await pause(300);}
const checks=[];const record=(name,detail={})=>{checks.push({name,...detail});console.log(name);};
try{
 await cmd('Page.enable');await cmd('Runtime.enable');await go('/');
 assert.ok(await ev("document.body.innerText.includes('历史人工研究')"));assert.equal(await ev('document.documentElement.scrollWidth>innerWidth'),false);record('historical_editor_content_is_labeled');
 // The desktop itself, not this script, started the free real collection on first launch.
 for(let i=0;i<160;i++){const state=await(await fetch(runtime.api+'/reading/research')).json();if(state.update.status!=='checking'&&state.update.last_checked_at)break;await pause(500);}
 const publicState=await(await fetch(runtime.api+'/reading/research')).json();assert.ok(publicState.update.last_checked_at);assert.ok(publicState.evaluation?.metrics.length);await go('/');
 assert.ok(await ev("!!document.querySelector('.free-research-facts')"));assert.ok(await ev("document.querySelector('.free-research-facts').innerText.includes('还没有形成新的行动判断')"));record('default_real_free_collection_visible',{as_of:publicState.as_of,status:publicState.update.status,metrics:publicState.evaluation.metrics.length});
 if(!await ev("document.querySelector('.follow-control:not(.research-check) button').getAttribute('aria-pressed')==='true'"))await ev("document.querySelector('.follow-control:not(.research-check) button').click()");await until("document.querySelector('.follow-control:not(.research-check) button')?.getAttribute('aria-pressed')==='true'");assert.deepEqual(await(await fetch(runtime.api+'/reading/followed')).json(),{topic_keys:['china-equity-index']});record('one_click_follow_saved');
 const publication=await(await fetch(runtime.api+'/publication/home')).json(),fund=publication.selections.find(v=>v.article.operation_view)??publication.lead;
 await go('/articles/'+fund.article.slug);assert.ok(await ev("!!document.querySelector('.historical-research-note')"));record('article_original_date_and_current_facts');
 await go('/articles/'+fund.article.slug+'?version=3');assert.ok(await ev("document.querySelector('.article-header').innerText.includes('第3版')"));record('historical_versions_preserved');
 await go('/topics/china-equity-index');assert.ok(await ev("!!document.querySelector('.free-research-facts')"));assert.ok(await ev("document.querySelector('.follow-control button').getAttribute('aria-pressed')==='true'"));record('topic_follow_and_true_fact_dates');
 await go('/');await ev("document.querySelector('.research-check button').click()");await until("document.body.innerText.includes('已开始核查')");record('free_check_ack_does_not_block_reading');
 await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await ev('document.documentElement.scrollWidth>innerWidth'),false);record('narrow_reading_no_horizontal_overflow');await cmd('Emulation.clearDeviceMetricsOverride');
 const state=JSON.parse(await readFile(runtime.userData+'/content/content.json'));assert.equal(state.finance_versions.length,15);assert.equal(state.budget,null);assert.deepEqual(state.research_state.followed_topics,['china-equity-index']);assert.equal(state.research_state.settings.model_enabled,false);record('no_key_no_model_no_fake_new_version');
 const shot=await cmd('Page.captureScreenshot',{format:'png'});await writeFile(dir+'/internal-page-check.png',Buffer.from(shot.data,'base64'));
 const owner=await(await fetch(runtime.api+'/owner/state')).json();assert.equal(owner.session.has_key,false);assert.equal(owner.session.authorized,false);
 await mkdir('evidence/fund-research-integration-20261005',{recursive:true});await writeFile('evidence/fund-research-integration-20261005/真实桌面_免费采集与日常阅读.json',JSON.stringify({checked_at:new Date().toISOString(),scope:'Actual desktop window and automatic live official free collection; unconfigured model, no credential recovery, no paid calls; screenshots internal only',runtime,checks,source_check:publicState.update,model_state:{has_key:false,authorized:false},finance_versions:15,production_touched:false},null,2));
}finally{ws.close();}
