// Static assets + SSR, adapted from AIHOT apps/web/server.ts; original MIT notice retained.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat,readFile,mkdir,mkdtemp,cp,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequestListener } from '@react-router/node';
const pointer=process.env.JINGWEI_WEB_BUILD_DIR?null:JSON.parse(await readFile(path.join(import.meta.dirname,'.builds/current.json'),'utf8'));
const selected=path.resolve(import.meta.dirname,process.env.JINGWEI_WEB_BUILD_DIR??pointer.build_dir);
// Each process keeps its own SSR and assets together, even if another build runs.
const runtimeRoot=path.resolve(import.meta.dirname,'../../.local/web-runtimes');await mkdir(runtimeRoot,{recursive:true});
const buildDir=await mkdtemp(path.join(runtimeRoot,'instance-'));await cp(selected,buildDir,{recursive:true});
const client=path.resolve(buildDir,'client');
const build=await import(pathToFileURL(path.resolve(buildDir,'server/index.js')).href);
const ssr=createRequestListener({build,mode:'production'});
const types:Record<string,string>={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{
 try { const pathname=decodeURIComponent(new URL(req.url??'/','http://127.0.0.1').pathname);const file=path.resolve(client,'.'+pathname);const info=file.startsWith(client+path.sep)?await stat(file).catch(()=>null):null;
 if(info?.isFile()){res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');createReadStream(file).pipe(res);return;}
 if(pathname.startsWith('/assets/')){res.writeHead(404,{'Content-Type':'text/plain'});res.end('Asset not found');return;}
 ssr(req,res);
 }catch{res.writeHead(500,{'Content-Type':'text/plain;charset=utf-8'});res.end('文章暂时无法载入');}
});
const port=Number(process.env.JINGWEI_WEB_PORT??4410);
server.listen(port,'127.0.0.1',async()=>{await writeFile(path.join(buildDir,'runtime.json'),JSON.stringify({pid:process.pid,port,build_dir:buildDir,source_build:selected},null,2));console.log(`经纬 http://127.0.0.1:${port}\n静态与SSR快照 ${buildDir}`);});
process.on('SIGTERM',()=>{server.close();server.closeAllConnections();});
