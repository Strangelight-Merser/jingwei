import { collectOnce } from '../../../packages/backend/jobs.ts';
import { initializeStorage, PRODUCTION_DATA_DIR } from '../../../packages/backend/storage.ts';
if(process.env.JINGWEI_ENABLE_MUTATIONS!=='true')throw new Error('collection_paused_read_only');
await initializeStorage({dataDir:process.env.JINGWEI_DATA_DIR??PRODUCTION_DATA_DIR});
if(process.argv.includes('--process-next')){
 // The API owns the in-memory key. A worker never reads another process/project's credentials.
 const response=await fetch('http://127.0.0.1:4411/owner/process-next',{method:'POST',headers:{'x-jingwei-owner':'local','Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error('local_api_unavailable');console.log(JSON.stringify(await response.json(),null,2));
}else if(process.argv.includes('--once')){
 const index=process.argv.indexOf('--source');const id=index>=0?process.argv[index+1]:undefined;
 const result=await collectOnce(id);console.log(JSON.stringify(result,null,2));
 if(result.sources.length===0||result.sources.every(s=>s.errors.length>0&&s.stored===0&&s.revised===0))process.exitCode=1;
}else if(process.env.COLLECT_ENABLED!=='true'){
 console.log('采集未启用。一次采集：npm run collect；可选定时采集仅在 worker 进程运行时执行。');
}else{
 let stopping=false,timer:ReturnType<typeof setTimeout>|null=null;
 const tick=async()=>{try{console.log(JSON.stringify(await collectOnce()));}catch{console.warn('本轮采集未完成，保留此前资料。');}finally{if(!stopping)timer=setTimeout(tick,3600000);}};
 const stop=()=>{stopping=true;if(timer)clearTimeout(timer);};process.on('SIGINT',stop);process.on('SIGTERM',stop);await tick();
}
