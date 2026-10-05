// Temporary free UI check. This fixture never calls collectors, models, or publication writers.
import './test-env.ts';
import Fastify from 'fastify';
import { pipelineSnapshot } from '../packages/backend/pipeline.ts';
import { createSessionUpdater } from '../apps/worker/src/session-update.ts';
const template=await pipelineSnapshot();
const counters={collection:0,composition:0,publication:0};
const automatic=createSessionUpdater({
 collect:async id=>{counters.collection++;return {sources:[{source:id,discovered:0,stored:0,revised:0,errors:[]}]};},
 process:async()=>{counters.composition++;return {processed:true,updated:true,id:'isolated-ui-fixture'};},
 publish:async()=>{counters.publication++;},ready:async()=>null
});
const api=Fastify({logger:false});
api.get('/owner/state',async()=>({...template,session:{...template.session,has_key:true,authorized:true},automatic:automatic.snapshot()}));
api.post('/owner/automatic',async(req,reply)=>{try{return await automatic.configure(req.body);}catch{return reply.code(400).send({error:'fixture_configuration_invalid'});}});
api.get('/fixture/counters',async()=>counters);
await api.listen({host:'127.0.0.1',port:4511});
async function stop(){automatic.stop();await api.close();}
process.once('SIGINT',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});
console.log('免费设置页验证 API http://127.0.0.1:4511，不处理真实内容或调用模型');
